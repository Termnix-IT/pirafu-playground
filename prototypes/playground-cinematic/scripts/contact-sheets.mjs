// Builds labelled comparison sheets from the renders, for review:
//   renders/sheet_times.jpg      morning / noon / evening / night
//   renders/sheet_scenery.jpg    sky / cloud / water
//   renders/sheet_terminals.jpg  the four terminals
//   renders/sheet_phase3_vs_4.jpg  third prototype (real time) beside this phase (Cycles)
// usage: node scripts/contact-sheets.mjs      (run from prototypes/playground-cinematic)
import { createRequire } from 'node:module'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const renders = path.resolve(here, '..', 'renders')
const require = createRequire(path.join(repoRoot, 'package.json'))
const sharp = require('sharp')

const CELL_W = 960, CELL_H = 540, LABEL_H = 54, GAP = 12

async function sheet(name, cells, columns) {
  const present = []
  for (const [file, label] of cells) {
    try {
      await access(file)
      present.push([file, label])
    } catch {
      console.log('skipped (missing):', path.basename(file))
    }
  }
  if (!present.length) return
  const rows = Math.ceil(present.length / columns)
  const width = columns * CELL_W + (columns + 1) * GAP
  const height = rows * (CELL_H + LABEL_H) + (rows + 1) * GAP
  const layers = []
  for (const [i, [file, label]] of present.entries()) {
    const x = GAP + (i % columns) * (CELL_W + GAP)
    const y = GAP + Math.floor(i / columns) * (CELL_H + LABEL_H + GAP)
    layers.push({ input: await sharp(file).resize(CELL_W, CELL_H, { fit: 'cover' }).toBuffer(), left: x, top: y })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${LABEL_H}"><text x="4" y="36" font-family="'Yu Gothic UI','Meiryo',sans-serif" font-size="26" fill="#1c2a3a">${label}</text></svg>`
    layers.push({ input: Buffer.from(svg), left: x, top: y + CELL_H })
  }
  await sharp({ create: { width, height, channels: 3, background: '#f3f1ed' } }).composite(layers).jpeg({ quality: 90 }).toFile(path.join(renders, name))
  console.log('wrote', name, `${width}x${height}`)
}

const r = (file) => path.join(renders, file)
await sheet('sheet_times.jpg', [
  [r('main_morning_sky.png'), '朝'], [r('main_noon_sky.png'), '昼'],
  [r('main_evening_sky.png'), '夕方'], [r('main_night_sky.png'), '夜'],
], 2)
await sheet('sheet_scenery.jpg', [
  [r('main_noon_sky.png'), '空'], [r('main_noon_cloud.png'), '雲'], [r('main_noon_water.png'), '水面'],
], 3)
await sheet('sheet_terminals.jpg', [
  [r('game_noon_sky.png'), 'GAME'], [r('tool_noon_sky.png'), 'TOOL'],
  [r('experiment_noon_sky.png'), 'EXPERIMENT'], [r('media_noon_sky.png'), 'MEDIA'],
], 2)
await sheet('sheet_phase3_vs_4.jpg', [
  [path.resolve(here, '..', '..', 'playground-3d', 'verification', 'pc-noon-sky.jpg'), '第3次（Three.js・リアルタイム）昼'],
  [r('main_noon_sky.png'), '第4次（Blender Cycles）昼'],
  [path.resolve(here, '..', '..', 'playground-3d', 'verification', 'pc-evening-sky.jpg'), '第3次 夕方'],
  [r('main_evening_sky.png'), '第4次 夕方'],
  [path.resolve(here, '..', '..', 'playground-3d', 'verification', 'pc-night-cloud.jpg'), '第3次 夜'],
  [r('main_night_sky.png'), '第4次 夜'],
], 2)
