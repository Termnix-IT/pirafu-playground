// Entry point of the lobby prototype: the web UI, its routes and settings. The 3D side lives in stage.js.
//
// Routes are kept in the hash:  #/  (lobby)   #/games  #/tools  #/lab  #/media  (an area, with #/<area>/<work id>
// for one work)   #/profile   #/settings.  Every work can be opened from a link alone; the camera move is extra.
// For checking screens, the query accepts  ?t=<hour 0-24>  ?scene=sky|cloud|water  ?ui=hidden  and overrides the saved settings.
import '@fontsource/sora/300.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/500.css'
import './style.css'
import { frame, redrawFrames } from './frame.js'
import { icon, MARK } from './icons.js'

const $ = (id) => document.getElementById(id)
const root = document.documentElement
const BASE_URL = import.meta.env.BASE_URL
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pad = (n) => String(n).padStart(2, '0')

const DATA = await fetch(BASE_URL + 'assets/lobby.json').then((r) => r.json())
const WORKS = DATA.works

// The six entries of the dock. The first four are areas of works, each tied to one terminal of the 3D room.
const AREAS = [
  { key: 'games', en: 'Games', ja: 'ゲーム', term: 'game', empty: 'まだ何もありません。ゲームができたら、ここに並びます。' },
  { key: 'tools', en: 'Tools', ja: 'ツール・アプリ', term: 'tool', empty: 'まだ何もありません。ツールやアプリができたら、ここに並びます。' },
  { key: 'lab', en: 'Lab', ja: '実験・試作', term: 'experiment', empty: 'まだ何もありません。実験や試作ができたら、ここに並びます。' },
  { key: 'media', en: 'Media', ja: '映像・画像', term: 'media', empty: 'まだ何もありません。映像や画像の作品ができたら、ここに並びます。' },
  { key: 'profile', en: 'Profile', ja: 'プロフィール' },
  { key: 'settings', en: 'Settings', ja: '設定' },
]
const AREA = Object.fromEntries(AREAS.map((a) => [a.key, a]))
const TERMINALS = AREAS.filter((a) => a.term)
const worksIn = (key) => WORKS.filter((w) => w.area === key)
const hrefOf = (work) => `#/${work.area}/${work.id}`

const SCENES = [{ key: 'sky', label: '空' }, { key: 'cloud', label: '雲' }, { key: 'water', label: '水面' }]
const TIMES = [{ key: 'auto', label: 'いまの時刻' }, { key: 'morning', label: '朝', hour: 7.6 }, { key: 'noon', label: '昼', hour: 12.5 }, { key: 'evening', label: '夕方', hour: 18.2 }, { key: 'night', label: '夜', hour: 22 }]
const LINKS = [
  { label: 'いま公開しているPlayground', href: 'https://pirafu2411.pages.dev' },
  { label: 'GitHub（Termnix-IT）', href: 'https://github.com/Termnix-IT' },
]

// ------------------------------------------------------------------ settings
const STORE = 'pirafu-lobby-prefs'
const prefs = { scene: 'sky', time: 'auto', view: 'auto', opaque: false, motion: 'system', quality: 'auto' }
try { Object.assign(prefs, JSON.parse(localStorage.getItem(STORE) ?? '{}')) } catch { /* storage may be unavailable */ }
const query = new URLSearchParams(location.search)
const fixedHour = query.has('t') && Number.isFinite(+query.get('t')) ? +query.get('t') : null
if (SCENES.some((s) => s.key === query.get('scene'))) prefs.scene = query.get('scene')
function save() { try { localStorage.setItem(STORE, JSON.stringify(prefs)) } catch { /* ignore */ } }

const systemReduced = matchMedia('(prefers-reduced-motion: reduce)')
const reduced = () => prefs.motion === 'reduce' || systemReduced.matches
const narrow = matchMedia('(max-width: 700px)')
const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 }
const hour = () => fixedHour ?? TIMES.find((t) => t.key === prefs.time)?.hour ?? nowHour()
function phaseOf(h) {
  if (h < 5.2 || h >= 19.3) return { key: 'night', label: '夜' }
  if (h < 10) return { key: 'morning', label: '朝' }
  if (h < 16.5) return { key: 'day', label: '昼' }
  return { key: 'evening', label: '夕方' }
}
const wantsRoom = () => prefs.view === 'room' || (prefs.view === 'auto' && !narrow.matches)

