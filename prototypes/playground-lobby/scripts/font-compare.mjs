// Photographs the lobby in each candidate font under the same conditions and lays the results side by side.
// Temporary, like src/dev/font-lab.js: it goes when a face has been chosen.
//
// Start the dev server first (npm run dev), then:  node scripts/font-compare.mjs [--only z,m,a,b,c]
// Writes verification/fonts/*.jpg. Do not edit sources while it runs, and keep the lobby closed in other tabs.
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.resolve(root, '../../package.json'))
const { chromium } = require('playwright')
const sharp = require('sharp')

const args = process.argv.slice(2)
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const url = arg('--url', 'http://127.0.0.1:5175/')
const ALL = [['z', '従来  Sora + Zen Kaku Gothic New'], ['m', '現在  Sora + M PLUS 2'], ['a', 'A  Inter + Noto Sans JP'], ['b', 'B  Sora + LINE Seed JP'], ['c', 'C  IBM Plex Sans + IBM Plex Sans JP']]
const only = arg('--only', null)?.split(',')
const SETS = ALL.filter(([k]) => !only || only.includes(k))
const TIMES = [['朝', 't=7.6&scene=cloud'], ['昼', 't=12.5&scene=sky'], ['夕方', 't=18.2&scene=water'], ['夜', 't=22&scene=sky']]
const out = path.join(root, 'verification', 'fonts')
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] })
async function open(context, key, query, hash, wait = 'ready') {
  const page = await context.newPage()
  await page.goto(`${url}?${query}&lab=off&font=${key}${hash}`)
  await page.waitForFunction((k) => (document.documentElement.dataset.font ?? 'm') === k, key, { timeout: 60000 })
  await page.waitForFunction((w) => [w, 'still', 'sky'].includes(document.documentElement.dataset.space), wait, { timeout: 180000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1600)
  await page.evaluate(() => document.fonts.ready)
  return page
}
const label = (text, width, height = 30) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#10141c"/><text x="10" y="${height * 0.68}" font-family="Yu Gothic UI, Meiryo, sans-serif" font-size="${height * 0.52}" fill="#dfe7f2">${text}</text></svg>`)).png().toBuffer()
async function sheet(name, tiles, gap = 8) {
  // tiles: [{ input, left, top, width, height }]
  const width = Math.max(...tiles.map((t) => t.left + t.width)), height = Math.max(...tiles.map((t) => t.top + t.height))
  await sharp({ create: { width: width + gap, height: height + gap, channels: 3, background: '#10141c' } }).composite(tiles.map(({ input, left, top }) => ({ input, left, top }))).jpeg({ quality: 92 }).toFile(path.join(out, name))
  console.log('wrote', name, `${width + gap}x${height + gap}`)
}

// ---------------------------------------------------------------- PC: the two upper corners at four times of day
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const L = { x: 0, y: 38, width: 540, height: 300 }, R = { x: 1920 - 400, y: 38, width: 400, height: 100 }
  const cellW = L.width + 8 + R.width, cellH = L.height
  const tiles = []
  for (const [row, [key, name]] of SETS.entries()) {
    const top = row * (cellH + 38)
    tiles.push({ input: await label(name, TIMES.length * (cellW + 8)), left: 0, top, width: 10, height: 30 })
    for (const [col, [, q]] of TIMES.entries()) {
      const page = await open(context, key, q, '')
      const left = col * (cellW + 8)
      tiles.push({ input: await page.screenshot({ type: 'png', clip: L }), left, top: top + 30, width: L.width, height: L.height })
      tiles.push({ input: await page.screenshot({ type: 'png', clip: R }), left: left + L.width + 8, top: top + 30, width: R.width, height: R.height })
      if (col === 1) await page.screenshot({ path: path.join(out, `pc-lobby-${key}.jpg`), type: 'jpeg', quality: 90 })
      await page.close()
    }
  }
  await sheet('lobby-times.jpg', tiles)
  await context.close()
}

// ---------------------------------------------------------------- PC: sheets (work details and settings), cropped to the sheet
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  for (const [name, hash] of [['detail-game', '#/games/dopasweeper'], ['detail-tool', '#/tools/poseref'], ['settings', '#/settings']]) {
    const tiles = []
    for (const [col, [key, text]] of SETS.entries()) {
      const page = await open(context, key, 't=12.5&scene=sky', hash)
      await page.waitForTimeout(1200)
      const box = await page.locator('#sheet').boundingBox()
      const clip = { x: Math.floor(box.x) - 6, y: 38, width: Math.ceil(box.width) + 6, height: 1042 }
      tiles.push({ input: await label(text, clip.width), left: col * (clip.width + 8), top: 0, width: clip.width, height: 30 })
      tiles.push({ input: await page.screenshot({ type: 'png', clip }), left: col * (clip.width + 8), top: 30, width: clip.width, height: clip.height })
      await page.close()
    }
    await sheet(`${name}.jpg`, tiles)
  }
  await context.close()
}

// ---------------------------------------------------------------- PC at twice the density: title bar, corners and dock, to judge the letters themselves
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
  const CLIPS = [{ x: 0, y: 0, width: 470, height: 38 }, { x: 1920 - 330, y: 0, width: 330, height: 38 }, { x: 24, y: 60, width: 250, height: 40 }, { x: 1920 - 360, y: 60, width: 360, height: 66 }, { x: 530, y: 1024, width: 860, height: 56 }]
  const tiles = []
  let top = 0
  for (const [key, text] of SETS) {
    const page = await open(context, key, 't=12.5&scene=sky', '')
    tiles.push({ input: await label(text, 2600, 36), left: 0, top, width: 10, height: 36 })
    top += 36
    let left = 0, rowH = 0
    for (const [i, clip] of CLIPS.entries()) {
      if (i === 4) { left = 0; top += rowH + 8; rowH = 0 }
      tiles.push({ input: await page.screenshot({ type: 'png', clip }), left, top, width: clip.width * 2, height: clip.height * 2 })
      left += clip.width * 2 + 8; rowH = Math.max(rowH, clip.height * 2)
    }
    top += rowH + 16
    await page.close()
  }
  await sheet('letters-2x.jpg', tiles)
  await context.close()
}

// ---------------------------------------------------------------- phone
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  for (const [name, q, hash] of [['phone-lobby', 't=12.5&scene=sky', ''], ['phone-lobby-night', 't=22&scene=cloud', ''], ['phone-detail', 't=12.5&scene=sky', '#/tools/poseref'], ['phone-settings', 't=18.2&scene=sky', '#/settings']]) {
    const tiles = []
    for (const [col, [key, text]] of SETS.entries()) {
      const page = await open(context, key, q, hash, 'sky')
      await page.waitForTimeout(800)
      tiles.push({ input: await label(text.replace('  ', ' '), 780, 44), left: col * 788, top: 0, width: 780, height: 44 })
      tiles.push({ input: await page.screenshot({ type: 'png' }), left: col * 788, top: 44, width: 780, height: 1688 })
      await page.close()
    }
    await sheet(`${name}.jpg`, tiles)
  }
  await context.close()
}
await browser.close()
