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
  bg: cssVar('--bg', '#111318'), surface: cssVar('--surface-3', '#252a33'), text1: cssVar('--text-1', '#e1e7f3'), text2: cssVar('--text-2', '#9ba4b6'), text3: cssVar('--text-3', '#8b94a7'),
  accent: cssVar('--accent', '#62e6d4'), accentText: cssVar('--accent-text', '#62e6d4'), accentLine: cssVar('--accent-line', 'rgba(98,230,212,.42)'), accentSoft: cssVar('--accent-soft', 'rgba(98,230,212,.12)'),
  info: cssVar('--info', '#7db7ff'), heat: cssVar('--heat', '#ff7aa8'), screen: cssVar('--screen', '#050b0d'), screenText: cssVar('--screen-text', '#8fe9da'), line: 'rgba(255,255,255,.09)'
};
/* 门牌：系统的标志元素，画布版本（3D 门上、分享卡片）与 .plate-no 保持一致 */
function drawPlate(g, x, y, w, h, no, scale = 1) {
  g.save();
  g.fillStyle = TK.surface; rr(g, x, y, w, h, 12 * scale); g.fill();
  g.strokeStyle = TK.accentLine; g.lineWidth = 2 * scale; rr(g, x + scale, y + scale, w - 2 * scale, h - 2 * scale, 11 * scale); g.stroke();
  const wx = x + 18 * scale, wy = y + h / 2 - 11 * scale;
  g.shadowColor = TK.accent; g.shadowBlur = 14 * scale; g.fillStyle = TK.accent; rr(g, wx, wy, 16 * scale, 22 * scale, 3 * scale); g.fill(); g.shadowBlur = 0;
  g.fillStyle = TK.accentText; g.font = `600 ${Math.round(h * .5)}px ${FONT.mono}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(no, wx + 30 * scale, y + h / 2 + 2 * scale);
  g.restore();
}

