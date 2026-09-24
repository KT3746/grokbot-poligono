/* POLÍGONO — Three.js indoor bay (low-poly, mobile-first) */
const PoligonoScene = (() => {
  let ready = false;
  let canvas, renderer, scene, camera;
  let w = 0, h = 0;
  let lastTs = 0;
  let playing = false;
  let hidden = false;

  const LANE_Z = [-11.4, -8.1, -5.2];
  const TARGET_Y = 1.34;

  const meshes = new Map();
  const pickables = [];

  let paperTex, steelTex, wallTex, floorTex;
  let geoDisc, geoHanger, geoClip, geoWire;
  let sparkGeo, sparkPos, sparkLife, sparkCol, sparkCount = 0;
  const SPARK_MAX = 64;

  let muzzleLight, hemi, keySpot, fillSpot;
  let camBase = { x: 0, y: 1.56, z: 3.15 };
  let fx = { shake: 0, recoilX: 0, recoilY: 0, muzzle: 0 };
  let reduceMotion = false;

  const _v = { x: 0, y: 0, z: 0 };
  const _ndc = { x: 0, y: 0 };
  let raycaster;
  let _vec3, _quat, _world;

  function isReady() { return ready; }

  function isMobileView() {
    return Math.min(window.innerWidth, window.innerHeight) <= 500
      || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function init(opts) {
    canvas = opts.canvas;
    if (typeof THREE === 'undefined') return false;
    reduceMotion = !!(opts.reduceMotion);

    try {
      const probe = document.createElement('canvas');
      const glOk = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!glOk) return false;
    } catch (_) {
      return false;
    }

    try {
      const mobile = isMobileView();
      const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 2);
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !mobile && pr <= 1.5,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true
      });
      renderer.setClearColor(0x0a0908, 1);
      renderer.setPixelRatio(pr);
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;
      renderer.shadowMap.enabled = false;
    } catch (err) {
      console.warn('POLÍGONO: WebGL indisponível', err);
      return false;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0908);
    scene.fog = new THREE.Fog(0x0c0a08, 11, 26);

    camera = new THREE.PerspectiveCamera(56, 1, 0.12, 40);
    camera.position.set(camBase.x, camBase.y, camBase.z);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.08 };
    _vec3 = new THREE.Vector3();
    _quat = new THREE.Quaternion();
    _world = new THREE.Vector3();

    buildTextures();
    buildGeometries();
    buildRange();
    buildLights();
    buildSparks();

    resize();
    lastTs = performance.now();
    ready = true;
    requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (!hidden) lastTs = 0;
    });
    window.addEventListener('resize', () => resize());
    return true;
  }

  function texColorSpace(tex) {
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function noiseCanvas(size, base, specks, count) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < count; i++) {
      g.globalAlpha = 0.04 + Math.random() * 0.12;
      g.fillStyle = specks[i % specks.length];
      const s = 1 + (Math.random() * 3) | 0;
      g.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, s, s);
    }
    g.globalAlpha = 1;
    return c;
  }

  function buildTextures() {
    const wallC = noiseCanvas(64, '#2a241e', ['#3a3228', '#1a1612', '#4a4034'], 280);
    wallTex = texColorSpace(new THREE.CanvasTexture(wallC));
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(3, 2);

    const floorC = noiseCanvas(64, '#221c16', ['#3a3024', '#14110e', '#4a3a28'], 320);
    const fg = floorC.getContext('2d');
    fg.globalAlpha = 0.35;
    fg.strokeStyle = '#8a5a2b';
    fg.lineWidth = 2;
    fg.beginPath();
    fg.moveTo(4, 32);
    fg.lineTo(60, 32);
    fg.stroke();
    fg.globalAlpha = 1;
    floorTex = texColorSpace(new THREE.CanvasTexture(floorC));
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(2, 10);

    paperTex = texColorSpace(new THREE.CanvasTexture(paintPaper()));
    steelTex = texColorSpace(new THREE.CanvasTexture(paintSteel()));
  }

  function paintPaper() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const cx = 128, cy = 128, r = 124;
    g.fillStyle = '#c4b8a4';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#e6dece';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    const rings = [
      { rr: 1, col: '#e6dece' },
      { rr: 0.78, col: '#b07a38' },
      { rr: 0.55, col: '#e6dece' },
      { rr: 0.32, col: '#8c3a30' },
      { rr: 0.14, col: '#16120c' }
    ];
    for (const ring of rings) {
      g.fillStyle = ring.col;
      g.beginPath();
      g.arc(cx, cy, r * ring.rr, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(20,16,12,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e8b86a';
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  function paintSteel() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(96, 88, 12, 128, 128, 124);
    grd.addColorStop(0, '#9aa3ac');
    grd.addColorStop(0.55, '#5a626c');
    grd.addColorStop(1, '#2a3038');
    g.fillStyle = '#1a1c20';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(12,14,18,0.7)';
    g.lineWidth = 3;
    const rs = [0.18, 0.45, 1];
    for (const rr of rs) {
      g.beginPath();
      g.arc(128, 128, 124 * rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#121418';
    g.beginPath();
    g.arc(128, 128, 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c0c8d0';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.stroke();
    return c;
  }

  function buildGeometries() {
    geoDisc = new THREE.CircleGeometry(1, 22);
    geoHanger = new THREE.BoxGeometry(0.18, 0.05, 0.08);
    geoClip = new THREE.BoxGeometry(0.28, 0.07, 0.1);
    geoWire = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  }

  function lambert(color, map, extras) {
    const o = Object.assign({ color: color || 0xffffff }, extras || {});
    if (map) o.map = map;
    return new THREE.MeshLambertMaterial(o);
  }

  function buildRange() {
    const wallMat = lambert(0xffffff, wallTex);
    const wallDark = lambert(0xffffff, wallTex, { color: 0x9a9088 });
    const floorMat = lambert(0xffffff, floorTex);
    const rubber = lambert(0x221614);
    const metal = lambert(0x4a4e54);
    const metalDark = lambert(0x2a2c30);
    const wood = lambert(0x3a2a1c);
    const emit = new THREE.MeshBasicMaterial({ color: 0xe8c48a });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 22), floorMat);
    floor.position.set(0, -0.09, -8);
    scene.add(floor);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.14, 22), wallDark);
    ceil.position.set(0, 3.18, -8);
    scene.add(ceil);

    const back = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.4, 0.35), rubber);
    back.position.set(0, 1.6, -16.6);
    scene.add(back);

    const trap = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 0.22), lambert(0x2a1814));
    trap.position.set(0, 1.25, -16.35);
    trap.rotation.x = -0.18;
    scene.add(trap);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 22), wallMat);
    left.position.set(-2.22, 1.6, -8);
    scene.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 22), wallMat);
    right.position.set(2.22, 1.6, -8);
    scene.add(right);

    const baffleGeo = new THREE.BoxGeometry(0.07, 1.15, 0.85);
    const baffleMat = lambert(0x3a3228);
    for (let i = 0; i < 5; i++) {
      const z = -3.0 - i * 2.3;
      const b1 = new THREE.Mesh(baffleGeo, baffleMat);
      b1.position.set(-1.72, 2.15, z);
      b1.rotation.y = 0.28;
      scene.add(b1);
      const b2 = b1.clone();
      b2.position.x = 1.72;
      b2.rotation.y = -0.28;
      scene.add(b2);
    }

    const railGeo = new THREE.BoxGeometry(4.1, 0.04, 0.04);
    for (let i = 0; i < 3; i++) {
      const rail = new THREE.Mesh(railGeo, metal);
      rail.position.set(0, 2.02, LANE_Z[i] - 0.12);
      scene.add(rail);
    }

    const tapeGeo = new THREE.BoxGeometry(0.05, 0.012, 18);
    const tapeMat = lambert(0xb07a38);
    for (const x of [-0.72, 0, 0.72]) {
      const tape = new THREE.Mesh(tapeGeo, tapeMat);
      tape.position.set(x, 0.012, -7.5);
      scene.add(tape);
    }

    const markGeo = new THREE.BoxGeometry(2.2, 0.014, 0.07);
    const markMat = lambert(0x8a5a2b);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(markGeo, markMat);
      m.position.set(0, 0.016, LANE_Z[i] + 0.55);
      scene.add(m);
    }

    const stripGeo = new THREE.BoxGeometry(1.55, 0.045, 0.16);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(stripGeo, emit);
      s.position.set(0, 3.08, -1.6 - i * 3.6);
      scene.add(s);
    }

    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.7), wood);
    bench.position.set(0, 0.88, 2.42);
    scene.add(bench);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.08), metalDark);
    lip.position.set(0, 0.95, 2.1);
    scene.add(lip);
  }

  function buildLights() {
    hemi = new THREE.HemisphereLight(0x5a5044, 0x1a1410, 0.95);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0x3a3228, 0.62);
    scene.add(ambient);

    const fillDir = new THREE.DirectionalLight(0xe8d4b0, 0.55);
    fillDir.position.set(0.4, 2.4, 4.2);
    scene.add(fillDir);

    keySpot = new THREE.SpotLight(0xf0d0a0, 3.8, 26, 0.62, 0.45, 1);
    keySpot.position.set(0, 3.0, 0.8);
    keySpot.target.position.set(0, 1.15, -8);
    scene.add(keySpot);
    scene.add(keySpot.target);

    fillSpot = new THREE.SpotLight(0xd4c0a0, 2.4, 22, 0.75, 0.6, 1);
    fillSpot.position.set(0, 2.95, -5.5);
    fillSpot.target.position.set(0, 1.2, -12);
    scene.add(fillSpot);
    scene.add(fillSpot.target);

    muzzleLight = new THREE.PointLight(0xffe0a8, 0, 6, 2);
    muzzleLight.position.set(0, 1.45, 2.4);
    scene.add(muzzleLight);
  }

  function buildSparks() {
    sparkPos = new Float32Array(SPARK_MAX * 3);
    sparkCol = new Float32Array(SPARK_MAX * 3);
    sparkLife = new Float32Array(SPARK_MAX);
    sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true
    });
    const pts = new THREE.Points(sparkGeo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    sparkCount = 0;
  }

  function emitSparks(x, y, z, colorHex, n) {
    const col = new THREE.Color(colorHex);
    const count = reduceMotion ? Math.min(4, n) : n;
    for (let i = 0; i < count; i++) {
      const slot = sparkCount % SPARK_MAX;
      const o = slot * 3;
      sparkPos[o] = x + (Math.random() - 0.5) * 0.05;
      sparkPos[o + 1] = y + (Math.random() - 0.5) * 0.05;
      sparkPos[o + 2] = z + (Math.random() - 0.5) * 0.05;
      sparkCol[o] = col.r;
      sparkCol[o + 1] = col.g;
      sparkCol[o + 2] = col.b;
      sparkLife[slot] = 0.28 + Math.random() * 0.25;
      sparkCount++;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  function updateSparks(dt) {
    if (sparkCount <= 0 && sparkLife[0] <= 0) return;
    let any = false;
    for (let i = 0; i < SPARK_MAX; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      const o = i * 3;
      sparkPos[o + 1] -= dt * 0.55;
      sparkPos[o + 2] += dt * 0.2;
      if (sparkLife[i] <= 0) {
        sparkPos[o + 1] = -99;
      } else any = true;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    if (!any) sparkCount = 0;
  }

  function worldOf(t) {
    const lane = Math.max(0, Math.min(2, t.lane | 0));
    const z = LANE_Z[lane];
    const half = 0.92 + (2 - lane) * 0.28;
    const x = (t.x - 0.5) * 2 * half;
    const y = TARGET_Y;
    return { x, y, z, lane };
  }

  function discRadius(t) {
    if (t.sizeWorld) return t.sizeWorld;
    const mobile = isMobileView();
    const base = mobile ? 0.52 : 0.44;
    return base * (1.16 - (t.lane || 0) * 0.07);
  }

  function makeTarget(t) {
    const root = new THREE.Group();
    const r = discRadius(t);
    const steel = t.kind === 'steel';
    const mat = new THREE.MeshLambertMaterial({
      map: steel ? steelTex : paperTex,
      color: 0xffffff
    });
    const disc = new THREE.Mesh(geoDisc, mat);
    disc.scale.set(r, r, 1);
    disc.userData.kind = 'disc';
    root.add(disc);

    const clip = new THREE.Mesh(geoClip, new THREE.MeshLambertMaterial({ color: 0x5a5e64 }));
    clip.position.set(0, r + 0.12, 0.02);
    root.add(clip);

    const wire = new THREE.Mesh(geoWire, new THREE.MeshLambertMaterial({ color: 0x8a9098 }));
    wire.position.set(0, r + 0.06, 0);
    wire.scale.y = 0.12;
    root.add(wire);

    const hanger = new THREE.Mesh(geoHanger, new THREE.MeshLambertMaterial({ color: 0x6a7078 }));
    hanger.position.set(0, r + 0.22, -0.02);
    root.add(hanger);

    scene.add(root);
    const rec = { root, disc, mat, t };
    meshes.set(t.id, rec);
    pickables.push(disc);
    disc.userData.tid = t.id;
    return rec;
  }

  function syncTargets(list) {
    if (!ready) return;
    const live = new Set();
    for (const t of list) {
      live.add(t.id);
      let rec = meshes.get(t.id);
      if (!rec) rec = makeTarget(t);
      rec.t = t;
      rec.disc.userData.tid = t.id;
      const p = worldOf(t);
      rec.root.position.set(p.x, p.y, p.z);
      const r = discRadius(t);
      rec.disc.scale.set(r, r, 1);
      if (t.hit) {
        const k = Math.max(0, t.flash / 0.35);
        rec.root.rotation.x = (1 - k) * 0.7;
        rec.mat.emissive = new THREE.Color(t.kind === 'steel' ? 0x8899aa : 0xc4893a);
        rec.mat.emissiveIntensity = k * 1.4;
        rec.mat.transparent = true;
        rec.mat.opacity = Math.max(0, k);
      } else {
        rec.root.rotation.x = 0;
        rec.mat.emissiveIntensity = 0;
        rec.mat.transparent = false;
        rec.mat.opacity = 1;
        if (t.moving && !reduceMotion) {
          rec.root.rotation.z = Math.sin(performance.now() * 0.002 + p.x) * 0.03;
        } else {
          rec.root.rotation.z = 0;
        }
      }
    }
    for (const [id, rec] of meshes) {
      if (live.has(id)) continue;
      scene.remove(rec.root);
      rec.mat.dispose();
      meshes.delete(id);
      const ix = pickables.indexOf(rec.disc);
      if (ix >= 0) pickables.splice(ix, 1);
    }
  }

  function pick(nx, ny, targets) {
    if (!ready || !pickables.length) return null;
    _ndc.x = nx * 2 - 1;
    _ndc.y = -(ny * 2 - 1);
    raycaster.setFromCamera(_ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const tid = h.object.userData.tid;
      const target = targets.find(t => t.id === tid && !t.hit);
      if (!target) continue;
      const local = h.object.worldToLocal(h.point.clone());
      const distNorm = Math.hypot(local.x, local.y);
      if (distNorm > 1) continue;
      return { target, distNorm };
    }
    return null;
  }

  function project(t) {
    if (!ready) return { x: t.x, y: t.y };
    const p = worldOf(t);
    _vec3.set(p.x, p.y, p.z).project(camera);
    return {
      x: (_vec3.x * 0.5 + 0.5),
      y: (-_vec3.y * 0.5 + 0.5)
    };
  }

  function burstAt(t, kind) {
    if (!ready) return;
    const p = worldOf(t);
    const col = kind === 'steel' ? 0xc0c8d0 : 0xc4893a;
    emitSparks(p.x, p.y, p.z + 0.08, col, kind === 'steel' ? 14 : 10);
  }

  function missAt(nx, ny) {
    if (!ready) return;
    _ndc.x = nx * 2 - 1;
    _ndc.y = -(ny * 2 - 1);
    raycaster.setFromCamera(_ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 16.4);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) {
      emitSparks(pt.x, pt.y, -16.3, 0x6a5040, 5);
    }
  }

  function setFx(next) {
    fx.shake = next.shake || 0;
    fx.recoilX = next.recoilX || 0;
    fx.recoilY = next.recoilY || 0;
    fx.muzzle = next.muzzle || 0;
  }

  function setPlaying(v) { playing = !!v; }

  function setReducedMotion(v) { reduceMotion = !!v; }

  function updateCamera(time) {
    const sway = (playing && !reduceMotion) ? 1 : 0.35;
    const sx = Math.sin(time * 0.31) * 0.028 * sway;
    const sy = Math.sin(time * 0.23) * 0.016 * sway;
    let ox = 0, oy = 0;
    if (fx.shake > 0 && !reduceMotion) {
      ox = (Math.random() - 0.5) * fx.shake * 0.08;
      oy = (Math.random() - 0.5) * fx.shake * 0.08;
    }
    camera.position.set(
      camBase.x + sx + ox + fx.recoilX * 0.4,
      camBase.y + sy + oy - fx.recoilY * 0.6,
      camBase.z + fx.muzzle * 0.04
    );
    camera.lookAt(fx.recoilX * 0.8, TARGET_Y - 0.08 + fx.recoilY * 1.2, -9.2);
    if (muzzleLight) {
      muzzleLight.intensity = reduceMotion ? 0 : fx.muzzle * 3.2;
    }
  }

  function resize(nw, nh) {
    if (!renderer || !canvas) return;
    w = nw || canvas.clientWidth || window.innerWidth;
    h = nh || canvas.clientHeight || window.innerHeight;
    const mobile = isMobileView();
    const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = mobile ? 62 : 52;
    camera.updateProjectionMatrix();
  }

  function loop(ts) {
    if (!ready) return;
    requestAnimationFrame(loop);
    if (hidden) return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    updateSparks(dt);
    updateCamera(ts * 0.001);
    renderer.render(scene, camera);
  }

  return {
    init, isReady, resize, syncTargets, pick, project,
    burstAt, missAt, setFx, setPlaying, setReducedMotion, worldOf, discRadius
  };
})();
