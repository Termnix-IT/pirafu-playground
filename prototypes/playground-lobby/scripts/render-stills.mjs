// Photographs the room from the lobby's own camera, once for every time of day and scene, and writes
// public/assets/stills/<phase>-<scene>.webp (and a smaller <…>-s.webp for small screens).
// The lobby shows these while the 3D loads, when 3D is switched off or unavailable, and when it fails.
// They are taken wider than a screen shows, so that one picture lines up with the live view on any screen
// shape (src/view.js: STILL).
// Start the dev server first (npm run dev), then:  node scripts/render-stills.mjs [--only evening-water]
// Run it again whenever the room, its lighting or the camera changes, then run  npm run assets.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STILL } from '../src/view.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const { chromium } = require('@playwright/test')
const sharp = require('sharp')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5175/'
const out = path.resolve(here, '..', 'public', 'assets', 'stills')
await mkdir(out, { recursive: true })

const HEIGHT = 1200, WIDTH = Math.round(HEIGHT * STILL.aspect)
// the hours match the middle of each phase the lobby tells apart (main.js: phaseOf)
const PHASES = { morning: 7.6, day: 12.5, evening: 18.2, night: 22 }
const SCENES = ['sky', 'cloud', 'water']

const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try { browser = await chromium.launch({ args: launchArgs, ...(channel ? { channel } : {}) }); break } catch { continue }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(`${url}?shoot&t=12.5&scene=sky#/`)
await page.waitForFunction(() => document.documentElement.dataset.space === 'ready', null, { timeout: 180000 })
for (const [phase, hour] of Object.entries(PHASES)) {
  for (const scene of SCENES) {
    const name = `${phase}-${scene}`
    if (only && name !== only) continue
    await page.evaluate(([h, s]) => window.__shoot(h, s), [hour, scene])
    await page.waitForTimeout(900)   // the sky light on the room follows the sky a moment later
    await page.evaluate(([h, s]) => window.__shoot(h, s), [hour, scene])
    const png = await page.screenshot({ type: 'png' })
    const large = await sharp(png).webp({ quality: 80 }).toFile(path.join(out, `${name}.webp`))
    const small = await sharp(png).resize(Math.round(WIDTH / 2), HEIGHT / 2).webp({ quality: 78 }).toFile(path.join(out, `${name}-s.webp`))
    console.log(`${name}.webp ${large.width}x${large.height} ${(large.size / 1024).toFixed(0)} KB, small ${(small.size / 1024).toFixed(0)} KB`)
  }
}
await browser.close()
