// Reads the portal's catalog records and writes what the prototype shows on the terminals:
//   public/assets/works.json, public/assets/thumbs/<terminal>.webp
// It also converts the baked AO atlases from PNG to WebP.
// usage: node scripts/prepare-works.mjs      (run from prototypes/playground-3d)
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const assets = path.resolve(here, '..', 'public', 'assets')
const require = createRequire(path.join(repoRoot, 'package.json'))
const sharp = require('sharp')

// Which catalog record each terminal shows. One work belongs to exactly one terminal.
const TERMINALS = { game: 'dopasweeper', tool: 'poseref', experiment: 'blue-archive-db' }
const KIND = { games: 'ゲーム', tools: 'ツール', apps: 'アプリ', other: 'その他' }
const STATUS = { stable: '● 公開中', maintenance: '● 公開中', 'in-development': '◐ 開発中', planned: '○ 計画中', archived: '○ 公開終了' }

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

// The accent is the dominant vivid hue of the thumbnail, so each terminal borrows its colour from the work.
async function accentOf(file) {
  const { data } = await sharp(file).resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  for (let i = 0; i < data.length; i += 3) {
    const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2])
    if (v < 0.55 || s < 0.3) continue
    const w = s * v * v
    const bin = bins[Math.floor(h / 20) % 18]
    bin.w += w; bin.r += data[i] * w; bin.g += data[i + 1] * w; bin.b += data[i + 2] * w
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a))
  if (best.w === 0) return '#7fb4ff'
  const hex = (n) => Math.round(n / best.w).toString(16).padStart(2, '0')
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`
}

await mkdir(path.join(assets, 'thumbs'), { recursive: true })
const works = {}
for (const [terminal, id] of Object.entries(TERMINALS)) {
  const record = JSON.parse(await readFile(path.join(repoRoot, 'catalog', 'projects', `${id}.json`), 'utf8'))
  const source = path.join(repoRoot, 'catalog', record.catalog.thumbnail.path)
  await sharp(source).resize(640, 480, { fit: 'cover', position: 'top' }).webp({ quality: 74 }).toFile(path.join(assets, 'thumbs', `${terminal}.webp`))
  works[terminal] = {
    label: terminal.toUpperCase(),
    id,
    title: record.project.title,
    kind: KIND[record.project.category] ?? 'その他',
    status: STATUS[record.project.status] ?? '',
    desc: record.project.description,
    url: record.launch.url,
    img: `assets/thumbs/${terminal}.webp`,
    alt: record.catalog.thumbnail.alt,
    color: await accentOf(source),
  }
  console.log(terminal, id, works[terminal].color)
}
works.media = { label: 'MEDIA', id: null, title: null, kind: '映像', status: '○ 準備中', desc: 'まだ何もありません。映像の作品ができたら、この端末が灯ります。', url: null, img: null, color: '#9fb4d6' }
await writeFile(path.join(assets, 'works.json'), JSON.stringify(works, null, 2) + '\n')

for (const name of ['ao_room', 'ao_terms', 'ao_floor']) {
  const png = path.join(assets, `${name}.png`)
  try {
    await access(png)
  } catch {
    continue
  }
  await sharp(png).greyscale().webp({ quality: 82 }).toFile(path.join(assets, `${name}.webp`))
  await rm(png)
  console.log('converted', `${name}.webp`)
}
