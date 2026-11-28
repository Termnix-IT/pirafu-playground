// The room: loads the web copy of the GLB (scripts/optimize-space.mjs) and gives it light, reflection and screens.
// Taken from prototypes/playground-3d/src/room.js and changed where the lobby needed it to load and draw faster:
//   - the floor's mirror image is cut at the floor by the mirror camera's own near plane, not by a clipping
//     plane. A clipping plane made three.js build a second copy of every shader program.
//   - the lamps keep their place in the light list by day (at zero strength) instead of being switched off,
//     so nothing is recompiled when evening comes.
//   - a terminal's screen shows the work's key visual alone; words about the work belong to the web UI.
//   - how much is drawn follows a quality level (see QUALITY).
// Loaded only when the room is wanted, so phones and the still-image mode never download it.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { U, P, SKY_GLSL, createDome } from './sky.js'

const ASSETS = import.meta.env.BASE_URL + 'assets/'
// Extent of the floor mesh in three.js coordinates, used to look up its AO map (see build_scene.py: FX, FY0, FY1).
const FLOOR = { x0: -9.1, x1: 9.1, z0: -25, z1: 13 }
// Balance between the sun and the sky's fill light. A lower fill keeps shade readable instead of washing it out.
const SUN_GAIN = 0.8
const ENV_GAIN = 0.95

// What each quality level draws. `reflection` is the size of the floor's mirror image relative to the screen,
// `shadow` the size of the sun's shadow map, `refraction` whether glass bends what is behind it (an extra pass
// over the room), `clouds` whether the clouds shade themselves.
export const QUALITY = {
  high: { reflection: 0.5, shadow: 4096, refraction: true, clouds: true },
  standard: { reflection: 0.4, shadow: 2048, refraction: true, clouds: true },
  low: { reflection: 0.3, shadow: 1024, refraction: false, clouds: false },
}

function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b)
  return '#' + ca.lerp(cb, t).getHexString()
}

/**
 * @param {object} o
 * @param {(loaded: number, total: number) => void} [o.onProgress] bytes of the model received; total is 0 when the server does not say
 */
