/* POLÍGONO — screens & labels */
const PoligonoUI = (() => {
  const TIP_KEY = 'poligono-tip-seen';

  function $(id) { return document.getElementById(id); }

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
    syncMuteLabels();
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
  }

  function hidePause() {
    hide('screen-pause');
  }

  function showPlaying() {
    hideAllScreens();
    show('hud');
    // fire button for coarse pointers
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse || ('ontouchstart' in window)) show('fire-zone');
    else hide('fire-zone');
  }

  function showResults(state, mode) {
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
    $('res-score').textContent = String(state.score);
    const acc = state.shots ? Math.round((state.hits / state.shots) * 100) + '%' : '—';
    $('res-acc').textContent = acc;
    $('res-combo').textContent = '×' + state.bestCombo;
    $('res-shots').textContent = String(state.shots);
  }

  function updateHud(state, mode) {
    $('hud-score').textContent = String(state.score);
    const acc = state.shots ? Math.round((state.hits / state.shots) * 100) + '%' : '—';
    $('hud-acc').textContent = acc;
    const mult = state.multiplier > 1 ? ('×' + state.multiplier.toFixed(1).replace(/\.0$/, '')) : ('×' + Math.max(1, state.combo || 1));
    $('hud-combo').textContent = state.combo > 0 ? ('×' + state.combo) : '×1';
    if (state.combo >= 3) $('hud-combo').style.color = '#e8b86a';
    else $('hud-combo').style.color = '';

    const tw = $('hud-time-wrap');
    if (mode === 'desafio') {
      tw.classList.remove('hidden');
      const t = Math.ceil(state.timeLeft);
      $('hud-time').textContent = t + 's';
    } else {
      tw.classList.add('hidden');
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
    updateHud, syncMuteLabels, toggleMute
  };
})();
