// Measures how the lobby loads and how much it costs to draw, so that changes can be compared with numbers.
// Serve the production build first (npm run build && npm run preview), then:
//   node scripts/measure.mjs [--url http://127.0.0.1:5176/] [--runs 3] [--label name] [--only cold|warm|render]
// Writes verification/measure-<label>.json and prints a summary.
//
//   cold    a new browser profile for every run: nothing cached, every shader compiled from scratch (a first visit)
//   warm    one profile reused: HTTP cache and the browser's shader cache are filled (a return visit)
//   render  frame cost at rest and while the camera moves, with the browser's frame limit lifted
//
// Times are milliseconds from the start of navigation. What cannot be read is left null, never guessed.
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const { chromium } = require('@playwright/test')
const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const url = arg('--url', 'http://127.0.0.1:5176/')
const runs = Number(arg('--runs', '3'))
const label = arg('--label', 'run')
const only = arg('--only', null)
const [width, height] = arg('--size', '1920x1080').split('x').map(Number)
const query = arg('--query', 't=12.5&scene=sky')
const out = path.resolve(here, '..', 'verification')
await mkdir(out, { recursive: true })

const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
const UNLIMITED = ['--disable-frame-rate-limit', '--disable-gpu-vsync']
const channel = 'chrome'

// Runs in the page before anything else: records when each stage of the lobby is reached.
function recorder() {
  const m = { longTasks: [] }
  window.__m = m
  new PerformanceObserver((list) => { for (const e of list.getEntries()) m.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] })
  const mark = (key) => { if (m[key] === undefined) m[key] = Math.round(performance.now()) }
  const poll = () => {
    const root = document.documentElement
    if (!root) { setTimeout(poll, 4); return }   // the script runs before the document has an element
    if (document.querySelector('.dock a')) mark('ui')
    const still = document.querySelector('.backdrop img, #still')
    if (still && still.complete && still.naturalWidth > 0) mark('still')
    if (document.getElementById('gl')?.classList.contains('is-live') || root.dataset.sky === 'live') mark('sky')
    if (root.dataset.space === 'ready') mark('room')
    if (root.dataset.space === 'failed' || root.dataset.space === 'none') mark('failed')
    if (m.room === undefined && m.failed === undefined) setTimeout(poll, 16)
  }
  poll()
}

