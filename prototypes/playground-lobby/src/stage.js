// The 3D side of the lobby: sky, room, camera and the render loop.
// The sky and the room come from prototypes/playground-3d unchanged, so work on that space shows up here as it is.
// room.js (and with it the GLB) is imported only when the room is wanted; phones get the sky alone.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { U, P, applyTime, createDome } from '../../playground-3d/src/sky.js'

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

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {Record<string, object>} o.terminals what each 3D terminal shows (title, color, img), keyed by terminal
 * @param {string[]} o.order terminal keys
 * @param {Record<string, HTMLElement>} o.tags small labels that follow the terminals on screen
 * @param {() => number} o.hour the hour to draw, 0-24
 * @param {() => boolean} o.reduced whether motion should be reduced right now
 * @param {(key: string | null) => void} o.onHover
 * @param {(key: string) => void} o.onPick
 * @param {(status: 'sky' | 'loading' | 'ready' | 'failed') => void} o.onStatus
 */
export function createStage({ canvas, terminals, order, tags, hour, reduced, onHover, onPick, onStatus }) {
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
  const S = { scene: 0, fog: 0, wantRoom: false, sel: null, hover: null, px: 0, py: 0, tx: 0, ty: 0, quality: 'high', qualityByUser: false, envDirty: false, sheet: 0, picking: true }
  let room = null, roomPromise = null, failed = false
  let W = 1, H = 1

  const showsRoom = () => S.wantRoom && !!room
  const base = () => (showsRoom() ? BASE.room : (innerWidth < innerHeight ? BASE.skyTall : BASE.sky))
  const cur = { pos: BASE.sky.pos.clone(), look: BASE.sky.look.clone() }
  const from = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  const to = { pos: cur.pos.clone(), look: cur.look.clone() }
  let pt = 1

  function go(pos, look, instant) {
    from.pos.copy(cur.pos); from.look.copy(cur.look); to.pos.copy(pos); to.look.copy(look)
    pt = reduced() || instant ? 1 : 0
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

  // ---------------------------------------------------------------- compiling without freezing the page
  // A browser that has never drawn this space (no shader cache yet) needs tens of seconds on Windows to compile
  // the sky's shader and the room's materials. Drawn straight away, that compile blocks the whole page, UI
  // included. So nothing is drawn until its programs are ready: they are compiled in the background
  // (KHR_parallel_shader_compile), for the render target the composer draws into, while the UI stays usable.
  let live = false, skyLive = false, roomLive = false
  // 'loading' until what was asked for can be drawn; then 'ready' (the room) or 'sky' (the sky alone); 'failed' if the room could not be loaded
  function report() { onStatus(!skyLive || (S.wantRoom && !roomLive && !failed) ? 'loading' : S.wantRoom && failed ? 'failed' : S.wantRoom ? 'ready' : 'sky') }
  const mirrorPlane = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)], noPlanes = [], nothing = new THREE.Scene()
  async function warm() {
    renderer.setRenderTarget(composer.renderTarget1)
    const main = renderer.compileAsync(scene, camera)
    renderer.setRenderTarget(null)
    await main
    if (!room) return
    // The floor's reflection draws the room through one clipping plane, which makes a second set of programs.
    // Drawing an empty scene with that plane leaves the renderer in the same state, so compile() builds them.
    renderer.setRenderTarget(composer.renderTarget1)
    renderer.clippingPlanes = mirrorPlane
    renderer.render(nothing, camera)
    const mirrored = renderer.compileAsync(scene, camera)
    renderer.clippingPlanes = noPlanes
    renderer.render(nothing, camera)
    renderer.setRenderTarget(null)
    await mirrored
  }

  function ensureRoom() {
    if (roomPromise) return roomPromise
    roomPromise = Promise.all([
      import('../../playground-3d/src/room.js').then((m) => m.createRoom({ renderer, scene, camera, works: terminals, order })),
      skyWarm,
    ]).then(async ([r]) => {
      room = r
      live = false                  // the sky holds its last frame while the room's programs compile
      room.group.visible = true
      applyQuality()
      room.forceEnv()               // lights and sky light first, so the programs are built for the state they are drawn in
      room.update(0, S)
      await warm()
      room.group.visible = S.wantRoom
      applyQuality()
      aim(true)
      live = true
      roomLive = true
      report()
      return r
    }).catch((err) => { console.error(err); failed = true; live = skyLive; report() })
    return roomPromise
  }

  function resize() {
    W = innerWidth; H = innerHeight
    // cap the number of shaded pixels rather than the ratio, so large or dense displays do not multiply the cost
    const budget = !showsRoom() ? 1.6e6 : (S.quality === 'high' ? 2.6e6 : 1.4e6)
    const pr = Math.max(0.75, Math.min(devicePixelRatio || 1, Math.sqrt(budget / (W * H)), 2))
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false)
    composer.setPixelRatio(pr); composer.setSize(W, H)
    const a = W / H
    camera.aspect = a
    if (!showsRoom()) camera.fov = a < 1 ? 64 : 52
    else camera.fov = Math.max(40, Math.min(78, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(33)) / a) * 180 / Math.PI))
    camera.updateProjectionMatrix()
    if (room) { const db = renderer.getDrawingBufferSize(new THREE.Vector2()); room.setSize(db.x, db.y) }
  }
  addEventListener('resize', () => { resize(); aim(true) })

  function applyQuality() {
    const high = S.quality === 'high' && showsRoom()
    bloom.enabled = high
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) { if (rt.samples !== (high ? 4 : 0)) { rt.samples = high ? 4 : 0; rt.dispose() } }
    if (room) room.setQuality(S.quality)
    resize()
  }

  // ---------------------------------------------------------------- window view: the glass fogs, then clears on another scene
  let fogAnim = null
  function applyScene(i) { S.scene = i; U.uScene.value = i; S.envDirty = true }
  function setScene(i, instant) {
    if (i === S.scene && !fogAnim) return
    if (reduced() || instant) { fogAnim = null; S.fog = 0; applyScene(i); return }
    fogAnim = { t: 0, to: i, done: false }
  }

  // ---------------------------------------------------------------- pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let down = null
  function pick(e) {
    if (!showsRoom() || !S.picking) return null
    const r = canvas.getBoundingClientRect()
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1))
    ray.setFromCamera(ndc, camera)
    const h = ray.intersectObjects(room.hits, false)
    return h.length ? h[0].object.userData.term : null
  }
  function hover(k) { if (S.hover === k) return; S.hover = k; canvas.style.cursor = k ? 'pointer' : ''; onHover(k) }
  canvas.addEventListener('pointermove', (e) => {
    S.tx = e.clientX / innerWidth * 2 - 1; S.ty = e.clientY / innerHeight * 2 - 1
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

  // ---------------------------------------------------------------- loop
  const v3 = new THREE.Vector3()
  let frame = 0, last = performance.now(), probe = { n: 0, t: 0 }, perf = { acc: 0, n: 0, ms: 0 }
  function tick(now) {
    requestAnimationFrame(tick)
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1)
    last = now
    U.uTime.value += dt; frame++
    perf.acc += dt; perf.n++
    if (perf.n === 30) { perf.ms = perf.acc / perf.n * 1000; perf.acc = 0; perf.n = 0 }
    applyTime(hour())
    renderer.toneMappingExposure = P.exp
    if (!live) return
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
    if (pt < 1) pt = Math.min(1, pt + dt / 1.05)
    const e = ease(pt)
    cur.pos.lerpVectors(from.pos, to.pos, e); cur.look.lerpVectors(from.look, to.look, e)
    S.px += (S.tx - S.px) * Math.min(1, dt * 2.5); S.py += (S.ty - S.py) * Math.min(1, dt * 2.5)
    const par = reduced() ? 0 : (showsRoom() ? (S.sel ? 0.25 : 1) : 0.25)
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
      // the floor's reflection is redrawn every frame while the camera moves, every other frame at rest
      const moving = pt < 1 || Math.abs(S.tx - S.px) + Math.abs(S.ty - S.py) > 0.004 || fogAnim
      if (moving || frame % 2 === 0) room.renderReflection(cur.look)
      // drop to the light settings once if this machine cannot hold the full ones
      if (!S.qualityByUser && S.quality === 'high' && document.visibilityState === 'visible') {
        probe.n++
        if (probe.n > 45) probe.t += dt
        if (probe.n === 165) { if (probe.t / 120 > 0.03) { S.quality = 'low'; applyQuality(); stage.onAutoQuality?.('low') } probe.n = 1e9 }
      }
    }
    composer.render(dt)
  }

  const stage = {
    /** Shows the room (downloading it on first use) or the sky alone. */
    setRoom(want) {
      S.wantRoom = want
      if (want && !failed) ensureRoom()
      if (room) room.group.visible = want
      report()
      applyQuality()
      aim(true)
    },
    /** Moves the camera to a terminal, or back to the lobby view with null. */
    focus(key, instant) { S.sel = key; aim(instant) },
    /** Width in px that the docked sheet covers on the right, so the terminal is framed beside it. */
    setSheet(px) { if (px === S.sheet) return; S.sheet = px; aim(pt >= 1 && !S.sel) },
    setScene,
    setQuality(q, byUser) { S.quality = q; if (byUser) S.qualityByUser = true; applyQuality() },
    /** Terminals react to the pointer only in the lobby view. */
    setPicking(on) { S.picking = on; if (!on) hover(null) },
    get quality() { return S.quality },
    get frameMs() { return perf.ms },
    onAutoQuality: null,
    debug: { THREE, renderer, scene, camera, S, U, P, get room() { return room } },
  }
  U.uScene.value = S.scene
  resize()
  applyTime(hour())
  const skyWarm = warm().then(() => { live = true; skyLive = true; canvas.classList.add('is-live'); report() })
  requestAnimationFrame(tick)
  return stage
}
