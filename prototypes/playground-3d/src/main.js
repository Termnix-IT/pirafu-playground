// Entry point of the prototype: UI, camera, time of day and the render loop.
// The room (GLB, lights, reflection) is imported only for the PC experience.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import '@fontsource/sora/200.css'
import '@fontsource/sora/300.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/600.css'
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/500.css'
import './style.css'
import { U, P, applyTime, createDome, phaseName } from './sky.js'

const $ = (id) => document.getElementById(id)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const BASE_URL = import.meta.env.BASE_URL
const WORKS = await fetch(BASE_URL + 'assets/works.json').then((r) => r.json())
const ORDER = ['game', 'tool', 'experiment', 'media']
const LIT = ORDER.filter((k) => WORKS[k].title).length
const SCENES = [
  { k: 'sky', n: '空', svg: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/>' },
  { k: 'cloud', n: '雲', svg: '<path d="M7.5 18h9.2a3.8 3.8 0 0 0 .5-7.57A5.6 5.6 0 0 0 6.5 11.3 3.4 3.4 0 0 0 7.5 18z"/>' },
  { k: 'water', n: '水面', svg: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>' },
]
const GLYPH = {
  game: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M17 14.5v5M14.5 17h5"/>',
  tool: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.5v6M12 9.5l-4.5 2.5M12 9.5l4.5-2.5M12 13.5l-3 6M12 13.5l3.5 5.5"/>',
  experiment: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
  media: '<path d="M9 7.5v9l7.5-4.5z"/>',
}
const WIDE = String.fromCharCode(0x3000) // full-width space, kept out of the source for the linter
const pad = (n) => ('0' + n).slice(-2)
const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 }
const fmt = (h) => { const m = Math.round(h * 60) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60) }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const S = { hour: nowHour(), auto: true, scene: Math.floor(Math.random() * 3), fog: 0, mode: innerWidth <= 700 ? 'phone' : 'pc', sel: null, hover: null, px: 0, py: 0, tx: 0, ty: 0, night: -1, quality: 'high', qualityByUser: false, envDirty: false }
try { const saved = localStorage.getItem('pirafu-proto-scene'); if (saved !== null && +saved >= 0 && +saved < 3) S.scene = +saved } catch { /* storage may be unavailable */ }

