// Drives the lobby the way a visitor would and reports what holds: loading that never blocks, the topics
// carousel, routes, keyboard, settings, the still-image mode, the terminals of the 3D room, and what a phone
// downloads.
// Start the dev server first (npm run dev), then:  node scripts/check.mjs [--url http://127.0.0.1:5175/] [--only pc|tablet|phone]
// Exits with 1 if any check fails. Do not edit sources while it runs.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const { chromium } = require('@playwright/test')
const args = process.argv.slice(2)
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5175/'
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

let failed = 0
function check(name, ok, detail = '') { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`) }
const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try { browser = await chromium.launch({ args: launchArgs, ...(channel ? { channel } : {}) }); break } catch { continue }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')
const space = (page) => page.evaluate(() => document.documentElement.dataset.space)
const settled = (page) => page.waitForFunction(() => ['ready', 'sky', 'still', 'failed', 'none'].includes(document.documentElement.dataset.space) && 'ready' in document.documentElement.dataset, null, { timeout: 180000 })
const active = (page) => page.evaluate(() => document.activeElement?.id ?? '')
const hash = (page) => page.evaluate(() => location.hash)
const topicIndex = (page) => page.evaluate(() => [...document.querySelectorAll('.tp-slide')].findIndex((s) => s.classList.contains('is-on')))
const clearPrefs = (page) => page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })

// ------------------------------------------------------------------ PC
if (!only || only === 'pc') {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // loading never blocks: the UI is there and usable before the room is
  await page.goto(`${url}?t=12.5&scene=sky#/`, { waitUntil: 'commit' })
  await page.waitForSelector('.dock a')
  const early = await space(page)
  await page.click('#dock-games')
  await page.waitForSelector('#sheet.is-in .work-title')
  check('a work can be opened while the room is still loading', early !== 'ready' && await page.locator('.sheet-foot .btn.primary').isVisible(), `space was "${early}"`)
  await page.keyboard.press('Escape')
  await settled(page)
  await page.waitForTimeout(1200)
  check('the room loads', await space(page) === 'ready')
  check('the still is hidden once the room is drawn', await page.evaluate(() => getComputedStyle(document.getElementById('backdrop')).visibility === 'hidden' && getComputedStyle(document.getElementById('gl')).opacity === '1'))
  check('the loading note is gone', !(await page.locator('#spaceNote').isVisible()))

  // layout and wording
  check('the site name appears once', await page.getByText('Pirafu2411 Playground', { exact: true }).count() === 1)
  check('the lobby is labelled in Japanese', await page.locator('#topicsTitle').textContent() === '最新トピック' && await page.locator('#updatesTitle').textContent() === '更新情報'
    && (await page.locator('.dock a').allTextContents()).join() === 'ゲーム,ツール,ラボ,メディア,プロフィール,設定')
  const dock = await page.locator('.dock').boundingBox()
  check('the dock touches the bottom edge', Math.abs(dock.y + dock.height - 1080) < 0.5, `bottom ${dock.y + dock.height}`)
  check('no blur, glow or shadow on the UI', await page.evaluate(() => [...document.querySelectorAll('.ui *, .restore, .tag')].every((el) => {
    const s = getComputedStyle(el)
    return s.backdropFilter === 'none' && s.filter === 'none' && s.textShadow === 'none' && (s.boxShadow === 'none' || s.boxShadow.includes('inset'))
  })))
  check('one latest update, with a way to the history', await page.locator('.upd-latest').count() === 1 && await page.locator('.updates li').count() === 0 && await page.locator('.updates .more').getAttribute('href') === '#/updates')

  // 最新トピック
  const slides = await page.locator('.tp-slide').count()
  check('topics: every banner is one link holding one image', slides >= 2 && await page.evaluate(() => [...document.querySelectorAll('.tp-slide')].every((a) => a.tagName === 'A' && a.children.length === 1 && a.querySelector('img').alt.length > 0 && a.getAttribute('aria-label').includes('：'))))
  check('topics: the heading stands outside the banner', await page.evaluate(() => !document.querySelector('.tp-view').contains(document.getElementById('topicsTitle')) && !document.getElementById('topicsTitle').closest('.tp')))
  check('the headings and the carousel controls are plain marks on the room, with no slab drawn under them', await page.evaluate(() => ['#topicsTitle', '#updatesTitle', '.tp-bar'].every((s) => { const el = document.querySelector(s); return !el.querySelector(':scope > .frame') && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' })))
  check('topics: the banner stands in from the left edge, in line with its heading and its marks', await page.evaluate(() => {
    const left = (s) => document.querySelector(s).getBoundingClientRect().left
    const banner = left('.tp-view')
    return banner >= 24 && Math.abs(left('#topicsTitle') - banner) <= 1 && Math.abs(left('.tp-dots i') - banner) <= 1
      && Math.abs(document.querySelector('.tp-step:last-child .icon').getBoundingClientRect().right - document.querySelector('.tp-view').getBoundingClientRect().right) <= 2
  }))
  check('updates: the slab still reaches the right edge of the screen', await page.evaluate(() => document.querySelector('.upd-slab').getBoundingClientRect().right >= innerWidth - 1))
  check('topics: one mark per banner', await page.locator('.tp-dots button').count() === slides)
  check('topics: only the banner on show can be reached', await page.evaluate(() => [...document.querySelectorAll('.tp-slide')].filter((s) => !s.inert).length === 1))
  await page.mouse.move(960, 560)
  const first = await topicIndex(page)
  await page.waitForTimeout(9200)
  const turned = await topicIndex(page)
  check('topics: turns by itself', turned !== first, `${first} -> ${turned}`)
  await page.hover('.tp-view')
  await page.waitForTimeout(9200)
  check('topics: stays put under the pointer', await topicIndex(page) === turned)
  await page.mouse.move(960, 560)
  await page.click('#tpPause')
  await page.waitForTimeout(400)
  await page.mouse.move(960, 560)
  await page.waitForTimeout(9200)
  check('topics: stays put after pause', await topicIndex(page) === turned && (await page.locator('#tpPause').getAttribute('aria-label')).includes('再開'))
  await page.click('#tpPause')
  await page.focus('.tp-slide.is-on')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)
  check('topics: arrow keys turn it and focus follows', await topicIndex(page) === (turned + 1) % slides && await page.evaluate(() => document.activeElement.classList.contains('is-on')))
  await page.waitForTimeout(9200)
  check('topics: stays put while it has keyboard focus', await topicIndex(page) === (turned + 1) % slides)
  await page.click('.tp-dots li:nth-child(1) button')
  await page.waitForTimeout(700)
  check('topics: a mark jumps to its banner', await topicIndex(page) === 0 && await page.locator('.tp-dots li:nth-child(1) button').getAttribute('aria-current') === 'true')
  const target = await page.locator('.tp-slide.is-on').getAttribute('href')
  await page.click('.tp-slide.is-on')
  await page.waitForTimeout(500)
  check('topics: the whole banner leads to its topic', await hash(page) === target, target)
  await page.keyboard.press('Escape')

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

  // choosing areas faster than the camera travels
  for (const key of ['games', 'tools', 'lab', 'media', 'tools']) { await page.click(`#dock-${key}`); await page.waitForTimeout(120) }
  await page.waitForTimeout(1600)
  check('quick changes of area end on the last one', await hash(page) === '#/tools' && await page.locator('#sheetTitle').textContent() === 'ツール' && await page.locator('.work-title').isVisible())
  await page.click('.work-list a:not([aria-current])')
  await page.waitForTimeout(500)
  const shown = await page.locator('.work').getAttribute('data-work')
  check('the terminal shows the work that is open', await page.evaluate((id) => window.__lobby.debug.room.terms.tool.shown.includes(id), shown), shown)
  await page.keyboard.press('Escape')

  // a work can be reached by its address alone
  await page.goto(`${url}?t=12.5&scene=sky#/tools/poseref`)
  await settled(page)
  check('a work opens from its URL', await page.locator('.work-title').textContent() === 'PoseRef')
  const launch = page.locator('.sheet-foot .btn.primary')
  check('the main action opens the real work in a new tab', await launch.getAttribute('href') === 'https://pirafu-poseref.pages.dev' && await launch.getAttribute('target') === '_blank' && (await launch.getAttribute('rel')).includes('noopener'))
  check('the main action stands out from the side one', await page.evaluate(() => {
    const [main, side] = [document.querySelector('.sheet-foot .btn.primary'), document.querySelector('.sheet-foot .btn.quiet')]
    return main.getBoundingClientRect().width > side.getBoundingClientRect().width * 1.5 && Number(getComputedStyle(main).fontWeight) > Number(getComputedStyle(side).fontWeight)
  }))
  check('with the room on, the sheet leaves the key visual to the terminal', !(await page.locator('.work-visual').isVisible()))
  await page.goto(`${url}?t=12.5#/lab`)
  await settled(page)
  check('Lab says it is empty instead of borrowing works', await page.locator('.empty').count() === 1)
  await page.goto(`${url}?t=12.5#/updates`)
  await settled(page)
  check('the history has every update', await page.locator('.upd-list li').count() >= 10 && await page.locator('#sheetTitle').textContent() === '更新履歴')

  // settings
  await page.goto(`${url}#/settings`)
  await settled(page)
  await page.locator('input[name="scene"][value="cloud"]').check({ force: true })
  await page.waitForTimeout(1900)
  check('the scene setting changes the window view', (await page.locator('#barSky').textContent()).includes('雲') && await page.evaluate(() => window.__lobby.debug.S.scene) === 1)
  await page.locator('input[name="time"][value="night"]').check({ force: true })
  await page.waitForTimeout(800)
  check('the time setting changes the phase', await page.evaluate(() => document.documentElement.dataset.phase) === 'night')
  await page.locator('input[name="opaque"][value="on"]').check({ force: true })
  check('the UI can be made opaque', await page.evaluate(() => 'opaque' in document.documentElement.dataset))
  await page.locator('input[name="quality"][value="low"]').check({ force: true })
  await page.waitForTimeout(600)
  check('quality: a chosen level is used as it is', await page.evaluate(() => window.__lobby.stage.level) === 'low' && await page.evaluate(() => !window.__lobby.debug.S.auto))
  await page.locator('input[name="quality"][value="still"]').check({ force: true })
  await page.waitForTimeout(1300)
  check('quality: the still-image mode stops the 3D and shows the still', await space(page) === 'still' && await page.evaluate(() => getComputedStyle(document.getElementById('gl')).opacity === '0' && document.getElementById('still').naturalWidth > 0 && !document.getElementById('backdrop').hidden))
  const drawn = await page.evaluate(async () => { const before = window.__lobby.debug.renderer.info.render.frame; await new Promise((r) => setTimeout(r, 600)); return window.__lobby.debug.renderer.info.render.frame - before })
  check('quality: nothing is drawn in the still-image mode', drawn === 0, `${drawn} frames`)
  await page.click('#dock-tools')
  await page.waitForTimeout(500)
  check('quality: works stay within reach in the still-image mode', await page.locator('.sheet-foot .btn.primary').isVisible() && await page.locator('.work-visual').isVisible())
  await page.click('#dock-settings')
  await page.locator('input[name="quality"][value="auto"]').check({ force: true })
  await page.waitForTimeout(1500)
  check('quality: back to 3D without loading it again', await space(page) === 'ready')
  await page.locator('input[name="motion"][value="reduce"]').check({ force: true })
  check('motion can be reduced', await page.evaluate(() => document.documentElement.dataset.motion) === 'reduce')
  await page.locator('input[name="view"][value="sky"]').check({ force: true })
  await page.waitForTimeout(900)
  check('the display mode can drop to the sky alone', await space(page) === 'sky')
  check('settings are remembered', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('pirafu-lobby-prefs')); return p.scene === 'cloud' && p.motion === 'reduce' && p.view === 'sky' }))
  await page.goto(`${url}#/`)
  await settled(page)
  const still = await topicIndex(page)
  await page.mouse.move(960, 560)
  await page.waitForTimeout(9200)
  check('topics: no turning by itself with reduced motion', await topicIndex(page) === still && !(await page.locator('#tpPause').isVisible()))
  await clearPrefs(page)

  // hiding the UI
  await page.goto(`${url}?t=18.2&scene=cloud#/settings`)
  await settled(page)
  await page.click('#hideUi')
  await page.waitForTimeout(900)
  check('the UI hides and leaves one way back', await page.evaluate(() => document.getElementById('ui').inert) && await active(page) === 'restore')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape brings the UI back', await page.evaluate(() => !document.getElementById('ui').inert && document.getElementById('restore').hidden))

  // the terminals of the room lead to the same places as the dock
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await settled(page)
  await page.waitForTimeout(2000)
  await page.mouse.move(960, 400)
  await page.mouse.move(420, 690, { steps: 8 })
  await page.waitForTimeout(700)
  check('a terminal shows its label on hover', await page.locator('.tag.is-on').count() === 1)
  await page.mouse.click(420, 690)
  await page.waitForTimeout(400)
  check('clicking the terminal opens its area', await hash(page) === '#/games')
  await page.keyboard.press('Escape')

  // at rest the lobby draws less often
  await page.mouse.move(960, 560)
  await page.waitForTimeout(4500)
  const rest = await page.evaluate(() => window.__lobby.debug.drawnPerSecond)
  check('at rest the room is drawn about 30 times a second', rest >= 24 && rest <= 36, `${rest}/s`)

  // losing the graphics context is said, with a way to resume
  await page.evaluate(() => window.__lobby.debug.renderer.getContext().getExtension('WEBGL_lose_context').loseContext())
  await page.waitForTimeout(600)
  check('a lost graphics context is reported with a way to resume', await space(page) === 'lost' && await page.locator('#spaceAction').isVisible() && await page.evaluate(() => !document.getElementById('backdrop').hidden))
  check('no errors in the console', errors.filter((e) => !/context lost|CONTEXT_LOST/i.test(e)).length === 0, errors.join(' | '))
  await context.close()

  // without WebGL: the still, and everything still works
  const plain = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const noGl = await plain.newPage()
  await noGl.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : get.call(this, type, ...rest) } })
  await noGl.goto(`${url}?t=12.5&scene=sky#/games`)
  await settled(noGl)
  check('without WebGL: the still is shown and works can be opened', await space(noGl) === 'none' && await noGl.locator('.sheet-foot .btn.primary').isVisible() && await noGl.evaluate(() => document.getElementById('still').naturalWidth > 0))
  await plain.close()
}

