// Captures the lobby at each time of day, on a PC and on a phone, for review and for the record.
// Start the dev server first (npm run dev), then:  node scripts/capture.mjs [--only name] [--size 1600x900] [--url http://127.0.0.1:5175/]
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
const url = arg('--url', 'http://127.0.0.1:5175/')
const out = path.resolve(here, '..', 'verification')
await mkdir(out, { recursive: true })

const PC = { width, height }, PHONE = { width: 390, height: 844 }
// name, viewport, hour, scene, route, optional steps to run before the picture
const SHOTS = [
  ['pc-lobby-noon', PC, 12.5, 'sky', ''],
  ['pc-lobby-morning', PC, 7.6, 'cloud', ''],
  ['pc-lobby-evening', PC, 18.2, 'water', ''],
  ['pc-lobby-night', PC, 22, 'sky', ''],
  ['pc-games', PC, 12.5, 'sky', '#/games'],
  ['pc-tools-evening', PC, 18.2, 'sky', '#/tools/blue-archive-db'],
  ['pc-lab-night', PC, 22, 'cloud', '#/lab'],
  ['pc-profile', PC, 12.5, 'cloud', '#/profile'],
  ['pc-settings', PC, 12.5, 'sky', '#/settings'],
  ['pc-settings-night', PC, 22, 'water', '#/settings'],
  ['pc-ui-hidden', PC, 18.2, 'cloud', '', async (page) => { await page.goto(page.url().replace('#/', '') + '&ui=hidden') }],
  ['pc-small-1280', { width: 1280, height: 720 }, 12.5, 'sky', ''],
  ['phone-lobby-noon', PHONE, 12.5, 'sky', ''],
  ['phone-lobby-evening', PHONE, 18.2, 'water', ''],
  ['phone-lobby-night', PHONE, 22, 'cloud', ''],
  ['phone-games', PHONE, 12.5, 'sky', '#/games'],
  ['phone-settings', PHONE, 18.2, 'sky', '#/settings'],
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

for (const [name, viewport, hour, scene, route, steps] of SHOTS) {
  const phone = viewport.width <= 700
  const page = await browser.newPage({ viewport, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${url}?t=${hour}&scene=${scene}${route || '#/'}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  if (steps) await steps(page)
  await page.waitForFunction(() => ['ready', 'sky', 'failed', 'none'].includes(document.documentElement.dataset.space), null, { timeout: 180000 })
  await page.waitForTimeout(route ? 3400 : 2400)
  const fps = await page.evaluate(async () => {
    let n = 0
    const t0 = performance.now()
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 1200) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    return Math.round(n / ((performance.now() - t0) / 1000))
  })
  await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 90 })
  console.log(name, fps + 'fps', await page.evaluate(() => document.documentElement.dataset.space), errors.length ? 'ERRORS ' + errors.join(' | ') : '')
  await page.close()
}
await browser.close()
