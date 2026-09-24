/* POLÍGONO — module boot: Three.js via import map, then IIFE game scripts */
let THREE;
try {
  THREE = await import('three');
} catch (err) {
  THREE = await import('https://unpkg.com/three@0.160.1/build/three.module.min.js');
}
window.THREE = THREE;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('falha ao carregar ' + src));
    document.body.appendChild(el);
  });
}

const v = '202609241800';
try {
  await loadScript('js/audio.js?v=' + v);
  await loadScript('js/input.js?v=' + v);
  await loadScript('js/scene.js?v=' + v);
  await loadScript('js/game.js?v=' + v);
  await loadScript('js/ui.js?v=' + v);
  await loadScript('js/main.js?v=' + v);
} catch (err) {
  console.error('POLÍGONO: falha no boot', err);
}
