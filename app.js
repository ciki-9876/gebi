(() => {
'use strict';
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const clone = o => JSON.parse(JSON.stringify(o));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => innerWidth <= 760;
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const validUrl = u => /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(String(u || '').trim());

const loaderMsg = $('#loaderMsg');
if (!window.THREE) { loaderMsg.textContent = '3D 引擎没有加载成功，请检查网络后刷新页面。'; return; }
const testGL = document.createElement('canvas');
if (!(testGL.getContext('webgl2') || testGL.getContext('webgl'))) { loaderMsg.textContent = '这个浏览器不支持 WebGL，无法显示 3D 房间。'; return; }

/* ============================================================
   Renderer, post-processing, cameras
   ============================================================ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, isNarrow() ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

const scene = new THREE.Scene();          // the room
scene.background = new THREE.Color('#07060b');
const globeScene = new THREE.Scene();     // the planet
globeScene.background = new THREE.Color('#020208');
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .04, 400);
camera.rotation.order = 'YXZ';
const gcam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .005, 600);

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 1 }, uFadeColor: { value: new THREE.Color('#07060b') },
    uWarp: { value: 0 }, uVig: { value: .55 }, uGrain: { value: .03 }, uCA: { value: 1 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uFade, uWarp, uVig, uGrain, uCA; uniform vec3 uFadeColor; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; vec3 col;
      if (uWarp > .001) {
        col = vec3(0.);
        for (int i = 0; i < 18; i++) { float t = float(i) / 17.; col += texture2D(tDiffuse, .5 + c * (1. - uWarp * .5 * t)).rgb; }
        col /= 18.;
        col += uWarp * uWarp * .35 * vec3(1., .78, .5) * smoothstep(.1, .75, length(c));
      } else {
        float a = uCA * .006 * dot(c, c);
        col = vec3(texture2D(tDiffuse, vUv + c * a).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * a).b);
      }
      vec3 e = max(col - .82, 0.);
      col = min(col, .82) + .18 * (1. - exp(-e / .18));
      float v = smoothstep(1.0, .28, length(c * vec2(1., .82)));
      col *= mix(1., v, uVig);
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - .5) * uGrain;
      col = mix(col, uFadeColor, clamp(uFade, 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`
};
let composer = null, renderPass = null, bloom = null, outline = null, gradePass = null, HDR = false;
(function setupPost() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass || !THREE.ShaderPass) return;
  try {
    const w = innerWidth, h = innerHeight;
    const gl2 = renderer.capabilities.isWebGL2;
    try { HDR = gl2 && !!renderer.extensions.get('EXT_color_buffer_float'); } catch (e) {}
    const params = { format: THREE.RGBAFormat, type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType };
    let rt;
    if (gl2 && THREE.WebGLMultisampleRenderTarget) { rt = new THREE.WebGLMultisampleRenderTarget(w * DPR, h * DPR, params); rt.samples = 4; }
    else rt = new THREE.WebGLRenderTarget(w * DPR, h * DPR, params);
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(DPR);
    composer.setSize(w, h);
    renderPass = new THREE.RenderPass(globeScene, gcam);
    composer.addPass(renderPass);
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), .9, .55, .82);
    composer.addPass(bloom);
    if (THREE.OutlinePass) {
      outline = new THREE.OutlinePass(new THREE.Vector2(w, h), scene, camera);
      outline.edgeStrength = 3.2; outline.edgeGlow = .6; outline.edgeThickness = 1.3;
      outline.visibleEdgeColor.set('#ffc46b'); outline.hiddenEdgeColor.set('#5a3a18');
      composer.addPass(outline);
    }
    gradePass = new THREE.ShaderPass(GRADE);
    composer.addPass(gradePass);
  } catch (e) { console.warn('post-processing disabled', e); composer = null; outline = null; gradePass = null; }
})();
function usePostFor(view) {
  if (!composer) return;
  const sc = view === 'globe' ? globeScene : scene, cm = view === 'globe' ? gcam : camera;
  renderPass.scene = sc; renderPass.camera = cm;
  if (outline) { outline.renderScene = sc; outline.renderCamera = cm; outline.enabled = view !== 'globe'; outline.selectedObjects = []; }
  if (bloom) {
    if (view === 'globe') { bloom.strength = .95; bloom.radius = .7; bloom.threshold = .72; }
    else { bloom.strength = .85; bloom.radius = .5; bloom.threshold = HDR ? .95 : .84; }
  }
}
/* screen fade: grade pass when available, CSS layer otherwise */
const FX = { fade: 1, warp: 0 };
const fadeEl = $('#wipe');
function setFade(v, color) { FX.fade = v; if (color && gradePass) gradePass.uniforms.uFadeColor.value.set(color); if (!gradePass) fadeEl.style.opacity = v; }
function setWarp(v) { FX.warp = v; }
const ease = { io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, outQuint: t => 1 - Math.pow(1 - t, 5) };
function tween(dur, fn, curve) {
  return new Promise(res => {
    if (reduceMotion) dur = Math.min(dur, .25);
    const t0 = performance.now(), c = curve || (x => x);
    const step = () => { const t = Math.min(1, (performance.now() - t0) / 1000 / dur); fn(c(t), t); if (t < 1) requestAnimationFrame(step); else res(); };
    step();
  });
}

/* room lights (global so moods can drive them) */
const hemi = new THREE.HemisphereLight(0x9a8cd0, 0x1a1020, .36); scene.add(hemi);
const amb = new THREE.AmbientLight(0x2a2238, .5); scene.add(amb);

/* ============================================================
   Geometry / material / canvas helpers
   ============================================================ */
const GC = {}, MC = {};
function BG(w, h, d) { const k = `b${w},${h},${d}`; return GC[k] || (GC[k] = new THREE.BoxGeometry(w, h, d)); }
function CY(rt, rb, h, s = 20, open = false) { const k = `c${rt},${rb},${h},${s},${open}`; return GC[k] || (GC[k] = new THREE.CylinderGeometry(rt, rb, h, s, 1, open)); }
function SPH(r, ws = 16, hs = 12) { const k = `s${r},${ws},${hs}`; return GC[k] || (GC[k] = new THREE.SphereGeometry(r, ws, hs)); }
function rboxGeo(w, h, d, r) {
  const key = `rb${w},${h},${d},${r}`; if (GC[key]) return GC[key];
  const b = Math.max(.004, Math.min(r * .5, d / 2 - .004, w / 2 - .01, h / 2 - .01));
  const sw = w - 2 * b, sh = h - 2 * b;
  const rr = Math.max(.002, Math.min(r, sw / 2 - .001, sh / 2 - .001));
  const s = new THREE.Shape(), x = -sw / 2, y = -sh / 2;
  s.moveTo(x + rr, y); s.lineTo(x + sw - rr, y); s.quadraticCurveTo(x + sw, y, x + sw, y + rr);
  s.lineTo(x + sw, y + sh - rr); s.quadraticCurveTo(x + sw, y + sh, x + sw - rr, y + sh);
  s.lineTo(x + rr, y + sh); s.quadraticCurveTo(x, y + sh, x, y + sh - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const depth = Math.max(.002, d - 2 * b);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2);
  return (GC[key] = geo);
}
function M(color, rough = .7, metal = 0, emi, emiI = 1) {
  const k = `${color}|${rough}|${metal}|${emi}|${emiI}`; if (MC[k]) return MC[k];
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.envMapIntensity = metal > .5 ? 1 : .45;
  if (emi) { m.emissive = new THREE.Color(emi); m.emissiveIntensity = emiI; }
  return (MC[k] = m);
}
function GLOW(color, k = 1.6) { const key = `g${color}${k}`; return MC[key] || (MC[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) })); }
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  const basic = Array.isArray(mat) ? false : mat.isMeshBasicMaterial;
  m.castShadow = !basic; m.receiveShadow = !basic;
  if (parent) parent.add(m);
  return m;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c, nearest) {
  const t = new THREE.CanvasTexture(c); t.anisotropy = MAX_ANISO;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapText(g, text, maxW, maxLines = 99) {
  const lines = []; let line = '';
  for (const ch of String(text)) { const t = line + ch; if (g.measureText(t).width > maxW && line) { lines.push(line); line = ch; if (lines.length >= maxLines) break; } else line = t; }
  if (line && lines.length < maxLines) lines.push(line);
  else if (lines.length >= maxLines && line) { lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; }
  return lines;
}
function mergeBoxes(list) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed(); g.translate(b.x, b.y, b.z);
    const p = g.attributes.position.array, n = g.attributes.normal.array; c.set(b.color);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
// 画布上的字体与颜色从设计系统读取（styles/tokens.css），不要在这里另起一套
const cssVar = (n, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch (e) { return d; } };
const FONT = {
  body: cssVar('--font-sans', '"Noto Sans SC",sans-serif'),
  mono: cssVar('--font-mono', 'ui-monospace,Menlo,monospace'),
  neon: '"Tilt Neon","Noto Sans SC",sans-serif',      // 3D 场景里的霓虹灯牌
  chalk: '"ZCOOL KuaiLe","Noto Sans SC",sans-serif',  // 3D 场景里的粉笔黑板
  disp: cssVar('--font-sans', '"Noto Sans SC",sans-serif')
};
const TK = {
  bg: cssVar('--ink-900', '#0c0e13'), surface: cssVar('--ink-750', '#1c2129'), text1: cssVar('--fog-100', '#eef1f6'), text2: cssVar('--fog-300', '#a4adbd'), text3: cssVar('--fog-500', '#808a9c'),
  accent: cssVar('--lamp-500', '#f5b94a'), accentText: cssVar('--lamp-400', '#ffd27a'), info: cssVar('--screen-400', '#7db7ff'), heat: cssVar('--heat-400', '#ff7aa8'), line: 'rgba(214,224,255,.14)'
};
/* 门牌：系统的标志元素，画布版本（3D 门上、分享卡片）与 .plate-no 保持一致 */
function drawPlate(g, x, y, w, h, no, scale = 1) {
  g.save();
  g.fillStyle = TK.surface; rr(g, x, y, w, h, 12 * scale); g.fill();
  g.strokeStyle = 'rgba(245,185,74,.55)'; g.lineWidth = 2 * scale; rr(g, x + scale, y + scale, w - 2 * scale, h - 2 * scale, 11 * scale); g.stroke();
  const wx = x + 18 * scale, wy = y + h / 2 - 11 * scale;
  g.shadowColor = TK.accent; g.shadowBlur = 14 * scale; g.fillStyle = TK.accent; rr(g, wx, wy, 16 * scale, 22 * scale, 3 * scale); g.fill(); g.shadowBlur = 0;
  g.fillStyle = TK.accentText; g.font = `600 ${Math.round(h * .5)}px ${FONT.mono}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(no, wx + 30 * scale, y + h / 2 + 2 * scale);
  g.restore();
}

/* ============================================================
   State
   ============================================================ */
const S = {
  view: 'globe', mode: 'visit', room: null, roomRoot: null, resident: null,
  itemGroups: new Map(), dyn: null, hover: null, focus: null, selected: null, panel: null,
  mood: 'chill', sample: null, sampleTools: false,
  chat: { log: [], turns: [], busy: false, ctl: null },
  hotspots: [], grid: null, selRing: null, liked: store.get('gebi.liked', {}),
  colliders: [], wallGroups: null, ceiling: null, busy: false
};

/* ============================================================
   Geography: cities, residents, sun
   ============================================================ */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function latLonToVec(lat, lon, r = 1, out) {
  const phi = (lon + 180) * D2R, th = (90 - lat) * D2R;
  return (out || new THREE.Vector3()).set(-Math.sin(th) * Math.cos(phi) * r, Math.cos(th) * r, Math.sin(th) * Math.sin(phi) * r);
}
function vecToLatLon(v) {
  const l = v.length(); const lat = Math.asin(clamp(v.y / l, -1, 1)) * R2D;
  let lon = Math.atan2(v.z, -v.x) * R2D - 180; while (lon < -180) lon += 360; while (lon > 180) lon -= 360;
  return { lat, lon };
}
function gcDist(a, b) { // km
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * R2D + 360) % 360;
}
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
function fmtCoord(lat, lon) { return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`; }

// [中文名, English, 国家/地区, lat, lon, UTC offset]
const CITIES = [
  ['上海', 'Shanghai', '中国', 31.2304, 121.4737, 8], ['北京', 'Beijing', '中国', 39.9042, 116.4074, 8], ['深圳', 'Shenzhen', '中国', 22.5431, 114.0579, 8],
  ['广州', 'Guangzhou', '中国', 23.1291, 113.2644, 8], ['杭州', 'Hangzhou', '中国', 30.2741, 120.1551, 8], ['成都', 'Chengdu', '中国', 30.5728, 104.0668, 8],
  ['重庆', 'Chongqing', '中国', 29.563, 106.5516, 8], ['武汉', 'Wuhan', '中国', 30.5928, 114.3055, 8], ['西安', "Xi'an", '中国', 34.3416, 108.9398, 8],
  ['南京', 'Nanjing', '中国', 32.0603, 118.7969, 8], ['苏州', 'Suzhou', '中国', 31.2989, 120.5853, 8], ['厦门', 'Xiamen', '中国', 24.4798, 118.0894, 8],
  ['长沙', 'Changsha', '中国', 28.2282, 112.9388, 8], ['青岛', 'Qingdao', '中国', 36.0671, 120.3826, 8], ['大连', 'Dalian', '中国', 38.914, 121.6147, 8],
  ['哈尔滨', 'Harbin', '中国', 45.8038, 126.535, 8], ['昆明', 'Kunming', '中国', 25.0389, 102.7183, 8], ['拉萨', 'Lhasa', '中国', 29.652, 91.1721, 8],
  ['乌鲁木齐', 'Urumqi', '中国', 43.8256, 87.6168, 8], ['香港', 'Hong Kong', '中国香港', 22.3193, 114.1694, 8], ['澳门', 'Macau', '中国澳门', 22.1987, 113.5439, 8],
  ['台北', 'Taipei', '中国台湾', 25.033, 121.5654, 8], ['东京', 'Tokyo', '日本', 35.6762, 139.6503, 9], ['大阪', 'Osaka', '日本', 34.6937, 135.5023, 9],
  ['京都', 'Kyoto', '日本', 35.0116, 135.7681, 9], ['札幌', 'Sapporo', '日本', 43.0618, 141.3545, 9], ['福冈', 'Fukuoka', '日本', 33.5902, 130.4017, 9],
  ['首尔', 'Seoul', '韩国', 37.5665, 126.978, 9], ['釜山', 'Busan', '韩国', 35.1796, 129.0756, 9], ['乌兰巴托', 'Ulaanbaatar', '蒙古', 47.8864, 106.9057, 8],
  ['新加坡', 'Singapore', '新加坡', 1.3521, 103.8198, 8], ['吉隆坡', 'Kuala Lumpur', '马来西亚', 3.139, 101.6869, 8], ['曼谷', 'Bangkok', '泰国', 13.7563, 100.5018, 7],
  ['清迈', 'Chiang Mai', '泰国', 18.7883, 98.9853, 7], ['河内', 'Hanoi', '越南', 21.0278, 105.8342, 7], ['胡志明市', 'Ho Chi Minh City', '越南', 10.8231, 106.6297, 7],
  ['马尼拉', 'Manila', '菲律宾', 14.5995, 120.9842, 8], ['雅加达', 'Jakarta', '印度尼西亚', -6.2088, 106.8456, 7], ['巴厘岛', 'Bali', '印度尼西亚', -8.3405, 115.092, 8],
  ['孟买', 'Mumbai', '印度', 19.076, 72.8777, 5.5], ['新德里', 'New Delhi', '印度', 28.6139, 77.209, 5.5], ['班加罗尔', 'Bengaluru', '印度', 12.9716, 77.5946, 5.5],
  ['加德满都', 'Kathmandu', '尼泊尔', 27.7172, 85.324, 5.75], ['科伦坡', 'Colombo', '斯里兰卡', 6.9271, 79.8612, 5.5], ['达卡', 'Dhaka', '孟加拉国', 23.8103, 90.4125, 6],
  ['迪拜', 'Dubai', '阿联酋', 25.2048, 55.2708, 4], ['多哈', 'Doha', '卡塔尔', 25.2854, 51.531, 3], ['利雅得', 'Riyadh', '沙特阿拉伯', 24.7136, 46.6753, 3],
  ['德黑兰', 'Tehran', '伊朗', 35.6892, 51.389, 3.5], ['伊斯坦布尔', 'Istanbul', '土耳其', 41.0082, 28.9784, 3], ['特拉维夫', 'Tel Aviv', '以色列', 32.0853, 34.7818, 2],
  ['开罗', 'Cairo', '埃及', 30.0444, 31.2357, 2], ['莫斯科', 'Moscow', '俄罗斯', 55.7558, 37.6173, 3], ['圣彼得堡', 'Saint Petersburg', '俄罗斯', 59.9311, 30.3609, 3],
  ['新西伯利亚', 'Novosibirsk', '俄罗斯', 55.0084, 82.9357, 7], ['海参崴', 'Vladivostok', '俄罗斯', 43.1198, 131.8869, 10], ['伦敦', 'London', '英国', 51.5074, -.1278, 0],
  ['爱丁堡', 'Edinburgh', '英国', 55.9533, -3.1883, 0], ['都柏林', 'Dublin', '爱尔兰', 53.3498, -6.2603, 0], ['巴黎', 'Paris', '法国', 48.8566, 2.3522, 1],
  ['里昂', 'Lyon', '法国', 45.764, 4.8357, 1], ['柏林', 'Berlin', '德国', 52.52, 13.405, 1], ['慕尼黑', 'Munich', '德国', 48.1351, 11.582, 1],
  ['阿姆斯特丹', 'Amsterdam', '荷兰', 52.3676, 4.9041, 1], ['布鲁塞尔', 'Brussels', '比利时', 50.8503, 4.3517, 1], ['苏黎世', 'Zurich', '瑞士', 47.3769, 8.5417, 1],
  ['维也纳', 'Vienna', '奥地利', 48.2082, 16.3738, 1], ['布拉格', 'Prague', '捷克', 50.0755, 14.4378, 1], ['华沙', 'Warsaw', '波兰', 52.2297, 21.0122, 1],
  ['哥本哈根', 'Copenhagen', '丹麦', 55.6761, 12.5683, 1], ['斯德哥尔摩', 'Stockholm', '瑞典', 59.3293, 18.0686, 1], ['奥斯陆', 'Oslo', '挪威', 59.9139, 10.7522, 1],
  ['赫尔辛基', 'Helsinki', '芬兰', 60.1699, 24.9384, 2], ['特罗姆瑟', 'Tromsø', '挪威', 69.6492, 18.9553, 1], ['雷克雅未克', 'Reykjavik', '冰岛', 64.1466, -21.9426, 0],
  ['马德里', 'Madrid', '西班牙', 40.4168, -3.7038, 1], ['巴塞罗那', 'Barcelona', '西班牙', 41.3874, 2.1686, 1], ['里斯本', 'Lisbon', '葡萄牙', 38.7223, -9.1393, 0],
  ['罗马', 'Rome', '意大利', 41.9028, 12.4964, 1], ['米兰', 'Milan', '意大利', 45.4642, 9.19, 1], ['雅典', 'Athens', '希腊', 37.9838, 23.7275, 2],
  ['基辅', 'Kyiv', '乌克兰', 50.4501, 30.5234, 2], ['拉各斯', 'Lagos', '尼日利亚', 6.5244, 3.3792, 1], ['内罗毕', 'Nairobi', '肯尼亚', -1.2921, 36.8219, 3],
  ['亚的斯亚贝巴', 'Addis Ababa', '埃塞俄比亚', 8.9806, 38.7578, 3], ['开普敦', 'Cape Town', '南非', -33.9249, 18.4241, 2], ['约翰内斯堡', 'Johannesburg', '南非', -26.2041, 28.0473, 2],
  ['卡萨布兰卡', 'Casablanca', '摩洛哥', 33.5731, -7.5898, 1], ['阿克拉', 'Accra', '加纳', 5.6037, -.187, 0], ['纽约', 'New York', '美国', 40.7128, -74.006, -5],
  ['波士顿', 'Boston', '美国', 42.3601, -71.0589, -5], ['华盛顿', 'Washington', '美国', 38.9072, -77.0369, -5], ['芝加哥', 'Chicago', '美国', 41.8781, -87.6298, -6],
  ['奥斯汀', 'Austin', '美国', 30.2672, -97.7431, -6], ['丹佛', 'Denver', '美国', 39.7392, -104.9903, -7], ['西雅图', 'Seattle', '美国', 47.6062, -122.3321, -8],
  ['旧金山', 'San Francisco', '美国', 37.7749, -122.4194, -8], ['洛杉矶', 'Los Angeles', '美国', 34.0522, -118.2437, -8], ['迈阿密', 'Miami', '美国', 25.7617, -80.1918, -5],
  ['檀香山', 'Honolulu', '美国', 21.3069, -157.8583, -10], ['安克雷奇', 'Anchorage', '美国', 61.2181, -149.9003, -9], ['温哥华', 'Vancouver', '加拿大', 49.2827, -123.1207, -8],
  ['多伦多', 'Toronto', '加拿大', 43.6532, -79.3832, -5], ['蒙特利尔', 'Montreal', '加拿大', 45.5017, -73.5673, -5], ['墨西哥城', 'Mexico City', '墨西哥', 19.4326, -99.1332, -6],
  ['哈瓦那', 'Havana', '古巴', 23.1136, -82.3666, -5], ['波哥大', 'Bogotá', '哥伦比亚', 4.711, -74.0721, -5], ['利马', 'Lima', '秘鲁', -12.0464, -77.0428, -5],
  ['圣地亚哥', 'Santiago', '智利', -33.4489, -70.6693, -3], ['布宜诺斯艾利斯', 'Buenos Aires', '阿根廷', -34.6037, -58.3816, -3], ['圣保罗', 'São Paulo', '巴西', -23.5505, -46.6333, -3],
  ['里约热内卢', 'Rio de Janeiro', '巴西', -22.9068, -43.1729, -3], ['马瑙斯', 'Manaus', '巴西', -3.119, -60.0217, -4], ['悉尼', 'Sydney', '澳大利亚', -33.8688, 151.2093, 11],
  ['墨尔本', 'Melbourne', '澳大利亚', -37.8136, 144.9631, 11], ['珀斯', 'Perth', '澳大利亚', -31.9505, 115.8605, 8], ['布里斯班', 'Brisbane', '澳大利亚', -27.4698, 153.0251, 10],
  ['达尔文', 'Darwin', '澳大利亚', -12.4634, 130.8456, 9.5], ['奥克兰', 'Auckland', '新西兰', -36.8485, 174.7633, 13], ['皇后镇', 'Queenstown', '新西兰', -45.0312, 168.6626, 13]
].map(c => ({ zh: c[0], en: c[1], country: c[2], lat: c[3], lon: c[4], tz: c[5] }));
function nearestCity(p) { let best = null, bd = 1e9; for (const c of CITIES) { const d = gcDist(p, c); if (d < bd) { bd = d; best = c; } } return { city: best, km: bd }; }
function oceanName(lat, lon) {
  if (lat < -58) return '南大洋'; if (lat > 68) return '北冰洋';
  if (lon > -72 && lon < 22 && lat > -58) return '大西洋';
  if (lon >= 22 && lon < 125 && lat < 25) return '印度洋';
  return '太平洋';
}
function describePlace(lat, lon, water) {
  const p = { lat, lon }, n = nearestCity(p), c = n.city, km = n.km;
  if (water && km > 120) return { title: oceanName(lat, lon), sub: `离最近的${c.zh}约 ${Math.round(km / 10) * 10} 公里`, city: c, km, water: true };
  if (km < 45) return { title: c.zh, sub: `${c.country} · ${c.en}`, city: c, km };
  if (km < 320) return { title: `${c.zh}附近`, sub: `${c.country} · 距市中心 ${Math.round(km)} 公里`, city: c, km };
  const dir = DIRS[Math.round(bearing(c, p) / 45) % 8];
  return { title: `${c.zh}以${dir}`, sub: `${c.country}方向 · 约 ${Math.round(km / 10) * 10} 公里`, city: c, km };
}
const CITY_ZONE = { 伦敦: 'Europe/London', 爱丁堡: 'Europe/London', 都柏林: 'Europe/Dublin', 巴黎: 'Europe/Paris', 里昂: 'Europe/Paris', 柏林: 'Europe/Berlin', 慕尼黑: 'Europe/Berlin', 阿姆斯特丹: 'Europe/Amsterdam', 布鲁塞尔: 'Europe/Brussels', 苏黎世: 'Europe/Zurich', 维也纳: 'Europe/Vienna', 布拉格: 'Europe/Prague', 华沙: 'Europe/Warsaw', 哥本哈根: 'Europe/Copenhagen', 斯德哥尔摩: 'Europe/Stockholm', 奥斯陆: 'Europe/Oslo', 赫尔辛基: 'Europe/Helsinki', 特罗姆瑟: 'Europe/Oslo', 马德里: 'Europe/Madrid', 巴塞罗那: 'Europe/Madrid', 里斯本: 'Europe/Lisbon', 罗马: 'Europe/Rome', 米兰: 'Europe/Rome', 雅典: 'Europe/Athens', 基辅: 'Europe/Kiev', 特拉维夫: 'Asia/Jerusalem', 开罗: 'Africa/Cairo', 卡萨布兰卡: 'Africa/Casablanca', 纽约: 'America/New_York', 波士顿: 'America/New_York', 华盛顿: 'America/New_York', 迈阿密: 'America/New_York', 芝加哥: 'America/Chicago', 奥斯汀: 'America/Chicago', 丹佛: 'America/Denver', 西雅图: 'America/Los_Angeles', 旧金山: 'America/Los_Angeles', 洛杉矶: 'America/Los_Angeles', 安克雷奇: 'America/Anchorage', 温哥华: 'America/Vancouver', 多伦多: 'America/Toronto', 蒙特利尔: 'America/Toronto', 哈瓦那: 'America/Havana', 圣地亚哥: 'America/Santiago', 悉尼: 'Australia/Sydney', 墨尔本: 'Australia/Melbourne', 奥克兰: 'Pacific/Auckland', 皇后镇: 'Pacific/Auckland' };
function zoneOffset(zone, d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d);
    const g = t => +p.find(x => x.type === t).value;
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - d.getTime()) / 9e5) / 4;
  } catch (e) { return null; }
}
function tzFor(lat, lon) {
  const n = nearestCity({ lat, lon }); if (n.km >= 900) return Math.round(lon / 15);
  const z = CITY_ZONE[n.city.zh], off = z ? zoneOffset(z) : null;
  return off == null ? n.city.tz : off;
}
function sunInfo(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), N = (date - start) / 864e5;
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (N + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -(utcH - 12) * 15; while (lon < -180) lon += 360; while (lon > 180) lon -= 360;
  return { decl, lon, utcH };
}
function localSky(lat, lon, tz, date = new Date()) {
  const s = sunInfo(date), H = (s.utcH + lon / 15 - 12) * 15 * D2R;
  const alt = Math.asin(Math.sin(lat * D2R) * Math.sin(s.decl * D2R) + Math.cos(lat * D2R) * Math.cos(s.decl * D2R) * Math.cos(H)) * R2D;
  const lh = ((s.utcH + (tz == null ? Math.round(lon / 15) : tz)) % 24 + 24) % 24;
  const time = `${String(Math.floor(lh)).padStart(2, '0')}:${String(Math.floor((lh % 1) * 60)).padStart(2, '0')}`;
  const phase = alt > 10 ? 'day' : alt > -1 ? 'golden' : alt > -10 ? 'dusk' : 'night';
  const label = { day: '白天', golden: lh < 12 ? '清晨' : '傍晚', dusk: lh < 12 ? '黎明' : '入夜', night: '夜里' }[phase];
  return { alt, phase, time, label, morning: lh < 12 };
}

/* Residents live at real addresses. 演示数据 except the visitor's own room. */
const ME = store.get('gebi3.me', null) || { lat: 31.2304, lon: 121.4737, city: '上海' };
const RESIDENTS = [
  { no: '302', preset: 'mine', handle: '你', lat: ME.lat, lon: ME.lon, city: ME.city, tagline: '电竞房加一个小酒吧', tags: ['电竞', '酒吧', 'AI 助手'], friends: ['204', '101', '303', '203'] },
  { no: '204', preset: 'pixel', city: '东京', lat: 35.6595, lon: 139.7005, tagline: '复古像素小游戏合集', tags: ['独立游戏', '像素'], friends: ['102', '304'] },
  { no: '101', preset: 'leaf', city: '成都', lat: 30.6598, lon: 104.0633, tagline: '代码和植物都需要浇水', tags: ['生活工具', '开源'], friends: ['203'] },
  { no: '303', preset: 'lab', city: '柏林', lat: 52.4996, lon: 13.4180, tagline: '凌晨三点的推理集群', tags: ['AI', '数据'], friends: ['104', '202', '301'] },
  { no: '301', handle: '@ottomo', name: '打字机书房', city: '巴黎', lat: 48.8530, lon: 2.3499, tagline: '把每个小工具都写成一封信', tags: ['工具', '写作'], works: [['Markdown 信纸', 'app'], ['每日一句', 'web']], hue: .08 },
  { no: '202', handle: '@sora', name: '云朵气象站', city: '雷克雅未克', lat: 64.1466, lon: -21.9426, tagline: '天气数据加上生成音乐', tags: ['可视化', '音频'], works: [['会唱歌的天气', 'web'], ['风向竖琴', 'game2']], hue: .55 },
  { no: '102', handle: '@nova', name: '星图咖啡', city: '旧金山', lat: 37.7599, lon: -122.4148, tagline: '一杯咖啡一个星座', tags: ['WebGL', '趣味'], works: [['星座连连看', 'game2'], ['咖啡因计算器', 'app']], hue: .72, friends: ['105'] },
  { no: '104', handle: '@kumo', name: '模型火车站', city: '伦敦', lat: 51.5226, lon: -.0802, tagline: '调度算法的可视化铁路', tags: ['算法', '可视化'], works: [['A* 调度台', 'web'], ['时刻表生成器', 'app'], ['铁路大亨 mini', 'game2']], hue: .12 },
  { no: '105', handle: '@rio', name: '地铁像素站', city: '纽约', lat: 40.7265, lon: -73.9815, tagline: '把通勤做成小游戏', tags: ['游戏', '城市'], works: [['线路图生成器', 'web'], ['早高峰', 'game2']], hue: .6, friends: ['107'] },
  { no: '106', handle: '@ari', name: '浪花合成器', city: '悉尼', lat: -33.8915, lon: 151.2767, tagline: '海浪声做成的乐器', tags: ['音频', '生成艺术'], works: [['冲浪节拍机', 'web'], ['潮汐时钟', 'app']], hue: .5, friends: ['204'] },
  { no: '107', handle: '@duda', name: '桑巴音序器', city: '圣保罗', lat: -23.5613, lon: -46.6565, tagline: '狂欢节节奏工坊', tags: ['音乐', '游戏'], works: [['鼓点编辑器', 'app'], ['狂欢节跑酷', 'game2']], hue: .9 },
  { no: '108', handle: '@dev', name: '香料实验室', city: '班加罗尔', lat: 12.9352, lon: 77.6245, tagline: '咖喱配方 Agent 与菜谱生成器', tags: ['AI', '美食'], works: [['咖喱配方 Agent', 'web'], ['香料轮盘', 'game2']], hue: .07, friends: ['302'] },
  { no: '304', handle: '@mira', name: '字体铺', city: '首尔', lat: 37.5563, lon: 126.9236, tagline: '正在搬进来，预计本周开张', state: 'reno', hue: .95 },
  { no: '203', handle: '@han', name: '竖排排版社', city: '台北', lat: 25.0418, lon: 121.5654, tagline: '中文竖排工具箱，装修中', state: 'reno', hue: .02 },
  { no: '109', handle: '@kofi', name: '鼓语电台', city: '阿克拉', lat: 5.6037, lon: -.187, tagline: '西非鼓点的节奏教学', tags: ['音乐', '教育'], works: [['节奏跟拍', 'game2']], hue: .1 },
  { no: '110', handle: '@lumi', name: '极光暗房', city: '特罗姆瑟', lat: 69.6492, lon: 18.9553, tagline: '用着色器冲洗极光照片', tags: ['图形学', '摄影'], works: [['极光着色器', 'web'], ['长曝光模拟器', 'app']], hue: .4, friends: ['202'] }
];
const CUSTOM = store.get('gebi3.custom', {});   // rooms the visitor created at new addresses
Object.values(CUSTOM).forEach(r => { if (!RESIDENTS.some(x => x.no === r.no)) RESIDENTS.push({ no: r.no, custom: true, handle: r.owner, name: r.name, city: r.city, lat: r.lat, lon: r.lon, tagline: '刚入住的新邻居', tags: ['新入住'] }); });

const today = new Date();
const DATE_STR = `${today.getMonth() + 1}月${today.getDate()}日 周${'日一二三四五六'[today.getDay()]}`;

/* ---------- 拾光 state ---------- */
const SKINS = {
  light: { name: '轻', bg: '#f6f4ee', ink: '#2a2a2e', mute: '#9a96a0', acc: '#4b7bec', frame: '#efe9de', line: '#e3ddd1' },
  capsule: { name: '扭蛋', bg: '#ffe3ec', ink: '#5a2440', mute: '#c07a98', acc: '#ff6fa0', frame: '#ff9fc1', line: '#ffb7cf' },
  key: { name: '键', bg: '#24262c', ink: '#efe7d6', mute: '#8b8778', acc: '#ffb454', frame: '#3a3d45', line: '#17181c' }
};
const SG = store.get('gebi.shiguang', null) || {
  skin: 'light',
  tasks: [
    { t: '给拾光的托盘菜单补上暗色样式', done: true },
    { t: '回复 @pixelmo 在黑板上的留言', done: false },
    { t: '录一段 30 秒的演示视频', done: false },
    { t: '整理 Bit 的知识卡片', done: true },
    { t: '周五前把扩展提交到 Edge 商店', done: false }
  ]
};
const saveSG = () => store.set('gebi.shiguang', SG);

/* ---------- guestbook ---------- */
const GB_EXAMPLES = [
  { name: '@pixelmo', text: '贪吃蛇打到 37 分，下次来挑战你的纪录', time: '昨天', ex: true },
  { name: '@leafcode', text: 'Bit 调的“零点特调”是什么味道？求配方', time: '昨天', ex: true },
  { name: '@byte', text: '洞洞板上的拾光便签好可爱，键盘主题能出同款吗', time: '2 天前', ex: true }
];
const GB = store.get('gebi.guestbook', []);

/* ============================================================
   Dynamic canvases: robot face, monitor code, note, game, chalk
   ============================================================ */
const faceCanvas = mkCanvas(256, 176); const faceCtx = faceCanvas.getContext('2d'); const faceTex = texOf(faceCanvas);
const robotState = { mood: 'idle', blink: 0, nextBlink: 2, talkT: 0 };
function drawFace(t) {
  const g = faceCtx, W = 256, H = 176;
  g.fillStyle = '#0b141e'; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 160); gr.addColorStop(0, 'rgba(98,230,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#62e6ff'; g.shadowColor = '#62e6ff'; g.shadowBlur = 18;
  const m = robotState.mood;
  if (m === 'think') {
    for (let i = 0; i < 3; i++) { const y = 80 + Math.sin(t * 6 - i * .9) * 10; g.beginPath(); g.arc(88 + i * 40, y, 11, 0, Math.PI * 2); g.fill(); }
  } else if (m === 'happy') {
    g.lineWidth = 12; g.strokeStyle = '#62e6ff'; g.lineCap = 'round';
    for (const x of [82, 174]) { g.beginPath(); g.arc(x, 82, 24, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  } else {
    let s = 1;
    if (robotState.blink > 0) s = Math.max(.08, Math.abs(Math.cos(robotState.blink * Math.PI)));
    const lookX = Math.sin(t * .7) * 6;
    for (const x of [82, 174]) { const h = 54 * s; rr(g, x - 17 + lookX, 74 - h / 2, 34, h, Math.min(16, h / 2)); g.fill(); }
    g.lineWidth = 7; g.strokeStyle = '#62e6ff'; g.lineCap = 'round';
    if (m === 'talk') { const o = 6 + Math.abs(Math.sin(t * 16)) * 14; rr(g, 108, 124, 40, o, Math.min(8, o / 2)); g.fill(); }
    else { g.beginPath(); g.arc(128, 116, 16, Math.PI * .15, Math.PI * .85); g.stroke(); }
  }
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,.04)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  faceTex.needsUpdate = true;
}
function robotMood(m) { robotState.mood = m; if (m === 'talk') robotState.talkT = 1.2; }

const codeCanvas = mkCanvas(512, 288); const codeCtx = codeCanvas.getContext('2d'); const codeTex = texOf(codeCanvas);
const CODE = [
  "import { Room, Item } from '@gebi/core'", '',
  '// 302 · 零点电竞酒吧', 'export const room = new Room({', "  owner: 'me',", "  theme: 'midnight-bar',", '  size: [10, 8],', '})', '',
  'room.place(new Item("pegboard", {', "  wall: 'left',", "  entry: { kind: 'app', name: '拾光' },", '}))', '',
  'room.place(new Item("console", {', "  on: 'desk',", "  entry: { kind: 'game', surface: 'screen' },", '}))', '',
  'const bit = room.agent({', "  name: 'Bit',", "  tools: ['focus', 'open', 'mood', 'music'],", '})', '',
  'bit.on("visitor", async (v) => {', "  await bit.say('要喝点什么？')", '  const pick = await v.ask()', '  room.focus(pick)', '})', '',
  'export default room.publish()', ''
];
const KW = /\b(import|from|export|const|new|await|async|default)\b/g;
function drawCode(off) {
  const g = codeCtx, W = 512, H = 288, lh = 17;
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#161b26'; g.fillRect(0, 0, W, 22);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(14 + i * 16, 11, 5, 0, 7); g.fill(); });
  g.font = '12px ' + FONT.mono; g.fillStyle = '#8b93a5'; g.fillText('room.ts — gebi', 200, 15);
  g.save(); g.beginPath(); g.rect(0, 22, W, H - 22); g.clip();
  const start = Math.floor(off / lh), dy = off % lh;
  g.font = '13px ' + FONT.mono;
  for (let i = 0; i < 17; i++) {
    const idx = (start + i) % CODE.length, line = CODE[idx], y = 40 + i * lh - dy;
    g.fillStyle = '#3d4555'; g.fillText(String(idx + 1).padStart(2, ' '), 10, y);
    let x = 40;
    if (line.trim().startsWith('//')) { g.fillStyle = '#6a7388'; g.fillText(line, x, y); continue; }
    const parts = line.split(/('[^']*'|"[^"]*")/);
    for (const p of parts) {
      if (!p) continue;
      if (/^['"]/.test(p)) { g.fillStyle = '#ffb454'; g.fillText(p, x, y); x += g.measureText(p).width; continue; }
      const toks = p.split(KW);
      for (const tk of toks) { if (!tk) continue; g.fillStyle = /^(import|from|export|const|new|await|async|default)$/.test(tk) ? '#ff5aa8' : (/\w+\(/.test(tk) ? '#62e6ff' : '#d6dbe6'); g.fillText(tk, x, y); x += g.measureText(tk).width; }
    }
  }
  g.restore();
  codeTex.needsUpdate = true;
}

const heatCanvas = (() => {
  const c = mkCanvas(200, 320), g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, 200, 320);
  g.font = '13px ' + FONT.mono; g.fillStyle = '#8b93a5'; g.fillText('commits · 2026', 14, 26);
  for (let col = 0; col < 7; col++) for (let row = 0; row < 26; row++) {
    const v = r(); const a = v < .3 ? .08 : v < .55 ? .3 : v < .8 ? .6 : 1;
    g.fillStyle = `rgba(98,230,255,${a})`; rr(g, 16 + col * 25, 40 + row * 10.4, 20, 8, 2); g.fill();
  }
  return c;
})();
const heatTex = texOf(heatCanvas);

const noteCanvas = mkCanvas(256, 320); const noteCtx = noteCanvas.getContext('2d'); const noteTex = texOf(noteCanvas);
function drawNote() {
  const g = noteCtx, W = 256, H = 320, sk = SKINS[SG.skin];
  g.fillStyle = sk.bg; g.fillRect(0, 0, W, H);
  const done = SG.tasks.filter(t => t.done).length;
  g.fillStyle = sk.ink; g.font = (SG.skin === 'key' ? '28px ' + FONT.mono : '700 28px ' + FONT.body); g.fillText('拾光', 18, 44);
  g.fillStyle = sk.mute; g.font = '13px ' + FONT.body; g.fillText(`${DATE_STR} · ${done}/${SG.tasks.length}`, 18, 66);
  const list = SG.tasks.slice(0, 6);
  list.forEach((t, i) => {
    const y = 86 + i * 37;
    if (SG.skin === 'capsule') { g.fillStyle = ['#ffffff', '#fff4c9', '#dff6ff'][i % 3]; rr(g, 12, y, W - 24, 30, 15); g.fill(); }
    else if (SG.skin === 'key') { g.fillStyle = '#17181c'; rr(g, 12, y + 3, W - 24, 30, 6); g.fill(); g.fillStyle = '#33363e'; rr(g, 12, y, W - 24, 30, 6); g.fill(); }
    else { g.fillStyle = sk.line; g.fillRect(16, y + 33, W - 32, 1); }
    const cx = 32, cy = y + 15;
    g.strokeStyle = t.done ? sk.acc : sk.mute; g.lineWidth = 2;
    if (SG.skin === 'key') { rr(g, cx - 8, cy - 8, 16, 16, 3); } else { g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); }
    if (t.done) { g.fillStyle = sk.acc; g.fill(); g.strokeStyle = SG.skin === 'key' ? '#24262c' : '#fff'; g.beginPath(); g.moveTo(cx - 4, cy); g.lineTo(cx - 1, cy + 3); g.lineTo(cx + 4, cy - 3); g.stroke(); }
    else g.stroke();
    g.fillStyle = t.done ? sk.mute : sk.ink; g.font = (SG.skin === 'key' ? '13px ' + FONT.mono : '14px ' + FONT.body);
    const txt = wrapText(g, t.t, W - 72, 1)[0] || '';
    g.fillText(txt, 50, cy + 5);
    if (t.done) { g.strokeStyle = sk.mute; g.lineWidth = 1.2; g.beginPath(); g.moveTo(50, cy); g.lineTo(50 + g.measureText(txt).width, cy); g.stroke(); }
  });
  noteTex.needsUpdate = true;
  if (S.dyn && S.dyn.noteFrame) S.dyn.noteFrame.color.set(sk.frame);
}

const chalkCanvas = mkCanvas(512, 372); const chalkCtx = chalkCanvas.getContext('2d'); const chalkTex = texOf(chalkCanvas);
function drawChalk() {
  const g = chalkCtx, W = 512, H = 372, r = rng(3);
  g.fillStyle = '#1f2b24'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(255,255,255,${.015 + r() * .03})`; g.lineWidth = 10 + r() * 30; g.beginPath(); const x = r() * W, y = r() * H; g.moveTo(x, y); g.lineTo(x + 40 + r() * 80, y + (r() - .5) * 20); g.stroke(); }
  g.fillStyle = '#f3efe2'; g.font = '38px ' + FONT.chalk; g.fillText('访客留言', 26, 56);
  g.fillStyle = '#ffcf7a'; g.font = '20px ' + FONT.chalk; g.fillText('今日特调 · 零点', 316, 52);
  g.strokeStyle = 'rgba(243,239,226,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(26, 72); g.lineTo(486, 70); g.stroke();
  const key = CLOUD.ready && S.view === 'room' ? roomKey(S.room) : null;
  const all = key ? roomMessages(key).filter(m => !m.reply).reverse().slice(0, 3).map(m => ({ text: m.text, name: nameOfUid(m.author) })) : GB.concat(GB_EXAMPLES).slice(0, 3);
  if (key && !all.length) { g.font = '24px ' + FONT.chalk; g.fillStyle = 'rgba(243,239,226,.7)'; g.fillText('还没有留言，来写第一句吧', 30, 130); }
  let y = 112;
  all.forEach((m, i) => {
    g.font = '22px ' + FONT.chalk; g.fillStyle = ['#f3efe2', '#bfe8ff', '#ffd1e3'][i % 3];
    const lines = wrapText(g, m.text, 440, 2);
    lines.forEach(l => { g.fillText(l, 30, y); y += 28; });
    g.font = '16px ' + FONT.chalk; g.fillStyle = 'rgba(243,239,226,.6)'; g.fillText('— ' + m.name, 300, y - 2); y += 26;
  });
  chalkTex.needsUpdate = true;
}

/* ---------- snake game (the "web game" inside the console) ---------- */
const GW = 20, GH = 16, CELL = 8;
const game = { c: mkCanvas(GW * CELL, GH * CELL), snake: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, food: { x: 10, y: 8 }, score: 0, best: store.get('gebi.best', 0), mode: 'attract', acc: 0, step: .12, t: 0, r: rng(42) };
game.g = game.c.getContext('2d'); game.tex = texOf(game.c, true);
game.c.setAttribute('aria-label', '霓虹贪吃蛇游戏画面');
function gReset() { game.snake = [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }]; game.dir = { x: 1, y: 0 }; game.next = { x: 1, y: 0 }; game.score = 0; game.step = .12; gFood(); }
function gFood() { let p; do { p = { x: Math.floor(game.r() * GW), y: Math.floor(game.r() * GH) }; } while (game.snake.some(s => s.x === p.x && s.y === p.y)); game.food = p; }
function gSafe(x, y) { if (x < 0 || y < 0 || x >= GW || y >= GH) return false; for (let i = 0; i < game.snake.length - 1; i++) if (game.snake[i].x === x && game.snake[i].y === y) return false; return true; }
function gAI() {
  const h = game.snake[0], dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  let best = null, bd = 1e9;
  for (const d of dirs) {
    if (d.x === -game.dir.x && d.y === -game.dir.y) continue;
    const nx = h.x + d.x, ny = h.y + d.y; if (!gSafe(nx, ny)) continue;
    let free = 0; for (const e of dirs) if (gSafe(nx + e.x, ny + e.y)) free++;
    const dist = Math.abs(nx - game.food.x) + Math.abs(ny - game.food.y) + (free === 0 ? 50 : 0) + game.r() * .3;
    if (dist < bd) { bd = dist; best = d; }
  }
  if (best) game.next = best;
}
function gTick() {
  if (game.mode === 'ready' || game.mode === 'over') return;
  if (game.mode === 'attract') gAI();
  game.dir = game.next;
  const h = game.snake[0], nx = h.x + game.dir.x, ny = h.y + game.dir.y;
  if (!gSafe(nx, ny)) {
    if (game.mode === 'attract') { gReset(); return; }
    game.mode = 'over'; if (game.score > game.best) { game.best = game.score; store.set('gebi.best', game.best); }
    updateGameHud(); return;
  }
  game.snake.unshift({ x: nx, y: ny });
  if (nx === game.food.x && ny === game.food.y) { game.score++; game.step = Math.max(.065, game.step - .003); gFood(); updateGameHud(); }
  else game.snake.pop();
}
function gDraw() {
  const g = game.g, W = GW * CELL, H = GH * CELL;
  g.fillStyle = '#0a0e1c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#16203a'; for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) g.fillRect(x * CELL + 3, y * CELL + 3, 2, 2);
  const pulse = (Math.sin(game.t * 8) + 1) / 2;
  g.fillStyle = pulse > .5 ? '#ff5aa8' : '#ff86c0'; g.fillRect(game.food.x * CELL + 1, game.food.y * CELL + 1, CELL - 2, CELL - 2);
  game.snake.forEach((s, i) => { g.fillStyle = i === 0 ? '#ffb454' : (i % 2 ? '#62e6ff' : '#3fc6e6'); g.fillRect(s.x * CELL, s.y * CELL, CELL - 1, CELL - 1); });
  g.font = '8px ' + FONT.mono; g.textBaseline = 'top';
  g.fillStyle = '#e8e4f0'; g.fillText(String(game.score).padStart(3, '0'), 3, 2);
  if (game.mode === 'attract') { if (Math.floor(game.t * 2) % 2) { g.fillStyle = '#ffb454'; g.fillText('DEMO', W - 24, 2); } }
  if (game.mode === 'ready' || game.mode === 'over') {
    g.fillStyle = 'rgba(10,14,28,.78)'; g.fillRect(0, 44, W, 42);
    g.fillStyle = '#ffb454'; g.font = '10px ' + FONT.mono; g.textAlign = 'center';
    g.fillText(game.mode === 'over' ? 'GAME OVER' : 'NEON SNAKE', W / 2, 52);
    g.fillStyle = '#e8e4f0'; g.font = '8px ' + FONT.mono; g.fillText(game.mode === 'over' ? 'PRESS ANY ARROW' : 'PRESS AN ARROW KEY', W / 2, 70);
    g.textAlign = 'left';
  }
  g.textBaseline = 'alphabetic';
  game.tex.needsUpdate = true;
}
function gInput(d) {
  if (game.mode === 'ready' || game.mode === 'over' || game.mode === 'attract') { gReset(); game.mode = 'play'; game.next = d.x === -1 ? { x: 1, y: 0 } : d; updateGameHud(); return; }
  if (d.x === -game.dir.x && d.y === -game.dir.y) return;
  game.next = d;
}
gReset();

/* ============================================================
   Textures for room shells
   ============================================================ */
function floorTex(kind, tint) {
  const c = mkCanvas(1024, 1024), g = c.getContext('2d'), r = rng(hash(kind + tint));
  const base = new THREE.Color(tint);
  if (kind === 'wood') {
    const pw = 64;
    for (let x = 0; x < 1024; x += pw) {
      let y = -r() * 300;
      while (y < 1024) {
        const len = 220 + r() * 300, k = .82 + r() * .3;
        const col = base.clone().multiplyScalar(k);
        g.fillStyle = '#' + col.getHexString(); g.fillRect(x, y, pw, len);
        g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1;
        for (let i = 0; i < 5; i++) { g.beginPath(); const gx = x + 6 + r() * (pw - 12); g.moveTo(gx, y); g.bezierCurveTo(gx + 6, y + len * .3, gx - 6, y + len * .6, gx + 2, y + len); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y, pw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, 0, 2, 1024);
    }
  } else if (kind === 'tile') {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const col = base.clone().multiplyScalar((x + y) % 2 ? .78 : 1.04);
      g.fillStyle = '#' + col.getHexString(); g.fillRect(x * 128, y * 128, 128, 128);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x * 128, y * 128, 128, 3); g.fillRect(x * 128, y * 128, 3, 128);
    }
  } else {
    g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '0,0,0'},${r() * .05})`; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 4, 2 + r() * 4); }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 1024); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
  }
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.3); return t;
}
const wallTex = (() => {
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,.06)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
  g.fillStyle = 'rgba(255,255,255,.4)'; for (let x = 2; x < 256; x += 32) g.fillRect(x, 0, 1, 256);
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
})();

/* ============================================================
   Item builders. Every builder makes a group facing +z; wall items
   have their back at z = 0.
   ============================================================ */
function child(g, key, def, defaults) {
  def.children = def.children || {};
  if (!def.children[key]) def.children[key] = clone(defaults);
  g.userData.iid = def.uid + ':' + key; g.userData.def = def.children[key]; g.userData.parentDef = def; g.userData.isChild = true; g.userData.childKey = key;
  return g;
}
function ledMat() { if (!S.dyn.leds.length) S.dyn.leds.push(new THREE.MeshBasicMaterial({ color: 0xff5aa8 })); return S.dyn.leds[0]; }

function buildBarCounter(def) {
  const g = new THREE.Group();
  mesh(BG(4.2, 1.45, .85), M('#2b1b16', .75), 0, .725, 0, g);
  const slat = M('#3d271d', .7);
  for (let i = 0; i < 14; i++) mesh(BG(.2, 1.18, .04), slat, -1.95 + i * .3, .74, .44, g);
  mesh(BG(4.45, .12, 1.12), M('#8a5634', .38), 0, 1.51, .05, g);
  mesh(BG(4.2, .03, .03), GLOW('#ffb454', 2.4), 0, 1.42, .5, g);
  const rod = mesh(CY(.035, .035, 4.1, 10), M('#c79a4a', .28, .9), 0, .32, .62, g); rod.rotation.z = Math.PI / 2;
  // glasses on the counter
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: .05, metalness: .2, transparent: true, opacity: .45 });
  [[-1.2, .25], [-.9, .1], [.2, .2]].forEach(([x, z]) => { mesh(CY(.07, .055, .2, 14), glass, x, 1.67, z, g); });
  const drink = mesh(CY(.06, .05, .1, 14), GLOW('#ff5aa8', 1.2), -1.2, 1.63, .25, g);
  drink.castShadow = false;
  // pendant lamps
  S.dyn.pendants = S.dyn.pendants || [];
  for (const x of [-1.4, 0, 1.4]) {
    const cord = mesh(CY(.012, .012, 2.2, 6), M('#111', .6), x, 4.1, .05, g); cord.castShadow = false;
    const shade = mesh(CY(.08, .3, .32, 20, true), new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: .4, metalness: .6, side: THREE.DoubleSide }), x, 2.86, .05, g);
    shade.castShadow = false;
    const bulb = mesh(SPH(.09), GLOW('#ffcf8a', 2.6), x, 2.74, .05, g);
    const pl = new THREE.PointLight(0xffa04a, 1.2, 6.5, 2); pl.position.set(x, 2.55, .2); g.add(pl);
    S.dyn.pendants.push({ light: pl, bulb });
  }
  // vinyl player (child)
  const vin = new THREE.Group(); vin.position.set(1.55, 1.57, 0); vin.rotation.y = -.25;
  mesh(rboxGeo(.9, .16, .7, .05), M('#c9a06a', .55), 0, .08, 0, vin);
  mesh(CY(.29, .29, .03, 32), M('#2b2b30', .4, .6), -.1, .175, 0, vin);
  const rec = new THREE.Group(); rec.position.set(-.1, .2, 0); vin.add(rec);
  mesh(CY(.27, .27, .012, 40), M('#0d0d10', .25, .2), 0, 0, 0, rec);
  const label = mesh(CY(.09, .09, .014, 24), M('#ff5aa8', .5), 0, .001, 0, rec);
  mesh(BG(.03, .016, .05), M('#fff', .5), .05, .006, 0, rec);
  const arm = mesh(BG(.03, .03, .42), M('#d8d8dc', .3, .8), .28, .24, .02, vin); arm.rotation.y = .5;
  S.dyn.vinyl = rec;
  child(vin, 'vinyl', def, { name: '唱片机', entry: { kind: 'music', title: '唱片机', desc: '点一下放 lo-fi，再点一下停' } });
  g.add(vin);
  return g;
}
function buildBackShelf(def) {
  const g = new THREE.Group(), W = 3.8, r = rng(hash(def.uid));
  mesh(BG(W + .2, 2.3, .04), M('#1a1218', .22, .6), 0, 2.75, .02, g);
  const wood = M('#5b3a26', .55);
  const glassMats = ['#c9792d', '#3f7d4f', '#9fc7d8', '#7a1f3d', '#d8c48a'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .12, metalness: .2, transparent: true, opacity: .84, emissive: c, emissiveIntensity: .25 }));
  for (const y of [1.95, 2.7, 3.45]) {
    mesh(BG(W, .07, .42), wood, 0, y, .23, g);
    mesh(BG(W - .1, .02, .02), GLOW('#ffb06a', 2), 0, y + .05, .05, g);
    let x = -W / 2 + .2;
    while (x < W / 2 - .2) {
      const m = glassMats[Math.floor(r() * glassMats.length)], t = r();
      if (t < .5) { const h = .34 + r() * .12; mesh(CY(.085, .085, h, 14), m, x, y + .035 + h / 2, .24, g); mesh(CY(.028, .04, .16, 10), m, x, y + .035 + h + .08, .24, g); }
      else if (t < .8) { mesh(BG(.16, .3, .16), m, x, y + .185, .24, g); mesh(CY(.03, .03, .1, 8), m, x, y + .385, .24, g); }
      else { const s = mesh(SPH(.12, 14, 10), m, x, y + .155, .24, g); s.scale.y = 1.1; mesh(CY(.025, .03, .14, 8), m, x, y + .33, .24, g); }
      x += .22 + r() * .14;
    }
  }
  for (const x of [-W / 2 - .05, W / 2 + .05]) mesh(BG(.08, 1.7, .44), wood, x, 2.7, .23, g);
  return g;
}
function buildStool() {
  const g = new THREE.Group(), metal = M('#9ea3ad', .3, .85);
  mesh(CY(.36, .33, .13, 24), M('#8c2f39', .55), 0, 1.12, 0, g);
  mesh(CY(.045, .045, 1.05, 10), metal, 0, .55, 0, g);
  mesh(CY(.3, .32, .05, 24), metal, 0, .025, 0, g);
  const ring = mesh(new THREE.TorusGeometry(.24, .022, 8, 28), metal, 0, .45, 0, g); ring.rotation.x = Math.PI / 2;
  return g;
}
function buildRobot(def) {
  const g = new THREE.Group();
  const shell = M('#ece6da', .32, .08), dark = M('#262a33', .45, .5), accent = M('#ff5a6e', .45);
  mesh(CY(.26, .36, 1.25, 22), dark, 0, .625, 0, g);
  mesh(CY(.42, .46, .06, 26), GLOW('#62e6ff', 1.4), 0, 1.22, 0, g);
  const rig = new THREE.Group(); rig.position.y = 1.25; g.add(rig);
  mesh(rboxGeo(.95, 1.0, .75, .24), shell, 0, .55, 0, rig);
  mesh(rboxGeo(.52, .3, .04, .06), dark, 0, .55, .38, rig);
  for (let i = 0; i < 3; i++) mesh(BG(.07, .07, .02), GLOW(['#62e6ff', '#ffb454', '#ff5aa8'][i], 1.8), -.13 + i * .13, .55, .405, rig);
  const b1 = mesh(new THREE.ConeGeometry(.1, .18, 4), accent, -.09, .98, .37, rig); b1.rotation.z = -Math.PI / 2;
  const b2 = mesh(new THREE.ConeGeometry(.1, .18, 4), accent, .09, .98, .37, rig); b2.rotation.z = Math.PI / 2;
  mesh(SPH(.045), accent, 0, .98, .39, rig);
  const mkArm = (side) => {
    const a = new THREE.Group(); a.position.set(side * .56, .84, 0); rig.add(a);
    mesh(SPH(.13, 16, 12), shell, 0, 0, 0, a); mesh(CY(.085, .085, .5, 12), shell, 0, -.3, 0, a); mesh(SPH(.1, 14, 10), dark, 0, -.6, 0, a);
    return a;
  };
  const armL = mkArm(-1); armL.rotation.z = -.18;
  const armR = mkArm(1); armR.rotation.z = 2.35; armR.rotation.x = -.2;
  const shaker = new THREE.Group(); shaker.position.set(0, -.68, 0); armR.add(shaker);
  mesh(CY(.09, .075, .3, 16), M('#d9dde3', .18, .95), 0, -.1, 0, shaker); mesh(CY(.05, .09, .1, 16), M('#d9dde3', .18, .95), 0, -.3, 0, shaker);
  const head = new THREE.Group(); head.position.y = 1.18; rig.add(head);
  mesh(CY(.12, .14, .18, 14), dark, 0, -.06, 0, head);
  mesh(rboxGeo(1.06, .78, .82, .26), shell, 0, .38, 0, head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.84, .58), new THREE.MeshBasicMaterial({ map: faceTex, color: new THREE.Color(1.15, 1.15, 1.15) }));
  face.position.set(0, .4, .418); head.add(face);
  for (const s of [-1, 1]) { const e = mesh(CY(.13, .13, .08, 18), accent, s * .56, .4, 0, head); e.rotation.z = Math.PI / 2; }
  mesh(CY(.018, .018, .32, 8), dark, 0, .92, 0, head);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#62e6ff').multiplyScalar(2.4) });
  const bulb = mesh(SPH(.07, 14, 10), bulbMat, 0, 1.1, 0, head);
  S.dyn.robot = { g, rig, head, armR, armL, bulb, bulbMat };
  return g;
}
function buildDesk(def) {
  const g = new THREE.Group(), opts = def.opts || {};
  mesh(BG(3.8, .1, 1.4), M('#18171d', .45, .2), 0, 1.2, 0, g);
  const strip = mesh(BG(3.8, .03, .03), ledMat(), 0, 1.16, .71, g); strip.castShadow = false;
  for (const x of [-1.8, 1.8]) mesh(BG(.08, 1.15, 1.2), M('#222129', .5, .4), x, .575, 0, g);
  mesh(BG(3.4, .06, .06), M('#222129', .5, .4), 0, .4, -.4, g);
  mesh(BG(1.7, .01, .62), M('#2a1f3d', .9), .25, 1.256, .25, g);
  // main monitor
  mesh(BG(.5, .03, .3), M('#1c1c22', .4, .6), .15, 1.265, -.35, g);
  mesh(BG(.07, .55, .07), M('#1c1c22', .4, .6), .15, 1.53, -.42, g);
  mesh(rboxGeo(2.1, 1.22, .08, .04), M('#0d0d12', .35, .3), .15, 2.14, -.44, g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 1.1), new THREE.MeshBasicMaterial({ map: codeTex })); scr.position.set(.15, 2.14, -.395); g.add(scr);
  // vertical monitor
  const vm = new THREE.Group(); vm.position.set(-1.35, 0, -.3); vm.rotation.y = .35; g.add(vm);
  mesh(BG(.4, .03, .26), M('#1c1c22', .4, .6), 0, 1.265, 0, vm);
  mesh(BG(.06, .4, .06), M('#1c1c22', .4, .6), 0, 1.46, -.06, vm);
  mesh(rboxGeo(.72, 1.14, .07, .03), M('#0d0d12', .35, .3), 0, 2.02, -.08, vm);
  const vs = new THREE.Mesh(new THREE.PlaneGeometry(.64, 1.04), new THREE.MeshBasicMaterial({ map: heatTex })); vs.position.set(0, 2.02, -.04); vm.add(vs);
  // keyboard with per-key RGB (merged into one draw call)
  mesh(rboxGeo(1.1, .05, .38, .02), M('#111116', .4, .3), .15, 1.28, .25, g);
  const keys = [];
  for (let col = 0; col < 15; col++) for (let row = 0; row < 5; row++) {
    const c = new THREE.Color().setHSL(col / 15 * .8 + .5, .9, .6);
    keys.push({ w: .058, h: .028, d: .058, x: .15 - .49 + col * .07, y: 1.318, z: .25 - .14 + row * .07, color: '#' + c.getHexString() });
  }
  const km = new THREE.Mesh(mergeBoxes(keys), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.2, 1.2, 1.2) }));
  g.add(km);
  mesh(rboxGeo(.13, .05, .22, .05), M('#16161c', .4, .2), .95, 1.28, .25, g);
  mesh(SPH(.012), GLOW('#ff5aa8', 2), .95, 1.31, .2, g);
  // mug
  mesh(CY(.08, .07, .17, 16), M('#e7e1d6', .5), 1.55, 1.335, .1, g);
  const h = mesh(new THREE.TorusGeometry(.05, .014, 8, 16), M('#e7e1d6', .5), 1.64, 1.34, .1, g);
  // monitor glow on wall
  const gl = new THREE.PointLight(0x62e6ff, .7, 4.5, 2); gl.position.set(.15, 2.1, .4); g.add(gl);
  if (opts.console !== false) {
    const c = new THREE.Group();
    c.position.set(-1.35, 1.25, .3); c.rotation.order = 'YXZ'; c.rotation.y = -.55; g.add(c);
    const stand = mesh(BG(.5, .08, .34), M('#2c2c35', .5, .3), 0, .04, 0, c);
    const body = new THREE.Group(); body.position.set(0, .52, -.02); body.rotation.x = -.28; c.add(body);
    mesh(rboxGeo(.62, .94, .15, .09), M('#ff6f61', .42), 0, 0, 0, body);
    mesh(rboxGeo(.52, .42, .02, .03), M('#272033', .5), 0, .17, .075, body);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(.44, .35), new THREE.MeshBasicMaterial({ map: game.tex, color: new THREE.Color(1.1, 1.1, 1.1) })); sm.position.set(0, .17, .087); body.add(sm);
    mesh(BG(.15, .045, .03), M('#272033', .5), -.15, -.2, .08, body); mesh(BG(.045, .15, .03), M('#272033', .5), -.15, -.2, .08, body);
    for (const [x, y] of [[.13, -.16], [.22, -.23]]) { const b = mesh(CY(.045, .045, .03, 16), M('#2b2340', .4), x, y, .085, body); b.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 3; i++) { const sl = mesh(BG(.015, .09, .01), M('#c94f44', .5), .12 + i * .04, -.37, .077, body); sl.rotation.z = -.5; }
    c.userData.screen = { canvas: game.c, tex: game.tex, pixel: true, restore() {} };
    child(c, 'console', def, { name: '游戏机', entry: { kind: 'game', title: '霓虹贪吃蛇', desc: '房主自己写的网页小游戏，屏幕里一直在自动演示' } });
  }
  return g;
}
function buildChair() {
  const g = new THREE.Group(), black = M('#18171c', .55), pink = M('#d43d86', .5);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = mesh(BG(.07, .06, .5), M('#2a2a30', .4, .6), Math.sin(a) * .25, .12, Math.cos(a) * .25, g); leg.rotation.y = a; mesh(SPH(.05, 10, 8), black, Math.sin(a) * .5, .05, Math.cos(a) * .5, g); }
  mesh(CY(.05, .05, .5, 12), M('#2a2a30', .4, .6), 0, .4, 0, g);
  mesh(rboxGeo(1.0, .2, .95, .08), black, 0, .76, .05, g);
  for (const s of [-1, 1]) mesh(rboxGeo(.13, .17, .9, .05), pink, s * .47, .85, .05, g);
  const back = new THREE.Group(); back.position.set(0, .85, -.4); back.rotation.x = -.16; g.add(back);
  mesh(rboxGeo(.95, 1.6, .2, .1), black, 0, .8, 0, back);
  for (const s of [-1, 1]) mesh(BG(.12, 1.4, .02), pink, s * .3, .8, .105, back);
  mesh(rboxGeo(.5, .22, .14, .06), pink, 0, 1.38, .12, back);
  for (const s of [-1, 1]) { mesh(BG(.07, .32, .07), M('#2a2a30', .4, .6), s * .58, 1.0, .05, g); mesh(rboxGeo(.13, .05, .46, .02), black, s * .58, 1.18, .05, g); }
  return g;
}
function buildRug(def, theme) {
  const c = mkCanvas(512, 512), x = c.getContext('2d');
  const cols = theme.rug || ['#3a2350', '#ff5aa8', '#62e6ff', '#2a1a3c'];
  x.fillStyle = cols[0]; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6; i++) { x.strokeStyle = cols[1 + i % 3]; x.globalAlpha = .55; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 230 - i * 38, 0, Math.PI * 2); x.stroke(); }
  x.globalAlpha = 1;
  const t = texOf(c);
  const side = M(cols[3], .95), top = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  const m = new THREE.Mesh(CY(1.7, 1.7, .03, 56), [side, top, top]); m.position.y = .016; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
function buildBeanbag(def, theme) {
  const g = new THREE.Group();
  const m = mesh(SPH(.7, 28, 18), M(theme.bean || '#2f6f73', .95), 0, .38, 0, g); m.scale.set(1, .6, .95);
  const t = mesh(SPH(.42, 20, 14), M(theme.bean || '#2f6f73', .95), -.05, .62, -.25, g); t.scale.set(1.2, .7, .7);
  return g;
}
function buildCoffeeTable() {
  const g = new THREE.Group();
  mesh(CY(.58, .58, .06, 40), M('#c9a06a', .5), 0, .58, 0, g);
  mesh(CY(.05, .05, .55, 12), M('#1c1c22', .4, .6), 0, .29, 0, g);
  mesh(CY(.3, .32, .04, 24), M('#1c1c22', .4, .6), 0, .02, 0, g);
  mesh(new THREE.ConeGeometry(.12, .14, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: .45, roughness: .05, side: THREE.DoubleSide }), .15, .83, .1, g).rotation.x = Math.PI;
  mesh(CY(.012, .012, .12, 6), M('#cfe8ff', .1), .15, .67, .1, g);
  mesh(CY(.1, .03, .08, 20), GLOW('#62e6ff', 1.3), .15, .84, .1, g);
  mesh(rboxGeo(.3, .04, .2, .02), M('#2b2b33', .4), -.2, .63, -.12, g);
  return g;
}
function buildPlant(def) {
  const g = new THREE.Group(), r = rng(hash(def.uid));
  mesh(CY(.32, .25, .6, 22), M('#3a3350', .6), 0, .3, 0, g);
  mesh(CY(.29, .29, .03, 22), M('#2a1d14', 1), 0, .58, 0, g);
  const greens = [M('#3f8f5a', .7), M('#2f7a4c', .7), M('#57a86e', .7)];
  for (let i = 0; i < 11; i++) {
    const p = new THREE.Group(); p.position.y = .58; p.rotation.y = i / 11 * Math.PI * 2 + r(); p.rotation.x = .35 + r() * .5; g.add(p);
    const l = mesh(SPH(.3, 12, 8), greens[i % 3], 0, .55 + r() * .25, 0, p); l.scale.set(.32, 1.1 + r() * .5, .08);
  }
  return g;
}
function buildFloorLamp(def) {
  const g = new THREE.Group();
  mesh(CY(.3, .32, .05, 24), M('#1c1c22', .4, .6), 0, .025, 0, g);
  mesh(CY(.025, .025, 2.6, 8), M('#c79a4a', .3, .85), 0, 1.33, 0, g);
  const shade = mesh(CY(.22, .4, .48, 28, true), new THREE.MeshStandardMaterial({ color: '#efe0c4', roughness: .8, emissive: '#ffb36b', emissiveIntensity: .7, side: THREE.DoubleSide }), 0, 2.62, 0, g);
  shade.castShadow = false;
  mesh(SPH(.1), GLOW('#ffd59a', 2.2), 0, 2.55, 0, g);
  if (def.light !== false) { const pl = new THREE.PointLight(0xffb36b, .9, 6, 2); pl.position.set(0, 2.4, 0); g.add(pl); }
  return g;
}
function kioskCanvas(entry, cw = 384, ch = 232) {
  const c = mkCanvas(cw, ch), g = c.getContext('2d');
  const sc = cw / 384; g.scale(sc, sc); const w = 384, h = ch / sc;
  const kc0 = KIND_COLOR[entry.kind] || KIND_COLOR.link, kc = /^#[0-9a-f]{6}$/i.test(entry.color || '') ? [entry.color, shadeHex(entry.color, -.4)] : kc0;
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, kc[0]); gr.addColorStop(1, kc[1]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * .82, h * .2, 30 + i * 26, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.28)'; rr(g, 18, 18, 92, 26, 13); g.fill();
  g.fillStyle = '#fff'; g.font = '500 14px ' + FONT.body; g.fillText(KIND_LABEL[entry.kind] || '作品', 32, 36);
  g.font = '700 34px ' + FONT.body; g.fillStyle = '#fff';
  const lines = wrapText(g, entry.title || '未命名作品', w - 40, 2);
  lines.forEach((l, i) => g.fillText(l, 20, 100 + i * 42));
  g.font = '15px ' + FONT.mono; g.fillStyle = 'rgba(255,255,255,.75)';
  let host = entry.work ? '隔壁托管 · 单文件作品' : '还没绑定地址';
  if (!entry.work && validUrl(entry.url)) { try { host = new URL(entry.url).host; } catch (e) {} }
  g.fillText(host, 20, h - 22);
  if (entry.from) {
    const t = (entry.from.adapted ? '改编自 ' : '收藏自 ') + String(entry.from.by || '').slice(0, 12);
    g.font = '500 13px ' + FONT.body; const tw = g.measureText(t).width + 22;
    g.fillStyle = 'rgba(8,6,16,.55)'; rr(g, w - tw - 14, 18, tw, 26, 13); g.fill();
    g.fillStyle = '#ffd9a0'; g.fillText(t, w - tw - 3, 36);
  }
  return c;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); const t = k < 0 ? 0 : 1, a = Math.abs(k); c.r += (t - c.r) * a; c.g += (t - c.g) * a; c.b += (t - c.b) * a; return '#' + c.getHexString(); }
function buildKeepsake(def) {
  const g = new THREE.Group();
  mesh(CY(.32, .36, .7, 24), M('#2a2236', .5, .2), 0, .35, 0, g);
  mesh(CY(.37, .37, .04, 24), M('#c79a4a', .35, .7), 0, .72, 0, g);
  mesh(CY(.3, .3, .012, 24), GLOW('#ffb454', 1.3), 0, .745, 0, g);
  mesh(BG(.04, .34, .04), M('#2a2a30', .4, .6), 0, .9, -.02, g);
  const head = new THREE.Group(); head.position.y = 1.2; head.rotation.x = -.2; g.add(head);
  mesh(rboxGeo(.82, .54, .05, .03), M('#101016', .35, .3), 0, 0, 0, head);
  const entry = def.entry || { kind: 'web', title: '收藏' };
  const kc = kioskCanvas(entry), ktex = texOf(kc);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(.74, .447), new THREE.MeshBasicMaterial({ map: ktex, color: new THREE.Color(1.05, 1.05, 1.05) }));
  sc.position.z = .03; head.add(sc);
  g.userData.screen = { canvas: kc, tex: ktex, restore() { const x = kc.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(kioskCanvas(entry), 0, 0); ktex.needsUpdate = true; } };
  return g;
}
function buildKiosk(def) {
  const g = new THREE.Group();
  mesh(CY(.36, .38, .06, 24), M('#1c1c22', .4, .6), 0, .03, 0, g);
  mesh(BG(.09, 1.05, .09), M('#2a2a30', .4, .6), 0, .58, 0, g);
  const head = new THREE.Group(); head.position.y = 1.4; head.rotation.x = -.18; g.add(head);
  mesh(rboxGeo(1.5, .95, .08, .05), M('#101016', .35, .3), 0, 0, 0, head);
  const entry = def.entry || { kind: 'web', title: '展示屏' };
  const kc = kioskCanvas(entry), ktex = texOf(kc);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.38, .835), new THREE.MeshBasicMaterial({ map: ktex, color: new THREE.Color(1.05, 1.05, 1.05) }));
  sc.position.z = .042; head.add(sc);
  g.userData.screen = { canvas: kc, tex: ktex, restore() { const x = kc.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(kioskCanvas(entry), 0, 0); ktex.needsUpdate = true; } };
  return g;
}
function buildArcade(def, theme) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-.35, 0); s.lineTo(.3, 0); s.lineTo(.3, .95); s.lineTo(.46, 1.06); s.lineTo(.27, 1.17); s.lineTo(.16, 1.86); s.lineTo(.27, 2.06); s.lineTo(-.35, 2.06); s.lineTo(-.35, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: .9, bevelEnabled: false }); geo.rotateY(-Math.PI / 2); geo.translate(.45, 0, 0);
  const col = (def.entry && def.entry.color) || theme.arcade || '#3b2a6b';
  mesh(geo, M(col, .5), 0, 0, 0, g);
  const r = rng(hash(def.uid + (def.entry ? def.entry.title : '')));
  const c = mkCanvas(128, 112), x = c.getContext('2d');
  x.fillStyle = '#05060c'; x.fillRect(0, 0, 128, 112);
  const pal = ['#ff5aa8', '#62e6ff', '#ffb454', '#7ee0a1'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { if (r() < .25) continue; x.fillStyle = pal[i]; x.fillRect(12 + j * 18, 14 + i * 14, 10, 7); }
  x.fillStyle = '#e8e4f0'; x.fillRect(58, 96, 12, 5);
  x.font = '9px ' + FONT.mono; x.fillStyle = '#ffb454'; x.fillText('INSERT COIN', 34, 84);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.66, .58), new THREE.MeshBasicMaterial({ map: texOf(c, true), color: new THREE.Color(1.25, 1.25, 1.25) }));
  scr.position.set(0, 1.515, .228); scr.rotation.x = -Math.atan2(.11, .69); g.add(scr);
  const mc = mkCanvas(256, 64), mx = mc.getContext('2d');
  mx.fillStyle = '#120a1c'; mx.fillRect(0, 0, 256, 64); mx.font = '700 30px ' + FONT.body; mx.fillStyle = '#ffd36b'; mx.textAlign = 'center'; mx.textBaseline = 'middle';
  mx.fillText((def.entry && def.entry.title) || 'ARCADE', 128, 33);
  const mq = new THREE.Mesh(new THREE.PlaneGeometry(.82, .2), new THREE.MeshBasicMaterial({ map: texOf(mc), color: new THREE.Color(1.5, 1.5, 1.5) }));
  mq.position.set(0, 1.965, .222); mq.rotation.x = Math.atan2(.11, .2); g.add(mq);
  const stick = mesh(CY(.018, .018, .1, 8), M('#222', .4), -.16, 1.17, .35, g); stick.rotation.x = .4;
  mesh(SPH(.045), M('#ff5a6e', .4), -.16, 1.22, .37, g);
  [[.05, '#62e6ff'], [.15, '#ffb454'], [.25, '#7ee0a1']].forEach(([px, cc]) => mesh(CY(.03, .03, .03, 12), GLOW(cc, 1.3), px, 1.14, .37, g));
  return g;
}
function buildBookshelf(def) {
  const g = new THREE.Group(), r = rng(hash(def.uid)), wood = M('#4a3427', .6);
  mesh(BG(1.6, 2.6, .05), wood, 0, 1.3, -.3, g);
  for (const x of [-.78, .78]) mesh(BG(.05, 2.6, .62), wood, x, 1.3, 0, g);
  const books = [];
  const pal = ['#d9534f', '#f0ad4e', '#5bc0de', '#e9e2d0', '#6f5bd5', '#3f8f5a', '#ff8fb1', '#2c3e50'];
  for (let i = 0; i < 5; i++) {
    const y = .05 + i * .62; mesh(BG(1.52, .04, .6), wood, 0, y, 0, g);
    if (i === 4) break;
    let x = -.72;
    while (x < .68) { const w = .06 + r() * .07, h = .34 + r() * .2; if (r() < .1) { x += .12; continue; } books.push({ w, h, d: .4, x: x + w / 2, y: y + .02 + h / 2, z: .02, color: pal[Math.floor(r() * pal.length)] }); x += w + .008; }
  }
  mesh(BG(1.6, .05, .62), wood, 0, 2.6, 0, g);
  mesh(mergeBoxes(books), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), 0, 0, 0, g);
  return g;
}
function buildSofa(def, theme) {
  const g = new THREE.Group(), col = theme.sofa || '#5b4a8a', mat = M(col, .9);
  mesh(rboxGeo(2.3, .4, 1.0, .08), mat, 0, .3, 0, g);
  for (const x of [-.55, .55]) mesh(rboxGeo(1.05, .22, .82, .1), mat, x, .6, .06, g);
  mesh(rboxGeo(2.3, .72, .28, .1), mat, 0, .82, -.38, g);
  for (const x of [-1.16, 1.16]) mesh(rboxGeo(.26, .58, 1.0, .1), mat, x, .55, 0, g);
  mesh(rboxGeo(.42, .36, .14, .08), M('#ffb454', .9), -.7, .86, -.15, g).rotation.z = .15;
  return g;
}
function buildServerRack(def) {
  const g = new THREE.Group();
  mesh(BG(.95, 2.5, .9), M('#15161c', .45, .45), 0, 1.25, 0, g);
  mesh(BG(.85, 2.36, .02), M('#0b0b10', .3, .5), 0, 1.25, .455, g);
  for (let i = 0; i < 12; i++) {
    mesh(BG(.8, .14, .02), M('#22232c', .4, .4), 0, .3 + i * .18, .47, g);
    for (let j = 0; j < 3; j++) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(j === 0 ? '#7ee0a1' : j === 1 ? '#ffb454' : '#62e6ff').multiplyScalar(1.8) });
      const led = new THREE.Mesh(BG(.03, .03, .02), m); led.position.set(-.32 + j * .06, .3 + i * .18, .485); g.add(led);
      S.dyn.blinkers.push({ m, base: m.color.clone(), ph: Math.random() * 10, sp: 1 + Math.random() * 6 });
    }
  }
  return g;
}
function buildWhiteboard(def) {
  const g = new THREE.Group(), metal = M('#9ea3ad', .3, .8);
  for (const x of [-.95, .95]) { mesh(BG(.05, 2.2, .05), metal, x, 1.1, 0, g); mesh(BG(.05, .05, .7), metal, x, .03, 0, g); }
  mesh(BG(2.0, 1.3, .05), M('#e9e9ee', .4), 0, 1.6, 0, g);
  const c = mkCanvas(400, 260), x = c.getContext('2d'), entry = def.entry || {};
  x.fillStyle = '#f7f7fa'; x.fillRect(0, 0, 400, 260);
  x.strokeStyle = '#3d5afe'; x.lineWidth = 3; x.font = '22px ' + FONT.chalk; x.fillStyle = '#20232b';
  x.fillText(entry.title || '项目说明', 20, 36);
  const boxes = [[30, 80], [160, 80], [290, 80], [160, 170]];
  boxes.forEach(([bx, by], i) => { x.strokeStyle = ['#3d5afe', '#e53935', '#43a047', '#fb8c00'][i]; rr(x, bx, by, 86, 44, 8); x.stroke(); });
  x.strokeStyle = '#20232b'; x.lineWidth = 2; x.beginPath(); x.moveTo(116, 102); x.lineTo(160, 102); x.moveTo(246, 102); x.lineTo(290, 102); x.moveTo(203, 124); x.lineTo(203, 170); x.stroke();
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.22), new THREE.MeshBasicMaterial({ map: texOf(c), color: new THREE.Color(.95, .95, .95) }));
  sc.position.set(0, 1.6, .027); g.add(sc);
  return g;
}
function buildPegboard(def) {
  const g = new THREE.Group(), W = 3.8, H = 2.2;
  const pc = mkCanvas(512, 296), px = pc.getContext('2d');
  px.fillStyle = '#d9cfbf'; px.fillRect(0, 0, 512, 296);
  for (let x = 10; x < 512; x += 18) for (let y = 10; y < 296; y += 18) { px.fillStyle = '#7f7363'; px.beginPath(); px.arc(x, y, 3.2, 0, 7); px.fill(); px.fillStyle = 'rgba(255,255,255,.4)'; px.beginPath(); px.arc(x + .8, y + 1.2, 1.2, 0, 7); px.fill(); }
  const side = M('#bfb3a0', .8);
  const board = new THREE.Mesh(BG(W, H, .06), [side, side, side, side, new THREE.MeshStandardMaterial({ map: texOf(pc), roughness: .85 }), side]);
  board.position.z = .05; board.receiveShadow = true; g.add(board);
  const bar = mesh(BG(W - .2, .035, .035), ledMat(), 0, H / 2 + .06, .1, g); bar.castShadow = false;
  const hook = (x, y) => { const h = mesh(CY(.018, .018, .16, 8), M('#9a9aa2', .3, .8), x, y, .14, g); h.rotation.x = Math.PI / 2; };
  // 拾光 e-note
  const opts = def.opts || {};
  if (opts.note !== false) {
    const note = new THREE.Group(); note.position.set(-.5, -.02, .14); note.rotation.z = .035; g.add(note);
    const frameMat = new THREE.MeshStandardMaterial({ color: SKINS[SG.skin].frame, roughness: .45 }); S.dyn.noteFrame = frameMat;
    mesh(rboxGeo(1.02, 1.28, .07, .08), frameMat, 0, 0, 0, note);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.88, 1.1), new THREE.MeshBasicMaterial({ map: noteTex, color: new THREE.Color(.8, .8, .8) })); scr.position.z = .037; note.add(scr);
    mesh(SPH(.024), GLOW('#7ee0a1', 2.2), .42, -.57, .04, note);
    hook(-.5, .7);
    child(note, 'note', def, { name: '电子便签', entry: { kind: 'shiguang', title: '拾光', desc: '房主做的待办与便签 App：网页版、Windows 桌面版和浏览器扩展' } });
  }
  // headphones
  const hp = new THREE.Group(); hp.position.set(1.3, .45, .2); g.add(hp);
  mesh(new THREE.TorusGeometry(.3, .04, 10, 28, Math.PI), M('#1a1a20', .4, .3), 0, 0, 0, hp);
  for (const s of [-1, 1]) { const cu = mesh(CY(.12, .12, .1, 20), M('#d43d86', .45), s * .3, -.05, 0, hp); cu.rotation.z = Math.PI / 2; }
  hook(1.3, .74);
  // cassette (bindable)
  const cas = new THREE.Group(); cas.position.set(.72, -.62, .14); cas.rotation.z = -.06; g.add(cas);
  mesh(rboxGeo(.8, .52, .09, .04), M('#2b2b33', .45), 0, 0, 0, cas);
  const lc = mkCanvas(256, 96), lx = lc.getContext('2d'); lx.fillStyle = '#ffb454'; lx.fillRect(0, 0, 256, 96); lx.fillStyle = '#2a1706'; lx.font = '700 30px ' + FONT.body; lx.fillText('MIX · 通勤', 18, 44); lx.font = '18px ' + FONT.mono; lx.fillText('SIDE A', 18, 78);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(.66, .25), new THREE.MeshStandardMaterial({ map: texOf(lc), roughness: .7 })); lab.position.set(0, .07, .047); cas.add(lab);
  for (const s of [-1, 1]) { const rl = mesh(CY(.06, .06, .02, 16), M('#e9e2d0', .5), s * .15, -.12, .05, cas); rl.rotation.x = Math.PI / 2; }
  hook(.72, -.3);
  child(cas, 'cassette', def, { name: '磁带', entry: { kind: 'link', title: '通勤歌单', desc: '任何物件都可以绑定作品：在建造模式里给这盘磁带填上歌单地址', url: '' } });
  // pixel heart
  const pat = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  const bx = []; pat.forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') bx.push({ w: .07, h: .07, d: .07, x: (i - 3) * .075, y: (2.5 - j) * .075, z: 0, color: j < 2 && i < 3 ? '#ff9ab2' : '#ff4d6d' }); }));
  const heart = new THREE.Mesh(mergeBoxes(bx), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.25, 1.25) }));
  heart.position.set(.48, .5, .14); g.add(heart);
  // little cat figure
  const cat = new THREE.Group(); cat.position.set(-1.42, -.75, .14); g.add(cat);
  mesh(BG(.42, .05, .2), M('#8a6a4a', .6), 0, -.08, .04, cat);
  const cb = mesh(SPH(.13, 16, 12), M('#f2c14e', .6), 0, .05, .07, cat); cb.scale.set(1, .85, .9);
  mesh(SPH(.1, 16, 12), M('#f2c14e', .6), 0, .22, .09, cat);
  for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(.035, .07, 6), M('#f2c14e', .6), s * .06, .32, .09, cat); }
  // hanging plant
  const hpl = new THREE.Group(); hpl.position.set(-1.42, .42, .2); g.add(hpl);
  mesh(CY(.15, .11, .2, 16), M('#e9e2d0', .6), 0, 0, 0, hpl);
  for (let i = 0; i < 6; i++) { const l = mesh(SPH(.12, 10, 8), M(i % 2 ? '#3f8f5a' : '#57a86e', .7), Math.cos(i) * .12, -.1 - (i % 3) * .1, Math.sin(i) * .06 + .04, hpl); l.scale.set(.6, 1.3, .35); }
  hook(-1.42, .62);
  // trophy
  const pts = [[0, 0], [.09, 0], [.09, .02], [.03, .04], [.03, .12], [.1, .16], [.12, .28], [0, .3]].map(p => new THREE.Vector2(p[0], p[1]));
  mesh(new THREE.LatheGeometry(pts, 20), M('#e8b84a', .25, .9), 1.42, -.86, .18, g);
  return g;
}
function neonCanvas(text, color) {
  const c = mkCanvas(1024, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `120px ${FONT.neon}`;
  let size = 120; while (g.measureText(text).width > 940 && size > 40) { size -= 6; g.font = `${size}px ${FONT.neon}`; }
  g.shadowColor = color; g.shadowBlur = 34; g.strokeStyle = color; g.lineWidth = 10; g.strokeText(text, 512, 132);
  g.shadowBlur = 12; g.lineWidth = 5; g.strokeText(text, 512, 132);
  g.shadowBlur = 0; g.strokeStyle = '#fff2f8'; g.lineWidth = 2.2; g.strokeText(text, 512, 132);
  return c;
}
function buildNeon(def, theme) {
  const g = new THREE.Group();
  const text = def.text || theme.neon || 'GEBI', color = theme.neonColor || '#ff5aa8';
  mesh(BG(3.6, .95, .04), new THREE.MeshStandardMaterial({ color: '#120f18', roughness: .2, metalness: .3, transparent: true, opacity: .7 }), 0, 0, .03, g);
  const nc = neonCanvas(text, color);
  const mat = new THREE.MeshBasicMaterial({ map: texOf(nc), transparent: true, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9) });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(3.5, .875), mat); p.position.z = .06; g.add(p);
  const pl = new THREE.PointLight(new THREE.Color(color), .7, 5, 2); pl.position.set(0, -.2, .8); g.add(pl);
  S.dyn.neons.push({ mat, light: pl, canvas: nc, text, color });
  return g;
}
function buildChalkboard() {
  const g = new THREE.Group();
  mesh(BG(2.4, 1.8, .07), M('#5b3a26', .6), 0, 0, .035, g);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.22, 1.62), new THREE.MeshStandardMaterial({ map: chalkTex, roughness: .95, emissive: '#ffffff', emissiveMap: chalkTex, emissiveIntensity: .12 }));
  b.position.z = .072; b.receiveShadow = true; g.add(b);
  mesh(BG(2.2, .05, .12), M('#5b3a26', .6), 0, -.86, .1, g);
  mesh(BG(.14, .04, .04), M('#f3efe2', .9), .6, -.82, .12, g);
  return g;
}
function buildDoor(def, theme) {
  const g = new THREE.Group(), trim = M(theme.trim || '#3c2f58', .55);
  mesh(BG(1.5, .14, .16), trim, 0, 2.75, .03, g);
  for (const x of [-.69, .69]) mesh(BG(.12, 2.75, .16), trim, x, 1.375, .03, g);
  const pivot = new THREE.Group(); pivot.position.set(-.6, 0, 0); g.add(pivot);
  const leaf = new THREE.Group(); leaf.position.set(.6, 0, 0); pivot.add(leaf);
  mesh(BG(1.18, 2.66, .07), M('#3b2a24', .55), 0, 1.33, 0, leaf);
  for (const y of [.72, 1.86]) { mesh(BG(.86, .66, .02), M('#33231e', .6), 0, y, .045, leaf); mesh(BG(.86, .66, .02), M('#33231e', .6), 0, y, -.045, leaf); }
  const win = mesh(CY(.16, .16, .08, 28), GLOW('#ffcf8a', 1.5), 0, 2.2, 0, leaf); win.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(.17, .028, 8, 28), M('#c79a4a', .3, .85), 0, 2.2, .05, leaf);
  mesh(SPH(.05), M('#c79a4a', .3, .85), .46, 1.2, .08, leaf); mesh(SPH(.05), M('#c79a4a', .3, .85), .46, 1.2, -.08, leaf);
  const pc = mkCanvas(128, 64), px = pc.getContext('2d');
  px.fillStyle = TK.bg; px.fillRect(0, 0, 128, 64); drawPlate(px, 2, 6, 124, 52, S.room ? S.room.no : '302', .9);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.36, .18), new THREE.MeshStandardMaterial({ map: texOf(pc), roughness: .3, metalness: .5 }));
  plate.position.set(0, 1.64, .046); leaf.add(plate);
  S.dyn.door = { pivot, open: 0, goal: 0 };
  return g;
}
const ITEMS = {
  barCounter: { name: '吧台', w: 4.4, d: 1.1, build: buildBarCounter, nodelete: true },
  backShelf: { name: '酒柜', wall: true, build: buildBackShelf },
  stool: { name: '吧凳', w: .8, d: .8, build: buildStool, catalog: true },
  robot: { name: '酒保 Bit', w: 1.1, d: 1, build: buildRobot, nodelete: true },
  desk: { name: '电竞桌', w: 3.9, d: 1.5, build: buildDesk },
  chair: { name: '电竞椅', w: 1.2, d: 1.2, build: buildChair, catalog: true },
  rug: { name: '地毯', w: 3.4, d: 3.4, build: buildRug, flat: true },
  beanbag: { name: '懒人沙发', w: 1.4, d: 1.3, build: buildBeanbag, catalog: true },
  coffeeTable: { name: '小圆桌', w: 1.2, d: 1.2, build: buildCoffeeTable, catalog: true },
  plant: { name: '盆栽', w: .8, d: .8, build: buildPlant, catalog: true },
  floorLamp: { name: '落地灯', w: .8, d: .8, build: buildFloorLamp, catalog: true },
  keepsake: { name: '收藏品', w: .9, d: .9, build: buildKeepsake },
  kiosk: { name: '展示屏', w: 1.5, d: .8, build: buildKiosk, catalog: true, entry: { kind: 'web', title: '新作品', desc: '', url: '' } },
  arcade: { name: '街机', w: 1, d: 1, build: buildArcade, catalog: true, entry: { kind: 'game2', title: '新游戏', desc: '', url: '' } },
  bookshelf: { name: '书架', w: 1.7, d: .7, build: buildBookshelf, catalog: true },
  sofa: { name: '沙发', w: 2.4, d: 1.1, build: buildSofa, catalog: true },
  serverRack: { name: '机柜', w: 1, d: 1, build: buildServerRack, catalog: true, entry: { kind: 'app', title: '服务面板', desc: '', url: '' } },
  whiteboard: { name: '白板', w: 2.1, d: .8, build: buildWhiteboard, catalog: true, entry: { kind: 'repo', title: '项目说明', desc: '', url: '' } },
  pegboard: { name: '洞洞板', wall: true, build: buildPegboard },
  neon: { name: '霓虹招牌', wall: true, build: buildNeon },
  chalkboard: { name: '留言黑板', wall: true, build: buildChalkboard },
  door: { name: '门', wall: true, build: buildDoor, nodelete: true }
};
const KIND_LABEL = { view: '窗外', agent: 'AI 助手', shiguang: 'App', game: '小游戏', guestbook: '留言板', music: '音乐', door: '出口', web: '网页作品', game2: '小游戏', app: '工具 App', repo: '开源仓库', link: '链接' };
const KIND_COLOR = { web: ['#3d5afe', '#7c4dff'], game2: ['#ff5a6e', '#ff9a3d'], game: ['#ff5a6e', '#ff9a3d'], app: ['#00a389', '#3ec6e0'], repo: ['#2b2f3a', '#56607a'], link: ['#7a3cff', '#ff5aa8'], shiguang: ['#4b7bec', '#8fb3ff'], agent: ['#1f8fa8', '#62e6ff'], guestbook: ['#1f2b24', '#3d5a49'], music: ['#a83cff', '#ff5aa8'] };
const BIND_KINDS = ['web', 'game2', 'app', 'repo', 'link'];
const CAT_ICON = {
  kiosk: '<rect x="8" y="5" width="24" height="15" rx="2" fill="#3d5afe"/><rect x="19" y="20" width="2" height="9" fill="#a99db4"/><rect x="13" y="29" width="14" height="2" rx="1" fill="#a99db4"/>',
  arcade: '<path d="M12 4h16v8l-2 10 4 2v8H10v-8l4-2-2-10z" fill="#ff5a6e"/><rect x="15" y="8" width="10" height="9" fill="#0a0e1c"/>',
  bookshelf: '<rect x="9" y="4" width="22" height="27" fill="#4a3427"/><rect x="11" y="7" width="3" height="8" fill="#5bc0de"/><rect x="15" y="8" width="3" height="7" fill="#f0ad4e"/><rect x="11" y="19" width="4" height="8" fill="#d9534f"/><rect x="16" y="20" width="3" height="7" fill="#e9e2d0"/>',
  sofa: '<rect x="6" y="12" width="28" height="10" rx="3" fill="#5b4a8a"/><rect x="4" y="16" width="6" height="12" rx="2" fill="#5b4a8a"/><rect x="30" y="16" width="6" height="12" rx="2" fill="#5b4a8a"/><rect x="9" y="20" width="22" height="7" rx="2" fill="#6e5ca0"/>',
  beanbag: '<ellipse cx="20" cy="22" rx="14" ry="9" fill="#2f6f73"/><ellipse cx="18" cy="16" rx="8" ry="5" fill="#3a8288"/>',
  plant: '<path d="M14 22h12l-2 10h-8z" fill="#3a3350"/><ellipse cx="16" cy="14" rx="3" ry="8" fill="#3f8f5a" transform="rotate(-25 16 14)"/><ellipse cx="24" cy="14" rx="3" ry="8" fill="#57a86e" transform="rotate(25 24 14)"/><ellipse cx="20" cy="11" rx="3" ry="9" fill="#2f7a4c"/>',
  floorLamp: '<path d="M14 4h12l3 8H11z" fill="#efe0c4"/><rect x="19" y="12" width="2" height="18" fill="#c79a4a"/><rect x="14" y="30" width="12" height="2" rx="1" fill="#a99db4"/>',
  stool: '<ellipse cx="20" cy="9" rx="9" ry="3" fill="#8c2f39"/><rect x="19" y="10" width="2" height="18" fill="#9ea3ad"/><ellipse cx="20" cy="30" rx="7" ry="2" fill="#9ea3ad"/>',
  chair: '<rect x="13" y="3" width="14" height="17" rx="3" fill="#18171c" stroke="#d43d86" stroke-width="1.5"/><rect x="11" y="19" width="18" height="5" rx="2" fill="#18171c" stroke="#d43d86" stroke-width="1.5"/><rect x="19" y="24" width="2" height="6" fill="#a99db4"/>',
  coffeeTable: '<ellipse cx="20" cy="15" rx="12" ry="4" fill="#c9a06a"/><rect x="19" y="18" width="2" height="11" fill="#a99db4"/><ellipse cx="20" cy="30" rx="6" ry="2" fill="#a99db4"/>',
  serverRack: '<rect x="12" y="3" width="16" height="29" rx="1" fill="#15161c" stroke="#3a3d45"/><g fill="#7ee0a1"><rect x="15" y="7" width="2" height="2"/><rect x="15" y="12" width="2" height="2"/><rect x="15" y="17" width="2" height="2"/></g><g fill="#ffb454"><rect x="18" y="7" width="2" height="2"/><rect x="18" y="17" width="2" height="2"/></g>',
  whiteboard: '<rect x="6" y="5" width="28" height="18" fill="#e9e9ee"/><path d="M10 12h6M20 12h6M16 17h8" stroke="#3d5afe" stroke-width="1.5"/><path d="M9 23l-2 9M31 23l2 9" stroke="#9ea3ad" stroke-width="1.5"/>'
};

/* ============================================================
   Rooms (first-person layout: x −5…5, z −4…4, ceiling 4.8)
   ============================================================ */
const DOOR = (u) => ({ uid: 'door', type: 'door', wall: 'front', u, y: 0, entry: { kind: 'door', title: '出门 · 回到地球', desc: '' } });
const ROOM_PRESETS = {
  mine: {
    id: 'mine', no: '302', name: '零点电竞酒吧', owner: '你', mine: true, agent: true,
    theme: { wall: '#2a2140', trim: '#3c2f58', floor: 'wood', floorTint: '#4f3426', neon: 'MIDNIGHT 302', neonColor: '#ff5aa8', bean: '#2f6f73', sofa: '#5b3a6b', rug: ['#2e1d45', '#ff5aa8', '#62e6ff', '#22163a'] },
    items: [
      { uid: 'rug', type: 'rug', x: .5, z: 1.1 },
      { uid: 'bar', type: 'barCounter', x: 2.4, z: -2.0, rot: 0 },
      { uid: 'robot', type: 'robot', x: 2.4, z: -3.2, rot: 0, entry: { kind: 'agent', title: '酒保 Bit', desc: '房主配置的 AI 助手' } },
      { uid: 'stool1', type: 'stool', x: 1.1, z: -.85 }, { uid: 'stool2', type: 'stool', x: 2.4, z: -.85 }, { uid: 'stool3', type: 'stool', x: 3.7, z: -.85 },
      { uid: 'desk', type: 'desk', x: -4.22, z: -1.75, rot: 1 },
      { uid: 'chair', type: 'chair', x: -2.95, z: -1.9, rot: 3, ry: .35 },
      { uid: 'beanbag', type: 'beanbag', x: -.95, z: 1.6, ry: .7 },
      { uid: 'table', type: 'coffeeTable', x: .7, z: 1.05 },
      { uid: 'sofa', type: 'sofa', x: 4.35, z: .7, rot: 3 },
      { uid: 'plant', type: 'plant', x: 4.4, z: 3.4 }, { uid: 'plant2', type: 'plant', x: -4.4, z: 3.4 },
      { uid: 'lamp', type: 'floorLamp', x: 4.45, z: 2.55 },
      { uid: 'shelf', type: 'backShelf', wall: 'back', u: 2.4, y: 0 },
      { uid: 'pegboard', type: 'pegboard', wall: 'left', u: 1.95, y: 2.45 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -1.7, y: 3.6 },
      { uid: 'chalkboard', type: 'chalkboard', wall: 'back', u: -1.7, y: 1.85, entry: { kind: 'guestbook', title: '留言黑板', desc: '' } },
      DOOR(-1.0)
    ]
  },
  pixel: {
    id: 'pixel', no: '204', name: '像素工坊', owner: '@pixelmo',
    theme: { wall: '#1b3442', trim: '#2b4b5c', floor: 'tile', floorTint: '#3a3f4e', neon: 'PIXEL WORKS', neonColor: '#62e6ff', arcade: '#3b2a6b', bean: '#d4573d', sofa: '#2f4f6f', rug: ['#203545', '#62e6ff', '#ffb454', '#162a36'] },
    items: [
      { uid: 'rug', type: 'rug', x: .8, z: 1.4 },
      { uid: 'a1', type: 'arcade', x: -3.9, z: -3.4, entry: { kind: 'game2', title: '像素躲避球', desc: '双人同屏的躲避球，30 秒一局', url: '' } },
      { uid: 'a2', type: 'arcade', x: -2.75, z: -3.4, entry: { kind: 'game2', title: '1-bit 地牢', desc: '只有黑白两色的 roguelike', url: '', color: '#d4573d' } },
      { uid: 'k1', type: 'kiosk', x: 1.6, z: -2.2, ry: -.3, entry: { kind: 'app', title: '调色板生成器', desc: '上传一张图，导出 16 色像素调色板', url: '' } },
      { uid: 'bs', type: 'bookshelf', x: 3.9, z: -3.55 },
      { uid: 'desk', type: 'desk', x: -4.22, z: .6, rot: 1, opts: { console: false } },
      { uid: 'ch', type: 'chair', x: -2.9, z: .5, rot: 3, ry: .4 },
      { uid: 'bb', type: 'beanbag', x: 1.2, z: 1.9 },
      { uid: 'pl', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'lp', type: 'floorLamp', x: 4.4, z: -2.5 },
      { uid: 'neon', type: 'neon', wall: 'back', u: 1.2, y: 3.6 }, DOOR(-2.4)
    ]
  },
  leaf: {
    id: 'leaf', no: '101', name: '植物温室', owner: '@leafcode',
    theme: { wall: '#1f3a2c', trim: '#2f5440', floor: 'wood', floorTint: '#7a5a3c', neon: 'GREENHOUSE', neonColor: '#7ee0a1', sofa: '#c7a26b', bean: '#3f8f5a', rug: ['#2a4a38', '#7ee0a1', '#ffd36b', '#1d3428'] },
    items: [
      { uid: 'rug', type: 'rug', x: .4, z: .9 },
      { uid: 'sofa', type: 'sofa', x: .4, z: 2.6, rot: 2 },
      { uid: 'k1', type: 'kiosk', x: -2.2, z: -2.6, ry: .3, entry: { kind: 'app', title: '浇水提醒', desc: '按植物品种和天气推送浇水时间', url: '' } },
      { uid: 'wb', type: 'whiteboard', x: 1.6, z: -3.4, entry: { kind: 'repo', title: '植物图鉴 API', desc: '开源的植物识别与养护数据接口', url: '' } },
      { uid: 'bs', type: 'bookshelf', x: -4.5, z: .6, rot: 1 },
      { uid: 'p1', type: 'plant', x: -4.3, z: -3.3 }, { uid: 'p2', type: 'plant', x: 4.3, z: -3.3 }, { uid: 'p3', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'p4', type: 'plant', x: -4.3, z: 3.3 }, { uid: 'p5', type: 'plant', x: 4.2, z: -1.6 },
      { uid: 'lp', type: 'floorLamp', x: 2.2, z: 3.3 }, { uid: 'ct', type: 'coffeeTable', x: .4, z: .9 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -1.0, y: 3.6 }, DOOR(-2.2)
    ]
  },
  lab: {
    id: 'lab', no: '303', name: '深夜实验室', owner: '@byte',
    theme: { wall: '#181c33', trim: '#2a3052', floor: 'concrete', floorTint: '#3a3b44', neon: 'LAB 303', neonColor: '#9d8cff', sofa: '#2a2f52', bean: '#9d8cff', rug: ['#20244a', '#9d8cff', '#62e6ff', '#141733'] },
    items: [
      { uid: 'sr1', type: 'serverRack', x: -4.4, z: -3.4, entry: { kind: 'app', title: '自建推理集群面板', desc: '4 张显卡的实时负载与队列', url: '' } },
      { uid: 'sr2', type: 'serverRack', x: -3.35, z: -3.4 },
      { uid: 'desk', type: 'desk', x: 2.2, z: -3.25, rot: 0, opts: { console: false } },
      { uid: 'ch', type: 'chair', x: 2.2, z: -1.95, rot: 2, ry: -.3 },
      { uid: 'wb', type: 'whiteboard', x: -4.5, z: .2, rot: 1, entry: { kind: 'repo', title: 'RAG 管线', desc: '检索增强生成的最小实现，带评测脚本', url: '' } },
      { uid: 'k1', type: 'kiosk', x: -.8, z: .2, ry: .4, entry: { kind: 'web', title: '论文速读 Agent', desc: '贴一个论文链接，三分钟读懂', url: '' } },
      { uid: 'k2', type: 'kiosk', x: 1.6, z: .5, ry: -.3, entry: { kind: 'web', title: '日志可视化', desc: '把服务日志变成时间线', url: '' } },
      { uid: 'lp', type: 'floorLamp', x: -2.6, z: 3.3 }, { uid: 'bb', type: 'beanbag', x: 3.2, z: 2.6 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -.6, y: 3.6 }, DOOR(1.2)
    ]
  }
};
const TEMPLATES = [
  { id: 'pixel', name: '像素工坊', desc: '街机、书架和瓷砖地', sw: ['#1b3442', '#62e6ff'] },
  { id: 'leaf', name: '植物温室', desc: '满屋绿植和暖光沙发', sw: ['#1f3a2c', '#7ee0a1'] },
  { id: 'lab', name: '深夜实验室', desc: '机柜、白板和水泥地', sw: ['#181c33', '#9d8cff'] },
  { id: 'empty', name: '毛坯房', desc: '只有门和霓虹，自己布置', sw: ['#2a2238', '#ffb454'] }
];
function residentInfo(r) {
  if (r.real) { const works = cleanItems((CLOUD.rooms.get(r.key) || {}).items).filter(i => i.entry && !['door', 'view', 'guestbook'].includes(i.entry.kind)).map(i => [i.entry.title, i.entry.kind]); return { no: r.no, handle: r.handle, name: r.name, tagline: r.tagline, tags: r.tags, works, state: 'open', real: true, mine: iOwnRoom(r.key), city: r.city }; }
  if (r.custom && CUSTOM[r.no]) { const c = CUSTOM[r.no]; return { no: r.no, handle: c.owner, name: c.name, tagline: '刚入住的新邻居', tags: ['新入住'], works: c.items.filter(i => i.entry && i.entry.kind !== 'door').map(i => [i.entry.title, i.entry.kind]), state: 'open', custom: true, mine: true, city: r.city }; }
  if (r.preset) {
    const p = ROOM_PRESETS[r.preset], works = [];
    p.items.forEach(i => { if (i.entry && i.entry.kind !== 'door') works.push([i.entry.title, i.entry.kind]); });
    if (r.preset === 'mine') { works.length = 0; works.push(['拾光', 'shiguang'], ['霓虹贪吃蛇', 'game'], ['酒保 Bit', 'agent'], ['留言黑板', 'guestbook']); }
    const m302 = r.preset === 'mine';
    return { no: r.no, handle: m302 ? (isMine302() ? '你' : ownerHandle302()) : p.owner, name: p.name, tagline: r.tagline, tags: r.tags || [], works, state: 'open', preset: r.preset, mine: m302 ? isMine302() : !!p.mine, city: r.city, demo: !m302 };
  }
  return Object.assign({ state: 'open', works: [], demo: !r.custom }, r);
}
function roomForResident(r) {
  if (r.real) { const room = realRoom(r); room.tz = tzFor(r.lat, r.lon); return room; }
  const info = residentInfo(r);
  let room;
  if (info.custom) room = clone(CUSTOM[r.no]);
  else if (info.preset) { room = info.preset === 'mine' ? loadRoom('mine') : clone(ROOM_PRESETS[info.preset]); if (info.preset === 'mine') { room.mine = isMine302(); room.owner = room.mine ? '你' : ownerHandle302(); } }
  else {
    const hue = r.hue || 0, wall = '#' + new THREE.Color().setHSL(hue, .32, .16).getHexString(), acc = '#' + new THREE.Color().setHSL(hue, .85, .66).getHexString();
    const rr2 = rng(hash(r.no));
    const items = [{ uid: 'rug', type: 'rug', x: .6, z: 1.2 }];
    const slots = [[-2.6, -2.7, .3], [0, -2.7, 0], [2.4, -2.7, -.3], [-2.4, .4, .4]];
    (r.works || []).forEach((w, i) => {
      const [x, z, ry] = slots[i], kind = w[1];
      items.push({ uid: 'w' + i, type: kind === 'game2' ? 'arcade' : (kind === 'repo' ? 'whiteboard' : 'kiosk'), x, z: kind === 'game2' ? -3.4 : z, ry: kind === 'game2' ? 0 : ry, entry: { kind, title: w[0], desc: '', url: '' } });
    });
    items.push({ uid: 'd1', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'd2', type: rr2() > .5 ? 'sofa' : 'beanbag', x: .8, z: 2.7, rot: 2 }, { uid: 'd3', type: 'floorLamp', x: -4.3, z: -3.3 }, { uid: 'd4', type: 'bookshelf', x: -4.5, z: -.6, rot: 1 });
    items.push({ uid: 'neon', type: 'neon', wall: 'back', u: .2, y: 3.6 }, DOOR(-2.8));
    room = { id: 'r' + r.no, no: r.no, name: r.name, owner: r.handle, theme: { wall, trim: '#' + new THREE.Color().setHSL(hue, .3, .26).getHexString(), floor: rr2() > .5 ? 'wood' : 'tile', floorTint: '#' + new THREE.Color().setHSL(hue, .2, .3).getHexString(), neon: r.handle.replace('@', '').toUpperCase(), neonColor: acc, sofa: acc, bean: acc, rug: [wall, acc, '#ffb454', wall] }, items };
  }
  room.lat = r.lat; room.lon = r.lon; room.city = r.city; room.tz = tzFor(r.lat, r.lon);
  return room;
}
function loadRoom(id) {
  const p = clone(ROOM_PRESETS[id]);
  if (id === 'mine' && CLOUD.ready && CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length) { p.items = cleanItems(CLOUD.site.items, 'site/room302/works/'); return p; }
  const saved = p.mine && isMine302() ? store.get('gebi3.room.' + id, null) : null;
  if (saved && Array.isArray(saved) && saved.length) p.items = saved;
  return p;
}

/* ============================================================
   Room construction: a closed room you can walk through
   ============================================================ */
const RH = 4.8;                                   // ceiling height
const WIN = { z0: -.9, z1: 2.3, y0: 1.25, y1: 3.55 }; // window on the right wall (x = 5)
let ENV = null;
function buildEnv() {
  if (ENV || !THREE.PMREMGenerator) return ENV;
  try {
    const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x0d0a13, side: THREE.BackSide })));
    const panel = (c, k, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel('#ffb36b', 2.4, 0, 2.95, 0, 5, 1.2); panel('#ff5aa8', 1.8, -4.9, .8, 0, .4, 7); panel('#62e6ff', 1.4, 4.9, 1.2, .5, 3, 2);
    panel('#ffcf8a', 1.6, 0, 1, -4.9, 4, .5); panel('#9d8cff', .8, 0, 1.5, 4.9, 3, 1.4);
    ENV = pm.fromScene(es, .04).texture; pm.dispose();
  } catch (e) { ENV = null; }
  return ENV;
}
function wallpaperTex(th, seed) {
  const c = mkCanvas(512, 512), g = c.getContext('2d'), r = rng(seed);
  const base = new THREE.Color(th.wall);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) { g.fillStyle = `rgba(255,255,255,${x % 64 ? .025 : .045})`; g.fillRect(x, 0, 14, 512); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '0,0,0'},${r() * .04})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = 32; y < 512; y += 64) for (let x = 16; x < 512; x += 64) { g.beginPath(); g.arc(x + (y % 128 ? 32 : 0), y, 3, 0, 7); g.fill(); }
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function buildShell(room) {
  const th = room.theme, root = new THREE.Group();
  const W = { back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group(), front: new THREE.Group() };
  Object.values(W).forEach(g => root.add(g)); S.wallGroups = W;
  // floor
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: floorTex(th.floor, th.floorTint), roughness: .48, metalness: .05, envMapIntensity: .8 }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.userData.floor = true; root.add(fl);
  // walls (inner faces sit on the room bounds)
  const wp = wallpaperTex(th, hash(room.id || 'r'));
  const wallMat = (rep) => { const t = wp.clone(); t.needsUpdate = true; t.repeat.set(rep, RH / 2.4); return new THREE.MeshStandardMaterial({ map: t, roughness: .92, envMapIntensity: .25 }); };
  const box = (grp, mat, x0, x1, y0, y1, z0, z1) => { const m = mesh(BG(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, grp); return m; };
  const T = .22;
  box(W.back, wallMat(4), -5 - T, 5 + T, 0, RH, -4 - T, -4);
  box(W.left, wallMat(3.2), -5 - T, -5, 0, RH, -4, 4);
  // right wall with a window opening
  const rm = wallMat(3.2);
  box(W.right, rm, 5, 5 + T, 0, WIN.y0, -4, 4); box(W.right, rm, 5, 5 + T, WIN.y1, RH, -4, 4);
  box(W.right, rm, 5, 5 + T, WIN.y0, WIN.y1, -4, WIN.z0); box(W.right, rm, 5, 5 + T, WIN.y0, WIN.y1, WIN.z1, 4);
  // front wall with a door gap
  const door = room.items.find(i => i.type === 'door'), du = door ? door.u : -1;
  const fm = wallMat(4);
  box(W.front, fm, -5 - T, du - .62, 0, RH, 4, 4 + T); box(W.front, fm, du + .62, 5 + T, 0, RH, 4, 4 + T); box(W.front, fm, du - .62, du + .62, 2.68, RH, 4, 4 + T);
  // wainscot, rail and skirting
  const trim = M(th.trim, .55), dark = M('#' + new THREE.Color(th.trim).multiplyScalar(.6).getHexString(), .6);
  [['back', -5, 5, -4, -4], ['left', -5, -5, -4, 4], ['right', 5, 5, -4, 4], ['front', -5, 5, 4, 4]].forEach(([k, x0, x1, z0, z1]) => {
    const along = x0 !== x1, n = { back: [0, 1], left: [1, 0], right: [-1, 0], front: [0, -1] }[k], g = W[k];
    const seg = (a, b) => {
      if (b - a < .05) return;
      const len = b - a, mid = (a + b) / 2, cx = along ? mid : x0 + n[0] * .02, cz = along ? z0 + n[1] * .02 : mid;
      const w = along ? len : .04, d = along ? .04 : len;
      mesh(BG(w, 1.1, d), dark, cx, .55, cz, g);
      mesh(BG(along ? len : .07, .06, along ? .07 : len), trim, along ? mid : x0 + n[0] * .035, 1.12, along ? z0 + n[1] * .035 : mid, g);
      mesh(BG(along ? len : .06, .16, along ? .06 : len), trim, along ? mid : x0 + n[0] * .03, .08, along ? z0 + n[1] * .03 : mid, g);
      mesh(BG(along ? len : .06, .08, along ? .06 : len), trim, along ? mid : x0 + n[0] * .03, RH - .04, along ? z0 + n[1] * .03 : mid, g);
    };
    if (k === 'front') { seg(-5, du - .7); seg(du + .7, 5); } else seg(along ? x0 : z0, along ? x1 : z1);
  });
  // ceiling, beams, LED cove, downlights
  const ceil = new THREE.Group(); root.add(ceil); S.ceiling = ceil;
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 8.4), new THREE.MeshStandardMaterial({ color: '#141019', roughness: .95 }));
  cm.rotation.x = Math.PI / 2; cm.position.y = RH; cm.receiveShadow = true; ceil.add(cm);
  for (const x of [-3.75, -1.25, 1.25, 3.75]) mesh(BG(.26, .3, 8), M('#2a1d17', .7), x, RH - .15, 0, ceil);
  const led = new THREE.MeshBasicMaterial({ color: 0xff5aa8 }); S.dyn.leds.push(led);
  [[0, -3.93, 10, .04], [0, 3.93, 10, .04], [-4.93, 0, .04, 8], [4.93, 0, .04, 8]].forEach(([x, z, w, d]) => { const l = new THREE.Mesh(BG(w, .04, d), led); l.position.set(x, RH - .34, z); ceil.add(l); });
  for (const [x, z] of [[-2.5, 1.2], [.6, 1.2], [-3.4, -1.6], [.6, -.6]]) { const d = new THREE.Mesh(CY(.11, .11, .02, 20), GLOW('#ffd9a8', 2.2)); d.position.set(x, RH - .01, z); ceil.add(d); }
  const spot = new THREE.SpotLight(0xffcc99, .9, 9, .75, .6, 1.5); spot.position.set(0, RH - .05, 1.2); spot.target.position.set(.2, 0, 1.2); ceil.add(spot); ceil.add(spot.target);
  const p1 = new THREE.PointLight(0xff5aa8, .8, 11, 2); p1.position.set(-4.2, RH - .5, -3.2); root.add(p1);
  const p2 = new THREE.PointLight(0x62e6ff, .55, 11, 2); p2.position.set(3.8, RH - .5, -3.3); root.add(p2);
  S.dyn.ledLights.push(p1, p2);
  buildWindow(W.right, room);
  buildCorridor(W.front, du);
  return root;
}
function buildCorridor(g, du) {
  const c = new THREE.Group(); c.position.set(du, 0, 4 + .22); g.add(c);
  const mat = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: .9, side: THREE.BackSide });
  const b = new THREE.Mesh(BG(1.6, 2.9, 2.6), mat); b.position.set(0, 1.45, 1.3); c.add(b);
  const end = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc887').multiplyScalar(1.5) }));
  end.position.set(0, 1.4, 2.58); end.rotation.y = Math.PI; c.add(end);
  const pl = new THREE.PointLight(0xffb36b, 0, 7, 2); pl.position.set(0, 2.2, 1.2); c.add(pl);
  S.dyn.corridorLight = pl;
}
function buildWindow(g, room) {
  const fr = M('#1b1a20', .4, .6), wood = M('#5b3a26', .55);
  const zc = (WIN.z0 + WIN.z1) / 2, yc = (WIN.y0 + WIN.y1) / 2, wz = WIN.z1 - WIN.z0, hy = WIN.y1 - WIN.y0;
  mesh(BG(.3, .1, wz + .2), fr, 5.08, WIN.y1 + .05, zc, g); mesh(BG(.3, .1, wz + .2), fr, 5.08, WIN.y0 - .05, zc, g);
  mesh(BG(.3, hy + .2, .1), fr, 5.08, yc, WIN.z0 - .05, g); mesh(BG(.3, hy + .2, .1), fr, 5.08, yc, WIN.z1 + .05, g);
  mesh(BG(.08, hy, .06), fr, 5.1, yc, zc, g); mesh(BG(.08, .06, wz), fr, 5.1, WIN.y0 + hy * .62, zc, g);
  mesh(BG(.42, .07, wz + .5), wood, 4.86, WIN.y0 - .02, zc, g);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wz, hy), new THREE.MeshStandardMaterial({ color: '#a8c8ff', transparent: true, opacity: .07, roughness: .04, metalness: 0, envMapIntensity: 1.2, depthWrite: false }));
  glass.rotation.y = -Math.PI / 2; glass.position.set(5.12, yc, zc); g.add(glass);
  buildOutside(g, room);
  // the window as something you can look at
  const hit = new THREE.Mesh(BG(.2, hy, wz), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(5.0, yc, zc);
  const grp = new THREE.Group(); grp.add(hit); g.add(grp);
  grp.userData.iid = 'window'; grp.userData.def = { uid: 'window', wall: 'right', name: '窗', entry: { kind: 'view', title: '窗外 · ' + (room.city || '') } };
}
function buildOutside(g, room) {
  const sky = localSky(room.lat == null ? 31.23 : room.lat, room.lon == null ? 121.47 : room.lon, room.tz);
  S.dyn.sky = sky;
  const P = {
    day: { top: '#3d7fd0', mid: '#8ec3ee', hor: '#d9ecf7', far: '#a7b9cc', mid2: '#7489a3', near: '#4a5a70', lit: .03, light: ['#fff1dc', 1.55], fill: .55 },
    golden: { top: '#3b4d8f', mid: '#e7866a', hor: '#ffd08a', far: '#c48a86', mid2: '#7a566b', near: '#3a2c40', lit: .08, light: ['#ffae66', 1.45], fill: .45 },
    dusk: { top: '#141a45', mid: '#5a3f7c', hor: '#c46a86', far: '#3f3766', mid2: '#2a2546', near: '#191528', lit: .3, light: ['#a68cff', .35], fill: .25 },
    night: { top: '#04060f', mid: '#0b1030', hor: '#2a2350', far: '#151a35', mid2: '#0e1228', near: '#080a17', lit: .42, light: ['#8fb0ff', .32], fill: .18 }
  }[sky.phase];
  const r = rng(hash((room.city || '') + room.no));
  const out = new THREE.Group(); g.add(out);
  const plane = (cw, ch, w, h, x, yBottom, draw, k = 1) => {
    const c = mkCanvas(cw, ch), ctx = c.getContext('2d'); draw(ctx, cw, ch);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texOf(c), transparent: true, depthWrite: false, color: new THREE.Color(k, k, k), fog: false }));
    m.rotation.y = -Math.PI / 2; m.position.set(x, yBottom + h / 2, .7); out.add(m); return m;
  };
  // sky
  plane(1024, 1024, 240, 140, 5 + 80, -50, (x, w, h) => {
    const hy = h * (1 - (2 + 50) / 140);
    const gr = x.createLinearGradient(0, 0, 0, hy); gr.addColorStop(0, P.top); gr.addColorStop(.62, P.mid); gr.addColorStop(1, P.hor);
    x.fillStyle = gr; x.fillRect(0, 0, w, hy); x.fillStyle = P.hor; x.fillRect(0, hy, w, h - hy);
    if (sky.phase === 'night' || sky.phase === 'dusk') { for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(255,255,255,${(sky.phase === 'night' ? .9 : .4) * r()})`; const s = r() < .08 ? 2 : 1; x.fillRect(r() * w, r() * hy * .8, s, s); } }
    const altY = clamp(hy - Math.tan(clamp(sky.alt, -5, 60) * D2R) * 80 / 140 * h, 30, hy + 10);
    if (sky.phase === 'night') { x.fillStyle = '#f4f1e6'; x.shadowColor = '#cfe0ff'; x.shadowBlur = 30; x.beginPath(); x.arc(w * .68, hy * .32, 22, 0, 7); x.fill(); x.shadowBlur = 0; x.fillStyle = P.top; x.beginPath(); x.arc(w * .68 + 9, hy * .32 - 5, 19, 0, 7); x.fill(); }
    else if (sky.phase !== 'dusk') { const sr = sky.phase === 'golden' ? 46 : 26; const sg = x.createRadialGradient(w * .58, altY, 0, w * .58, altY, sr * 5); sg.addColorStop(0, sky.phase === 'golden' ? 'rgba(255,200,120,1)' : 'rgba(255,250,235,1)'); sg.addColorStop(.2, sky.phase === 'golden' ? 'rgba(255,150,80,.55)' : 'rgba(255,245,220,.35)'); sg.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = sg; x.fillRect(0, 0, w, h); }
    if (sky.phase === 'day' || sky.phase === 'golden') { for (let i = 0; i < 9; i++) { const cx = r() * w, cy = hy * (.25 + r() * .5), s = 40 + r() * 90; x.fillStyle = sky.phase === 'golden' ? 'rgba(255,190,160,.35)' : 'rgba(255,255,255,.55)'; for (let j = 0; j < 6; j++) { x.beginPath(); x.ellipse(cx + (r() - .5) * s * 1.6, cy + (r() - .5) * s * .25, s * (.4 + r() * .4), s * (.14 + r() * .1), 0, 0, 7); x.fill(); } } }
  }, sky.phase === 'night' ? 1 : 1);
  // skylines: far / mid / near with lit windows
  const skyline = (layer, cw, ch, color, minH, maxH, density, landmark) => (x, w, h) => {
    let px = -20;
    while (px < w + 20) {
      const bw = (30 + r() * 70) * density, bh = h * (minH + r() * (maxH - minH));
      x.fillStyle = color; x.fillRect(px, h - bh, bw, bh);
      if (r() < .35) { x.fillRect(px + bw * .2, h - bh - bh * .12, bw * .6, bh * .12); }
      if (r() < .25) { x.fillRect(px + bw * .48, h - bh - 30, 3, 30); if (sky.phase !== 'day') { x.fillStyle = '#ff3b3b'; x.fillRect(px + bw * .48 - 1, h - bh - 32, 5, 5); x.fillStyle = color; } }
      const cols = Math.floor(bw / 10), rows = Math.floor(bh / 14);
      for (let i = 1; i < cols - 0; i++) for (let j = 1; j < rows; j++) {
        if (sky.phase === 'day') { if (r() < .5) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(px + i * 10 - 4, h - bh + j * 14, 5, 7); } continue; }
        if (r() < P.lit * (layer === 'near' ? .8 : 1)) { x.fillStyle = r() < .8 ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},${.7 + r() * .3})` : 'rgba(150,215,255,.85)'; x.fillRect(px + i * 10 - 4, h - bh + j * 14, 5, 7); }
      }
      x.fillStyle = color;
      px += bw + r() * 6;
    }
    if (landmark) {
      const lx = w * .62, base = h * .5;
      x.fillStyle = color; x.fillRect(lx - 10, h - base, 20, base); x.beginPath(); x.moveTo(lx - 22, h - base); x.lineTo(lx, h - base - 120); x.lineTo(lx + 22, h - base); x.fill();
      x.beginPath(); x.arc(lx, h - base - 40, 14, 0, 7); x.fill(); x.fillRect(lx - 2, h - base - 260, 4, 140);
      if (sky.phase !== 'day') { x.fillStyle = '#ff5aa8'; x.beginPath(); x.arc(lx, h - base - 40, 6, 0, 7); x.fill(); x.fillStyle = '#ff3b3b'; x.fillRect(lx - 3, h - base - 264, 6, 6); }
    }
    if (layer === 'near' && sky.phase !== 'day') { for (let i = 0; i < 5; i++) { x.fillStyle = ['#ff5aa8', '#62e6ff', '#ffb454'][i % 3]; x.shadowColor = x.fillStyle; x.shadowBlur = 16; x.fillRect(r() * w, h * (.55 + r() * .3), 40 + r() * 50, 8); } x.shadowBlur = 0; }
  };
  const lk = sky.phase === 'night' || sky.phase === 'dusk' ? 1.35 : 1;
  plane(2048, 512, 170, 34, 5 + 46, -14, skyline('far', 2048, 512, P.far, .2, .75, 1, true), lk);
  plane(2048, 512, 90, 22, 5 + 24, -14, skyline('mid', 2048, 512, P.mid2, .25, .8, 1.2), lk);
  plane(2048, 640, 38, 14, 5 + 10, -14, skyline('near', 2048, 640, P.near, .3, .9, 1.6), lk);
  // light coming through the window
  const sunH = sky.phase === 'day' ? clamp(Math.tan(clamp(sky.alt, 20, 60) * D2R) * 9, 4, 14) : sky.phase === 'golden' ? 2.4 : 7;
  const wl = new THREE.DirectionalLight(new THREE.Color(P.light[0]), P.light[1]);
  wl.position.set(5 + 9, 2 + sunH, sky.morning ? -1.5 : 2.6); wl.target.position.set(0, 0, .7);
  wl.castShadow = true; wl.shadow.mapSize.set(2048, 2048);
  Object.assign(wl.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 32 });
  wl.shadow.bias = -.0004; wl.shadow.normalBias = .03;
  g.add(wl); g.add(wl.target);
  const fill = new THREE.PointLight(new THREE.Color(P.mid), P.fill, 6, 2); fill.position.set(4.4, 2.4, .7); g.add(fill);
  S.dyn.windowLight = wl;
}
function buildRoom(data) {
  if (S.roomRoot) scene.remove(S.roomRoot);
  S.dyn = { leds: [], ledLights: [], pendants: [], blinkers: [], neons: [], robot: null, vinyl: null, noteFrame: null, door: null, corridorLight: null };
  S.itemGroups = new Map();
  scene.environment = buildEnv();
  const root = new THREE.Group(); S.roomRoot = root; scene.add(root);
  root.add(buildShell(data));
  for (const def of data.items) placeItem(def);
  const pts = [];
  for (let x = -5; x <= 5.001; x += .5) pts.push(x, .012, -4, x, .012, 4);
  for (let z = -4; z <= 4.001; z += .5) pts.push(-5, .012, z, 5, .012, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  S.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: .22 }));
  S.grid.visible = S.mode === 'build'; root.add(S.grid);
  S.selRing = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb454').multiplyScalar(1.6), transparent: true, opacity: .9, side: THREE.DoubleSide }));
  S.selRing.rotation.x = -Math.PI / 2; S.selRing.position.y = .02; S.selRing.visible = false; root.add(S.selRing);
  rebuildColliders();
  drawNote(); drawChalk();
  refreshHotspots();
}
function placeItem(def) {
  const meta = ITEMS[def.type]; if (!meta) return null;
  const g = meta.build(def, S.room.theme);
  g.userData.iid = def.uid; g.userData.def = def; g.userData.meta = meta;
  positionItem(g, def);
  S.roomRoot.add(g); S.itemGroups.set(def.uid, g);
  return g;
}
function positionItem(g, def) {
  const y = def.y || 0;
  if (def.wall === 'back') { g.position.set(def.u, y, -4); g.rotation.set(0, 0, 0); }
  else if (def.wall === 'left') { g.position.set(-5, y, def.u); g.rotation.set(0, Math.PI / 2, 0); }
  else if (def.wall === 'right') { g.position.set(5, y, def.u); g.rotation.set(0, -Math.PI / 2, 0); }
  else if (def.wall === 'front') { g.position.set(def.u, y, 4); g.rotation.set(0, Math.PI, 0); }
  else { g.position.set(def.x, y, def.z); g.rotation.set(0, (def.rot || 0) * Math.PI / 2 + (def.ry || 0), 0); }
}
function rebuildColliders() {
  S.colliders = [];
  if (!S.room) return;
  for (const def of S.room.items) {
    if (def.wall || def.type === 'rug') continue;
    const meta = ITEMS[def.type] || {}, odd = (def.rot || 0) % 2;
    const hw = ((odd ? meta.d : meta.w) || 1) / 2 * .92, hd = ((odd ? meta.w : meta.d) || 1) / 2 * .92;
    S.colliders.push({ x0: def.x - hw, x1: def.x + hw, z0: def.z - hd, z1: def.z + hd, uid: def.uid });
  }
}
function findGroup(iid) {
  if (!S.roomRoot) return null;
  let found = null;
  S.roomRoot.traverse(o => { if (!found && o.userData && o.userData.iid === iid) found = o; });
  return found;
}
function nameOf(g) { const d = g.userData.def || {}; if (g.userData.isChild) return d.name || '物件'; return d.name || (g.userData.meta && g.userData.meta.name) || '物件'; }
function entryOf(g) { const d = g && g.userData.def; return d && d.entry ? d.entry : null; }
function doorDef() { return S.room && S.room.items.find(i => i.type === 'door'); }

/* ============================================================
   First-person controller + dollhouse camera for building
   ============================================================ */
const FP = { pos: new THREE.Vector3(-1, 0, 2.9), yaw: 0, pitch: -.05, yawGoal: 0, pitchGoal: -.05, vel: new THREE.Vector3(), eye: 2.0, bobT: 0, bobAmp: 0, keys: new Set(), joy: { x: 0, y: 0 }, auto: null, locked: false };
const CAM = { mode: 'fp', fov: 66, orb: { th: .62, ph: .92, r: 16.5 }, tween: null };
const PR = .3;
function blocked(p, R = PR) { return S.colliders.some(c => p.x > c.x0 - R && p.x < c.x1 + R && p.z > c.z0 - R && p.z < c.z1 + R); }
function collide(p) {
  for (const c of S.colliders) {
    const x0 = c.x0 - PR, x1 = c.x1 + PR, z0 = c.z0 - PR, z1 = c.z1 + PR;
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
      const dl = p.x - x0, dr = x1 - p.x, dn = p.z - z0, df = z1 - p.z, m = Math.min(dl, dr, dn, df);
      if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === dn) p.z = z0; else p.z = z1;
    }
  }
  p.x = clamp(p.x, -5 + PR + .05, 5 - PR - .05); p.z = clamp(p.z, -4 + PR + .05, 4 - PR - .05);
}
function angleLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function anglesTo(pos, look) { const dx = look.x - pos.x, dz = look.z - pos.z; return { yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(look.y - FP.eye, Math.hypot(dx, dz)), -1.05, .9) }; }
function fpGo(pos, yaw, pitch, dur) {
  return new Promise(res => {
    if (FP.auto && FP.auto.res) FP.auto.res();
    FP.auto = { from: { x: FP.pos.x, z: FP.pos.z, yaw: FP.yaw, pitch: FP.pitch }, to: { x: pos.x, z: pos.z, yaw, pitch }, t: 0, t0: performance.now(), dur: reduceMotion ? .2 : Math.max(.2, dur), res };
  });
}
function panelYawOffset() {
  if (isNarrow()) return 0;
  const pw = S.win && S.win.size === 'tall' ? 456 : (S.panel ? 416 : 0); if (!pw) return 0;
  return Math.atan((pw / innerWidth) * Math.tan(camera.fov / 2 * D2R) * camera.aspect);
}
function viewFor(g) {
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const def = g.userData.isChild ? g.userData.parentDef : (g.userData.def || {});
  const wn = { back: [0, 1], left: [1, 0], right: [-1, 0], front: [0, -1] }[def.wall];
  let n;
  if (wn) n = new THREE.Vector3(wn[0], 0, wn[1]);
  else { n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize(); }
  if (g.userData.iid === 'window') c.y = 2.2;
  let d = clamp(Math.max(size.x, size.y * .85, size.z) * 1.05 + .75, 1.45, 3.4);
  const p = new THREE.Vector3();
  for (let tries = 0; tries < 3; tries++) {
    const nn = n.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), [0, .45, -.45][tries]);
    let dd = d;
    for (let i = 0; i < 12; i++) { p.copy(c).addScaledVector(nn, dd); p.y = 0; p.x = clamp(p.x, -4.55, 4.55); p.z = clamp(p.z, -3.55, 3.55); if (!blocked(p)) return { pos: p, look: c }; dd += .25; }
  }
  return { pos: p, look: c };
}
function walkTo(g, opts = {}) {
  if (!g || S.view !== 'room' || CAM.mode !== 'fp') return Promise.resolve();
  const v = viewFor(g), a = anglesTo(v.pos, v.look);
  const yaw = a.yaw - (opts.panel === false ? 0 : panelYawOffset());
  const dist = Math.hypot(v.pos.x - FP.pos.x, v.pos.z - FP.pos.z);
  return fpGo(v.pos, yaw, a.pitch, clamp(.55 + dist / 3.4, .6, 2.2));
}
function focusOn(g, opts = {}) { if (S.view === 'room' && S.mode !== 'build') walkTo(g, { panel: opts.panel !== false }); }
function setView() { /* camera framing is handled by the first-person controller */ }
function fpUpdate(dt) {
  if (FP.auto) {
    const A = FP.auto; A.t = Math.min(1, (performance.now() - A.t0) / 1000 / A.dur); const e = ease.io(A.t);
    FP.pos.x = A.from.x + (A.to.x - A.from.x) * e; FP.pos.z = A.from.z + (A.to.z - A.from.z) * e;
    FP.yaw = angleLerp(A.from.yaw, A.to.yaw, e); FP.pitch = A.from.pitch + (A.to.pitch - A.from.pitch) * e;
    FP.bobT += dt * 6 * Math.sin(Math.PI * A.t); FP.bobAmp = Math.sin(Math.PI * A.t) * .6;
    FP.yawGoal = FP.yaw; FP.pitchGoal = FP.pitch;
    if (A.t >= 1) { FP.auto = null; A.res(); }
  } else {
    const k = FP.keys; let ix = 0, iz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iz += 1; if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
    if (k.has('KeyA')) ix -= 1; if (k.has('KeyD')) ix += 1;
    if (k.has('ArrowLeft')) FP.yawGoal += dt * 1.9; if (k.has('ArrowRight')) FP.yawGoal -= dt * 1.9;
    ix += FP.joy.x; iz += FP.joy.y;
    const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
    const sp = 2.8 * (k.has('ShiftLeft') || k.has('ShiftRight') ? 1.7 : 1);
    const fx = -Math.sin(FP.yaw), fz = -Math.cos(FP.yaw), rx = Math.cos(FP.yaw), rz = -Math.sin(FP.yaw);
    const a = 1 - Math.exp(-dt * 9);
    FP.vel.x += ((fx * iz + rx * ix) * sp - FP.vel.x) * a; FP.vel.z += ((fz * iz + rz * ix) * sp - FP.vel.z) * a;
    FP.pos.x += FP.vel.x * dt; FP.pos.z += FP.vel.z * dt;
    collide(FP.pos);
    const speed = Math.hypot(FP.vel.x, FP.vel.z);
    FP.bobAmp += (clamp(speed / 2.8, 0, 1) - FP.bobAmp) * a; FP.bobT += dt * speed * 2.6;
    const lk = 1 - Math.exp(-dt * (FP.locked ? 40 : 16));
    FP.pitchGoal = clamp(FP.pitchGoal, -1.15, 1.0);
    FP.yaw += (FP.yawGoal - FP.yaw) * lk; FP.pitch += (FP.pitchGoal - FP.pitch) * lk;
  }
  const bob = Math.sin(FP.bobT * 2) * .03 * FP.bobAmp;
  camera.position.set(FP.pos.x, FP.eye + bob, FP.pos.z);
  camera.rotation.set(FP.pitch, FP.yaw, Math.sin(FP.bobT) * .003 * FP.bobAmp);
}
function orbitPose(out) {
  const o = CAM.orb, cp = Math.cos(o.ph);
  out.pos = new THREE.Vector3(Math.sin(o.th) * cp * o.r, .6 + Math.sin(o.ph) * o.r, Math.cos(o.th) * cp * o.r);
  const m = new THREE.Matrix4().lookAt(out.pos, new THREE.Vector3(0, .6, 0), new THREE.Vector3(0, 1, 0));
  out.quat = new THREE.Quaternion().setFromRotationMatrix(m);
  return out;
}
function camTween(toPose, toFov, dur) {
  const fromPos = camera.position.clone(), fromQ = camera.quaternion.clone(), fromFov = camera.fov;
  CAM.mode = 'tween';
  return tween(dur, t => {
    const to = typeof toPose === 'function' ? toPose() : toPose;
    camera.position.lerpVectors(fromPos, to.pos, t); camera.quaternion.copy(fromQ).slerp(to.quat, t);
    camera.fov = fromFov + (toFov - fromFov) * t; camera.updateProjectionMatrix();
  }, ease.io);
}
async function enterBuildCam() {
  if (CAM.mode !== 'fp') return;
  FP.auto = null; if (FP.locked) document.exitPointerLock && document.exitPointerLock();
  S.ceiling.visible = false;
  await camTween(orbitPose({}), 42, 1.25);
  CAM.mode = 'orbit';
}
async function exitBuildCam() {
  if (CAM.mode !== 'orbit') return;
  const fpPose = () => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(FP.pitch, FP.yaw, 0, 'YXZ')); return { pos: new THREE.Vector3(FP.pos.x, FP.eye, FP.pos.z), quat: q }; };
  await camTween(fpPose, 66, 1.1);
  showAllWalls(); S.ceiling.visible = true;
  camera.rotation.order = 'YXZ'; CAM.mode = 'fp';
}
function showAllWalls() { if (!S.wallGroups) return; Object.values(S.wallGroups).forEach(g => { g.visible = true; }); S.itemGroups.forEach(g => { g.visible = true; }); }
function orbitUpdate(dt) {
  const o = orbitPose({});
  camera.position.lerp(o.pos, 1 - Math.exp(-dt * 10)); camera.lookAt(0, .6, 0);
  const cp = camera.position, hide = { back: cp.z < -4, front: cp.z > 4, left: cp.x < -5, right: cp.x > 5 };
  Object.entries(S.wallGroups).forEach(([k, g]) => { g.visible = !hide[k]; });
  S.itemGroups.forEach(g => { const w = g.userData.def && g.userData.def.wall; g.visible = !(w && hide[w]); });
}
function updateRoomCamera(dt) {
  if (CAM.mode === 'fp') fpUpdate(dt);
  else if (CAM.mode === 'orbit') orbitUpdate(dt);
  if (CAM.mode === 'tween' && S.wallGroups) {
    const cp = camera.position, hide = { back: cp.z < -4, front: cp.z > 4, left: cp.x < -5, right: cp.x > 5 };
    Object.entries(S.wallGroups).forEach(([k, g]) => { g.visible = !hide[k]; });
  }
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}

/* ============================================================
   The planet: real geography, drawn as a lattice of light
   ============================================================ */
const G = {
  root: null, land: null, landMat: null, ocean: null, oceanMat: null, halo: null, rings: [], stars: null,
  pins: [], pinRoot: null, arcs: [], ambient: null, reticle: null, marker: null, landGrid: null,
  cam: { lat: 22, lon: 112, dist: 9 }, vel: { lat: 0, lon: 0 }, fly: null, idle: 0, shift: 0, shiftGoal: 0,
  hover: null, hoverDir: new THREE.Vector3(0, 1, 0), hoverAmt: 0, clickDir: new THREE.Vector3(0, 1, 0), clickT: -1,
  sun: new THREE.Vector3(1, 0, 0), ready: false, moving: false, pending: null
};
function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') {
  const c = mkCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(.18, mid); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const GLOW_TEX = glowTexture();
const NV = 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';

function buildGlobe(landBuf) {
  const root = new THREE.Group(); G.root = root; globeScene.add(root);
  // ---- ocean: a dark lacquered sphere with a graticule and a lit limb
  G.oceanMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: G.sun }, hoverDir: { value: G.hoverDir }, hoverAmt: { value: 0 }, time: { value: 0 } },
    extensions: { derivatives: true },
    vertexShader: NV,
    fragmentShader: `
      uniform vec3 sunDir, hoverDir; uniform float hoverAmt, time; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(sunDir);
        float ndl = dot(N, L);
        float la = asin(clamp(N.y, -1., 1.)) / 0.2617994, lo = atan(N.z, -N.x) / 0.2617994;
        float gl = abs(fract(la + .5) - .5) / fwidth(la), gm = abs(fract(lo + .5) - .5) / fwidth(lo);
        float grid = (1. - smoothstep(0., 1.2, gl)) + (1. - smoothstep(0., 1.2, gm)) * smoothstep(.98, .9, abs(N.y));
        float eq = 1. - smoothstep(0., 1.6, abs(la) / fwidth(la));
        vec3 col = mix(vec3(.008, .010, .03), vec3(.016, .04, .085), smoothstep(-.25, .7, ndl));
        col += vec3(.06, .16, .26) * clamp(grid, 0., 1.) * (.35 + .4 * smoothstep(-.3, .6, ndl));
        col += vec3(1., .55, .25) * eq * .18;
        float fr = pow(1. - max(dot(N, V), 0.), 3.);
        col += mix(vec3(.85, .25, .6), vec3(.2, .65, 1.), smoothstep(-.35, .45, ndl)) * fr * .9;
        float term = exp(-pow(ndl / .07, 2.));
        col += vec3(1., .5, .2) * term * .07;
        float sweep = pow(max(0., sin(atan(N.z, -N.x) - time * .25)), 60.);
        col += vec3(.2, .6, 1.) * sweep * .05;
        col += vec3(1., .7, .3) * smoothstep(.996, 1., dot(N, hoverDir)) * hoverAmt * .06;
        gl_FragColor = vec4(col, 1.);
      }`
  });
  G.ocean = new THREE.Mesh(new THREE.SphereGeometry(.995, 128, 96), G.oceanMat);
  root.add(G.ocean);

  // ---- land: ~52k dots from real coastlines; brightness from real city lights, lift from real elevation
  const rec = new DataView(landBuf), n = Math.floor(landBuf.byteLength / 6);
  const pos = new Float32Array(n * 3), li = new Float32Array(n), el = new Float32Array(n), co = new Float32Array(n), rnd = new Float32Array(n);
  const grid = new Uint8Array(360 * 720), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const lat = rec.getInt16(i * 6, true) / 100, lon = rec.getInt16(i * 6 + 2, true) / 100, l = rec.getUint8(i * 6 + 4), e = rec.getUint8(i * 6 + 5);
    latLonToVec(lat, lon, 1, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    li[i] = l / 255; el[i] = (e & 254) / 200; co[i] = e & 1; rnd[i] = Math.random();
    grid[Math.floor(90 - lat) * 2 * 720 + Math.floor((lon + 180) * 2) % 720] = 1;
  }
  G.landGrid = grid;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('aLi', new THREE.BufferAttribute(li, 1)); lg.setAttribute('aEl', new THREE.BufferAttribute(el, 1));
  lg.setAttribute('aCoast', new THREE.BufferAttribute(co, 1)); lg.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  G.landMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, size: { value: 2.5 }, pr: { value: DPR }, sunDir: { value: G.sun }, hoverDir: { value: G.hoverDir }, hoverAmt: { value: 0 }, clickDir: { value: G.clickDir }, clickT: { value: -1 }, reveal: { value: 0 } },
    vertexShader: `
      uniform float time, size, pr, hoverAmt, clickT, reveal; uniform vec3 sunDir, hoverDir, clickDir;
      attribute float aLi, aEl, aCoast, aRnd; varying vec3 vCol; varying float vA;
      void main(){
        vec3 n = normalize(position);
        float ndl = dot(n, normalize(sunDir)), day = smoothstep(-.1, .25, ndl);
        float hd = acos(clamp(dot(n, hoverDir), -1., 1.)), hl = hoverAmt * smoothstep(.2, .0, hd);
        float wave = 0.;
        if (clickT >= 0.) { float cd = acos(clamp(dot(n, clickDir), -1., 1.)); wave = smoothstep(.045, .0, abs(cd - clickT * .85)) * max(0., 1. - clickT * .6); }
        float rv = smoothstep(aRnd * .6, aRnd * .6 + .4, reveal);
        float h = 1. + aEl * .03 + hl * (.012 + .012 * sin(time * 5. - hd * 60.)) + wave * .035 + (1. - rv) * .25;
        vec4 mv = modelViewMatrix * vec4(n * h, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(size * pr * (1. + hl * .7 + wave * 1.1 + aLi * .3) * pow(3.3 / -mv.z, .72), 40. * pr);
        vec3 dayC = mix(vec3(.42, .5, .68), vec3(1., .86, .66), clamp(aEl * 1.7, 0., 1.));
        dayC = mix(dayC, vec3(.45, .9, 1.), aCoast * .6);
        vec3 nightC = vec3(.13, .1, .3) + vec3(.1, .3, .45) * aCoast * .7;
        vec3 lights = mix(vec3(1., .42, .18), vec3(1., .86, .55), aLi) * aLi * aLi * 3.2 * (.82 + .18 * sin(time * 1.7 + aRnd * 40.));
        vCol = mix(nightC + lights, dayC * (.5 + .42 * day) + lights * .15, day);
        vCol += vec3(1., .7, .32) * hl * .75 + vec3(.45, .9, 1.) * wave * 1.6;
        vec3 V = normalize(cameraPosition - (modelMatrix * vec4(n, 1.)).xyz);
        vA = smoothstep(-.02, .3, dot(n, V)) * rv;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vCol, smoothstep(.5, .22, d) * vA); }`
  });
  G.land = new THREE.Points(lg, G.landMat); root.add(G.land);

  // ---- halo
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { sunDir: { value: G.sun } },
    vertexShader: 'varying vec3 vNv; varying vec3 vN; void main(){ vNv = normalize(normalMatrix * normal); vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `
      uniform vec3 sunDir; varying vec3 vNv; varying vec3 vN;
      void main(){ float i = pow(clamp(.74 - dot(vNv, vec3(0., 0., 1.)), 0., 1.), 3.4);
        vec3 c = mix(vec3(.3, .36, .95), vec3(.42, .7, 1.), smoothstep(-.4, .5, dot(normalize(vN), normalize(sunDir))));
        gl_FragColor = vec4(c * i * 1.15, 1.); }`
  }));
  G.halo = halo; root.add(halo);

  // ---- orbit rings with travelling packets
  [[1.42, .32, .9, '#7db7ff'], [1.7, -.55, .4, '#9d8cff']].forEach(([r, tilt, spin, col], k) => {
    const ring = new THREE.Group(); ring.rotation.set(tilt, spin, k ? .3 : -.2);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, .0011, 6, 256), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(.6), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    t.rotation.x = Math.PI / 2; ring.add(t);
    const sats = [];
    for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: new THREE.Color(col).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(.05); ring.add(s); sats.push({ s, a: i / 3 * Math.PI * 2, sp: .12 + k * .05 + i * .01 }); }
    root.add(ring); G.rings.push({ ring, sats, r });
  });

  // ---- stars
  const sp = [], ss = [];
  for (let i = 0; i < 3200; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 180 + Math.random() * 60, s = Math.sqrt(1 - u * u); sp.push(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r); ss.push(Math.pow(Math.random(), 6) * 3 + .6, Math.random()); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const sa = new Float32Array(ss.length / 2), sr = new Float32Array(ss.length / 2); for (let i = 0; i < sa.length; i++) { sa[i] = ss[i * 2]; sr[i] = ss[i * 2 + 1]; }
  sg.setAttribute('aS', new THREE.BufferAttribute(sa, 1)); sg.setAttribute('aR', new THREE.BufferAttribute(sr, 1));
  G.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, pr: { value: DPR } },
    vertexShader: 'uniform float time, pr; attribute float aS, aR; varying float vB; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aS * pr; vB = .45 + .55 * sin(time * (.6 + aR * 2.) + aR * 50.); vC = mix(vec3(.75, .8, 1.), vec3(1., .82, .7), aR); }',
    fragmentShader: 'varying float vB; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vC * (.5 + vB * .7), smoothstep(.5, 0., d) * (.35 + vB * .5)); }'
  }));
  globeScene.add(G.stars);

  // ---- reticle (hover)
  const ret = new THREE.Group();
  const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb454').multiplyScalar(1.8), transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  ret.add(new THREE.Mesh(new THREE.RingGeometry(.026, .029, 64), rmat));
  const inner = new THREE.Mesh(new THREE.RingGeometry(.012, .0135, 48, 1, 0, Math.PI * 1.4), rmat); ret.add(inner); ret.userData.inner = inner;
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(.011, .0018), rmat); const a = i * Math.PI / 2; t.position.set(Math.cos(a) * .038, Math.sin(a) * .038, 0); t.rotation.z = a; ret.add(t); }
  ret.visible = false; root.add(ret); G.reticle = ret;

  // ---- residents, connections, demo population
  G.pinRoot = new THREE.Group(); root.add(G.pinRoot);
  RESIDENTS.forEach(r => addPin(r));
  buildArcs();
  buildAmbient();
  G.ready = true;
}
function isWater(lat, lon) {
  if (!G.landGrid) return false;
  const y = Math.floor(90 - lat) * 2, x = Math.floor((lon + 180) * 2);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; if (yy < 0 || yy >= 360) continue; if (G.landGrid[yy * 720 + ((x + dx) % 720 + 720) % 720]) return false; }
  return true;
}
function residentColor(r) {
  const info = residentInfo(r);
  if (info.mine) return TK.accent;
  if (r.preset) return ROOM_PRESETS[r.preset].theme.neonColor;
  if (r.state === 'reno') return TK.text3;
  return '#' + new THREE.Color().setHSL(r.hue || .5, .85, .66).getHexString();
}
function addPin(r, landing) {
  const info = residentInfo(r), col = new THREE.Color(residentColor(r));
  const up = latLonToVec(r.lat, r.lon).normalize();
  const g = new THREE.Group(); g.position.copy(up); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const h = info.mine ? .2 : info.state === 'reno' ? .05 : .1;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: col.clone().multiplyScalar(info.mine ? 2.2 : 1.6) }, grow: { value: landing ? 0 : 1 } },
    vertexShader: 'varying float vY; uniform float grow; void main(){ vY = uv.y; vec3 p = position; p.y *= grow; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }',
    fragmentShader: 'uniform vec3 col; varying float vY; void main(){ gl_FragColor = vec4(col, pow(1. - vY, 1.6) * .95); }'
  });
  const bg = new THREE.CylinderGeometry(.0028, .0028, h, 8, 1, true); bg.translate(0, h / 2, 0);
  g.add(new THREE.Mesh(bg, beamMat));
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: col.clone().multiplyScalar(info.mine ? 2.6 : 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  head.scale.setScalar(info.mine ? .07 : .045); head.position.y = .004; g.add(head);
  const ringMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.012, .0145, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .002; g.add(ring);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = h * .5; hit.userData.pin = r; g.add(hit);
  G.pinRoot.add(g);
  const pin = { r, g, beamMat, head, ring, ringMat, hit, up, h, phase: Math.random(), label: null };
  G.pins.push(pin);
  return pin;
}
function pinOf(no) { return G.pins.find(p => p.r.no === no); }
function arcCurve(a, b) {
  const ang = a.angleTo(b), lift = .06 + ang * .22, pts = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64; const p = new THREE.Vector3().copy(a).lerp(b, t).normalize(); const s = Math.sin(ang * (1 - t)) / Math.sin(ang), s2 = Math.sin(ang * t) / Math.sin(ang); if (ang > 1e-3) p.copy(a).multiplyScalar(s).addScaledVector(b, s2); p.multiplyScalar(1.004 + lift * Math.sin(Math.PI * t)); pts.push(p); }
  return new THREE.CatmullRomCurve3(pts);
}
function buildArcs() {
  G.arcs.forEach(a => G.pinRoot.remove(a.mesh)); G.arcs = [];
  const seen = new Set(), pairs = [];
  RESIDENTS.forEach(r => (r.friends || []).forEach(no => { const o = RESIDENTS.find(x => x.no === no && !x.real); if (o) pairs.push([r, o, false]); }));
  realArcPairs().forEach(([a, b]) => pairs.push([a, b, true]));
  pairs.forEach(([r, o, real]) => {
    const key = [r.real ? r.key : r.no, o.real ? o.key : o.no].sort().join('-'); if (seen.has(key)) return; seen.add(key);
    const a = latLonToVec(r.lat, r.lon).normalize(), b = latLonToVec(o.lat, o.lon).normalize();
    const mine = !real && (r.preset === 'mine' || o.preset === 'mine');
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, phase: { value: Math.random() }, col: { value: new THREE.Color(real ? TK.heat : mine ? TK.accent : TK.info) }, dim: { value: 1 } },
      vertexShader: 'varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform float time, phase, dim; uniform vec3 col; varying float vT; void main(){ float d = fract(vT - time * .22 - phase); float pulse = smoothstep(0., .02, d) * smoothstep(.16, .0, d); float base = .12 + .1 * sin(vT * 3.14159); gl_FragColor = vec4(col * (1. + pulse * 2.2), (base + pulse * .95) * dim * smoothstep(0., .04, vT) * smoothstep(1., .96, vT)); }'
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(arcCurve(a, b), 96, mine ? .0024 : .0016, 6, false), mat);
    G.pinRoot.add(mesh); G.arcs.push({ mesh, mat });
  });
}
function buildAmbient() {
  // demo population: faint homes scattered around real cities (演示数据)
  const r = rng(11), pts = [], v = new THREE.Vector3();
  let guard = 0;
  while (pts.length < 2600 * 3 && guard++ < 20000) {
    const c = CITIES[Math.floor(r() * CITIES.length)];
    const lat = c.lat + (r() - .5) * (r() < .7 ? 3 : 10), lon = c.lon + (r() - .5) * (r() < .7 ? 4 : 14);
    if (isWater(lat, lon)) continue;
    latLonToVec(lat, lon, 1.006, v); pts.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  G.ambient = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { pr: { value: DPR }, time: { value: 0 } },
    vertexShader: 'uniform float pr, time; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = min(3.2 * pr * pow(3.3 / -mv.z, .72), 30. * pr); vec3 n = normalize(position); vec3 V = normalize(cameraPosition - (modelMatrix * vec4(position, 1.)).xyz); vA = smoothstep(.0, .3, dot(n, V)) * (.55 + .45 * sin(time * 1.3 + position.x * 90. + position.z * 70.)); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(1., .72, .38) * 1.6, smoothstep(.5, .0, d) * vA * .7); }'
  }));
  G.pinRoot.add(G.ambient);
}
function updateSun() { const s = sunInfo(); latLonToVec(s.decl, s.lon, 1, G.sun).normalize(); }

/* ---------- globe camera ---------- */
function globeCamDir(out) { return latLonToVec(G.cam.lat, G.cam.lon, 1, out); }
function flyGlobe(lat, lon, dist, dur = 1.6) {
  let dl = lon - G.cam.lon; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
  const from = { lat: G.cam.lat, lon: G.cam.lon, dist: G.cam.dist }, to = { lat: clamp(lat, -72, 72), lon: G.cam.lon + dl, dist };
  G.vel.lat = G.vel.lon = 0; G.idle = 0;
  const id = (G.flyId = (G.flyId || 0) + 1);
  return tween(dur, t => {
    if (G.flyId !== id) return;
    G.cam.lat = from.lat + (to.lat - from.lat) * t; G.cam.lon = from.lon + (to.lon - from.lon) * t;
    const arc = Math.sin(Math.PI * t) * Math.min(.9, Math.abs(dl) / 120 + Math.abs(to.lat - from.lat) / 160) * (from.dist + to.dist) * .25;
    G.cam.dist = from.dist + (to.dist - from.dist) * t + arc;
  }, ease.io);
}
function updateGlobeCamera(dt) {
  if (!G.dragging && !G.flyId_active) {
    G.cam.lon += G.vel.lon * dt; G.cam.lat += G.vel.lat * dt;
    const k = Math.exp(-dt * 3.2); G.vel.lon *= k; G.vel.lat *= k;
  }
  G.idle += dt;
  if (G.idle > 5 && !S.panel && !G.dragging && !S.busy && S.view === 'globe') G.cam.lon += dt * 2.2;
  G.cam.lat = clamp(G.cam.lat, -75, 75);
  latLonToVec(G.cam.lat, G.cam.lon, G.cam.dist, gcam.position);
  gcam.up.set(0, 1, 0); gcam.lookAt(0, 0, 0);
  G.shift += (G.shiftGoal - G.shift) * (1 - Math.exp(-dt * 5));
  const W = innerWidth, H = innerHeight;
  gcam.aspect = W / H;
  const sy = isNarrow() && S.view === 'globe' && !S.panel ? -H * .1 : 0;
  if (Math.abs(G.shift) > .5 || sy) gcam.setViewOffset(W, H, -G.shift, sy, W, H); else if (gcam.view) gcam.clearViewOffset();
  gcam.updateProjectionMatrix();
}
function updateGlobe(dt, T) {
  if (!G.ready) return;
  updateGlobeCamera(dt);
  G.oceanMat.uniforms.time.value = T; G.landMat.uniforms.time.value = T;
  G.hoverAmt += ((G.hover ? 1 : 0) - G.hoverAmt) * (1 - Math.exp(-dt * 8));
  G.oceanMat.uniforms.hoverAmt.value = G.hoverAmt; G.landMat.uniforms.hoverAmt.value = G.hoverAmt;
  if (G.clickT >= 0) { G.clickT += dt; if (G.clickT > 2.2) G.clickT = -1; G.landMat.uniforms.clickT.value = G.clickT; }
  G.rings.forEach(({ ring, sats, r }) => { ring.rotation.y += dt * .02; sats.forEach(s => { s.a += dt * s.sp; s.s.position.set(Math.cos(s.a) * r, 0, Math.sin(s.a) * r); }); });
  G.stars.material.uniforms.time.value = T;
  if (G.ambient) G.ambient.material.uniforms.time.value = T;
  for (const p of G.pins) {
    const f = (T * .55 + p.phase) % 1;
    const k = p.dim ? .22 : 1;
    p.ring.scale.setScalar(1 + f * (p.themed ? 4.2 : 2.6)); p.ringMat.opacity = (1 - f) * .9 * k;
    p.head.material.opacity = (.85 + Math.sin(T * 3 + p.phase * 9) * .15) * k;
  }
  G.arcs.forEach(a => { a.mat.uniforms.time.value = T; });
  if (G.reticle.visible) { G.reticle.rotation.z += dt * .6; G.reticle.userData.inner.rotation.z -= dt * 2.4; }
  if (G.marker) { G.marker.userData.t += dt; const f = (G.marker.userData.t * .8) % 1; G.marker.userData.ring.scale.setScalar(1 + f * 3); G.marker.userData.ring.material.opacity = 1 - f; }
}
function placeReticle(dir) {
  const r = G.reticle; r.visible = true;
  r.position.copy(dir).multiplyScalar(1.012);
  r.lookAt(dir.clone().multiplyScalar(2));
}
function dropMarker(lat, lon, color = '#ffb454') {
  clearMarker();
  const up = latLonToVec(lat, lon).normalize(), g = new THREE.Group();
  g.position.copy(up); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const c = new THREE.Color(color).multiplyScalar(2);
  const bg = new THREE.CylinderGeometry(.003, .003, .16, 8, 1, true); bg.translate(0, .08, 0);
  g.add(new THREE.Mesh(bg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: c } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform vec3 col; varying float vY; void main(){ gl_FragColor = vec4(col, (1. - vY) * .9); }' })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.014, .017, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .003; g.add(ring);
  g.userData = { t: 0, ring };
  G.root.add(g); G.marker = g;
}
function clearMarker() { if (G.marker) { G.root.remove(G.marker); G.marker = null; } }
function ripple(dir) { G.clickDir.copy(dir).normalize(); G.clickT = 0; }

/* ============================================================
   Cloud: accounts, shared rooms, visits, messages, hosted works
   (artifact db + user). Without them the page runs on local storage.
   ============================================================ */
const CLOUD = { ready: false, db: null, user: null, me: null, isOwner: false, canWrite: null, readOnly: false, site: null, rooms: new Map(), msgs: new Map(), visits: new Map(), lastSeen: 0, landing: null, greeted: false };
const SHARE_BASE = 'https://claude.ai/artifact/LWAStw84ruoEsCPAvfHYEP';
const NAMES = new Map();
const WQ = new Map();
function cloudWrite(path, body) {
  const prev = WQ.get(path) || Promise.resolve();
  const p = prev.catch(() => {}).then(() => CLOUD.db.doc(path).set(body));
  WQ.set(path, p);
  p.catch(e => {
    const c = e && e.code;
    if (c === 'invalid_argument' && CLOUD.canWrite !== true) { CLOUD.readOnly = true; syncChrome(); toast('你现在只能参观：入住和留言需要房主把你设为“参与者”'); }
    else if (c === 'quota_exceeded') toast('社区的存储空间满了，请联系房主清理后再试');
    else if (c === 'resource_exhausted') toast('操作太快了，稍等几秒再试');
    else if (c !== 'revoked') toast('没保存成功，网络恢复后再试一次');
  });
  return p;
}
const canPost = () => CLOUD.ready && CLOUD.canWrite !== false && !CLOUD.readOnly;
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前'; if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
  const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日`;
}
async function initCloud() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const me = await user.me(); if (!me || !me.id) return;
    Object.assign(CLOUD, { db, user, me, isOwner: !!me.isOwner });
    CLOUD.canWrite = await user.can('data.write');
    try { const st = await db.doc(`data/users/${me.id}/state`).get(); CLOUD.lastSeen = st.exists ? (+st.data().lastSeen || 0) : 0; } catch (e) {}
    CLOUD.ready = true;
    loadPocket();
    const err = e => { if (e && e.code === 'revoked') { CLOUD.ready = false; syncChrome(); } };
    db.doc('site/room302').onSnapshot(s => { CLOUD.site = s.exists ? s.data() : null; onSite(); }, err);
    db.collection('rooms').onSnapshot(s => { CLOUD.rooms = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onRooms(); }, err);
    db.collection('msgs').onSnapshot(s => { CLOUD.msgs = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onMsgs(); }, err);
    db.collection('visits').onSnapshot(s => { CLOUD.visits = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onVisits(); }, err);
    for (let i = RESIDENTS.length - 1; i >= 0; i--) if (RESIDENTS[i].custom) RESIDENTS.splice(i, 1);
    syncChrome();
  } catch (e) { console.warn('cloud unavailable', e); }
}
/* ---------- identity helpers ---------- */
const isMine302 = () => !CLOUD.ready || CLOUD.isOwner;
function roomKey(room) { if (!room) return null; if (room.id === 'mine') return '302'; return room.uid || null; }
function keyOfResident(r) { return r.preset === 'mine' ? '302' : r.real ? r.key : null; }
function iOwnRoom(key) { return CLOUD.ready && !!key && (key === '302' ? CLOUD.isOwner : key === CLOUD.me.id); }
function myRoomKey() { if (!CLOUD.ready) return null; if (CLOUD.isOwner) return '302'; return CLOUD.rooms.has(CLOUD.me.id) ? CLOUD.me.id : null; }
function myResident() { const k = myRoomKey(); if (!k) return null; return k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); }
function ownerHandle302() { const id = CLOUD.site && CLOUD.site.ownerId; return (id && NAMES.get(id)) || '老板'; }
async function resolveNames(ids) {
  if (!CLOUD.user) return;
  const need = [...new Set(ids)].filter(id => id && !NAMES.has(id));
  if (!need.length) return;
  try { const ps = await CLOUD.user.profiles(need); need.forEach(id => NAMES.set(id, (ps[id] && ps[id].name) || '')); } catch (e) {}
}
function nameOfUid(uid) {
  if (CLOUD.ready && uid === CLOUD.me.id) return '你';
  const r = CLOUD.rooms.get(uid); if (r && r.handle) return String(r.handle).slice(0, 20);
  if (CLOUD.site && CLOUD.site.ownerId === uid) return ownerHandle302() + '（302 房主）';
  return NAMES.get(uid) || '一位访客';
}

/* ---------- privacy: addresses stay at city level ---------- */
function snapToCity(lat, lon, seed) {
  const n = nearestCity({ lat, lon }), r = rng(hash(String(seed)));
  if (n.km < 320) { const a = r() * Math.PI * 2, d = .03 + r() * .06; return { lat: n.city.lat + Math.sin(a) * d, lon: n.city.lon + Math.cos(a) * d / Math.cos(n.city.lat * D2R), city: n.city.zh }; }
  return { lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2, city: describePlace(lat, lon, false).title };
}
function fmtCity(lat, lon) { return `约 ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} · 城市级`; }
RESIDENTS.forEach(r => { const s = snapToCity(r.lat, r.lon, r.no); r.lat = s.lat; r.lon = s.lon; });
{ const r302 = RESIDENTS.find(r => r.preset === 'mine'); if (r302) { ME.lat = r302.lat; ME.lon = r302.lon; } }

/* ---------- sanitising other people's rooms ---------- */
const WORK_RE = /^(site\/room302|rooms\/[A-Za-z0-9_\-.~:@+]+)\/works\/[A-Za-z0-9_-]+$/;
function cleanEntry(e, prefix) {
  if (!e || typeof e !== 'object') return undefined;
  const kind = KIND_LABEL[e.kind] ? e.kind : 'web';
  const o = { kind, title: String(e.title || '').slice(0, 30), desc: String(e.desc || '').slice(0, 80), url: validUrl(e.url) ? String(e.url).trim().slice(0, 500) : '' };
  const fr = cleanFrom(e.from); if (fr) o.from = fr;
  if (typeof e.work === 'string' && WORK_RE.test(e.work) && (!prefix || e.work.startsWith(prefix) || (fr && !fr.adapted))) { o.work = e.work; o.workBytes = +e.workBytes || 0; }
  if (e.open === 'tab') o.open = 'tab';
  if (e.size === 'wide' || e.size === 'tall') o.size = e.size;
  if (typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color)) o.color = e.color;
  if (e.downloads && typeof e.downloads === 'object') { const d = {}; PLATFORMS.forEach(p => { const it = e.downloads[p.k]; if (it && validUrl(it.url)) d[p.k] = { url: String(it.url).slice(0, 500), ver: String(it.ver || '').slice(0, 12) }; }); if (Object.keys(d).length) o.downloads = d; }
  return o;
}
const KEY_RE = /^[A-Za-z0-9_\-.~:@+]{1,60}$/;
function cleanFrom(f) {
  if (!f || typeof f !== 'object' || typeof f.room !== 'string' || !KEY_RE.test(f.room)) return null;
  const o = { room: f.room, by: String(f.by || '').slice(0, 20), title: String(f.title || '').slice(0, 30), at: +f.at || 0 };
  if (f.adapted) o.adapted = true;
  if (Array.isArray(f.chain)) o.chain = f.chain.slice(-4).map(c => ({ by: String((c && c.by) || '').slice(0, 20), title: String((c && c.title) || '').slice(0, 30) }));
  return o;
}
function cleanItems(items, prefix) {
  const num = (v, lo, hi) => clamp(+v || 0, lo, hi);
  return (Array.isArray(items) ? items : []).slice(0, 80).filter(i => i && ITEMS[i.type]).map(i => {
    const o = { uid: String(i.uid || i.type).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'i' + Math.random().toString(36).slice(2, 7), type: i.type };
    if (['back', 'left', 'right', 'front'].includes(i.wall)) { o.wall = i.wall; o.u = num(i.u, -5, 5); o.y = num(i.y, 0, RH); }
    else { o.x = num(i.x, -5, 5); o.z = num(i.z, -4, 4); o.rot = Math.round(num(i.rot, 0, 3)); o.ry = num(i.ry, -3.2, 3.2); }
    if (i.entry) o.entry = cleanEntry(i.entry, prefix);
    if (i.opts && typeof i.opts === 'object') o.opts = { console: i.opts.console !== false, note: i.opts.note !== false };
    if (i.text) o.text = String(i.text).slice(0, 24);
    if (i.children && typeof i.children === 'object') { o.children = {}; for (const k of ['vinyl', 'console', 'note', 'cassette']) if (i.children[k]) o.children[k] = { name: String(i.children[k].name || '').slice(0, 16), entry: cleanEntry(i.children[k].entry, prefix) }; }
    return o;
  });
}
function cleanTheme(t) {
  const c = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v : null;
  const base = ROOM_PRESETS.pixel.theme, o = {};
  for (const k of ['wall', 'trim', 'floorTint', 'neonColor', 'arcade', 'bean', 'sofa']) o[k] = c(t && t[k]) || base[k] || '#2a2238';
  o.floor = ['wood', 'tile', 'concrete'].includes(t && t.floor) ? t.floor : 'wood';
  o.neon = String((t && t.neon) || 'GEBI').slice(0, 16);
  o.rug = Array.isArray(t && t.rug) && t.rug.length === 4 && t.rug.every(c) ? t.rug : base.rug;
  return o;
}
function realResidents() {
  const out = [];
  CLOUD.rooms.forEach((d, uid) => {
    if (!d || typeof d.lat !== 'number' || typeof d.lon !== 'number') return;
    out.push({ no: String(d.no || '000').replace(/\D/g, '').slice(0, 4) || '000', key: uid, real: true, handle: String(d.handle || '@住户').slice(0, 20), name: String(d.name || '新房间').slice(0, 16), city: String(d.city || '').slice(0, 16), lat: clamp(d.lat, -85, 85), lon: clamp(d.lon, -180, 180), tagline: '隔壁住户', tags: ['真实住户'], hue: (hash(uid) % 1000) / 1000, tw: cleanTw(d.tw), twLog: cleanTwLog(d.twLog) });
  });
  return out;
}
function realRoom(r) {
  const d = CLOUD.rooms.get(r.key) || {}, prefix = `rooms/${r.key}/works/`;
  return { id: 'u-' + r.key, uid: r.key, no: r.no, name: r.name, owner: r.key === (CLOUD.me && CLOUD.me.id) ? '你' : r.handle, mine: iOwnRoom(r.key), theme: cleanTheme(d.theme), items: cleanItems(d.items, prefix), lat: r.lat, lon: r.lon, city: r.city };
}

/* ---------- live updates ---------- */
let arcsT = 0;
function refreshArcsSoon() { clearTimeout(arcsT); arcsT = setTimeout(() => { if (G.ready) buildArcs(); }, 800); }
function syncRealResidents() {
  for (let i = RESIDENTS.length - 1; i >= 0; i--) if (RESIDENTS[i].real) RESIDENTS.splice(i, 1);
  RESIDENTS.push(...realResidents());
  resolveNames([...CLOUD.rooms.keys()]);
  if (!G.ready) return;
  for (let i = G.pins.length - 1; i >= 0; i--) { const p = G.pins[i]; if ((p.r.real && p.r.key !== CLOUD.landing) || p.r.custom) { G.pinRoot.remove(p.g); G.pins.splice(i, 1); } }
  RESIDENTS.filter(r => r.real && r.key !== CLOUD.landing).forEach(r => addPin(r));
  buildArcs(); buildGlobeLabels(); applyThemeMap(); syncChrome();
}
function onSite() {
  const s = CLOUD.site, r = RESIDENTS.find(x => x.preset === 'mine');
  if (s && s.ownerId) resolveNames([s.ownerId]).then(() => { if (G.ready) buildGlobeLabels(); syncChrome(); });
  if (r && s && typeof s.lat === 'number' && typeof s.lon === 'number') {
    const moved = Math.abs(r.lat - s.lat) > 1e-6 || Math.abs(r.lon - s.lon) > 1e-6;
    r.lat = clamp(s.lat, -85, 85); r.lon = clamp(s.lon, -180, 180); r.city = String(s.city || r.city).slice(0, 16);
    Object.assign(ME, { lat: r.lat, lon: r.lon, city: r.city });
    if (moved && G.ready) { const p = pinOf('302'); if (p) { G.pinRoot.remove(p.g); G.pins.splice(G.pins.indexOf(p), 1); } addPin(r); buildArcs(); }
  }
  if (G.ready) { buildGlobeLabels(); applyThemeMap(); }
  syncChrome();
}
function onRooms() { syncRealResidents(); }
function onMsgs() {
  if (S.view === 'room' && roomKey(S.room)) drawChalk();
  if (S.panel && S.panel.kind === 'guestbook' && S.panel.render) S.panel.render();
  if (S.panel && S.panel.kind === 'inbox') renderInbox();
  const ids = []; CLOUD.msgs.forEach((d, uid) => ids.push(uid)); resolveNames(ids);
  syncChrome();
}
function onVisits() {
  if (S.panel && S.panel.kind === 'inbox') renderInbox();
  const ids = []; CLOUD.visits.forEach((d, uid) => ids.push(uid)); resolveNames(ids);
  refreshArcsSoon(); syncChrome();
}
function realArcPairs() {
  const pairs = [];
  if (!CLOUD.ready) return pairs;
  CLOUD.visits.forEach((d, uid) => {
    const from = RESIDENTS.find(r => r.real && r.key === uid) || (CLOUD.site && CLOUD.site.ownerId === uid ? RESIDENTS.find(r => r.preset === 'mine') : null);
    if (!from || !d || !d.log) return;
    Object.keys(d.log).forEach(k => { const to = k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); if (to && to !== from) pairs.push([from, to]); });
  });
  return pairs;
}

/* ---------- messages ---------- */
function roomMessages(key) {
  const out = [];
  CLOUD.msgs.forEach((d, uid) => { (Array.isArray(d && d.list) ? d.list : []).forEach(m => { if (m && m.room === key && typeof m.text === 'string' && m.id) out.push({ id: String(m.id), room: key, text: m.text.slice(0, 200), at: +m.at || 0, reply: m.reply && m.reply.to ? { to: String(m.reply.to), id: String(m.reply.id) } : null, author: uid, kind: m.kind === 'appt' ? 'appt' : '', when: String(m.when || '').slice(0, 30), nudge: +m.nudge || 0 }); }); });
  return out.sort((a, b) => a.at - b.at);
}
async function postMessage(key, text, reply, extra) {
  if (!canPost()) { toast('你现在只能参观：留言需要房主把你设为“参与者”'); return false; }
  const uid = CLOUD.me.id, d = clone(CLOUD.msgs.get(uid) || {});
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), room: key, text: text.slice(0, 120), at: Date.now() };
  if (reply) m.reply = { to: reply.author, id: reply.id };
  if (extra && extra.kind === 'appt') { m.kind = 'appt'; m.when = String(extra.when || '').slice(0, 30); }
  d.list = (Array.isArray(d.list) ? d.list : []).concat(m).slice(-120);
  d.rooms = [...new Set(d.list.map(x => x.room))];
  d.replyTo = [...new Set(d.list.filter(x => x.reply).map(x => x.reply.to))];
  d.updatedAt = Date.now();
  CLOUD.msgs.set(uid, d); onMsgs();
  if (key === '302' && CLOUD.isOwner && !(CLOUD.site && CLOUD.site.ownerId)) writeSite({});
  try { await cloudWrite(`msgs/${uid}`, d); return true; } catch (e) { return false; }
}
function threadHTML(key, opts = {}) {
  const all = roomMessages(key), tops = all.filter(m => !m.reply), owner = iOwnRoom(key);
  if (!tops.length) return `<p class="mute small u-mb3">${opts.empty || '黑板还是空的，第一个写点什么吧。'}</p>`;
  return tops.slice().reverse().slice(0, opts.limit || 40).map(m => {
    const replies = all.filter(x => x.reply && x.reply.id === m.id);
    return `<div class="gb-item" data-id="${esc(m.id)}">${m.kind === 'appt' ? `<span class="tag pink">预约 · ${esc(m.when || '时间待定')}</span> ` : ''}${esc(m.text)}<small><span>— ${esc(nameOfUid(m.author))}</span><span>${m.nudge && !replies.length ? `催过一次 · ` : ''}${esc(ago(m.at))}</span></small>
      ${replies.map(x => `<div class="gb-reply"><b>${esc(nameOfUid(x.author))}</b>：${esc(x.text)}<span>${esc(ago(x.at))}</span></div>`).join('')}
      ${owner && m.author !== CLOUD.me.id && canPost() ? `<form class="gb-rform" data-id="${esc(m.id)}" data-author="${esc(m.author)}"><input class="input" maxlength="120" placeholder="回复 ${esc(nameOfUid(m.author))}" aria-label="回复这条留言"><button class="btn sm" type="submit">回复</button></form>` : ''}</div>`;
  }).join('');
}
function bindReplies(root, key, after) {
  root.querySelectorAll('.gb-rform').forEach(f => f.addEventListener('submit', async ev => {
    ev.preventDefault(); const i = f.querySelector('input'), t = i.value.trim(); if (!t) return;
    i.value = ''; const ok = await postMessage(key, t, { author: f.dataset.author, id: f.dataset.id });
    if (ok) toast('已回复，对方下次打开隔壁会看到'); if (after) after();
  }));
}

/* ---------- visits ---------- */
let visitT = 0;
const VIA = { share: '分享链接', feed: '物件流', globe: '地球', room: '串门', search: '搜索', link: '直接链接' };
function recordVisit(key, did, via) {
  if (!canPost() || !key || iOwnRoom(key) || key.startsWith('demo:')) return;
  const uid = CLOUD.me.id, d = clone(CLOUD.visits.get(uid) || {});
  d.log = d.log && typeof d.log === 'object' ? d.log : {};
  const cur = d.log[key] || { n: 0, did: [] };
  if (did) cur.did = [...new Set([String(did).slice(0, 30)].concat(cur.did || []))].slice(0, 8);
  else { cur.n = (+cur.n || 0) + 1; if (via && VIA[via]) { cur.via = cur.via && typeof cur.via === 'object' ? cur.via : {}; cur.via[via] = (+cur.via[via] || 0) + 1; } }
  cur.at = Date.now(); d.log[key] = cur;
  const keys = Object.keys(d.log).sort((a, b) => d.log[b].at - d.log[a].at).slice(0, 150);
  d.log = Object.fromEntries(keys.map(k => [k, d.log[k]])); d.rooms = keys; d.updatedAt = Date.now();
  CLOUD.visits.set(uid, d);
  clearTimeout(visitT); visitT = setTimeout(() => cloudWrite(`visits/${uid}`, CLOUD.visits.get(uid)), 1500);
}
function roomVisitors(key) {
  const out = [];
  CLOUD.visits.forEach((d, uid) => { const v = d && d.log && d.log[key]; if (v && uid !== (CLOUD.me && CLOUD.me.id && iOwnRoom(key) ? CLOUD.me.id : '')) out.push({ uid, at: +v.at || 0, n: +v.n || 1, did: Array.isArray(v.did) ? v.did.map(x => String(x).slice(0, 30)).slice(0, 8) : [], via: v.via && typeof v.via === 'object' ? Object.fromEntries(Object.keys(VIA).map(k => [k, +v.via[k] || 0])) : {}, open: v.open && typeof v.open === 'object' ? { sdk: +v.open.sdk || 0, nosdk: +v.open.nosdk || 0, fail: +v.open.fail || 0 } : null }); });
  return out.sort((a, b) => b.at - a.at);
}
function myUpdates() {
  if (!CLOUD.ready) return { visits: [], msgs: [], replies: [], nudges: [], curations: [], count: 0 };
  const key = myRoomKey(), since = CLOUD.lastSeen, me = CLOUD.me.id;
  const visits = key ? roomVisitors(key).filter(v => v.at > since && v.uid !== me) : [];
  const msgs = key ? roomMessages(key).filter(m => m.author !== me && m.at > since && !m.reply) : [];
  const replies = [];
  CLOUD.msgs.forEach((d, uid) => (Array.isArray(d && d.list) ? d.list : []).forEach(m => { if (m && m.reply && m.reply.to === me && uid !== me && (+m.at || 0) > since) replies.push({ id: m.id, room: String(m.room), text: String(m.text || '').slice(0, 200), at: +m.at || 0, author: uid }); }));
  const nudges = key ? roomMessages(key).filter(m => m.author !== me && m.nudge > since && !m.reply && !hasReply(key, m)) : [];
  const curations = key ? curationsOf(key).filter(c => c.at > since) : [];
  return { visits, msgs, replies, nudges, curations, count: visits.length + msgs.length + replies.length + nudges.length + curations.length };
}
function didText(did, bare) {
  const seen = [], acts = [];
  did.forEach(x => { const m = /^(收藏|改编|试玩) (.+)$/.exec(x); if (m) acts.push(`${m[1]}了「${m[2]}」`); else if (x === '留言') acts.push('留了言'); else if (x === '预约') acts.push('约了时间'); else seen.push(x); });
  const t = [seen.length ? `看了「${seen.slice(0, 2).join('」「')}」` : '', ...acts.slice(0, 2)].filter(Boolean).join('，');
  return bare ? t : ' ' + t;
}
function updatesSentence(u) {
  const parts = [];
  if (u.visits.length) {
    const v = u.visits[0], who = nameOfUid(v.uid);
    parts.push(`${u.visits.length} 位邻居来过${v.did.length ? `，${who}${didText(v.did)}` : ''}`);
  }
  if (u.msgs.length) parts.push(`${u.msgs.length} 条新留言（${nameOfUid(u.msgs[u.msgs.length - 1].author)}：${u.msgs[u.msgs.length - 1].text.slice(0, 16)}${u.msgs[u.msgs.length - 1].text.length > 16 ? '…' : ''}）`);
  if (u.replies.length) parts.push(`${u.replies.length} 条回复你的消息`);
  if (u.nudges && u.nudges.length) parts.push(`${u.nudges.length} 位访客在等你回复`);
  if (u.curations && u.curations.length) { const a = u.curations.filter(c => c.adapted).length, c = u.curations.length - a; parts.push(`你的作品${c ? `被收藏了 ${c} 次` : ''}${c && a ? '，' : ''}${a ? `被改编了 ${a} 次` : ''}`); }
  return parts.length ? `自从你上次来过：${parts.join('，')}。` : '';
}
async function markSeen() {
  if (!CLOUD.ready) return;
  CLOUD.lastSeen = Date.now(); syncChrome();
  try { await CLOUD.db.doc(`data/users/${CLOUD.me.id}/state`).set({ lastSeen: CLOUD.lastSeen }); } catch (e) {}
}
function hasReply(key, m) { return roomMessages(key).some(x => x.reply && x.reply.id === m.id); }
function pendingFor(key) { const me = CLOUD.me && CLOUD.me.id; return roomMessages(key).filter(m => !m.reply && m.author !== me && !hasReply(key, m)); }
function curationsOf(key) {
  const out = [], scan = (uid, items) => { if (uid === key || !Array.isArray(items)) return; items.forEach(i => { const f = i && i.entry && cleanFrom(i.entry.from); if (f && f.room === key) out.push({ uid, title: f.title, adapted: !!f.adapted, at: f.at, mine: String(i.entry.title || '').slice(0, 30) }); }); };
  CLOUD.rooms.forEach((d, uid) => scan(uid, d && d.items));
  if (CLOUD.site) scan('302', CLOUD.site.items);
  return out.sort((a, b) => b.at - a.at);
}
function roomTitleOfKey(k) { if (k && k.startsWith('demo:')) { const r = RESIDENTS.find(x => x.no === k.slice(5)); return r ? `${r.no} ${residentInfo(r).name}` : '一间房'; } if (k === '302') return '302 零点电竞酒吧'; const d = CLOUD.rooms.get(k); return d ? `${String(d.no || '')} ${String(d.name || '')}`.trim() : '一间房'; }
function residentOfKey(k) { if (k && k.startsWith('demo:')) return RESIDENTS.find(r => r.no === k.slice(5) && !r.real); return k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); }

/* ---------- inbox: visitors, new messages, replies to me ---------- */
function openInbox() {
  if (!CLOUD.ready) return;
  if (S.panel) closePanel(true);
  S.panel = { kind: 'inbox', seen: CLOUD.lastSeen };
  renderInbox();
  setTimeout(markSeen, 1200);
}
function renderInbox() {
  if (!S.panel || S.panel.kind !== 'inbox') return;
  const key = myRoomKey(), since = S.panel.seen, u = (() => { const s = CLOUD.lastSeen; CLOUD.lastSeen = since; const x = myUpdates(); CLOUD.lastSeen = s; return x; })();
  const visitors = key ? roomVisitors(key).filter(v => v.uid !== CLOUD.me.id).slice(0, 30) : [];
  const sentence = updatesSentence(u), curations = key ? curationsOf(key) : [];
  const replies = u.replies.slice().reverse().map(m => `<li class="ib-item"><div><b>${esc(nameOfUid(m.author))}</b> 在「${esc(roomTitleOfKey(m.room))}」回复了你</div><p>${esc(m.text)}</p><small>${esc(ago(m.at))}</small>${residentOfKey(m.room) ? `<button type="button" class="btn sm ghost" data-go="${esc(m.room)}">去看看</button>` : ''}</li>`).join('');
  const vis = visitors.map(v => `<li class="ib-item${v.at > since ? ' new' : ''}"><div><b>${esc(nameOfUid(v.uid))}</b> 来过 ${v.n > 1 ? `${v.n} 次` : ''}</div>${v.did.length ? `<p>${esc(didText(v.did, true))}</p>` : '<p class="mute">在房间里逛了逛</p>'}<small>${esc(ago(v.at))}</small></li>`).join('');
  setPanel('我的动态', key ? '访客簿' : '回复与动态', `
    <div class="bit-say"><div class="bit-face sm" id="ibFace"></div><p>${esc(sentence || (key ? (visitors.length ? '这段时间没有新动静。' : '还没有人来过。新房间先去串串门最有效：邻居会顺着来访记录回访你。') : '你还没有房间。在地球上选个地址入住，邻居们才找得到你。'))}</p></div>
    ${key && !sentence && visitors.length < 3 ? coldStartHTML(key) : ''}
    ${key && visitors.length ? `<p class="section-t">他们从哪里来</p><div class="chiprow">${viaSummary(visitors)}</div>` : ''}
    ${replies ? `<p class="section-t">回复你的消息</p><ul class="ib-list">${replies}</ul><div class="divider"></div>` : ''}
    ${key && curations.length ? `<p class="section-t">被收藏与改编 · ${curations.length}</p><ul class="ib-list">${curations.slice(0, 12).map(c => `<li class="ib-item${c.at > since ? ' new' : ''}"><div><b>${esc(nameOfUid(c.uid))}</b> ${c.adapted ? '改编了' : '收藏了'}「${esc(c.title)}」</div>${c.adapted ? `<p>改编后的名字：${esc(c.mine)}</p>` : ''}<small>${esc(ago(c.at))}</small>${residentOfKey(c.uid) ? `<button type="button" class="btn sm ghost" data-go="${esc(c.uid)}">去 TA 的房间</button>` : ''}</li>`).join('')}</ul><div class="divider"></div>` : ''}
    ${key ? `<p class="section-t">黑板上的留言${key && pendingFor(key).length ? ` · <span class="pending">${pendingFor(key).length} 条等你回复</span>` : ''}</p><div class="gb-list" id="ibThread">${threadHTML(key, { empty: '还没有人留言。', limit: 20 })}</div><div class="divider"></div>
    <p class="section-t">最近来过的人 · ${visitors.length} 位</p>${vis ? `<ul class="ib-list">${vis}</ul>` : '<p class="mute small u-m0">还没有访客。</p>'}
    <p class="mute small u-mt3">访客记录对房间的主人可见，也会作为邻居连线出现在地球上。只能参观的“查看者”不会留下记录。</p>` : ''}`,
    key ? `<button type="button" class="btn primary" id="ibGo">${S.view === 'room' && roomKey(S.room) === key ? '留在房间里' : '回到我的房间'}</button>` : `<button type="button" class="btn primary" id="ibPick">选址入住</button>`);
  $('#ibFace').appendChild(faceCanvas);
  pBody.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const r = residentOfKey(b.dataset.go); if (!r) return; if (S.view === 'globe') diveInto(r); else { closePanel(); toast('出门后在地球上找到它，或者从这里直接过去'); goRoomFromRoom(r); } }));
  if (key) bindReplies(pBody, key, renderInbox);
  bindColdStart(pBody);
  const go = $('#ibGo'); if (go) go.addEventListener('click', () => { const r = myResident(); closePanel(); if (r && !(S.view === 'room' && roomKey(S.room) === key)) { if (S.view === 'globe') diveInto(r); else goRoomFromRoom(r); } });
  const pk = $('#ibPick'); if (pk) pk.addEventListener('click', () => { closePanel(); if (S.view === 'room') exitToGlobe().then(() => $('#pickAddr').click()); else $('#pickAddr').click(); });
}
async function goRoomFromRoom(r) { await exitToGlobe(); S.via = 'room'; diveInto(r); }

/* ---------- hosted single-file works ---------- */
const WORK_MAX = 200 * 1024;
function workPrefix() {
  if (CLOUD.ready && S.room && S.room.id === 'mine' && CLOUD.isOwner) return 'site/room302/works/';
  if (CLOUD.ready && S.room && S.room.uid && S.room.uid === CLOUD.me.id) return `rooms/${CLOUD.me.id}/works/`;
  return 'local:';
}
async function saveWork(path, title, html) {
  if (path.startsWith('local:')) { store.set('gebi3.work.' + path.slice(6), html); return; }
  await cloudWrite(path, { title: String(title).slice(0, 30), html, bytes: html.length, updatedAt: Date.now() });
}
async function loadWork(path) {
  if (path.startsWith('local:')) return store.get('gebi3.work.' + path.slice(6), null);
  if (!CLOUD.ready || !WORK_RE.test(path)) return null;
  try { const s = await CLOUD.db.doc(path).get(); return s.exists ? String(s.data().html || '') : null; } catch (e) { return null; }
}
function kb(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'; }

/* ---------- share card ---------- */
let snapWait = null;
function requestSnapshot() { return new Promise(res => { snapWait = res; }); }
function takeSnapshotIfAsked() { if (!snapWait) return; const r = snapWait; snapWait = null; try { r(canvas.toDataURL('image/jpeg', .92)); } catch (e) { r(null); } }
function loadImg(src) { return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
async function composeCard(shot) {
  const W = 1080, H = 1440, c = mkCanvas(W, H), g = c.getContext('2d'), room = S.room, sky = S.dyn && S.dyn.sky;
  g.fillStyle = TK.bg; g.fillRect(0, 0, W, H);
  const img = await loadImg(shot);
  if (img) { const s = Math.max(W / img.width, 1080 / img.height), dw = img.width * s, dh = img.height * s; g.drawImage(img, (W - dw) / 2, (1080 - dh) / 2, dw, dh); }
  const gr = g.createLinearGradient(0, 640, 0, 1120); gr.addColorStop(0, 'rgba(12,14,19,0)'); gr.addColorStop(1, TK.bg); g.fillStyle = gr; g.fillRect(0, 640, W, 480);
  // 左上角标志：两栋房子，右边那间亮着灯
  g.fillStyle = 'rgba(12,14,19,.78)'; rr(g, 48, 48, 176, 68, 18); g.fill();
  g.save(); g.translate(66, 58); g.scale(1.5, 1.5); g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = TK.text1; g.beginPath(); g.moveTo(3.5, 27.5); g.lineTo(3.5, 14.2); g.lineTo(11, 7.8); g.lineTo(18.5, 14.2); g.lineTo(18.5, 27.5); g.closePath(); g.stroke();
  g.strokeStyle = TK.text2; g.beginPath(); g.moveTo(18.5, 27.5); g.lineTo(18.5, 15.6); g.lineTo(23.5, 11.3); g.lineTo(28.5, 15.6); g.lineTo(28.5, 27.5); g.closePath(); g.stroke();
  g.shadowColor = TK.accent; g.shadowBlur = 8; g.fillStyle = TK.accent; rr(g, 21.3, 18.6, 4.4, 5.2, 1); g.fill(); g.restore();
  g.fillStyle = TK.text1; g.font = `700 36px ${FONT.disp}`; g.textBaseline = 'middle'; g.fillText('隔壁', 126, 83);
  const bx = 64, by = 1060;
  drawPlate(g, bx, by, 206, 104, room.no, 2.2);
  g.fillStyle = TK.text1; g.font = `700 72px ${FONT.disp}`; g.textBaseline = 'middle'; g.fillText(wrapText(g, room.name, 740, 1)[0] || '', bx + 240, by + 46);
  g.fillStyle = TK.text2; g.font = `30px ${FONT.body}`;
  const pubOwner = room.owner !== '你' ? room.owner : room.uid ? String((CLOUD.rooms.get(room.uid) || {}).handle || '') : (CLOUD.ready ? (NAMES.get(CLOUD.me.id) || '房主') : '房主');
  g.fillText(`${room.city || ''} · 房主 ${pubOwner}${sky ? ` · 当地 ${sky.time} ${sky.label}` : ''}`, bx + 232, by + 112);
  const works = [];
  S.roomRoot && S.roomRoot.traverse(o => { const e = entryOf(o); if (e && !['door', 'view', 'music'].includes(e.kind) && e.title) works.push(e.title); });
  let x = bx, y = 1230; g.font = `30px ${FONT.body}`;
  [...new Set(works)].slice(0, 5).forEach(t => { const w = g.measureText(t).width + 44; if (x + w > W - 64) { x = bx; y += 66; } if (y > 1300) return; g.fillStyle = 'rgba(245,185,74,.13)'; rr(g, x, y - 26, w, 52, 14); g.fill(); g.fillStyle = TK.accentText; g.fillText(t, x + 22, y + 1); x += w + 14; });
  g.fillStyle = TK.line; g.fillRect(bx, 1350, W - bx * 2, 2);
  g.fillStyle = TK.text3; g.font = `26px ${FONT.body}`; g.fillText('隔壁 · 给写代码的人一间房', bx, 1396);
  g.font = `24px ${FONT.mono}`; g.textAlign = 'right'; g.fillText(room.lat != null ? fmtCity(room.lat, room.lon).replace(' · 城市级', '') : '', W - bx, 1396); g.textAlign = 'left';
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
function shareLink() { const k = roomKey(S.room); return SHARE_BASE + (k && /^[A-Za-z0-9._~-]+$/.test(k) ? '#room-' + k + '&from=share' : ''); }
async function openShare() {
  if (S.view !== 'room' || S.busy) return;
  closePanel(true); closeAllWins(); tip.hidden = true; bubble.hidden = true;
  const room0 = S.room, shot = await requestSnapshot();
  if (S.view !== 'room' || S.room !== room0) return;   // 生成卡片时已经离开了房间
  const blob = await composeCard(shot);
  if (S.view !== 'room' || S.room !== room0) return;
  if (!blob) { toast('卡片没生成成功，再试一次'); return; }
  const url = URL.createObjectURL(blob);
  S.panel = { kind: 'share', g: null };
  setPanel('分享 · 房间卡片', S.room.name, `
    <img class="share-img" src="${url}" alt="${esc(S.room.name)} 的分享卡片">
    <div class="field u-mt4"><label for="shareLink">房间链接</label><div class="share-link"><input class="input" id="shareLink" readonly value="${esc(shareLink())}"><button type="button" class="btn" id="copyLink">复制</button></div></div>
    ${shareAccessHTML()}
    <p class="mute small u-mt3">卡片尺寸 1080 × 1440，适合发小红书和朋友圈。链接打开后会直接飞进这间房，来访会记成“分享链接”。</p>`,
    `<button type="button" class="btn primary" id="saveCard">保存图片</button><span class="mute small" id="saveNote"></span>`);
  $('#copyLink').addEventListener('click', () => {
    const inp = $('#shareLink');
    const fallback = () => { inp.focus(); inp.select(); toast('已选中链接，按 Ctrl/⌘ + C 复制'); };
    try { navigator.clipboard.writeText(inp.value).then(() => toast('链接已复制'), fallback); } catch (e) { fallback(); }
  });
  $('#saveCard').addEventListener('click', async () => {
    const note = $('#saveNote');
    let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
    if (!dl) { note.textContent = '这里不能直接保存，右键或长按图片另存。'; return; }
    try { await dl.save({ filename: `隔壁-${S.room.no}-${S.room.name}.png`, data: blob }); note.textContent = '已保存'; }
    catch (e) { const c = e && e.code; note.textContent = c === 'declined' ? '' : c === 'rate_limited' ? '保存框已经打开了' : '这里不能直接保存，右键或长按图片另存。'; }
  });
}

/* ============================================================
   Overlays: room tooltip & hotspots, globe labels & HUD
   ============================================================ */
const tip = $('#tip'), hsWrap = $('#hotspots'), bubble = $('#bubble');
const _v = new THREE.Vector3();
function toScreen(v, cam) { _v.copy(v).project(cam || (S.view === 'globe' ? gcam : camera)); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, z: _v.z }; }
function refreshHotspots() {
  hsWrap.innerHTML = ''; S.hotspots = [];
  if (S.view !== 'room' || S.mode !== 'visit' || !S.roomRoot) { renderGuide(); return; }
  S.roomRoot.updateMatrixWorld(true);
  S.roomRoot.traverse(o => {
    if (!o.userData || !o.userData.iid || o.userData.iid === 'window') return;
    const e = entryOf(o); if (!e) return;
    const box = new THREE.Box3().setFromObject(o);
    const p = box.getCenter(new THREE.Vector3()); p.y = Math.min(box.max.y + .22, RH - .3);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hs';
    b.innerHTML = `<span>${esc(e.title || nameOf(o))}</span>`;
    b.setAttribute('aria-label', `走过去打开 ${e.title || nameOf(o)}`);
    b.addEventListener('click', () => activate(o));
    hsWrap.appendChild(b);
    S.hotspots.push({ el: b, pos: p, iid: o.userData.iid });
  });
  renderGuide();
}
function updateOverlays() {
  if (S.view === 'room') {
    const hidePanel = S.panel && isNarrow(), building = S.mode === 'build';
    for (const h of S.hotspots) {
      const s = toScreen(h.pos), behind = s.z > 1 || s.x < -40 || s.x > innerWidth + 40;
      const dist = camera.position.distanceTo(h.pos);
      const hideThis = behind || building || S.busy || (S.panel && S.panel.g && S.panel.g.userData.iid === h.iid) || (S.win && S.win.iid === h.iid) || hidePanel || (S.win && isNarrow());
      h.el.classList.toggle('live', WINS.has(h.iid));
      h.el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%) scale(${clamp(3.2 / dist, .55, 1.05).toFixed(3)})`;
      h.el.style.opacity = hideThis ? '0' : (S.panel ? '.45' : '1');
      h.el.style.pointerEvents = hideThis ? 'none' : 'auto';
    }
    if (!bubble.hidden && S.dyn && S.dyn.robot) {
      const p = new THREE.Vector3(); S.dyn.robot.head.getWorldPosition(p); p.y += 1.15;
      const s = toScreen(p), off = s.z > 1 || s.x < 60 || s.x > innerWidth - 60 || s.y < 60;
      bubble.style.left = s.x + 'px'; bubble.style.top = s.y + 'px'; bubble.style.opacity = off || S.busy ? '0' : '1'; bubble.style.pointerEvents = off ? 'none' : 'auto';
    }
  } else updateGlobeLabels();
}
function showTip(g, x, y) {
  const e = entryOf(g);
  let html = `<b>${esc(e ? (e.title || nameOf(g)) : nameOf(g))}</b>`;
  if (S.mode === 'build') html += `<span class="tag dim">${g.userData.def.wall ? '墙面' : g.userData.isChild ? '挂件' : '可拖动'}</span>` + (e ? `<span class="tag">${esc(KIND_LABEL[e.kind] || '入口')}</span>` : '');
  else if (e) html += `<span class="tag ${e.kind === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[e.kind] || '入口')}</span><span class="tip-k">点击走过去</span>`;
  else html += '<span class="tag dim">装饰</span>';
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = clamp(x + 16, 8, innerWidth - w - 8) + 'px'; tip.style.top = (y + 20) + 'px';
}
const glabels = $('#glabels'), ghud = $('#ghud');
function buildGlobeLabels() {
  glabels.innerHTML = '';
  G.pins.forEach(p => {
    const info = residentInfo(p.r);
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'gpin' + (info.mine ? ' me' : '') + (info.state === 'reno' ? ' reno' : '');
    b.style.setProperty('--c', residentColor(p.r));
    b.innerHTML = `<i></i><b>${esc(info.mine && !info.custom ? '你 · ' + info.no : info.handle)}</b><span>${esc(info.city || '')} · ${esc(info.name || '')}</span>`;
    b.addEventListener('click', () => { if (!S.busy) openResident(p.r); });
    b.addEventListener('pointerenter', () => { G.labelHover = p; });
    b.addEventListener('pointerleave', () => { if (G.labelHover === p) G.labelHover = null; });
    glabels.appendChild(b); p.label = b;
  });
}
const _cd = new THREE.Vector3(), _tp = new THREE.Vector3();
function updateGlobeLabels() {
  if (!G.ready) return;
  globeCamDir(_cd).normalize();
  const far = G.cam.dist > 5.2;
  for (const p of G.pins) {
    if (!p.label) continue;
    const facing = p.up.dot(_cd);
    _tp.copy(p.up).multiplyScalar(1 + p.h + .015);
    const s = toScreen(_tp, gcam), info = residentInfo(p.r);
    const show = facing > .22 && !S.busy && S.view === 'globe' && (!far || info.mine) && s.z < 1;
    p.label.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
    p.label.style.opacity = show ? String(clamp((facing - .22) * 4, 0, 1)) : '0';
    p.label.style.pointerEvents = show ? 'auto' : 'none';
    p.label.classList.toggle('hot', !!(G.labelHover === p || (G.hoverPin && G.hoverPin.r === p.r)));
  }
}

/* ============================================================
   Home (globe) interface
   ============================================================ */
const FEED_POOL = [
  ['204', '更新了「像素躲避球」v0.3'], ['303', '在黑板上回复了 @pixelmo'], ['101', '给「浇水提醒」加了下雨天模式'], ['102', '开张了，今晚第一杯免费'],
  ['202', '把极光数据接进了「会唱歌的天气」'], ['104', '给调度台加了雪天限速'], ['106', '录了一段新的浪花采样'], ['110', '冲洗了今晚的第一张极光'],
  ['105', '「早高峰」新增了换乘关卡'], ['108', '咖喱 Agent 学会了做素食版'], ['107', '鼓点编辑器支持导出 MIDI 了'], ['109', '开了一节免费的节奏课'], ['301', '「每日一句」换上了打字机音效']
];
const feedEl = $('#feedList');
let feedN = 0;
function pushFeed(item, ago) {
  const r = RESIDENTS.find(x => x.no === item[0]); if (!r) return;
  const info = residentInfo(r);
  const li = document.createElement('li');
  li.innerHTML = `<button type="button"><i style="--c:${residentColor(r)}"></i><span><b>${esc(info.handle)}</b> ${esc(item[1])}</span><small>${esc(info.city)} · ${esc(ago)}</small></button>`;
  li.querySelector('button').addEventListener('click', () => { if (!S.busy) openResident(r); });
  feedEl.prepend(li); while (feedEl.children.length > 5) feedEl.lastChild.remove();
  if (ago === '刚刚' && S.view === 'globe' && G.ready) ripple(latLonToVec(r.lat, r.lon));
}
function startFeed() {
  [['110', '42 分钟前'], ['202', '25 分钟前'], ['101', '11 分钟前'], ['303', '4 分钟前'], ['204', '1 分钟前']].forEach(([no, ago]) => pushFeed(FEED_POOL.find(f => f[0] === no), ago));
  setInterval(() => { if (document.hidden || S.view !== 'globe') return; feedN = (feedN + 1) % FEED_POOL.length; pushFeed(FEED_POOL[(feedN * 5) % FEED_POOL.length], '刚刚'); }, 7000);
}
function tickClock() {
  const s = sunInfo(), u = new Date();
  const hh = String(u.getUTCHours()).padStart(2, '0'), mm = String(u.getUTCMinutes()).padStart(2, '0');
  const me = localSky(ME.lat, ME.lon, tzFor(ME.lat, ME.lon));
  $('#gclock').innerHTML = `<i></i>实时昼夜 · UTC ${hh}:${mm} · ${esc(ME.city)} ${me.time}`;
  updateSun();
}
/* search */
const gsIn = $('#gsearchIn'), gsSugg = $('#gsugg');
// 繁体 / 日文汉字 → 简体，只覆盖城市名里常见的字
const HANZI = { 東: '东', 臺: '台', 灣: '湾', 爾: '尔', 蘭: '兰', 華: '华', 倫: '伦', 約: '约', 紐: '纽', 舊: '旧', 聖: '圣', 羅: '罗', 馬: '马', 漢: '汉', 溫: '温', 哥: '哥', 廣: '广', 門: '门', 島: '岛', 濱: '滨', 莊: '庄', 慶: '庆', 陽: '阳', 寧: '宁', 蘇: '苏', 鄭: '郑', 瀋: '沈', 嶺: '岭', 葉: '叶', 達: '达', 亞: '亚', 歐: '欧', 雪: '雪', 澳: '澳', 灘: '滩', 屋: '屋', 阪: '阪', 橫: '横', 横: '横', 濟: '济', 豐: '丰', 鹽: '盐', 長: '长', 開: '开', 雲: '云', 貝: '贝', 維: '维', 納: '纳', 薩: '萨', 斯: '斯', 黎: '黎', 遜: '逊', 頓: '顿', 賓: '宾', 圖: '图' };
const normQ = q => q.trim().toLowerCase().replace(/[\u3400-\u9fff]/g, c => HANZI[c] || c);
function searchMatches(q) {
  q = normQ(q); if (!q) return [];
  const res = [], seen = new Set();
  const addR = (r, sub) => { if (seen.has(r)) return; seen.add(r); const i = residentInfo(r); res.push({ type: 'r', r, label: `${i.handle} · ${i.name}`, sub: sub || `${i.city} · ${r.no}` }); };
  const cities = CITIES.filter(c => [c.zh, c.en, c.country].some(s => normQ(s).includes(q)));
  // 搜城市时先给出住在那里的人，再给出“在这里选址”
  cities.slice(0, 2).forEach(c => RESIDENTS.filter(r => r.city === c.zh).forEach(r => addR(r, `住在${c.zh} · ${r.no}`)));
  RESIDENTS.forEach(r => { const i = residentInfo(r); if ([i.handle, i.name, i.city, r.no].some(s => s && normQ(String(s)).includes(q))) addR(r); });
  cities.forEach(c => res.push({ type: 'c', c, label: c.zh, sub: `${c.country} · ${c.en} · 在这里选址` }));
  return res.slice(0, 8);
}
function renderSugg() {
  const m = searchMatches(gsIn.value);
  gsSugg.hidden = !m.length;
  gsSugg.innerHTML = m.map((x, i) => `<li><button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}"><b>${esc(x.label)}</b><span>${esc(x.sub)}</span>${x.type === 'r' ? '<em>住户</em>' : ''}</button></li>`).join('');
  gsSugg._m = m;
}
function chooseSugg(x) {
  if (!x) return; gsSugg.hidden = true; gsIn.value = ''; gsIn.blur();
  if (x.type === 'r') openResident(x.r, 'search'); else openAddress(x.c.lat, x.c.lon);
}
gsIn.addEventListener('input', renderSugg);
gsIn.addEventListener('focus', renderSugg);
gsIn.addEventListener('blur', () => setTimeout(() => { gsSugg.hidden = true; }, 150));
gsSugg.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); chooseSugg(gsSugg._m[+b.dataset.i]); } });
$('#gsearch').addEventListener('submit', e => { e.preventDefault(); const m = searchMatches(gsIn.value); if (m.length) chooseSugg(m[0]); else if (gsIn.value.trim()) toast('没找到这个城市，换个写法试试，比如“东京”或“Tokyo”'); });

/* resident card */
function nearestResidents(lat, lon, skipNo, n = 3) {
  return RESIDENTS.filter(r => r.no !== skipNo).map(r => ({ r, km: gcDist({ lat, lon }, r) })).sort((a, b) => a.km - b.km).slice(0, n);
}
function kmStr(km) { return km < 10 ? km.toFixed(1) + ' 公里' : km < 1000 ? Math.round(km) + ' 公里' : (km / 1000).toFixed(1) + ' 千公里'; }
function skyChip(sky) { return `<span class="sky sky-${sky.phase}"><i></i>当地 ${sky.time} · ${sky.label}</span>`; }
function openResident(r, via) {
  const info = residentInfo(r);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'resident', r, via: via || 'globe' }; G.hover = null;
  G.shiftGoal = isNarrow() ? 0 : -200;
  clearMarker();
  flyGlobe(r.lat, r.lon, isNarrow() ? 2.6 : 2.25, 1.5);
  ripple(latLonToVec(r.lat, r.lon));
  const sky = localSky(r.lat, r.lon, tzFor(r.lat, r.lon));
  const works = (info.works || []).map(w => `<li><span>${esc(w[0])}</span><span class="tag ${w[1] === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[w[1]] || '作品')}</span></li>`).join('');
  const near = nearestResidents(r.lat, r.lon, r.no).map(x => { const i = residentInfo(x.r); return `<li><button type="button" class="nb" data-no="${esc(x.r.no)}"><i style="--c:${residentColor(x.r)}"></i>${esc(i.handle)}<span>${esc(i.city)} · ${kmStr(x.km)}</span></button></li>`; }).join('');
  const st = rng(hash(r.no));
  setPanel(`${info.city} · ${info.no}`, info.name || '未命名房间', `
    <div class="unit-hero"><div class="plate-no">${esc(info.no)}</div><div><div class="u-strong">${esc(info.mine && !info.custom ? '你的房间' : info.handle)}</div><div class="mute small">${esc(info.tagline || '')}</div></div></div>
    <div class="chiprow">${skyChip(sky)}${(info.tags || []).map(t => `<span class="tag dim">${esc(t)}</span>`).join('')}${info.state === 'reno' ? '<span class="tag pink">装修中</span>' : ''}${info.demo ? '<span class="tag dim">演示住户</span>' : ''}</div>
    <p class="coord">${fmtCity(r.lat, r.lon)}</p>
    ${cardHTML(r)}
    ${works ? `<p class="section-t">房间里的作品</p><ul class="works">${works}</ul>` : ''}
    <div class="divider"></div>
    <p class="section-t">离得最近的邻居</p><ul class="nblist">${near}</ul>
    <div class="divider"></div>
    ${CLOUD.ready && keyOfResident(r) ? `<dl class="kv"><dt>来过的人</dt><dd>${roomVisitors(keyOfResident(r)).length} 位</dd><dt>留言</dt><dd>${roomMessages(keyOfResident(r)).filter(m => !m.reply).length} 条</dd></dl>` : `<dl class="kv"><dt>本周访客</dt><dd>${80 + Math.floor(st() * 900)} <span class="mute small">（演示数据）</span></dd><dt>点亮</dt><dd>${20 + Math.floor(st() * 400)}</dd></dl>`}`,
    info.state === 'reno' ? `<button type="button" class="btn" disabled>装修中，暂不开放</button>` :
      `<button type="button" class="btn primary" id="enterUnit">${info.mine ? '回到我的房间' : '敲门进去'}</button>${info.mine && !info.custom && (!CLOUD.ready || canPost()) ? '<button type="button" class="btn ghost" id="moveHome">搬家</button>' : ''}`);
  const b = $('#enterUnit'); if (b) b.addEventListener('click', () => { S.via = via || 'globe'; diveInto(r); });
  const mv = $('#moveHome'); if (mv) mv.addEventListener('click', startMove);
  bindCard(pBody);
  pBody.querySelectorAll('.nb').forEach(x => x.addEventListener('click', () => { const o = RESIDENTS.find(y => y.no === x.dataset.no); if (o) openResident(o); }));
}
function startMove() {
  closePanel(); G.moving = true;
  $('#gbanner').hidden = false; $('#gbanner').querySelector('span').textContent = '搬家中：点地球上任意一块陆地，把你的房间搬过去';
}
function stopMove() { G.moving = false; $('#gbanner').hidden = true; }
$('#gbannerX').addEventListener('click', () => { stopMove(); clearMarker(); });

/* address card: pick a spot, move in */
function newRoomNo(lat, lon) {
  let n = 100 + hash(lat.toFixed(2) + ',' + lon.toFixed(2)) % 880;
  while (RESIDENTS.some(r => r.no === String(n))) n++;
  return String(n);
}
function openAddress(lat, lon) {
  const water = isWater(lat, lon), place = describePlace(lat, lon, water);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'address', lat, lon }; G.hover = null; G.reticle.visible = false; ghud.hidden = true;
  G.shiftGoal = isNarrow() ? 0 : -200;
  dropMarker(lat, lon, water ? '#62e6ff' : '#ffb454'); ripple(latLonToVec(lat, lon));
  flyGlobe(lat, lon, isNarrow() ? 2.6 : 2.15, 1.3);
  const sky = localSky(lat, lon, tzFor(lat, lon));
  const near = nearestResidents(lat, lon, null, 2);
  const nearTxt = near.map(x => `${esc(residentInfo(x.r).handle)}（${kmStr(x.km)}）`).join('、');
  const head = `<p class="coord big">${fmtCity(lat, lon)}</p><div class="chiprow">${skyChip(sky)}<span class="tag dim">${esc(place.sub)}</span></div>${water ? '' : `<p class="privacy">为保护隐私，地址只公开到城市：房子会落在${esc(place.km < 320 ? place.city.zh : '这一带')}的一个随机位置，地图上不会出现你点的精确点。</p>`}`;
  if (water) {
    const c = place.city;
    setPanel('选址 · 海上', place.title, `${head}<p class="u-mb2">这里是海上，暂时盖不了房子。</p><p class="mute small u-m0">离这里最近的城市是${esc(c.zh)}，约 ${kmStr(place.km)}。</p>`,
      `<button type="button" class="btn primary" id="goCity">去${esc(c.zh)}看看</button>`);
    $('#goCity').addEventListener('click', () => openAddress(c.lat, c.lon));
    return;
  }
  if (G.moving) {
    setPanel('搬家 · 新地址', place.title, `${head}<p class="u-m0">把${CLOUD.ready && !CLOUD.isOwner ? '你的房间' : ' 302「零点电竞酒吧」'}搬到这里？房间里的布置和作品都会跟着走，窗外会换成这里的天色。</p><p class="mute small u-mt3">新邻居：${nearTxt}</p>`,
      `<button type="button" class="btn primary" id="doMove">搬到这里</button><button type="button" class="btn ghost" id="cancelMove">再看看</button>`);
    $('#doMove').addEventListener('click', () => doMove(lat, lon, place));
    $('#cancelMove').addEventListener('click', () => { closePanel(); });
    return;
  }
  if (CLOUD.ready) {
    const mine = myResident();
    if (!canPost()) {
      setPanel('选址 · 陆地', place.title, `${head}<p class="u-m0">你现在是参观者，可以逛地球、进房间看作品。入住和留言需要房主在页面的分享菜单里把你设为“参与者”。</p>`, `<button type="button" class="btn" id="goNear">去最近的邻居家看看</button>`);
      $('#goNear').addEventListener('click', () => near[0] && openResident(near[0].r)); return;
    }
    if (mine) {
      const mi = residentInfo(mine);
      setPanel('选址 · 陆地', place.title, `${head}<p class="u-m0">你在${esc(mi.city)}已经有一间「${esc(mi.name)}」了。每人一间房，可以把它搬到这里。</p>`,
        `<button type="button" class="btn primary" id="mvHere">搬到这里</button><button type="button" class="btn ghost" id="goMineHere">回我的房间</button>`);
      $('#mvHere').addEventListener('click', () => doMove(lat, lon, place));
      $('#goMineHere').addEventListener('click', () => diveInto(mine)); return;
    }
  }
  let tpl = 'pixel';
  setPanel('选址 · 陆地', place.title, `${head}
    <p class="mute small u-mb4">附近的住户：${nearTxt}。填三样东西，房间会按模板摆好，每个作品一块展示屏。</p>
    <form id="applyForm">
      <div class="field"><label for="apHandle">门牌名</label><input class="input" id="apHandle" maxlength="16" value="newdev" autocomplete="off"><span class="err" id="apErr" hidden></span></div>
      <div class="field"><label for="apName">房间名</label><input class="input" id="apName" maxlength="12" value="周末作坊"></div>
      <div class="field"><label>房间模板</label><div class="tpl-grid" id="tplGrid">${TEMPLATES.map(t => `<button type="button" class="tpl" data-t="${t.id}" aria-pressed="${t.id === tpl}"><i style="background:linear-gradient(120deg,${t.sw[0]} 55%,${t.sw[1]})"></i><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div></div>
      <div class="field"><label for="apWorks">先给作品占个位（每行一个名字，最多 4 个）</label><textarea class="input" id="apWorks" rows="3" placeholder="番茄钟小工具&#10;像素画板"></textarea><span class="hint-s">每个名字会变成一块展示屏。入住后在“待上传”清单里点它，上传 .html 或填地址就能打开。没想好可以留空。</span></div>
      <div class="field"><label for="apBio">一句话介绍自己（选填）</label><input class="input" id="apBio" maxlength="60" placeholder="比如：用 AI 写小工具的前端，在找远程合作" autocomplete="off"></div>
      ${pocketList().length ? `<label class="check"><input type="checkbox" id="apPocket" checked><span>把口袋里的 ${pocketList().length} 件收藏一起摆进房间</span></label>` : ''}
    </form>`, `<button type="submit" form="applyForm" class="btn primary">在这里入住</button><span class="mute small">${CLOUD.ready ? '保存到隔壁社区，参与者都能看到' : '原型中保存在本机'}</span>`);
  $('#tplGrid').addEventListener('click', e => { const b = e.target.closest('.tpl'); if (!b) return; tpl = b.dataset.t; $('#tplGrid').querySelectorAll('.tpl').forEach(x => x.setAttribute('aria-pressed', x.dataset.t === tpl)); });
  $('#applyForm').addEventListener('submit', e => {
    e.preventDefault();
    const handle = $('#apHandle').value.trim().replace(/^@/, ''), err = $('#apErr');
    if (!/^[a-zA-Z0-9_-]{2,16}$/.test(handle)) { err.textContent = '门牌名用 2 到 16 个英文字母、数字、下划线或短横线。'; err.hidden = false; return; }
    err.hidden = true;
    const works = $('#apWorks').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
    const base = tpl === 'empty' ? { theme: { wall: '#2a2238', trim: '#3c2f58', floor: 'wood', floorTint: '#5a4030', neonColor: '#ffb454' }, items: [] } : clone(ROOM_PRESETS[tpl]);
    const items = base.items.filter(i => !i.entry || i.entry.kind === 'door').filter(i => i.type !== 'neon' && i.type !== 'door');
    const slots = [[.2, -1.2, 0], [2.4, -.3, -.45], [-1.5, -1.5, .35], [3.2, .9, -.7]];
    works.forEach((w, i) => { const [x, z, ry] = slots[i]; items.push({ uid: 'w' + i + Date.now().toString(36), type: 'kiosk', x, z, ry, entry: { kind: 'web', title: w, desc: '', url: '' } }); });
    items.push({ uid: 'neon', type: 'neon', wall: 'back', u: -.8, y: 3.6 }, DOOR(tpl === 'leaf' ? -2.6 : 0));
    items.push({ uid: 'chalkboard', type: 'chalkboard', wall: 'back', u: 2.6, y: 1.85, entry: { kind: 'guestbook', title: '留言黑板', desc: '' } });
    const bio = ($('#apBio').value || '').trim().slice(0, 60), fromPocket = $('#apPocket') && $('#apPocket').checked ? pocketList() : [];
    fromPocket.forEach(p => { const sp = freeSpot(items); items.push({ uid: 'k' + Math.random().toString(36).slice(2, 8), type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: p.e }); });
    const no = newRoomNo(lat, lon), name = $('#apName').value.trim().slice(0, 12) || '新房间';
    const theme = Object.assign({}, base.theme, { neon: handle.toUpperCase() });
    const btn = pFoot.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    if (CLOUD.ready) {
      const uid = CLOUD.me.id, sn = snapToCity(lat, lon, uid);
      const doc = { v: 1, no, handle: '@' + handle, name, tpl, theme, items, lat: sn.lat, lon: sn.lon, city: sn.city, createdAt: Date.now(), updatedAt: Date.now() };
      if (bio) doc.card = { bio };
      if (fromPocket.length) pocketClear();
      CLOUD.landing = uid; CLOUD.rooms.set(uid, doc); syncRealResidents();
      const r = RESIDENTS.find(x => x.real && x.key === uid);
      closePanel(true); clearMarker(); document.body.classList.add('leaving'); syncChrome();
      cloudWrite(`rooms/${uid}`, doc).catch(() => {});
      landPin(r).then(() => { CLOUD.landing = null; syncRealResidents(); return sleep(500); }).then(() => diveInto(r, { build: true, pickPending: true, msg: works.length ? `欢迎入住 ${sn.city} · ${no}！下面“待上传”里是你的 ${works.length} 件作品，点一件开始上传` : `欢迎入住 ${sn.city} · ${no}！从物件库挑一件，绑定你的第一个作品` }));
      return;
    }
    const sn = snapToCity(lat, lon, no), city = sn.city;
    const room = { id: 'custom-' + no, no, name, owner: '@' + handle, mine: true, lat: sn.lat, lon: sn.lon, city, theme, items };
    CUSTOM[no] = room; store.set('gebi3.custom', CUSTOM);
    const r = { no, custom: true, handle: '@' + handle, name, city, lat: sn.lat, lon: sn.lon, tagline: '刚入住的新邻居', tags: ['新入住'], friends: near.map(x => x.r.no).slice(0, 1) };
    RESIDENTS.push(r);
    closePanel(true); clearMarker(); document.body.classList.add('leaving'); syncChrome();
    if (fromPocket.length) pocketClear();
    landPin(r).then(() => { pushFeed([no, `在${city}入住了「${name}」`], '刚刚'); return sleep(500); }).then(() => diveInto(r, { build: true, pickPending: true, msg: works.length ? `欢迎入住 ${city} · ${no}！下面“待上传”里是你的 ${works.length} 件作品，点一件开始上传` : `欢迎入住 ${city} · ${no}！从物件库挑一件，绑定你的第一个作品` }));
  });
}
async function landPin(r) {
  const pin = addPin(r, true); buildArcs(); buildGlobeLabels();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.4, 10, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { a: { value: 1 } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform float a; varying float vY; void main(){ gl_FragColor = vec4(vec3(1., .78, .45) * 2.4, (1. - vY) * a); }' }));
  beam.geometry.translate(0, .7, 0);
  pin.g.add(beam); beam.scale.y = 0;
  ripple(pin.up);
  await tween(.7, t => { beam.scale.y = 1 - t * .0; beam.position.y = (1 - t) * 1.2; beam.material.uniforms.a.value = 1; }, ease.out);
  await tween(.9, t => { pin.beamMat.uniforms.grow.value = t; beam.material.uniforms.a.value = 1 - t; }, ease.out);
  pin.g.remove(beam);
}
async function doMove(lat, lon, place) {
  stopMove(); closePanel(true); clearMarker();
  if (CLOUD.ready && !CLOUD.isOwner) {
    const uid = CLOUD.me.id, d = clone(CLOUD.rooms.get(uid) || {}); if (!d.no) return;
    const sn = snapToCity(lat, lon, uid + Date.now());
    Object.assign(d, { lat: sn.lat, lon: sn.lon, city: sn.city, updatedAt: Date.now() });
    CLOUD.rooms.set(uid, d); CLOUD.landing = uid; syncRealResidents();
    const me = RESIDENTS.find(r => r.real && r.key === uid);
    cloudWrite(`rooms/${uid}`, d);
    await landPin(me); CLOUD.landing = null; syncRealResidents();
    toast(`搬到了${sn.city}，窗外的天色也换了`); openResident(me); return;
  }
  const me = RESIDENTS.find(r => r.no === '302'), sn = snapToCity(lat, lon, 'move' + Date.now()), city = sn.city;
  Object.assign(ME, { lat: sn.lat, lon: sn.lon, city }); store.set('gebi3.me', ME);
  Object.assign(me, { lat: sn.lat, lon: sn.lon, city });
  if (CLOUD.ready && CLOUD.isOwner) writeSite({ lat: sn.lat, lon: sn.lon, city });
  const old = pinOf('302'); if (old) { G.pinRoot.remove(old.g); G.pins.splice(G.pins.indexOf(old), 1); }
  await landPin(me);
  toast(`302 搬到了${city}，窗外的天色也换了`);
  tickClock(); syncChrome();
  openResident(me);
}

/* ============================================================
   Transitions: dive into a room, step back out to the planet
   ============================================================ */
function setChromeView(v) { document.body.dataset.view = v; }
async function diveInto(r, opts = {}) {
  if (S.busy) return; S.busy = true;
  closePanel(true); stopMove(); clearMarker(); G.hover = null; G.reticle.visible = false; ghud.hidden = true;
  document.body.classList.add('leaving');
  G.shiftGoal = 0;
  await flyGlobe(r.lat, r.lon, 1.95, 1.1);
  ripple(latLonToVec(r.lat, r.lon));
  await tween(1.15, t => { G.cam.dist = 1.95 - .93 * t; setWarp(t * .95); setFade(clamp((t - .62) / .38, 0, 1), '#07060b'); }, ease.in);
  const room = roomForResident(r);
  S.resident = r;
  await arriveInRoom(room, opts);
}
async function arriveInRoom(room, opts = {}) {
  S.view = 'room'; S.mode = 'visit'; S.room = room; S.hover = null; S.selected = null; S.focus = null;
  setChromeView('room'); document.body.classList.remove('leaving');
  usePostFor('room');
  CAM.mode = 'fp'; camera.fov = 66; camera.updateProjectionMatrix();
  buildRoom(room);
  const d = doorDef(), u = d ? d.u : -1;
  FP.pos.set(u, 0, 5.6); FP.yaw = FP.yawGoal = 0; FP.pitch = FP.pitchGoal = -.03; FP.vel.set(0, 0, 0);
  if (S.dyn.door) S.dyn.door.goal = 1;
  fpUpdate(0);
  syncChrome(); refreshHotspots();
  setWarp(0);
  tween(.9, t => setFade(1 - t), ease.out);
  await fpGo(new THREE.Vector3(u, 0, 2.75), 0, -.06, 1.9);
  if (S.dyn.door) S.dyn.door.goal = 0;
  S.busy = false;
  const rk = roomKey(room);
  if (rk) { recordVisit(rk, null, S.via || 'globe'); if (iOwnRoom(rk)) { const u = myUpdates(); if (u.count && !opts.msg) setTimeout(() => toast(updatesSentence(u) + ' 点右上角“动态”查看', 5200), 1200); } }
  S.via = null;
  if (opts.build) setMode('build').then(() => { if (opts.pickPending) { const p = pendingWorks()[0]; if (p) setTimeout(() => selectItem(p), 300); } });
  if (opts.msg) toast(opts.msg, 4600);
  showControlsHint();
  if (room.agent && !opts.build) setTimeout(() => { if (S.view === 'room' && S.mode === 'visit' && !S.panel && !S.busy) bubble.hidden = false; }, 900);
}
async function exitToGlobe() {
  if (S.busy || S.view !== 'room') return; S.busy = true;
  tip.hidden = true; bubble.hidden = true; closePanel(true); closeAllWins();
  if (FP.locked && document.exitPointerLock) document.exitPointerLock();
  if (S.mode === 'build') { S.mode = 'visit'; await exitBuildCam(); S.grid.visible = false; syncChrome(); }
  if (music.on) toggleMusic();
  const d = doorDef(), u = d ? d.u : -1;
  await fpGo(new THREE.Vector3(u, 0, 2.9), Math.PI, 0, 1.0);
  if (S.dyn.door) S.dyn.door.goal = 1;
  await sleep(380);
  const walk = fpGo(new THREE.Vector3(u, 0, 5.9), Math.PI, .02, 1.35);
  await tween(1.25, t => { setFade(clamp((t - .35) / .65, 0, 1), '#07060b'); setWarp(t * .35); }, ease.in);
  await walk;
  const r = S.resident || RESIDENTS[0];
  S.view = 'globe'; setChromeView('globe'); usePostFor('globe');
  if (S.roomRoot) { scene.remove(S.roomRoot); S.roomRoot = null; }
  S.room = null; S.hotspots = []; hsWrap.innerHTML = ''; renderGuide();
  G.flyId = (G.flyId || 0) + 1;
  G.cam.lat = r.lat; G.cam.lon = r.lon; G.cam.dist = 1.04; G.vel.lat = G.vel.lon = 0; G.shiftGoal = G.shift = homeShift();
  syncChrome();
  setWarp(.55);
  tween(.8, t => setFade(1 - t), ease.out);
  await tween(2.2, t => { G.cam.dist = 1.04 + (HOME_DIST - 1.04) * t; setWarp(.55 * (1 - t)); }, ease.outQuint);
  setWarp(0);
  S.busy = false; G.idle = 0;
}
const goStreet = exitToGlobe;
function homeShift() { return isNarrow() ? 0 : innerWidth * .15; }
const HOME_DIST = isNarrow() ? 6.4 : 4.3;

/* room helpers shown in the HUD */
const guideEl = $('#guide');
function renderGuide() {
  if (S.view !== 'room' || S.mode !== 'visit' || !S.roomRoot) { guideEl.hidden = true; return; }
  const items = [];
  S.roomRoot.traverse(o => { if (o.userData && o.userData.iid && entryOf(o) && o.userData.iid !== 'window') items.push(o); });
  const order = { agent: 0, shiguang: 1, game: 2, guestbook: 3, music: 4, door: 9 };
  items.sort((a, b) => (order[entryOf(a).kind] ?? 5) - (order[entryOf(b).kind] ?? 5));
  const win = findGroup('window');
  guideEl.innerHTML = `<span class="g-lbl">导览</span>` + items.map(o => `<button type="button" data-iid="${esc(o.userData.iid)}">${esc(entryOf(o).kind === 'door' ? '出门' : entryOf(o).title || nameOf(o))}</button>`).join('') + (win ? `<button type="button" data-iid="window">窗外</button>` : '');
  guideEl.hidden = false;
}
guideEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || S.busy) return; const g = findGroup(b.dataset.iid); if (g) activate(g); });
function lookOutside(g) {
  walkTo(g, { panel: false }).then(() => {
    const s = S.dyn.sky || localSky(31.2, 121.5, 8);
    toast(`窗外是${S.room.city || '这座城市'} · 当地 ${s.time} · ${s.label}${s.phase === 'night' ? '，楼里还亮着不少灯' : s.phase === 'golden' ? '，太阳快落到楼后面了' : ''}`, 4200);
  });
}
let hintT = 0;
function showControlsHint() {
  const h = $('#ctlHint'); h.hidden = false; h.classList.add('show');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), 7000);
}

/* ============================================================
   Panels
   ============================================================ */
const panel = $('#panel'), pEyebrow = $('#pEyebrow'), pTitle = $('#pTitle'), pBody = $('#pBody'), pFoot = $('#pFoot');
const ICON = {
  ext: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: d => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${{ up: 'M10 5l-5 6h10z', down: 'M10 15l-5-6h10z', left: 'M5 10l6-5v10z', right: 'M15 10l-6-5v10z' }[d]}" fill="currentColor"/></svg>`,
  rot: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
};
function setPanel(eyebrow, title, body, foot) {
  pEyebrow.textContent = eyebrow; pTitle.textContent = title; pBody.innerHTML = body; pFoot.innerHTML = foot || '';
  pBody.scrollTop = 0;
  panel.classList.remove('off');
}
function closePanel(silent) {
  if (!S.panel) return;
  const was = S.panel; S.panel = null; S.focus = null;
  panel.classList.add('off');
  if (was.kind === 'game') { if (game.mode !== 'attract') { game.mode = 'attract'; gReset(); } $('#gameHolder').appendChild(game.c); }
  if (was.kind === 'agent') { $('#gameHolder').appendChild(faceCanvas); }
  if (was.kind === 'inspect') { S.selected = null; if (S.selRing) S.selRing.visible = false; }
  if (S.view === 'globe' && !silent) { G.shiftGoal = homeShift(); if (was.kind === 'address') clearMarker(); }
}
function entryFooter(e, g) {
  const bound = validUrl(e.url);
  const canBind = S.room && S.room.mine;
  let html = bound ? `<a class="btn ${e.open === 'tab' ? 'primary' : ''}" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">新标签页打开 ${ICON.ext}</a>` : '';
  if (!bound && canBind) html += `<button type="button" class="btn" data-act="bind">去绑定地址</button>`;
  return html + curateHTML(e);
}
function bindFooter(g) {
  pFoot.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  const e = entryOf(g);
  pFoot.querySelectorAll('[data-act="collect"]').forEach(b => b.addEventListener('click', () => collectEntry(e)));
  pFoot.querySelectorAll('[data-act="adapt"]').forEach(b => b.addEventListener('click', () => adaptEntry(e)));
  pFoot.querySelectorAll('[data-act="author"]').forEach(b => b.addEventListener('click', () => goOrigin(e)));
}
function activate(g) {
  const e = entryOf(g); if (!e) return;
  if (!['door', 'view'].includes(e.kind) && S.room) recordVisit(roomKey(S.room), e.title || nameOf(g));
  bubble.hidden = true;
  switch (e.kind) {
    case 'agent': openAgent(g); break;
    case 'shiguang': if (canEmbed(e)) openWindow(g); else openShiguang(g); break;
    case 'game': if (canEmbed(e)) openWindow(g); else openGame(g); break;
    case 'guestbook': openGuestbook(g); break;
    case 'music': walkTo(g, { panel: false }); toggleMusic(); break;
    case 'door': exitToGlobe(); break;
    case 'view': lookOutside(g); break;
    default: if (canEmbed(e)) openWindow(g); else openEntry(g);
  }
}
function beginPanel(kind, g) { if (S.win) minimizeWin(S.win, true); if (S.panel) closePanel(true); S.panel = { kind, g }; S.focus = g; if (g) focusOn(g, { loose: kind === 'agent' }); }

/* ---------- Agent ---------- */
const TARGETS = { shiguang_note: 'pegboard:note', game_console: 'desk:console', guestbook: 'chalkboard', vinyl: 'bar:vinyl', door: 'door', pegboard: 'pegboard', desk: 'desk', bar: 'bar', robot: 'robot' };
function agentRules() {
  const done = SG.tasks.filter(t => t.done).length;
  return `你是“Bit”，一台站在吧台后面的酒保机器人，也是房主在「隔壁」社区里的 AI 助手。「隔壁」是一个让写代码的人把自己的网页作品摆进一间可以走进去的 3D 房间的社区：每个人在地球上选一个真实地址入住，家具就是作品入口，访客从地球上飞过来串门。
你所在的房间：${ME.city} · 302「零点电竞酒吧」，电竞房加小酒吧的风格，右边有一扇窗，窗外就是${ME.city}的街景。你称呼房主为“老板”，现在和你说话的是来串门的访客。
房间里的作品入口（编号 → 内容）：
- shiguang_note：左墙洞洞板上的电子便签，就是老板做的「拾光」。拾光是待办与便签 App，有网页版、Windows 桌面版和 Chrome/Edge 扩展；界面有三套设计语言“轻”“扭蛋”“键”，所有控件都不用浏览器原生样式，桌面版自绘标题栏和托盘菜单。老板今天的待办完成了 ${done}/${SG.tasks.length}。
- game_console：电竞桌上的游戏机，里面是老板写的网页小游戏《霓虹贪吃蛇》，屏幕会自动演示，点开就能玩。
- guestbook：后墙的黑板留言板。
- vinyl：吧台上的唱片机，能放 lo-fi。
- door：门，出去就回到地球，东京的 @pixelmo、柏林的 @byte、成都的 @leafcode 都是邻居。
你的角色是“接待与转达”，不是陪聊：先用一两句话接住访客，带他看感兴趣的作品；只要访客提到想联系老板、合作、提问或见面，就主动用工具帮忙转达，而不是自己替老板回答。
你可以调用工具：focus_object 移动镜头指路，open_entry 打开作品，set_mood 切换灯光，toggle_music 开关音乐，leave_message 把访客的原话贴到黑板，request_appointment 替访客向老板约一个时间，nudge_owner 提醒老板回复访客上一条还没回复的留言（6 小时内只能催一次），owner_pending 仅在对面是老板本人时查看还没回复的留言。
你不替老板社交：不替老板回复，不替老板答应任何事，也不说老板“一定会”怎样。聊了三句还没落到具体事情上，就礼貌地问一句要不要帮他留言或约时间。
回答规则：用中文，口语、俏皮但不油腻，每次 1 到 3 句、不超过 80 个字；只介绍房间里真实存在的东西，不编造作品、数据或链接；不清楚的就说会转告老板。`;
}
function agentTools() {
  const ids = Object.keys(TARGETS);
  return [
    { name: 'focus_object', description: '把访客的镜头移到房间里的某个物件并高亮，用来指路。返回执行结果。', inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ids } }, required: ['target'] }, execute: (i) => { if (!agentFocus(String(i.target))) throw new Error('房间里没有这个物件'); return '镜头已移到 ' + i.target; } },
    { name: 'open_entry', description: '为访客打开一个作品入口：拾光、游戏机或留言黑板。拾光和游戏会以站内窗口运行作品原站，聊天面板会收起，访客点机器人可以回来。', inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ['shiguang_note', 'game_console', 'guestbook'] } }, required: ['target'] }, execute: (i) => { const g = findGroup(TARGETS[String(i.target)]); if (!g) throw new Error('找不到这个入口'); setTimeout(() => activate(g), 500); return '已打开 ' + i.target; } },
    { name: 'set_mood', description: '切换房间灯光氛围：chill 是微醺暖光，party 是派对彩光，focus 是专注冷光。', inputSchema: { type: 'object', properties: { mood: { type: 'string', enum: ['chill', 'party', 'focus'] } }, required: ['mood'] }, execute: (i) => { setMood(String(i.mood)); return '灯光已切换为 ' + i.mood; } },
    { name: 'toggle_music', description: '打开或关闭吧台唱片机的 lo-fi 音乐。', inputSchema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] }, execute: (i) => { const on = i.on === true || i.on === 'true'; if (on !== music.on) toggleMusic(); return on ? '音乐已打开' : '音乐已关闭'; } },
    { name: 'leave_message', description: '访客明确要求给老板留言或转告老板时，把访客的原话贴到后墙黑板上。返回是否成功。不要替访客编写内容。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '访客要留给老板的原话，最多 120 字' } }, required: ['text'] }, execute: async (i) => { if (!CLOUD.ready) throw new Error('留言板现在离线，只能请访客点后墙的黑板留言'); if (iOwnRoom('302')) throw new Error('现在和你说话的就是老板本人'); const t = String(i.text || '').trim().slice(0, 120); if (!t) throw new Error('留言内容是空的'); const ok = await postMessage('302', t); if (!ok) throw new Error('访客目前只能参观，不能留言'); recordVisit('302', '留言'); return '已贴到黑板上，老板回复后访客会在“动态”里看到'; } },
    { name: 'request_appointment', description: '访客想约老板聊一聊时，替访客向老板预约。when 是访客说的时间，note 是事由原话。会在黑板上留一条带“预约”标记的留言。', inputSchema: { type: 'object', properties: { when: { type: 'string', description: '访客期望的时间，比如“今晚”“这周内”' }, note: { type: 'string', description: '事由，最多 100 字' } }, required: ['when', 'note'] }, execute: async (i) => { if (iOwnRoom(roomKey(S.room))) throw new Error('现在和你说话的就是老板本人'); const t = String(i.note || '').trim().slice(0, 100), w = String(i.when || '时间待定').trim().slice(0, 20); if (!t) throw new Error('事由是空的'); const ok = await relaySend('appt', t, w); if (!ok) throw new Error('访客目前只能参观，没法预约'); relayLog(`已替访客向老板预约「${w}」`); renderRelay(); return '已预约，老板回复后访客会在“动态”里看到'; } },
    { name: 'nudge_owner', description: '提醒老板回复访客上一条还没回复的留言。6 小时内只能催一次。', inputSchema: { type: 'object', properties: {} }, execute: async () => { const r = await relayNudge(); if (r === 'ok') { relayLog('已提醒老板回复'); renderRelay(); return '已提醒老板'; } throw new Error({ cool: '刚催过了，过几个小时再说', none: '访客没有等回复的留言', readonly: '访客目前只能参观', offline: '离线演示里没法催', fail: '没催成功' }[r] || '催不了'); } },
    { name: 'owner_pending', description: '仅当和你说话的是老板本人时，查看还没回复的访客留言。', inputSchema: { type: 'object', properties: {} }, execute: () => { const k = roomKey(S.room); if (!iOwnRoom(k)) throw new Error('只有老板本人可以看'); const l = pendingFor(k); return l.length ? l.slice(-6).map(m => `${nameOfUid(m.author)}：${m.text}${m.kind === 'appt' ? '（预约 ' + m.when + '）' : ''}${m.nudge ? '（催过）' : ''}`).join('；') : '没有等回复的留言'; } }
  ];
}
function agentFocus(target) {
  const iid = TARGETS[target] || target; const g = findGroup(iid); if (!g) return false;
  S.focus = g; focusOn(g, { panel: true });
  logAct('镜头移到「' + (entryOf(g) ? entryOf(g).title : nameOf(g)) + '」');
  return true;
}
function logAct(text) {
  const m = { role: 'act', text }; const i = S.chat.log.length - 1;
  if (i >= 0 && S.chat.log[i].role === 'bit' && !S.chat.log[i].text) S.chat.log.splice(i, 0, m); else S.chat.log.push(m);
  renderChat();
}
function openAgent(g) {
  beginPanel('agent', g);
  const live = !!S.sample;
  setPanel('AI 助手 · 房主配置', '酒保 Bit',
    `<div class="bit-head"><div class="bit-face" id="bitFace"></div><div><div class="bit-name">Bit · 零点酒吧当班</div><div class="bit-status ${live ? 'live' : ''}" id="bitStatus"><i></i><span>${live ? '由 Claude 驱动 · 能操作这个房间' : '离线演示 · 内置台词'}</span></div></div></div>
     <div class="chat" id="chatLog"></div>
     <div class="relay" id="relay"></div>
     <div class="chips" id="chips">${['带我看看拾光', '你的游戏好玩吗？', '来点派对气氛', '放点音乐', '隔壁是什么地方？'].map(t => `<button type="button">${t}</button>`).join('')}</div>`,
    `<form class="composer" id="composer"><input class="input" id="chatInput" autocomplete="off" maxlength="200" placeholder="和 Bit 说点什么…"><button class="btn primary" id="chatSend" type="submit">发送</button></form>`);
  $('#bitFace').appendChild(faceCanvas);
  if (!S.chat.log.length) {
    S.chat.log.push({ role: 'bit', text: iOwnRoom(roomKey(S.room)) ? ownerGreeting(roomKey(S.room)) : '欢迎光临零点酒吧！我是 Bit，负责接待和转达：想看老板的作品我带你去，想对老板说什么、想约个时间，我帮你转达。' });
  }
  renderChat();
  $('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) agentSend(b.textContent); });
  $('#composer').addEventListener('submit', e => { e.preventDefault(); if (S.chat.busy) { if (S.chat.ctl) S.chat.ctl.abort(); return; } const i = $('#chatInput'); const v = i.value; i.value = ''; agentSend(v); });
  setBusy(S.chat.busy);
  S.relayMode = null; renderRelay();
  if (!isNarrow()) setTimeout(() => { const i = $('#chatInput'); if (i && !S.relayMode) i.focus({ preventScroll: true }); }, 380);
}
function renderChat() {
  const log = $('#chatLog'); if (!log) return;
  log.innerHTML = '';
  for (const m of S.chat.log) { const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'me' : m.role === 'act' ? 'act' : 'bit') + (m.typing ? ' typing' : ''); d.textContent = m.text || (m.role === 'bit' ? '…' : ''); m.el = d; log.appendChild(d); }
  pBody.scrollTop = pBody.scrollHeight;
}
function setBusy(b) {
  S.chat.busy = b; const s = $('#chatSend'); if (!s) return;
  s.textContent = b ? (S.chat.ctl ? '停止' : '…') : '发送';
  s.classList.toggle('primary', !b);
}
function updateMsg(m) { if (m.el && m.el.isConnected) { m.el.textContent = m.text || '…'; m.el.classList.toggle('typing', !!m.typing); pBody.scrollTop = pBody.scrollHeight; } }
async function agentSend(text) {
  text = String(text || '').trim(); if (!text || S.chat.busy) return;
  S.chat.log.push({ role: 'user', text });
  const reply = { role: 'bit', text: '', typing: true }; S.chat.log.push(reply);
  renderChat(); robotMood('think'); S.chat.ctl = null; setBusy(true);
  if (S.sample) {
    S.chat.turns.push({ role: 'user', content: text });
    const ctl = new AbortController(); S.chat.ctl = ctl; setBusy(true);
    const opts = { modelTier: 'quick', signal: ctl.signal, onText: ({ text: t }) => { reply.text = t; updateMsg(reply); robotMood('talk'); } };
    if (S.sampleTools) opts.tools = agentTools(); else opts.cache = false;
    try {
      const res = await S.sample([{ role: 'user', content: agentRules() }].concat(S.chat.turns.slice(-10)), opts);
      reply.text = res.text; S.chat.turns.push({ role: 'assistant', content: res.text });
    } catch (e) {
      const code = e && e.code;
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable', 'session_expired'].includes(code)) {
        if (code === 'tools_unavailable') S.sampleTools = false; else S.sample = null;
        S.chat.turns.pop(); updateAgentStatus();
        reply.text = ''; await fallbackReply(text, reply);
      } else if (code === 'cancelled') { reply.text = e.text || '好的，先不说了。'; S.chat.turns.push({ role: 'assistant', content: reply.text }); }
      else if (code === 'rate_limited') reply.text = e.text || '今晚点单的人有点多，过一会儿再来找我聊吧。';
      else if (code === 'refused') reply.text = '这个我不方便聊，换个话题？比如看看老板的作品。';
      else reply.text = (e && e.text) ? e.text + '（信号断了一下）' : '信号断了一下，再说一次？';
    }
  } else {
    await fallbackReply(text, reply);
  }
  reply.typing = false; updateMsg(reply); S.chat.ctl = null; setBusy(false);
  if (!S.relayMode && !iOwnRoom(relayKey()) && S.chat.log.filter(m => m.role === 'user').length === 3 && !S.chat.log.some(m => m.role === 'act' && /已转达|已替访客/.test(m.text))) openRelay('msg');
  robotMood('happy'); setTimeout(() => { if (robotState.mood === 'happy') robotMood('idle'); }, 1600);
}
function scriptReply(t) {
  const has = (re) => re.test(t);
  if (has(/拾光|便签|待办|todo|清单/i)) return { act: () => agentFocus('shiguang_note'), text: `那块洞洞板上的电子便签就是拾光～老板今天完成了 ${SG.tasks.filter(x => x.done).length}/${SG.tasks.length} 条。点它能直接用，还能换“轻 / 扭蛋 / 键”三套皮肤。` };
  if (has(/游戏|玩|贪吃蛇|game/i)) return { act: () => agentFocus('game_console'), text: '桌上那台红色游戏机！老板写的霓虹贪吃蛇，屏幕上一直在自动演示，点开就能接手。' };
  if (has(/派对|party|嗨|蹦迪|彩/i)) return { act: () => setMood('party'), text: '收到，派对模式启动！灯带已经开始转了。' };
  if (has(/专注|安静|冷光|focus|写代码/i)) return { act: () => setMood('focus'), text: '切到专注模式，灯光调冷了，适合写代码。' };
  if (has(/微醺|暖|chill|放松/i)) return { act: () => setMood('chill'), text: '回到微醺暖光，这才是酒吧该有的样子。' };
  if (has(/音乐|歌|lo-?fi|唱片/i)) return { act: () => { if (!music.on) toggleMusic(); agentFocus('vinyl'); }, text: '唱片机转起来了，是老板挑的 lo-fi。再点一下唱片机就能停。' };
  if (has(/预约|约个|约一下|见面|聊聊|合作|面谈/)) return { act: () => openRelay('appt'), text: '好，我帮你约老板。选个时间，写一句事由，我转达给他。' };
  if (has(/催|回复了吗|怎么还没回/)) return { act: null, text: '想催老板的话，点下面的“提醒老板回复”，我帮你提醒一次。' };
  if (has(/留言|黑板|转告|告诉老板/)) return { act: () => openRelay('msg'), text: '行，把你想说的话写在下面，我原话贴到黑板上，老板回复后你会在“动态”里看到。' };
  if (has(/隔壁|平台|社区|街区|邻居/)) return { act: null, text: '隔壁是一颗住满开发者的地球：每人在真实地址有一间房，家具就是作品入口。出门就能飞去东京找 @pixelmo。' };
  if (has(/特调|喝|酒|饮/)) return { act: null, text: '零点特调：一份荧光青柠，一份熬夜，再加一勺上线前的紧张。今晚算我请！' };
  if (has(/你是谁|介绍|hello|hi|你好|嗨/i)) return { act: null, text: '我是 Bit，老板配置的 AI 酒保。可以带你看拾光、玩游戏，或者帮你调灯光和音乐。' };
  return { act: () => { if (!iOwnRoom(relayKey())) openRelay('msg'); }, text: '这个我替老板答不了。要是想问他，下面写一句话，我帮你转达。' };
}
async function fallbackReply(text, reply) {
  const r = scriptReply(text);
  await sleep(450);
  if (r.act) r.act();
  robotMood('talk');
  for (let i = 1; i <= r.text.length; i += 2) { reply.text = r.text.slice(0, i); updateMsg(reply); await sleep(26); }
  reply.text = r.text; updateMsg(reply);
}
function updateAgentStatus() {
  const s = $('#bitStatus'); if (!s) return;
  s.classList.toggle('live', !!S.sample);
  s.querySelector('span').textContent = S.sample ? '由 Claude 驱动 · 能操作这个房间' : '离线演示 · 内置台词';
}

/* ---------- 拾光 ---------- */
function openShiguang(g) {
  beginPanel('shiguang', g);
  const e = entryOf(g);
  setPanel('App · 洞洞板电子便签', '拾光', `
    <p class="mute small u-mb3">${esc(e.desc || '')}</p>
    <div class="sg" id="sg" data-skin="${SG.skin}">
      <div class="sg-skins seg" id="sgSkins">${Object.entries(SKINS).map(([k, v]) => `<button type="button" data-skin="${k}" aria-pressed="${SG.skin === k}">${v.name}</button>`).join('')}</div>
      <div class="sg-app"><div class="sg-top"><b>今天</b><span id="sgCount"></span></div><ul class="sg-list" id="sgList"></ul>
      <form class="sg-add" id="sgAdd"><input id="sgInput" maxlength="40" autocomplete="off" placeholder="添加待办，回车保存"></form></div>
      <div class="sync-note"><i></i>勾选、新增或换皮肤，墙上的电子便签会同步变化。</div>
    </div><div class="divider"></div>${downloadsHTML(e)}`, entryFooter(e, g));
  pBody.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  bindFooter(g);
  renderSG();
  $('#sgSkins').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; SG.skin = b.dataset.skin; saveSG(); $('#sg').dataset.skin = SG.skin; $('#sgSkins').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.skin === SG.skin)); drawNote(); });
  $('#sgAdd').addEventListener('submit', ev => { ev.preventDefault(); const i = $('#sgInput'); const v = i.value.trim(); if (!v) return; SG.tasks.unshift({ t: v, done: false }); if (SG.tasks.length > 8) SG.tasks.pop(); i.value = ''; saveSG(); renderSG(); drawNote(); });
}
function renderSG() {
  const ul = $('#sgList'); if (!ul) return;
  ul.innerHTML = SG.tasks.map((t, i) => `<li class="sg-item ${t.done ? 'done' : ''}"><button type="button" role="checkbox" aria-checked="${t.done}" aria-label="完成 ${esc(t.t)}" data-i="${i}">${ICON.check}</button><span>${esc(t.t)}</span></li>`).join('');
  $('#sgCount').textContent = `${DATE_STR} · ${SG.tasks.filter(t => t.done).length}/${SG.tasks.length}`;
  ul.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const t = SG.tasks[+b.dataset.i]; t.done = !t.done; saveSG(); renderSG(); drawNote(); }));
}

/* ---------- game ---------- */
function openGame(g) {
  beginPanel('game', g);
  const e = entryOf(g);
  setPanel('小游戏 · 桌上的游戏机', e.title || '霓虹贪吃蛇', `
    <div class="gm-screen" id="gmScreen"></div>
    <div class="gm-hud"><span>得分 <b id="gmScore">0</b></span><span>最高 <b id="gmBest">${game.best}</b></span></div>
    <div class="gm-pad" id="gmPad">${['up', 'left', 'down', 'right'].map(d => `<button type="button" class="${d}" data-d="${d}" aria-label="${{ up: '上', left: '左', down: '下', right: '右' }[d]}">${ICON.arrow(d)}</button>`).join('')}</div>
    <p class="mute small u-m0">方向键或 WASD 操作。这块画面和房间里那台游戏机的屏幕是同一块，玩的时候可以看看桌上。</p>`, entryFooter(e, g));
  bindFooter(g);
  $('#gmScreen').appendChild(game.c);
  game.mode = 'ready'; gReset(); updateGameHud();
  const D = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  $('#gmPad').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) gInput(D[b.dataset.d]); });
  let sx = 0, sy = 0;
  game.c.onpointerdown = ev => { sx = ev.clientX; sy = ev.clientY; };
  game.c.onpointerup = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { if (game.mode !== 'play') gInput({ x: 1, y: 0 }); return; } gInput(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }); };
}
function updateGameHud() { const s = $('#gmScore'), b = $('#gmBest'); if (s) s.textContent = game.score; if (b) b.textContent = game.best; }

/* ---------- guestbook ---------- */
function openGuestbook(g) {
  const key = CLOUD.ready ? roomKey(S.room) : null;
  if (key) return openCloudGuestbook(g, key);
  beginPanel('guestbook', g);
  const render = () => {
    const list = GB.concat(GB_EXAMPLES);
    $('#gbList').innerHTML = list.map(m => `<div class="gb-item">${esc(m.text)}<small><span>— ${esc(m.name)}</span><span>${esc(m.time)}${m.ex ? ' · 示例' : ''}</span></small></div>`).join('');
  };
  setPanel('留言板 · 后墙黑板', '访客留言', `
    <div class="gb-list" id="gbList"></div>
    <form id="gbForm">
      <div class="field"><label for="gbName">署名</label><input class="input" id="gbName" maxlength="16" placeholder="比如 @你的门牌名" value="${esc(store.get('gebi.gbname', ''))}"></div>
      <div class="field"><label for="gbText">留言</label><textarea class="input" id="gbText" maxlength="60" placeholder="写给房主的话，最多 60 字"></textarea><span class="err" id="gbErr" hidden></span></div>
    </form>`, `<button type="submit" form="gbForm" class="btn primary">贴到黑板上</button><span class="mute small">新留言会出现在黑板最上面</span>`);
  render();
  $('#gbForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('#gbName').value.trim() || '路过的访客', text = $('#gbText').value.trim(), err = $('#gbErr');
    if (!text) { err.textContent = '先写一句留言再贴上去。'; err.hidden = false; return; }
    err.hidden = true;
    GB.unshift({ name, text, time: '刚刚' }); if (GB.length > 20) GB.pop();
    store.set('gebi.guestbook', GB); store.set('gebi.gbname', name);
    $('#gbText').value = ''; render(); drawChalk(); toast('已贴到黑板上');
  });
}

function openCloudGuestbook(g, key) {
  beginPanel('guestbook', g);
  const owner = iOwnRoom(key);
  setPanel('留言板 · 黑板', owner ? '我的留言板' : '给房主留言', `<div class="gb-list" id="gbList"></div>
    ${canPost() ? `<form id="gbForm"><div class="field"><label for="gbText">${owner ? '在自己的黑板上写点什么' : '以你的账号留言，房主可以直接回复你'}</label><textarea class="input" id="gbText" maxlength="120" placeholder="${owner ? '比如：本周在做拾光的托盘菜单' : '写给房主的话，最多 120 字'}"></textarea><span class="err" id="gbErr" hidden></span></div></form>` : '<p class="mute small u-m0">你现在是参观者，可以看留言。留言需要房主把你设为“参与者”。</p>'}`,
    canPost() ? `<button type="submit" form="gbForm" class="btn primary">贴到黑板上</button><span class="mute small">${owner ? '留言下面可以直接回复' : '回复会出现在你的“动态”里'}</span>` : '');
  const render = () => { const l = $('#gbList'); if (!l) return; l.innerHTML = threadHTML(key); bindReplies(l, key, render); };
  S.panel.render = render; render();
  const f = $('#gbForm'); if (f) f.addEventListener('submit', async ev => {
    ev.preventDefault(); const t = $('#gbText').value.trim(), err = $('#gbErr');
    if (!t) { err.textContent = '先写一句再贴上去。'; err.hidden = false; return; }
    err.hidden = true; $('#gbText').value = '';
    if (await postMessage(key, t)) { toast(owner ? '已贴到黑板上' : '已贴到黑板上，房主回复后你会在“动态”里看到'); }
  });
}

/* ---------- generic entry ---------- */
function openEntry(g) {
  beginPanel('entry', g);
  const e = entryOf(g), bound = validUrl(e.url);
  setPanel(`${KIND_LABEL[e.kind] || '作品'} · ${nameOf(g)}`, e.title || '未命名作品', `
    <div class="preview" id="pv"></div>
    ${e.desc ? `<p class="u-mb3">${esc(e.desc)}</p>` : ''}
    <dl class="kv"><dt>房主</dt><dd>${esc(S.room.owner)}</dd>${e.from ? `<dt>${e.from.adapted ? '改编自' : '收藏自'}</dt><dd>${esc(e.from.by || '一位邻居')} 的「${esc(e.from.title)}」${(e.from.chain || []).length ? `<br><span class="mute small">更早：${e.from.chain.map(c => esc(c.by) + '「' + esc(c.title) + '」').join(' → ')}</span>` : ''}</dd>` : ''}<dt>物件</dt><dd>${esc(nameOf(g))}</dd><dt>地址</dt><dd>${bound ? `<span class="u-mono">${esc(e.url)}</span>` : '<span class="mute">还没有绑定</span>'}</dd></dl>
    ${bound ? '' : `<div class="unbound">这个物件还没绑定作品地址。${S.room.mine ? '在建造模式里选中它，填上地址，就能直接在房间里打开。' : '房主绑定后，这里会出现“打开完整版”。'}</div>`}
    ${hasDownloads(e) ? '<div class="divider"></div>' + downloadsHTML(e) : ''}`,
    entryFooter(e, g));
  pBody.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  bindFooter(g);
  $('#pv').appendChild(kioskCanvas(e, 768, 420));
}

/* ============================================================
   In-site work windows: a bound web product runs inside the room
   (sandboxed iframe) and talks back through the gebi SDK.
   ============================================================ */
const SNAKE_DEMO = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>霓虹贪吃蛇</title><style>
html,body{margin:0;height:100%;background:#070a14;color:#e8e4f0;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;box-sizing:border-box}
canvas{image-rendering:pixelated;width:min(92vw,calc((100vh - 120px)*1.25));height:auto;border-radius:10px;box-shadow:0 0 0 1px #1d2440,0 0 60px rgba(98,230,255,.15);touch-action:none}
.hud{display:flex;gap:24px;font-size:13px;color:#8f97b3}.hud b{color:#ffb454;font-weight:400}
.tip{font-size:12px;color:#5d6688;text-align:center}
</style></head><body><div class="wrap"><div class="hud"><span>SCORE <b id="s">0</b></span><span>BEST <b id="b">0</b></span><span id="st">READY</span></div><canvas id="c" width="160" height="128"></canvas><div class="tip">方向键 / WASD / 滑动操作 · 空格重开<br>这是作品自己的网页，在隔壁里以窗口运行</div></div><script>
var GW=20,GH=16,C=8,c=document.getElementById('c'),g=c.getContext('2d');
var snake,dir,next,food,score=0,best=0,mode='ready',acc=0,step=.12,t=0,last=performance.now(),linked=false,pushAcc=0;
function reset(){snake=[{x:7,y:8},{x:6,y:8},{x:5,y:8},{x:4,y:8}];dir={x:1,y:0};next=dir;score=0;step=.12;place();hud();}
function place(){var p;do{p={x:Math.floor(Math.random()*GW),y:Math.floor(Math.random()*GH)}}while(snake.some(function(s){return s.x===p.x&&s.y===p.y}));food=p;}
function safe(x,y){if(x<0||y<0||x>=GW||y>=GH)return false;for(var i=0;i<snake.length-1;i++)if(snake[i].x===x&&snake[i].y===y)return false;return true;}
function tick(){if(mode!=='play')return;dir=next;var h=snake[0],nx=h.x+dir.x,ny=h.y+dir.y;if(!safe(nx,ny)){mode='over';if(score>best){best=score;send({type:'state',data:{best:best}});}hud();return;}snake.unshift({x:nx,y:ny});if(nx===food.x&&ny===food.y){score++;step=Math.max(.065,step-.003);place();hud();}else snake.pop();}
function draw(){g.fillStyle='#0a0e1c';g.fillRect(0,0,160,128);g.fillStyle='#16203a';for(var x=0;x<GW;x++)for(var y=0;y<GH;y++)g.fillRect(x*C+3,y*C+3,2,2);g.fillStyle=Math.sin(t*8)>0?'#ff5aa8':'#ff86c0';g.fillRect(food.x*C+1,food.y*C+1,C-2,C-2);snake.forEach(function(s,i){g.fillStyle=i===0?'#ffb454':(i%2?'#62e6ff':'#3fc6e6');g.fillRect(s.x*C,s.y*C,C-1,C-1);});g.font='8px monospace';g.textBaseline='top';g.fillStyle='#e8e4f0';g.fillText(('00'+score).slice(-3),3,2);if(mode!=='play'){g.fillStyle='rgba(10,14,28,.78)';g.fillRect(0,44,160,42);g.textAlign='center';g.fillStyle='#ffb454';g.font='10px monospace';g.fillText(mode==='over'?'GAME OVER':'NEON SNAKE',80,52);g.fillStyle='#e8e4f0';g.font='8px monospace';g.fillText('PRESS AN ARROW KEY',80,70);g.textAlign='left';}}
function input(d){if(mode!=='play'){reset();mode='play';next=d.x===-1?{x:1,y:0}:d;hud();return;}if(d.x===-dir.x&&d.y===-dir.y)return;next=d;}
function hud(){document.getElementById('s').textContent=score;document.getElementById('b').textContent=best;document.getElementById('st').textContent=mode==='play'?'PLAYING':mode==='over'?'GAME OVER':'READY';}
function send(m){m.gebi=1;try{parent.postMessage(m,'*');}catch(e){}}
function push(){if(!linked||!window.createImageBitmap)return;createImageBitmap(c).then(function(f){try{parent.postMessage({gebi:1,type:'screen',frame:f},'*',[f]);}catch(e){}}).catch(function(){});}
function loop(now){var dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;acc+=dt;while(acc>step){acc-=step;tick();}draw();pushAcc+=dt;if(pushAcc>.08){pushAcc=0;push();}requestAnimationFrame(loop);}
var K={ArrowUp:{x:0,y:-1},KeyW:{x:0,y:-1},ArrowDown:{x:0,y:1},KeyS:{x:0,y:1},ArrowLeft:{x:-1,y:0},KeyA:{x:-1,y:0},ArrowRight:{x:1,y:0},KeyD:{x:1,y:0}};
addEventListener('keydown',function(e){if(K[e.code]){e.preventDefault();input(K[e.code]);}else if(e.code==='Space'){e.preventDefault();reset();mode='ready';hud();}});
var sx=0,sy=0;addEventListener('pointerdown',function(e){sx=e.clientX;sy=e.clientY;window.focus();});
addEventListener('pointerup',function(e){var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.max(Math.abs(dx),Math.abs(dy))<18){if(mode!=='play')input({x:1,y:0});return;}input(Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)});});
addEventListener('message',function(e){var d=e.data;if(!d||d.gebi!==1)return;if(d.type==='hello'){linked=true;if(d.data&&+d.data.best>best)best=Math.floor(+d.data.best);hud();send({type:'ready',name:'霓虹贪吃蛇',version:'1.0.0'});}});
reset();requestAnimationFrame(loop);window.focus();
<\/script></body></html>`;

const SHIGUANG_DEMO = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾光</title><style>
html,body{margin:0;min-height:100%}
body{font-family:-apple-system,"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;transition:background .3s,color .3s}
.app{max-width:520px;margin:0 auto;padding:22px 18px 28px;box-sizing:border-box}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h1{margin:0;font-size:28px}
.date{font-size:12px;opacity:.65}
.skins{display:flex;gap:6px;margin:16px 0 14px}
.skins button{border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:4px 13px;font:inherit;font-size:12.5px;opacity:.55;cursor:pointer}
.skins button.on{opacity:1;background:var(--acc);border-color:var(--acc);color:var(--on)}
.label{font-size:12px;opacity:.6;margin:0 0 8px}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
li{display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:14px}
li button{width:20px;height:20px;flex:none;border-radius:50%;border:1.5px solid currentColor;background:transparent;color:inherit;padding:0;cursor:pointer;display:grid;place-items:center}
li button svg{width:12px;height:12px;opacity:0}
li.done span{text-decoration:line-through;opacity:.5}
li.done button{background:var(--acc);border-color:var(--acc);color:var(--on)}
li.done button svg{opacity:1}
input{width:100%;box-sizing:border-box;height:40px;border-radius:10px;border:1px dashed currentColor;background:transparent;color:inherit;padding:0 12px;font:inherit;outline:none;margin-top:12px;opacity:.85}
input::placeholder{color:inherit;opacity:.55}
.foot{margin-top:20px;font-size:11.5px;opacity:.5;line-height:1.6}
body.light{background:#f6f4ee;color:#2a2a2e;--acc:#4b7bec;--on:#fff}body.light li{border-bottom:1px solid #e3ddd1}
body.capsule{background:#ffe3ec;color:#5a2440;--acc:#ff6fa0;--on:#fff}body.capsule li{background:#fff;border-radius:999px;box-shadow:0 2px 0 #ffb7cf}body.capsule li:nth-child(3n+2){background:#fff4c9;box-shadow:0 2px 0 #f2d77a}body.capsule li:nth-child(3n){background:#dff6ff;box-shadow:0 2px 0 #9fd8ef}
body.key{background:#24262c;color:#efe7d6;--acc:#ffb454;--on:#24262c;font-family:ui-monospace,Menlo,Consolas,monospace}body.key li{background:#33363e;border-radius:7px;box-shadow:0 3px 0 #17181c}body.key li button{border-radius:4px}
</style></head><body class="light"><div class="app"><header><h1>拾光</h1><span class="date" id="date"></span></header>
<div class="skins" id="skins"><button type="button" data-s="light">轻</button><button type="button" data-s="capsule">扭蛋</button><button type="button" data-s="key">键</button></div>
<p class="label">今天</p><ul id="list"></ul><form id="add"><input id="inp" maxlength="40" placeholder="添加待办，回车保存" autocomplete="off"></form>
<div class="foot">拾光网页版 · 示例页面<br>通过隔壁 SDK 与墙上的电子便签同步</div></div><script>
var state={skin:'light',tasks:[]},date='';
var CK='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function render(){document.body.className=state.skin;var d=state.tasks.filter(function(t){return t.done;}).length;document.getElementById('date').textContent=(date?date+' · ':'')+d+'/'+state.tasks.length;Array.prototype.forEach.call(document.querySelectorAll('#skins button'),function(b){b.classList.toggle('on',b.getAttribute('data-s')===state.skin);});document.getElementById('list').innerHTML=state.tasks.map(function(t,i){return '<li class="'+(t.done?'done':'')+'"><button type="button" data-i="'+i+'" role="checkbox" aria-checked="'+t.done+'" aria-label="完成">'+CK+'</button><span>'+esc(t.t)+'</span></li>';}).join('');}
function sync(){try{parent.postMessage({gebi:1,type:'state',data:{skin:state.skin,tasks:state.tasks}},'*');}catch(e){}}
document.getElementById('list').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var t=state.tasks[+b.getAttribute('data-i')];t.done=!t.done;render();sync();});
document.getElementById('skins').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;state.skin=b.getAttribute('data-s');render();sync();});
document.getElementById('add').addEventListener('submit',function(e){e.preventDefault();var i=document.getElementById('inp'),v=i.value.trim();if(!v)return;state.tasks.unshift({t:v,done:false});if(state.tasks.length>8)state.tasks.pop();i.value='';render();sync();});
addEventListener('message',function(e){var d=e.data;if(!d||d.gebi!==1)return;if(d.type==='hello'){if(d.data){if(Array.isArray(d.data.tasks))state.tasks=d.data.tasks;if(d.data.skin)state.skin=d.data.skin;date=d.data.date||'';}render();parent.postMessage({gebi:1,type:'ready',name:'拾光',version:'1.4.0'},'*');}});
render();
<\/script></body></html>`;

const DEMOS = { shiguang: SHIGUANG_DEMO, game: SNAKE_DEMO };
const FRAME_DENY = ['github.com', 'google.com', 'notion.so', 'notion.site', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'claude.ai', 'chatgpt.com', 'apple.com', 'microsoft.com', 'chromewebstore.google.com', 'figma.com', 'bilibili.com', 'zhihu.com', 'weibo.com', 'taobao.com'];
function frameDenyHint(url) {
  if (!validUrl(url)) return '';
  let host = ''; try { host = new URL(url.trim()).host.replace(/^www\./, ''); } catch (e) { return ''; }
  return FRAME_DENY.some(d => host === d || host.endsWith('.' + d)) ? `${host} 通常禁止被其他网站嵌入，建议选“新标签页”。` : '';
}
const PLATFORMS = [
  { k: 'win', label: 'Windows 桌面版', verb: '下载安装包', ph: 'https://github.com/你的账号/shiguang/releases/latest/download/Shiguang-Setup.exe', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5 9 3.6v5.9H3zM10 3.5 17 2.5v7H10zM3 10.5h6v5.9l-6-.9zM10 10.5h7v7l-7-1z" fill="#62e6ff"/></svg>' },
  { k: 'mac', label: 'macOS 版', verb: '下载', ph: 'https://github.com/你的账号/shiguang/releases/latest/download/Shiguang.dmg', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.6 10.6c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7C5.4 6 4 7.1 4 9.7c0 1.6.6 3.2 1.4 4.3.7 1 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.6c1 0 1.6-.9 2.2-1.8.7-1 .9-1.9 1-2-.1 0-1.8-.7-1.8-2.4zM11.8 4.7c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1.1z" fill="#e9e2d0"/></svg>' },
  { k: 'chrome', label: 'Chrome 扩展', verb: '添加到 Chrome', ph: 'https://chromewebstore.google.com/detail/你的扩展', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#ffb454"/><circle cx="10" cy="10" r="3.2" fill="#3d5afe" stroke="#fff" stroke-width="1.4"/></svg>' },
  { k: 'edge', label: 'Edge 扩展', verb: '添加到 Edge', ph: 'https://microsoftedge.microsoft.com/addons/detail/你的扩展', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17 11.5c0 3.2-2.9 5.5-6.4 5.5C6.4 17 3 14 3 10a7 7 0 0 1 13.8-1.6c.4 1.4-.4 2.4-2 2.4H9.2c0 1.8 1.6 2.9 3.5 2.9 1.6 0 3-.6 4.3-1.6z" fill="#3ec6e0"/></svg>' }
];
function detectDevice() {
  const ua = navigator.userAgent || '', plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const edge = /Edg\//.test(ua), chrome = /Chrome\//.test(ua) && !edge && !/OPR\//.test(ua);
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  return { edge, chrome, mobile, win: /Win/i.test(plat) || /Windows/.test(ua), mac: /Mac/i.test(plat) && !/iPhone|iPad/.test(ua) };
}
function recommend(keys) {
  const d = detectDevice(); if (d.mobile) return null;
  if (d.win && keys.includes('win')) return { k: 'win', why: '你在用 Windows' };
  if (d.mac && keys.includes('mac')) return { k: 'mac', why: '你在用 Mac' };
  if (d.edge && keys.includes('edge')) return { k: 'edge', why: '你在用 Edge 浏览器' };
  if (d.chrome && keys.includes('chrome')) return { k: 'chrome', why: '你在用 Chrome 浏览器' };
  return null;
}
function hasDownloads(e) { return !!(e && e.downloads && PLATFORMS.some(p => e.downloads[p.k] && validUrl(e.downloads[p.k].url))); }
function downloadsHTML(e, opts = {}) {
  const dl = (e && e.downloads) || {}, owner = !!(S.room && S.room.mine);
  const filled = PLATFORMS.filter(p => dl[p.k] && validUrl(dl[p.k].url));
  if (!filled.length && !owner) return '';
  const rec = recommend(filled.map(p => p.k));
  const host = u => { try { return new URL(u).host; } catch (x) { return ''; } };
  let html = opts.noTitle ? '' : '<p class="section-t">获取客户端</p>';
  if (rec) {
    const p = PLATFORMS.find(x => x.k === rec.k), it = dl[p.k];
    html += `<div class="dl-primary"><span class="dl-ico">${p.icon}</span><div class="grow"><b>${p.label}${it.ver ? ' · ' + esc(it.ver) : ''}</b><span>${esc(rec.why)}，推荐这个</span></div><a class="btn primary sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${p.verb} ${ICON.ext}</a></div>`;
  }
  const rows = PLATFORMS.filter(p => !(rec && rec.k === p.k)).filter(p => owner || (dl[p.k] && validUrl(dl[p.k].url))).map(p => {
    const it = dl[p.k];
    if (it && validUrl(it.url)) return `<li><span class="dl-ico">${p.icon}</span><div class="grow">${p.label}${it.ver ? ' · ' + esc(it.ver) : ''}<small>来自 ${esc(host(it.url))}</small></div><a class="btn sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${p.verb}</a></li>`;
    return `<li><span class="dl-ico">${p.icon}</span><div class="grow">${p.label}<small>还没填写下载地址</small></div>${owner ? '<button type="button" class="btn sm ghost" data-act="bind">去填写</button>' : ''}</li>`;
  }).join('');
  if (rows) html += `<ul class="dl-list">${rows}</ul>`;
  html += `<p class="mute small u-mt3">${filled.length ? '下载地址由房主填写，指向房主自己的发布渠道；隔壁不托管安装包。' : '在建造模式里选中这个物件，填上各平台的下载地址后，访客会看到适合自己设备的那一项。'}</p>`;
  return html;
}

const WINS = new Map();
S.win = null; S.embedBlocked = false;
const winsEl = $('#wins'), taskbar = $('#taskbar'), winBackdrop = $('#winBackdrop');
const WICON = {
  reload: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  min: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 11.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};
function embedSource(e) {
  if (!e) return null;
  if (e.work && (e.work.startsWith('local:') || WORK_RE.test(e.work))) return { hosted: e.work, external: false };
  if (validUrl(e.url)) return { src: e.url.trim(), external: true };
  if (DEMOS[e.kind]) return { srcdoc: DEMOS[e.kind], external: false };
  return null;
}
function canEmbed(e) { const s = embedSource(e); if (!s || (e.open === 'tab' && s.external)) return false; if (!s.external && !s.hosted && S.embedBlocked) return false; return true; }
function screenOf(g) { return g && g.userData && g.userData.screen; }
function openWindow(g) {
  const e = entryOf(g), iid = g.userData.iid;
  closePanel(true); bubble.hidden = true; tip.hidden = true;
  if (S.win && S.win.iid !== iid) minimizeWin(S.win, true);
  let w = WINS.get(iid);
  if (!w) {
    if (WINS.size >= 4) { const old = [...WINS.values()].find(x => x !== S.win); if (old) closeWin(old, true); }
    w = createWin(g, e); WINS.set(iid, w);
  }
  showWin(w);
}
function createWin(g, e) {
  const src = embedSource(e), iid = g.userData.iid;
  const size = e.size || (e.kind === 'game' || e.kind === 'game2' ? 'wide' : 'tall');
  const kc = KIND_COLOR[e.kind] || KIND_COLOR.link;
  let host = '内置示例', origin = '*';
  if (src.external) { try { const u = new URL(src.src); host = u.host; origin = u.origin; } catch (x) {} }
  if (src.hosted) host = '隔壁托管' + (e.workBytes ? ' · ' + kb(e.workBytes) : '');
  if (e.from) host += ` · ${e.from.adapted ? '改编自' : '收藏自'} ${e.from.by || '邻居'}`;
  const el = document.createElement('section');
  el.className = 'win ' + size; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', e.title || '作品');
  el.innerHTML = `<header class="win-bar"><i class="win-dot" style="background:linear-gradient(135deg,${kc[0]},${kc[1]})"></i>
    <div class="win-t"><b>${esc(e.title || '作品')}</b><span class="win-sub"><span class="win-host">${esc(host)}</span><button type="button" class="win-sdk" data-a="sdk" disabled>连接中</button></span></div>
    <div class="win-act">${curateOK(e) ? '<button type="button" class="win-get" data-a="collect">☆ 收藏</button><button type="button" class="win-get" data-a="adapt">改编</button>' : ''}${(hasDownloads(e) || (e.kind === 'shiguang' && S.room && S.room.mine)) ? '<button type="button" class="win-get" data-a="dl" aria-expanded="false">获取客户端</button>' : ''}
    <button type="button" class="wbtn" data-a="reload" aria-label="重新载入">${WICON.reload}</button>
    ${src.external ? `<a class="wbtn" href="${esc(src.src)}" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开">${ICON.ext}</a>` : ''}
    <button type="button" class="wbtn" data-a="min" aria-label="收起到任务栏">${WICON.min}</button>
    <button type="button" class="wbtn x" data-a="close" aria-label="关闭">${WICON.x}</button></div></header>
    <div class="win-body"><div class="win-load"><div class="bar-anim"><i></i></div><span>正在从「${esc(nameOf(g))}」里打开 ${esc(e.title || '作品')}…</span></div><div class="win-hint" hidden></div><div class="win-dl" hidden></div></div>`;
  const iframe = document.createElement('iframe');
  iframe.title = e.title || '作品';
  iframe.setAttribute('sandbox', src.external ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock' : src.hosted ? 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups' : 'allow-scripts allow-pointer-lock');
  iframe.setAttribute('allow', 'fullscreen; gamepad; clipboard-write; autoplay');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  const body = el.querySelector('.win-body'); body.prepend(iframe);
  const w = { iid, g, e, el, iframe, size, src, origin, kind: e.kind, sdk: false, loaded: false, timers: [] };
  iframe.addEventListener('load', () => {
    w.loaded = true;
    body.querySelector('.win-load').hidden = true;
    hello(w);
    clearTimeout(w.hs); w.hs = setTimeout(() => { if (!w.sdk) noHandshake(w); }, 4000);
  });
  w.timers.push(setTimeout(() => { if (!w.loaded && !w.sdk) noHandshake(w); }, 9000));
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'min') minimizeWin(w);
    else if (a === 'close') closeWin(w);
    else if (a === 'reload') { w.sdk = false; setSdk(w, '连接中', ''); body.querySelector('.win-hint').hidden = true; body.querySelector('.win-load').hidden = false; if (src.hosted) iframe.srcdoc = w.html || ''; else if (src.srcdoc) iframe.srcdoc = src.srcdoc; else iframe.src = src.src; }
    else if (a === 'dl') toggleDl(w, b);
    else if (a === 'sdk') openSdkGuide();
    else if (a === 'collect') collectEntry(e);
    else if (a === 'adapt') adaptEntry(e);
    else if (a === 'tab') { /* plain link */ }
    else if (a === 'always-tab') { e.open = 'tab'; saveLayout(); closeWin(w); toast('以后点这个物件会在新标签页打开'); }
  });
  if (src.hosted) loadWork(src.hosted).then(html => {
    if (!WINS.has(iid)) return;
    if (!html) { body.querySelector('.win-load').innerHTML = '<span>作品文件没找到。房主可能刚刚移除了它。</span>'; return; }
    w.html = html; iframe.srcdoc = html;
  });
  else if (src.srcdoc) iframe.srcdoc = src.srcdoc; else iframe.src = src.src;
  winsEl.appendChild(el);
  return w;
}
function hello(w) {
  const data = w.kind === 'shiguang' ? { tasks: SG.tasks, skin: SG.skin, date: DATE_STR } : w.kind === 'game' ? { best: game.best } : {};
  try { w.iframe.contentWindow.postMessage({ gebi: 1, type: 'hello', room: { no: S.room.no, name: S.room.name, owner: S.room.owner }, entry: { title: w.e.title }, data }, w.origin); } catch (x) {}
}
function setSdk(w, text, cls) { const s = w.el.querySelector('.win-sdk'); s.textContent = text; s.className = 'win-sdk ' + (cls || ''); s.disabled = !/off|err/.test(cls || ''); s.title = s.disabled ? '' : '查看隔壁 SDK 接入说明'; }
function noHandshake(w) {
  if (!WINS.has(w.iid) || w.sdk) return;
  if (w.src.hosted) {
    if (!w.loaded) return;
    w.el.querySelector('.win-load').hidden = true;
    setSdk(w, '未接入 SDK · 怎么接', 'off');
    return;
  }
  if (!w.src.external) {
    // the built-in demo could not run as an embedded page here: fall back to the built-in panel
    S.embedBlocked = true;
    const g = w.g; closeWin(w, true);
    toast('当前环境拦截了嵌入页面，已改用房间内置的版本', 3600);
    if (w.kind === 'shiguang') openShiguang(g); else if (w.kind === 'game') openGame(g);
    return;
  }
  w.el.querySelector('.win-load').hidden = true;
  // 跨域页面里看不到内容：没握手时，“加载成功但没接 SDK”和“被拦截/加载失败”分不清，所以照实说
  setSdk(w, w.loaded ? '未接入 SDK · 怎么接' : '加载失败', w.loaded ? 'off' : 'err');
  const hint = w.el.querySelector('.win-hint');
  hint.innerHTML = `${w.loaded
    ? '<b>窗口里如果有画面，作品就能正常用</b>：它只是没有接入隔壁 SDK，房间里的物件不会同步。<br><b>如果是一片空白</b>：这个网站多半禁止被嵌入，或者加载失败了。隔壁看不到跨站页面的内容，没法替你判断是哪一种。'
    : '<b>9 秒内没有加载出来。</b>可能是网址打不开、网络太慢，或者网站禁止被其他网站嵌入。'}
    <div class="row"><a class="btn sm primary" href="${esc(w.src.src)}" target="_blank" rel="noopener noreferrer">在新标签页打开 ${ICON.ext}</a>${S.room && S.room.mine ? '<button type="button" class="btn sm" data-a="always-tab">以后都用新标签页</button>' : ''}${w.loaded && S.room && S.room.mine ? '<button type="button" class="btn sm ghost" data-a="sdk">接入 SDK</button>' : ''}<button type="button" class="btn sm ghost" data-hide="1">知道了</button></div>`;
  hint.hidden = false;
  hint.querySelector('[data-hide]').addEventListener('click', () => { hint.hidden = true; });
  if (S.room) logOpen(roomKey(S.room), w.loaded ? 'nosdk' : 'fail');
}
function toggleDl(w, btn) {
  const d = w.el.querySelector('.win-dl'), open = d.hidden;
  if (open) {
    d.innerHTML = downloadsHTML(w.e);
    d.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { const iid = w.iid; closeAllWins(); setMode('build'); setTimeout(() => selectItem(findGroup(iid)), 60); }));
  }
  d.hidden = !open; btn.setAttribute('aria-expanded', open);
}
function showWin(w) {
  w.el.hidden = false; S.win = w; S.focus = w.g;
  winBackdrop.hidden = !(w.size === 'wide' && !isNarrow());
  focusOn(w.g, { panel: w.size === 'tall', loose: true });
  renderTaskbar();
  setTimeout(() => { try { w.iframe.focus(); } catch (x) {} }, 450);
}
function minimizeWin(w, quiet) {
  if (!w) return;
  w.el.hidden = true;
  if (S.win === w) { S.win = null; S.focus = null; winBackdrop.hidden = true; if (!quiet) setView('room'); }
  renderTaskbar();
  if (!quiet && !S.minHinted) { S.minHinted = true; toast('已收起到任务栏，作品保持当前状态，点任务栏回来'); }
}
function closeWin(w, quiet) {
  if (!w || !WINS.has(w.iid)) return;
  w.timers.forEach(clearTimeout); clearTimeout(w.hs);
  w.el.remove(); WINS.delete(w.iid);
  if (game.remote === w) { game.remote = null; game.mode = 'attract'; gReset(); }
  const sc = screenOf(w.g); if (sc && sc.restore) sc.restore();
  if (S.win === w) { S.win = null; S.focus = null; winBackdrop.hidden = true; if (!quiet) setView(S.mode === 'build' ? 'build' : 'room'); }
  renderTaskbar();
}
function closeAllWins() { [...WINS.values()].forEach(w => closeWin(w, true)); winBackdrop.hidden = true; }
function renderTaskbar() {
  const list = [...WINS.values()];
  taskbar.hidden = !list.length || S.view !== 'room';
  taskbar.innerHTML = list.map(w => `<button type="button" class="task ${S.win === w ? 'on' : ''}" data-iid="${esc(w.iid)}"><i></i>${esc(w.e.title || '作品')}</button>`).join('');
  syncDock();
}
taskbar.addEventListener('click', e => {
  const b = e.target.closest('.task'); if (!b) return;
  const w = WINS.get(b.dataset.iid); if (!w) return;
  if (S.win === w) minimizeWin(w); else { if (S.win) minimizeWin(S.win, true); closePanel(true); showWin(w); }
});
winBackdrop.addEventListener('click', () => { if (S.win) minimizeWin(S.win); });
function drawRemoteFrame(w, f) {
  const sc = screenOf(w.g);
  const done = () => { if (f && typeof f.close === 'function') f.close(); };
  if (!sc) return done();
  const ctx = sc.canvas.getContext('2d');
  const paint = img => {
    const cw = sc.canvas.width, ch = sc.canvas.height, iw = img.width, ih = img.height;
    const s = Math.max(cw / iw, ch / ih), dw = iw * s, dh = ih * s;
    ctx.imageSmoothingEnabled = !sc.pixel;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    sc.tex.needsUpdate = true;
  };
  if (typeof ImageBitmap !== 'undefined' && f instanceof ImageBitmap) { paint(f); done(); }
  else if (typeof f === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(f) && f.length < 400000) { const im = new Image(); im.onload = () => paint(im); im.src = f; }
}
function applySG(data) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.tasks)) {
    const tasks = data.tasks.slice(0, 8).filter(t => t && typeof t.t === 'string').map(t => ({ t: t.t.slice(0, 40), done: !!t.done }));
    SG.tasks = tasks;
  }
  if (typeof data.skin === 'string' && SKINS[data.skin]) SG.skin = data.skin;
  saveSG(); drawNote();
}
addEventListener('message', ev => {
  const d = ev.data; if (!d || d.gebi !== 1 || typeof d.type !== 'string') return;
  let w = null; for (const x of WINS.values()) if (x.iframe.contentWindow === ev.source) { w = x; break; }
  if (!w) return;
  if (w.src.external && ev.origin !== w.origin) return;
  switch (d.type) {
    case 'ready':
      w.sdk = true; clearTimeout(w.hs);
      w.el.querySelector('.win-load').hidden = true; w.el.querySelector('.win-hint').hidden = true;
      setSdk(w, '已接入隔壁 SDK · 物件同步中', 'on');
      if (S.room) logOpen(roomKey(S.room), 'sdk');
      if (w.kind === 'game') game.remote = w;
      break;
    case 'screen': if (w.sdk) drawRemoteFrame(w, d.frame); break;
    case 'state':
      if (w.kind === 'shiguang') applySG(d.data);
      if (w.kind === 'game' && d.data && Number.isFinite(+d.data.best) && +d.data.best > game.best) { game.best = Math.floor(+d.data.best); store.set('gebi.best', game.best); }
      break;
    case 'toast': if (typeof d.text === 'string') toast(d.text.slice(0, 60)); break;
    case 'close': closeWin(w); break;
  }
});


/* ---------- build inspector ---------- */
function selectItem(g) {
  if (!g) return;
  S.selected = g; if (S.panel && S.panel.kind !== 'inspect') closePanel(true);
  S.panel = { kind: 'inspect', g };
  const def = g.userData.def, isChild = g.userData.isChild, meta = g.userData.meta || {}, wall = def.wall;
  const movable = !wall && !isChild;
  if (movable) {
    const w = (meta.w || 1), d = (meta.d || 1), odd = (def.rot || 0) % 2;
    S.selRing.visible = true; S.selRing.scale.setScalar(Math.max(odd ? d : w, odd ? w : d) * .62 + .2);
    S.selRing.position.set(def.x, .02, def.z);
  } else S.selRing.visible = false;
  renderInspector(g);
}
function renderInspector(g) {
  const def = g.userData.def, isChild = g.userData.isChild, meta = g.userData.meta || {}, wall = def.wall;
  const movable = !wall && !isChild;
  const e = def.entry;
  const builtin = e && !BIND_KINDS.includes(e.kind);
  const urlAllowed = !e || !['agent', 'guestbook', 'door', 'music'].includes(e.kind);
  const where = wall ? '墙面物件，挂点固定' : isChild ? `挂在「${(ITEMS[g.userData.parentDef.type] || {}).name || ''}」上，随它一起移动` : `位置 ${def.x.toFixed(2)}, ${def.z.toFixed(2)} · 朝向 ${((def.rot || 0) % 4 + 4) % 4 * 90}°`;
  const kindSel = e ? (e.kind) : '';
  const kept = !!(e && e.from && !e.from.adapted);
  const SW = ['', '#ff5a6e', '#ff9a3d', '#e8c030', '#34b88a', '#3d9be8', '#7c4dff', '#d43d86'];
  setPanel('建造 · 物件设置', nameOf(g), `
    <p class="mute small u-mb4">${esc(where)}</p>
    ${movable ? `<div class="u-row u-mb4"><button type="button" class="btn" id="inRot">${ICON.rot}旋转 90°</button>${meta.nodelete ? '' : `<button type="button" class="btn danger" id="inDel">${ICON.del}删除</button>`}</div>` : ''}
    <div class="divider u-mt0"></div>
    <p class="section-t">绑定作品</p>
    ${!e ? `<p class="mute small u-mb3">这件物件现在只是装饰。任何物件都可以变成作品入口。</p><button type="button" class="btn" id="inMake">把它变成作品入口</button>` : kept ? `<p class="small u-mb3"><span class="tag">收藏品</span> 收藏自 <b>${esc(e.from.by || '一位邻居')}</b> 的「${esc(e.from.title)}」</p><p class="mute small u-m0">作品属于原作者，这里只负责展示它：访客点开会链回 TA 的房间。想改成自己的版本，请去原房间点“改编一份”。不想留了，直接删除这件物件就行。</p>` : `
    <form id="inForm">
      ${e.from ? `<p class="small u-mb3"><span class="tag pink">改编</span> 改编自 <b>${esc(e.from.by || '一位邻居')}</b> 的「${esc(e.from.title)}」，署名会一直保留。</p>` : ''}
      ${builtin ? `<p class="small u-mb3"><span class="tag ${e.kind === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[e.kind])}</span> <span class="mute">内置入口，打开方式由房间提供</span></p>` :
      `<div class="field"><label>作品类型</label><div class="seg" id="inKind">${BIND_KINDS.map(k => `<button type="button" data-k="${k}" aria-pressed="${k === kindSel}">${KIND_LABEL[k]}</button>`).join('')}</div></div>`}
      <div class="field"><label for="inTitle">作品名称</label><input class="input" id="inTitle" maxlength="20" value="${esc(e.title || '')}"></div>
      ${builtin ? '' : `<div class="field"><label>外观 · 主题色</label><div class="swatches" id="inColor">${SW.map(c => `<button type="button" data-c="${c}" style="${c ? 'background:' + c : ''}" aria-pressed="${(e.color || '') === c}" aria-label="${c || '默认'}">${c ? '' : '默认'}</button>`).join('')}</div><span class="mute small">展示屏和街机会换成这个颜色，改编的作品可以先从换色开始。</span></div>`}
      ${urlAllowed ? `<div class="field"><label for="inUrl">作品地址</label><input class="input" id="inUrl" inputmode="url" placeholder="${DEMOS[e.kind] ? '留空则使用内置示例' : 'https://'}" value="${esc(e.url || '')}"><span class="err" id="inErr" hidden></span><span class="note-warn" id="inWarn">${esc(frameDenyHint(e.url))}</span><span class="hint-s">想让房间里的物件跟着作品变化？<button type="button" class="linkbtn" id="inSdk">看 SDK 接入说明</button></span></div>
      <div class="field"><label>或者上传作品文件，由隔壁托管</label>
        <div class="host-row"><label class="btn sm" for="inFile">选择 .html 文件</label><input type="file" id="inFile" accept=".html,.htm,text/html" hidden><button type="button" class="btn sm ghost" id="inPasteBtn">粘贴代码</button>${e.work ? '<button type="button" class="btn sm ghost danger" id="inUnhost">移除托管</button>' : ''}</div>
        <span class="host-state" id="inHostState">${e.work ? `已托管${e.workBytes ? ' · ' + kb(e.workBytes) : ''}，打开时优先用托管的版本` : 'AI 做的单文件作品可以直接上传，一定能在房间里打开。最大 200 KB。'}</span>
        <textarea class="input code" id="inPaste" rows="5" hidden placeholder="<!doctype html> 粘贴完整的单文件 HTML"></textarea><span class="err" id="inHostErr" hidden></span></div>
      <div class="field"><label>打开方式</label><div class="seg" id="inOpen"><button type="button" data-v="embed" aria-pressed="${e.open !== 'tab'}">站内窗口</button><button type="button" data-v="tab" aria-pressed="${e.open === 'tab'}">新标签页</button></div></div>
      <div class="field"><label>窗口形状</label><div class="seg" id="inSize">${[['tall', '竖版 · 适合工具'], ['wide', '横版 · 适合游戏']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${(e.size || (/game/.test(e.kind) ? 'wide' : 'tall')) === v}">${l}</button>`).join('')}</div></div>` : ''}
      ${builtin ? '' : `<div class="field"><label for="inDesc">一句话介绍</label><textarea class="input" id="inDesc" maxlength="60" rows="2">${esc(e.desc || '')}</textarea></div>`}
      ${['shiguang', 'app', 'game', 'game2', 'web'].includes(e.kind) ? `<div class="divider"></div><p class="section-t">客户端下载（可选）</p><p class="mute small u-mb3">访客打开作品时会看到适合自己设备的那一项。桌面安装包建议用 GitHub Releases 的 latest 固定链接，发新版不用改这里。</p>
      ${PLATFORMS.map(p => { const it = (e.downloads || {})[p.k] || {}; return `<div class="dl-edit"><label for="dl_${p.k}">${p.label}</label><input class="input" id="dl_${p.k}" inputmode="url" placeholder="${esc(p.ph)}" value="${esc(it.url || '')}"><input class="input" id="dlv_${p.k}" maxlength="12" placeholder="版本号" value="${esc(it.ver || '')}"></div>`; }).join('')}<span class="err" id="dlErr" hidden></span>` : ''}
    </form>`}`,
    e && !kept ? `<button type="submit" form="inForm" class="btn primary">保存绑定</button>${!builtin && !isChild ? '<button type="button" class="btn ghost" id="inUnbind">解除绑定</button>' : ''}` : '');
  const rot = $('#inRot'); if (rot) rot.addEventListener('click', () => rotateSelected());
  const sdk = $('#inSdk'); if (sdk) sdk.addEventListener('click', openSdkGuide);
  const del = $('#inDel'); if (del) del.addEventListener('click', () => deleteSelected());
  const mk = $('#inMake'); if (mk) mk.addEventListener('click', () => { def.entry = { kind: 'web', title: nameOf(g), desc: '', url: '' }; renderInspector(g); });
  const ub = $('#inUnbind'); if (ub) ub.addEventListener('click', () => { delete def.entry; saveLayout(); rebuildFor(g); toast('已解除绑定，它又变回装饰了'); });
  let kind = kindSel, openMode = e && e.open === 'tab' ? 'tab' : 'embed', winSize = e ? (e.size || (/game/.test(e.kind) ? 'wide' : 'tall')) : 'tall';
  const segPick = (id, cb) => { const el = $(id); if (el) el.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v); }); };
  let colorPick = (e && e.color) || '';
  const cw = $('#inColor'); if (cw) cw.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; colorPick = b.dataset.c; cw.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  segPick('#inOpen', v => { openMode = v; }); segPick('#inSize', v => { winSize = v; });
  const urlIn = $('#inUrl'); if (urlIn) urlIn.addEventListener('input', () => { $('#inWarn').textContent = frameDenyHint(urlIn.value); });
  let pendingHtml = null, unhost = false;
  const hostState = $('#inHostState'), hostErr = $('#inHostErr');
  const takeHtml = (html, label) => {
    hostErr.hidden = true;
    const bytes = new Blob([html]).size;
    if (bytes > WORK_MAX) { hostErr.textContent = `文件有 ${kb(bytes)}，超过了 200 KB。把图片换成链接或压缩后再试。`; hostErr.hidden = false; pendingHtml = null; return; }
    if (!/<(html|body|script|canvas|div|svg|!doctype)/i.test(html)) { hostErr.textContent = '这看起来不是 HTML，请上传 .html 文件或粘贴完整的页面代码。'; hostErr.hidden = false; pendingHtml = null; return; }
    pendingHtml = html; unhost = false; hostState.textContent = `${label} · ${kb(bytes)}，点“保存绑定”后托管`;
  };
  const fileIn = $('#inFile'); if (fileIn) fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => takeHtml(String(rd.result || ''), f.name.slice(0, 30)); rd.readAsText(f); });
  const pb = $('#inPasteBtn'); if (pb) pb.addEventListener('click', () => { const t = $('#inPaste'); t.hidden = !t.hidden; if (!t.hidden) t.focus(); });
  const ph = $('#inUnhost'); if (ph) ph.addEventListener('click', () => { unhost = true; pendingHtml = null; hostState.textContent = '保存后移除托管，改用作品地址打开'; });
  const ks = $('#inKind'); if (ks) ks.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; kind = b.dataset.k; ks.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === kind)); });
  const f = $('#inForm'); if (f) f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#inUrl'), err = $('#inErr');
    if (u && u.value.trim() && !validUrl(u.value)) { err.textContent = '地址需要以 http:// 或 https:// 开头，例如 https://example.com/game'; err.hidden = false; return; }
    if (err) err.hidden = true;
    if ($('#dl_win')) {
      const dls = {}; let bad = '';
      PLATFORMS.forEach(p => { const v = $('#dl_' + p.k).value.trim(), ver = $('#dlv_' + p.k).value.trim(); if (!v) return; if (!validUrl(v)) bad = p.label; else dls[p.k] = { url: v, ver }; });
      if (bad) { const de = $('#dlErr'); de.textContent = `${bad}的下载地址需要以 https:// 开头。`; de.hidden = false; return; }
      if (Object.keys(dls).length) e.downloads = dls; else delete e.downloads;
    }
    if ($('#inOpen')) { e.open = openMode; e.size = winSize; }
    const pasted = $('#inPaste') && !$('#inPaste').hidden ? $('#inPaste').value.trim() : '';
    if (!pendingHtml && pasted) { takeHtml(pasted, '粘贴的代码'); if (!pendingHtml) return; }
    if (pendingHtml) {
      const prefix = workPrefix(), wid = (e.work && e.work.startsWith(prefix) ? e.work.slice(prefix.length) : 'w' + Date.now().toString(36));
      const path = prefix + wid;
      try { await saveWork(path, $('#inTitle').value.trim() || e.title || '作品', pendingHtml); } catch (x) { hostErr.textContent = '托管没成功，稍后再试。'; hostErr.hidden = false; return; }
      e.work = path; e.workBytes = new Blob([pendingHtml]).size; e.open = 'embed';
    } else if (unhost) { delete e.work; delete e.workBytes; }
    if (!builtin) { e.kind = kind || 'web'; const d = $('#inDesc'); if (d) e.desc = d.value.trim(); }
    if (!builtin) { if (colorPick) e.color = colorPick; else delete e.color; }
    e.title = $('#inTitle').value.trim() || e.title || '未命名作品';
    if (u) e.url = u.value.trim();
    saveLayout(); rebuildFor(g); toast(CLOUD.ready ? '已保存到社区，切回漫游点它试试' : '已保存，切回漫游点它试试');
  });
}
function rebuildFor(g) {
  const root = g.userData.isChild ? findGroup(g.userData.parentDef.uid) : g;
  const def = root.userData.def, iid = g.userData.iid;
  S.roomRoot.remove(root);
  placeItem(def);
  const ng = findGroup(iid);
  if (ng && S.mode === 'build') selectItem(ng);
  refreshHotspots();
}
function rotateSelected() {
  const g = S.selected; if (!g || g.userData.def.wall || g.userData.isChild) return;
  const def = g.userData.def; def.rot = ((def.rot || 0) + 1) % 4; def.ry = 0;
  clampDef(def); positionItem(g, def); saveLayout(); selectItem(g);
}
function deleteSelected() {
  const g = S.selected; if (!g || g.userData.def.wall || g.userData.isChild || (g.userData.meta || {}).nodelete) return;
  const def = g.userData.def; S.room.items = S.room.items.filter(d => d !== def);
  S.roomRoot.remove(g); S.itemGroups.delete(def.uid); closePanel(true); S.selected = null; S.selRing.visible = false; saveLayout(); toast(`已移走「${nameOf(g)}」`);
}
function clampDef(def) {
  const meta = ITEMS[def.type] || {}, odd = (def.rot || 0) % 2;
  const hw = ((odd ? meta.d : meta.w) || 1) / 2, hd = ((odd ? meta.w : meta.d) || 1) / 2;
  def.x = clamp(def.x, -5 + hw, 5 - hw); def.z = clamp(def.z, -4 + hd, 4 - hd);
}
let layoutT = 0;
function writeSite(patch) { const d = Object.assign(clone(CLOUD.site || {}), patch, { ownerId: CLOUD.me.id, updatedAt: Date.now() }); CLOUD.site = d; return cloudWrite('site/room302', d); }
function saveLayout() {
  if (!S.room || !S.room.mine) return;
  if (S.mode === 'build') setTimeout(renderPendingRow, 0);
  const items = clone(S.room.items);
  if (CLOUD.ready && S.room.uid && S.room.uid === CLOUD.me.id) {
    clearTimeout(layoutT); layoutT = setTimeout(() => { const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {}); if (!d.no) return; d.items = items; d.updatedAt = Date.now(); CLOUD.rooms.set(CLOUD.me.id, d); cloudWrite(`rooms/${CLOUD.me.id}`, d).catch(() => {}); }, 700);
    return;
  }
  if (CLOUD.ready && S.room.id === 'mine' && CLOUD.isOwner) { clearTimeout(layoutT); layoutT = setTimeout(() => writeSite({ items }).catch(() => {}), 700); return; }
  if (S.room.id.startsWith('custom-')) { CUSTOM[S.room.no] = clone(S.room); store.set('gebi3.custom', CUSTOM); } else store.set('gebi3.room.' + S.room.id, S.room.items);
}
function addFromCatalog(type) {
  const meta = ITEMS[type], sp = freeSpot(S.room.items);
  const def = { uid: type + Date.now().toString(36), type, x: sp.x, z: sp.z, rot: 0 };
  if (meta.entry) def.entry = clone(meta.entry);
  clampDef(def); S.room.items.push(def);
  const g = placeItem(def); saveLayout(); selectItem(g);
  toast(`放好了一件${meta.name}，拖动它换个位置`);
}

/* ============================================================
   Mood & music
   ============================================================ */
const MOODS = { chill: { pend: 1.25, hemi: .42, ledI: .9, neon: 1.9 }, party: { pend: .45, hemi: .26, ledI: 1.7, neon: 2.3 }, focus: { pend: .6, hemi: .68, ledI: .45, neon: 1.1 } };
function setMood(m) { if (!MOODS[m]) return; S.mood = m; toast({ chill: '灯光：微醺暖光', party: '灯光：派对彩光', focus: '灯光：专注冷光' }[m]); }
const music = { ctx: null, on: false, timer: 0, next: 0, step: 0, master: null, crackle: null };
function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function toggleMusic() {
  if (!music.on) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { toast('这个浏览器不能播放音频'); return; }
    if (!music.ctx) {
      const ctx = music.ctx = new AC();
      const master = music.master = ctx.createGain(); master.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = .4;
      const conv = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .28;
      master.connect(lp); lp.connect(ctx.destination); lp.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
      music.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = music.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    const ctx = music.ctx; ctx.resume();
    music.master.gain.cancelScheduledValues(ctx.currentTime); music.master.gain.setTargetAtTime(.5, ctx.currentTime, .4);
    const cr = ctx.createBufferSource(); cr.buffer = music.noise; cr.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; const cg = ctx.createGain(); cg.gain.value = .02; cr.connect(hp); hp.connect(cg); cg.connect(music.master); cr.start(); music.crackle = cr;
    music.on = true; music.next = ctx.currentTime + .1; music.step = 0;
    music.timer = setInterval(schedule, 30);
    toast('唱片机：lo-fi 播放中');
  } else {
    const ctx = music.ctx; music.master.gain.setTargetAtTime(0, ctx.currentTime, .25);
    clearInterval(music.timer); const cr = music.crackle; setTimeout(() => { try { cr.stop(); } catch (e) {} }, 900);
    music.on = false; toast('唱片机已停');
  }
}
const CHORDS = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 65], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]];
const ROOTS = [41, 40, 38, 36];
function schedule() {
  const ctx = music.ctx, sp = 60 / 74 / 4;
  while (music.next < ctx.currentTime + .15) {
    const t = music.next, s = music.step % 16, bar = Math.floor(music.step / 16) % 4;
    if (s === 0) { CHORDS[bar].forEach((n, i) => { for (const det of [-6, 6]) voice(t + i * .02, midi(n), det, sp * 16, .035, 'triangle'); }); }
    if (s === 0 || s === 8) voice(t, midi(ROOTS[bar]), 0, sp * 7, .16, 'sine');
    if (s === 0 || s === 7 || s === 10) kick(t);
    if (s === 4 || s === 12) noiseHit(t, 1800, .12, .09);
    if (s % 2 === 0) noiseHit(t + (s % 4 === 2 ? .02 : 0), 7000, .03, s % 4 ? .025 : .04);
    if (s === 14 && Math.random() < .5) { const n = CHORDS[bar][2 + Math.floor(Math.random() * 3)] + 12; voice(t, midi(n), 0, sp * 3, .05, 'sine'); }
    music.next += sp; music.step++;
  }
}
function voice(t, f, det, dur, vol, type) {
  const ctx = music.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = det;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(.35, dur * .2)); g.gain.setTargetAtTime(0, t + dur * .7, dur * .15);
  o.connect(g); g.connect(music.master); o.start(t); o.stop(t + dur + .6);
}
function kick(t) { const ctx = music.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); g.gain.setValueAtTime(.42, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(g); g.connect(music.master); o.start(t); o.stop(t + .32); }
function noiseHit(t, f, dur, vol) { const ctx = music.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = music.noise; fl.type = 'bandpass'; fl.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(fl); fl.connect(g); g.connect(music.master); s.start(t, Math.random() * .5); s.stop(t + dur + .02); }

/* ============================================================
   Modes, navigation, chrome
   ============================================================ */
const modesEl = $('#modes'), thumb = $('#modeThumb');
function syncChrome() {
  modesEl.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.mode === S.mode);
    if (b.dataset.mode === 'build') b.setAttribute('aria-disabled', !(S.room && S.room.mine) ? 'true' : 'false');
  });
  const on = modesEl.querySelector('[aria-pressed="true"]');
  if (on) { thumb.style.left = on.offsetLeft + 'px'; thumb.style.width = on.offsetWidth + 'px'; }
  if (S.view === 'globe') {
    syncPocketBtn();
    $('#plateNo').textContent = RESIDENTS.length;
    $('#plateName').textContent = '地球 · 隔壁社区';
    $('#plateSub').textContent = `${RESIDENTS.length} 户已入住 · 实时昼夜`;
    $('#stats').hidden = true;
    $('#hsCount').textContent = RESIDENTS.length;
    const mr = CLOUD.ready ? myResident() : RESIDENTS.find(r => r.preset === 'mine');
    $('#goMine').textContent = mr ? `回到我的房间 · ${mr.city} ${mr.no}` : `去 302 零点酒吧串门`;
    $('#roleNote').hidden = !(CLOUD.ready && !canPost());
    if (CLOUD.ready && !canPost()) $('#roleNote').innerHTML = VIEWER_NOTE;
    syncThemeBtn();
  } else if (S.room) {
    const sky = S.dyn && S.dyn.sky;
    $('#plateNo').textContent = S.room.no; $('#plateName').textContent = S.room.name;
    $('#plateSub').textContent = `${S.room.city || ''} · 房主 ${S.room.owner}${sky ? ` · 当地 ${sky.time}` : ''}${themeTag()}`;
    $('#stats').hidden = S.mode === 'build';
    const r = rng(hash(S.room.id)); const base = 60 + Math.floor(r() * 300), likes = 80 + Math.floor(r() * 400);
    const liked = !!S.liked[S.room.id];
    $('#stVisit').textContent = base; $('#stLike').textContent = likes + (liked ? 1 : 0);
    $('#likeBtn').setAttribute('aria-pressed', liked);
  }
  const rk = S.view === 'room' ? roomKey(S.room) : null, ups = myUpdates();
  $('#bell').hidden = !(CLOUD.ready && (myRoomKey() || ups.replies.length || roomMessages && CLOUD.msgs.has(CLOUD.me.id)));
  $('#bellBadge').hidden = !ups.count; $('#bellBadge').textContent = ups.count > 99 ? '99+' : ups.count;
  $('#guestsBtn').hidden = !(S.view === 'room' && iOwnRoom(rk));
  if (S.view === 'room' && CLOUD.ready && rk) { $('#stVisit').textContent = roomVisitors(rk).length; $('#stLike').parentElement.hidden = true; $('#stDemo').hidden = true; $('#stVisitLbl').textContent = '来过的人'; }
  else { $('#stLike').parentElement.hidden = false; $('#stDemo').hidden = false; $('#stVisitLbl').textContent = '今日访客'; }
  $('#buildbar').hidden = !(S.mode === 'build' && S.view === 'room');
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#ctlHint').hidden = !(S.view === 'room' && S.mode === 'visit') || touch;   // 触屏上没有键盘，不显示 WASD / F
  $('#joy').hidden = !(S.view === 'room' && S.mode === 'visit' && touch);
  $('#bbHint').textContent = touch ? '点一件放进房间 · 按住拖动挪位置 · 选中后可旋转、删除、绑定作品' : '点一件放进房间 · 拖动挪位置 · R 旋转 · Delete 删除 · 任何物件都能绑定作品';
  const cb = $('#cardBtn'); if (cb) { cb.hidden = !(S.view === 'room' && S.room && S.mode === 'visit'); cb.querySelector('span').textContent = S.room && S.room.mine ? '我的名片' : '关于房主'; }
  if (S.mode === 'build') renderPendingRow();
  renderGuide();
  syncDock();
}
function syncDock() { /* the stats dock sits under the top bar, nothing to shift */ }
async function setMode(m) {
  if (m === 'globe') return exitToGlobe();
  if (S.view !== 'room' || (S.busy && !S.room)) return;
  if (m === 'build' && !(S.room && S.room.mine)) { toast(`这是 ${S.room.owner} 的房间，只有房主能动手布置`); return; }
  if (S.mode === m || CAM.mode === 'tween') return;
  closePanel(true); closeAllWins(); bubble.hidden = true; tip.hidden = true;
  S.mode = m; S.hover = null; S.selected = null;
  if (S.selRing) S.selRing.visible = false;
  syncChrome(); refreshHotspots();
  if (m === 'build') {
    if (S.grid) S.grid.visible = true;
    renderCatalog();
    await enterBuildCam();
    toast('装修模式：从物件库添加，拖动摆放，选中后绑定作品');
  } else {
    if (S.grid) S.grid.visible = false;
    rebuildColliders(); collide(FP.pos);
    await exitBuildCam();
    refreshHotspots();
  }
}
modesEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#pClose').addEventListener('click', () => closePanel());
$('#doneBuild').addEventListener('click', () => setMode('visit'));
$('#resetRoom').addEventListener('click', () => {
  if (!S.room || !S.room.mine) return;
  const btn = $('#resetRoom');
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = '再点一次确认恢复'; setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = '恢复默认'; }, 3000); return; }
  btn.dataset.confirm = ''; btn.textContent = '恢复默认';
  const keep = { lat: S.room.lat, lon: S.room.lon, city: S.room.city, tz: S.room.tz };
  if (S.room.id === 'mine') { store.set('gebi3.room.mine', null); S.room = Object.assign(clone(ROOM_PRESETS.mine), keep, { mine: true, owner: '你' }); }
  else if (S.room.uid) { const tpl = (CLOUD.rooms.get(S.room.uid) || {}).tpl; const base = ROOM_PRESETS[tpl]; if (base) S.room.items = clone(base.items).filter(i => !i.entry || ['door'].includes(i.entry.kind)); }
  else if (CUSTOM[S.room.no]) { S.room = Object.assign(clone(CUSTOM[S.room.no]), keep); }
  closePanel(true); buildRoom(S.room); S.ceiling.visible = CAM.mode === 'fp'; saveLayout(); toast('房间已恢复');
});
$('#likeBtn').addEventListener('click', () => { if (!S.room) return; S.liked[S.room.id] = !S.liked[S.room.id]; store.set('gebi.liked', S.liked); syncChrome(); if (S.liked[S.room.id]) toast(`为 ${S.room.owner} 的房间点亮了一颗星`); });
bubble.addEventListener('click', () => { const g = findGroup('robot'); if (g) activate(g); });
function renderCatalog() {
  $('#catalog').innerHTML = Object.entries(ITEMS).filter(([, m]) => m.catalog).map(([k, m]) => `<button type="button" class="cat" data-t="${k}"><svg viewBox="0 0 40 34" aria-hidden="true">${CAT_ICON[k] || ''}</svg>${m.name}<small>${m.entry ? KIND_LABEL[m.entry.kind] : '装饰'}</small></button>`).join('');
}
$('#catalog').addEventListener('click', e => { const b = e.target.closest('.cat'); if (b) addFromCatalog(b.dataset.t); });
$('#goMine').addEventListener('click', () => { if (S.busy) return; const mr = CLOUD.ready ? myResident() : null; diveInto(mr || RESIDENTS.find(r => r.preset === 'mine')); });
$('#bell').addEventListener('click', () => openInbox());
$('#guestsBtn').addEventListener('click', () => openInbox());
$('#shareBtn').addEventListener('click', () => openShare());
$('#pickAddr').addEventListener('click', () => {
  if (S.busy) return; closePanel();
  flyGlobe(clamp(G.cam.lat, -40, 55), G.cam.lon, 2.6, 1.2);
  toast('在地球上点任意一块陆地，就能在那里入住', 3600);
  G.pickHint = true;
});


/* ============================================================
   P1 · 收藏与改编 / 主题周 / 物件流 / Bit 转达
   ============================================================ */

/* ---------- 收藏与改编 ---------- */
const CURATE_NO = ['agent', 'guestbook', 'door', 'view', 'music'];
function originHTML(e) { return e && e.from && residentOfKey(e.from.room) ? `<button type="button" class="btn ghost" data-act="author">去 ${esc(e.from.by || 'TA')} 的房间</button>` : ''; }
function curateOK(e) { return !!(e && !CURATE_NO.includes(e.kind) && S.room && !S.room.mine && S.view === 'room' && embedSource(e)); }
function curateHTML(e) {
  let h = '';
  if (curateOK(e)) h += '<button type="button" class="btn" data-act="collect">☆ 收藏到我的房间</button><button type="button" class="btn" data-act="adapt">改编一份</button>';
  return h + originHTML(e);
}
function srcCtx() {
  const r = S.room;
  return { key: roomKey(r) || ('demo:' + r.no), by: String(r.owner === '你' ? '' : (r.owner || '')).slice(0, 20) || '邻居' };
}
function curateGate() {
  if (CLOUD.ready) {
    if (!canPost()) { toast('改编需要参与者权限。可以先点“收藏”，放进你的口袋'); return false; }
    if (!myRoomKey()) { toast('改编要先有自己的房间。可以先点“收藏”放进口袋，入住后一起摆进去', 3600); return false; }
  }
  return true;
}
function mkFrom(e, ctx, adapted) {
  const chain = ((e.from && e.from.chain) || []).concat(e.from ? [{ by: e.from.by, title: e.from.title }] : []).slice(-4);
  const f = { room: ctx.key, by: ctx.by, title: String(e.title || '').slice(0, 30), at: Date.now() };
  if (adapted) f.adapted = true;
  if (chain.length) f.chain = chain;
  return f;
}
function freeSpot(items) {
  const boxes = items.filter(i => !i.wall && i.type !== 'rug' && typeof i.x === 'number').map(i => { const m = ITEMS[i.type] || {}, odd = (i.rot || 0) % 2; return { x: i.x, z: i.z, hw: ((odd ? m.d : m.w) || 1) / 2, hd: ((odd ? m.w : m.d) || 1) / 2 }; });
  for (let z = -3.3; z <= 2.5; z += .9) for (let x = -4.3; x <= 4.3; x += .9) {
    if (!boxes.some(b => Math.abs(b.x - x) < b.hw + .6 && Math.abs(b.z - z) < b.hd + .6)) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }
  return { x: 0, z: 0 };
}
function myWorkPrefix() { return CLOUD.ready ? (CLOUD.isOwner ? 'site/room302/works/' : `rooms/${CLOUD.me.id}/works/`) : 'local:'; }
async function addToMyRoom(make, dup) {
  if (S.room && S.room.mine && S.view === 'room') {
    if (dup && S.room.items.some(dup)) return 'dup';
    const def = make(S.room.items); S.room.items.push(def); placeItem(def); rebuildColliders(); refreshHotspots(); saveLayout(); return def;
  }
  if (CLOUD.ready) {
    if (CLOUD.isOwner) {
      const base = CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length ? CLOUD.site.items : ROOM_PRESETS.mine.items;
      const items = cleanItems(base, 'site/room302/works/');
      if (dup && items.some(dup)) return 'dup';
      const def = make(items); items.push(def); await writeSite({ items }); return def;
    }
    const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {}); if (!d.no) return null;
    const items = cleanItems(d.items, `rooms/${CLOUD.me.id}/works/`);
    if (dup && items.some(dup)) return 'dup';
    const def = make(items); items.push(def); d.items = items; d.updatedAt = Date.now();
    CLOUD.rooms.set(CLOUD.me.id, d); await cloudWrite(`rooms/${CLOUD.me.id}`, d); return def;
  }
  const items = loadRoom('mine').items;
  if (dup && items.some(dup)) return 'dup';
  const def = make(items); items.push(def); store.set('gebi3.room.mine', items); return def;
}
async function collectEntry(e, ctx0) {
  if (!e) return;
  const ctx = ctx0 || srcCtx();
  const copy = clone(e); copy.from = mkFrom(e, ctx, false);
  const ent = cleanEntry(copy, null); if (!ent) return;
  // 没有房间、或者只能参观的人：先放进口袋，不再挡在门外
  if (CLOUD.ready && (!canPost() || !myRoomKey())) { pocketAdd(ent, ctx); return; }
  const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: 'k' + Date.now().toString(36), type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: ent }; },
    i => i.type === 'keepsake' && i.entry && i.entry.from && i.entry.from.room === ctx.key && i.entry.title === ent.title);
  if (r === 'dup') { toast('这件已经在你的房间里了'); return; }
  if (!r) { toast('没放进去，稍后再试一次'); return; }
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '收藏 ' + String(ent.title).slice(0, 20));
  toast(`已收藏「${ent.title}」：摆在你房间的展台上，署名 ${ctx.by}`, 3600);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
async function adaptEntry(e, ctx0) {
  if (!e || !curateGate()) return;
  const ctx = ctx0 || srcCtx();
  const type = ({ game2: 'arcade', game: 'arcade', repo: 'whiteboard' })[e.kind] || 'kiosk';
  const copy = clone(e); copy.from = mkFrom(e, ctx, true);
  if (copy.kind === 'shiguang') copy.kind = 'app';
  if (e.work) {
    const html = await loadWork(e.work);
    if (html) {
      const path = myWorkPrefix() + 'w' + Date.now().toString(36);
      try { await saveWork(path, e.title || '作品', html); copy.work = path; copy.workBytes = new Blob([html]).size; } catch (x) { delete copy.work; delete copy.workBytes; }
    } else { delete copy.work; delete copy.workBytes; }
  }
  const ent = cleanEntry(copy, myWorkPrefix()); if (!ent) return;
  if (copy.work && copy.work.startsWith('local:')) { ent.work = copy.work; ent.workBytes = copy.workBytes; }
  const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: type + Date.now().toString(36), type, x: sp.x, z: sp.z, rot: 0, entry: ent }; });
  if (!r) { toast('没放进去，稍后再试一次'); return; }
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '改编 ' + String(ent.title).slice(0, 20));
  toast(`已把「${ent.title}」复制进你的房间：去装修模式里换色、改名、绑定你自己的地址。署名会一直保留`, 4800);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
function goOrigin(e) {
  const r = e && e.from && residentOfKey(e.from.room);
  if (!r) { toast('原作者的房间暂时找不到'); return; }
  closePanel(true); closeAllWins();
  if (S.view === 'room') goRoomFromRoom(r); else diveInto(r);
}

/* ---------- 主题周 ---------- */
const THEMES = [
  { t: '理想中的深夜小店', b: '把你的房间布置成理想中的深夜小店：几点开门，卖什么，谁会在凌晨推门进来？作品就是小店的招牌商品。', c: '#ffb454' },
  { t: '十平米的创作角落', b: '只给自己十平米：你会放下什么，留下什么？让作品从桌面一角长出来。', c: '#62e6ff' },
  { t: '屋顶上的小游戏厅', b: '把房间改成一间只有三台机器的小游戏厅，每台机器一个你最想让人试玩的作品。', c: '#ff5aa8' },
  { t: '下雨天的图书馆', b: '雨声、台灯、书架：布置一间适合慢慢读、慢慢写代码的房间。', c: '#9d8cff' },
  { t: '给陌生人的一间客房', b: '假设明天有位陌生的开发者要来借住：你想让他先看到哪三样东西？', c: '#7ee0a1' }
];
// 主题周统一按北京时间（UTC+8）切换：周一 00:00 开始，周日 24:00 结束，全世界同一个时刻
const THEME_TZ = 8, THEME_REF = Date.UTC(2026, 9, 19) - THEME_TZ * 3600e3;
function themeFor(idx) { const n = THEMES.length, t = THEMES[((idx % n) + n) % n]; return { id: 'w' + idx, idx, title: t.t, brief: t.b, c: t.c }; }
function curTheme() {
  const now = Date.now(), idx = Math.floor((now - THEME_REF) / (7 * 864e5));
  const th = themeFor(idx);
  th.start = new Date(THEME_REF + idx * 7 * 864e5); th.end = new Date(THEME_REF + (idx + 1) * 7 * 864e5);
  th.left = Math.max(1, Math.ceil((th.end - now) / 864e5));
  return th;
}
function themeEndText(th) {
  const e = th.end, local = `${e.getMonth() + 1}月${e.getDate()}日 ${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  const off = -new Date().getTimezoneOffset() / 60;
  return off === THEME_TZ ? '北京时间周日 24:00 结束并归档' : `北京时间周日 24:00 结束 · 你的时间 ${local}`;
}
const TH = { cur: curTheme(), on: false, local: store.get('gebi.tw', []) };
const DEMO_TW_NOW = ['204', '303', '101', '106', '108', '110', '202'], DEMO_TW_PAST = ['204', '101', '301', '202', '105'];
function cleanTw(v) { return typeof v === 'string' && /^w-?\d{1,4}$/.test(v) ? v : ''; }
function cleanTwLog(l) { return (Array.isArray(l) ? l : []).slice(-12).filter(x => x && cleanTw(x.id)).map(x => ({ id: x.id, t: String(x.t || '').slice(0, 24), at: +x.at || 0 })); }
function twMerge(list, entry) { return cleanTwLog((list || []).filter(x => x.id !== entry.id).concat(entry)); }
function themeLogOf(r) {
  if (r.real) return r.twLog || [];
  if (r.preset === 'mine') return cleanTwLog(CLOUD.ready ? (CLOUD.site && CLOUD.site.twLog) : TH.local);
  if (r.custom || r.state === 'reno') return [];
  const out = [], now = TH.cur, prev = themeFor(now.idx - 1);
  if (DEMO_TW_NOW.includes(r.no)) out.push({ id: now.id, t: now.title });
  if (DEMO_TW_PAST.includes(r.no)) out.push({ id: prev.id, t: prev.title });
  return out;
}
function inTheme(r, id) { return themeLogOf(r).some(x => x.id === id); }
function themeMembers(id) { return RESIDENTS.filter(r => inTheme(r, id)); }
function myThemeResident() { return CLOUD.ready ? myResident() : RESIDENTS.find(r => r.preset === 'mine'); }
function themeTag() { return S.resident && inTheme(S.resident, TH.cur.id) ? ' · 主题周' : ''; }
function themeArchive() {
  const m = new Map();
  RESIDENTS.forEach(r => themeLogOf(r).forEach(x => { if (x.id === TH.cur.id) return; const e = m.get(x.id) || { id: x.id, t: x.t, rs: [] }; e.rs.push(r); m.set(x.id, e); }));
  return [...m.values()].sort((a, b) => parseInt(b.id.slice(1)) - parseInt(a.id.slice(1)));
}
function applyThemeMap() {
  if (!G.ready) return;
  const col = new THREE.Color(TH.cur.c);
  G.pins.forEach(p => {
    if (!p.base) p.base = { head: p.head.material.color.clone(), scale: p.head.scale.x, beam: p.beamMat.uniforms.col.value.clone(), ring: p.ringMat.color.clone() };
    const mem = TH.on && inTheme(p.r, TH.cur.id);
    p.themed = mem; p.dim = TH.on && !mem;
    p.head.material.color.copy(mem ? col.clone().multiplyScalar(3) : p.base.head);
    p.head.scale.setScalar(mem ? .12 : p.dim ? p.base.scale * .7 : p.base.scale);
    p.beamMat.uniforms.col.value.copy(mem ? col.clone().multiplyScalar(2.6) : p.dim ? p.base.beam.clone().multiplyScalar(.25) : p.base.beam);
    p.ringMat.color.copy(mem ? col.clone().multiplyScalar(2) : p.dim ? p.base.ring.clone().multiplyScalar(.3) : p.base.ring);
  });
}
function syncThemeBtn() {
  const b = $('#themeBtn'); if (!b) return;
  TH.cur = Object.assign(TH.cur, curTheme());
  const n = themeMembers(TH.cur.id).length;
  b.querySelector('.th-t').textContent = TH.cur.title;
  b.querySelector('.th-n').textContent = `${n} 间亮灯 · 还剩 ${TH.cur.left} 天`;
  b.style.setProperty('--tc', TH.cur.c);
  b.setAttribute('aria-pressed', TH.on);
}
async function joinTheme() {
  const th = TH.cur, entry = { id: th.id, t: th.title, at: Date.now() };
  if (CLOUD.ready) {
    if (!canPost()) { toast('你现在只能参观：参加主题周需要房主把你设为“参与者”'); return; }
    if (CLOUD.isOwner) await writeSite({ tw: th.id, twLog: twMerge(CLOUD.site && CLOUD.site.twLog, entry) });
    else {
      const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {});
      if (!d.no) { toast('先在地球上选址入住，再来参加'); return; }
      d.tw = th.id; d.twLog = twMerge(d.twLog, entry); d.updatedAt = Date.now();
      CLOUD.rooms.set(CLOUD.me.id, d); await cloudWrite(`rooms/${CLOUD.me.id}`, d); syncRealResidents();
    }
  } else { TH.local = twMerge(TH.local, entry); store.set('gebi.tw', TH.local); }
  toast(`你的房间已为「${th.title}」亮灯`, 3200);
  applyThemeMap(); syncThemeBtn(); if (S.panel && S.panel.kind === 'theme') openThemePanel(true);
}
function openThemePanel(keep) {
  const th = TH.cur = Object.assign(TH.cur, curTheme());
  if (S.panel && !keep) closePanel(true);
  S.panel = { kind: 'theme' }; G.shiftGoal = isNarrow() ? 0 : -200;
  const mem = themeMembers(th.id), mr = myThemeResident(), joined = !!(mr && inTheme(mr, th.id));
  const li = r => { const i = residentInfo(r); return `<li><button type="button" class="nb" data-no="${esc(r.no)}"><i style="--c:${residentColor(r)}"></i>${esc(i.mine && !i.custom ? '你的房间' : i.handle)}<span>${esc(i.city)} · ${esc(i.name || '')}</span></button></li>`; };
  const arch = themeArchive();
  setPanel(`主题周 · 第 ${th.idx + 1} 期`, th.title, `
    <p class="u-mb3 u-loose">${esc(th.brief)}</p>
    <div class="th-meta"><span class="tag theme" style="--tc:${th.c}">还剩 ${th.left} 天</span><span class="tag dim">${esc(themeEndText(th))}</span></div>
    <div class="divider"></div>
    <p class="section-t">已亮灯的房间 · ${mem.length}</p>
    ${mem.length ? `<ul class="nblist">${mem.map(li).join('')}</ul>` : '<p class="mute small u-m0">还没有人参加，做第一个。</p>'}
    <p class="mute small u-mt3">亮灯的房间会在地球上变成主题色，其余的暗下去。其中一部分是演示数据。</p>
    ${arch.length ? `<div class="divider"></div><p class="section-t">往期归档</p><ul class="th-arch">${arch.map(a => `<li><b>${esc(a.t)}</b><span>${a.rs.length} 间房 · ${a.rs.slice(0, 3).map(r => esc(residentInfo(r).handle)).join('、')}${a.rs.length > 3 ? ' 等' : ''}</span></li>`).join('')}</ul>` : ''}`,
    `${joined ? `<button type="button" class="btn primary" id="thGo">去我的房间布置</button>` : `<button type="button" class="btn primary" id="thJoin">让我的房间亮灯参加</button>`}<button type="button" class="btn ghost" id="thOff">${TH.on ? '关闭主题地图' : '打开主题地图'}</button>`);
  pBody.querySelectorAll('.nb').forEach(x => x.addEventListener('click', () => { const o = RESIDENTS.find(y => y.no === x.dataset.no); if (o) openResident(o); }));
  const j = $('#thJoin'); if (j) j.addEventListener('click', joinTheme);
  const go = $('#thGo'); if (go) go.addEventListener('click', () => { if (mr) diveInto(mr); });
  $('#thOff').addEventListener('click', () => { TH.on = !TH.on; applyThemeMap(); syncThemeBtn(); openThemePanel(true); });
}
function toggleTheme() {
  if (S.busy) return;
  if (S.panel && S.panel.kind === 'theme' && TH.on) { TH.on = false; applyThemeMap(); syncThemeBtn(); closePanel(); return; }
  TH.on = true; applyThemeMap(); syncThemeBtn(); openThemePanel();
}

/* ---------- 物件流 ---------- */
const OF = { el: null, filter: 'all', open: false };
const OF_FILTERS = [['all', '全部'], ['game', '小游戏'], ['tool', '工具'], ['web', '网页'], ['repo', '开源'], ['theme', '本周主题']];
const OF_KIND = { game: ['game', 'game2'], tool: ['app', 'shiguang'], web: ['web', 'link'], repo: ['repo'] };
function flatEntries(items) {
  const out = [];
  (items || []).forEach(i => {
    if (i.entry && !CURATE_NO.includes(i.entry.kind)) out.push(i.entry);
    if (i.children) Object.values(i.children).forEach(c => { if (c && c.entry && !CURATE_NO.includes(c.entry.kind)) out.push(c.entry); });
  });
  return out;
}
const R302_ENTRIES = [{ kind: 'shiguang', title: '拾光', desc: '房主做的待办与便签 App：网页版、Windows 桌面版和浏览器扩展' }, { kind: 'game', title: '霓虹贪吃蛇', desc: '房主自己写的网页小游戏，屏幕里一直在自动演示' }];
function collectFeed() {
  const out = [];
  RESIDENTS.forEach(r => {
    if (r.state === 'reno') return;
    const info = residentInfo(r);
    let list = [], key = keyOfResident(r) || (r.preset || r.custom ? null : null);
    if (r.real) list = flatEntries(cleanItems((CLOUD.rooms.get(r.key) || {}).items, `rooms/${r.key}/works/`));
    else if (r.preset === 'mine') {
      const items = CLOUD.ready && CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length ? cleanItems(CLOUD.site.items, 'site/room302/works/') : ROOM_PRESETS.mine.items;
      const own = flatEntries(items), titles = new Set(own.map(x => x.title));
      list = R302_ENTRIES.filter(x => !own.some(o => o.kind === x.kind)).concat(own).filter((x, i, a) => a.findIndex(y => y.title === x.title) === i);
    }
    else if (r.preset) list = flatEntries(ROOM_PRESETS[r.preset].items);
    else if (r.custom && CUSTOM[r.no]) list = flatEntries(CUSTOM[r.no].items);
    else if (r.works) list = r.works.map(w => ({ kind: w[1], title: w[0], desc: r.tagline || '' }));
    const doc = r.real ? (CLOUD.rooms.get(r.key) || {}) : {}, fresh = r.real && Date.now() - (+doc.createdAt || 0) < 7 * 864e5;
    list.forEach(e => out.push({ r, key: key || ('demo:' + r.no), e, handle: info.mine && !info.custom ? '你' : info.handle, city: info.city, demo: !!info.demo, real: !!r.real || r.preset === 'mine', mine: !!info.mine, at: r.real ? (+doc.updatedAt || 0) : 0, theme: inTheme(r, TH.cur.id), playable: !!embedSource(e), fresh }));
  });
  // 能玩的排前面；新邻居（7 天内入住）能玩的作品再往前；还没上传的真实作品沉底
  const rank = it => (it.real && !it.playable ? 2 : 0) - (it.fresh && it.playable ? 1 : 0);
  return out.sort((a, b) => (rank(a) - rank(b)) || (b.at - a.at) || (hash(a.e.title + a.key) % 97) - (hash(b.e.title + b.key) % 97));
}
function ofPass(it) {
  if (OF.filter === 'all') return true;
  if (OF.filter === 'theme') return it.theme;
  return (OF_KIND[OF.filter] || []).includes(it.e.kind);
}
function ensureObjFeed() {
  if (OF.el) return;
  const el = document.createElement('section'); el.className = 'of'; el.id = 'of'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '物件流');
  el.innerHTML = `<header class="of-h"><div><div class="eyebrow">物件流</div><h2>十秒看懂的作品</h2><p>房间是目的地，物件流是街道。点“试玩”直接上手，喜欢就收藏进自己的房间，也可以当场给作者留一句话。</p></div><button type="button" class="icon-btn" id="ofClose" aria-label="关闭物件流"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></header>
    <div class="of-f" id="ofFilters" role="tablist"></div><div class="of-grid" id="ofGrid"></div>`;
  document.body.appendChild(el); OF.el = el;
  $('#ofClose').addEventListener('click', closeObjFeed);
  $('#ofFilters').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; OF.filter = b.dataset.f; renderObjFeed(); });
  $('#ofGrid').addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const card = b.closest('.oc'), it = OF.items[+card.dataset.i]; if (!it) return;
    const a = b.dataset.a;
    if (a === 'play') openQuickPlay(it);
    else if (a === 'go') { closeObjFeed(); if (!S.busy) { S.via = 'feed'; diveInto(it.r); } }
    else if (a === 'collect') collectEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
    else if (a === 'adapt') adaptEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
    else if (a === 'say') { const f = card.querySelector('.oc-say'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); }
  });
  $('#ofGrid').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target.closest('.oc-say'), card = f.closest('.oc'), it = OF.items[+card.dataset.i];
    const inp = f.querySelector('input'), t = inp.value.trim(); if (!t || !it) return;
    inp.value = ''; if (await postMessage(it.key, t)) { recordVisit(it.key, '留言'); toast(`已留言给 ${it.handle}，TA 回复后你会在“动态”里看到`); f.hidden = true; }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (QP.el && !QP.el.hidden) closeQuickPlay(); else if (OF.el && !OF.el.hidden) closeObjFeed(); } });
}
function renderObjFeed() {
  const all = collectFeed(); OF.items = all.filter(ofPass);
  $('#ofFilters').innerHTML = OF_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" role="tab" aria-selected="${OF.filter === k}">${l}${k === 'theme' ? ` · ${all.filter(x => x.theme).length}` : ''}</button>`).join('');
  const grid = $('#ofGrid'); grid.innerHTML = '';
  if (!OF.items.length) { grid.innerHTML = '<p class="mute u-span-all u-center u-pad-xl">这个分类下暂时没有作品。</p>'; return; }
  OF.items.forEach((it, i) => {
    const card = document.createElement('article'); card.className = 'oc'; card.dataset.i = i;
    const cv = kioskCanvas(it.e, 384, 232); cv.className = 'oc-cover'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', it.e.title || '作品'); card.appendChild(cv);
    const canSay = CLOUD.ready && it.real && canPost() && !it.mine;
    const waiting = it.real && !it.playable, canCurate = !it.mine && it.playable;
    if (waiting) card.classList.add('waiting');
    card.insertAdjacentHTML('beforeend', `<div class="oc-b"><div class="oc-t"><b>${esc(it.e.title || '未命名')}</b><span class="tag ${/game/.test(it.e.kind) ? 'pink' : ''}">${esc(KIND_LABEL[it.e.kind] || '作品')}</span></div>
      <p>${esc(waiting ? '作者还没上传这件作品，先去 TA 的房间看看别的。' : it.e.desc || '房主还没写介绍')}</p>
      <div class="oc-m"><i style="--c:${residentColor(it.r)}"></i><span>${esc(it.handle)} · ${esc(it.city || '')}</span>${it.fresh ? '<span class="tag ok">新邻居</span>' : ''}${it.theme ? '<span class="tag">本周主题</span>' : ''}${it.e.from ? `<span class="tag pink">${it.e.from.adapted ? '改编' : '收藏'}自 ${esc(it.e.from.by || '邻居')}</span>` : ''}${it.demo ? '<span class="tag dim">演示</span>' : ''}${waiting ? '<span class="tag dim">等作者上传</span>' : ''}</div>
      <div class="oc-a">${waiting ? '' : '<button type="button" class="btn sm primary" data-a="play">试玩</button>'}<button type="button" class="btn sm${waiting ? ' primary' : ''}" data-a="go">进房间</button>${canCurate ? '<button type="button" class="btn sm" data-a="collect">☆ 收藏</button><button type="button" class="btn sm ghost" data-a="adapt">改编</button>' : ''}${canSay ? '<button type="button" class="btn sm ghost" data-a="say">说一句</button>' : ''}</div>
      ${canSay ? '<form class="oc-say" hidden><input class="input" maxlength="120" placeholder="给作者留一句话，TA 会在动态里看到" aria-label="给作者留言"><button class="btn sm primary" type="submit">发送</button></form>' : ''}</div>`);
    grid.appendChild(card);
  });
}
function openObjFeed() {
  ensureObjFeed(); if (S.busy) return;
  closePanel(true); OF.el.hidden = false; OF.el.scrollTop = 0; document.body.classList.add('of-open');
  renderObjFeed(); setTimeout(() => $('#ofClose').focus({ preventScroll: true }), 50);
}
function closeObjFeed() { if (!OF.el) return; closeQuickPlay(); OF.el.hidden = true; document.body.classList.remove('of-open'); }

/* quick play: try a work without walking into the room */
const QP = { el: null, it: null };
function placeholderDoc(e) {
  const kc = KIND_COLOR[e.kind] || KIND_COLOR.link;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,${kc[0]},${kc[1]});color:#fff;font:600 22px system-ui;text-align:center;overflow:hidden;touch-action:none"><canvas id="c" style="position:fixed;inset:0"></canvas><div style="position:relative;pointer-events:none;padding:0 24px"><div>${esc(e.title || '作品')}</div><div style="font:400 13px system-ui;opacity:.85;margin-top:8px">演示房间里的占位作品 · 点画面放烟花</div></div><script>var c=document.getElementById('c'),x=c.getContext('2d'),P=[];function R(){c.width=innerWidth;c.height=innerHeight}R();onresize=R;onpointerdown=function(e){for(var i=0;i<26;i++){var a=Math.random()*6.283,s=1+Math.random()*4;P.push({x:e.clientX,y:e.clientY,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1})}};(function L(){x.clearRect(0,0,c.width,c.height);P=P.filter(function(p){return p.l>0});P.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=.06;p.l-=.014;x.fillStyle='rgba(255,255,255,'+p.l+')';x.beginPath();x.arc(p.x,p.y,3*p.l+1,0,6.283);x.fill()});requestAnimationFrame(L)})()<\/script>`;
}
function ensureQP() {
  if (QP.el) return;
  const el = document.createElement('section'); el.className = 'qp'; el.hidden = true; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="qp-box"><header class="qp-bar"><div class="qp-t"><b></b><span></span></div><div class="qp-act"><button type="button" class="win-get" data-q="collect">☆ 收藏</button><button type="button" class="win-get" data-q="go">进房间</button><a class="wbtn" data-q="tab" target="_blank" rel="noopener noreferrer" hidden aria-label="在新标签页打开">${ICON.ext}</a><button type="button" class="wbtn x" data-q="close" aria-label="关闭">${WICON.x}</button></div></header><div class="qp-body"></div></div>`;
  document.body.appendChild(el); QP.el = el;
  el.addEventListener('click', ev => {
    if (ev.target === el) return closeQuickPlay();
    const b = ev.target.closest('[data-q]'); if (!b || !QP.it) return; const it = QP.it;
    if (b.dataset.q === 'close') closeQuickPlay();
    else if (b.dataset.q === 'go') { if (!it.r) { toast('作者的房间暂时找不到'); return; } closeQuickPlay(); closeObjFeed(); closePanel(true); if (S.busy) return; S.via = 'feed'; if (S.view === 'room') goRoomFromRoom(it.r); else diveInto(it.r); }
    else if (b.dataset.q === 'collect') collectEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
  });
}
async function openQuickPlay(it) {
  ensureQP(); const e = it.e; QP.it = it;
  const body = QP.el.querySelector('.qp-body'); body.innerHTML = '';
  QP.el.querySelector('.qp-t b').textContent = e.title || '作品';
  const real = embedSource(e);
  if (!real && it.real) {
    // 真实住户还没上传：不放占位动画，直接说清楚
    QP.el.querySelector('.qp-t span').textContent = `${it.handle} · ${it.city || ''} · 等作者上传`;
    QP.el.querySelector('[data-q="tab"]').hidden = true; QP.el.querySelector('[data-q="collect"]').hidden = true;
    body.innerHTML = `<div class="empty"><b>作者还没上传「${esc(e.title || '这件作品')}」</b><p>房间里已经给它留了位置。去 ${esc(it.handle)} 的房间看看别的作品，或者给 TA 留一句话催一催。</p></div>`;
    QP.el.hidden = false; return;
  }
  const src = real || { srcdoc: placeholderDoc(e), external: false, demo: true };
  QP.el.querySelector('.qp-t span').textContent = `${it.handle} · ${it.city || ''}${src.demo ? ' · 演示房间的占位作品' : src.hosted ? ' · 隔壁托管' : ''}`;
  const tab = QP.el.querySelector('[data-q="tab"]'); tab.hidden = !src.external; if (src.external) tab.href = src.src;
  QP.el.querySelector('[data-q="collect"]').hidden = !!it.mine || !!src.demo;
  const f = document.createElement('iframe'); f.title = e.title || '作品';
  f.setAttribute('sandbox', src.external ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock' : 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups');
  f.setAttribute('allow', 'fullscreen; gamepad; clipboard-write; autoplay'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  body.appendChild(f); QP.el.hidden = false;
  if (src.hosted) { const html = await loadWork(src.hosted); if (QP.it !== it) return; if (!html) { body.innerHTML = '<p class="mute u-center u-pad-xl">作品文件没找到，房主可能刚刚移除了它。</p>'; return; } f.srcdoc = html; }
  else if (src.srcdoc) f.srcdoc = src.srcdoc; else f.src = src.src;
  if (it.real && !it.key.startsWith('demo:')) recordVisit(it.key, '试玩 ' + String(e.title || '').slice(0, 20));
}
$('#themeBtn').addEventListener('click', toggleTheme);
$('#openObjFeed').addEventListener('click', openObjFeed);
function closeQuickPlay() { if (!QP.el || QP.el.hidden) return; QP.el.hidden = true; QP.it = null; QP.el.querySelector('.qp-body').innerHTML = ''; }

/* ---------- Bit：接待与转达 ---------- */
function relayKey() { return S.room ? roomKey(S.room) : null; }
async function relaySend(kind, text, when) {
  const key = relayKey(); if (!key) return false;
  if (CLOUD.ready) {
    if (!canPost()) { toast('你现在只能参观：留言需要房主把你设为“参与者”'); return false; }
    const ok = await postMessage(key, text, null, kind === 'appt' ? { kind: 'appt', when } : null);
    if (ok) recordVisit(key, kind === 'appt' ? '预约' : '留言');
    return ok;
  }
  GB.unshift({ name: '访客', text: (kind === 'appt' ? `【预约 ${when || '时间待定'}】` : '') + text, time: '刚刚' }); if (GB.length > 20) GB.pop();
  store.set('gebi.guestbook', GB); drawChalk(); return true;
}
async function relayNudge() {
  const key = relayKey(); if (!key || !CLOUD.ready) return 'offline';
  if (!canPost()) return 'readonly';
  const me = CLOUD.me.id, mine = roomMessages(key).filter(m => m.author === me && !m.reply && !hasReply(key, m)).pop();
  if (!mine) return 'none';
  if (mine.nudge && Date.now() - mine.nudge < 6 * 3600e3) return 'cool';
  const d = clone(CLOUD.msgs.get(me) || {}), m = (d.list || []).find(x => x.id === mine.id); if (!m) return 'none';
  m.nudge = Date.now(); d.updatedAt = Date.now(); CLOUD.msgs.set(me, d); onMsgs();
  try { await cloudWrite(`msgs/${me}`, d); return 'ok'; } catch (e) { return 'fail'; }
}
function hasUnrepliedOfMine() { const key = relayKey(); if (!key || !CLOUD.ready) return false; const me = CLOUD.me.id; return roomMessages(key).some(m => m.author === me && !m.reply && !hasReply(key, m)); }
function relayLog(text) { S.chat.log.push({ role: 'act', text }); renderChat(); }
function openRelay(mode) { S.relayMode = mode; renderRelay(); }
function renderRelay() {
  const box = $('#relay'); if (!box) return;
  const key = relayKey(), owner = CLOUD.ready && iOwnRoom(key);
  if (owner) {
    const n = CLOUD.ready ? pendingFor(key).length : 0;
    box.innerHTML = n ? `<div class="rl-owner"><b>${n} 条留言等你回复</b><span>访客在等，Bit 只转达，回复得你自己来。</span><button type="button" class="btn sm primary" id="rlInbox">去访客簿回复</button></div>` : '';
    const b = $('#rlInbox'); if (b) b.addEventListener('click', () => openInbox());
    return;
  }
  const mode = S.relayMode;
  if (!mode) {
    box.innerHTML = `<div class="rl-bar"><span>我只负责接待和转达</span><div><button type="button" class="btn sm" data-r="msg">给老板留言</button><button type="button" class="btn sm" data-r="appt">约个时间</button>${hasUnrepliedOfMine() ? '<button type="button" class="btn sm ghost" data-r="nudge">提醒老板回复</button>' : ''}</div></div>`;
  } else {
    box.innerHTML = `<form class="rl-form" id="rlForm"><label for="rlText">${mode === 'appt' ? '想和老板聊什么？' : '想对老板说什么？'}</label>
      ${mode === 'appt' ? '<div class="rl-when" id="rlWhen">' + ['今晚', '这周内', '下周', '随时都行'].map((w, i) => `<button type="button" data-w="${w}" aria-pressed="${i === 0}">${w}</button>`).join('') + '</div>' : ''}
      <textarea class="input" id="rlText" maxlength="120" rows="2" placeholder="${mode === 'appt' ? '一句话说清楚事由，比如：想聊聊你的拾光怎么做桌面托盘' : '我原话贴到黑板上，老板回复后你会在“动态”里看到'}"></textarea>
      <div class="rl-act"><button type="submit" class="btn sm primary">${mode === 'appt' ? '帮我约' : '帮我转达'}</button><button type="button" class="btn sm ghost" data-r="cancel">算了</button></div></form>`;
  }
  box.onclick = async ev => {
    const b = ev.target.closest('[data-r],[data-w]'); if (!b) return;
    if (b.dataset.w) { box.querySelectorAll('[data-w]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    const r = b.dataset.r;
    if (r === 'cancel') { S.relayMode = null; renderRelay(); }
    else if (r === 'msg' || r === 'appt') openRelay(r);
    else if (r === 'nudge') {
      const res = await relayNudge();
      const msg = { ok: '已提醒老板：你的留言还在等回复', cool: '刚催过，老板看到了。过几个小时再来', none: '没有等回复的留言可催', readonly: '你现在只能参观，不能催', offline: '离线演示里没法催', fail: '没催成功，稍后再试' }[res];
      relayLog(msg); renderRelay();
    }
  };
  const f = $('#rlForm'); if (f) { f.onsubmit = async ev => {
    ev.preventDefault(); const t = $('#rlText').value.trim(); if (!t) { $('#rlText').focus(); return; }
    const w = mode === 'appt' ? ((box.querySelector('[data-w][aria-pressed="true"]') || {}).dataset || {}).w || '时间待定' : '';
    const ok = await relaySend(mode, t, w);
    if (ok) { S.relayMode = null; relayLog(mode === 'appt' ? `已转达：想约老板「${w}」聊一聊，贴在了黑板上` : '已转达：你的话贴到了后墙黑板'); const m = { role: 'bit', text: mode === 'appt' ? '约好啦，我把时间和事由贴给老板了。他看到会回复你，别忘了回来看“动态”。' : '收到，已经贴到黑板上。老板回复后你会在“动态”里看到。' }; S.chat.log.push(m); renderChat(); renderRelay(); }
  }; setTimeout(() => { const i = $('#rlText'); if (i && !isNarrow()) i.focus({ preventScroll: true }); }, 30); }
}


/* ============================================================
   v6 · 体验修复（来自模拟用户体验报告）
   口袋 / 房间名片 / 待上传清单 / SDK 说明 / 冷启动 / 来源统计
   ============================================================ */

/* ---------- 口袋：没有房间、只能参观的人也能收藏 ---------- */
const POCKET = { items: store.get('gebi.pocket', []), cloud: false };
const POCKET_MAX = 40;
function pocketList() { return POCKET.items; }
function pocketPath() { return CLOUD.ready ? `data/users/${CLOUD.me.id}/pocket` : null; }
function cleanPocket(list) {
  return (Array.isArray(list) ? list : []).slice(-POCKET_MAX).map(p => {
    if (!p || typeof p !== 'object' || typeof p.key !== 'string' || !KEY_RE.test(p.key)) return null;
    const e = cleanEntry(p.e, null); if (!e) return null;
    return { e, key: p.key, by: String(p.by || '').slice(0, 20), at: +p.at || 0 };
  }).filter(Boolean);
}
async function loadPocket() {
  POCKET.items = cleanPocket(store.get('gebi.pocket', []));
  if (!CLOUD.ready || !canPost()) { syncPocketBtn(); return; }
  try {
    const s = await CLOUD.db.doc(pocketPath()).get();
    const remote = s.exists ? cleanPocket(s.data().items) : [];
    const merged = remote.concat(POCKET.items.filter(p => !remote.some(q => q.key === p.key && q.e.title === p.e.title)));
    POCKET.items = merged.slice(-POCKET_MAX); POCKET.cloud = true;
    if (merged.length !== remote.length) { await CLOUD.db.doc(pocketPath()).set({ items: POCKET.items, updatedAt: Date.now() }); }
    store.set('gebi.pocket', []);
  } catch (e) { /* 读不到就只用本机的口袋 */ }
  syncPocketBtn();
}
function savePocket() {
  if (POCKET.cloud && CLOUD.ready && canPost()) cloudWrite(pocketPath(), { items: POCKET.items, updatedAt: Date.now() }).catch(() => {});
  else store.set('gebi.pocket', POCKET.items);
  syncPocketBtn();
}
function pocketAdd(ent, ctx) {
  if (POCKET.items.some(p => p.key === ctx.key && p.e.title === ent.title)) { toast('这件已经在你的口袋里了'); return; }
  POCKET.items.push({ e: ent, key: ctx.key, by: ctx.by, at: Date.now() });
  if (POCKET.items.length > POCKET_MAX) POCKET.items.shift();
  savePocket();
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '收藏 ' + String(ent.title).slice(0, 20));
  const where = POCKET.cloud ? '' : '（只存在这台设备上）';
  toast(canPost() ? `已放进口袋${where}：现在 ${POCKET.items.length} 件。入住后可以一键摆进房间` : `已放进这台设备上的口袋，现在 ${POCKET.items.length} 件`, 3800);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
function pocketClear() { POCKET.items = []; savePocket(); }
function syncPocketBtn() {
  const b = $('#pocketBtn'); if (!b) return;
  const n = POCKET.items.length; b.hidden = !n; b.querySelector('span').textContent = `口袋 · ${n}`;
}
function pocketIt(p) {
  const r = residentOfKey(p.key);
  return { r, key: p.key, e: p.e, handle: p.by || '邻居', city: r ? residentInfo(r).city : '', real: !p.key.startsWith('demo:'), mine: true, playable: !!embedSource(p.e) };
}
function openPocket() {
  if (S.panel) closePanel(true);
  S.panel = { kind: 'pocket' }; if (S.view === 'globe') G.shiftGoal = isNarrow() ? 0 : -200;
  const list = POCKET.items, room = CLOUD.ready ? myRoomKey() : null;
  const rows = list.slice().reverse().map((p, i) => `<li class="pk"><div class="grow"><b>${esc(p.e.title || '作品')}</b><small>${esc(p.by || '邻居')} · ${esc(KIND_LABEL[p.e.kind] || '作品')} · ${esc(ago(p.at))}</small></div><div class="pk-a">${embedSource(p.e) ? `<button type="button" class="btn sm" data-p="play" data-i="${list.length - 1 - i}">试玩</button>` : ''}<button type="button" class="btn sm ghost" data-p="del" data-i="${list.length - 1 - i}" aria-label="从口袋移除">移除</button></div></li>`).join('');
  const foot = !list.length ? '' : room && canPost() ? `<button type="button" class="btn primary" id="pkPlace">全部摆进我的房间</button>` : canPost() ? `<button type="button" class="btn primary" id="pkPick">选址入住，把它们摆进去</button>` : '';
  setPanel('我的口袋', `收藏了 ${list.length} 件`, `
    <p class="mute small u-mb4">${POCKET.cloud ? '口袋跟着你的账号走，换设备也在。' : '口袋现在只存在这台设备上。'}${room ? '' : '有了房间以后，可以一键把它们摆成展台。'}</p>
    ${list.length ? `<ul class="pk-list">${rows}</ul>` : '<p class="mute">口袋是空的。在别人的房间或物件流里点“☆ 收藏”，作品会先放进这里。</p>'}
    ${CLOUD.ready && !canPost() ? `<div class="callout u-mt4">${VIEWER_NOTE}</div>` : ''}`, foot);
  pBody.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const p = POCKET.items[+b.dataset.i]; if (!p) return;
    if (b.dataset.p === 'del') { POCKET.items.splice(+b.dataset.i, 1); savePocket(); openPocket(); }
    else openQuickPlay(pocketIt(p));
  }));
  const pl = $('#pkPlace'); if (pl) pl.addEventListener('click', async () => {
    pl.disabled = true; let n = 0;
    for (const p of POCKET.items.slice()) {
      const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: 'k' + Date.now().toString(36) + n, type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: p.e }; },
        i => i.type === 'keepsake' && i.entry && i.entry.from && i.entry.from.room === p.key && i.entry.title === p.e.title);
      if (r) n++;
    }
    pocketClear(); closePanel(); toast(`摆好了 ${n} 件展台，署名都保留着`, 3200);
  });
  const pk = $('#pkPick'); if (pk) pk.addEventListener('click', () => { closePanel(); if (S.view === 'room') exitToGlobe().then(() => $('#pickAddr').click()); else $('#pickAddr').click(); });
}

/* ---------- 查看者与分享：说清楚谁能做什么 ---------- */
const VIEWER_NOTE = '你现在是<b>查看者</b>：能逛、能试玩，收藏会放进这台设备上的口袋。留言、入住和留下来访记录需要“参与者”权限，可以请把链接发给你的人帮你开通。';
function shareAccessHTML() {
  if (!CLOUD.ready) return '<div class="callout">离线原型：这个链接只在线上版本里有效。</div>';
  if (CLOUD.isOwner) return `<div class="callout"><b>谁能打开这个链接</b>由页面右上角的分享菜单决定。建议把同组织的成员设为“可参与”：他们能留言、收藏，来访也会被记录。组织外的人用公开链接打开时只能参观：能逛、能试玩，收藏只存在他们自己的设备上。</div>`;
  return `<div class="callout"><b>谁能打开这个链接</b>${S.room && S.room.mine ? '你的房间' : '这间房'}住在 ${esc(ownerHandle302())} 托管的隔壁页面里。陌生人能不能打开，取决于页面所有者是否开放了公开访问；能打开的人至少可以逛和试玩。</div>`;
}

/* ---------- 房间名片 ---------- */
const OPEN_FOR = { '': '', job: '在看工作机会', collab: '欢迎合作', both: '在看机会 · 欢迎合作' };
const DEFAULT_CARD_302 = { bio: '做「拾光」待办 App 和几个网页小游戏。电竞房里开了间小酒吧，Bit 替我招呼客人。', stack: ['Three.js', 'Electron', '浏览器扩展'], github: '', site: '', contact: '', open: 'collab' };
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const url = v => validUrl(v) ? String(v).trim().slice(0, 200) : '';
  const o = { bio: String(c.bio || '').slice(0, 80), stack: (Array.isArray(c.stack) ? c.stack : []).map(t => String(t || '').trim().slice(0, 14)).filter(Boolean).slice(0, 5), github: url(c.github), site: url(c.site), contact: String(c.contact || '').slice(0, 60), open: OPEN_FOR[c.open] !== undefined ? c.open : '' };
  return o.bio || o.stack.length || o.github || o.site || o.contact || o.open ? o : null;
}
function cardOf(r) {
  if (!r) return null;
  if (r.real) return cleanCard((CLOUD.rooms.get(r.key) || {}).card);
  if (r.preset === 'mine') return cleanCard(CLOUD.ready ? (CLOUD.site && CLOUD.site.card) : store.get('gebi.card302', null)) || cleanCard(DEFAULT_CARD_302);
  if (r.custom) return cleanCard(CUSTOM[r.no] && CUSTOM[r.no].card);
  return null;   // 演示住户的介绍和标签已经显示在面板上，不再生成名片
}
function cardHTML(r, opts = {}) {
  const c = cardOf(r), mine = residentInfo(r).mine;
  if (!c && !mine) return opts.quiet || !(r.real || r.preset === 'mine' || r.custom) ? '' : '<p class="mute small u-mb3">房主还没写名片。</p>';
  if (!c) return mine ? `<div class="rcard empty"><p>还没有名片。写一句介绍、技术栈和联系方式，来看作品的人才知道你是谁、怎么找你。</p><button type="button" class="btn sm" data-card="edit">写名片</button></div>` : '';
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };
  const contact = c.contact ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact) ? `<a href="mailto:${esc(c.contact)}">${esc(c.contact)}</a>` : esc(c.contact)) : '';
  return `<div class="rcard">${c.open ? `<span class="tag ok">${esc(OPEN_FOR[c.open])}</span>` : ''}
    ${c.bio ? `<p class="rc-bio">${esc(c.bio)}</p>` : ''}
    ${c.stack.length ? `<div class="chiprow">${c.stack.map(t => `<span class="tag dim">${esc(t)}</span>`).join('')}</div>` : ''}
    ${c.github || c.site || contact ? `<dl class="kv">${c.github ? `<dt>GitHub</dt><dd><a href="${esc(c.github)}" target="_blank" rel="noopener noreferrer">${esc(host(c.github) + new URL(c.github).pathname.replace(/\/$/, ''))}</a></dd>` : ''}${c.site ? `<dt>主页</dt><dd><a href="${esc(c.site)}" target="_blank" rel="noopener noreferrer">${esc(host(c.site))}</a></dd>` : ''}${contact ? `<dt>联系</dt><dd>${contact}</dd>` : ''}</dl>` : ''}
    ${c.demo ? '<p class="mute small u-mt2">演示住户的名片由介绍和标签生成。</p>' : ''}
    ${mine && !opts.noEdit ? '<button type="button" class="btn sm ghost" data-card="edit">编辑名片</button>' : ''}</div>`;
}
function bindCard(root) { root.querySelectorAll('[data-card="edit"]').forEach(b => b.addEventListener('click', () => openCardEditor(S.panel && S.panel.r || S.resident))); }
function openCard() {
  const r = S.resident; if (!r || S.view !== 'room') return;
  beginPanel('card', null); S.panel.r = r;
  const info = residentInfo(r), gb = findGroup('chalkboard');
  setPanel(`名片 · ${info.no}`, info.mine && !info.custom ? '你的名片' : info.handle, `
    <div class="unit-hero"><div class="plate-no">${esc(info.no)}</div><div><div class="u-strong">${esc(S.room.name)}</div><div class="mute small">${esc(info.city || '')} · 房主 ${esc(S.room.owner)}</div></div></div>
    ${cardHTML(r)}
    <div class="divider"></div>
    <p class="section-t">房间里的作品</p><ul class="works">${(info.works || []).map(w => `<li><span>${esc(w[0])}</span><span class="tag ${w[1] === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[w[1]] || '作品')}</span></li>`).join('') || '<li class="mute">还没有作品</li>'}</ul>`,
    !info.mine && gb ? `<button type="button" class="btn primary" id="cardMsg">给 TA 留言</button>` : '');
  bindCard(pBody);
  const m = $('#cardMsg'); if (m) m.addEventListener('click', () => activate(gb));
}
function openCardEditor(r) {
  if (!r) return;
  const c = cardOf(r) || {}, cur = c.demo ? {} : c;
  if (S.panel) closePanel(true);
  S.panel = { kind: 'cardEdit', r };
  setPanel('房间名片', '编辑名片', `
    <p class="mute small u-mb4">名片会出现在你的门牌、住户面板和分享出去的房间里。来看作品的招聘方和合作者最先看这里。</p>
    <form id="cardForm">
      <div class="field"><label for="cdBio">一句话介绍</label><textarea class="input" id="cdBio" maxlength="80" rows="2" placeholder="比如：用 AI 写小工具的前端，喜欢做像素风小游戏">${esc(cur.bio || '')}</textarea></div>
      <div class="field"><label for="cdStack">技术栈（用逗号分开，最多 5 个）</label><input class="input" id="cdStack" maxlength="80" value="${esc((cur.stack || []).join('，'))}" placeholder="Three.js，React，Python"></div>
      <div class="field"><label for="cdGh">GitHub</label><input class="input" id="cdGh" inputmode="url" value="${esc(cur.github || '')}" placeholder="https://github.com/你的账号"></div>
      <div class="field"><label for="cdSite">个人主页（选填）</label><input class="input" id="cdSite" inputmode="url" value="${esc(cur.site || '')}" placeholder="https://"></div>
      <div class="field"><label for="cdContact">公开的联系方式（选填）</label><input class="input" id="cdContact" maxlength="60" value="${esc(cur.contact || '')}" placeholder="邮箱或“微信 / 即刻：xxx”"><span class="hint-s">所有能打开隔壁的人都看得到，只填你愿意公开的。</span></div>
      <div class="field"><label>现在的状态</label><div class="seg" id="cdOpen">${Object.entries(OPEN_FOR).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${(cur.open || '') === k}">${v || '不显示'}</button>`).join('')}</div></div>
      <span class="err" id="cdErr" hidden></span>
    </form>`, `<button type="submit" form="cardForm" class="btn primary">保存名片</button>`);
  let open = cur.open || '';
  $('#cdOpen').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; open = b.dataset.v; $('#cdOpen').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#cardForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#cdErr'), gh = $('#cdGh').value.trim(), site = $('#cdSite').value.trim();
    if ((gh && !validUrl(gh)) || (site && !validUrl(site))) { err.textContent = '链接需要以 https:// 开头。'; err.hidden = false; return; }
    const card = cleanCard({ bio: $('#cdBio').value.trim(), stack: $('#cdStack').value.split(/[,，、;；]+/), github: gh, site, contact: $('#cdContact').value.trim(), open }) || {};
    try { await saveCard(r, card); } catch (e) { err.textContent = '没保存成功，稍后再试。'; err.hidden = false; return; }
    toast('名片已保存'); if (S.view === 'room') openCard(); else openResident(r);
  });
}
async function saveCard(r, card) {
  if (r.preset === 'mine') { if (CLOUD.ready && CLOUD.isOwner) await writeSite({ card }); else store.set('gebi.card302', card); return; }
  if (r.real) { const d = clone(CLOUD.rooms.get(r.key) || {}); if (!d.no) throw new Error('no room'); d.card = card; d.updatedAt = Date.now(); CLOUD.rooms.set(r.key, d); await cloudWrite(`rooms/${r.key}`, d); return; }
  if (r.custom && CUSTOM[r.no]) { CUSTOM[r.no].card = card; store.set('gebi3.custom', CUSTOM); }
}

/* ---------- 装修：待上传清单 ---------- */
function pendingWorks() {
  if (!S.room || !S.roomRoot) return [];
  return S.room.items.filter(d => d.entry && BIND_KINDS.includes(d.entry.kind) && !validUrl(d.entry.url) && !d.entry.work && !d.entry.from).map(d => findGroup(d.uid)).filter(Boolean);
}
function renderPendingRow() {
  const row = $('#pendingRow'); if (!row) return;
  const list = S.room && S.room.mine ? pendingWorks() : [];
  row.hidden = !list.length;
  row.innerHTML = list.length ? `<span class="pr-l">待上传 · ${list.length}</span>${list.map(g => `<button type="button" class="pr-i" data-uid="${esc(g.userData.iid)}"><i></i>${esc(entryOf(g).title || nameOf(g))}</button>`).join('')}` : '';
}

/* ---------- 打开结果：用来量“作品成功打开的比例” ---------- */
let openT = 0;
function logOpen(key, outcome) {
  if (!canPost() || !key || iOwnRoom(key) || key.startsWith('demo:')) return;
  const uid = CLOUD.me.id, d = clone(CLOUD.visits.get(uid) || {});
  d.log = d.log && typeof d.log === 'object' ? d.log : {};
  const cur = d.log[key] || { n: 1, did: [], at: Date.now() };
  cur.open = cur.open && typeof cur.open === 'object' ? cur.open : {};
  cur.open[outcome] = (+cur.open[outcome] || 0) + 1; d.log[key] = cur; d.updatedAt = Date.now();
  CLOUD.visits.set(uid, d);
  clearTimeout(openT); openT = setTimeout(() => cloudWrite(`visits/${uid}`, CLOUD.visits.get(uid)), 1500);
}

/* ---------- Bit 给房主的问候：按待回复和最近 24 小时，而不是“是否已读” ---------- */
function ownerGreeting(k) {
  const u = myUpdates(), sum = u.count ? updatesSentence(u) : '', pend = CLOUD.ready ? pendingFor(k).length : 0;
  const day = Date.now() - 864e5, me = CLOUD.me && CLOUD.me.id;
  const v24 = CLOUD.ready ? roomVisitors(k).filter(v => v.at > day && v.uid !== me).length : 0;
  const m24 = CLOUD.ready ? roomMessages(k).filter(m => m.at > day && m.author !== me && !m.reply).length : 0;
  if (sum) return `老板回来啦！${sum}${pend ? `还有 ${pend} 条留言等你回复，` : ''}要不要打开访客簿看看？`;
  if (pend) return `老板回来啦！有 ${pend} 条留言还没回复，访客在等。`;
  if (v24 || m24) return `老板回来啦！过去 24 小时${v24 ? `有 ${v24} 位邻居来过` : ''}${v24 && m24 ? '，' : ''}${m24 ? `收到 ${m24} 条留言` : ''}，你都看过、也都回复了。`;
  return '老板回来啦！这一天店里挺安静。去邻居家串个门，他们会顺着来访记录回访你。';
}

/* ---------- 新住户冷启动 ---------- */
function coldStartHTML(key) {
  const me = myResident(); if (!me) return '';
  const near = nearestResidents(me.lat, me.lon, me.no, 3), joined = inTheme(me, TH.cur.id);
  return `<div class="cold"><p class="section-t">Bit 的建议：先去串这三家</p><ul class="nblist">${near.map(x => { const i = residentInfo(x.r); return `<li><button type="button" class="nb" data-visit="${esc(x.r.no)}"><i style="--c:${residentColor(x.r)}"></i>${esc(i.handle)}<span>${esc(i.city)} · ${kmStr(x.km)}</span></button></li>`; }).join('')}</ul>
    <div class="cold-a">${joined ? '' : `<button type="button" class="btn sm" data-cold="theme">参加本周主题「${esc(TH.cur.title)}」</button>`}<button type="button" class="btn sm ghost" data-cold="share">生成分享卡片</button></div></div><div class="divider"></div>`;
}
function bindColdStart(root) {
  root.querySelectorAll('[data-visit]').forEach(b => b.addEventListener('click', () => {
    const r = RESIDENTS.find(x => x.no === b.dataset.visit); if (!r) return; closePanel(true);
    if (S.view === 'room') goRoomFromRoom(r); else { S.via = 'globe'; diveInto(r); }
  }));
  root.querySelectorAll('[data-cold]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.cold === 'theme') { joinTheme().then(() => renderInbox()); return; }
    closePanel();
    if (S.view === 'room' && iOwnRoom(roomKey(S.room))) openShare(); else toast('回到你的房间，点下方“分享”生成卡片');
  }));
}
function viaSummary(visitors) {
  const tot = {}; visitors.forEach(v => Object.entries(v.via || {}).forEach(([k, n]) => { tot[k] = (tot[k] || 0) + n; }));
  const parts = Object.entries(tot).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const open = visitors.reduce((a, v) => { if (v.open) { a.ok += v.open.sdk + v.open.nosdk; a.fail += v.open.fail; } return a; }, { ok: 0, fail: 0 });
  return (parts.length ? parts.map(([k, n]) => `<span class="tag dim">${esc(VIA[k])} ${n}</span>`).join('') : '<span class="mute small">来源从这一版开始记录。</span>') + (open.fail ? `<span class="tag pink">外链作品打不开 ${open.fail} 次</span>` : '');
}

/* ---------- SDK 接入说明 ---------- */
const SDK_SNIPPET = `// 隔壁 SDK：粘进你的作品，约 15 行
const gebi = { on: false, origin: '*' };
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.gebi !== 1 || m.type !== 'hello') return;
  gebi.on = true; gebi.origin = e.origin;
  // m.room = { no, name, owner }  m.entry = { title }  m.data = 房间给的初始数据
  parent.postMessage({ gebi: 1, type: 'ready' }, e.origin);
});
gebi.send = (type, extra) => {
  if (gebi.on) parent.postMessage(Object.assign({ gebi: 1, type }, extra), gebi.origin);
};
// 状态变了，同步给房间里的物件
gebi.send('state', { data: { score: 12 } });
// 在房间里弹一句提示（最多 60 字）
gebi.send('toast', { text: '保存好了' });
// 把画面推到物件屏幕上（游戏建议每秒不超过 12 帧）
createImageBitmap(canvas).then((f) => {
  if (gebi.on) parent.postMessage({ gebi: 1, type: 'screen', frame: f }, gebi.origin, [f]);
});`;
const SDK_DOC = 'https://github.com/ciki-9876/gebi/blob/main/docs/SDK.md';
function openSdkGuide() {
  if (S.win) minimizeWin(S.win, true);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'sdk' };
  setPanel('开发者 · 可选', '接入隔壁 SDK', `
    <p class="u-mb3">不接 SDK，作品照样能在房间里打开。接了以后，房间能确认作品“真的打开了”，桌上的物件也会跟着作品变化。</p>
    <ol class="steps-s"><li><b>握手</b><span>房间打开作品后发来 <code>hello</code>，你回一个 <code>ready</code>。窗口标题栏会变成“已接入”。</span></li>
    <li><b>同步状态</b><span>发 <code>state</code>，物件就能显示比分、待办数这类状态。</span></li>
    <li><b>推送画面</b><span>游戏可以发 <code>screen</code>，把画面推到房间里那台游戏机的屏幕上。</span></li></ol>
    <div class="code-box"><button type="button" class="btn sm" id="sdkCopy">复制代码</button><pre><code>${esc(SDK_SNIPPET)}</code></pre></div>
    <dl class="kv u-mt4"><dt>消息格式</dt><dd><code>{ gebi: 1, type, ... }</code></dd><dt>可用 type</dt><dd><code>ready</code> <code>state</code> <code>screen</code> <code>toast</code> <code>close</code></dd><dt>外链作品</dt><dd>网站需要允许被嵌入：不要设 <code>X-Frame-Options: DENY</code></dd><dt>托管作品</dt><dd>上传的单文件 HTML 跑在沙箱里，没有同源权限，也能用 SDK</dd></dl>`,
    `<a class="btn" href="${SDK_DOC}" target="_blank" rel="noopener noreferrer">完整文档 ${ICON.ext}</a>`);
  $('#sdkCopy').addEventListener('click', () => { try { navigator.clipboard.writeText(SDK_SNIPPET).then(() => toast('代码已复制'), () => toast('复制没成功，手动选中代码复制')); } catch (e) { toast('复制没成功，手动选中代码复制'); } });
}
$('#pocketBtn').addEventListener('click', openPocket);
$('#cardBtn').addEventListener('click', () => { const r = S.resident; if (S.room && S.room.mine && !cardOf(r)) openCardEditor(r); else openCard(); });
$('#cardEditBtn').addEventListener('click', () => openCardEditor(S.resident));
$('#pendingRow').addEventListener('click', e => { const b = e.target.closest('[data-uid]'); if (b) selectItem(findGroup(b.dataset.uid)); });
$('#plate').addEventListener('click', () => { if (S.view === 'room' && S.mode === 'visit' && !S.busy) openCard(); });


/* deck */
const deck = $('#deck');
function openDeck() { deck.hidden = false; deck.scrollTop = 0; if (FP.locked && document.exitPointerLock) document.exitPointerLock(); }
$('#openPlan').addEventListener('click', openDeck);
$('#closePlan').addEventListener('click', () => { deck.hidden = true; canvas.focus({ preventScroll: true }); });
deck.addEventListener('click', e => { const a = e.target.closest('.deck-nav a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) deck.scrollTo({ top: t.offsetTop - 70, behavior: reduceMotion ? 'auto' : 'smooth' }); });
deck.addEventListener('scroll', () => {
  const links = deck.querySelectorAll('.deck-nav a'); let cur = null;
  links.forEach(a => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t && t.offsetTop - 120 <= deck.scrollTop) cur = a; });
  links.forEach(a => a.classList.toggle('on', a === cur));
}, { passive: true });

/* toast */
let toastT = 0;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

/* ============================================================
   Input
   ============================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function setNdc(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); }
function pickRoom(cx, cy) {
  if (!S.roomRoot) return null;
  setNdc(cx, cy); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(S.roomRoot, true);
  for (const h of hits) {
    if (h.object === S.grid || h.object === S.selRing || !h.object.visible) continue;
    let o = h.object, vis = true; while (o) { if (!o.visible) vis = false; o = o.parent; } if (!vis) continue;
    o = h.object; while (o && !(o.userData && o.userData.iid)) o = o.parent;
    if (o) return { g: o, point: h.point, dist: h.distance };
    if (h.object.userData.floor || Math.abs(h.point.y) < .02) return { g: null, floor: true, point: h.point, dist: h.distance };
    return null;
  }
  return null;
}
function pickGlobe(cx, cy) {
  setNdc(cx, cy); raycaster.setFromCamera(ndc, gcam);
  const eh = raycaster.intersectObject(G.ocean, false), ed = eh.length ? eh[0].distance : 1e9;
  const ph = raycaster.intersectObjects(G.pins.map(p => p.hit), false);
  if (ph.length && ph[0].distance < ed + .03) return { pin: G.pins.find(p => p.hit === ph[0].object) };
  if (eh.length) return { point: eh[0].point };
  return null;
}
let walkRing = null;
function clickWalk(point) {
  const p = new THREE.Vector3(clamp(point.x, -4.5, 4.5), 0, clamp(point.z, -3.5, 3.5));
  const from = FP.pos.clone();
  for (let i = 0; i < 20 && blocked(p); i++) p.lerp(from, .15);
  if (p.distanceTo(from) < .4) return;
  if (!walkRing) { walkRing = new THREE.Mesh(new THREE.RingGeometry(.16, .2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb454').multiplyScalar(1.8), transparent: true, side: THREE.DoubleSide, depthWrite: false })); walkRing.rotation.x = -Math.PI / 2; }
  S.roomRoot.add(walkRing); walkRing.position.set(p.x, .02, p.z); walkRing.userData.t = 0;
  fpGo(p, FP.yaw, FP.pitch, clamp(.4 + p.distanceTo(from) / 3.2, .5, 2));
}
const pointers = new Map();
let drag = null, downAt = null, pinch0 = 0, pinchV = 0;
canvas.addEventListener('pointerdown', e => {
  if (S.busy) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchV = S.view === 'globe' ? G.cam.dist : CAM.orb.r; drag = null; downAt = null; return; }
  downAt = { x: e.clientX, y: e.clientY, moved: false };
  if (S.view === 'globe') { drag = { type: 'globe', lx: e.clientX, ly: e.clientY, lt: performance.now() }; return; }
  if (FP.locked) { const h = pickRoom(innerWidth / 2, innerHeight / 2); if (h && h.g && entryOf(h.g)) activate(h.g); drag = null; downAt = null; return; }
  drag = { type: CAM.mode === 'orbit' ? 'orbit' : 'look', lx: e.clientX, ly: e.clientY };
  if (S.mode === 'build' && CAM.mode === 'orbit') {
    const h = pickRoom(e.clientX, e.clientY);
    if (h && h.g && h.g.userData.def && !h.g.userData.def.wall && !h.g.userData.isChild && (h.g.userData.def.type !== 'rug' || S.selected === h.g)) {
      const p = new THREE.Vector3(); raycaster.ray.intersectPlane(floorPlane, p);
      const def = h.g.userData.def;
      drag = { type: 'item', g: h.g, ox: def.x - p.x, oz: def.z - p.z };
      if (S.selected !== h.g) selectItem(h.g);
    }
  }
});
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinch0) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (S.view === 'globe') { G.flyId++; G.cam.dist = clamp(pinchV * pinch0 / d, 1.25, 7.5); } else if (CAM.mode === 'orbit') CAM.orb.r = clamp(pinchV * pinch0 / d, 8, 26);
    return;
  }
  if (drag && downAt) {
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    if (!downAt.moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) { downAt.moved = true; tip.hidden = true; ghud.hidden = true; canvas.classList.add('dragging'); }
    if (downAt.moved) {
      if (drag.type === 'globe') {
        const k = .075 * (G.cam.dist - 1) + .008, now = performance.now(), dt = Math.max(1, now - drag.lt) / 1000;
        G.flyId++; G.cam.lon -= dx * k; G.cam.lat += dy * k; G.vel.lon = -dx * k / dt * .5; G.vel.lat = dy * k / dt * .5; G.idle = 0; G.dragging = true; drag.lt = now;
      } else if (drag.type === 'look') { FP.yawGoal += dx * .0042; FP.pitchGoal += dy * .0034; if (FP.auto) { FP.auto.res(); FP.auto = null; } }
      else if (drag.type === 'orbit') { CAM.orb.th -= dx * .006; CAM.orb.ph = clamp(CAM.orb.ph + dy * .004, .38, 1.38); }
      else if (drag.type === 'item') {
        setNdc(e.clientX, e.clientY); raycaster.setFromCamera(ndc, camera);
        const p = new THREE.Vector3(); if (raycaster.ray.intersectPlane(floorPlane, p)) {
          const def = drag.g.userData.def; def.x = Math.round((p.x + drag.ox) * 4) / 4; def.z = Math.round((p.z + drag.oz) * 4) / 4; clampDef(def);
          positionItem(drag.g, def); S.selRing.position.set(def.x, .02, def.z);
        }
      }
      drag.lx = e.clientX; drag.ly = e.clientY;
    }
    return;
  }
  if (e.pointerType === 'touch') return;
  hoverAt(e.clientX, e.clientY);
});
function hoverAt(x, y) {
  if (S.busy) { tip.hidden = true; return; }
  if (S.view === 'globe') {
    if (!G.ready) return;
    const h = pickGlobe(x, y);
    G.hoverPin = h && h.pin ? h.pin : null;
    if (h && h.point) {
      const dir = h.point.clone().normalize(); G.hover = dir; G.hoverDir.copy(dir); placeReticle(dir);
      const ll = vecToLatLon(dir), water = isWater(ll.lat, ll.lon), place = describePlace(ll.lat, ll.lon, water);
      ghud.innerHTML = `<b>${esc(place.title)}</b><span>${fmtCoord(ll.lat, ll.lon)}</span><em>${water ? '海上 · 盖不了房子' : G.moving ? '点击把房间搬到这里' : '点击在这里入住 · 只公开到城市'}</em>`;
      ghud.hidden = false; ghud.style.transform = `translate(${clamp(x + 18, 8, innerWidth - 240)}px, ${clamp(y + 18, 8, innerHeight - 90)}px)`;
      canvas.classList.toggle('pointer', !water);
    } else { G.hover = null; G.reticle.visible = false; ghud.hidden = true; canvas.classList.toggle('pointer', !!G.hoverPin); }
    if (G.hoverPin) { G.reticle.visible = false; ghud.hidden = true; canvas.classList.add('pointer'); }
    return;
  }
  if (FP.locked) return;
  const h = pickRoom(x, y);
  const g = h && h.g;
  if (g && S.mode === 'visit' && !entryOf(g)) { canvas.classList.remove('pointer'); S.hover = null; showTip(g, x, y); return; }
  S.hover = g || null; canvas.classList.toggle('pointer', !!g || (h && h.floor && S.mode === 'visit'));
  if (g) showTip(g, x, y); else tip.hidden = true;
}
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  canvas.classList.remove('dragging');
  G.dragging = false;
  if (!drag || !downAt) { drag = null; return; }
  const moved = downAt.moved, d = drag; drag = null;
  if (d.type === 'item' && moved) { saveLayout(); if (S.selected) renderInspector(S.selected); downAt = null; return; }
  if (!moved && e.type === 'pointerup') {
    if (S.view === 'globe') {
      const h = pickGlobe(e.clientX, e.clientY);
      if (h && h.pin) openResident(h.pin.r);
      else if (h && h.point) { const ll = vecToLatLon(h.point); openAddress(ll.lat, ll.lon); }
      else if (S.panel) closePanel();
    } else if (S.mode === 'build') { const h = pickRoom(e.clientX, e.clientY); if (h && h.g) selectItem(h.g); else closePanel(); }
    else {
      const h = pickRoom(e.clientX, e.clientY);
      if (h && h.g && entryOf(h.g)) activate(h.g);
      else if (h && h.floor) { if (S.panel && !isNarrow()) closePanel(); clickWalk(h.point); }
      else if (S.panel) closePanel();
    }
  }
  downAt = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!drag) { S.hover = null; tip.hidden = true; if (S.view === 'globe') { G.hover = null; G.reticle && (G.reticle.visible = false); ghud.hidden = true; } } });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (S.view === 'globe') { G.flyId++; G.cam.dist = clamp(G.cam.dist * Math.exp(e.deltaY * .0011), 1.25, 7.5); G.idle = 0; }
  else if (CAM.mode === 'orbit') CAM.orb.r = clamp(CAM.orb.r * Math.exp(e.deltaY * .001), 8, 26);
  else if (CAM.mode === 'fp' && !FP.auto) { const s = clamp(-e.deltaY * .004, -.6, .6); FP.pos.x += -Math.sin(FP.yaw) * s; FP.pos.z += -Math.cos(FP.yaw) * s; collide(FP.pos); }
}, { passive: false });
/* pointer lock "mouse look" */
function toggleLock() {
  if (S.view !== 'room' || S.mode !== 'visit') return;
  if (FP.locked) { document.exitPointerLock && document.exitPointerLock(); return; }
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => toast('这个环境不支持锁定鼠标，按住拖动也能环顾')); } catch (e) { toast('这个环境不支持锁定鼠标，按住拖动也能环顾'); }
}
$('#lockBtn').addEventListener('click', toggleLock);
document.addEventListener('pointerlockchange', () => {
  FP.locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('locked', FP.locked);
  if (FP.locked) { closePanel(); tip.hidden = true; } else $('#xprompt').hidden = true;
});
document.addEventListener('mousemove', e => { if (!FP.locked || S.busy) return; FP.yawGoal -= e.movementX * .0023; FP.pitchGoal -= e.movementY * .0023; });
function crosshairPick() {
  const h = pickRoom(innerWidth / 2, innerHeight / 2), g = h && h.g && entryOf(h.g) ? h.g : null;
  S.hover = g;
  const xp = $('#xprompt');
  if (g) { xp.hidden = false; xp.innerHTML = `<kbd>E</kbd> 或点击 · ${esc(entryOf(g).title || nameOf(g))}`; } else xp.hidden = true;
}
/* touch joystick */
(() => {
  const joy = $('#joy'), knob = joy.querySelector('i'); let id = null, cx = 0, cy = 0;
  joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; });
  joy.addEventListener('pointermove', e => { if (e.pointerId !== id) return; const dx = clamp((e.clientX - cx) / 42, -1, 1), dy = clamp((e.clientY - cy) / 42, -1, 1); FP.joy.x = dx; FP.joy.y = -dy; knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; });
  const end = e => { if (e.pointerId !== id) return; id = null; FP.joy.x = FP.joy.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
})();
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
addEventListener('keydown', e => {
  if (!deck.hidden) { if (e.key === 'Escape') { deck.hidden = true; } return; }
  const typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
  if (S.panel && S.panel.kind === 'game' && !typing) {
    const map = { ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 } };
    if (map[e.code]) { e.preventDefault(); gInput(map[e.code]); return; }
    if (e.code === 'Space') { e.preventDefault(); gReset(); game.mode = 'ready'; updateGameHud(); return; }
  }
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); if (S.win) { minimizeWin(S.win); return; } if (G.moving) { stopMove(); clearMarker(); } closePanel(); return; }
  if (typing) return;
  if (S.view === 'room' && S.mode === 'visit' && !S.busy) {
    if (MOVE_KEYS.has(e.code)) { if (e.code.startsWith('Arrow')) e.preventDefault(); FP.keys.add(e.code); if (FP.auto && !e.code.startsWith('Shift')) { FP.auto.res(); FP.auto = null; } return; }
    if (e.code === 'KeyE') { const g = S.hover; if (g && entryOf(g)) activate(g); return; }
    if (e.code === 'KeyF') { toggleLock(); return; }
  }
  if (S.mode === 'build' && S.selected) {
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  }
});
addEventListener('keyup', e => { FP.keys.delete(e.code); });
addEventListener('blur', () => FP.keys.clear());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) composer.setSize(innerWidth, innerHeight);
  if (gradePass) gradePass.uniforms.uRes.value.set(innerWidth, innerHeight);
  if (S.view === 'globe' && !S.panel) G.shiftGoal = homeShift();
  syncChrome();
});
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { drawNote(); drawChalk(); drawCode(codeOff); });

/* ============================================================
   Main loop
   ============================================================ */
let last = performance.now(), T = 0, codeOff = 0, codeAcc = 0, faceAcc = 0, running = true, raf = 0;
document.addEventListener('visibilitychange', () => { running = !document.hidden; cancelAnimationFrame(raf); if (running) { last = performance.now(); raf = requestAnimationFrame(frame); } });
const tmpC = new THREE.Color();
function animateRoom(dt) {
  const md = MOODS[S.mood];
  if (S.dyn) {
    let h1, h2, sat = .85, li = .58;
    if (S.mood === 'party') { h1 = (T * .25) % 1; h2 = (h1 + .45) % 1; sat = 1; li = .55; }
    else if (S.mood === 'focus') { h1 = .58; h2 = .58; sat = .15; li = .78; }
    else { h1 = .84 + Math.sin(T * .35) * .06; h2 = .52 + Math.sin(T * .3) * .03; }
    tmpC.setHSL(h1, sat, li);
    for (const m of S.dyn.leds) m.color.copy(tmpC).multiplyScalar(1.9);
    if (S.dyn.ledLights[0]) { S.dyn.ledLights[0].color.copy(tmpC); S.dyn.ledLights[0].intensity += (md.ledI - S.dyn.ledLights[0].intensity) * .05; }
    if (S.dyn.ledLights[1]) { S.dyn.ledLights[1].color.setHSL(h2, sat, li); S.dyn.ledLights[1].intensity += (md.ledI * .75 - S.dyn.ledLights[1].intensity) * .05; }
    for (const p of S.dyn.pendants) p.light.intensity += (md.pend - p.light.intensity) * .05;
    for (const n of S.dyn.neons) { let k = md.neon; if (S.mood === 'party' && Math.sin(T * 23) > .92) k *= .45; n.mat.color.setScalar(k); }
    for (const b of S.dyn.blinkers) b.m.color.copy(b.base).multiplyScalar(Math.sin(T * b.sp + b.ph) > .2 ? 1 : .15);
    if (S.dyn.vinyl && music.on) S.dyn.vinyl.rotation.y -= dt * 3.5;
    const dr = S.dyn.door;
    if (dr) { dr.open += (dr.goal - dr.open) * (1 - Math.exp(-dt * 4)); dr.pivot.rotation.y = -dr.open * 1.45; if (S.dyn.corridorLight) S.dyn.corridorLight.intensity = dr.open * 1.4; }
    const rb = S.dyn.robot;
    if (rb) {
      rb.rig.position.y = 1.25 + Math.sin(T * 1.6) * .035;
      const talking = robotState.mood === 'talk';
      rb.head.rotation.z = Math.sin(T * .9) * .04 + (robotState.mood === 'think' ? .12 : 0);
      const rp = new THREE.Vector3(); rb.g.getWorldPosition(rp);
      const toCam = Math.atan2(camera.position.x - rp.x, camera.position.z - rp.z) - rb.g.rotation.y;
      rb.head.rotation.y += (clamp(toCam, -.8, .8) - rb.head.rotation.y) * (1 - Math.exp(-dt * 3));
      rb.armR.rotation.x = -.2 + (talking ? Math.sin(T * 14) * .35 : Math.sin(T * 1.2) * .05);
      rb.armL.rotation.z = -.18 - (talking ? Math.abs(Math.sin(T * 3)) * .25 : 0);
      const k = robotState.mood === 'think' ? (Math.sin(T * 10) > 0 ? 3 : .8) : 2.2 + Math.sin(T * 2) * .4;
      rb.bulbMat.color.set('#62e6ff').multiplyScalar(k);
      robotState.nextBlink -= dt;
      if (robotState.nextBlink <= 0) { robotState.blink = 1; robotState.nextBlink = 2.5 + Math.random() * 3; }
      if (robotState.blink > 0) robotState.blink = Math.max(0, robotState.blink - dt * 5);
      if (talking) { robotState.talkT -= dt; if (robotState.talkT <= 0) robotMood('idle'); }
      faceAcc += dt; if (faceAcc > 1 / 24) { faceAcc = 0; drawFace(T); }
    }
  }
  hemi.intensity += (md.hemi * .85 - hemi.intensity) * .05;
  if (walkRing && walkRing.parent) { walkRing.userData.t += dt; const t = walkRing.userData.t; walkRing.scale.setScalar(1 + t * 1.6); walkRing.material.opacity = Math.max(0, 1 - t * 1.4); if (t > .8) walkRing.parent.remove(walkRing); }
  codeAcc += dt; if (codeAcc > 1 / 12) { codeAcc = 0; codeOff += 1.6; drawCode(codeOff); }
}
function animateCommon(dt) {
  if (!game.remote) {
    game.t += dt; game.acc += dt;
    let ticked = false;
    while (game.acc > game.step) { game.acc -= game.step; gTick(); ticked = true; }
    if (ticked || game.mode === 'ready' || game.mode === 'over') gDraw();
  }
}
function frame(now) {
  if (!running) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  if (S.view === 'globe') updateGlobe(dt, T);
  else { animateRoom(dt); updateRoomCamera(dt); if (FP.locked) crosshairPick(); }
  animateCommon(dt);
  if (outline) outline.selectedObjects = S.view === 'room' ? [S.hover || S.focus || S.selected].filter(Boolean) : [];
  if (gradePass) { const u = gradePass.uniforms; u.uTime.value = T; u.uFade.value = FX.fade; u.uWarp.value = FX.warp; u.uCA.value = S.view === 'globe' ? 1.4 : .8; u.uVig.value = S.view === 'globe' ? .7 : .5; }
  if (composer) composer.render(dt); else renderer.render(S.view === 'globe' ? globeScene : scene, S.view === 'globe' ? gcam : camera);
  takeSnapshotIfAsked();
  updateOverlays();
  raf = requestAnimationFrame(frame);
}

/* ============================================================
   Boot
   ============================================================ */
function loadLand(onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('GET', 'assets/land.txt'); x.responseType = 'text';
    x.onprogress = e => { onProgress(e.lengthComputable ? e.loaded / e.total : Math.min(.9, e.loaded / 413000)); };
    x.onload = () => {
      if (!(x.status === 200 || (x.status === 0 && x.responseText))) return rej(new Error('HTTP ' + x.status));
      try { const bin = atob(x.responseText.trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); res(u.buffer); } catch (e) { rej(e); }
    };
    x.onerror = () => rej(new Error('network'));
    x.send();
  });
}
async function boot() {
  const bar = $('#loadBar'), pct = $('#loadPct');
  const prog = v => { bar.style.transform = `scaleX(${v.toFixed(3)})`; pct.textContent = Math.round(v * 100) + '%'; };
  let buf;
  try {
    const fontP = Promise.race([Promise.all([`120px ${FONT.neon}`, `38px ${FONT.chalk}`, `14px ${FONT.body}`, `700 28px ${FONT.body}`, `13px ${FONT.mono}`, `40px ${FONT.disp}`].map(f => document.fonts.load(f, '拾光今天待办访客留言零点特调霓虹贪吃蛇隔壁MIDNIGHT302'))), sleep(2600)]).catch(() => {});
    [buf] = await Promise.all([loadLand(v => prog(v * .9)), fontP]);
  } catch (e) { loaderMsg.textContent = '地球数据没有加载成功，请刷新页面再试一次。'; return; }
  prog(1);
  drawFace(0); drawCode(0); gDraw();
  updateSun();
  buildGlobe(buf); buildGlobeLabels(); tickClock(); setInterval(tickClock, 15000); startFeed();
  S.view = 'globe'; setChromeView('globe'); usePostFor('globe'); syncChrome();
  G.cam.lat = 14; G.cam.lon = ME.lon - 70; G.cam.dist = 16; G.shift = G.shiftGoal = homeShift();
  setFade(1);
  initCloud();
  raf = requestAnimationFrame(frame);
  $('#loader').classList.add('gone');
  setTimeout(() => { $('#loader').hidden = true; }, 700);
  document.body.classList.add('intro');
  tween(1.1, t => setFade(1 - t), ease.out);
  tween(2.8, t => { G.landMat.uniforms.reveal.value = t; }, ease.out);
  S.busy = true;
  await tween(3.2, t => { G.cam.dist = 16 + (HOME_DIST - 16) * t; G.cam.lon = ME.lon - 70 + 58 * t; G.cam.lat = 14 + 8 * t; }, ease.outQuint);
  S.busy = false; G.idle = 0;
  if (location.hash === '#plan') openDeck();
  const deep = /^#room-([A-Za-z0-9._~-]+)(?:&from=([a-z]{1,12}))?$/.exec(location.hash || '');
  if (deep) {
    for (let i = 0; i < 30 && deep[1] !== '302' && !CLOUD.ready; i++) await sleep(200);
    const r = residentOfKey(deep[1]) || RESIDENTS.find(x => x.no === deep[1]);
    if (r) { S.via = VIA[deep[2]] ? deep[2] : 'link'; diveInto(r); } else toast('这个房间链接找不到了，可能房主搬走了');
  }
  try {
    if (window.claude && window.claude.use) {
      const s = await window.claude.use('sample');
      if (s) { S.sample = s; try { const lim = await s.limits(); S.sampleTools = !!(lim && lim.tools); } catch (e) {} updateAgentStatus(); }
    }
  } catch (e) {}
}
boot();
})();
