// Reads and checks the lobby's topics (topics/<id>.json). Shared by prepare-lobby.mjs, which publishes them,
// and topics.mjs, which manages them from the command line.
import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const topicsDir = path.resolve(here, '..', 'topics')
const require = createRequire(path.join(here, '..', '..', '..', 'package.json'))
const Ajv = require('ajv/dist/2020')
const sharp = require('sharp')

export const KIND_LABEL = {
  game: 'ゲーム', tool: 'ツール', update: 'アップデート', 'in-development': '開発中', video: '映像', article: '記事', making: '制作', notice: 'お知らせ',
}
// Banners are drawn 21:9. A little slack lets an image a few pixels off through; anything else would be cropped on screen.
const RATIO = 21 / 9, RATIO_SLACK = 0.03, MIN_WIDTH = 1260

const schema = JSON.parse(await readFile(path.join(topicsDir, 'topic.schema.json'), 'utf8'))
const validate = new Ajv({ allErrors: true }).compile(schema)

/** The state of a topic at `now`: 'off' (disabled), 'scheduled', 'on' or 'ended'. Instants carry their own offset, so this is the same in every time zone. */
export function stateAt(topic, now = Date.now()) {
  if (topic.enabled === false) return 'off'
  if (topic.from && Date.parse(topic.from) > now) return 'scheduled'
  if (topic.until && Date.parse(topic.until) <= now) return 'ended'
  return 'on'
}

/**
 * Reads every topic and checks it against the schema, its banner file and the works it points at.
 * @param {Set<string> | null} listedWorks ids of the works the lobby lists; null skips that check
 * @returns {{ topics: object[], problems: string[] }} topics in display order, and every problem found
 */
export async function loadTopics(listedWorks = null) {
  const problems = []
  const topics = []
  const files = (await readdir(topicsDir)).filter((name) => name.endsWith('.json') && name !== 'topic.schema.json').sort()
  for (const file of files) {
    let topic
    try { topic = JSON.parse(await readFile(path.join(topicsDir, file), 'utf8')) } catch { problems.push(`${file}: not valid JSON`); continue }
    if (!validate(topic)) { problems.push(`${file}: ${validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`); continue }
    if (file !== `${topic.id}.json`) { problems.push(`${file}: the file name must be ${topic.id}.json`); continue }
    if (topic.from && topic.until && Date.parse(topic.from) >= Date.parse(topic.until)) { problems.push(`${file}: "until" must be later than "from"`); continue }
    if (topic.link.work && listedWorks && !listedWorks.has(topic.link.work)) { problems.push(`${file}: the work "${topic.link.work}" is not a listed work of the catalog`); continue }
    try {
      const meta = await sharp(path.join(topicsDir, topic.banner.path)).metadata()
      if (meta.pages > 1) { problems.push(`${file}: the banner must be a still image`); continue }
      if (meta.width < MIN_WIDTH) { problems.push(`${file}: the banner is ${meta.width} px wide; at least ${MIN_WIDTH} px is needed`); continue }
      if (Math.abs(meta.width / meta.height / RATIO - 1) > RATIO_SLACK) { problems.push(`${file}: the banner is ${meta.width}x${meta.height}; it must be 21:9 (for example 1260x540)`); continue }
    } catch { problems.push(`${file}: the banner ${topic.banner.path} is missing or cannot be read`); continue }
    topics.push(topic)
  }
  const seen = new Set()
  for (const t of topics) { if (seen.has(t.id)) problems.push(`duplicate id: ${t.id}`); seen.add(t.id) }
  topics.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || Date.parse(b.from ?? 0) - Date.parse(a.from ?? 0) || a.id.localeCompare(b.id, 'en'))
  return { topics, problems }
}
