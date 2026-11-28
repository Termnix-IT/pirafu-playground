// The 3D side of the lobby: sky, room, camera and the render loop. The web UI never waits for anything here.
//
// Loading: the sky's program is compiled in the background, then (if the room is wanted) the model is fetched
// and its programs are compiled in the background too. Nothing is drawn before its programs are ready, because
// a program that is compiled on first use blocks the whole page. The page shows a still image meanwhile, and
// `onStatus('ready' | 'sky')` is sent only after a real frame of what was asked for has been drawn, so the
// still can be swapped out without a gap.
//
// Drawing: the lobby is not an action game. At rest it draws 30 frames a second, which the slow clouds and
// water do not show; while the camera or the pointer moves it draws 60. The size of the drawing buffer follows
// a pixel budget per quality level and is independent of the web UI, which always stays at full resolution.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { U, P, applyTime, createDome, setScene as setSkyScene } from './space/sky.js'
import { roomFov } from './view.js'

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// The lobby view keeps the terminals, the windows and the open floor in the middle of the screen: the UI sits
// on the outer edges, and the floor in front is where exhibits will stand later.
const BASE = {
  room: { pos: new THREE.Vector3(0.9, 1.72, 9.6), look: new THREE.Vector3(-0.2, 2.0, -6) },
  sky: { pos: new THREE.Vector3(0, 1.7, 0), look: new THREE.Vector3(0, 2.85, -10) },
  // On an upright phone the cards fill the lower half, so the view tilts down: the horizon and its clouds
  // come up into the free part of the screen, and the water or the sea of cloud runs on behind the cards.
  skyTall: { pos: new THREE.Vector3(0, 1.7, 0), look: new THREE.Vector3(0, -0.5, -10) },
}

// Per quality level: how many pixels may be shaded, multisampling, the glow of lamps, and frames per second
// while something moves and at rest. What the room itself draws at each level is in space/room.js (QUALITY).
const LEVELS = {
  high: { pixels: 2.6e6, samples: 4, bloom: true, fps: [60, 30] },
  standard: { pixels: 1.8e6, samples: 4, bloom: true, fps: [60, 30] },
  low: { pixels: 1.1e6, samples: 0, bloom: false, fps: [30, 24] },
}
const STEP_DOWN = { high: 'standard', standard: 'low' }

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {Record<string, object>} o.terminals what each 3D terminal shows (title, color, img), keyed by terminal
 * @param {string[]} o.order terminal keys
 * @param {Record<string, HTMLElement>} o.tags small labels that follow the terminals on screen
 * @param {() => number} o.hour the hour to draw, 0-24
 * @param {() => boolean} o.reduced whether motion should be reduced right now
 * @param {object | null} o.shoot set when a still is being photographed: { fov } fixes the view and lifts every limit
 * @param {boolean} o.uncapped draw as often as the browser allows, to measure what a frame costs (scripts/measure.mjs)
 * @param {(key: string | null) => void} o.onHover
 * @param {(key: string) => void} o.onPick
 * @param {(status: 'loading' | 'sky' | 'ready' | 'failed' | 'lost', detail?: object) => void} o.onStatus
 *   'loading' carries { step: 'sky' | 'download' | 'build', loaded, total }: bytes are reported only when they are known
 * @param {(level: string) => void} o.onLevel the quality level in use changed
 */
