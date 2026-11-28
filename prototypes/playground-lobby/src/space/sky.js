// Sky, clouds, water and the time of day. Shared by the room and by the sky-only view of phones.
// Taken from prototypes/playground-3d/src/sky.js. The look is the same; the difference is how noise is made:
// the original computed every noise value with arithmetic, and that one shader took from half a minute to
// two minutes to compile on Windows (Direct3D) in a browser that had never seen it. Here noise is read from a
// small texture, which makes the program a fraction of the size.
import * as THREE from 'three'

const C = (hex) => new THREE.Color(hex)

// Uniforms shared by every material that needs to know the sky.
export const U = {
  uZen: { value: C('#1873de') }, uHor: { value: C('#a9d7fa') }, uSunCol: { value: C('#ffffff') },
  uCloudLit: { value: C('#ffffff') }, uCloudSh: { value: C('#9cc2ef') }, uWaterDeep: { value: C('#1b63bd') },
  uWhite: { value: C('#ffffff') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uTime: { value: 0 }, uScene: { value: 0 }, uFog: { value: 0 }, uNight: { value: 0 }, uDisc: { value: 1 },
  uCamY: { value: 2 }, uDetail: { value: 1 }, uEnv: { value: 0 }, uBounce: { value: 0.5 },
  tNoise: { value: noiseTexture() },
  // cumulus layers of the current scene: (scale, base, height, seed) and (amount, how far it fades to the horizon colour)
  uCuA: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uCuB: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uCirrus: { value: 0.2 },
}

// What is outside the windows: 0 sky (towering clouds), 1 a sea of cloud below, 2 open water.
const SCENES = [
  { cirrus: 0.2, layers: [[6, 0.012, 0.10, 3, 0.6, 0.4], [3.1, 0.03, 0.24, 11, 0.64, 0.16], [1.6, 0.05, 0.62, 27, 0.5, 0]] },
  { cirrus: 0.5, layers: [[5, -0.02, 0.09, 5, 0.75, 0.2]] },
  { cirrus: 0.3, layers: [[6, 0.012, 0.10, 3, 0.46, 0.4]] },
]
export function setScene(index) {
  const scene = SCENES[index]
  U.uScene.value = index
  U.uCirrus.value = scene.cirrus
  for (let i = 0; i < 3; i++) {
    const l = scene.layers[i] ?? [1, 0, 0, 0, 0, 0]
    U.uCuA.value[i].set(l[0], l[1], l[2], l[3]); U.uCuB.value[i].set(l[4], l[5])
  }
}
setScene(0)

// 256 x 256 random values, laid out so that texel (i, j) carries the values of lattice points (i, j), (i+1, j),
// (i, j+1) and (i+1, j+1). The shader mixes them itself, which keeps the interpolation at full precision.
// The values come from a fixed seed, so the clouds are the same on every visit.
function noiseTexture() {
  const n = 256, values = new Uint8Array(n * n), data = new Uint8Array(n * n * 4)
  let seed = 0x2411
  for (let i = 0; i < values.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; values[i] = seed >>> 24 }
  const at = (x, y) => values[(y & 255) * n + (x & 255)]
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data.set([at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)], (y * n + x) * 4)
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uZen,uHor,uSunCol,uCloudLit,uCloudSh,uWaterDeep,uWhite,uSunDir;
uniform float uTime,uScene,uFog,uNight,uDisc,uCamY,uDetail,uEnv,uBounce,uCirrus;
uniform vec4 uCuA[3];uniform vec2 uCuB[3];
uniform highp sampler2D tNoise;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// value noise: one texel holds the four corner values of its lattice cell, so one fetch is enough
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 c=texelFetch(tNoise,ivec2(i)&255,0);
  return mix(mix(c.r,c.g,f.x),mix(c.b,c.a,f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.3,9.1);a*=.5;}return s;}
float fbm3(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.3,9.1);a*=.5;}return s;}

