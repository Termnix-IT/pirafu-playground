// Manages the lobby's topics from the command line. Topics are plain files (topics/<id>.json and a banner
// image), so everything here can also be done in an editor; this only saves typing and catches mistakes early.
//
//   node scripts/topics.mjs list                     every topic and whether it is on show now
//   node scripts/topics.mjs check                    validates every topic (exit code 1 on a problem)
//   node scripts/topics.mjs new <id> --kind <kind> --title <text> (--work <id> | --route <name> | --url <https://…>)
//                                      [--alt <text>] [--from <instant>] [--until <instant>] [--order <n>]
//   node scripts/topics.mjs end <id> [--at <instant>]   stops showing a topic from now (or from the instant given)
//   node scripts/topics.mjs disable <id> | enable <id>
//
// An instant is a date and time with its UTC offset, e.g. 2026-12-01T00:00:00+09:00.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { KIND_LABEL, loadTopics, stateAt, topicsDir } from './topics-lib.mjs'

const [command, id, ...rest] = process.argv.slice(2)
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined)
const fileOf = (topicId) => path.join(topicsDir, `${topicId}.json`)
const STATE = { on: '掲載中', scheduled: '掲載前', ended: '掲載終了', off: '無効' }

// The current instant with this machine's own offset, to the second.
function nowInstant() {
  const d = new Date(), pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}
async function edit(topicId, change) {
  const topic = JSON.parse(await readFile(fileOf(topicId), 'utf8'))
  change(topic)
  await writeFile(fileOf(topicId), JSON.stringify(topic, null, 2) + '\n')
}
function fail(message) { console.error(message); process.exit(1) }

if (command === 'list' || command === 'check') {
  const { topics, problems } = await loadTopics()
  if (command === 'list') {
    for (const t of topics) console.log(`${STATE[stateAt(t)].padEnd(5, '　')} ${String(t.order ?? 100).padStart(4)}  ${t.id.padEnd(28)} ${KIND_LABEL[t.kind].padEnd(7, '　')} ${t.title}${t.from ? `  from ${t.from}` : ''}${t.until ? `  until ${t.until}` : ''}`)
    if (!topics.length) console.log('(no topics)')
  }
  for (const problem of problems) console.error('problem:', problem)
  if (problems.length) process.exit(1)
  if (command === 'check') console.log(`${topics.length} topics are valid`)
} else if (command === 'new') {
  if (!id || !option('--kind') || !option('--title')) fail('usage: topics.mjs new <id> --kind <kind> --title <text> (--work <id> | --route <name> | --url <https://…>)')
  const link = option('--work') ? { work: option('--work') } : option('--route') ? { route: option('--route') } : option('--url') ? { url: option('--url') } : null
  if (!link) fail('give one of --work, --route or --url')
  const topic = {
    schemaVersion: 1, id, kind: option('--kind'), title: option('--title'),
    banner: { path: `banners/${id}.webp`, alt: option('--alt') ?? option('--title') },
    link,
    ...(option('--from') ? { from: option('--from') } : {}), ...(option('--until') ? { until: option('--until') } : {}),
    ...(option('--order') ? { order: Number(option('--order')) } : {}),
  }
  await writeFile(fileOf(id), JSON.stringify(topic, null, 2) + '\n', { flag: 'wx' }).catch(() => fail(`topics/${id}.json already exists`))
  console.log(`wrote topics/${id}.json. Put the banner at topics/${topic.banner.path} (21:9, 1260 px wide or more), then run: node scripts/topics.mjs check`)
} else if (command === 'end' && id) {
  const at = option('--at') ?? nowInstant()
  await edit(id, (t) => { t.until = at })
  console.log(`${id} is shown until ${at}`)
} else if ((command === 'disable' || command === 'enable') && id) {
  await edit(id, (t) => { if (command === 'disable') t.enabled = false; else delete t.enabled })
  console.log(`${id} is ${command}d`)
} else {
  fail('usage: topics.mjs list | check | new <id> … | end <id> [--at <instant>] | disable <id> | enable <id>')
}
