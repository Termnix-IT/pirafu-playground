// Entry point of the lobby prototype: the web UI, its routes, settings and the backdrop. The 3D side lives in
// stage.js and is loaded after the UI is on screen; the lobby is usable without it.
//
// Routes are kept in the hash:  #/  (lobby)   #/games  #/tools  #/lab  #/media  (an area, with #/<area>/<work id>
// for one work)   #/profile   #/updates   #/settings.  Every work can be opened from a link alone.
//
// Where each piece of state lives:
//   URL (shareable)            the open area and work
//   localStorage (kept)        settings: scene, time of day, display mode, quality, UI background, motion
//   sessionStorage (this tab)  the topic on show, whether its turning is paused, the quality the automatic choice settled on
//   memory (this page)         the camera, the loaded 3D space, whether the UI is hidden
//
// For checking screens the query accepts  ?t=<hour 0-24>  ?scene=sky|cloud|water  ?quality=<level>  ?ui=hidden
// and overrides the saved settings;  ?debug  exposes the renderer;  ?shoot  is used by scripts/render-stills.mjs.
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import './style.css'
import { frame, redrawFrames } from './frame.js'
import { icon, MARK } from './icons.js'
import { createTopics } from './topics.js'
import { STILL, stillSize } from './view.js'

const $ = (id) => document.getElementById(id)
const root = document.documentElement
const BASE_URL = import.meta.env.BASE_URL
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pad = (n) => String(n).padStart(2, '0')
const store = (area, key, value) => { try { if (value === undefined) return area.getItem(key); area.setItem(key, value) } catch { /* storage may be unavailable */ } return null }

const DATA = await fetch(BASE_URL + 'assets/lobby.json').then((r) => r.json())
const WORKS = DATA.works
// The Japanese font is large (hundreds of @font-face rules). It is fetched after the first paint, like on the portal.
import('./fonts-ja.js')
// development only: compare candidate fonts on the real screens (src/dev/font-lab.js); dropped from every build
if (import.meta.env.DEV) import('./dev/font-lab.js')

// The entries of the dock. The first four are areas of works, each tied to one terminal of the 3D room.
const AREAS = [
  { key: 'games', label: 'ゲーム', term: 'game', empty: 'まだ何もありません。ゲームができたら、ここに並びます。' },
  { key: 'tools', label: 'ツール', term: 'tool', empty: 'まだ何もありません。ツールやアプリができたら、ここに並びます。' },
  { key: 'lab', label: 'ラボ', term: 'experiment', empty: 'まだ何もありません。実験や試作ができたら、ここに並びます。' },
  { key: 'media', label: 'メディア', term: 'media', empty: 'まだ何もありません。映像や画像の作品ができたら、ここに並びます。' },
  { key: 'profile', label: 'プロフィール' },
  { key: 'settings', label: '設定' },
]
// Pages that open as a sheet but have no entry of their own in the dock.
const PAGES = [...AREAS, { key: 'updates', label: '更新履歴', under: 'profile' }]
const PAGE = Object.fromEntries(PAGES.map((a) => [a.key, a]))
const TERMINALS = AREAS.filter((a) => a.term)
const worksIn = (key) => WORKS.filter((w) => w.area === key)
const hrefOf = (work) => `#/${work.area}/${work.id}`

const SCENES = [{ key: 'sky', label: '空' }, { key: 'cloud', label: '雲' }, { key: 'water', label: '水面' }]
const TIMES = [{ key: 'auto', label: 'いまの時刻' }, { key: 'morning', label: '朝', hour: 7.6 }, { key: 'noon', label: '昼', hour: 12.5 }, { key: 'evening', label: '夕方', hour: 18.2 }, { key: 'night', label: '夜', hour: 22 }]
const QUALITIES = [
  { key: 'auto', label: '自動', about: 'この端末の描画の速さに合わせて、下の3つから選びます。' },
  { key: 'high', label: '高品質', about: '床の映り込み、影、ガラスの屈折をすべて細かく描きます。' },
  { key: 'standard', label: '標準', about: '解像度と影の細かさを少し抑えます。見た目はほぼ変わりません。' },
  { key: 'low', label: '軽量', about: '映り込みを粗くし、ガラスの屈折と光のにじみを省きます。' },
  { key: 'still', label: '静止画', about: '3Dを動かさず、同じ構図の画像を背景にします。いちばん軽い表示です。' },
]
const LINKS = [
  { label: 'いま公開しているPlayground', href: 'https://pirafu2411.pages.dev' },
  { label: 'GitHub（Termnix-IT）', href: 'https://github.com/Termnix-IT' },
]