// clear-sky gradient with the sun (or the moon) and its glow
vec3 skyBase(vec3 d){
  float e=clamp(d.y,0.,1.);
  vec3 c=mix(uHor,uZen,pow(e,.5));
  float sd=max(dot(d,uSunDir),0.);
  c+=uSunCol*uDisc*(pow(sd,5.)*.16*exp(-e*3.)+pow(sd,48.)*.3);
  c+=uSunCol*uDisc*smoothstep(.99945,.9996,sd)*(1.-uEnv)*3.;
  return c;
}

// density of one cumulus layer in (azimuth, elevation) space
float cuD(float x,float y,float hs,float seed,float amt){
  float prof=smoothstep(1.-amt,1.-amt+.3,fbm3(vec2(x*.7,seed*3.1)));
  if(prof<=0.)return 0.;
  float b1=fbm(vec2(x*2.6,y*2.6+seed)),b2=fbm3(vec2(x*8.,y*8.-seed));
  float top=prof*hs*(.35+1.2*b1)+(b2-.5)*.1;
  return clamp((top-y)*5.,0.,1.)*smoothstep(-.03,.03,y+(b2-.5)*.05)*smoothstep(0.,.08,prof);
}
// cumulus with self-shadowing: two more density samples towards the sun give the clouds volume
vec4 cumulus(vec3 d,float sc,float base,float hgt,float seed,float amt){
  float az=atan(d.x,-d.z),el=asin(clamp(d.y,-1.,1.));
  float x=az*sc+seed+uTime*.005,y=(el-base)*sc,hs=hgt*sc;
  float dn=cuD(x,y,hs,seed,amt);
  if(dn<=.001)return vec4(0.);
  float sh=1.;
  if(uDetail>.5){
    float saz=atan(uSunDir.x,-uSunDir.z),sel=asin(clamp(uSunDir.y,-1.,1.));
    vec2 ld=normalize(vec2(saz-az,sel-el)+vec2(1e-4));
    sh=exp(-(cuD(x+ld.x*.14,y+ld.y*.14,hs,seed,amt)*.9+cuD(x+ld.x*.36,y+ld.y*.36,hs,seed,amt)*.8));
  }
  float up=clamp(y/(hs*.9),0.,1.);
  float lit=clamp(sh*.72+up*.36,0.,1.);
  vec3 c=mix(uCloudSh,uCloudLit,smoothstep(.12,.92,lit));
  float sd=max(dot(d,uSunDir),0.);
  c+=uSunCol*uDisc*pow(sd,10.)*.3*(1.-dn*.7);
  return vec4(c,smoothstep(0.,.3,dn));
}

// Everything above the horizon. The cumulus layers of the three scenes differ only in their numbers, which
// come in as uniforms (see setScene): one piece of code instead of one per scene keeps the program small.
vec3 skyAbove(vec3 d){
  vec3 c=skyBase(d);
  if(uNight>.01){
    vec2 g=d.xz/(d.y+.35)*70.;vec2 id=floor(g);vec2 f=fract(g)-.5;float h=hash(id);
    float s=smoothstep(.09,0.,length(f-(vec2(hash(id+3.1),hash(id+7.7))-.5)*.6))*step(.9,h);
    c+=vec3(.8,.88,1.)*s*uNight*(.55+.45*sin(uTime*1.3+h*60.));
    c+=vec3(.25,.34,.6)*uNight*.1*smoothstep(.45,.8,fbm3(d.xz/(d.y+.4)*1.6+4.));
  }
  vec2 p=d.xz/(d.y+.18);
  float ci=smoothstep(.5,.85,fbm(p*vec2(.9,2.6)+vec2(uTime*.004,0.)))*smoothstep(.04,.35,d.y);
  c=mix(c,uCloudLit,ci*uCirrus);
  for(int i=0;i<3;i++){
    if(uCuB[i].x>0.){vec4 k=cumulus(d,uCuA[i].x,uCuA[i].y,uCuA[i].z,uCuA[i].w,uCuB[i].x);c=mix(c,mix(k.rgb,uHor,uCuB[i].y),k.a);}
  }
  return c;
}

