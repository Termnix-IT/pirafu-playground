// Captures the lobby for review and for the record: every time of day, every sheet, and the screen sizes the
// layout has to hold on.
// Start the dev server first (npm run dev), then:  node scripts/capture.mjs [--only name] [--url http://127.0.0.1:5175/]
// Images go to verification/. Uses the Chromium that the portal's e2e tests install. Do not edit sources while it runs.
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
const url = arg('--url', 'http://127.0.0.1:5175/')
const out = path.resolve(here, '..', 'verification')
await mkdir(out, { recursive: true })

const FHD = [1920, 1080]
// name, [width, height], query, route, optional steps to run before the picture
const SHOTS = [
  // the lobby at each time of day, one scene each
  ['pc-lobby-morning', FHD, 't=7.6&scene=cloud', ''],
  ['pc-lobby-noon', FHD, 't=12.5&scene=sky', ''],
  ['pc-lobby-evening', FHD, 't=18.2&scene=water', ''],
  ['pc-lobby-night', FHD, 't=22&scene=sky', ''],
  // sheets
  ['pc-games', FHD, 't=12.5&scene=sky', '#/games'],
  ['pc-tools-evening', FHD, 't=18.2&scene=sky', '#/tools/poseref'],
  ['pc-lab-night', FHD, 't=22&scene=cloud', '#/lab'],
  ['pc-profile', FHD, 't=12.5&scene=cloud', '#/profile'],
  ['pc-updates', FHD, 't=7.6&scene=sky', '#/updates'],
  ['pc-settings', FHD, 't=12.5&scene=sky', '#/settings'],
  ['pc-settings-night', FHD, 't=22&scene=water', '#/settings'],
  // states
  ['pc-ui-hidden', FHD, 't=18.2&scene=cloud&ui=hidden', ''],
  ['pc-still-mode', FHD, 't=18.2&scene=water&quality=still', ''],
  ['pc-still-mode-work', FHD, 't=12.5&scene=sky&quality=still', '#/games'],
  ['pc-quality-low', FHD, 't=12.5&scene=sky&quality=low', ''],
  ['pc-dock-hover', FHD, 't=12.5&scene=sky', '#/tools', async (page) => { await page.hover('#dock-lab'); await page.waitForTimeout(300) }],
  ['pc-terminal-hover', FHD, 't=12.5&scene=sky', '', async (page) => { await page.mouse.move(900, 400); await page.mouse.move(430, 700, { steps: 8 }); await page.waitForTimeout(700) }],
  // screen sizes
  ['size-1366x768', [1366, 768], 't=12.5&scene=sky', ''],
  ['size-1366x768-work', [1366, 768], 't=12.5&scene=sky', '#/tools/blue-archive-db'],
  ['size-2560x1440', [2560, 1440], 't=12.5&scene=sky', ''],
  ['size-3440x1440', [3440, 1440], 't=18.2&scene=cloud', ''],
  ['size-3440x1440-work', [3440, 1440], 't=12.5&scene=sky', '#/games'],
  ['size-768x1024', [768, 1024], 't=12.5&scene=sky', ''],
  ['size-768x1024-settings', [768, 1024], 't=12.5&scene=sky', '#/settings'],
  ['phone-390-noon', [390, 844], 't=12.5&scene=sky', ''],
  ['phone-390-evening', [390, 844], 't=18.2&scene=water', ''],
  ['phone-390-night', [390, 844], 't=22&scene=cloud', ''],
  ['phone-390-work', [390, 844], 't=12.5&scene=sky', '#/tools/poseref'],
  ['phone-390-settings', [390, 844], 't=18.2&scene=sky', '#/settings'],
  ['phone-390-still', [390, 844], 't=12.5&scene=sky&quality=still', ''],
  ['phone-360-noon', [360, 800], 't=12.5&scene=water', ''],
  ['phone-360-work', [360, 800], 't=22&scene=sky', '#/games'],
].filter((s) => !only || s[0].includes(only))

// Prefer the Chromium installed for the e2e tests; fall back to a browser already on this machine.
const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ args: launchArgs, ...(channel ? { channel } : {}) })
    break
  } catch {
    continue
  }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')

for (const [name, [width, height], query, route, steps] of SHOTS) {
  const phone = width <= 700
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${url}?${query}${route || '#/'}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => ['ready', 'sky', 'still', 'failed', 'none'].includes(document.documentElement.dataset.space), null, { timeout: 180000 })
  await page.waitForTimeout(route ? 2600 : 2200)
  if (steps) await steps(page)
  await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 90 })
  console.log(name, await page.evaluate(() => document.documentElement.dataset.space), errors.length ? 'ERRORS ' + errors.join(' | ') : '')
  await page.close()
}
await browser.close()