// ------------------------------------------------------------------ settings
const STORE = 'pirafu-lobby-prefs'
const prefs = { scene: 'sky', time: 'auto', view: 'auto', quality: 'auto', opaque: false, motion: 'system' }
try { Object.assign(prefs, JSON.parse(localStorage.getItem(STORE) ?? '{}')) } catch { /* storage may be unavailable */ }
if (!QUALITIES.some((q) => q.key === prefs.quality)) prefs.quality = 'auto'
const query = new URLSearchParams(location.search)
const shoot = query.has('shoot')
let fixedHour = query.has('t') && Number.isFinite(+query.get('t')) ? +query.get('t') : null
if (SCENES.some((s) => s.key === query.get('scene'))) prefs.scene = query.get('scene')
if (QUALITIES.some((q) => q.key === query.get('quality'))) prefs.quality = query.get('quality')
if (shoot) { prefs.quality = 'high'; prefs.view = 'room'; root.dataset.shoot = '' }
function save() { store(localStorage, STORE, JSON.stringify(prefs)) }

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
// 'room' the 3D room, 'sky' the live sky alone (the light view of phones), 'still' no real-time 3D at all
const spaceMode = () => (prefs.quality === 'still' ? 'still' : prefs.view === 'room' || (prefs.view === 'auto' && !narrow.matches) ? 'room' : 'sky')

