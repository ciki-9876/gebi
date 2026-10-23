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

