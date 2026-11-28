// Lays the captured screens side by side so that they can be reviewed at a glance.
// Run after scripts/capture.mjs:  node scripts/contact-sheets.mjs
// Writes verification/sheet_*.jpg.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const sharp = require('sharp')
const dir = path.resolve(here, '..', 'verification')

async function sheet(name, files, columns, cellWidth, cellHeight) {
  const gap = 12
  const rows = Math.ceil(files.length / columns)
  const width = columns * cellWidth + (columns + 1) * gap
  const height = rows * cellHeight + (rows + 1) * gap
  const composite = []
  for (const [i, file] of files.entries()) {
    const input = await sharp(path.join(dir, file + '.jpg')).resize(cellWidth, cellHeight, { fit: 'contain', background: '#1c2433' }).toBuffer()
    composite.push({ input, left: gap + (i % columns) * (cellWidth + gap), top: gap + Math.floor(i / columns) * (cellHeight + gap) })
  }
  await sharp({ create: { width, height, channels: 3, background: '#1c2433' } }).composite(composite).jpeg({ quality: 88 }).toFile(path.join(dir, name + '.jpg'))
  console.log('wrote', name + '.jpg', `${width}x${height}`)
}

await sheet('sheet_pc_times', ['pc-lobby-morning', 'pc-lobby-noon', 'pc-lobby-evening', 'pc-lobby-night'], 2, 960, 540)
await sheet('sheet_pc_views', ['pc-games', 'pc-tools-evening', 'pc-lab-night', 'pc-profile', 'pc-updates', 'pc-settings-night'], 2, 960, 540)
await sheet('sheet_pc_states', ['pc-ui-hidden', 'pc-still-mode', 'pc-still-mode-work', 'pc-quality-low', 'pc-dock-hover', 'pc-terminal-hover'], 2, 960, 540)
await sheet('sheet_sizes', ['size-1366x768', 'size-1366x768-work', 'size-2560x1440', 'size-3440x1440', 'size-3440x1440-work', 'size-768x1024'], 2, 960, 540)
await sheet('sheet_phone', ['phone-390-noon', 'phone-390-evening', 'phone-390-night', 'phone-390-work', 'phone-390-settings', 'phone-390-still', 'phone-360-noon', 'phone-360-work'], 8, 300, 660)
