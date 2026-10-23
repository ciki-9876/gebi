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

