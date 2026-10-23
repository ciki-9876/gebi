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

