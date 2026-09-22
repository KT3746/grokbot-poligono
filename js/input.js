/* POLÍGONO — unified pointer aim + fire */
const PoligonoInput = (() => {
  const aim = { x: 0.5, y: 0.45, active: false };
  let fireQueued = false;
  let onPause = null;
  let canvas = null;
  let fireBtn = null;
  let aimingTouchId = null;
  let reduceMotion = false;

  function init(opts) {
    canvas = opts.canvas;
    fireBtn = opts.fireBtn;
    onPause = opts.onPause || null;
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const rect = () => canvas.getBoundingClientRect();

    function setAimFromClient(cx, cy) {
      const r = rect();
      aim.x = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      aim.y = Math.max(0, Math.min(1, (cy - r.top) / r.height));
      aim.active = true;
    }

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && aimingTouchId !== null && e.pointerId !== aimingTouchId) return;
      if (e.pointerType === 'mouse' || e.buttons === 0 || aimingTouchId === e.pointerId) {
        setAimFromClient(e.clientX, e.clientY);
      }
    }, { passive: true });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        document.body.classList.add('touch-ui');
        document.body.classList.remove('desktop-aim');
        if (typeof PoligonoUI !== 'undefined' && PoligonoUI.applyFireButton) {
          try { PoligonoUI.applyFireButton(); } catch (_) {}
        } else {
          const fz = document.getElementById('fire-zone');
          if (fz) fz.classList.remove('hidden');
        }
        if (aimingTouchId === null) {
          aimingTouchId = e.pointerId;
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
          setAimFromClient(e.clientX, e.clientY);
        }
        e.preventDefault();
        return;
      }
      setAimFromClient(e.clientX, e.clientY);
      // Com FOGO visível, clique no canvas só mira
      if (!document.body.classList.contains('touch-ui')) {
        fireQueued = true;
      }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' && e.pointerId === aimingTouchId) {
        aimingTouchId = null;
      }
    });

    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId === aimingTouchId) aimingTouchId = null;
    });

    if (fireBtn) {
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        fireQueued = true;
        PoligonoAudio.ensure();
      };
      fireBtn.addEventListener('pointerdown', fire, { passive: false });
      fireBtn.addEventListener('click', (e) => { e.preventDefault(); });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (onPause) onPause();
        e.preventDefault();
      } else if (e.code === 'Space') {
        fireQueued = true;
        PoligonoAudio.ensure();
        e.preventDefault();
      }
    });

    // center aim initially
    aim.x = 0.5;
    aim.y = 0.45;
  }

  function consumeFire() {
    if (!fireQueued) return false;
    fireQueued = false;
    return true;
  }

  function getAim() { return aim; }

  function prefersReducedMotion() { return reduceMotion; }

  return { init, consumeFire, getAim, prefersReducedMotion };
})();
