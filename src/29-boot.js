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
  pubFromHash();
  try {
    if (window.claude && window.claude.use) {
      const s = await window.claude.use('sample');
      if (s) { S.sample = s; try { const lim = await s.limits(); S.sampleTools = !!(lim && lim.tools); } catch (e) {} updateAgentStatus(); }
    }
  } catch (e) {}
}
boot();