export function createStage({ canvas, terminals, order, tags, hour, reduced, shoot = null, uncapped = false, onHover, onPick, onStatus, onLevel }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.info.autoReset = false
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600)
  scene.add(createDome())

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }))
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.11, 0.42, 0.97)   // lamps, screens and the sun only; the web UI never glows
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // S.hover and S.sel are read by room.update() to brighten a terminal; S.scene and S.envDirty drive its sky light.
  const S = { scene: 0, fog: 0, wantRoom: false, sel: null, hover: null, px: 0, py: 0, tx: 0, ty: 0, level: 'high', auto: true, envDirty: false, sheet: 0, picking: true }
  let room = null, roomPromise = null
  let W = 1, H = 1

  const showsRoom = () => S.wantRoom && !!room
  const base = () => (showsRoom() ? BASE.room : (innerWidth < innerHeight ? BASE.skyTall : BASE.sky))
  const cur = { pos: BASE.sky.pos.clone(), look: BASE.sky.look.clone() }
  const from = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  const to = { pos: cur.pos.clone(), look: cur.look.clone() }
  let pt = 1, travel = 0.9

  // A move always starts from where the camera is now, so choosing another area mid-flight bends the path
  // instead of restarting it. Short hops take less time than the long way from the lobby view.
  function go(pos, look, instant) {
    from.pos.copy(cur.pos); from.look.copy(cur.look); to.pos.copy(pos); to.look.copy(look)
    travel = THREE.MathUtils.clamp(0.55 + from.pos.distanceTo(pos) * 0.045, 0.6, 1.0)
    pt = reduced() || instant || shoot ? 1 : 0
  }

  // Frames one terminal in the part of the screen that the sheet (docked on the right) leaves free.
  const right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0)
  function aim(instant) {
    const t = showsRoom() && S.sel ? room.terms[S.sel] : null
    if (!t) { go(base().pos, base().look, instant); return }
    const th = Math.tan(camera.fov * Math.PI / 360)
    const free = Math.max(0.35, 1 - S.sheet / W)
    // far enough that the desk and what stands on it stay in the picture, not the screen alone
    const d = Math.max(t.sh / (2 * th * 0.3), t.sw / (2 * th * camera.aspect * free * 0.36), 1.5)
    const pos = t.center.clone().addScaledVector(t.normal, d)
    pos.y = t.center.y + 0.22
    right.crossVectors(t.normal, UP).negate().normalize()
    const look = t.center.clone().addScaledVector(right, (S.sheet / W) * d * th * camera.aspect)
    look.y -= 0.12
    go(pos, look, instant)
  }

  // ---------------------------------------------------------------- status
  // skyLive / roomLive: the programs of that part are compiled. compiling: a compile is running, so nothing may
  // be drawn. shown: a frame of what is wanted now has reached the screen.
  let skyLive = false, roomLive = false, compiling = 0, failed = false, lost = false, shown = false, paused = false
  let progress = { step: 'sky', loaded: 0, total: 0 }
  const drawable = () => !compiling && !lost && (S.wantRoom && !failed ? roomLive : skyLive)
  function report() {
    if (lost) onStatus('lost')
    else if (S.wantRoom && failed) onStatus('failed')
    else if (!drawable() || !shown) onStatus('loading', progress)
    else onStatus(S.wantRoom ? 'ready' : 'sky')
  }

  // ---------------------------------------------------------------- compiling without freezing the page
  // Programs are compiled for the render target the composer draws into: the same material gets a different
  // program when it is drawn straight to the canvas.
  async function warm() {
    compiling++
    renderer.setRenderTarget(composer.renderTarget1)
    const done = renderer.compileAsync(scene, camera)
    renderer.setRenderTarget(null)
    try { await done } finally { compiling-- }
  }

  function ensureRoom() {
    if (roomPromise) return roomPromise
    progress = { step: 'download', loaded: 0, total: 0 }
    roomPromise = Promise.all([
      import('./space/room.js').then((m) => m.createRoom({
        renderer, scene, camera, works: terminals, order,
        onProgress(loaded, total) { if (!room) { progress = { step: 'download', loaded, total }; report() } },
      })),
      skyWarm,
    ]).then(async ([r]) => {
      room = r
      progress = { step: 'build', loaded: 0, total: 0 }
      report()
      room.group.visible = true
      applyLevel()
      room.forceEnv()               // lights and sky light first, so the programs are built for the state they are drawn in
      room.update(0, S)
      await warm()
      room.group.visible = S.wantRoom
      applyLevel()
      aim(true)
      roomLive = true
      shown = false
      wake(3000)                    // long enough for the automatic quality check to see how this machine draws
      return r
    }).catch((err) => { console.error(err); failed = true; roomPromise = null; shown = false; wake(); report() })
    return roomPromise
  }

  function resize() {
    W = innerWidth; H = innerHeight
    const level = LEVELS[S.level]
    // cap the number of shaded pixels rather than the ratio, so large or dense displays do not multiply the cost
    const budget = showsRoom() ? level.pixels : 1.6e6
    const pr = shoot ? 1 : Math.max(0.6, Math.min(devicePixelRatio || 1, Math.sqrt(budget / (W * H)), 2))
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false)
    composer.setPixelRatio(pr); composer.setSize(W, H)
    const a = W / H
    camera.aspect = a
    if (shoot) camera.fov = shoot.fov
    else if (!showsRoom()) camera.fov = a < 1 ? 64 : 52
    else camera.fov = roomFov(a)
    camera.updateProjectionMatrix()
    if (room) { const db = renderer.getDrawingBufferSize(new THREE.Vector2()); room.setSize(db.x, db.y) }
  }
  addEventListener('resize', () => { resize(); aim(true); wake() })

  function applyLevel() {
    const level = LEVELS[S.level]
    const on = showsRoom()
    bloom.enabled = on && level.bloom
    const samples = on ? level.samples : 0
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) { if (rt.samples !== samples) { rt.samples = samples; rt.dispose() } }
    if (room) room.setQuality(S.level)
    resize()
  }

  // ---------------------------------------------------------------- window view: the glass fogs, then clears on another scene
  let fogAnim = null
  function applyScene(i) { S.scene = i; setSkyScene(i); S.envDirty = true }
  function setScene(i, instant) {
    if (i === S.scene && !fogAnim) return
    if (reduced() || instant || !shown) { fogAnim = null; S.fog = 0; applyScene(i); wake(); return }
    fogAnim = { t: 0, to: i, done: false }
    wake()
  }

  // ---------------------------------------------------------------- pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let down = null
  function pick(e) {
    if (!showsRoom() || !S.picking || !shown) return null
    const r = canvas.getBoundingClientRect()
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1))
    ray.setFromCamera(ndc, camera)
    const h = ray.intersectObjects(room.hits, false)
    return h.length ? h[0].object.userData.term : null
  }
  function hover(k) { if (S.hover === k) return; S.hover = k; canvas.style.cursor = k ? 'pointer' : ''; onHover(k); wake() }
  canvas.addEventListener('pointermove', (e) => {
    S.tx = e.clientX / innerWidth * 2 - 1; S.ty = e.clientY / innerHeight * 2 - 1
    wake()
    if (e.pointerType === 'mouse') hover(pick(e))
  })
  canvas.addEventListener('pointerleave', () => hover(null))
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerup', (e) => {
    const moved = !down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8
    down = null
    if (moved) return
    const k = pick(e)
    if (k) onPick(k)
  })

  // ---------------------------------------------------------------- losing the graphics context
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; shown = false; report() })
  canvas.addEventListener('webglcontextrestored', () => {
    // three.js rebuilds its own state; the programs are compiled again before drawing resumes
    lost = false
    warm().then(() => wake())
    report()
  })

  // ---------------------------------------------------------------- loop
  const v3 = new THREE.Vector3()
  let frame = 0, last = performance.now(), lastDraw = 0, activeUntil = 0
  const perf = { drawn: 0, since: performance.now(), perSecond: 0 }
  // the automatic choice: a slow run of frames while the lobby is asking for 60 a second steps the level down once
  const probe = { n: 0, slow: 0, settle: 0 }
  /** Asks for full-rate drawing for a moment: something on screen is about to change. */
  function wake(ms = 1200) { activeUntil = Math.max(activeUntil, performance.now() + ms) }

  function tick(now) {
    requestAnimationFrame(tick)
    if (paused || !drawable() || document.hidden) { last = now; return }
    const level = LEVELS[S.level]
    const moving = pt < 1 || !!fogAnim || now < activeUntil
    const target = shoot || uncapped ? 1000 : level.fps[moving ? 0 : 1]
    if (now - lastDraw < 1000 / target - 3) return
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1)
    last = now
    const sinceDraw = now - lastDraw
    lastDraw = now
    U.uTime.value += dt; frame++
    applyTime(hour())
    renderer.toneMappingExposure = P.exp
    if (fogAnim) {
      fogAnim.t += dt
      const a = fogAnim.t
      if (a < 0.5) S.fog = ease(a / 0.5)
      else {
        if (!fogAnim.done) { applyScene(fogAnim.to); fogAnim.done = true }
        S.fog = 1 - ease(Math.min(1, (a - 0.5) / 0.95))
        if (a >= 1.45) { S.fog = 0; fogAnim = null }
      }
    }
    U.uFog.value = S.fog
    if (pt < 1) pt = Math.min(1, pt + dt / travel)
    const e = ease(pt)
    cur.pos.lerpVectors(from.pos, to.pos, e); cur.look.lerpVectors(from.look, to.look, e)
    S.px += (S.tx - S.px) * Math.min(1, dt * 2.5); S.py += (S.ty - S.py) * Math.min(1, dt * 2.5)
    if (Math.abs(S.tx - S.px) + Math.abs(S.ty - S.py) > 0.004) wake(300)
    const par = reduced() || shoot ? 0 : (showsRoom() ? (S.sel ? 0.25 : 1) : 0.25)
    camera.position.copy(cur.pos); camera.position.x += S.px * 0.42 * par; camera.position.y -= S.py * 0.15 * par
    camera.lookAt(cur.look)
    camera.updateMatrixWorld()
    U.uCamY.value = camera.position.y + 0.3
    renderer.info.reset()
    if (showsRoom()) {
      room.update(dt, S)
      S.envDirty = false
      for (const k of order) {
        const el = tags[k]
        if (!el) continue
        const t = room.terms[k]
        v3.set(t.center.x, t.center.y + t.sh * 0.5 + 0.2, t.center.z).project(camera)   // just above the screen
        el.style.transform = `translate(-50%,-100%) translate(${((v3.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * H).toFixed(1)}px)`
      }
      // the floor's reflection is redrawn every frame while something moves, every other frame at rest
      if (moving || frame % 2 === 0) room.renderReflection(cur.look)
      // Automatic quality: only while 60 frames a second are being asked for, and not in the first moments
      // after a change. A second of mostly slow frames steps down one level. It never steps back up by itself,
      // so the level cannot flicker between two settings.
      if (S.auto && !shoot && !uncapped && moving && STEP_DOWN[S.level]) {
        if (probe.settle < 40) probe.settle++
        else { probe.n++; if (sinceDraw > 24) probe.slow++ }
        if (probe.n >= 60) {
          if (probe.slow > 36) { S.level = STEP_DOWN[S.level]; applyLevel(); onLevel?.(S.level); probe.settle = 0 }
          probe.n = 0; probe.slow = 0
        }
      }
    }
    composer.render(dt)
    perf.drawn++
    if (now - perf.since >= 1000) { perf.perSecond = Math.round(perf.drawn * 1000 / (now - perf.since)); perf.drawn = 0; perf.since = now }
    if (!shown) { shown = true; report() }
  }

  const stage = {
    /** Shows the room (downloading it on first use) or the sky alone. */
    setRoom(want) {
      if (want !== S.wantRoom) shown = false
      S.wantRoom = want
      if (room) room.group.visible = want
      if (want && !failed) ensureRoom()
      applyLevel()
      aim(true)
      wake()
      report()
    },
    /** Tries the room again after a failed load. */
    retry() { if (!failed) return; failed = false; shown = false; stage.setRoom(S.wantRoom) },
    /** Moves the camera to a terminal, or back to the lobby view with null. */
    focus(key, instant) { if (S.sel === key && !instant) return; S.sel = key; aim(instant); wake() },
    /** Width in px that the docked sheet covers on the right, so the terminal is framed beside it. */
    setSheet(px) { if (px === S.sheet) return; S.sheet = px; if (S.sel) aim(pt >= 1) },
    /** Shows a work's image on a terminal's screen. Does nothing until the room exists. */
    setScreen(key, src) { room?.setScreen(key, src); wake() },
    setScene,
    /** 'auto' starts at the best level (or at start, the level it settled on earlier in this session) and steps down if this machine cannot keep up; any other level is kept as chosen. */
    setQuality(level, start = null) {
      S.auto = level === 'auto'
      S.level = S.auto ? (LEVELS[start] ? start : 'high') : level
      probe.n = probe.slow = probe.settle = 0
      applyLevel()
      wake(3000)
      onLevel?.(S.level)
    },
    /** Stops drawing altogether (the still-image mode), or resumes it. The loaded space is kept, so coming back is immediate. */
    pause(on) { paused = on; if (!on) wake() },
    /** Terminals react to the pointer only in the lobby view. */
    setPicking(on) { S.picking = on; if (!on) hover(null) },
    wake,
    get level() { return S.level },
    debug: { THREE, renderer, scene, camera, S, U, P, get room() { return room }, get drawnPerSecond() { return perf.perSecond } },
  }
  setSkyScene(S.scene)
  resize()
  applyTime(hour())
  const skyWarm = warm().then(() => { skyLive = true; wake() })
  report()
  requestAnimationFrame(tick)
  return stage
}