// the room floats above a sea of cloud
vec3 seaOfCloud(vec3 d){
  float t=45./max(-d.y,.002);vec2 p=d.xz*t*.011+vec2(uTime*.0015,0.);
  float n=fbm(p),n2=fbm(p+uSunDir.xz*.22),dt=fbm(p*4.1);
  float lit=clamp(.5+(n-n2)*2.6+(n-.5)*.9+(dt-.5)*.4,0.,1.);
  return mix(uCloudSh,uCloudLit,lit);
}
// The whole sphere. Below the horizon lies open water, which shows the sky reflected in a gently moving
// surface with the sun's path on it, or a sea of cloud. The sky is looked up once per pixel: for water, along
// the reflected direction. (Calling skyAbove from two places would put its code into the program twice.)
vec3 skyAll(vec3 d){
  bool below=d.y<0.;
  bool cl=uScene>.5&&uScene<1.5;
  vec3 q=d,n=vec3(0.,1.,0.);
  if(below&&!cl){
    float t=uCamY/max(-d.y,.002);vec2 p=d.xz*t;
    float amp=(uScene>1.5?1.:.2)/(1.+t*.05);
    vec2 w=p*.55+vec2(uTime*.07,uTime*.045);float e=.2;float n0=fbm(w);
    vec2 g=vec2(fbm(w+vec2(e,0.))-n0,fbm(w+vec2(0.,e))-n0)/e;
    n=normalize(vec3(-g.x*amp,1.,-g.y*amp));
    q=reflect(d,n);q.y=abs(q.y)+.002;q=normalize(q);
  }
  vec3 c=vec3(0.);
  if(below&&cl)c=seaOfCloud(d);else c=skyAbove(q);
  if(below){
    if(!cl){
      float F=.03+.97*pow(1.-max(dot(-d,n),0.),4.);
      c=mix(uWaterDeep,c,clamp(F+.25,0.,1.));
      c+=uSunCol*uDisc*pow(max(dot(q,uSunDir),0.),180.)*(uScene>1.5?2.4:.8)*(1.-uEnv);
    }
    vec3 hz=skyBase(normalize(vec3(d.x,.001,d.z)));
    c=mix(c,hz,exp(d.y*(cl?12.:26.)));
  }
  return c;
}
`

export function createDome() {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 32), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}',
    fragmentShader: SKY_GLSL + /* glsl */ `
varying vec3 vDir;
void main(){
  vec3 d=normalize(vDir);vec3 c=skyAll(d);
  // for the environment map, the lower half stands for light bounced off the pale floor
  if(uEnv>.5&&d.y<0.)c=mix(c,mix(uHor,uWhite,.7)*uBounce,smoothstep(0.,-.12,d.y));
  float fg=smoothstep(0.,1.,uFog*1.7-fbm(d.xy*4.+3.)*.7);
  c=mix(c,mix(uHor,uWhite,.6),fg*.96);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }))
  dome.frustumCulled = false
  dome.renderOrder = -10
  return dome
}

