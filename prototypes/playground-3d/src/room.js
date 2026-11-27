// The room: loads the GLB made in Blender and gives it light, reflection and screens.
// Loaded only for the PC experience, so phones never download the 3D assets.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { U, P, SKY_GLSL, createDome } from './sky.js'

const ASSETS = import.meta.env.BASE_URL + 'assets/'
// Extent of the floor mesh in three.js coordinates, used to look up its AO map (see build_scene.py: FX, FY0, FY1).
const FLOOR = { x0: -9.1, x1: 9.1, z0: -25, z1: 13 }
// Balance between the sun and the sky's fill light. A lower fill keeps shade readable instead of washing it out.
const SUN_GAIN = 0.8
const ENV_GAIN = 0.95

function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b)
  return '#' + ca.lerp(cb, t).getHexString()
}

export async function createRoom({ renderer, scene, camera, works, order }) {
  const loader = new GLTFLoader()
  const tex = new THREE.TextureLoader()
  const [gltf, aoRoom, aoTerms, aoFloor] = await Promise.all([
    loader.loadAsync(ASSETS + 'playground.glb'),
    tex.loadAsync(ASSETS + 'ao_room.webp'),
    tex.loadAsync(ASSETS + 'ao_terms.webp'),
    tex.loadAsync(ASSETS + 'ao_floor.webp'),
  ])
  for (const t of [aoRoom, aoTerms]) { t.flipY = false; t.channel = 1 }   // glTF UV convention, second UV set
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  aoFloor.anisotropy = Math.min(8, maxAniso)

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
  const box = new THREE.Box3()
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
    box.setFromObject(root)
    const anchor = new THREE.Vector3(center.x, box.max.y + 0.16, center.z)
    const t = { key, root, screen, canvas, map, mat, sw, sh, center, normal, anchor, on: !!work.title, img: null, bb }
    if (t.on) {
      t.light = new THREE.PointLight(mixHex(work.color, '#ffffff', 0.3), 0, 5, 2)
      t.light.position.copy(center).addScaledVector(normal, 0.55)
      room.add(t.light)
    }
    root.traverse((o) => { if (o.isMesh) hits.push(o) })
    hits.push(screen)
    terms[key] = t
  }

  function drawScreen(key) {
    const t = terms[key], w = works[key], g = t.canvas.getContext('2d'), W = t.canvas.width, H = t.canvas.height
    const s = W / 512
    if (!t.on) {
      const gd = g.createLinearGradient(0, 0, W, H)
      gd.addColorStop(0, '#1c2a40'); gd.addColorStop(1, '#0b1322')
      g.fillStyle = gd; g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(190,210,245,.22)'; g.lineWidth = 4 * s; g.lineJoin = 'round'
      g.beginPath(); g.moveTo(W / 2 - 30 * s, H / 2 - 38 * s); g.lineTo(W / 2 + 38 * s, H / 2); g.lineTo(W / 2 - 30 * s, H / 2 + 38 * s); g.closePath(); g.stroke()
      t.map.needsUpdate = true
      return
    }
    const gr = g.createLinearGradient(0, 0, W, H)
    gr.addColorStop(0, mixHex(w.color, '#ffffff', 0.82)); gr.addColorStop(1, mixHex(w.color, '#ffffff', 0.46))
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,.96)'; g.font = `600 ${26 * s}px Sora, sans-serif`; g.textBaseline = 'alphabetic'
    g.fillText(w.title, 30 * s, 50 * s)
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W - 36 * s - i * 20 * s, 42 * s, 5 * s, 0, 6.3); g.fill() }
    const iw = W - 60 * s, ih = Math.min(iw * 0.75, H - 110 * s), ix = 30 * s, iy = 74 * s + (H - 110 * s - ih) / 2
    g.save(); g.beginPath(); g.roundRect(ix, iy, iw, ih, 12 * s); g.clip()
    if (t.img) {
      const k = Math.max(iw / t.img.width, ih / t.img.height)
      g.drawImage(t.img, ix + (iw - t.img.width * k) / 2, iy, t.img.width * k, t.img.height * k)
    } else { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(ix, iy, iw, ih) }
    g.restore()
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.5 * s; g.beginPath(); g.roundRect(ix, iy, iw, ih, 12 * s); g.stroke()
    t.map.needsUpdate = true
  }
  for (const key of order) {
    drawScreen(key)
    if (works[key].img) {
      const im = new Image()
      im.onload = () => { terms[key].img = im; drawScreen(key) }
      im.src = import.meta.env.BASE_URL + works[key].img
    }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => order.forEach(drawScreen))

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
  const reflCam = new THREE.PerspectiveCamera()
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
  const noClip = []
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
    floorMesh.visible = false
    glassSolid.visible = false              // skips a second refraction pass; small glass is not missed in the reflection
    renderer.clippingPlanes = clip          // the slab under the floor must not block the mirrored view
    renderer.setRenderTarget(reflRT)
    renderer.render(scene, reflCam)
    renderer.setRenderTarget(null)
    renderer.clippingPlanes = noClip
    floorMesh.visible = true
    glassSolid.visible = true
  }

  function setQuality(q) {
    const high = q === 'high'
    reflScale = high ? 0.5 : 0.33
    U.uDetail.value = high ? 1 : 0
    const size = high ? 4096 : 2048
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size)
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null }
    }
    shadowFrames = 4
    renderer.transmissionResolutionScale = 0.5
    for (const m of glassMats) {
      if (m.userData.t === undefined) m.userData.t = m.transmission
      m.transmission = high ? m.userData.t : 0
      m.transparent = !high
      m.opacity = high ? 1 : 0.32
      m.depthWrite = high
      m.needsUpdate = true
    }
  }

  const tmp = new THREE.Color()
  const lastSun = new THREE.Vector3()
  let shadowFrames = 4
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
    // lamps add nothing by day, so they are switched off entirely then (fewer lights to shade per pixel)
    const lampsOn = glow > 0.38
    for (const l of points) { l.visible = lampsOn; l.intensity = l.userData.max * glow * glow }
    // the shadow map is redrawn only when the sun has actually moved
    if (lastSun.distanceToSquared(P.sunDir) > 2e-7 || shadowFrames > 0) {
      lastSun.copy(P.sunDir)
      renderer.shadowMap.needsUpdate = true
      if (shadowFrames > 0) shadowFrames--
    }
    for (const key of order) {
      const t = terms[key]
      if (!t.on) { t.mat.color.setScalar(0.5 + 0.5 * (1 - P.night)); continue }
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

  return { group: room, terms, hits, update, renderReflection, setSize, setQuality, forceEnv: () => updateEnv(U.uTime.value, -1, true) }
}