// ------------------------------------------------------------------ title bar
$('mark').innerHTML = MARK
function tickBar() {
  const d = new Date()
  if (fixedHour !== null) d.setHours(Math.floor(fixedHour), Math.round(fixedHour % 1 * 60), 0)   // a checking URL shows the hour it draws
  $('barDate').dateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  $('barDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'.charAt(d.getDay())}）`
  $('barTime').dateTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  $('barTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const phase = phaseOf(hour())
  if (root.dataset.phase !== phase.key) { root.dataset.phase = phase.key; syncBackdrop() }
  // There is no weather source in this project, so no weather is shown. This slot tells what the lobby itself
  // has outside its windows: the scene and the time of day being drawn.
  const scene = SCENES.find((s) => s.key === prefs.scene)
  if ($('barSky').dataset.key !== scene.key + phase.key) {
    $('barSky').dataset.key = scene.key + phase.key
    $('barSky').innerHTML = `${icon(scene.key === 'sky' && phase.key === 'night' ? 'moon' : scene.key, 17)}<span class="sr">窓の外：</span><span>${scene.label}</span><span class="bar-phase">${phase.label}</span>`
  }
}

// ------------------------------------------------------------------ lobby: latest topics and the latest update
const topics = createTopics({ host: $('topics'), topics: DATA.topics ?? [], baseUrl: BASE_URL, reduced })
function frames(host) { for (const el of host.querySelectorAll('[data-frame]')) frame(el, el.dataset.frame) }
function updateRow(u) {
  const text = u.workId ? `<a href="#/${u.area}/${u.workId}">${esc(u.text)}</a>` : esc(u.text)
  return `<li><time datetime="${u.date}">${u.date.replaceAll('-', '.')}</time><span>${text}</span></li>`
}
function renderUpdates() {
  // The lobby says only what changed last; everything before that is on the history page.
  const u = DATA.updates[0]
  $('updates').hidden = !u
  if (!u) return
  $('updates').innerHTML = `<div class="upd-head">
      <h2 class="eyebrow" id="updatesTitle">更新情報</h2>
      <a class="more" href="#/updates">更新履歴を見る${icon('next', 14)}</a>
    </div>
    <div class="upd-slab" data-frame="right">
      <p class="upd-latest"><time datetime="${u.date}">${u.date.replaceAll('-', '.')}</time><span>${u.workId ? `<a href="#/${u.area}/${u.workId}">${esc(u.text)}</a>` : esc(u.text)}</span></p>
    </div>`
  frames($('updates'))
}

// ------------------------------------------------------------------ dock
function renderDock() {
  $('dock').innerHTML = `<ul class="dock-list">${AREAS.map((a) => `<li><a href="#/${a.key}" id="dock-${a.key}">${icon(a.key, 22)}<span data-label="${a.label}"><b>${a.label}</b></span></a></li>`).join('')}</ul>`
  frame($('dock'), 'rise')
}

// ------------------------------------------------------------------ sheets
const sheet = $('sheet')
function sheetHead(page) {
  return `<header class="sheet-head"><h2 id="sheetTitle" tabindex="-1">${icon(page.under ? 'updates' : page.key, 22)}<span>${page.label}</span></h2>
    <a class="close" href="${page.under ? `#/${page.under}` : '#/'}" id="sheetClose">${icon(page.under ? 'prev' : 'close', 18)}<span>${page.under ? PAGE[page.under].label + 'へ戻る' : '閉じる'}</span></a></header>`
}
const NEW_TAB = '<span class="sr">（新しいタブで開きます）</span>'
function metaLine(work) { return `<span class="state"><span aria-hidden="true">${esc(work.statusMark)}</span>${esc(work.status)}</span><span>${esc(work.category)}</span>` }
function areaSheet(area, id) {
  const works = worksIn(area.key)
  if (!works.length) return { html: `${sheetHead(area)}<div class="sheet-body"><p class="empty">${area.empty}</p></div>`, work: null }
  const work = works.find((w) => w.id === id) ?? works[0]
  // one row per work; the list scrolls by itself, so many works never push the chosen one off the sheet
  const list = works.length > 1
    ? `<nav class="work-list" aria-label="${area.label}の一覧"><ul>${works.map((w) => `<li><a href="${hrefOf(w)}"${w === work ? ' aria-current="true"' : ''}><span class="wl-title">${esc(w.title)}</span><span class="wl-meta"><span aria-hidden="true">${esc(w.statusMark)}</span>${esc(w.status)}</span></a></li>`).join('')}</ul></nav>`
    : ''
  // The key visual is shown here only while no 3D terminal is showing it (CSS decides): on screen, the
  // terminal gives the feel of the work and this sheet gives the words and the way in.
  const html = `${sheetHead(area)}${list}
    <div class="sheet-body"><article class="work" data-work="${esc(work.id)}">
      ${work.image ? `<img class="work-visual" src="${esc(BASE_URL + work.image.src)}" alt="${esc(work.image.alt)}" width="${work.image.width}" height="${work.image.height}">` : ''}
      <h3 class="work-title">${esc(work.title)}</h3>
      <p class="meta">${metaLine(work)}</p>
      <p class="work-desc">${esc(work.description)}</p>
      ${work.tags.length ? `<ul class="tags" aria-label="タグ">${work.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </article></div>
    <footer class="sheet-foot">
      ${work.launchUrl
        ? `<a class="btn primary big" href="${esc(work.launchUrl)}" target="_blank" rel="noopener">${esc(work.launchLabel)}${icon('out', 18)}${NEW_TAB}</a>`
        : '<p class="note">紹介だけの作品です。</p>'}
      ${work.repository ? `<a class="btn quiet" href="${esc(work.repository)}" target="_blank" rel="noopener">ソースコード${icon('out', 16)}${NEW_TAB}</a>` : ''}
    </footer>`
  return { html, work }
}
function profileSheet(page) {
  return `${sheetHead(page)}<div class="sheet-body">
    <section class="group"><h3>このサイトについて</h3>
      <p>Pirafu2411が作ったゲームやWebアプリ、ツールを置いています。気になったものから触ってみてください。</p>
      <p>ブラウザで動くものは、「あそぶ」や「つかう」から新しいタブで開けます。</p>
      <dl class="counts"><div><dt>作品</dt><dd>${WORKS.length}</dd></div>${DATA.counts.map((c) => `<div><dt>${esc(c.label)}</dt><dd>${c.count}</dd></div>`).join('')}</dl>
    </section>
    <section class="group"><h3>リンク</h3>
      <ul class="link-list">
        <li><a href="#/updates">更新履歴${icon('next', 16)}</a></li>
        ${LINKS.map((l) => `<li><a href="${l.href}" target="_blank" rel="noopener">${esc(l.label)}${icon('out', 16)}${NEW_TAB}</a></li>`).join('')}
      </ul>
    </section>
  </div>`
}
function updatesSheet(page) {
  return `${sheetHead(page)}<div class="sheet-body"><ol class="upd-list">${DATA.updates.map(updateRow).join('')}</ol></div>`
}
function choice(name, legend, options, value, hint, disabled) {
  return `<fieldset class="row"${disabled ? ' disabled' : ''}><legend>${legend}</legend>${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="seg">${options.map((o) => `<label><input type="radio" name="${name}" value="${o.key}"${o.key === value ? ' checked' : ''}><span>${o.label}</span></label>`).join('')}</div></fieldset>`
}
function settingsSheet(page) {
  return `${sheetHead(page)}<form class="sheet-body" id="settings">
    <section class="group"><h3>景色と時間</h3>
      ${choice('scene', '景色', SCENES, prefs.scene, '窓の外に見えるものを選びます。')}
      ${choice('time', '時間帯', TIMES, prefs.time, fixedHour === null ? '「いまの時刻」にすると、この端末の時計に合わせて朝・昼・夕方・夜が移り変わります。' : '確認用のURLで時刻を固定しているため、ここでは変えられません。', fixedHour !== null)}
    </section>
    <section class="group"><h3>表示</h3>
      ${choice('view', '表示モード', [{ key: 'auto', label: '自動' }, { key: 'room', label: '3D空間' }, { key: 'sky', label: '空だけ' }], prefs.view, '「自動」にすると、広い画面では3D空間を表示し、スマートフォンでは空だけの軽い表示にします。', prefs.quality === 'still')}
      ${choice('quality', '画質', QUALITIES, prefs.quality)}
      <dl class="about" id="qualityAbout">${QUALITIES.map((q) => `<div${q.key === prefs.quality ? ' class="is-on"' : ''} data-q="${q.key}"><dt>${q.label}</dt><dd>${q.about}</dd></div>`).join('')}</dl>
      <p class="hint" id="qualityNow" role="status"></p>
      ${choice('opaque', 'UIの背景', [{ key: 'off', label: '半透明' }, { key: 'on', label: '不透明' }], prefs.opaque ? 'on' : 'off', '文字が読みにくいときは「不透明」にしてください。')}
      <div class="row"><p class="row-label">UI非表示</p><p class="hint">メニューや札をしまって、空間だけを眺められます。Escキーか、画面右下の「UIを表示」で戻せます。</p><button class="btn" type="button" id="hideUi">UIを隠して眺める</button></div>
    </section>
    <section class="group"><h3>動き</h3>
      ${choice('motion', '動き', [{ key: 'system', label: '端末の設定に合わせる' }, { key: 'reduce', label: '減らす' }], prefs.motion, '「減らす」にすると、カメラが動くときや札が出入りするときに、一瞬で切り替わります。最新トピックも自動では切り替わりません。')}
    </section>
  </form>`
}

// ------------------------------------------------------------------ routes
function readRoute() {
  const [area, id] = location.hash.replace(/^#\/?/, '').split('/')
  return PAGE[area] ? { area, id: id || null } : { area: null, id: null }
}
let route = { area: null, id: null }
let lastArea = null
let shownWork = null
function applyRoute(first) {
  const next = readRoute()
  const sameArea = next.area === route.area
  route = next
  const page = PAGE[route.area]
  root.dataset.view = page ? 'sheet' : 'lobby'
  $('lobby').inert = !!page
  topics.suspend(!!page || root.dataset.ui === 'hidden')
  const current = page?.under ?? route.area
  for (const a of AREAS) { const link = $('dock-' + a.key); if (a.key === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current') }
  shownWork = null
  if (page) {
    let html
    if (page.key === 'profile') html = profileSheet(page)
    else if (page.key === 'settings') html = settingsSheet(page)
    else if (page.key === 'updates') html = updatesSheet(page)
    else ({ html, work: shownWork } = areaSheet(page, route.id))
    sheet.innerHTML = html
    sheet.dataset.area = page.key
    sheet.hidden = false
    frame(sheet, 'right')
    if (page.key === 'settings') bindSettings()
    // a sheet slides in once; going from one sheet to another only changes what is on it
    if (!sheet.classList.contains('is-in')) { void sheet.offsetWidth; sheet.classList.add('is-in') }
    else if (!sameArea) { sheet.classList.remove('is-swap'); void sheet.offsetWidth; sheet.classList.add('is-swap') }
    if (!first && !sameArea) $('sheetTitle').focus({ preventScroll: true })
    lastArea = current
  } else {
    sheet.classList.remove('is-in', 'is-swap')
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
    if (name === 'quality') {
      for (const row of $('qualityAbout').children) row.classList.toggle('is-on', row.dataset.q === value)
      $('settings').querySelector('input[name="view"]').closest('fieldset').disabled = value === 'still'
    }
  })
  $('hideUi').addEventListener('click', () => setUiHidden(true))
  showLevel()
}
const LEVEL_LABEL = { high: '高品質', standard: '標準', low: '軽量' }
let levelInUse = null
function showLevel() {
  const el = $('qualityNow')
  if (!el) return
  el.textContent = prefs.quality === 'auto' && levelInUse && spaceMode() === 'room' ? `いまは「${LEVEL_LABEL[levelInUse]}」で描いています。` : ''
}
function applyPrefs(changed) {
  if (prefs.opaque) root.dataset.opaque = ''; else delete root.dataset.opaque
  if (reduced()) root.dataset.motion = 'reduce'; else delete root.dataset.motion
  root.dataset.scene = prefs.scene
  tickBar()
  if (!changed || changed === 'motion') topics.refresh()
  if (!changed || changed === 'scene') { stage?.setScene(SCENES.findIndex((s) => s.key === prefs.scene), !changed); syncBackdrop() }
  if (!changed || changed === 'view' || changed === 'quality') applySpace()
  if (changed === 'time') stage?.wake()
}

// ------------------------------------------------------------------ hiding the UI
function setUiHidden(hidden) {
  if (hidden) { if (route.area) location.hash = '#/'; root.dataset.ui = 'hidden' } else delete root.dataset.ui
  $('ui').inert = hidden
  $('restore').hidden = !hidden || shoot
  if (hidden) $('restore').focus({ preventScroll: true }); else $('dock-settings').focus({ preventScroll: true })
  topics.suspend(hidden || !!route.area)
  syncStage()
}
$('restore').addEventListener('click', () => setUiHidden(false))
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (root.dataset.ui === 'hidden') setUiHidden(false)
  else if (route.area) location.hash = PAGE[route.area].under ? `#/${PAGE[route.area].under}` : '#/'
})

// ------------------------------------------------------------------ backdrop: a still of the room
// The still is what the visitor sees first, and what stays when real-time 3D is off, unavailable or broken.
// It is photographed from the lobby's own camera for each time of day and scene, and laid out so that it lines
// up with the live view (view.js), so the room does not jump when the 3D takes over.
function syncBackdrop() {
  const img = $('still')
  const name = `${root.dataset.phase ?? phaseOf(hour()).key}-${prefs.scene}`
  const mode = spaceMode()
  const want = (mode === 'room' || mode === 'still') && (DATA.stills ?? []).includes(name) && !shoot
  $('backdrop').hidden = !want
  if (!want) return
  const src = `${BASE_URL}assets/stills/${name}${innerWidth * (window.devicePixelRatio || 1) <= 1300 ? '-s' : ''}.webp`
  if (img.dataset.src !== src) { img.dataset.src = src; img.src = src }
  const size = stillSize(innerWidth, innerHeight)
  img.style.width = `${size.width.toFixed(1)}px`
  img.style.height = `${size.height.toFixed(1)}px`
}
addEventListener('resize', syncBackdrop)
$('still').addEventListener('load', () => $('still').classList.add('is-in'))

// ------------------------------------------------------------------ what the visitor is told about the 3D space
// Nothing here blocks the lobby: the note sits in a corner, and every work can be opened while it shows.
// A percentage appears only while bytes of known total are arriving; the other steps just say what is going on.
const STEP_TEXT = { sky: 'ロビーを準備しています', download: '3D空間を読み込んでいます', build: '端末を準備しています' }
let slowTimer = 0, noteKey = ''
function setNote(key, text, action) {
  const note = $('spaceNote')
  note.hidden = !text || shoot
  if (!text) { noteKey = ''; return }
  if (noteKey === key) return
  noteKey = key
  $('spaceText').textContent = text
  const button = $('spaceAction')
  button.hidden = !action
  if (action) { button.innerHTML = `${action.icon ? icon(action.icon, 16) : ''}<span>${action.label}</span>`; button.onclick = action.run }
  frame(note, 'tabLeft')
}
function setSpace(status, detail) {
  root.dataset.space = status
  const loading = status === 'loading'
  if (!loading) { clearTimeout(slowTimer); slowTimer = 0; delete root.dataset.slow }
  const known = loading && detail?.step === 'download' && detail.total > 0
  root.style.setProperty('--load', known ? (detail.loaded / detail.total).toFixed(3) : '0')
  if (known) root.dataset.load = 'known'; else delete root.dataset.load
  $('spacePct').textContent = known ? `${Math.round(detail.loaded / detail.total * 100)}%` : ''
  if (loading) {
    // after a while, say that waiting is optional
    if (!slowTimer) slowTimer = setTimeout(() => { root.dataset.slow = ''; setSpace('loading', detail) }, 9000)
    const slow = 'slow' in root.dataset
    setNote(detail.step + (slow ? '-slow' : ''), STEP_TEXT[detail.step] + (slow ? '。このままでも作品は開けます。' : ''),
      slow ? { label: '静止画のままにする', run() { prefs.quality = 'still'; save(); applyPrefs('quality') } } : null)
  } else if (status === 'failed') setNote(status, '3D空間を読み込めませんでした。メニューから作品を開けます。', { label: 'もう一度読み込む', icon: 'retry', run() { stage?.retry() } })
  else if (status === 'lost') setNote(status, '3Dの表示が止まりました。', { label: '再開する', icon: 'retry', run() { location.reload() } })
  else if (status === 'none') setNote(status, 'この端末では3Dを表示できないため、静止画で表示しています。')
  else setNote('', '')
  showLevel()
}

// ------------------------------------------------------------------ 3D stage
const tags = {}
for (const a of TERMINALS) {
  const first = worksIn(a.key)[0]
  const el = document.createElement('div')
  el.className = 'tag'
  el.innerHTML = `<span class="tag-area">${a.label}</span><span class="tag-work">${first ? esc(first.title) : 'まだ何もありません'}</span>`
  $('tags').appendChild(el)
  frame(el, 'plate')
  tags[a.term] = el
}
// What each terminal of the room shows at first: the first work of its area, or a dark screen while the area is empty.
const terminalWorks = Object.fromEntries(TERMINALS.map((a) => {
  const first = worksIn(a.key)[0]
  return [a.term, { title: first?.title ?? null, color: first?.color ?? '#9fb4d6', img: first?.image?.src ?? null }]
}))
const areaOfTerm = Object.fromEntries(TERMINALS.map((a) => [a.term, a.key]))

let stage = null, stagePromise = null
function ensureStage() {
  stagePromise ??= import('./stage.js').then(({ createStage }) => {
    stage = createStage({
      canvas: $('gl'), terminals: terminalWorks, order: TERMINALS.map((a) => a.term), tags, hour, reduced,
      shoot: shoot ? { fov: STILL.fov } : null,
      uncapped: query.has('bench'),   // for scripts/measure.mjs: draw as often as possible
      onHover(key) { for (const k in tags) tags[k].classList.toggle('is-on', k === key) },
      onPick(key) { location.hash = `#/${areaOfTerm[key]}` },
      onStatus(status, detail) {
        if (spaceMode() === 'still') return
        const arrived = status === 'ready' && root.dataset.space !== 'ready'
        setSpace(status, detail)
        if (arrived) syncStage()   // the room is there now: show the open work on its terminal
      },
      onLevel(level) { levelInUse = level; if (prefs.quality === 'auto') store(sessionStorage, 'pirafu-lobby-level', level); showLevel() },
    })
    stage.setScene(SCENES.findIndex((s) => s.key === prefs.scene), true)
    if (query.has('debug') || import.meta.env.DEV || shoot) window.__lobby = { stage, prefs, DATA, debug: stage.debug }
  }).catch((err) => {
    // Without WebGL the lobby still works as a page: the still stays, and every work is a link away.
    console.error(err)
    setSpace('none')
  })
  return stagePromise
}
function applySpace() {
  const mode = spaceMode()
  root.dataset.mode = mode
  syncBackdrop()
  if (mode === 'still') { stage?.pause(true); setSpace('still'); return }
  if (!stage && !stagePromise) setSpace('loading', { step: 'sky', loaded: 0, total: 0 })
  ensureStage().then(() => {
    if (!stage || spaceMode() === 'still') return
    stage.pause(false)
    stage.setQuality(prefs.quality, prefs.quality === 'auto' ? store(sessionStorage, 'pirafu-lobby-level') : null)
    stage.setRoom(spaceMode() === 'room')
    syncStage()
  })
}
function syncStage() {
  if (!stage) return
  const page = PAGE[route.area]
  const docked = !!page && !narrow.matches
  stage.setSheet(docked ? sheet.offsetWidth : 0)
  stage.focus(page?.term ?? null)
  stage.setPicking(!page && root.dataset.ui !== 'hidden')
  // the terminal of the open area shows the work that is open
  if (page?.term) stage.setScreen(page.term, shownWork?.image ? BASE_URL + shownWork.image.src : null)
}

// ------------------------------------------------------------------ start
// The UI goes on screen first; only then is the 3D side asked for.
renderUpdates()
renderDock()
applyRoute(true)
tickBar()
if (prefs.opaque) root.dataset.opaque = ''
if (reduced()) root.dataset.motion = 'reduce'
root.dataset.scene = prefs.scene
setInterval(tickBar, 1000)
narrow.addEventListener('change', () => { redrawFrames(); if (prefs.view === 'auto') applySpace(); syncStage() })
systemReduced.addEventListener('change', () => applyPrefs('motion'))
if (query.get('ui') === 'hidden' || shoot) setUiHidden(true)
requestAnimationFrame(() => requestAnimationFrame(() => { root.dataset.ready = ''; applySpace() }))

// Photographing stills (scripts/render-stills.mjs): draws a given hour and scene and resolves once it is on screen.
if (shoot) {
  window.__shoot = async (h, sceneKey) => {
    fixedHour = h
    prefs.scene = sceneKey
    await ensureStage()
    stage.setScene(SCENES.findIndex((s) => s.key === sceneKey), true)
    stage.wake(2000)
    for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r))
  }
}
