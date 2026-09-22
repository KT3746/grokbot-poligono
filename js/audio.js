/* POLÍGONO — Web Audio synths */
const PoligonoAudio = (() => {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('poligono-mute', muted ? '1' : '0'); } catch (_) {}
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  function isMuted() { return muted; }

  function loadMute() {
    try { muted = localStorage.getItem('poligono-mute') === '1'; } catch (_) {}
  }

  function tone(freq, dur, type, gain, slideTo) {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gain, freq) {
    const c = ensure();
    if (!c || !master) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 400;
    g.gain.value = gain || 0.2;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function shot() {
    noiseBurst(0.12, 0.32, 280);
    tone(90, 0.18, 'sawtooth', 0.28, 40);
    tone(55, 0.28, 'sine', 0.18, 28);
  }

  function hit(zone) {
    const base = zone === 'centro' ? 880 : zone === 'anel' ? 660 : 480;
    tone(base, 0.1, 'triangle', 0.2);
    setTimeout(() => tone(base * 1.35, 0.14, 'sine', 0.12), 40);
  }

  function miss() {
    noiseBurst(0.08, 0.08, 900);
    tone(140, 0.12, 'square', 0.05, 90);
  }

  function combo(n) {
    const f = 520 + Math.min(n, 8) * 40;
    tone(f, 0.08, 'sine', 0.14);
    setTimeout(() => tone(f * 1.25, 0.12, 'triangle', 0.12), 50);
  }

  function ui() {
    tone(380, 0.05, 'square', 0.05);
  }

  function end(win) {
    if (win) {
      tone(440, 0.12, 'sine', 0.14);
      setTimeout(() => tone(554, 0.12, 'sine', 0.14), 100);
      setTimeout(() => tone(659, 0.22, 'sine', 0.18), 200);
    } else {
      tone(220, 0.35, 'sawtooth', 0.14, 80);
      noiseBurst(0.2, 0.1, 200);
    }
  }

  loadMute();
  return { ensure, setMuted, isMuted, shot, hit, miss, combo, ui, end };
})();
