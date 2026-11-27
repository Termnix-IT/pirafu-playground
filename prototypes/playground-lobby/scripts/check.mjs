// Drives the lobby the way a visitor would and reports what holds: routes, keyboard, settings, hiding the UI,
// the terminals of the 3D room, and what a phone downloads. With --video it also records a short walk through the screens.
// Start the dev server first (npm run dev), then:  node scripts/check.mjs [--url http://127.0.0.1:5175/] [--video]
// Exits with 1 if any check fails. Pictures and the video go to verification/.
import { createRequire } from 'node:module'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const { chromium } = require('@playwright/test')
const args = process.argv.slice(2)
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5175/'
const out = path.resolve(here, '..', 'verification')
await mkdir(out, { recursive: true })

let failed = 0
function check(name, ok, detail = '') { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`) }
const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try { browser = await chromium.launch({ args: launchArgs, ...(channel ? { channel } : {}) }); break } catch { continue }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')
const ready = (page) => page.waitForFunction(() => ['ready', 'sky', 'failed', 'none'].includes(document.documentElement.dataset.space) && 'ready' in document.documentElement.dataset, null, { timeout: 180000 })
const active = (page) => page.evaluate(() => document.activeElement?.id ?? '')
const hash = (page) => page.evaluate(() => location.hash)

// ------------------------------------------------------------------ PC
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await ready(page)
  await page.waitForTimeout(1500)

  check('the room loads', await page.evaluate(() => document.documentElement.dataset.space) === 'ready')
  check('the site name appears once', await page.getByText('Pirafu2411 Playground', { exact: true }).count() === 1)
  check('one featured work, with a way to open it and a way to read more', await page.locator('.feat-card a').count() === 2)
  check('four latest updates in one slab', await page.locator('.updates .upd-list li').count() === 4 && await page.locator('.upd-slab').count() === 1)
  check('six entries in one dock', await page.locator('.dock a').count() === 6 && await page.locator('.dock').count() === 1)
  const dock = await page.locator('.dock').boundingBox()
  check('the dock touches the bottom edge', Math.abs(dock.y + dock.height - 900) < 0.5, `bottom ${dock.y + dock.height}`)
  check('no blur, glow or shadow on the UI', await page.evaluate(() => [...document.querySelectorAll('.ui *, .restore, .tag')].every((el) => {
    const s = getComputedStyle(el)
    return s.backdropFilter === 'none' && s.filter === 'none' && s.textShadow === 'none' && (s.boxShadow === 'none' || s.boxShadow.includes('inset'))
  })))

  // keyboard: open an area from the dock, come back with Escape
  await page.focus('#dock-games')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('Enter on the dock opens the area', await hash(page) === '#/games' && await page.locator('#sheet').isVisible())
  check('focus moves to the sheet heading', await active(page) === 'sheetTitle')
  check('the lobby cards are inert behind a sheet', await page.evaluate(() => document.getElementById('lobby').inert))
  check('the dock marks the current area', await page.locator('#dock-games').getAttribute('aria-current') === 'page')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape returns to the lobby', await hash(page) === '#/' && !(await page.locator('#sheet').isVisible()))
  check('focus returns to the dock entry', await active(page) === 'dock-games')

  // a work can be reached by its address alone
  await page.goto(`${url}?t=12.5&scene=sky#/tools/poseref`)
  await ready(page)
  check('a work opens from its URL', await page.locator('.work-title').textContent() === 'PoseRef')
  const launch = page.locator('.work .btn.primary')
  check('the launch link opens the real work in a new tab', await launch.getAttribute('href') === 'https://pirafu-poseref.pages.dev' && await launch.getAttribute('target') === '_blank' && (await launch.getAttribute('rel')).includes('noopener'))
  check('Lab says it is empty instead of borrowing works', await (async () => { await page.goto(`${url}?t=12.5#/lab`); await ready(page); return page.locator('.empty').count() })() === 1)

  // settings
  await page.goto(`${url}#/settings`)
  await ready(page)
  await page.locator('input[name="scene"][value="cloud"]').check({ force: true })
  await page.waitForTimeout(1700)
  check('the scene setting changes the window view', (await page.locator('#barSky').textContent()).includes('雲') && await page.evaluate(() => window.__lobby.stage.debug.S.scene) === 1)
  await page.locator('input[name="time"][value="night"]').check({ force: true })
  await page.waitForTimeout(1200)
  check('the time setting changes the phase', await page.evaluate(() => document.documentElement.dataset.phase) === 'night')
  await page.locator('input[name="opaque"][value="on"]').check({ force: true })
  check('the UI can be made opaque', await page.evaluate(() => 'opaque' in document.documentElement.dataset))
  await page.locator('input[name="motion"][value="reduce"]').check({ force: true })
  check('motion can be reduced', await page.evaluate(() => document.documentElement.dataset.motion) === 'reduce')
  await page.locator('input[name="view"][value="sky"]').check({ force: true })
  await page.waitForTimeout(400)
  check('the view can drop to the sky alone', await page.evaluate(() => document.documentElement.dataset.space) === 'sky')
  check('settings are remembered', await page.evaluate(() => JSON.parse(localStorage.getItem('pirafu-lobby-prefs')).scene) === 'cloud')
  await page.evaluate(() => localStorage.removeItem('pirafu-lobby-prefs'))

  // hiding the UI
  await page.goto(`${url}?t=18.2&scene=cloud#/settings`)
  await ready(page)
  await page.click('#hideUi')
  await page.waitForTimeout(900)
  check('the UI hides and leaves one way back', await page.evaluate(() => document.getElementById('ui').inert) && await active(page) === 'restore')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape brings the UI back', await page.evaluate(() => !document.getElementById('ui').inert && document.getElementById('restore').hidden))

  // the terminals of the room lead to the same places as the dock
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await ready(page)
  await page.waitForTimeout(2500)
  await page.mouse.move(800, 300)
  await page.mouse.move(345, 575, { steps: 8 })
  await page.waitForTimeout(700)
  check('a terminal shows its label on hover', await page.locator('.tag.is-on').count() === 1)
  await page.screenshot({ path: path.join(out, 'pc-terminal-hover.jpg'), type: 'jpeg', quality: 90 })
  await page.mouse.click(345, 575)
  await page.waitForTimeout(400)
  check('clicking the terminal opens its area', await hash(page) === '#/games')

  check('no errors in the console', errors.length === 0, errors.join(' | '))
  await context.close()
}