// ------------------------------------------------------------------ title bar
$('mark').innerHTML = MARK
function tickBar() {
  const d = new Date()
  if (fixedHour !== null) d.setHours(Math.floor(fixedHour), Math.round(fixedHour % 1 * 60), 0)   // a checking URL shows the hour it draws
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  $('barDate').dateTime = iso
  $('barDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'.charAt(d.getDay())}）`
  $('barTime').dateTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  $('barTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const phase = phaseOf(hour())
  if (root.dataset.phase !== phase.key) root.dataset.phase = phase.key
  // There is no weather source in this project, so no weather is shown. This slot tells what the lobby itself
  // has outside its windows: the scene and the time of day being drawn.
  const scene = SCENES.find((s) => s.key === prefs.scene)
  const sky = `${icon(scene.key === 'sky' && phase.key === 'night' ? 'moon' : scene.key, 17)}<span class="sr">窓の外：</span><span>${scene.label}</span><span class="bar-phase">${phase.label}</span>`
  if ($('barSky').dataset.key !== scene.key + phase.key) { $('barSky').dataset.key = scene.key + phase.key; $('barSky').innerHTML = sky }
}

// ------------------------------------------------------------------ lobby: featured project and latest updates
const featured = WORKS.filter((w) => w.featured)
let featuredIndex = 0
function metaLine(work) { return `<span>${esc(work.category)}</span><span><span aria-hidden="true">${esc(work.statusMark)}</span> ${esc(work.status)}</span>` }
function launchLink(work, cls = 'btn primary') {
  if (!work.launchUrl) return '<span class="note">紹介だけの作品です。</span>'
  return `<a class="${cls}" href="${esc(work.launchUrl)}" target="_blank" rel="noopener">${esc(work.launchLabel)}${icon('out', 16)}<span class="sr">（新しいタブで開きます）</span></a>`
}
function renderFeatured() {
  const host = $('featured')
  if (!featured.length) { host.hidden = true; return }
  const work = featured[featuredIndex]
  const pager = featured.length > 1
    ? `<div class="feat-pager"><button type="button" id="featPrev" aria-label="前の注目作品">${icon('prev', 18)}</button><span aria-live="polite">${featuredIndex + 1} / ${featured.length}</span><button type="button" id="featNext" aria-label="次の注目作品">${icon('next', 18)}</button></div>`
    : ''
  host.innerHTML = `<h2 class="eyebrow" id="featuredTitle" data-frame="tabLeft" lang="en">Featured Project</h2>
    <article class="feat-card" data-frame="left">
      ${work.image ? `<img class="feat-visual" src="${esc(BASE_URL + work.image.src)}" alt="${esc(work.image.alt)}" width="${work.image.width}" height="${work.image.height}">` : ''}
      <div class="feat-body">
        <h3 class="feat-title">${esc(work.title)}</h3>
        <p class="meta">${metaLine(work)}</p>
        <div class="actions">${launchLink(work)}<a class="btn" href="${hrefOf(work)}">くわしく</a></div>
      </div>
    </article>${pager}`
  frames(host)
  if (featured.length > 1) {
    const step = (n) => { featuredIndex = (featuredIndex + n + featured.length) % featured.length; renderFeatured(); $(n > 0 ? 'featNext' : 'featPrev').focus() }
    $('featPrev').addEventListener('click', () => step(-1))
    $('featNext').addEventListener('click', () => step(1))
  }
}
function updateRow(u, long) {
  const date = long ? u.date.replaceAll('-', '.') : u.date.slice(5).replace('-', '.')
  const text = u.workId ? `<a href="#/${u.area}/${u.workId}">${esc(u.text)}</a>` : esc(u.text)
  return `<li><time datetime="${u.date}">${date}</time><span>${text}</span></li>`
}
function renderUpdates() {
  // The lobby shows the newest few. Entries that read the same and follow one another (the site's pages were
  // improved on three days running) are shown once, with the newest date; the full history keeps every entry.
  const latest = DATA.updates.filter((u, i, all) => i === 0 || u.text !== all[i - 1].text).slice(0, 4)
  $('updates').innerHTML = `<h2 class="eyebrow" id="updatesTitle" data-frame="tabRight" lang="en">Latest Update</h2>
    <div class="upd-slab" data-frame="right">
      <ol class="upd-list">${latest.map((u) => updateRow(u, false)).join('')}</ol>
      <a class="more" href="#/profile/updates">更新履歴を見る</a>
    </div>`
  frames($('updates'))
}
function frames(host) { for (const el of host.querySelectorAll('[data-frame]')) frame(el, el.dataset.frame) }

// ------------------------------------------------------------------ dock
function renderDock() {
  $('dock').innerHTML = `<ul class="dock-list">${AREAS.map((a) =>
    `<li><a href="#/${a.key}" id="dock-${a.key}">${icon(a.key, 24)}<span class="dock-text"><span class="dock-en" lang="en">${a.en}</span><span class="dock-ja">${a.ja}</span></span></a></li>`).join('')}</ul>`
  frame($('dock'), 'rise')
}

// ------------------------------------------------------------------ sheets
const sheet = $('sheet')
function sheetHead(area) {
  return `<header class="sheet-head"><p class="sheet-en" lang="en">${icon(area.key, 20)}${area.en}</p><h2 id="sheetTitle" tabindex="-1">${area.ja}</h2>
    <a class="close" href="#/" id="sheetClose">${icon('close', 18)}<span>ロビーに戻る</span></a></header>`
}
function workHTML(work) {
  return `<article class="work">
    ${work.image ? `<img class="work-visual" src="${esc(BASE_URL + work.image.src)}" alt="${esc(work.image.alt)}" width="${work.image.width}" height="${work.image.height}">` : ''}
    <h3 class="work-title">${esc(work.title)}</h3>
    <p class="meta">${metaLine(work)}</p>
    <div class="actions">${launchLink(work)}${work.repository ? `<a class="btn" href="${esc(work.repository)}" target="_blank" rel="noopener">ソースコード${icon('out', 16)}<span class="sr">（新しいタブで開きます）</span></a>` : ''}</div>
    <p class="work-desc">${esc(work.description)}</p>
    ${work.tags.length ? `<ul class="tags" aria-label="タグ">${work.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  </article>`
}
function areaSheet(area, id) {
  const works = worksIn(area.key)
  if (!works.length) return `${sheetHead(area)}<div class="sheet-body"><p class="empty">${area.empty}</p></div>`
  const current = works.find((w) => w.id === id) ?? works[0]
  const list = works.length > 1
    ? `<ul class="work-list" aria-label="${area.ja}の一覧">${works.map((w) => `<li><a href="${hrefOf(w)}"${w === current ? ' aria-current="true"' : ''}><span class="wl-title">${esc(w.title)}</span><span class="wl-meta">${metaLine(w)}</span></a></li>`).join('')}</ul>`
    : ''
  return `${sheetHead(area)}<div class="sheet-body">${list}${workHTML(current)}</div>`
}
function profileSheet(area) {
  return `${sheetHead(area)}<div class="sheet-body">
    <section class="group"><h3>このサイトについて</h3>
      <p>Pirafu2411が作ったゲームやWebアプリ、ツールを置いています。気になったものから触ってみてください。</p>
      <p>ブラウザで動くものは、「あそぶ」や「つかう」から新しいタブで開けます。</p>
      <dl class="counts"><div><dt>作品</dt><dd>${WORKS.length}</dd></div>${DATA.counts.map((c) => `<div><dt>${esc(c.label)}</dt><dd>${c.count}</dd></div>`).join('')}</dl>
    </section>
    <section class="group"><h3>リンク</h3>
      <ul class="link-list">${LINKS.map((l) => `<li><a href="${l.href}" target="_blank" rel="noopener">${esc(l.label)}${icon('out', 16)}<span class="sr">（新しいタブで開きます）</span></a></li>`).join('')}</ul>
    </section>
    <section class="group" id="history"><h3 id="historyTitle" tabindex="-1">更新履歴</h3>
      <ol class="upd-list long">${DATA.updates.map((u) => updateRow(u, true)).join('')}</ol>
    </section>
  </div>`
}
function choice(name, legend, options, value, hint) {
  return `<fieldset class="row"><legend>${legend}</legend>${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="seg">${options.map((o) => `<label><input type="radio" name="${name}" value="${o.key}"${o.key === value ? ' checked' : ''}><span>${o.label}</span></label>`).join('')}</div></fieldset>`
}
function settingsSheet(area) {
  return `${sheetHead(area)}<form class="sheet-body" id="settings">
    <section class="group"><h3>景色と時間</h3>
      ${choice('scene', '窓の外の景色', SCENES, prefs.scene)}
      ${choice('time', '時間帯', TIMES, prefs.time, fixedHour === null ? '「いまの時刻」にすると、この端末の時計に合わせて朝・昼・夕方・夜が移り変わります。' : '確認用のURLで時刻を固定しているため、ここでの選択は反映されません。')}
    </section>
    <section class="group"><h3>表示</h3>
      ${choice('view', '空間の表示', [{ key: 'auto', label: '自動' }, { key: 'room', label: '3D空間' }, { key: 'sky', label: '空だけ' }], prefs.view, '「自動」にすると、広い画面では3D空間を表示し、スマートフォンでは空だけの軽い表示にします。')}
      ${choice('opaque', 'UIの背景', [{ key: 'off', label: '半透明' }, { key: 'on', label: '不透明' }], prefs.opaque ? 'on' : 'off', '文字が読みにくいときは「不透明」にしてください。')}
      <div class="row"><p class="row-label">UIを隠す</p><p class="hint">メニューや札をしまって、空間だけを眺められます。Escキーか、画面右下の「UIを表示」で戻せます。</p><button class="btn" type="button" id="hideUi">UIを隠して眺める</button></div>
    </section>
    <section class="group"><h3>動きと画質</h3>
      ${choice('motion', '動き', [{ key: 'system', label: '端末の設定に合わせる' }, { key: 'reduce', label: '減らす' }], prefs.motion, '「減らす」にすると、カメラが動くときや札が出入りするときに、一瞬で切り替わります。')}
      ${choice('quality', '画質', [{ key: 'auto', label: '自動' }, { key: 'high', label: '高' }, { key: 'low', label: '軽量' }], prefs.quality, '「自動」にすると、描画が重いときに「軽量」へ切り替えます。')}
    </section>
  </form>`
}

// ------------------------------------------------------------------ routes
function readRoute() {
  const [area, id] = location.hash.replace(/^#\/?/, '').split('/')
  return AREA[area] ? { area, id: id || null } : { area: null, id: null }
}
let route = { area: null, id: null }
let lastArea = null
function applyRoute(first) {
  const next = readRoute()
  const sameArea = next.area === route.area
  route = next
  const area = AREA[route.area]
  root.dataset.view = area ? 'sheet' : 'lobby'
  $('lobby').inert = !!area
  for (const a of AREAS) { const link = $('dock-' + a.key); if (a.key === route.area) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current') }
  if (area) {
    sheet.innerHTML = area.key === 'profile' ? profileSheet(area) : area.key === 'settings' ? settingsSheet(area) : areaSheet(area, route.id)
    sheet.dataset.area = area.key
    sheet.hidden = false
    frame(sheet, 'right')
    if (area.key === 'settings') bindSettings()
    if (!sameArea) { sheet.classList.remove('is-in'); void sheet.offsetWidth }
    sheet.classList.add('is-in')
    sheet.querySelector('.sheet-body').scrollTop = 0
    if (area.key === 'profile' && route.id === 'updates') { $('history').scrollIntoView(); if (!first) $('historyTitle').focus({ preventScroll: true }) }
    else if (!first && !sameArea) $('sheetTitle').focus({ preventScroll: true })
    lastArea = area.key
  } else {
    sheet.classList.remove('is-in')
    sheet.hidden = true
    if (!first && lastArea) $('dock-' + lastArea)?.focus({ preventScroll: true })
    lastArea = null
  }
  syncStage()
}
addEventListener('hashchange', () => applyRoute(false))

// ------------------------------------------------------------------ settings form
function bindSettings() {
  $('settings').addEventListener('change', (e) => {
    const { name, value } = e.target
    if (name === 'opaque') prefs.opaque = value === 'on'
    else if (name in prefs) prefs[name] = value
    save(); applyPrefs(name)
  })
  $('hideUi').addEventListener('click', () => setUiHidden(true))
}
function applyPrefs(changed) {
  if (prefs.opaque) root.dataset.opaque = ''; else delete root.dataset.opaque
  if (reduced()) root.dataset.motion = 'reduce'; else delete root.dataset.motion
  tickBar()
  if (!stage) return
  if (!changed || changed === 'scene') stage.setScene(SCENES.findIndex((s) => s.key === prefs.scene), !changed)
  if (!changed || changed === 'view') { stage.setRoom(wantsRoom()); syncStage() }
  if (prefs.quality !== 'auto') { if (!changed || changed === 'quality') stage.setQuality(prefs.quality, true) } else if (changed === 'quality') stage.setQuality('high', false)
}

// ------------------------------------------------------------------ hiding the UI
function setUiHidden(hidden) {
  if (hidden) { if (route.area) location.hash = '#/'; root.dataset.ui = 'hidden' } else delete root.dataset.ui
  $('ui').inert = hidden
  $('restore').hidden = !hidden
  if (hidden) $('restore').focus({ preventScroll: true }); else $('dock-settings').focus({ preventScroll: true })
  syncStage()
}
$('restore').addEventListener('click', () => setUiHidden(false))
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (root.dataset.ui === 'hidden') setUiHidden(false)
  else if (route.area) location.hash = '#/'
})

// ------------------------------------------------------------------ 3D stage
const tags = {}
for (const a of TERMINALS) {
  const first = worksIn(a.key)[0]
  const el = document.createElement('div')
  el.className = 'tag'
  el.innerHTML = `<span class="tag-en" lang="en">${a.en}</span><span class="tag-work">${first ? esc(first.title) : 'まだ何もありません'}</span>`
  $('tags').appendChild(el)
  frame(el, 'plate')
  tags[a.term] = el
}
// What each terminal of the room shows: the first work of its area, or a dark screen while the area is empty.
const terminalWorks = Object.fromEntries(TERMINALS.map((a) => {
  const first = worksIn(a.key)[0]
  return [a.term, { label: a.en.toUpperCase(), title: first?.title ?? null, color: first?.color ?? '#9fb4d6', img: first?.image?.src ?? null }]
}))
const areaOfTerm = Object.fromEntries(TERMINALS.map((a) => [a.term, a.key]))

// What the visitor is told about the 3D space. A first visit compiles its shaders for a while, so the wait is
// said in words; the lobby itself works throughout.
const SPACE_NOTES = {
  loading: '空間を読み込んでいます。メニューはこのまま使えます。',
  failed: '空間を読み込めませんでした。メニューから作品を開けます。',
  none: 'この端末では3D空間を表示できません。メニューから作品を開けます。',
}
function setSpace(status) {
  root.dataset.space = status
  const note = $('spaceNote')
  note.hidden = !SPACE_NOTES[status]
  if (SPACE_NOTES[status] && note.dataset.status !== status) { note.dataset.status = status; note.textContent = SPACE_NOTES[status]; frame(note, 'tabLeft') }
}

let stage = null
function syncStage() {
  if (!stage) return
  const area = AREA[route.area]
  const docked = !!area && !narrow.matches
  stage.setSheet(docked ? sheet.offsetWidth : 0)
  stage.focus(area?.term ?? null)
  stage.setPicking(!area && root.dataset.ui !== 'hidden')
}
try {
  const { createStage } = await import('./stage.js')
  stage = createStage({
    canvas: $('gl'), terminals: terminalWorks, order: TERMINALS.map((a) => a.term), tags, hour, reduced,
    onHover(key) { for (const k in tags) tags[k].classList.toggle('is-on', k === key) },
    onPick(key) { location.hash = `#/${areaOfTerm[key]}` },
    onStatus: setSpace,
  })
} catch (err) {
  // Without WebGL the lobby still works as a page: every work stays reachable from the dock and the cards.
  console.error(err)
  setSpace('none')
}

// ------------------------------------------------------------------ start
renderFeatured()
renderUpdates()
renderDock()
applyPrefs()
applyRoute(true)
tickBar()
setInterval(tickBar, 1000)
narrow.addEventListener('change', () => { if (prefs.view === 'auto') stage?.setRoom(wantsRoom()); redrawFrames(); syncStage() })
systemReduced.addEventListener('change', () => applyPrefs('motion'))
if (query.get('ui') === 'hidden') setUiHidden(true)
requestAnimationFrame(() => requestAnimationFrame(() => { root.dataset.ready = '' }))
if (import.meta.env.DEV) window.__lobby = { stage, prefs, DATA }