// Keyframes of the day. Colours are sRGB; everything in between is interpolated continuously.
// sunI: sun (or moon) strength, envI: strength of the sky's fill light, glow: how much lamps and screens stand out.
const NIGHT = { zen: '#040a22', hor: '#1b3163', sun: '#b9ceff', lit: '#7d9ad2', sh: '#17264f', wd: '#07122e', wh: '#33456f', sunI: 0.5, envI: 0.9, disc: 1, night: 1, glow: 1, exp: 1.25 }
const KEYS = [
  { h: 0, ...NIGHT }, { h: 4.6, ...NIGHT },
  { h: 5.2, zen: '#0d1a44', hor: '#5a5a8f', sun: '#ffb9a0', lit: '#8f8fbf', sh: '#232f60', wd: '#101c44', wh: '#5a6390', sunI: 0.05, envI: 1.0, disc: 0, night: 0.5, glow: 0.8, exp: 1.15 },
  { h: 6.0, zen: '#3f6fc0', hor: '#f6cdb8', sun: '#ffc9a2', lit: '#ffe0d0', sh: '#8d9bd0', wd: '#3a66a8', wh: '#f0e3e0', sunI: 2.0, envI: 1.0, disc: 1, night: 0, glow: 0.45, exp: 1.0 },
  { h: 7.8, zen: '#2f8ae6', hor: '#cfe9fb', sun: '#fff2de', lit: '#ffffff', sh: '#a6c6ee', wd: '#2f79c8', wh: '#f7fafd', sunI: 3.0, envI: 1.0, disc: 1, night: 0, glow: 0.25, exp: 0.95 },
  { h: 12, zen: '#1268dc', hor: '#a3d3fa', sun: '#ffffff', lit: '#ffffff', sh: '#98bfee', wd: '#155cb8', wh: '#ffffff', sunI: 3.4, envI: 1.0, disc: 1, night: 0, glow: 0.2, exp: 0.9 },
  { h: 15.5, zen: '#1d70d8', hor: '#b8dcf9', sun: '#fff5e4', lit: '#ffffff', sh: '#a0c2ec', wd: '#1d62b8', wh: '#fffdfa', sunI: 3.3, envI: 1.0, disc: 1, night: 0, glow: 0.22, exp: 0.92 },
  { h: 17.7, zen: '#3d5fb6', hor: '#ffc39c', sun: '#ffad74', lit: '#ffd8c0', sh: '#8c85c2', wd: '#4a4f96', wh: '#ffe6d8', sunI: 2.8, envI: 1.05, disc: 1, night: 0, glow: 0.45, exp: 1.0 },
  { h: 18.8, zen: '#1d2c6c', hor: '#d98a8f', sun: '#ff8f7a', lit: '#d9a3bd', sh: '#44438a', wd: '#27275f', wh: '#9c8db8', sunI: 1.0, envI: 1.1, disc: 0.8, night: 0.25, glow: 0.75, exp: 1.1 },
  { h: 19.3, zen: '#0c1640', hor: '#4a4a86', sun: '#c9a0c0', lit: '#7d7fb5', sh: '#1f2a5c', wd: '#0e183c', wh: '#4c5788', sunI: 0.05, envI: 1.0, disc: 0, night: 0.7, glow: 0.95, exp: 1.2 },
  { h: 20.6, ...NIGHT }, { h: 24, ...NIGHT },
]
const COLOR_KEYS = ['zen', 'hor', 'sun', 'lit', 'sh', 'wd', 'wh']
const NUMBER_KEYS = ['sunI', 'envI', 'disc', 'night', 'glow', 'exp']
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = C(k[c])

// The interpolated state of the sky right now. Other modules read it after applyTime().
export const P = { hour: 12, sunDir: new THREE.Vector3(0, 1, 0), sunUp: true }
for (const c of COLOR_KEYS) P[c] = new THREE.Color()

export function applyTime(hour) {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++
  const a = KEYS[i], b = KEYS[i + 1]
  let t = (h - a.h) / (b.h - a.h)
  t = t * t * (3 - 2 * t)
  for (const c of COLOR_KEYS) P[c].lerpColors(a[c], b[c], t)
  for (const n of NUMBER_KEYS) P[n] = a[n] + (b[n] - a[n]) * t
  P.hour = h
  // the sun crosses the view from the left in the morning to the right in the evening; at night the moon stands still
  let el, az
  P.sunUp = h >= 5.2 && h < 19.3
  if (P.sunUp) {
    const f = (h - 5.2) / 14.1
    el = THREE.MathUtils.degToRad(5 + 58 * Math.sin(Math.PI * f))
    az = THREE.MathUtils.degToRad(-46 + 60 * f)
  } else {
    el = THREE.MathUtils.degToRad(34)
    az = THREE.MathUtils.degToRad(20)
  }
  P.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
  P.elevation = el
  U.uZen.value.copy(P.zen); U.uHor.value.copy(P.hor); U.uSunCol.value.copy(P.sun)
  U.uCloudLit.value.copy(P.lit); U.uCloudSh.value.copy(P.sh); U.uWaterDeep.value.copy(P.wd); U.uWhite.value.copy(P.wh)
  U.uSunDir.value.copy(P.sunDir); U.uNight.value = P.night; U.uDisc.value = P.disc
  return P
}

export function phaseName(h) {
  if (h < 4.8) return '夜'
  if (h < 6.2) return '夜明け'
  if (h < 10) return '朝'
  if (h < 16) return '昼'
  if (h < 19) return '夕方'
  return '夜'
}
