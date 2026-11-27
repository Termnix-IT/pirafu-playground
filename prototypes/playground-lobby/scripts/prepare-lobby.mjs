// Writes everything the lobby shows, from the portal's own data:
//   public/assets/lobby.json           works, latest updates and counts
//   public/assets/media/<id>/...       the works' key visuals, as the portal publishes them
//   public/assets/playground.glb, ao_*.webp   the 3D space, copied from prototypes/playground-3d
// Works come through the portal's validateCatalog(), so hidden records never reach the lobby, and updates come
// from src/data/changelog.ts. Nothing here is written by hand: no invented versions, dates or works.
// usage: node scripts/prepare-lobby.mjs      (run from prototypes/playground-lobby)
import { createRequire } from 'node:module'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const assets = path.resolve(here, '..', 'public', 'assets')
const space = path.resolve(here, '..', '..', 'playground-3d', 'public', 'assets')
const require = createRequire(path.join(repoRoot, 'package.json'))
const sharp = require('sharp')
const { validateCatalog } = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'catalog.mjs')))
const { changelog, changelogText } = await import(pathToFileURL(path.join(repoRoot, 'src', 'data', 'changelog.ts')))

// Which lobby area shows each category of the data contract (contracts/v1: apps, games, tools, other).
// The contract has nothing that means "experiment" or "media" yet, so Lab and Media stay empty: a work is not
// moved to Lab just because it is still in development. Anything unmapped falls back to Tools so that every
// listed work stays reachable.
const AREA_OF = { games: 'games', tools: 'tools', apps: 'tools', other: 'tools' }
const STATUS = {
  planned: ['○', '構想中'], 'in-development': ['◐', '開発中'], stable: ['●', '安定版'], maintenance: ['●', '保守中'], archived: ['○', '開発終了'],
}

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

// The dominant vivid hue of the key visual. The 3D terminal that shows the work borrows it.
async function accentOf(bytes) {
  const { data } = await sharp(bytes).resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
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

const { catalog, media } = await validateCatalog(repoRoot)
await rm(path.join(assets, 'media'), { recursive: true, force: true })
await mkdir(assets, { recursive: true })

const listed = catalog.projects
  .filter((project) => project.visibility === 'public')
  .sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title, 'ja') || a.id.localeCompare(b.id, 'en'))
const categoryLabel = Object.fromEntries(catalog.categories.map(({ id, label }) => [id, label]))

const works = []
for (const project of listed) {
  let image = null
  let color = '#7fb4ff'
  if (project.thumbnail) {
    const relative = project.thumbnail.src.replace('/generated/', '')
    const bytes = media.get(relative)
    const target = path.join(assets, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
    image = { src: `assets/${relative}`, alt: project.thumbnail.alt, width: project.thumbnail.width, height: project.thumbnail.height }
    color = await accentOf(bytes)
  }
  const launchable = project.launch.type === 'external' && project.launchEnabled && Boolean(project.launch.url)
  const [mark, status] = STATUS[project.status] ?? ['', '']
  works.push({
    id: project.id,
    area: AREA_OF[project.category] ?? 'tools',
    title: project.title,
    description: project.description,
    category: categoryLabel[project.category] ?? project.category,
    status,
    statusMark: mark,
    tags: project.tags,
    featured: project.featured,
    launchUrl: launchable ? project.launch.url : null,
    launchLabel: project.category === 'games' ? 'あそぶ' : 'つかう',
    repository: project.links?.repository ?? null,
    image,
    color,
  })
}

const areaOf = Object.fromEntries(works.map(({ id, area }) => [id, area]))
const updates = changelog.map((entry) => ({
  date: entry.date,
  text: changelogText(entry, catalog.projects),
  kind: entry.kind === 'project' ? 'project' : 'site',
  ...(entry.kind === 'project' && areaOf[entry.projectId] ? { workId: entry.projectId, area: areaOf[entry.projectId] } : {}),
}))

const counts = catalog.categories
  .map(({ id, label }) => ({ label, count: listed.filter((project) => project.category === id).length }))
  .filter(({ count }) => count > 0)

await writeFile(path.join(assets, 'lobby.json'), `${JSON.stringify({ works, updates, counts }, null, 2)}\n`)
await copyFile(path.join(repoRoot, 'public', 'favicon.svg'), path.join(assets, 'favicon.svg'))
console.log(`lobby.json: ${works.length} works, ${updates.length} updates`)

// The 3D space is built in prototypes/playground-3d (see its 制作手順.md). Without it the lobby shows the sky only.
let copied = 0
for (const name of ['playground.glb', 'ao_room.webp', 'ao_terms.webp', 'ao_floor.webp']) {
  try {
    await copyFile(path.join(space, name), path.join(assets, name))
    copied += 1
  } catch {
    console.warn(`missing ${name}: build the 3D space in prototypes/playground-3d first`)
  }
}
console.log(`3D space: ${copied} of 4 files copied`)
