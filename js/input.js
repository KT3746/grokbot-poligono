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

    /* onda 8: no toque a mira anda como touchpad (arrasta de qualquer lugar),
       então o dedo não cobre o alvo nem a mira */
    const TOUCH_SENS = 1.35;
    let dragFrom = null;
    function dragAim(cx, cy) {
      if (!dragFrom) return;
      const r = rect();
      aim.x = Math.max(0, Math.min(1, dragFrom.ax + ((cx - dragFrom.cx) / r.width) * TOUCH_SENS));
      aim.y = Math.max(0, Math.min(1, dragFrom.ay + ((cy - dragFrom.cy) / r.height) * TOUCH_SENS));
      aim.active = true;
    }

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && aimingTouchId !== null && e.pointerId !== aimingTouchId) return;
      if (e.pointerType === 'touch' && aimingTouchId === e.pointerId) {
        dragAim(e.clientX, e.clientY);
        return;
      }
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
        /* Wave 5: ignore aim start inside FOGO deadzone (Galaxy one-hand) */
        if (nearFireZone(e.clientX, e.clientY)) {
          e.preventDefault();
          return;
        }
        if (aimingTouchId === null) {
          aimingTouchId = e.pointerId;
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
          dragFrom = { cx: e.clientX, cy: e.clientY, ax: aim.x, ay: aim.y };
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
        dragFrom = null;
      }
    });

    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId === aimingTouchId) { aimingTouchId = null; dragFrom = null; }
    });

    function nearFireZone(cx, cy) {
      /* Wave 5: palm / FOGO deadzone so aim does not jump onto the thumb button */
      if (!fireBtn) return false;
      const fz = document.getElementById('fire-zone');
      if (!fz || fz.classList.contains('hidden')) return false;
      const r = fireBtn.getBoundingClientRect();
      const pad = 22;
      return cx >= r.left - pad && cx <= r.right + pad
        && cy >= r.top - pad && cy <= r.bottom + pad;
    }

    if (fireBtn) {
      const clearPress = () => fireBtn.classList.remove('is-press');
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        fireBtn.classList.add('is-press');
        fireQueued = true;
        PoligonoAudio.ensure();
      };
      fireBtn.addEventListener('pointerdown', fire, { passive: false });
      fireBtn.addEventListener('pointerup', clearPress);
      fireBtn.addEventListener('pointercancel', clearPress);
      fireBtn.addEventListener('pointerleave', clearPress);
      fireBtn.addEventListener('lostpointercapture', clearPress);
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