async function visit(context, wait = 240000) {
  const page = await context.newPage()
  await page.addInitScript(recorder)
  await page.goto(`${url}?${query}#/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__m.room !== undefined || window.__m.failed !== undefined, null, { timeout: wait })
  await page.waitForTimeout(1500)
  const result = await page.evaluate(() => {
    const m = window.__m
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]))
    const resources = performance.getEntriesByType('resource').map((e) => ({ name: e.name.split('/').pop().split('?')[0], type: e.initiatorType, bytes: e.encodedBodySize, end: Math.round(e.responseEnd) }))
    // the UI is usable once it is on screen and no long task that began before then is still running
    const blocking = m.longTasks.filter(([start]) => start <= (m.ui ?? 0) + 50)
    const interactive = Math.max(m.ui ?? 0, ...blocking.map(([start, duration]) => start + duration))
    return {
      firstPaint: paint['first-contentful-paint'] ?? null, ui: m.ui ?? null, interactive, still: m.still ?? null, sky: m.sky ?? null, room: m.room ?? null, failed: m.failed ?? null,
      longestTask: Math.max(0, ...m.longTasks.map(([, duration]) => duration)), blockedTotal: m.longTasks.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, resources,
    }
  })
  await page.close()
  return result
}

const withoutResources = (run) => Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'resources'))
const median = (values) => { const v = values.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null }
const spread = (values) => { const v = values.filter((x) => x !== null && x !== undefined); return v.length ? [Math.min(...v), Math.max(...v)] : null }
function summarise(list) {
  const keys = ['firstPaint', 'ui', 'interactive', 'still', 'sky', 'room', 'longestTask', 'blockedTotal', 'heapMB']
  return Object.fromEntries(keys.map((k) => [k, { median: median(list.map((r) => r[k])), range: spread(list.map((r) => r[k])) }]))
}
function transfer(resources) {
  const group = (r) => (/\.glb$/.test(r.name) ? 'space model' : /ao_.*\.webp$/.test(r.name) ? 'space textures' : /\.(js|mjs)$/.test(r.name) ? 'script' : /\.css$/.test(r.name) ? 'style' : /\.woff2?$/.test(r.name) ? 'font' : /\.(png|webp|jpg|avif|svg)$/.test(r.name) ? 'image' : 'other')
  const totals = {}
  for (const r of resources) { const g = group(r); totals[g] = (totals[g] ?? 0) + r.bytes }
  totals.total = resources.reduce((sum, r) => sum + r.bytes, 0)
  totals.requests = resources.length
  return totals
}

const report = { label, url, query, viewport: `${width}x${height}`, runs, at: new Date().toISOString() }

if (!only || only === 'cold') {
  const list = []
  for (let i = 0; i < runs; i++) {
    const browser = await chromium.launch({ channel, args: GPU })
    const context = await browser.newContext({ viewport: { width, height } })
    const r = await visit(context)
    list.push(r)
    console.log('cold', i + 1, JSON.stringify({ ui: r.ui, interactive: r.interactive, still: r.still, sky: r.sky, room: r.room, longestTask: r.longestTask }))
    await browser.close()
  }
  report.cold = { summary: summarise(list), transfer: transfer(list[0].resources), runs: list.map(withoutResources) }
}

if (!only || only === 'warm') {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'lobby-measure-'))
  const list = []
  for (let i = 0; i <= runs; i++) {
    // the browser is closed between runs so that its caches are written to disk and read back, as on a return visit
    const context = await chromium.launchPersistentContext(profile, { channel, args: GPU, viewport: { width, height } })
    const r = await visit(context)
    if (i > 0) { list.push(r); console.log('warm', i, JSON.stringify({ ui: r.ui, interactive: r.interactive, still: r.still, sky: r.sky, room: r.room, longestTask: r.longestTask })) }
    await context.close()
  }
  report.warm = { summary: summarise(list), transfer: transfer(list[0].resources), runs: list.map(withoutResources) }
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}

if (!only || only === 'render') {
  // What a frame costs: the lobby's own frame limit is lifted (?bench) and so is the browser's, so every
  // animation frame is a drawn frame and its length is the cost of drawing it.
  const browser = await chromium.launch({ channel, args: [...GPU, ...UNLIMITED] })
  const context = await browser.newContext({ viewport: { width, height } })
  const open = async (extra) => {
    const opened = await context.newPage()
    await opened.addInitScript(recorder)
    await opened.goto(`${url}?${query}&debug${extra}#/`, { waitUntil: 'domcontentloaded' })
    await opened.waitForFunction(() => window.__m.room !== undefined || window.__m.failed !== undefined, null, { timeout: 240000 })
    await opened.waitForTimeout(4000)
    return opened
  }
  const page = await open('&bench')
  const sample = (ms) => page.evaluate(async (ms) => {
    const times = []
    let prev = performance.now()
    const t0 = prev
    await new Promise((res) => { const f = (now) => { times.push(now - prev); prev = now; if (now - t0 < ms) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    times.sort((a, b) => a - b)
    const at = (p) => +times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2)
    return { frames: times.length, fps: +(times.length / (ms / 1000)).toFixed(1), p50: at(0.5), p95: at(0.95), p99: at(0.99), max: +times[times.length - 1].toFixed(1) }
  }, ms)
  const info = (of = page) => of.evaluate(() => {
    const d = window.__lobby?.debug ?? window.__lobby?.stage?.debug
    if (!d) return null
    const { render, memory, programs } = d.renderer.info
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? null, pixelRatio: +d.renderer.getPixelRatio().toFixed(2), drawnPerSecond: d.drawnPerSecond ?? null }
  })
  report.render = { rest: await sample(5000), info: await info() }
  await page.evaluate(() => { location.hash = '#/games' })
  report.render.moving = await sample(1200)
  await page.waitForTimeout(1500)
  report.render.terminal = { ...(await sample(3000)), info: await info() }
  report.render.heapMB = await page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null))
  await page.close()
  // How often the lobby really draws when left alone, with its own frame limit in place.
  const normal = await open('')
  await normal.waitForTimeout(3000)
  report.render.drawnAtRest = (await info(normal))?.drawnPerSecond ?? null
  console.log('render', JSON.stringify(report.render))
  await browser.close()
}

await writeFile(path.join(out, `measure-${label}.json`), JSON.stringify(report, null, 2) + '\n')
if (report.cold) console.log('cold summary', JSON.stringify(report.cold.summary), JSON.stringify(report.cold.transfer))
if (report.warm) console.log('warm summary', JSON.stringify(report.warm.summary))
