/* POLÍGONO — boot & wiring */
(function () {
  const canvas = document.getElementById('game');
  const fireBtn = document.getElementById('btn-fire');

  let pendingMode = 'treino';
  let lastMode = 'treino';

  PoligonoGame.init({
    canvas,
    onHud: (state, mode) => PoligonoUI.updateHud(state, mode),
    onEnd: (state, mode) => {
      PoligonoGame.stop();
      PoligonoUI.showResults(state, mode);
    }
  });

  PoligonoInput.init({
    canvas,
    fireBtn,
    onPause: () => {
      if (!PoligonoGame.isRunning()) return;
      if (PoligonoGame.isPaused()) resume();
      else pause();
    }
  });

  function beginFlow() {
    PoligonoAudio.ensure();
    PoligonoAudio.ui();
    if (!PoligonoUI.tipSeen()) {
      PoligonoUI.showTip(() => PoligonoUI.showMode());
    } else {
      PoligonoUI.showMode();
    }
  }

  function startMode(mode) {
    lastMode = mode;
    pendingMode = mode;
    PoligonoAudio.ensure();
    PoligonoAudio.ui();
    PoligonoUI.showPlaying();
    PoligonoGame.start(mode);
  }

  function pause() {
    if (!PoligonoGame.isRunning()) return;
    PoligonoGame.setPaused(true);
    PoligonoUI.showPause();
    PoligonoAudio.ui();
  }

  function resume() {
    PoligonoUI.hidePause();
    PoligonoGame.setPaused(false);
    PoligonoAudio.ui();
  }

  function toMenu() {
    PoligonoGame.stop();
    PoligonoUI.hidePause();
    PoligonoUI.showMenu();
    PoligonoAudio.ui();
  }

  document.getElementById('btn-start').addEventListener('click', beginFlow);
  document.getElementById('btn-mute-menu').addEventListener('click', () => PoligonoUI.toggleMute());
  document.getElementById('btn-mute').addEventListener('click', () => PoligonoUI.toggleMute());
  document.getElementById('btn-pause').addEventListener('click', pause);
  document.getElementById('btn-resume').addEventListener('click', resume);
  document.getElementById('btn-restart').addEventListener('click', () => {
    PoligonoUI.hidePause();
    startMode(lastMode);
  });
  document.getElementById('btn-menu').addEventListener('click', toMenu);
  document.getElementById('btn-mode-back').addEventListener('click', () => {
    PoligonoAudio.ui();
    PoligonoUI.showMenu();
  });
  document.getElementById('btn-mode-treino').addEventListener('click', () => startMode('treino'));
  document.getElementById('btn-mode-desafio').addEventListener('click', () => startMode('desafio'));
  document.getElementById('btn-again').addEventListener('click', () => startMode(lastMode));
  document.getElementById('btn-results-menu').addEventListener('click', toMenu);

  document.getElementById('btn-end-session').addEventListener('click', () => {
    PoligonoUI.hidePause();
    PoligonoAudio.ui();
    PoligonoGame.endSession();
  });

  PoligonoUI.syncMuteLabels();
  PoligonoUI.showMenu();

  // unlock audio on first gesture
  const unlock = () => {
    PoligonoAudio.ensure();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
})();
