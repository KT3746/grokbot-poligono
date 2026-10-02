/* POLÍGONO — screens & labels */
const PoligonoUI = (() => {
  const TIP_KEY = 'poligono-tip-seen';
  const DAILY_KEY = 'poligono-daily-meta';
  let hintActive = false;
  let hintLeaveTimer = null;

  function $(id) { return document.getElementById(id); }

  function brtDayKey() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (_) {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  }

  function loadDaily() {
    try {
      const raw = localStorage.getItem(DAILY_KEY);
      if (!raw) return { day: brtDayKey(), bestAcc: 0, bestCombo: 0 };
      const data = JSON.parse(raw);
      if (!data || data.day !== brtDayKey()) return { day: brtDayKey(), bestAcc: 0, bestCombo: 0 };
      return {
        day: data.day,
        bestAcc: Math.max(0, Number(data.bestAcc) || 0),
        bestCombo: Math.max(0, Number(data.bestCombo) || 0)
      };
    } catch (_) {
      return { day: brtDayKey(), bestAcc: 0, bestCombo: 0 };
    }
  }

  function saveDaily(data) {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function formatDailyLine(meta) {
    if (!meta || (!meta.bestAcc && !meta.bestCombo)) {
      return 'Melhor do dia: ainda sem marca';
    }
    const bits = [];
    if (meta.bestAcc > 0) bits.push('precisão ' + meta.bestAcc + '%');
    if (meta.bestCombo > 0) bits.push('combo ×' + meta.bestCombo);
    return 'Melhor do dia: ' + bits.join(' · ');
  }

  function refreshDailyMeta() {
    const line = formatDailyLine(loadDaily());
    const menu = $('menu-daily');
    if (menu) menu.textContent = line;
    return line;
  }

  /** Soft update: only raises daily bests; returns what improved. */
  function recordDaily(acc, bestCombo) {
    const meta = loadDaily();
    const out = { accNew: false, comboNew: false, meta };
    const a = (acc == null || isNaN(acc)) ? 0 : Math.max(0, Math.min(100, Math.round(acc)));
    const c = Math.max(0, Math.round(bestCombo || 0));
    if (a > 0 && a >= meta.bestAcc) {
      if (a > meta.bestAcc) out.accNew = true;
      meta.bestAcc = a;
    }
    if (c > 0 && c >= meta.bestCombo) {
      if (c > meta.bestCombo) out.comboNew = true;
      meta.bestCombo = c;
    }
    saveDaily(meta);
    out.meta = meta;
    refreshDailyMeta();
    return out;
  }

  function show(id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
  }

  function hide(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }

  function hideAllScreens() {
    ['screen-menu', 'screen-tip', 'screen-mode', 'screen-pause', 'screen-results'].forEach(hide);
  }

  function showMenu() {
    hideAllScreens();
    show('screen-menu');
    hide('hud');
    hide('fire-zone');
    dismissHint(true);
    syncMuteLabels();
    refreshDailyMeta();
  }

  function showTip(then) {
    hideAllScreens();
    show('screen-tip');
    const btn = $('btn-tip-ok');
    const handler = () => {
      btn.removeEventListener('click', handler);
      try { localStorage.setItem(TIP_KEY, '1'); } catch (_) {}
      PoligonoAudio.ui();
      if (then) then();
    };
    btn.addEventListener('click', handler);
  }

  function tipSeen() {
    try { return localStorage.getItem(TIP_KEY) === '1'; } catch (_) { return false; }
  }

  function showMode() {
    hideAllScreens();
    show('screen-mode');
  }

  function showPause() {
    show('screen-pause');
    const panel = document.querySelector('#screen-pause .panel');
    if (panel) {
      panel.classList.add('pause-panel');
      /* restart attention pulse for mobile clarity */
      panel.classList.remove('pause-enter');
      void panel.offsetWidth;
      panel.classList.add('pause-enter');
    }
  }

  function hidePause() {
    hide('screen-pause');
  }

  function wantsFireButton() {
    const mq = window.matchMedia ? window.matchMedia.bind(window) : null;
    const coarse = mq ? mq('(pointer: coarse)').matches : false;
    const fine = mq ? mq('(pointer: fine)').matches : true;
    const hover = mq ? mq('(hover: hover)').matches : true;
    const touchPts = (navigator.maxTouchPoints || 0);
    const narrow = Math.min(window.innerWidth, window.innerHeight) <= 820;
    // Mobile-first: show FOGO unless clearly mouse-only desktop
    if (coarse || touchPts > 0) return true;
    if (narrow && ('ontouchstart' in window)) return true;
    if (fine && hover && touchPts === 0 && !('ontouchstart' in window)) return false;
    // Ambiguous (emulators / hybrids): prefer FOGO — Thomas joga no celular
    return true;
  }

  function applyFireButton() {
    const want = wantsFireButton();
    document.body.classList.toggle('touch-ui', want);
    document.body.classList.toggle('desktop-aim', !want);
    if (want) show('fire-zone');
    else hide('fire-zone');
  }

  function showPlaying() {
    hideAllScreens();
    show('hud');
    applyFireButton();
    showOnboardingHint();
  }

  function showResults(state, mode) {
    dismissHint(true);
    hide('fire-zone');
    hideAllScreens();
    show('screen-results');
    const win = mode === 'desafio' ? state.win : true;
    $('results-eyebrow').textContent = mode === 'desafio'
      ? (win ? 'meta alcançada' : 'tempo esgotado')
      : 'sessão de treino';
    $('results-title').textContent = mode === 'desafio'
      ? (win ? 'Desafio concluído' : 'Desafio encerrado')
      : 'Treino encerrado';

    const shots = state.shots || 0;
    const hits = state.hits || 0;
    const accNum = shots ? Math.round((hits / shots) * 100) : null;
    const accLabel = accNum == null ? '—' : (accNum + '%');
    const bestCombo = state.bestCombo || 0;

    $('res-score').textContent = String(state.score);
    $('res-acc').textContent = accLabel;
    $('res-combo').textContent = '×' + bestCombo;
    $('res-shots').textContent = String(shots);

    const hitsEl = $('res-hits');
    if (hitsEl) {
      hitsEl.textContent = shots
        ? (hits + ' acerto' + (hits === 1 ? '' : 's') + ' de ' + shots)
        : 'nenhum tiro';
    }

    const summary = $('results-summary');
    if (summary) {
      if (!shots) {
        summary.textContent = 'Nenhum disparo nesta sessão.';
      } else {
        summary.textContent = hits + ' acerto' + (hits === 1 ? '' : 's')
          + ' · precisão ' + accLabel
          + ' · melhor combo ×' + bestCombo
          + ' · ' + state.score + ' pts';
      }
    }

    const bar = $('res-acc-bar');
    if (bar) {
      const pct = accNum == null ? 0 : accNum;
      bar.style.width = pct + '%';
      bar.classList.toggle('is-good', pct >= 70);
      bar.classList.toggle('is-ok', pct >= 40 && pct < 70);
      bar.classList.toggle('is-low', pct > 0 && pct < 40);
    }

    const recorded = recordDaily(accNum, bestCombo);
    const accNote = $('res-acc-note');
    const comboNote = $('res-combo-note');
    if (accNote) {
      accNote.textContent = recorded.accNew ? 'novo melhor do dia' : '';
      accNote.classList.toggle('is-record', !!recorded.accNew);
    }
    if (comboNote) {
      comboNote.textContent = recorded.comboNew ? 'novo melhor do dia' : '';
      comboNote.classList.toggle('is-record', !!recorded.comboNew);
    }

    const dailyEl = $('results-daily');
    if (dailyEl) {
      dailyEl.textContent = formatDailyLine(recorded.meta);
    }

    const panel = document.querySelector('#screen-results .panel');
    if (panel) {
      panel.classList.remove('results-enter');
      void panel.offsetWidth;
      panel.classList.add('results-enter');
    }
  }

  function updateHud(state, mode) {
    const scoreEl = $('hud-score');
    const goalEl = $('hud-goal');
    scoreEl.textContent = String(state.score);
    if (mode === 'desafio' && state.goal > 0) {
      if (goalEl) {
        goalEl.textContent = state.score + '/' + state.goal;
        goalEl.classList.remove('hidden');
      }
    } else if (goalEl) {
      goalEl.classList.add('hidden');
    }
    const acc = state.shots ? Math.round((state.hits / state.shots) * 100) + '%' : '—';
    $('hud-acc').textContent = acc;

    // combo streak clearly; multiplier subtle when >1
    const streak = Math.max(0, state.combo || 0);
    let comboText = String(streak);
    if (state.multiplier > 1) {
      const m = state.multiplier.toFixed(1).replace(/\.0$/, '');
      comboText = streak + ' · ×' + m;
    }
    const comboEl = $('hud-combo');
    const prev = comboEl.dataset.streak || '0';
    comboEl.textContent = comboText;
    comboEl.classList.toggle('combo-hot', state.combo >= 3);
    comboEl.classList.toggle('combo-broken', false);
    if (state.combo >= 3) comboEl.style.color = '#e8b86a';
    else comboEl.style.color = '';
    if (state.combo > 0 && String(state.combo) !== prev) {
      comboEl.classList.remove('combo-pop');
      // restart animation
      void comboEl.offsetWidth;
      comboEl.classList.add('combo-pop');
    }
    comboEl.dataset.streak = String(state.combo || 0);

    const tw = $('hud-time-wrap');
    if (mode === 'desafio') {
      tw.classList.remove('hidden');
      const t = Math.ceil(state.timeLeft);
      $('hud-time').textContent = t + 's';
    } else {
      tw.classList.add('hidden');
    }
  }


  function hintCopy() {
    return wantsFireButton()
      ? 'Arraste para mirar · FOGO para disparar'
      : 'Mire com o mouse · clique ou Espaço';
  }

  function showOnboardingHint() {
    const bar = $('hint-bar');
    if (!bar) return;
    if (hintLeaveTimer) { clearTimeout(hintLeaveTimer); hintLeaveTimer = null; }
    bar.textContent = hintCopy();
    bar.classList.remove('is-leaving', 'hidden');
    hintActive = true;
  }

  function dismissHint(immediate) {
    const bar = $('hint-bar');
    if (!hintActive && (!bar || bar.classList.contains('hidden'))) {
      hintActive = false;
      return;
    }
    hintActive = false;
    if (!bar) return;
    if (hintLeaveTimer) { clearTimeout(hintLeaveTimer); hintLeaveTimer = null; }
    if (immediate) {
      bar.classList.add('hidden');
      bar.classList.remove('is-leaving');
      return;
    }
    bar.classList.add('is-leaving');
    hintLeaveTimer = setTimeout(() => {
      bar.classList.add('hidden');
      bar.classList.remove('is-leaving');
      hintLeaveTimer = null;
    }, 280);
  }

  function isHintActive() { return hintActive; }

  function pulseAccuracy(kind) {
    const el = $('hud-acc');
    if (!el) return;
    el.classList.remove('acc-pulse', 'acc-perfect');
    void el.offsetWidth;
    el.classList.add('acc-pulse');
    if (kind === 'perfect') el.classList.add('acc-perfect');
  }

  function pulseCombo(n, opts) {
    const comboEl = $('hud-combo');
    if (!comboEl) return;
    opts = opts || {};
    if (opts.broke) {
      comboEl.classList.remove('combo-hot', 'combo-pop');
      comboEl.classList.add('combo-broken');
      void comboEl.offsetWidth;
      // brief red flash then clear
      setTimeout(() => comboEl.classList.remove('combo-broken'), 420);
      return;
    }
    if (n >= 3) {
      comboEl.classList.add('combo-hot');
      comboEl.classList.remove('combo-pop');
      void comboEl.offsetWidth;
      comboEl.classList.add('combo-pop');
    }
  }

  function syncMuteLabels() {
    const m = PoligonoAudio.isMuted();
    const menu = $('btn-mute-menu');
    const hud = $('btn-mute');
    if (menu) menu.textContent = m ? 'Som: mudo' : 'Som: ligado';
    if (hud) {
      hud.textContent = m ? 'MUDO' : 'SOM';
      hud.setAttribute('aria-label', m ? 'Ativar som' : 'Silenciar');
    }
  }

  function toggleMute() {
    PoligonoAudio.setMuted(!PoligonoAudio.isMuted());
    syncMuteLabels();
    PoligonoAudio.ensure();
    if (!PoligonoAudio.isMuted()) PoligonoAudio.ui();
  }

  return {
    show, hide, showMenu, showTip, tipSeen, showMode,
    showPause, hidePause, showPlaying, showResults,
    updateHud, syncMuteLabels, toggleMute, applyFireButton, wantsFireButton,
    showOnboardingHint, dismissHint, isHintActive,
    pulseAccuracy, pulseCombo,
    refreshDailyMeta, loadDaily, recordDaily
  };
})();
