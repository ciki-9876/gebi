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

