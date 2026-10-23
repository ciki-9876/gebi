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
/* ---------- 首页：轨道上的邻居动态（读数挂在绕地球的一道轨道弧上） ---------- */
const orbitSvg = $('#orbit'), _oc = new THREE.Vector3();
const ORBIT_ANG = [220, 205, 190, 175];   // 读数在轨道左侧的位置，单位度，0° 指向右
function globeOnScreen() {
  const c = toScreen(_oc.set(0, 0, 0), gcam);
  const d = gcam.position.length(), fov = gcam.fov * Math.PI / 180;
  const r = (innerHeight / 2) * Math.tan(Math.asin(Math.min(1, 1 / d))) / Math.tan(fov / 2);
  return { x: c.x, y: c.y, r };
}
function layoutOrbit() {
  if (!orbitSvg || !G.ready) return;
  const items = [...feedEl.children], show = S.view === 'globe' && !S.busy && !isNarrow() && !S.panel;
  orbitSvg.classList.toggle('off', !show); feedEl.parentElement.classList.toggle('off', !show);
  if (!show) return;
  const g = globeOnScreen(); if (!isFinite(g.r) || !isFinite(g.x) || g.r <= 0 || gcam.position.length() < 1.05) return;
  const R = g.r * 1.16 + 34, rad = a => a * Math.PI / 180;
  const pt = (a, rr = R) => [g.x + rr * Math.cos(rad(a)), g.y + rr * Math.sin(rad(a))];
  const a0 = pt(162), a1 = pt(222);
  let svg = `<circle cx="${g.x}" cy="${g.y}" r="${R}" class="o-ring"/><path d="M${a0[0]} ${a0[1]} A${R} ${R} 0 0 1 ${a1[0]} ${a1[1]}" class="o-arc"/>`;
  for (let a = 162; a <= 222; a += 4) { const p = pt(a), q = pt(a, R + (a % 12 === 0 ? 9 : 5)); svg += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" class="o-tick"/>`; }
  const now = performance.now(); if (G.feedHot && G.feedHot.until < now) G.feedHot = null;
  items.forEach((li, i) => {
    const a = ORBIT_ANG[i]; if (a == null) { li.style.opacity = '0'; return; }
    const [x, y] = pt(a), on = !!(G.feedHot && li._r === G.feedHot.r);
    li.style.transform = `translate(${x - 16}px,${y}px) translate(-100%,-50%)`; li.style.opacity = '';
    li.classList.toggle('on', on);
    svg += `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="2" class="o-node${on ? ' on' : ''}"/>`;
    if (on) {
      const p = G.pins.find(q => q.r === li._r);
      if (p) {
        _tp.copy(p.up).multiplyScalar(1 + p.h); const s = toScreen(_tp, gcam);
        if (s.z < 1 && p.up.dot(globeCamDir(_cd).normalize()) > .1) svg += `<path d="M${x + 6} ${y} L${s.x} ${s.y}" class="o-lead"/><circle cx="${s.x}" cy="${s.y}" r="13" class="o-reticle"/>`;
      }
    }
  });
  orbitSvg.innerHTML = svg;
}
/* 控制台右侧的小屏：你的房间近况 */
function syncHomeLcd(mr) {
  const el = $('#lcdLines'); if (!el) return;
  const lines = [];
  if (mr) {
    const info = residentInfo(mr);
    lines.push([mr.no, `${info.name || '你的房间'} · 你的房间`]);
    if (CLOUD.ready) { const u = myUpdates(); lines.push(['今天', u.count ? updatesSentence(u).replace(/[，,]$/, '') : '这一天店里挺安静']); }
    else lines.push(['今天', '2 位邻居来过，黑板上 1 条新留言']);
    const todo = (SG.tasks || []).filter(t => !t.done).length;
    lines.push(['拾光', todo ? `还有 ${todo} 件待办` : '待办都做完了']);
  } else {
    lines.push(['你', '还没有房间']); lines.push(['入住', '按「选址入住」在地球上挑个地址']);
  }
  el.innerHTML = lines.map(([k, v]) => `<p><span>${esc(k)}</span>${esc(v)}</p>`).join('');
}
const _cd = new THREE.Vector3(), _tp = new THREE.Vector3();
function updateGlobeLabels() {
  if (!G.ready) return;
  globeCamDir(_cd).normalize();
  const far = G.cam.dist > 6;
  for (const p of G.pins) {
    if (!p.label) continue;
    const facing = p.up.dot(_cd);
    _tp.copy(p.up).multiplyScalar(1 + p.h + .015);
    const s = toScreen(_tp, gcam), info = residentInfo(p.r);
    const show = facing > .22 && !S.busy && S.view === 'globe' && (!far || info.mine) && s.z < 1;
    p.label.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
    p.label.style.opacity = show ? String(clamp((facing - .22) * 4, 0, 1)) : '0';
    p.label.style.pointerEvents = show ? 'auto' : 'none';
    p.label.classList.toggle('hot', !!(G.labelHover === p || (G.hoverPin && G.hoverPin.r === p.r) || (G.feedHot && G.feedHot.r === p.r)));
  }
  layoutOrbit();
}

