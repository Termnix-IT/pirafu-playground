// Captures the prototype at each time of day and window view, for checking and for the record.
// Start the dev server first (npm run dev), then:  node scripts/capture.mjs [--only name] [--size 1600x900]
// Images go to verification/. Uses the Chromium that the portal's e2e tests install.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const require = createRequire(path.join(repoRoot, 'package.json'))
const { chromium } = require('@playwright/test')

const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const only = arg('--only', null)
const [width, height] = arg('--size', '1600x900').split('x').map(Number)
const url = arg('--url', 'http://127.0.0.1:5174/')
const out = path.resolve(here, '..', 'verification')
await mkdir(out, { recursive: true })

// name, hour, scene index (0 sky, 1 cloud, 2 water), optional action
const SHOTS = [
  ['pc-morning-sky', 7.6, 0], ['pc-noon-sky', 12.5, 0], ['pc-evening-sky', 18.2, 0], ['pc-night-sky', 22, 0],
  ['pc-noon-cloud', 12.5, 1], ['pc-evening-cloud', 18.2, 1], ['pc-night-cloud', 22, 1],
  ['pc-morning-water', 7.6, 2], ['pc-noon-water', 12.5, 2], ['pc-evening-water', 18.2, 2], ['pc-night-water', 22, 2],
  ['pc-terminal-game', 12.5, 0, 'game'], ['pc-terminal-tool', 18.2, 2, 'tool'], ['pc-terminal-experiment', 22, 1, 'experiment'],
  ['phone-noon-sky', 12.5, 0, 'phone'], ['phone-evening-water', 18.2, 2, 'phone'], ['phone-night-cloud', 22, 1, 'phone'], ['phone-app', 12.5, 0, 'phone-app'],
].filter((s) => !only || s[0].includes(only))

// Prefer the Chromium installed for the e2e tests; fall back to a browser already on this machine.
const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ args: launchArgs, ...(channel ? { channel } : {}) })
    console.log('browser', channel ?? 'playwright chromium')
    break
  } catch {
    continue
  }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')
const report = []
for (const [name, hour, sceneIndex, action] of SHOTS) {
  const phone = action === 'phone' || action === 'phone-app'
  const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width, height }, deviceScaleFactor: phone ? 2 : 1 })
  await page.goto(url + (action && !phone ? '#' + action : ''), { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__proto && (window.__proto.S.mode === 'phone' || window.__proto.room), null, { timeout: 60000 })
  await page.evaluate(([h, s]) => {
    const p = window.__proto
    p.S.qualityByUser = true
    p.applyScene(s)
    const r = document.getElementById('timeRange')
    r.value = h
    r.dispatchEvent(new Event('input'))
    document.getElementById('mock').open = false
  }, [hour, sceneIndex])
  if (action === 'phone-app') { await page.waitForTimeout(600); await page.click('#app-tool') }
  await page.waitForTimeout(action && !phone ? 3200 : 2200)
  const stats = await page.evaluate(async () => {
    let n = 0
    const t0 = performance.now()
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    const info = window.__proto.renderer.info.render
    const gl = window.__proto.renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { fps: Math.round(n / ((performance.now() - t0) / 1000)), calls: info.calls, triangles: info.triangles, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' }
  })
  await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 88 })
  report.push({ name, ...stats })
  console.log(name, stats.fps + 'fps', stats.calls + ' calls', stats.triangles + ' tris')
  await page.close()
}
console.log('GPU', report[0]?.gpu)
await browser.close()
