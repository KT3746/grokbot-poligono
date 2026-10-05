/* POLÍGONO — core shooting range loop */
const PoligonoGame = (() => {
  let canvas, ctx, fxCanvas, fxCtx;
  let running = false;
  let paused = false;
  let mode = 'treino'; // treino | desafio
  let lastTs = 0;
  let w = 0, h = 0, dpr = 1;
  let use3d = false;

  const state = {
    score: 0,
    shots: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    multiplier: 1,
    timeLeft: 0,
    wave: 0,
    goal: 0,
    ended: false,
    win: false
  };

  let cross = { x: 0.5, y: 0.45 };
  let recoil = { x: 0, y: 0 };
  let shake = 0;
  let muzzleFlash = 0;
  let hitFlash = 0;
  let missFlash = 0;
  let perfectFlash = 0;
  let warmup = 0;          /* 3·2·1 before live fire */
  let lastWarmupTick = -1;
  let aimLocked = false;
  let aimLockTargetId = null;
  let hintDismissed = false;
  let aimStart = null;
  let targets = [];
  let particles = [];
  let markers = [];
  let spawnTimer = 0;
  let onEnd = null;
  let onHud = null;

  const RINGS = [
    { name: 'centro', r: 0.18, pts: 100 },
    { name: 'anel', r: 0.45, pts: 50 },
    { name: 'borda', r: 1.0, pts: 20 }
  ];

  function init(opts) {
    canvas = opts.canvas;
    fxCanvas = opts.fxCanvas || null;
    onEnd = opts.onEnd || null;
    onHud = opts.onHud || null;
    use3d = typeof PoligonoScene !== 'undefined' && PoligonoScene.isReady();
    if (use3d && fxCanvas) {
      fxCtx = fxCanvas.getContext('2d');
    } else {
      ctx = canvas.getContext('2d');
      if (fxCanvas) fxCtx = fxCanvas.getContext('2d');
    }
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const mobile = Math.min(window.innerWidth, window.innerHeight) <= 500
      || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    /* Cap phone ~1.25 (mesmo bar FRONTEIRA/ECO); desktop até 1.5. */
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    if (use3d) {
      if (typeof PoligonoScene !== 'undefined') PoligonoScene.resize(w, h);
    } else if (ctx) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (fxCanvas && fxCtx) {
      const fdpr = Math.min(dpr, 2);
      fxCanvas.width = Math.floor(w * fdpr);
      fxCanvas.height = Math.floor(h * fdpr);
      fxCtx.setTransform(fdpr, 0, 0, fdpr, 0, 0);
    }
  }

  function resetStats(m) {
    mode = m;
    state.score = 0;
    state.shots = 0;
    state.hits = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.multiplier = 1;
    state.ended = false;
    state.win = false;
    state.wave = 1;
    if (mode === 'desafio') {
      state.timeLeft = 60;
      state.goal = 1200;
    } else {
      state.timeLeft = 0;
      state.goal = 0;
    }
    targets = [];
    particles = [];
    markers = [];
    spawnTimer = 0.4;
    recoil = { x: 0, y: 0 };
    shake = 0;
    muzzleFlash = 0;
    hitFlash = 0;
    missFlash = 0;
    perfectFlash = 0;
    warmup = 3.0;
    lastWarmupTick = -1;
    aimLocked = false;
    aimLockTargetId = null;
    hintDismissed = false;
    aimStart = null;
    cross = { x: 0.5, y: 0.45 };
  }

  function start(m) {
    resetStats(m || 'treino');
    running = true;
    paused = false;
    lastTs = 0;
    if (use3d) PoligonoScene.setPlaying(true);
    spawnInitial();
    if (PoligonoInput.prefersReducedMotion()) {
      warmup = 0.55; /* brief beat, no long 3·2·1 */
      lastWarmupTick = 1;
      if (typeof PoligonoUI !== 'undefined' && PoligonoUI.showCountdown) {
        PoligonoUI.showCountdown(0);
      }
    } else if (typeof PoligonoUI !== 'undefined' && PoligonoUI.showCountdown) {
      PoligonoUI.showCountdown(3);
      lastWarmupTick = 3;
      if (typeof PoligonoAudio !== 'undefined' && PoligonoAudio.haptic) {
        PoligonoAudio.haptic(6);
      }
    }
    hud();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    paused = false;
    warmup = 0;
    if (typeof PoligonoUI !== 'undefined' && PoligonoUI.hideCountdown) {
      PoligonoUI.hideCountdown(true);
    }
    setFireReady(false);
    if (use3d) {
      PoligonoScene.setPlaying(false);
      PoligonoScene.syncTargets([]);
      PoligonoScene.setFx({ shake: 0, recoilX: 0, recoilY: 0, muzzle: 0 });
    }
    if (fxCtx) fxCtx.clearRect(0, 0, w, h);
  }

  function setPaused(p) {
    paused = !!p;
    if (!paused && running) {
      lastTs = 0;
      requestAnimationFrame(frame);
    }
  }

  function isPaused() { return paused; }
  function isRunning() { return running && !state.ended; }
  function getState() { return state; }
  function getMode() { return mode; }

  function hud() {
    if (onHud) onHud(Object.assign({}, state, {
      warmup: warmup,
      aimLocked: aimLocked,
      comboStep: state.combo % 3
    }), mode);
  }

  function setFireReady(on) {
    const btn = document.getElementById('btn-fire');
    if (!btn) return;
    btn.classList.toggle('is-ready', !!on);
    btn.setAttribute('aria-label', on ? 'Disparar — mira no alvo' : 'Disparar');
  }

  function kickFireBtn() {
    const btn = document.getElementById('btn-fire');
    if (!btn) return;
    btn.classList.remove('is-kick');
    void btn.offsetWidth;
    btn.classList.add('is-kick');
    setTimeout(() => btn.classList.remove('is-kick'), 220);
  }

  function updateAimLock() {
    const cx = cross.x + recoil.x;
    const cy = cross.y + recoil.y;
    let locked = false;
    let tid = null;
    const sorted = targets.slice().filter(t => !t.hit && !(t.telegraph > 0.12));
    if (use3d && typeof PoligonoScene !== 'undefined') {
      const hitInfo = PoligonoScene.pick(cx, cy, sorted);
      if (hitInfo && hitInfo.target && hitInfo.distNorm <= 1) {
        locked = true;
        tid = hitInfo.target.id;
      }
    } else {
      const px = cx * w, py = cy * h;
      for (const tgt of sorted) {
        const dx = px - tgt.x * w;
        const dy = py - tgt.y * h;
        const rad = tgt.pixelR || tgt.r;
        if (Math.hypot(dx, dy) <= rad) {
          locked = true;
          tid = tgt.id;
          break;
        }
      }
    }
    const gained = locked && tid && tid !== aimLockTargetId;
    aimLocked = locked;
    aimLockTargetId = tid;
    setFireReady(locked && warmup <= 0);
    if (gained && warmup <= 0 && typeof PoligonoAudio !== 'undefined' && PoligonoAudio.haptic) {
      PoligonoAudio.haptic(5);
    }
  }

  function tickWarmup(dt) {
    if (warmup <= 0) return;
    const prev = warmup;
    warmup = Math.max(0, warmup - dt);
    const tick = warmup > 0 ? Math.ceil(warmup) : 0;
    /* Only announce when the displayed digit drops (3→2→1→0) */
    if (tick < lastWarmupTick) {
      lastWarmupTick = tick;
      if (tick > 0) {
        if (typeof PoligonoUI !== 'undefined' && PoligonoUI.showCountdown) {
          PoligonoUI.showCountdown(tick);
        }
        if (typeof PoligonoAudio !== 'undefined') {
          if (PoligonoAudio.ui) PoligonoAudio.ui();
          if (PoligonoAudio.haptic) PoligonoAudio.haptic(6);
        }
      }
    }
    if (prev > 0 && warmup <= 0) {
      lastWarmupTick = 0;
      if (typeof PoligonoUI !== 'undefined' && PoligonoUI.showCountdown) {
        PoligonoUI.showCountdown(0); /* FOGO! */
      }
      if (typeof PoligonoAudio !== 'undefined' && PoligonoAudio.haptic) {
        PoligonoAudio.haptic(18);
      }
      setTimeout(() => {
        if (running && typeof PoligonoUI !== 'undefined' && PoligonoUI.hideCountdown) {
          PoligonoUI.hideCountdown(false);
        }
      }, 420);
    }
  }

  function spawnInitial() {
    for (let i = 0; i < 3; i++) spawnTarget(i % 3 === 0);
  }

  function laneY(lane) {
    const base = 0.22;
    return base + lane * 0.18;
  }

  function laneScale(lane) {
    return 0.55 + lane * 0.22;
  }

  function spawnTarget(moving) {
    const lane = Math.floor(Math.random() * 3);
    const scale = laneScale(lane);
    const mobile = Math.min(w, h) <= 500;
    const base = mobile ? 36 : 28;
    const pixelR = (base + Math.random() * 18) * scale * (Math.min(w, h) / 400);
    const sizeWorld = (mobile ? 0.52 : 0.44) * (1.16 - lane * 0.07);
    const kind = Math.random() < 0.35 ? 'steel' : 'paper';
    const y = laneY(lane) + (Math.random() * 0.04 - 0.02);
    const x = 0.12 + Math.random() * 0.76;
    const reduce = typeof PoligonoInput !== 'undefined' && PoligonoInput.prefersReducedMotion
      && PoligonoInput.prefersReducedMotion();
    const t = {
      x, y, r: use3d ? sizeWorld : pixelR,
      sizeWorld, pixelR, lane, kind,
      moving: !!moving,
      vx: moving ? (0.08 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1) : 0,
      bounce: moving && Math.random() < 0.4,
      life: 8 + Math.random() * 6,
      hit: false,
      flash: 0,
      /* Spawn telegraph: soft ring + fade-in; reduced-motion → instant ready */
      telegraph: reduce ? 0 : 0.48,
      appear: reduce ? 1 : 0,
      id: Math.random().toString(36).slice(2)
    };
    for (const o of targets) {
      const dx = (o.x - t.x);
      const dy = (o.y - t.y);
      if (Math.hypot(dx * w, dy * h) < ((o.pixelR || o.r) + (t.pixelR || t.r)) * 1.4) {
        t.x = 0.1 + Math.random() * 0.8;
      }
    }
    targets.push(t);
  }

  function accuracy() {
    if (state.shots === 0) return null;
    return Math.round((state.hits / state.shots) * 100);
  }

  function frame(ts) {
    if (!running) return;
    if (paused) return;
    if (document.hidden) return; /* sem sim com aba oculta */
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    const aim = PoligonoInput.getAim();
    const prefersReducedMotion = PoligonoInput.prefersReducedMotion();
    const k = prefersReducedMotion ? 1 : (1 - Math.exp(-dt * 22));
    cross.x += (aim.x - cross.x) * k;
    cross.y += (aim.y - cross.y) * k;

    recoil.x *= Math.pow(0.01, dt);
    recoil.y *= Math.pow(0.01, dt);
    if (Math.abs(recoil.x) < 0.0001) recoil.x = 0;
    if (Math.abs(recoil.y) < 0.0001) recoil.y = 0;
    shake = Math.max(0, shake - dt * 4.5);
    muzzleFlash = Math.max(0, muzzleFlash - dt * 8);
    hitFlash = Math.max(0, hitFlash - dt * 3.2);
    missFlash = Math.max(0, missFlash - dt * 4.0);
    perfectFlash = Math.max(0, perfectFlash - dt * 2.8);

    tickWarmup(dt);
    updateAimLock();

    /* First-minute: some a dica após mirar de verdade ou disparar */
    if (!hintDismissed && aim && aim.active) {
      if (!aimStart) aimStart = { x: aim.x, y: aim.y };
      else if (Math.hypot(aim.x - aimStart.x, aim.y - aimStart.y) > 0.035) {
        noteFirstAction();
      }
    }

    if (mode === 'desafio' && !state.ended && warmup <= 0) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish(state.score >= state.goal);
        return;
      }
    }

    spawnTimer -= dt;
    const maxT = mode === 'desafio' ? 5 + Math.min(3, Math.floor(state.wave / 2)) : 4;
    if (spawnTimer <= 0 && targets.filter(t => !t.hit).length < maxT) {
      spawnTarget(Math.random() < (mode === 'desafio' ? 0.55 : 0.4));
      spawnTimer = mode === 'desafio' ? (1.1 - Math.min(0.5, state.wave * 0.05)) : 1.6;
    }

    for (const t of targets) {
      if (t.hit) continue;
      if (t.telegraph > 0) {
        t.telegraph = Math.max(0, t.telegraph - dt);
        /* Soft ease-in: appear 0→1 as telegraph drains */
        t.appear = 1 - (t.telegraph / 0.48);
        if (t.telegraph <= 0) t.appear = 1;
        continue; /* still forming — no move / life decay yet */
      }
      if (t.appear < 1) t.appear = 1;
      t.life -= dt;
      if (t.moving) {
        t.x += t.vx * dt;
        if (t.bounce) {
          if (t.x < 0.08 || t.x > 0.92) t.vx *= -1;
          t.x = Math.max(0.08, Math.min(0.92, t.x));
        } else if (t.x < -0.1 || t.x > 1.1) {
          t.life = 0;
        }
      }
      if (t.flash > 0) t.flash -= dt;
    }
    targets = targets.filter(t => t.life > 0 || (t.hit && t.flash > 0));

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.4 * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    for (const m of markers) m.life -= dt;
    markers = markers.filter(m => m.life > 0);

    if (PoligonoInput.consumeFire()) {
      if (warmup > 0) { /* ignore shots during 3·2·1 */ }
      else fire();
    }

    if (mode === 'desafio' && state.score >= state.wave * 400) {
      state.wave++;
    }

    hud();
  }

  function screenOf(t) {
    if (use3d) return PoligonoScene.project(t);
    return { x: t.x, y: t.y };
  }

  function pick2d(px, py) {
    const sorted = targets.slice().filter(t => !t.hit && !(t.telegraph > 0.12)).sort((a, b) => b.lane - a.lane);
    for (const t of sorted) {
      const dx = px - t.x * w;
      const dy = py - t.y * h;
      const rad = t.pixelR || t.r;
      const dist = Math.hypot(dx, dy);
      if (dist <= rad) {
        return { target: t, distNorm: dist / rad };
      }
    }
    return null;
  }


  function noteFirstAction() {
    if (hintDismissed) return;
    hintDismissed = true;
    if (typeof PoligonoUI !== 'undefined' && PoligonoUI.dismissHint) {
      PoligonoUI.dismissHint(false);
    }
  }

  function fire() {
    if (state.ended || paused || !running || warmup > 0) return;
    PoligonoAudio.ensure();
    PoligonoAudio.shot();
    kickFireBtn();
    state.shots++;

    const cx = cross.x + recoil.x;
    const cy = cross.y + recoil.y;
    const px = cx * w;
    const py = cy * h;

    noteFirstAction();
    recoil.x += (Math.random() * 0.02 - 0.01);
    recoil.y -= 0.018 + Math.random() * 0.01;
    if (!PoligonoInput.prefersReducedMotion()) shake = Math.max(shake, 0.28);
    muzzleFlash = 1;

    const hitInfo = use3d
      ? PoligonoScene.pick(cx, cy, targets)
      : pick2d(px, py);

    let hitT = null;
    let zone = null;
    let distNorm = 1;
    if (hitInfo && hitInfo.target && hitInfo.distNorm <= 1) {
      hitT = hitInfo.target;
      distNorm = hitInfo.distNorm;
      for (const ring of RINGS) {
        if (distNorm <= ring.r) { zone = ring; break; }
      }
    }

    if (hitT && zone) {
      hitT.hit = true;
      hitT.flash = zone.name === 'centro' ? 0.48 : 0.35;
      hitT.life = hitT.flash;
      state.hits++;
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.multiplier = 1 + Math.min(4, Math.floor(state.combo / 3)) * 0.5;
      const pts = Math.round(zone.pts * state.multiplier);
      state.score += pts;
      PoligonoAudio.hit(zone.name);
      if (state.combo > 1 && state.combo % 3 === 0) PoligonoAudio.combo(state.combo);
      if (PoligonoAudio.haptic) {
        if (zone.name === 'centro') PoligonoAudio.haptic([18, 30, 22]);
        else if (state.combo > 1 && state.combo % 3 === 0) PoligonoAudio.haptic([12, 35, 18]);
        else PoligonoAudio.haptic(10);
      }

      /* Light juice: soft hit flash + shake escalonado (respeita reduced-motion) */
      const isCentro = zone.name === 'centro';
      if (!PoligonoInput.prefersReducedMotion()) {
        const shakeAmt = isCentro ? 0.55 : (zone.name === 'anel' ? 0.4 : 0.3);
        shake = Math.max(shake, shakeAmt);
        hitFlash = Math.max(hitFlash, isCentro ? 0.55 : 0.32);
        /* Combo streak juice: extra amber punch every 3 hits */
        if (state.combo > 1 && state.combo % 3 === 0) {
          hitFlash = Math.max(hitFlash, 0.72);
          shake = Math.max(shake, 0.7);
        }
        if (isCentro) perfectFlash = Math.max(perfectFlash, 0.95);
      } else {
        hitFlash = Math.max(hitFlash, isCentro ? 0.28 : 0.18);
        if (isCentro) perfectFlash = Math.max(perfectFlash, 0.35);
      }

      const scr = screenOf(hitT);
      markers.push({
        x: scr.x, y: scr.y, life: isCentro ? 0.78 : 0.62,
        text: isCentro ? 'PERFEITO' : (zone.name === 'anel' ? 'ANEL' : 'BORDA'),
        pts, size: isCentro ? 16 : 10,
        pop: isCentro, perfect: isCentro
      });
      if (isCentro) {
        markers.push({
          x: scr.x, y: scr.y - 0.06, life: 0.7,
          text: 'CENTRO', pts: 0, toast: true, pop: true, perfect: true
        });
      }
      if (state.combo > 1 && state.combo % 3 === 0) {
        markers.push({
          x: cx, y: cy - 0.05, life: 0.95,
          text: 'COMBO ×' + state.combo, pts: 0, toast: true, pop: true, streak: true
        });
      }
      /* Accuracy meter pulse on centro / streak (DOM) */
      if (typeof PoligonoUI !== 'undefined' && PoligonoUI.pulseAccuracy) {
        if (isCentro || (state.combo > 1 && state.combo % 3 === 0)) {
          PoligonoUI.pulseAccuracy(isCentro ? 'perfect' : 'streak');
        }
      }
      if (typeof PoligonoUI !== 'undefined' && PoligonoUI.pulseCombo) {
        PoligonoUI.pulseCombo(state.combo);
      }
      if (use3d) {
        PoligonoScene.burstAt(hitT, hitT.kind, zone.name === 'centro' ? 1.35 : 1);
      } else {
        burst(
          hitT.x * w, hitT.y * h,
          hitT.kind === 'steel' ? '#c0c8d0' : '#c4893a',
          zone.name === 'centro' ? 18 : 12
        );
      }

      if (mode === 'desafio' && state.score >= state.goal) {
        finish(true);
      }
    } else {
      const broke = state.combo >= 2;
      const hadStreak = state.combo;
      state.combo = 0;
      state.multiplier = 1;
      PoligonoAudio.miss();
      if (PoligonoAudio.haptic) PoligonoAudio.haptic(broke ? [8, 40, 14] : 8);
      /* Miss flash — clearer feedback; gated reduced-motion (weaker/static tint) */
      if (!PoligonoInput.prefersReducedMotion()) {
        missFlash = Math.max(missFlash, broke ? 0.85 : 0.55);
        shake = Math.max(shake, broke ? 0.35 : 0.18);
      } else {
        missFlash = Math.max(missFlash, 0.32);
      }
      markers.push({
        x: cx, y: cy, life: broke ? 0.55 : 0.42,
        text: 'ERROU', pts: 0, miss: true, pop: true
      });
      if (broke) {
        markers.push({
          x: cx, y: cy - 0.07, life: 0.75,
          text: 'COMBO QUEBRADO', pts: 0, toast: true, miss: true
        });
      }
      if (typeof PoligonoUI !== 'undefined' && PoligonoUI.pulseCombo) {
        PoligonoUI.pulseCombo(0, { broke: hadStreak > 0 });
      }
      if (use3d) PoligonoScene.missAt(cx, cy);
    }
    hud();
  }

  function burst(x, y, color, count) {
    const base = count || 12;
    const n = PoligonoInput.prefersReducedMotion() ? Math.max(3, Math.floor(base * 0.35)) : base;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 45 + Math.random() * 140;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 35,
        life: 0.28 + Math.random() * 0.4,
        color,
        r: 1.6 + Math.random() * 2.8
      });
    }
  }

  function finish(win) {
    state.ended = true;
    state.win = !!win;
    state.timeLeft = Math.max(0, state.timeLeft);
    PoligonoAudio.end(!!win);
    hud();
    if (onEnd) onEnd(state, mode);
  }

  function endSession() {
    if (!state.ended) finish(mode === 'desafio' ? state.score >= state.goal : true);
  }

  function draw() {
    if (use3d) {
      PoligonoScene.setReducedMotion(PoligonoInput.prefersReducedMotion());
      PoligonoScene.setFx({
        shake, recoilX: recoil.x, recoilY: recoil.y, muzzle: muzzleFlash, hitFlash, missFlash, perfectFlash
      });
      PoligonoScene.syncTargets(targets);
      drawOverlay(fxCtx || ctx);
      return;
    }

    const g = ctx;
    if (!g) return;
    g.clearRect(0, 0, w, h);

    let ox = 0, oy = 0;
    if (shake > 0 && !PoligonoInput.prefersReducedMotion()) {
      ox = (Math.random() - 0.5) * shake * 6;
      oy = (Math.random() - 0.5) * shake * 6;
    }
    g.save();
    g.translate(ox, oy);

    drawRange(g);

    const sorted = targets.slice().sort((a, b) => a.lane - b.lane);
    for (const t of sorted) drawTarget(g, t);

    drawHitFlash(g);
    drawMissFlash(g);
    drawParticles(g);
    drawMarkers(g);
    drawCrosshair(g);
    g.restore();
  }

  function drawOverlay(g) {
    if (!g) return;
    g.clearRect(0, 0, w, h);
    drawSpawnTelegraphs(g);
    drawHitFlash(g);
    drawMissFlash(g);
    drawParticles(g);
    drawMarkers(g);
    if (running && !state.ended) drawCrosshair(g);
  }

  function drawSpawnTelegraphs(g) {
    if (!g || PoligonoInput.prefersReducedMotion()) return;
    for (const t of targets) {
      if (t.hit || !(t.telegraph > 0)) continue;
      const p = screenOf(t);
      const x = p.x * w;
      const y = p.y * h;
      const base = use3d ? (28 + t.lane * 6) : (t.pixelR || t.r);
      const k = t.telegraph / 0.48;
      const ringR = base * (1.6 + k * 0.7);
      g.strokeStyle = 'rgba(232,184,106,' + (0.2 + (1 - k) * 0.45) + ')';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, ringR, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(232,184,106,' + (0.06 + (1 - k) * 0.1) + ')';
      g.beginPath();
      g.arc(x, y, base * (0.7 + (1 - k) * 0.35), 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawHitFlash(g) {
    if (hitFlash <= 0) return;
    const a = Math.min(0.28, hitFlash * 0.42);
    const grd = g.createRadialGradient(w * 0.5, h * 0.42, w * 0.08, w * 0.5, h * 0.42, w * 0.7);
    grd.addColorStop(0, 'rgba(232,184,106,' + (a * 0.55) + ')');
    grd.addColorStop(0.55, 'rgba(196,137,58,' + (a * 0.22) + ')');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  function drawMissFlash(g) {
    if (missFlash <= 0) return;
    const a = Math.min(0.42, missFlash * 0.5);
    /* Red edge vignette — clear miss cue without covering the lane */
    const grd = g.createRadialGradient(w * 0.5, h * 0.45, w * 0.22, w * 0.5, h * 0.45, w * 0.78);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.55, 'rgba(168,72,56,' + (a * 0.18) + ')');
    grd.addColorStop(1, 'rgba(168,72,56,' + (a * 0.55) + ')');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  function drawParticles(g) {
    for (const p of particles) {
      g.globalAlpha = Math.max(0, p.life * 2);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }

  function drawMarkers(g) {
    for (const m of markers) {
      const fade = Math.min(1, m.life * 2.8);
      g.globalAlpha = fade;
      g.textAlign = 'center';
      if (m.toast) {
        const pop = m.pop && !PoligonoInput.prefersReducedMotion()
          ? (1 + Math.max(0, (m.life - 0.55) * 1.1))
          : 1;
        g.save();
        g.translate(m.x * w, m.y * h);
        g.scale(pop, pop);
        g.fillStyle = m.miss ? '#d46858' : (m.perfect ? '#ffe6a8' : '#e8b86a');
        g.font = 'bold ' + (m.streak ? 18 : 16) + 'px system-ui, sans-serif';
        g.fillText(m.text, 0, 0);
        g.restore();
        g.globalAlpha = 1;
        continue;
      }
      g.fillStyle = m.miss ? '#a84838' : '#e8b86a';
      const popHit = m.pop && !PoligonoInput.prefersReducedMotion()
        ? (1 + Math.max(0, (m.life - 0.4) * 0.9))
        : 1;
      g.font = 'bold ' + Math.round(14 * popHit) + 'px system-ui, sans-serif';
      g.fillText(m.text, m.x * w, m.y * h - 22);
      if (m.pts) {
        g.font = 'bold 13px system-ui, sans-serif';
        g.fillText('+' + m.pts, m.x * w, m.y * h - 6);
      }
      if (!m.miss) {
        const s = m.size || 10;
        const mx = m.x * w, my = m.y * h;
        g.strokeStyle = 'rgba(20,16,12,0.85)';
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(mx - s, my - s); g.lineTo(mx + s, my + s);
        g.moveTo(mx + s, my - s); g.lineTo(mx - s, my + s);
        g.stroke();
        g.strokeStyle = '#e8b86a';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(mx - s, my - s); g.lineTo(mx + s, my + s);
        g.moveTo(mx + s, my - s); g.lineTo(mx - s, my + s);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  function drawRange(g) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#12100e');
    grd.addColorStop(0.45, '#1a1612');
    grd.addColorStop(1, '#0c0a08');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    g.fillStyle = '#0e0c0a';
    g.fillRect(0, 0, w, h * 0.28);

    for (let i = 0; i < 5; i++) {
      const lx = w * (0.1 + i * 0.2);
      const lg = g.createRadialGradient(lx, h * 0.02, 0, lx, h * 0.02, h * 0.25);
      lg.addColorStop(0, 'rgba(196,137,58,0.12)');
      lg.addColorStop(1, 'transparent');
      g.fillStyle = lg;
      g.fillRect(lx - w * 0.2, 0, w * 0.4, h * 0.4);
    }

    g.strokeStyle = 'rgba(138,90,43,0.25)';
    g.lineWidth = 1;
    const vanishingY = h * 0.18;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x0 = w * (0.05 + t * 0.9);
      g.beginPath();
      g.moveTo(w * 0.5, vanishingY);
      g.lineTo(x0, h * 0.92);
      g.stroke();
    }
    for (let lane = 0; lane < 3; lane++) {
      const y = laneY(lane) * h + 40 * laneScale(lane);
      g.strokeStyle = 'rgba(196,137,58,0.08)';
      g.beginPath();
      g.moveTo(w * 0.08, y);
      g.lineTo(w * 0.92, y);
      g.stroke();
    }

    g.strokeStyle = 'rgba(196,137,58,0.2)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h * 0.88, w, h * 0.12);
  }

  function drawTarget(g, t) {
    const x = t.x * w;
    const y = t.y * h;
    const r = t.pixelR || t.r;
    g.save();
    if (t.hit) g.globalAlpha = Math.max(0, t.flash * 2);
    else if (t.telegraph > 0 || (t.appear != null && t.appear < 1)) {
      const ap = t.appear != null ? t.appear : 1;
      g.globalAlpha = 0.22 + ap * 0.78;
      /* Soft spawn telegraph ring (reduced-motion skips via telegraph=0) */
      if (t.telegraph > 0) {
        const k = t.telegraph / 0.48;
        const ringR = r * (1.55 + k * 0.55);
        g.strokeStyle = 'rgba(232,184,106,' + (0.18 + (1 - k) * 0.42) + ')';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, ringR, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = 'rgba(196,137,58,' + (0.12 + (1 - k) * 0.28) + ')';
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(x, y, r * (0.85 + ap * 0.2), 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.strokeStyle = 'rgba(160,150,140,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y - r - 18);
    g.lineTo(x, y - r);
    g.stroke();
    g.fillStyle = 'rgba(120,110,100,0.5)';
    g.fillRect(x - 10, y - r - 22, 20, 6);

    if (t.kind === 'steel') {
      const sg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      sg.addColorStop(0, '#9aa3ac');
      sg.addColorStop(1, '#3a4048');
      g.fillStyle = sg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c0c8d0';
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = 'rgba(20,22,26,0.55)';
      g.lineWidth = 1.2;
      for (const ring of RINGS) {
        g.beginPath();
        g.arc(x, y, r * ring.r, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#1a1c20';
      g.beginPath();
      g.arc(x, y, r * 0.08, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#e8e2d6';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      const colors = ['#c4893a', '#e8e2d6', '#a84838', '#e8e2d6', '#1a120c'];
      const radii = [1, 0.78, 0.55, 0.32, 0.14];
      for (let i = 0; i < radii.length; i++) {
        g.fillStyle = colors[i];
        g.beginPath();
        g.arc(x, y, r * radii[i], 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(40,30,20,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }

    g.restore();
  }

  function drawCrosshair(g) {
    const cx = (cross.x + recoil.x) * w;
    const cy = (cross.y + recoil.y) * h;
    const touchUi = document.body.classList.contains('touch-ui');
    const aim = PoligonoInput.getAim();
    const aiming = !!(aim && aim.active);
    /* Mobile: larger reticle + clearer aim-active ring */
    const s = touchUi ? 18 : 14;
    const gap = touchUi ? 5 : 4;
    const ringR = touchUi ? 28 : 22;

    if (muzzleFlash > 0 && !PoligonoInput.prefersReducedMotion()) {
      const a = Math.min(1, muzzleFlash);
      g.strokeStyle = 'rgba(232,184,106,' + (0.55 * a) + ')';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, 10 + (1 - a) * 18, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,240,200,' + (0.25 * a) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, 6 + (1 - a) * 10, 0, Math.PI * 2);
      g.stroke();
    }

    /* Perfect-center reward ring */
    if (perfectFlash > 0) {
      const a = Math.min(1, perfectFlash);
      const expand = PoligonoInput.prefersReducedMotion() ? 0 : (1 - a) * 26;
      g.strokeStyle = 'rgba(255,230,168,' + (0.75 * a) + ')';
      g.lineWidth = touchUi ? 2.6 : 2.2;
      g.beginPath();
      g.arc(cx, cy, ringR + 4 + expand, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(232,184,106,' + (0.45 * a) + ')';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(cx, cy, ringR - 2 + expand * 0.5, 0, Math.PI * 2);
      g.stroke();
    }

    /* Touch aim-active: soft pulse ring so mira feedback is obvious */
    if (touchUi && aiming && !aimLocked) {
      const pulse = PoligonoInput.prefersReducedMotion()
        ? 0.55
        : (0.4 + 0.35 * Math.abs(Math.sin(performance.now() / 220)));
      g.strokeStyle = 'rgba(232,184,106,' + pulse + ')';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, ringR + 6, 0, Math.PI * 2);
      g.stroke();
    }

    /* Aim lock — reticle on a ready target (mobile FOGO cue) */
    if (aimLocked && warmup <= 0) {
      const pulse = PoligonoInput.prefersReducedMotion()
        ? 0.85
        : (0.65 + 0.3 * Math.abs(Math.sin(performance.now() / 160)));
      g.strokeStyle = 'rgba(255,230,168,' + pulse + ')';
      g.lineWidth = touchUi ? 3 : 2.4;
      g.beginPath();
      g.arc(cx, cy, ringR + (touchUi ? 10 : 8), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(232,184,106,' + (0.45 * pulse) + ')';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy, ringR + (touchUi ? 4 : 3), 0, Math.PI * 2);
      g.stroke();
      /* diamond ticks */
      const d = ringR + (touchUi ? 14 : 12);
      g.strokeStyle = 'rgba(255,230,168,' + (0.9 * pulse) + ')';
      g.lineWidth = touchUi ? 2 : 1.6;
      g.beginPath();
      g.moveTo(cx, cy - d - 4); g.lineTo(cx, cy - d + 2);
      g.moveTo(cx, cy + d - 2); g.lineTo(cx, cy + d + 4);
      g.moveTo(cx - d - 4, cy); g.lineTo(cx - d + 2, cy);
      g.moveTo(cx + d - 2, cy); g.lineTo(cx + d + 4, cy);
      g.stroke();
    }

    g.strokeStyle = 'rgba(12,10,8,0.75)';
    g.lineWidth = touchUi ? 3.8 : 3.2;
    g.beginPath();
    g.moveTo(cx - s, cy); g.lineTo(cx - gap, cy);
    g.moveTo(cx + gap, cy); g.lineTo(cx + s, cy);
    g.moveTo(cx, cy - s); g.lineTo(cx, cy - gap);
    g.moveTo(cx, cy + gap); g.lineTo(cx, cy + s);
    g.stroke();

    g.strokeStyle = 'rgba(232,184,106,0.95)';
    g.lineWidth = touchUi ? 2 : 1.5;
    g.beginPath();
    g.moveTo(cx - s, cy); g.lineTo(cx - gap, cy);
    g.moveTo(cx + gap, cy); g.lineTo(cx + s, cy);
    g.moveTo(cx, cy - s); g.lineTo(cx, cy - gap);
    g.moveTo(cx, cy + gap); g.lineTo(cx, cy + s);
    g.stroke();

    g.fillStyle = 'rgba(12,10,8,0.7)';
    g.beginPath();
    g.arc(cx, cy, touchUi ? 3 : 2.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(232,184,106,0.95)';
    g.beginPath();
    g.arc(cx, cy, touchUi ? 1.9 : 1.5, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = 'rgba(12,10,8,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, ringR, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = aimLocked
      ? 'rgba(255,230,168,0.9)'
      : (aiming && touchUi
        ? 'rgba(232,184,106,0.7)'
        : 'rgba(196,137,58,0.4)');
    g.lineWidth = touchUi ? 1.4 : 1;
    g.beginPath();
    g.arc(cx, cy, ringR, 0, Math.PI * 2);
    g.stroke();
  }

  return {
    init, start, stop, setPaused, isPaused, isRunning,
    getState, getMode, accuracy, endSession, resize
  };
})();