// ------------------------------------------------------------------ DOM
const ui = $('ui'), labels = $('labels'), panel = $('panel'), listview = $('listview')
const labelEls = {}
for (const k of ORDER) {
  const w = WORKS[k], b = document.createElement('button')
  b.type = 'button'; b.className = 'tlabel'; b.id = 'label-' + k
  b.innerHTML = `<span class="tl-name">${w.label}</span><span class="tl-work">${w.title || '準備中'}</span>`
  b.addEventListener('click', () => select(k))
  b.addEventListener('focus', () => { S.hover = k })
  b.addEventListener('blur', () => { if (S.hover === k) S.hover = null })
  labels.appendChild(b); labelEls[k] = b
}
function sceneButtons(host, prefix) {
  SCENES.forEach((s, i) => {
    const b = document.createElement('button')
    b.type = 'button'; b.id = prefix + s.k; b.setAttribute('aria-label', s.n); b.title = s.n
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${s.svg}</svg>`
    b.addEventListener('click', () => setScene(i))
    host.appendChild(b)
  })
}
sceneButtons($('marks'), 'mark-'); sceneButtons($('phDock'), 'dock-')
function syncScene() { SCENES.forEach((s, i) => ['mark-', 'dock-'].forEach((p) => $(p + s.k).setAttribute('aria-pressed', i === S.scene ? 'true' : 'false'))) }
for (const k of ORDER) {
  const w = WORKS[k], b = document.createElement('button')
  b.type = 'button'; b.className = 'app' + (w.title ? '' : ' is-off'); b.id = 'app-' + k; b.style.setProperty('--c', w.color)
  b.innerHTML = `<span class="lens"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[k]}</svg></span><span class="app-name">${w.title || '準備中'}</span>`
  b.addEventListener('click', () => openApp(k, b))
  $('phApps').appendChild(b)
  const lamp = document.createElement('i')
  if (w.title) lamp.style.setProperty('--c', w.color); else lamp.className = 'off'
  $('phLamps').appendChild(lamp)
}
$('phLamps').setAttribute('aria-label', `灯っている端末 ${LIT} / ${ORDER.length}`)

function detailHTML(k, phone) {
  const w = WORKS[k]
  const shot = w.img ? `<img class="p-shot" src="${BASE_URL + w.img}" alt="${w.alt || ''}">` : ''
  const open = w.url ? `<a class="btn primary" href="${w.url}" target="_blank" rel="noopener">開く</a>` : ''
  if (phone) {
    return `<div class="pa-top" style="--c:${w.color}"><div class="pa-bar"><span>${w.label}</span><span>${w.status}</span></div>${shot}</div>` +
      `<div class="pa-body"><h2 class="p-title">${w.title || '準備中'}</h2><div class="p-meta"><span>${w.kind}</span></div><p class="p-desc">${w.desc}</p></div>` +
      `<div class="pa-foot">${open}<button class="btn" type="button" id="appClose">ホームに戻る</button></div>`
  }
  return `<div class="p-head"><span class="p-term">${w.label} TERMINAL</span><button class="btn" type="button" id="panelBack">部屋に戻る</button></div>${shot ? `<div class="p-media">${shot}</div>` : ''}` +
    `<div class="p-text"><h2 class="p-title">${w.title || '準備中'}</h2><div class="p-meta"><span>${w.kind}</span><span>${w.status}</span></div><p class="p-desc">${w.desc}</p>${open ? `<div class="p-actions">${open}</div>` : ''}</div>`
}
function showPanel(k) {
  const t = room.terms[k]
  panel.innerHTML = detailHTML(k, false)
  panel.classList.toggle('wide', !!WORKS[k].img && t.sw > t.sh * 1.1)
  fitPanel(); panel.hidden = false
  $('panelBack').addEventListener('click', () => select(null))
  $('panelBack').focus({ preventScroll: true })
}
function openList(on) {
  if (on) {
    select(null, true)
    listview.innerHTML = '<div class="p-head"><span class="p-term">作品の一覧</span><button class="btn" type="button" id="listClose">閉じる</button></div><ul>' +
      ORDER.filter((k) => WORKS[k].title).map((k) => { const w = WORKS[k]; return `<li><span><b>${w.title}</b><small>${w.kind}${WIDE}${w.status}</small></span><a class="btn primary" href="${w.url}" target="_blank" rel="noopener">開く</a></li>` }).join('') + '</ul>'
    listview.hidden = false
    $('listClose').addEventListener('click', () => openList(false))
    $('listClose').focus({ preventScroll: true })
    setHash('list')
  } else {
    listview.hidden = true
    if (location.hash === '#list') setHash('')
  }
}
$('listBtn').addEventListener('click', () => openList(listview.hidden))
function setHash(h) { try { if (location.hash.replace('#', '') !== h) location.hash = h } catch { /* ignore */ } }
let appOpen = null
function openApp(k, btn) {
  const fr = $('phFrame').getBoundingClientRect(), r = btn.querySelector('.lens').getBoundingClientRect(), a = $('phApp')
  a.style.setProperty('--ox', (r.left + r.width / 2 - fr.left) + 'px'); a.style.setProperty('--oy', (r.top + r.height / 2 - fr.top) + 'px'); a.style.setProperty('--c', WORKS[k].color)
  a.innerHTML = detailHTML(k, true); a.hidden = false; appOpen = k; ui.classList.add('is-app'); void a.offsetWidth; a.classList.add('is-open')
  $('appClose').addEventListener('click', closeApp); $('appClose').focus({ preventScroll: true })
}
function closeApp() {
  const a = $('phApp'); if (!appOpen) return
  const k = appOpen; appOpen = null; ui.classList.remove('is-app'); a.classList.remove('is-open')
  setTimeout(() => { if (!appOpen) a.hidden = true }, reduce ? 0 : 560)
  $('app-' + k)?.focus({ preventScroll: true })
}
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (appOpen) closeApp(); else if (!listview.hidden) openList(false); else if (S.sel) select(null) })

// ------------------------------------------------------------------ renderer
const canvas = $('gl')
let renderer
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }) } catch { renderer = null }
if (!renderer) { $('capSub').textContent = 'この試作を表示するにはWebGLが必要です。'; throw new Error('WebGL unavailable') }
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap ?? THREE.PCFShadowMap
renderer.shadowMap.autoUpdate = false
renderer.info.autoReset = false
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600)
scene.add(createDome())
U.uScene.value = S.scene

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }))
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.11, 0.42, 0.97)   // a restrained halo on lamps, screens and the sun only
composer.addPass(bloom)
composer.addPass(new OutputPass())

// ------------------------------------------------------------------ room (PC only)
let room = null, roomPromise = null
function ensureRoom() {
  if (roomPromise) return roomPromise
  roomPromise = import('./room.js').then((m) => m.createRoom({ renderer, scene, camera, works: WORKS, order: ORDER })).then((r) => {
    room = r
    room.group.visible = S.mode === 'pc'
    room.setQuality(S.quality)
    resize()
    hud()
    fromHash()
    return r
  }).catch((err) => { console.error(err); $('capSub').textContent = '空間を読み込めませんでした。「一覧で見る」から作品を開けます。' })
  return roomPromise
}

// ------------------------------------------------------------------ camera
const BASE = { pc: { pos: new THREE.Vector3(1.2, 1.6, 9.0), look: new THREE.Vector3(-0.4, 2.15, -6) }, phone: { pos: new THREE.Vector3(0, 1.7, 0), look: new THREE.Vector3(0, 2.85, -10) } }
const cur = { pos: BASE[S.mode].pos.clone(), look: BASE[S.mode].look.clone() }
const from = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, to = { pos: cur.pos.clone(), look: cur.look.clone() }
let pt = 1, pendingPanel = null
function go(pos, look, instant) { from.pos.copy(cur.pos); from.look.copy(cur.look); to.pos.copy(pos); to.look.copy(look); pt = (reduce || instant) ? 1 : 0 }
function select(k, keepHash) {
  if (S.mode !== 'pc' || (k && !room)) return
  if (k && !listview.hidden) openList(false)
  S.sel = k; panel.hidden = true; pendingPanel = k; ui.classList.toggle('is-zoomed', !!k)
  if (k) {
    const t = room.terms[k], th = Math.tan(camera.fov * Math.PI / 360)
    const d = Math.max(t.sh / (2 * th * 0.68), t.sw / (2 * th * camera.aspect * 0.7), 0.6)
    go(t.center.clone().addScaledVector(t.normal, d), t.center)
  } else go(BASE.pc.pos, BASE.pc.look)
  if (!keepHash) setHash(k || '')
}
const fv = new THREE.Vector3()
function fitPanel() {
  const t = room && room.terms[S.sel]; if (!t) return
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    fv.set(sx ? t.bb.max.x : t.bb.min.x, sy ? t.bb.max.y : t.bb.min.y, t.bb.max.z)
    t.screen.localToWorld(fv); fv.project(camera)
    const x = (fv.x * 0.5 + 0.5) * W, y = (-fv.y * 0.5 + 0.5) * H
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  const st = panel.style
  st.left = x0.toFixed(1) + 'px'; st.top = y0.toFixed(1) + 'px'; st.width = (x1 - x0).toFixed(1) + 'px'; st.height = (y1 - y0).toFixed(1) + 'px'
  st.borderRadius = (0.017 / t.sw * (x1 - x0)).toFixed(1) + 'px'; st.fontSize = Math.max(11, Math.min(19, (y1 - y0) / 33)).toFixed(1) + 'px'
}
function setMode(m) {
  S.mode = m; ui.classList.toggle('is-phone', m === 'phone'); $('phone').hidden = m !== 'phone'
  if (room) room.group.visible = m === 'pc'
  if (m === 'phone') { S.sel = null; panel.hidden = true; listview.hidden = true; pendingPanel = null; ui.classList.remove('is-zoomed') } else { if (appOpen) closeApp(); ensureRoom() }
  go(BASE[m].pos, BASE[m].look, true)
  bloom.enabled = S.quality === 'high' && m === 'pc'
  for (const b of $('modeSeg').children) b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false')
  resize()
}
$('modeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m) })
function fromHash() {
  const h = location.hash.replace('#', ''); if (S.mode !== 'pc') return
  if (h === 'list') { if (listview.hidden) openList(true) } else if (ORDER.includes(h)) { if (S.sel !== h) select(h, true) } else { if (!listview.hidden) listview.hidden = true; if (S.sel) select(null, true) }
}
addEventListener('hashchange', fromHash)

// ------------------------------------------------------------------ window view: the glass fogs, then clears on another scene
let fogAnim = null
function applyScene(i) { S.scene = i; U.uScene.value = i; S.envDirty = true; syncScene(); try { localStorage.setItem('pirafu-proto-scene', String(i)) } catch { /* ignore */ } }
function setScene(i) { if (i === S.scene || fogAnim) return; if (reduce) { applyScene(i); return } fogAnim = { t: 0, to: i, done: false } }
syncScene()

// ------------------------------------------------------------------ pointer
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
let down = null
function pick(e) {
  if (!room) return null
  const r = canvas.getBoundingClientRect()
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1))
  ray.setFromCamera(ndc, camera)
  const h = ray.intersectObjects(room.hits, false)
  return h.length ? h[0].object.userData.term : null
}
canvas.addEventListener('pointermove', (e) => { S.tx = e.clientX / innerWidth * 2 - 1; S.ty = e.clientY / innerHeight * 2 - 1; if (S.mode === 'pc' && !S.sel) { const k = pick(e); S.hover = k; canvas.style.cursor = k ? 'pointer' : '' } })
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY } })
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8) { down = null; return }
  down = null
  if (S.mode === 'phone') { if (!appOpen) setScene((S.scene + 1) % 3); return }
  if (S.sel) { select(null); return }
  if (!listview.hidden) { openList(false); return }
  const k = pick(e)
  if (k) select(k); else setScene((S.scene + 1) % 3)
})

// ------------------------------------------------------------------ prototype controls
const range = $('timeRange')
range.addEventListener('input', () => { S.auto = false; S.hour = +range.value })
$('nowBtn').addEventListener('click', () => { S.auto = true })
function setQuality(q, byUser) {
  S.quality = q; if (byUser) S.qualityByUser = true
  const high = q === 'high' && S.mode === 'pc'
  bloom.enabled = high
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = high ? 4 : 0; rt.dispose() }
  if (room) room.setQuality(q)
  for (const b of $('qualitySeg').children) b.setAttribute('aria-pressed', b.dataset.q === q ? 'true' : 'false')
  resize()
}
$('qualitySeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.q, true) })

// ------------------------------------------------------------------ size
let W = 1, H = 1
const db = new THREE.Vector2()
function resize() {
  W = innerWidth; H = innerHeight
  // cap the number of shaded pixels rather than the ratio, so large or dense displays do not multiply the cost
  const budget = S.mode === 'phone' ? 1.6e6 : (S.quality === 'high' ? 2.6e6 : 1.4e6)
  const pr = Math.max(0.75, Math.min(devicePixelRatio || 1, Math.sqrt(budget / (W * H)), 2))
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false)
  composer.setPixelRatio(pr); composer.setSize(W, H)
  const a = W / H; camera.aspect = a
  if (S.mode === 'phone') camera.fov = a < 1 ? 64 : 52
  else camera.fov = Math.max(40, Math.min(78, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(33)) / a) * 180 / Math.PI))
  camera.updateProjectionMatrix()
  renderer.getDrawingBufferSize(db)
  if (room) room.setSize(db.x, db.y)
}
addEventListener('resize', resize)

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock(), v3 = new THREE.Vector3()
let frame = 0, acc = 0, accN = 0, probe = { n: 0, t: 0 }
function hud() {
  const d = new Date(), hh = S.auto ? fmt(nowHour()) : fmt(S.hour)
  $('capSub').textContent = room || S.mode === 'phone' ? `${hh}${WIDE}灯っている端末 ${LIT} / ${ORDER.length}` : '空間を読み込んでいます'
  $('phTime').textContent = hh; $('phPhase').textContent = phaseName(S.hour)
  $('phDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${'日月火水木金土'.charAt(d.getDay())}曜日`
  $('timeOut').textContent = fmt(S.hour); if (S.auto) range.value = S.hour.toFixed(2)
  if (accN) {
    const ms = acc / accN * 1000, info = renderer.info.render
    $('perf').textContent = `${(1000 / ms).toFixed(0)} fps（${ms.toFixed(1)} ms）${WIDE}描画 ${info.calls} 回${WIDE}${Math.round(info.triangles / 1000)}千ポリゴン`
    acc = 0; accN = 0
  }
}
function tick() {
  requestAnimationFrame(tick)
  const dt = Math.min(clock.getDelta(), 0.1)
  U.uTime.value += dt; frame++; acc += dt; accN++
  if (S.auto) S.hour = nowHour()
  applyTime(S.hour)
  if ((P.night > 0.5) !== (S.night > 0.5) || S.night < 0) document.documentElement.dataset.theme = P.night > 0.5 ? 'dark' : 'light'
  S.night = P.night
  renderer.toneMappingExposure = P.exp
  if (frame % 30 === 1) hud()
  if (fogAnim) {
    fogAnim.t += dt
    const a = fogAnim.t
    if (a < 0.5) S.fog = ease(a / 0.5)
    else { if (!fogAnim.done) { applyScene(fogAnim.to); fogAnim.done = true } S.fog = 1 - ease(Math.min(1, (a - 0.5) / 0.95)); if (a >= 1.45) { S.fog = 0; fogAnim = null } }
  }
  U.uFog.value = S.fog
  if (pt < 1) pt = Math.min(1, pt + dt / 0.95)
  const e = ease(pt)
  cur.pos.lerpVectors(from.pos, to.pos, e); cur.look.lerpVectors(from.look, to.look, e)
  if (pt >= 1 && pendingPanel) { showPanel(pendingPanel); pendingPanel = null }
  S.px += (S.tx - S.px) * Math.min(1, dt * 2.5); S.py += (S.ty - S.py) * Math.min(1, dt * 2.5)
  const par = reduce ? 0 : (S.mode === 'pc' ? (S.sel ? 0 : 1) : 0.25)
  camera.position.copy(cur.pos); camera.position.x += S.px * 0.5 * par; camera.position.y -= S.py * 0.18 * par; camera.lookAt(cur.look)
  camera.updateMatrixWorld()
  U.uCamY.value = camera.position.y + 0.3
  if (S.sel && !panel.hidden) fitPanel()
  renderer.info.reset()
  if (room && S.mode === 'pc') {
    room.update(dt, S)
    S.envDirty = false
    for (const k of ORDER) {
      const t = room.terms[k], el = labelEls[k]
      v3.copy(t.anchor).project(camera)
      el.style.transform = `translate(-50%,-100%) translate(${((v3.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * H).toFixed(1)}px)`
      el.classList.toggle('is-hover', S.hover === k)
    }
    // the floor's reflection is redrawn every frame while the camera moves, every other frame at rest
    const moving = pt < 1 || Math.abs(S.tx - S.px) + Math.abs(S.ty - S.py) > 0.004 || fogAnim
    if (moving || frame % 2 === 0) room.renderReflection(cur.look)
    // drop to the light settings once if this machine cannot hold the full ones
    if (!S.qualityByUser && S.quality === 'high' && document.visibilityState === 'visible') {
      probe.n++
      if (probe.n > 45) probe.t += dt
      if (probe.n === 165) { if (probe.t / 120 > 0.03) setQuality('low', false); probe.n = 1e9 }
    }
  }
  composer.render(dt)
}
if (import.meta.env.DEV) window.__proto = { THREE, renderer, composer, bloom, scene, camera, S, U, P, applyScene, get room() { return room } }
setMode(S.mode)
setQuality(S.quality, false)
applyTime(S.hour)
hud()
tick()
