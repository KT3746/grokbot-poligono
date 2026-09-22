/* POLÍGONO — core shooting range loop */
const PoligonoGame = (() => {
  let canvas, ctx;
  let running = false;
  let paused = false;
  let mode = 'treino'; // treino | desafio
  let lastTs = 0;
  let w = 0, h = 0, dpr = 1;

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
    ctx = canvas.getContext('2d');
    onEnd = opts.onEnd || null;
    onHud = opts.onHud || null;
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    cross = { x: 0.5, y: 0.45 };
  }

  function start(m) {
    resetStats(m || 'treino');
    running = true;
    paused = false;
    lastTs = 0;
    spawnInitial();
    hud();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    paused = false;
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
    if (onHud) onHud(state, mode);
  }

  function spawnInitial() {
    for (let i = 0; i < 3; i++) spawnTarget(i % 3 === 0);
  }

  function laneY(lane) {
    // lanes 0 far .. 2 near — perspective depth
    const base = 0.22;
    return base + lane * 0.18;
  }

  function laneScale(lane) {
    return 0.55 + lane * 0.22;
  }

  function spawnTarget(moving) {
    const lane = Math.floor(Math.random() * 3);
    const scale = laneScale(lane);
    const radius = (28 + Math.random() * 18) * scale * (Math.min(w, h) / 400);
    const kind = Math.random() < 0.35 ? 'steel' : 'paper';
    const y = laneY(lane) + (Math.random() * 0.04 - 0.02);
    const x = 0.12 + Math.random() * 0.76;
    const t = {
      x, y, r: radius, lane, kind,
      moving: !!moving,
      vx: moving ? (0.08 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1) : 0,
      bounce: moving && Math.random() < 0.4,
      life: 8 + Math.random() * 6,
      hit: false,
      flash: 0,
      id: Math.random().toString(36).slice(2)
    };
    // avoid stacking too close
    for (const o of targets) {
      const dx = (o.x - t.x) * w;
      const dy = (o.y - t.y) * h;
      if (Math.hypot(dx, dy) < (o.r + t.r) * 1.4) {
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
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    // aim lag for precision feel
    const aim = PoligonoInput.getAim();
    const lag = PoligonoInput.prefersReducedMotion() ? 1 : 0.22;
    cross.x += (aim.x - cross.x) * Math.min(1, lag + dt * 8);
    cross.y += (aim.y - cross.y) * Math.min(1, lag + dt * 8);

    recoil.x *= Math.pow(0.01, dt);
    recoil.y *= Math.pow(0.01, dt);
    if (Math.abs(recoil.x) < 0.0001) recoil.x = 0;
    if (Math.abs(recoil.y) < 0.0001) recoil.y = 0;
    shake = Math.max(0, shake - dt * 4);

    if (mode === 'desafio' && !state.ended) {
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

    if (PoligonoInput.consumeFire()) fire();

    // desafio wave bump
    if (mode === 'desafio' && state.score >= state.wave * 400) {
      state.wave++;
    }

    hud();
  }

  function fire() {
    if (state.ended || paused || !running) return;
    PoligonoAudio.ensure();
    PoligonoAudio.shot();
    state.shots++;

    const cx = cross.x + recoil.x;
    const cy = cross.y + recoil.y;
    const px = cx * w;
    const py = cy * h;

    // slight recoil kick
    recoil.x += (Math.random() * 0.02 - 0.01);
    recoil.y -= 0.018 + Math.random() * 0.01;
    if (!PoligonoInput.prefersReducedMotion()) shake = 0.35;

    // hit test front-to-back (near lanes first)
    const sorted = targets.slice().filter(t => !t.hit).sort((a, b) => b.lane - a.lane);
    let hitT = null;
    let zone = null;
    let distNorm = 1;

    for (const t of sorted) {
      const dx = px - t.x * w;
      const dy = py - t.y * h;
      const dist = Math.hypot(dx, dy);
      if (dist <= t.r) {
        hitT = t;
        distNorm = dist / t.r;
        for (const ring of RINGS) {
          if (distNorm <= ring.r) { zone = ring; break; }
        }
        break;
      }
    }

    if (hitT && zone) {
      hitT.hit = true;
      hitT.flash = 0.35;
      hitT.life = 0.35;
      state.hits++;
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.multiplier = 1 + Math.min(4, Math.floor(state.combo / 3)) * 0.5;
      const pts = Math.round(zone.pts * state.multiplier);
      state.score += pts;
      PoligonoAudio.hit(zone.name);
      if (state.combo > 1 && state.combo % 3 === 0) PoligonoAudio.combo(state.combo);

      markers.push({ x: hitT.x, y: hitT.y, life: 0.45, text: zone.name === 'centro' ? 'CENTRO' : (zone.name === 'anel' ? 'ANEL' : 'BORDA'), pts });
      burst(hitT.x * w, hitT.y * h, hitT.kind === 'steel' ? '#c0c8d0' : '#c4893a');

      if (mode === 'desafio' && state.score >= state.goal) {
        finish(true);
      }
    } else {
      state.combo = 0;
      state.multiplier = 1;
      PoligonoAudio.miss();
      markers.push({ x: cx, y: cy, life: 0.3, text: '×', pts: 0, miss: true });
    }
    hud();
  }

  function burst(x, y, color) {
    const n = PoligonoInput.prefersReducedMotion() ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 0.25 + Math.random() * 0.35,
        color,
        r: 1.5 + Math.random() * 2.5
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
    const g = ctx;
    g.clearRect(0, 0, w, h);

    let ox = 0, oy = 0;
    if (shake > 0 && !PoligonoInput.prefersReducedMotion()) {
      ox = (Math.random() - 0.5) * shake * 6;
      oy = (Math.random() - 0.5) * shake * 6;
    }
    g.save();
    g.translate(ox, oy);

    drawRange(g);

    // targets back to front
    const sorted = targets.slice().sort((a, b) => a.lane - b.lane);
    for (const t of sorted) drawTarget(g, t);

    for (const p of particles) {
      g.globalAlpha = Math.max(0, p.life * 2);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    for (const m of markers) {
      g.globalAlpha = Math.min(1, m.life * 3);
      g.fillStyle = m.miss ? '#a84838' : '#e8b86a';
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(m.text, m.x * w, m.y * h - 18);
      if (m.pts) {
        g.font = '12px system-ui, sans-serif';
        g.fillText('+' + m.pts, m.x * w, m.y * h - 4);
      }
      if (!m.miss) {
        // hit X marker
        g.strokeStyle = '#e8b86a';
        g.lineWidth = 2;
        const s = 8;
        const mx = m.x * w, my = m.y * h;
        g.beginPath();
        g.moveTo(mx - s, my - s); g.lineTo(mx + s, my + s);
        g.moveTo(mx + s, my - s); g.lineTo(mx - s, my + s);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    drawCrosshair(g);
    g.restore();
  }

  function drawRange(g) {
    // bay walls / floor perspective
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#12100e');
    grd.addColorStop(0.45, '#1a1612');
    grd.addColorStop(1, '#0c0a08');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // back wall
    g.fillStyle = '#0e0c0a';
    g.fillRect(0, 0, w, h * 0.28);

    // ceiling lights (dim amber)
    for (let i = 0; i < 5; i++) {
      const lx = w * (0.1 + i * 0.2);
      const lg = g.createRadialGradient(lx, h * 0.02, 0, lx, h * 0.02, h * 0.25);
      lg.addColorStop(0, 'rgba(196,137,58,0.12)');
      lg.addColorStop(1, 'transparent');
      g.fillStyle = lg;
      g.fillRect(lx - w * 0.2, 0, w * 0.4, h * 0.4);
    }

    // lane lines / rails perspective
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
    // horizontal depth marks
    for (let lane = 0; lane < 3; lane++) {
      const y = laneY(lane) * h + 40 * laneScale(lane);
      g.strokeStyle = 'rgba(196,137,58,0.08)';
      g.beginPath();
      g.moveTo(w * 0.08, y);
      g.lineTo(w * 0.92, y);
      g.stroke();
    }

    // booth frame
    g.strokeStyle = 'rgba(196,137,58,0.2)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h * 0.88, w, h * 0.12);
  }

  function drawTarget(g, t) {
    const x = t.x * w;
    const y = t.y * h;
    const r = t.r;
    g.save();
    if (t.hit) g.globalAlpha = Math.max(0, t.flash * 2);

    // hanger
    g.strokeStyle = 'rgba(160,150,140,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y - r - 18);
    g.lineTo(x, y - r);
    g.stroke();
    g.fillStyle = 'rgba(120,110,100,0.5)';
    g.fillRect(x - 10, y - r - 22, 20, 6);

    if (t.kind === 'steel') {
      // steel plate silhouette (rounded rect-ish circle with metallic fill)
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
      // rings etched
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
      // paper bullseye
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

    if (t.moving) {
      g.fillStyle = 'rgba(232,184,106,0.35)';
      g.font = '10px system-ui';
      g.textAlign = 'center';
      g.fillText('→', x, y + r + 12);
    }

    g.restore();
  }

  function drawCrosshair(g) {
    const cx = (cross.x + recoil.x) * w;
    const cy = (cross.y + recoil.y) * h;
    const s = 14;
    g.strokeStyle = 'rgba(232,184,106,0.9)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx - s, cy); g.lineTo(cx - 4, cy);
    g.moveTo(cx + 4, cy); g.lineTo(cx + s, cy);
    g.moveTo(cx, cy - s); g.lineTo(cx, cy - 4);
    g.moveTo(cx, cy + 4); g.lineTo(cx, cy + s);
    g.stroke();
    g.fillStyle = 'rgba(232,184,106,0.95)';
    g.beginPath();
    g.arc(cx, cy, 1.5, 0, Math.PI * 2);
    g.fill();
    // outer ring
    g.strokeStyle = 'rgba(196,137,58,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, 22, 0, Math.PI * 2);
    g.stroke();
  }

  return {
    init, start, stop, setPaused, isPaused, isRunning,
    getState, getMode, accuracy, endSession, resize
  };
})();