// ------------------------------------------------------------------ tablet
if (!only || only === 'tablet') {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 }, hasTouch: true })
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await settled(page)
  await page.waitForTimeout(1500)
  check('tablet: the dock entries fit', !(await page.evaluate(() => [...document.querySelectorAll('.dock a')].some((a) => a.scrollWidth > a.clientWidth + 1))))
  check('tablet: nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.close()
}

// ------------------------------------------------------------------ phone
if (!only || only === 'phone') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${url}?t=12.5&scene=sky#/`)
  await settled(page)
  await page.waitForTimeout(1500)
  check('phone: the 3D room is not downloaded', !requests.some((u) => /space\.glb|ao_.*\.webp|room\.js/.test(u)))
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.dock a, .tp-slide.is-on, .tp-bar button, .more')].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('phone: every target is at least 30 px wide and 40 px tall', sizes.every(([w, h]) => w >= 30 && h >= 40), JSON.stringify(sizes))
  check('phone: nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const before = await topicIndex(page)
  const box = await page.locator('.tp-view').boundingBox()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  check('phone: a swipe turns the banner without opening it', await topicIndex(page) === (before + 1) % await page.locator('.tp-slide').count() && await hash(page) === '#/')
  await page.tap('#dock-tools')
  await page.waitForTimeout(700)
  const foot = await page.locator('.sheet-foot .btn.primary').boundingBox()
  check('phone: the main action is on screen without scrolling', foot && foot.y + foot.height <= 844 && foot.height >= 44, JSON.stringify(foot))
  await page.tap('#dock-settings')
  await page.waitForTimeout(700)
  await page.tap('#hideUi')
  await page.waitForTimeout(900)
  check('phone: the hidden UI can be brought back by touch', await page.locator('#restore').isVisible())
  await page.tap('#restore')
  check('phone: the UI is back', await page.evaluate(() => !document.getElementById('ui').inert))
  await clearPrefs(page)
  await context.close()

  // the still-image mode loads no 3D code at all
  const light = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const lightPage = await light.newPage()
  const lightRequests = []
  lightPage.on('request', (r) => lightRequests.push(r.url()))
  await lightPage.goto(`${url}?t=18.2&scene=water&quality=still#/`)
  await settled(lightPage)
  await lightPage.waitForTimeout(800)
  check('still-image mode: three.js and the 3D assets are not requested', !lightRequests.some((u) => /three|stage\.js|space\/|\.glb/.test(u)), lightRequests.filter((u) => /three|stage|glb/.test(u)).slice(0, 2).join(' '))
  check('still-image mode: the still is on screen', await lightPage.evaluate(() => document.getElementById('still').naturalWidth > 0 && document.getElementById('still').classList.contains('is-in')))
  await light.close()
}

await browser.close()
if (failed) { console.error(`${failed} check(s) failed`); process.exitCode = 1 } else console.log('all checks passed')
