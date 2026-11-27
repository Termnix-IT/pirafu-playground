// Photographs the banner sources (topics/studio/index.html) and writes topics/banners/<topic id>.webp.
// A banner made in any other tool works just as well: put a 21:9 image in topics/banners/ and skip this script.
// Start the dev server first (npm run dev), then:  node scripts/render-banners.mjs [--only <topic id>]
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const { chromium } = require('@playwright/test')
const sharp = require('sharp')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5175/'
const out = path.resolve(here, '..', 'topics', 'banners')
await mkdir(out, { recursive: true })

let browser = null
for (const channel of [undefined, 'chrome', 'msedge']) {
  try { browser = await chromium.launch(channel ? { channel } : {}); break } catch { continue }
}
if (!browser) throw new Error('No Chromium-based browser found. Run "npm run browser:install" at the repository root.')
const page = await browser.newPage({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 3 })
await page.goto(url + 'topics/studio/index.html')
await page.waitForFunction(() => 'ready' in document.documentElement.dataset, null, { timeout: 30000 })
for (const banner of await page.locator('.banner').all()) {
  const id = await banner.getAttribute('id')
  if (only && id !== only) continue
  if (await banner.locator('img[data-missing]').count()) { console.warn(`skipped ${id}: an image it needs is missing (stills come from scripts/render-stills.mjs)`); continue }
  const png = await banner.screenshot({ type: 'png' })
  const info = await sharp(png).webp({ quality: 84 }).toFile(path.join(out, `${id}.webp`))
  console.log(`${id}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`)
}
await browser.close()