export async function createRoom({ renderer, scene, camera, works, order, onProgress }) {
  const loader = new GLTFLoader()
  const tex = new THREE.TextureLoader()
  const [gltf, aoRoom, aoTerms, aoFloor, wood] = await Promise.all([
    loader.loadAsync(ASSETS + 'space.glb', (e) => onProgress?.(e.loaded, e.lengthComputable ? e.total : 0)),
    tex.loadAsync(ASSETS + 'ao_room.webp'),
    tex.loadAsync(ASSETS + 'ao_terms.webp'),
    tex.loadAsync(ASSETS + 'ao_floor.webp'),
    tex.loadAsync(ASSETS + 'wood_ash.webp'),
  ])
  for (const t of [aoRoom, aoTerms]) { t.flipY = false; t.channel = 1 }   // glTF UV convention, second UV set
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  aoFloor.anisotropy = Math.min(8, maxAniso)
  // the wood grain comes as a file of its own (see scripts/optimize-space.mjs) and is put back on its material here
  wood.flipY = false; wood.colorSpace = THREE.SRGBColorSpace; wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.anisotropy = Math.min(8, maxAniso)

  const room = new THREE.Group()
  room.add(gltf.scene)
  scene.add(room)

  // ---------- environment light from the live sky ----------
  const skyScene = new THREE.Scene()
  skyScene.add(createDome())
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType })
  const cubeCam = new THREE.CubeCamera(0.1, 10, cubeRT)
  const pmrem = new THREE.PMREMGenerator(renderer)
  let envRT = null
  let envStamp = { hour: -99, scene: -1, at: 0 }
  function updateEnv(now, sceneIndex, force) {
    if (!force && now - envStamp.at < 0.3) return
    if (!force && Math.abs(P.hour - envStamp.hour) < 0.04 && envStamp.scene === sceneIndex) return
    const detail = U.uDetail.value, fog = U.uFog.value
    U.uEnv.value = 1; U.uDetail.value = 0; U.uFog.value = 0
    cubeCam.update(renderer, skyScene)
    U.uEnv.value = 0; U.uDetail.value = detail; U.uFog.value = fog
    const next = pmrem.fromCubemap(cubeRT.texture)
    scene.environment = next.texture
    if (envRT) envRT.dispose()
    envRT = next
    envStamp = { hour: P.hour, scene: sceneIndex, at: now }
  }

  // ---------- floor: polished stone with a planar reflection ----------
  const reflRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
  const uRes = { value: new THREE.Vector2(1, 1) }
  const uDirect = { value: new THREE.Vector2(0.5, 1) }
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc9d3de, roughness: 0.3, metalness: 0, envMapIntensity: 0.2 })
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.tRefl = { value: reflRT.texture }
    sh.uniforms.tAO = { value: aoFloor }
    sh.uniforms.uRes = uRes
    sh.uniforms.uDirect = uDirect
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP=(modelMatrix*vec4(position,1.)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;uniform sampler2D tAO;uniform vec2 uRes;uniform vec2 uDirect;varying vec3 vWP;')
      .replace('#include <opaque_fragment>', /* glsl */ `
        vec2 suv=gl_FragCoord.xy/uRes;suv.y=1.-suv.y;
        // stone slabs: fine joints that fade with distance
        vec2 tg=vWP.xz/vec2(1.2,2.4);vec2 gw=max(fwidth(tg),vec2(1e-4));vec2 gl2=abs(fract(tg-.5)-.5)/gw;
        float line=(1.-clamp(min(gl2.x,gl2.y),0.,1.))*clamp(1.-length(vViewPosition)/34.,0.,1.);
        float ndv=clamp(dot(normalize(vViewPosition),normal),0.,1.);
        float fr=mix(.1,.82,pow(1.-ndv,2.6));
        vec2 px=1.5/uRes;
        vec3 rf=(texture2D(tRefl,suv).rgb*2.+texture2D(tRefl,suv+vec2(px.x*2.,0.)).rgb+texture2D(tRefl,suv-vec2(px.x*2.,0.)).rgb
          +texture2D(tRefl,suv+vec2(0.,px.y*3.)).rgb+texture2D(tRefl,suv-vec2(0.,px.y*3.)).rgb)/6.;
        // baked contact shading under the furniture, and the sun's shadow kept visible in the reflection
        float ao=texture2D(tAO,vec2((vWP.x-(${FLOOR.x0.toFixed(1)}))/${(FLOOR.x1 - FLOOR.x0).toFixed(1)},(${FLOOR.z1.toFixed(1)}-vWP.z)/${(FLOOR.z1 - FLOOR.z0).toFixed(1)})).r;
        float shd=clamp(dot(reflectedLight.directDiffuse,vec3(.3,.5,.2))/max(uDirect.x,1e-3),0.,1.);
        vec3 shc=mix(vec3(1.),mix(vec3(.7,.79,.95),vec3(1.),shd),uDirect.y);
        outgoingLight=mix(outgoingLight*(1.-line*.12),rf*(1.-line*.05),fr)*shc*mix(1.,ao,.85);
        #include <opaque_fragment>`)
  }

  // ---------- glazing: thin panes that catch the sky at glancing angles ----------
  const vaultMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: SKY_GLSL + /* glsl */ `
varying vec3 vN;varying vec3 vW;
void main(){
  vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float nv=dot(n,v);
  float f=pow(1.-abs(nv),3.);
  vec3 r=reflect(-v,n*sign(nv));r.y=abs(r.y);
  vec3 c=mix(uWhite,skyBase(normalize(r)),.6);
  gl_FragColor=vec4(c,clamp(.01+f*.2,0.,1.));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  })

  // ---------- materials from the GLB ----------
  const emit = { cool: [], warm: [], core: [] }
  const glassMats = []
  const cloneCache = new Map()
  const screens = {}
  const top = (o) => { let p = o; while (p.parent && p.parent !== gltf.scene) p = p.parent; return p.name }
  function withAO(material, map) {
    const key = material.uuid + map.uuid
    if (!cloneCache.has(key)) {
      const m = material.clone()
      m.aoMap = map
      m.aoMapIntensity = 1.0
      cloneCache.set(key, m)
    }
    return cloneCache.get(key)
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return
    const group = top(o)
    const name = o.material.name
    o.castShadow = true
    o.receiveShadow = true
    const termKey = name.includes('_') ? name.split('_')[1] : null
    const work = termKey && works[termKey]
    if (name === 'Wood' && !o.material.map) { o.material.map = wood; o.material.needsUpdate = true }
    // cloth sheen is a faint effect on a few cushions; without it they share the program of the other surfaces
    if (o.material.sheen) o.material.sheen = 0
    if (group === 'Floor') {
      o.material = floorMat
      o.castShadow = false
    } else if (group === 'VaultGlass') {
      o.material = vaultMat
      o.castShadow = false
      o.receiveShadow = false
      o.renderOrder = 2
    } else if (group.startsWith('Screen_')) {
      screens[group.slice(7)] = o
      o.castShadow = false
      o.receiveShadow = false
    } else if (group === 'GlassSolid') {
      const m = o.material
      o.castShadow = false
      if (name.startsWith('GlassTint') && work) {
        m.color.set(mixHex(work.color, '#ffffff', 0.72))
        m.attenuationColor = new THREE.Color(mixHex(work.color, '#ffffff', 0.35))
        m.attenuationDistance = 0.25
        m.roughness = 0.34
        m.thickness = 0.05
      } else if (name === 'GlassFrost') {
        m.roughness = 0.5
        m.thickness = 0.03
      } else if (name.startsWith('BookGlass')) {
        m.attenuationColor = m.color.clone()
        m.attenuationDistance = 0.06
        m.color.set('#ffffff')
        m.thickness = 0.03
      } else {
        m.thickness = 0.06
      }
      m.envMapIntensity = 1.4
      glassMats.push(m)
    } else if (group === 'Emitters') {
      o.castShadow = false
      const m = o.material
      if (name === 'EmitCool') emit.cool.push(m)
      else if (name === 'EmitWarm') emit.warm.push(m)
      else {
        if (work) m.emissive.set(mixHex(work.color, '#ffffff', 0.25))
        m.userData.on = !!(work && work.title)
        emit.core.push(m)
      }
    } else if (group === 'Curtain') {
      const m = o.material
      o.castShadow = false
      m.transparent = true
      m.opacity = 0.5
      m.depthWrite = false
      m.side = THREE.DoubleSide
      m.roughness = 0.85
      m.emissive = new THREE.Color('#ffffff')
      m.emissiveIntensity = 0.12        // sheer cloth lets some light through
      o.renderOrder = 3
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.uTime
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ck=1.-uv.y;transformed+=normal*(sin(uTime*.42+position.z*.9+position.y*.5)*.07+sin(uTime*.23+position.z*2.3)*.03)*ck*ck;')
      }
    } else if (group === 'Structure') {
      if (name === 'WhiteSteel') o.material.clearcoat = 0      // the ribs fill much of the view; a plain coat-less paint is enough
    } else if (group === 'Interior') {
      o.material = withAO(o.material, aoRoom)
    } else if (group.startsWith('Terminal_')) {
      if (name.startsWith('Accent_') && work) o.material.color.set(mixHex(work.color, '#ffffff', 0.3))
      o.material = withAO(o.material, aoTerms)
      o.userData.term = group.slice(9)
    }
  })

  // ---------- terminals: screens, lights, anchors ----------
  const terms = {}
  const hits = []
  gltf.scene.updateMatrixWorld(true)
  for (const key of order) {
    const screen = screens[key]
    const work = works[key]
    screen.geometry.computeBoundingBox()
    const bb = screen.geometry.boundingBox
    const sw = bb.max.x - bb.min.x, sh = bb.max.y - bb.min.y
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = Math.round(768 * sh / sw)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.flipY = false
    map.anisotropy = Math.min(8, maxAniso)
    const mat = new THREE.MeshBasicMaterial({ map })
    screen.material = mat
    screen.userData.term = key
    const center = screen.localToWorld(bb.getCenter(new THREE.Vector3()))
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld)
    const root = gltf.scene.getObjectByName('Terminal_' + key)
    const t = { key, root, screen, canvas, map, mat, sw, sh, center, normal, on: !!work.title, shown: null }
    // every terminal has its light, lit or not, so that showing a work later changes no shader program
    t.light = new THREE.PointLight(mixHex(work.color, '#ffffff', 0.3), 0, 5, 2)
    t.light.position.copy(center).addScaledVector(normal, 0.55)
    room.add(t.light)
    root.traverse((o) => { if (o.isMesh) hits.push(o) })
    hits.push(screen)
    terms[key] = t
  }

  // A screen shows the key visual of one work, edge to edge, like a display left on. An empty terminal stays dark.
  const images = new Map()
  function drawScreen(t) {
    const g = t.canvas.getContext('2d'), W = t.canvas.width, H = t.canvas.height
    const img = t.shown && images.get(t.shown)
    if (!img || !img.complete || !img.naturalWidth) {
      const gd = g.createLinearGradient(0, 0, W, H)
      gd.addColorStop(0, '#1c2a40'); gd.addColorStop(1, '#0b1322')
      g.fillStyle = gd; g.fillRect(0, 0, W, H)
    } else {
      // cover the screen; on a tall screen the picture keeps its middle
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight)
      g.fillStyle = '#0b1322'; g.fillRect(0, 0, W, H)
      g.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k)
    }
    t.map.needsUpdate = true
  }
  /** Puts a work's image (a URL) on a terminal's screen, or darkens it with null. */
  function setScreen(key, src) {
    const t = terms[key]
    if (!t || t.shown === src) return
    t.shown = src
    if (src && !images.has(src)) {
      const img = new Image()
      img.onload = () => { for (const k of order) if (terms[k].shown === src) drawScreen(terms[k]) }
      img.src = src
      images.set(src, img)
    }
    drawScreen(t)
  }
  for (const key of order) setScreen(key, works[key].img ? import.meta.env.BASE_URL + works[key].img : null)
  for (const key of order) drawScreen(terms[key])

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xffffff, 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  const sc = sun.shadow.camera
  sc.left = -15; sc.right = 15; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 100
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.035
  sun.shadow.radius = 3
  sun.target.position.set(0, 0, -3)
  room.add(sun, sun.target)
  const points = []
  gltf.scene.traverse((o) => {
    if (!o.name.startsWith('Light_')) return
    const kind = o.name.slice(6)
    // Every point light is shaded on every pixel, so only two get a real light: the ring and the largest orb.
    // The other lamps read through their glowing bulbs and the bloom.
    if (kind !== 'ring' && kind !== 'orb0') return
    const cfg = kind === 'ring' ? ['#dbe8ff', 26, 16] : ['#ffdcb0', 3.2, 6]
    const l = new THREE.PointLight(cfg[0], 0, cfg[2], 2)
    o.getWorldPosition(l.position)
    l.userData.max = cfg[1]
    room.add(l)
    points.push(l)
  })

  // ---------- dust in the light ----------
  const dustN = 160, dustP = new Float32Array(dustN * 3)
  for (let i = 0; i < dustN; i++) { dustP[i * 3] = (Math.random() - 0.5) * 13; dustP[i * 3 + 1] = 0.3 + Math.random() * 5.5; dustP[i * 3 + 2] = -9 + Math.random() * 15 }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustP, 3))
  const dustMat = new THREE.PointsMaterial({ size: 0.022, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false })
  room.add(new THREE.Points(dustGeo, dustMat))

  // ---------- reflection pass ----------
  // The mirror camera sits under the floor and looks up. Its near plane is tilted onto the floor (an oblique
  // frustum), which cuts away the slab beneath without a clipping plane and so without extra shader programs.
  const reflCam = new THREE.PerspectiveCamera()
  const floorPlane = new THREE.Plane(), clipPlane = new THREE.Vector4(), q = new THREE.Vector4(), UP = new THREE.Vector3(0, 1, 0)
  const floorMesh = gltf.scene.getObjectByName('Floor')
  const glassSolid = gltf.scene.getObjectByName('GlassSolid')
  let reflScale = 0.5
  function setSize(w, h) {
    uRes.value.set(w, h)
    reflRT.setSize(Math.max(2, Math.round(w * reflScale)), Math.max(2, Math.round(h * reflScale)))
  }
  function renderReflection(look) {
    reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.near = camera.near; reflCam.far = camera.far
    reflCam.updateProjectionMatrix()
    reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z)
    reflCam.lookAt(look.x, -look.y, look.z)
    reflCam.updateMatrixWorld()
    floorPlane.set(UP, 0).applyMatrix4(reflCam.matrixWorldInverse)
    clipPlane.set(floorPlane.normal.x, floorPlane.normal.y, floorPlane.normal.z, floorPlane.constant)
    const pm = reflCam.projectionMatrix.elements
    q.set((Math.sign(clipPlane.x) + pm[8]) / pm[0], (Math.sign(clipPlane.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14])
    clipPlane.multiplyScalar(2 / clipPlane.dot(q))
    pm[2] = clipPlane.x; pm[6] = clipPlane.y; pm[10] = clipPlane.z + 1 - 0.003; pm[14] = clipPlane.w
    floorMesh.visible = false
    glassSolid.visible = false              // skips a second refraction pass; small glass is not missed in the reflection
    renderer.setRenderTarget(reflRT)
    renderer.render(scene, reflCam)
    renderer.setRenderTarget(null)
    floorMesh.visible = true
    glassSolid.visible = true
  }

  let shadowFrames = 4
  function setQuality(level) {
    const q = QUALITY[level] ?? QUALITY.high
    reflScale = q.reflection
    U.uDetail.value = q.clouds ? 1 : 0
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow)
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null }
    }
    shadowFrames = 4
    renderer.transmissionResolutionScale = 0.5
    for (const m of glassMats) {
      if (m.userData.t === undefined) m.userData.t = m.transmission
      const next = q.refraction ? m.userData.t : 0
      if (m.transmission === next) continue
      m.transmission = next
      m.transparent = !q.refraction
      m.opacity = q.refraction ? 1 : 0.32
      m.depthWrite = q.refraction
      m.needsUpdate = true
    }
  }

  const tmp = new THREE.Color()
  const lastSun = new THREE.Vector3()
  function update(dt, state) {
    updateEnv(U.uTime.value, state.scene, state.envDirty)
    const glow = P.glow
    sun.position.copy(P.sunDir).multiplyScalar(50).add(sun.target.position)
    sun.color.copy(P.sun)
    sun.intensity = P.sunI * SUN_GAIN
    scene.environmentIntensity = P.envI * ENV_GAIN
    // light bounced off the pale floor: this is what keeps shaded white surfaces light instead of sky-blue
    U.uBounce.value = 0.3 + 0.62 * Math.min(1, P.sunI / 3.4) * Math.sqrt(Math.sin(P.elevation))
    uDirect.value.set(sun.intensity * (P.sun.r * 0.3 + P.sun.g * 0.5 + P.sun.b * 0.2) * Math.sin(P.elevation) * 0.62 / Math.PI, Math.min(1, P.sunI * 0.6))
    for (const m of emit.cool) m.emissiveIntensity = 0.5 + 5 * glow
    for (const m of emit.warm) m.emissiveIntensity = 0.8 + 6 * glow
    for (const m of emit.core) m.emissiveIntensity = m.userData.on ? 0.6 + 3.2 * glow : 0
    // by day the lamps add nothing; they stay in the light list at zero strength (see the top of this file)
    for (const l of points) l.intensity = glow > 0.38 ? l.userData.max * glow * glow : 0
    // the shadow map is redrawn only when the sun has actually moved
    if (lastSun.distanceToSquared(P.sunDir) > 2e-7 || shadowFrames > 0) {
      lastSun.copy(P.sunDir)
      renderer.shadowMap.needsUpdate = true
      if (shadowFrames > 0) shadowFrames--
    }
    for (const key of order) {
      const t = terms[key]
      const lit = !!t.shown
      if (!lit) { t.light.intensity = 0; t.mat.color.setScalar(0.5 + 0.5 * (1 - P.night)); continue }
      const hot = state.hover === key || state.sel === key ? 1.25 : 1
      t.light.intensity = (0.25 + 1.5 * glow) * hot
      t.mat.color.setScalar((0.95 + 0.3 * glow) * (hot > 1 ? 1.08 : 1))
    }
    dustMat.opacity = 0.08 + 0.3 * (1 - P.night)
    dustMat.color.copy(tmp.copy(P.wh).lerp(P.sun, 0.4))
    for (let i = 0; i < dustN; i++) {
      dustP[i * 3] += dt * 0.02
      dustP[i * 3 + 1] += Math.sin(U.uTime.value * 0.3 + i) * dt * 0.012
      if (dustP[i * 3] > 6.5) dustP[i * 3] = -6.5
    }
    dustGeo.attributes.position.needsUpdate = true
  }

  return { group: room, terms, hits, update, renderReflection, setSize, setQuality, setScreen, forceEnv: () => updateEnv(U.uTime.value, -1, true) }
}