// ------------------------------------------------------------------ tablet
{
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true })
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await ready(page)
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.dock a')].some((a) => a.scrollWidth > a.clientWidth + 1))
  check('tablet: the dock entries fit', !overflow)
  await page.screenshot({ path: path.join(out, 'tablet-lobby.jpg'), type: 'jpeg', quality: 90 })
  await page.close()
}

// ------------------------------------------------------------------ phone
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await ready(page)
  await page.waitForTimeout(1500)
  check('phone: the 3D room is not downloaded', !requests.some((u) => /playground\.glb|ao_.*\.webp|room\.js/.test(u)))
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.dock a, .feat-card a, .more')].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('phone: dock and card targets are at least 44px tall', sizes.slice(0, 8).every(([, h]) => h >= 44), JSON.stringify(sizes))
  check('phone: nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.tap('#dock-settings')
  await page.waitForTimeout(700)
  await page.tap('#hideUi')
  await page.waitForTimeout(900)
  check('phone: the hidden UI can be brought back by touch', await page.locator('#restore').isVisible())
  await page.screenshot({ path: path.join(out, 'phone-ui-hidden.jpg'), type: 'jpeg', quality: 90 })
  await page.tap('#restore')
  check('phone: the UI is back', await page.evaluate(() => !document.getElementById('ui').inert))
  await page.close()
}

// ------------------------------------------------------------------ a recorded walk through the screens (--video)
// Recording needs Playwright's ffmpeg ("npx playwright install ffmpeg" at the repository root), so it is opt-in.
if (args.includes('--video')) {
  const videoDir = path.join(out, 'video-tmp')
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } })
  const page = await context.newPage()
  await page.goto(`${url}?scene=sky#/`)
  await ready(page)
  await page.waitForTimeout(3000)
  for (const [target, wait] of [['#dock-games', 3200], ['#dock-tools', 3200], ['#dock-lab', 2600], ['#dock-profile', 2400], ['#dock-settings', 2000]]) { await page.click(target); await page.waitForTimeout(wait) }
  for (const [name, value] of [['scene', 'cloud'], ['time', 'evening'], ['scene', 'water'], ['time', 'night']]) { await page.locator(`input[name="${name}"][value="${value}"]`).check({ force: true }); await page.waitForTimeout(2600) }
  await page.click('#hideUi')
  await page.waitForTimeout(3000)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await page.evaluate(() => localStorage.removeItem('pirafu-lobby-prefs'))
  const video = page.video()
  await context.close()
  await rename(await video.path(), path.join(out, 'walkthrough.webm'))
  await rm(videoDir, { recursive: true, force: true })
  console.log('recorded verification/walkthrough.webm')
}

await browser.close()
if (failed) { console.error(`${failed} check(s) failed`); process.exitCode = 1 }
