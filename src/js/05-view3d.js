/* =====================================================================
   3B görünüm: yörünge kamera + insan gözüyle gezinti (WASD / joystick)
   Plan (x, y) → sahne (x, 0, z=y). Yerel ön yüz (+y) → sahnede yerel +z.
   ===================================================================== */

const THREE_URLS = ['./vendor/three.module.min.js', 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js'];
async function loadThree() {
  let err;
  for (const u of THREE_URLS) { try { return await import(u); } catch (e) { err = e; } }
  throw err;
}

const View3D = {
  T: null, loading: null, ready: false, cv: null, R: null, scene: null, cam: null, root: null, selHelper: null,
  sun: null, hemi: null, mats: new Map(), sceneDirty: true, raf: 0, loopOn: false, w: 0, h: 0,
  mode: 'orbit', orb: null, wk: {x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, target: null}, keys: new Set(),
  ptrs: new Map(), drag: null, joy: {x: 0, y: 0, id: null}, colliders: [], bounds: null, locked: false, mini: null,

  async show() {
    this.cv = $('#scene');
    $('#loading3d').hidden = !!this.ready;
    try {
      if (!this.T) { this.loading = this.loading || loadThree(); this.T = await this.loading; this.setup(); }
    } catch (e) {
      $('#loading3d').hidden = true;
      toast('3B motoru yüklenemedi. İnternet bağlantısını kontrol et.', 'err');
      Ed.setView('2d'); return;
    }
    if (Ed.view !== '3d') return;
    $('#loading3d').hidden = true;
    this.cv.hidden = false;
    this.resize();
    if (this.sceneDirty) this.build();
    if (!this.orb) this.resetCam();
    this.setMode(this.mode);
    this.req();
  },
  hide() {
    if (this.cv) this.cv.hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear(); this.stopLoop();
    $('#joy').hidden = true; $('#minimap').hidden = true; $('#walkHint').hidden = true; $('#crosshair').hidden = true;
    $('#stage').classList.remove('walking', 'is3d');
  },
  setup() {
    const T = this.T;
    const R = this.R = new T.WebGLRenderer({canvas: this.cv, antialias: true, preserveDrawingBuffer: true});
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    R.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    this.scene = new T.Scene();
    this.cam = new T.PerspectiveCamera(45, 1, 0.05, 400);
    this.hemi = new T.HemisphereLight(0xffffff, 0x9a9486, 1.1); this.scene.add(this.hemi);
    const sun = this.sun = new T.DirectionalLight(0xffffff, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    this.scene.add(sun); this.scene.add(sun.target);
    this.fill = new T.DirectionalLight(0xfff4e6, 0); this.fill.position.set(0, 10, 0); this.scene.add(this.fill);
    this.root = new T.Group(); this.scene.add(this.root);
    this.envSetup();
    new ResizeObserver(() => { if (Ed.view === '3d') { this.resize(); this.req(); } }).observe($('#stage'));
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.pDown(e));
    cv.addEventListener('pointermove', e => this.pMove(e));
    cv.addEventListener('pointerup', e => this.pUp(e));
    cv.addEventListener('pointercancel', e => this.pUp(e, true));
    cv.addEventListener('wheel', e => this.wheel(e), {passive: false});
    cv.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      $('#crosshair').hidden = !this.locked;
      this.hint();
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    // Joystick
    const joy = $('#joy'), knob = $('#joyKnob');
    const jmove = e => {
      const r = joy.getBoundingClientRect(), R0 = r.width / 2;
      let dx = e.clientX - (r.left + R0), dy = e.clientY - (r.top + R0);
      const L = Math.hypot(dx, dy), max = R0 - 10;
      if (L > max) { dx *= max / L; dy *= max / L; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.joy.x = dx / max; this.joy.y = dy / max; this.startLoop();
    };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); this.joy.id = e.pointerId; joy.setPointerCapture(e.pointerId); this.wk.target = null; jmove(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === this.joy.id) jmove(e); });
    const jend = e => { if (e.pointerId !== this.joy.id) return; this.joy = {x: 0, y: 0, id: null}; knob.style.transform = ''; };
    joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
    // Mini harita: dokun → oraya yürü
    $('#minimap').addEventListener('pointerdown', e => {
      e.preventDefault();
      const m = this.mini; if (!m) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * m.cw, y = (e.clientY - r.top) / r.height * m.ch;
      this.walkTo((x - m.V.ox) / m.V.s, (y - m.V.oy) / m.V.s);
    });
    this.ready = true;
  },
  /* Yumuşak ortam ışığı ve yansımalar için basit stüdyo ortamı */
  envSetup() {
    const T = this.T, pm = new T.PMREMGenerator(this.R), s = new T.Scene();
    const room = new T.Mesh(new T.BoxGeometry(24, 9, 24), new T.MeshBasicMaterial({color: 0x9a9892, side: T.BackSide}));
    room.position.y = 4.5; s.add(room);
    const fl = new T.Mesh(new T.PlaneGeometry(24, 24), new T.MeshBasicMaterial({color: 0x6d6a64})); fl.rotation.x = -Math.PI / 2; fl.position.y = .01; s.add(fl);
    const lm = new T.MeshBasicMaterial({color: new T.Color(7, 7, 6.6)});
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]]) { const p = new T.Mesh(new T.PlaneGeometry(3.5, 1.4), lm); p.rotation.x = Math.PI / 2; p.position.set(x, 8.9, z); s.add(p); }
    const wl = new T.MeshBasicMaterial({color: new T.Color(2.6, 2.7, 3)});
    for (const [x, z, ry] of [[0, -11.9, 0], [11.9, 0, -Math.PI / 2]]) { const p = new T.Mesh(new T.PlaneGeometry(8, 4), wl); p.position.set(x, 4, z); p.rotation.y = ry; s.add(p); }
    this.scene.environment = pm.fromScene(s, .04).texture;
    this.scene.environmentIntensity = .6;
    pm.dispose();
  },
  resize() {
    if (!this.R) return;
    const r = $('#stage').getBoundingClientRect(); if (!r.width) return;
    this.w = r.width; this.h = r.height;
    this.R.setSize(r.width, r.height, false);
    this.cam.aspect = r.width / r.height; this.cam.updateProjectionMatrix();
  },
  markDirty() { this.sceneDirty = true; if (Ed.view === '3d' && this.ready) { clearTimeout(this._bt); this._bt = setTimeout(() => { this.build(); this.req(); }, 80); } },
  req() { if (!this.raf && !this.loopOn) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); }); },
  render() {
    if (!this.R || Ed.view !== '3d' || this.recording) return;
    this.applyCam();
    this.R.render(this.scene, this.cam);
    if (this.mode === 'walk') this.drawMini();
  },

  /* ---------- Malzemeler ---------- */
  mat(color, o = {}) {
    let key = color;
    for (const k in o) { const v = o[k]; key += '|' + k + '=' + (v && v.isTexture ? v.uuid : v); }
    if (!this.mats.has(key)) {
      const T = this.T;
      this.mats.set(key, new T.MeshStandardMaterial(Object.assign({color: new T.Color(color), roughness: .78, metalness: 0}, o)));
    }
    return this.mats.get(key);
  },
  glass() { return this.mat('#A9D4EE', {transparent: true, opacity: .28, roughness: .05, depthWrite: false}); },
  /* Seçilen zemin kaplaması; ızgara dükkân köşesine hizalı */
  floorMat(k, w, d, x, y) {
    const T = this.T, f = FLOOR_BY_KEY[k] || FLOORS[0];
    const t = new T.CanvasTexture(floorCanvas(f.k));
    t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    t.repeat.set(w / f.size, d / f.size); t.offset.set((x / f.size) % 1, (-(y + d) / f.size) % 1);
    const rough = {tile: .3, marble: .12, wood: .45, plain: .2, speckle: .4, terrazzo: .28, checker: .25}[f.kind] ?? .35;
    const m = new T.MeshStandardMaterial({map: t, roughness: rough, metalness: 0}); m._own = true;
    return m;
  },
  skyTex(dark) {
    const key = dark === 'night' ? 'n' : dark ? 'd' : 'l';
    if (this._sky && this._sky.k === key) return this._sky.t;
    const T = this.T, c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    if (key === 'n') { gr.addColorStop(0, '#03060C'); gr.addColorStop(.6, '#0A1220'); gr.addColorStop(1, '#16202E'); }
    else if (dark) { gr.addColorStop(0, '#0C1116'); gr.addColorStop(.6, '#18212A'); gr.addColorStop(1, '#222A2E'); }
    else { gr.addColorStop(0, '#A9CBE6'); gr.addColorStop(.55, '#D8E7F1'); gr.addColorStop(1, '#EEF1F0'); }
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    this._sky = {k: key, t};
    return t;
  },
  /* Duvar diplerinde yumuşak koyulaşma (her iki yanda) */
  wallAo(root, s, a, b) {
    const T = this.T, len = b - a, mid = (a + b) / 2, wd = .32;
    const mat = this.mat('#000000', {map: this.wallAoTex(), transparent: true, opacity: .9, depthWrite: false});
    for (const sg of [-1, 1]) {
      const off = s.c + sg * (s.t / 2 + wd / 2);
      const grp = new T.Group();
      if (s.h) { grp.position.set(mid, .0045, off); grp.rotation.y = sg > 0 ? 0 : Math.PI; }
      else { grp.position.set(off, .0045, mid); grp.rotation.y = sg > 0 ? Math.PI / 2 : -Math.PI / 2; }
      const p = new T.Mesh(new T.PlaneGeometry(len, wd), mat); p.rotation.x = -Math.PI / 2; p.renderOrder = 1;
      grp.add(p); root.add(grp);
    }
  },
  floorTex(base, line, lw = 3) {
    const T = this.T, c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    // hafif doku
    let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},${.018 + r() * .03})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 2 + r() * 5); }
    g.strokeStyle = line; g.lineWidth = lw; g.strokeRect(0, 0, 256, 256);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  },
  textTex(lines, color) {
    const T = this.T, c = document.createElement('canvas'), g = c.getContext('2d');
    const fs = 64, pad = 16;
    g.font = `700 ${fs}px ${getFont()}`;
    const w = Math.max(...lines.map((l, i) => { g.font = i ? `500 ${fs * .72}px ${getMono()}` : `700 ${fs}px ${getFont()}`; return g.measureText(l).width; })) + pad * 2;
    const h = fs * 1.25 + (lines.length - 1) * fs * .95 + pad;
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = color;
    lines.forEach((l, i) => { g.font = i ? `500 ${fs * .72}px ${getMono()}` : `700 ${fs}px ${getFont()}`; g.globalAlpha = i ? .75 : .9; g.fillText(l, c.width / 2, pad / 2 + (i ? fs * 1.15 + (i - 1) * fs * .95 : 0)); });
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return {t, aspect: c.width / c.height};
  },

  /* ---------- Sahne ---------- */
  clearRoot() {
    const dispose = o => { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material._own) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } }); };
    for (const c of [...this.root.children]) { dispose(c); this.root.remove(c); }
  },
  box(g, w, h, d, m, x, y, z, pick) {
    const T = this.T, mesh = new T.Mesh(new T.BoxGeometry(Math.max(w, .001), Math.max(h, .001), Math.max(d, .001)), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh); return mesh;
  },
  build() {
    if (!this.T || !Ed.P) return;
    this.sceneDirty = false;
    const T = this.T, P = Ed.P, L = P.levels, cur = P.cur, g = groundIdx(P);
    const dark = document.documentElement.dataset.mode === 'dark';
    this.clearRoot();
    this.signInfo = null; this.ceils = []; this.ceilMats = []; this.lamps = []; this.ownLights = false; this.lvY = [];
    this.scene.background = this.skyTex(dark);
    const walk = this.mode === 'walk', mode = walk || L.length < 2 ? 'all' : (Settings.v.lvView || 'explode');
    this.builtMode = mode;
    const show = L.map((l, i) => mode === 'all' || mode === 'explode' ? true : mode === 'single' ? i === cur : i <= cur);
    const realRoot = this.root, segs0 = Ed.segs, A0 = Ed.A;
    try {
      for (let i = 0; i < L.length; i++) {
        this.lvY[i] = levelElev(P, i) + (mode === 'explode' ? (i - g) * 2.6 : 0);
        if (!show[i]) continue;
        P.cur = i;
        Ed.segs = i === cur ? segs0 : computeWalls(P); Ed.A = i === cur ? A0 : analyze(P, Ed.segs);
        const lg = new T.Group(); lg.userData.level = i; realRoot.add(lg); this.root = lg;
        this.prods = [];
        this.buildLevel(P, i, {dark, walk, top: !walk && (i === cur || mode === 'explode'), maxLamps: i === cur ? (isMobile() ? 6 : 10) : (walk ? 3 : 2)});
        this.root = realRoot;
        lg.position.set(L[i].ox, this.lvY[i], L[i].oy);
      }
    } finally { P.cur = cur; Ed.segs = segs0; Ed.A = A0; this.root = realRoot; }
    if (show[g] && mode !== 'explode' && (mode !== 'single' || cur === g)) this.buildOutdoor(P, dark);

    // Güneş / gölge kutusu (görünen katların toplam izi)
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y1 = 3;
    L.forEach((l, i) => { if (!show[i]) return; x0 = Math.min(x0, l.ox); z0 = Math.min(z0, l.oy); x1 = Math.max(x1, l.ox + l.shop.w); z1 = Math.max(z1, l.oy + l.shop.d); y1 = Math.max(y1, this.lvY[i] + l.shop.h); });
    const W = x1 - x0, D = z1 - z0, ext = Math.max(W, D) * .75 + 4 + y1 * .4;
    const sc = this.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 70 + y1 * 2; sc.updateProjectionMatrix();
    this.sun.position.set(x0 + W / 2 + 7, 15 + y1, z0 + D / 2 + 10); this.sun.target.position.set(x0 + W / 2, Math.min(0, this.lvY[cur]), z0 + D / 2);
    this.lightMode();

    this.buildColliders();
    this.updateSel();
    this.miniDirty = true;
  },
  /* Katın kökü (dünya): x, y (kot / ayrık görünümde kaydırılmış), z */
  lvOrigin(i = Ed.P.cur) { const l = Ed.P.levels[i]; return {x: l.ox, y: this.lvY && this.lvY[i] !== undefined ? this.lvY[i] : levelElev(Ed.P, i), z: l.oy}; },
  /* Tüm kat gruplarının çocukları (düz liste) */
  kids() { const out = []; for (const c of this.root.children) { if (c.userData.level !== undefined) out.push(...c.children); else out.push(c); } return out; },
  levelChanged(walkSwitch) {
    if (!this.ready) { this.sceneDirty = true; return; }
    if (walkSwitch && this.mode === 'walk') { this.buildColliders(); this.miniDirty = true; this.req(); return; }
    const o = this.orb, before = o ? o.ty : 0;
    this.sceneDirty = true;
    if (Ed.view === '3d') { this.build(); if (o && this.builtMode !== 'explode') { const p = this.lvOrigin(); o.ty = p.y + (before - (this._lastTy0 ?? before)); } this.req(); }
    this._lastTy0 = this.lvOrigin().y;
    if (this.mode === 'walk') { this.placeOnLevel(); }
  },
  /* Bir katı kur (kök: o katın grubu; koordinatlar kat yereli) */
  buildLevel(P, li, o) {
    const T = this.T, W = P.shop.w, D = P.shop.d, H = P.shop.h || 2.8, dark = o.dark;
    const cs = getComputedStyle(document.documentElement), css = n => cs.getPropertyValue(n).trim();
    const root = this.root;
    const wallMode = o.top ? (Settings.v.walls || 'full') : 'full';
    const wallH = wallMode === 'full' ? H : wallMode === 'half' ? 1.1 : 0.06;
    if (o.top || li === P.cur) this.wallH = wallH;
    const mz = mezzOver(P, li); // üstte asma kat varsa galeri (çift yükseklik) bölümü
    // İç zemin (seramik): merdiven boşlukları çıkarılır; alttaki katın üstünde döşeme plağı
    const der = levelDerived(P, li), cuts = der.holes.map(hl => ({x: hl.box.x0, y: hl.box.y0, w: hl.box.x1 - hl.box.x0, d: hl.box.y1 - hl.box.y0}));
    const floorRects = shopRects(P).flatMap(r => cuts.length ? rectMinus(r, cuts) : [r]);
    if (li > 0) {
      const slabM = this.mat(dark ? '#77736C' : '#B8B3AA', {roughness: .9}), sl = curLevel(P).slab;
      for (const fr of floorRects) { const m = this.box(root, fr.w, sl - .008, fr.d, slabM, fr.x + fr.w / 2, -sl / 2, fr.y + fr.d / 2); m.receiveShadow = true; }
    }
    for (const fr of floorRects) { // dükkân şekline göre zemin parçaları
      const floor = new T.Mesh(new T.PlaneGeometry(fr.w, fr.d), this.floorMat(P.floor, fr.w, fr.d, fr.x, fr.y));
      floor.rotation.x = -Math.PI / 2; floor.position.set(fr.x + fr.w / 2, 0, fr.y + fr.d / 2); floor.receiveShadow = true; floor.userData.floor = 1; floor.userData.lv = li; root.add(floor);
    }
    for (const v of P.voids || []) { // bina boşluğu: koyu, taralı olmayan düz zemin
      const x0 = clamp(v.x, 0, W), y0 = clamp(v.y, 0, D), x1 = clamp(v.x + v.w, 0, W), y1 = clamp(v.y + v.d, 0, D);
      if (x1 - x0 < .01 || y1 - y0 < .01) continue;
      const vm = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), this.mat(dark ? '#3A403D' : '#B9BAB5', {roughness: .95}));
      vm.rotation.x = -Math.PI / 2; vm.position.set((x0 + x1) / 2, -.006, (y0 + y1) / 2); vm.receiveShadow = true; root.add(vm);
    }

    // Oda zeminleri + etiketleri
    for (const r of P.rooms) {
      const rm = r.floor && r.floor !== P.floor ? this.floorMat(r.floor, r.w, r.d, r.x, r.y) : this.mat('#FFFFFF', {visible: false});
      const m = new T.Mesh(new T.PlaneGeometry(r.w, r.d), rm);
      m.rotation.x = -Math.PI / 2; m.position.set(r.x + r.w / 2, 0.002, r.y + r.d / 2); m.receiveShadow = true;
      m.userData.pick = {k: 'room', id: r.id, lv: li}; m.userData.floor = 1; m.userData.lv = li; root.add(m);
      if (o.walk || !Settings.v.roomLabels3d && Settings.v.roomLabels3d !== undefined) continue;
      const {t, aspect} = this.textTex([r.name, fmtA(r.w * r.d) + ' m²'], dark ? '#FFFFFF' : '#1B211F');
      const lh = clamp(Math.min(r.w, r.d) * .22, .25, .7), lw = lh * aspect;
      const s = Math.min(1, (r.w * .85) / lw);
      const lm = new T.MeshBasicMaterial({map: t, transparent: true, depthWrite: false, opacity: .8}); lm._own = true;
      const lab = new T.Mesh(new T.PlaneGeometry(lw * s, lh * s), lm);
      lab.rotation.x = -Math.PI / 2; lab.position.set(r.x + r.w / 2, 0.006, r.y + r.d / 2); lab.renderOrder = 2;
      lab.userData.label = 1; root.add(lab);
    }

    // Duvarlar: iç yüz açık, dış yüz cephe rengi, üstü koyu; altta süpürgelik
    const side = this.mat(css('--scene-wall'), {roughness: .92});
    const facade = this.mat(dark ? '#8E8A82' : '#E3DDD2', {roughness: .95});
    const cap = this.mat(dark ? '#9FA8A3' : '#3A423F');
    const skirt = this.mat(dark ? '#6B6760' : '#9A958C', {roughness: .6});
    const glassM = this.glass(), railM = this.chrome();
    const addWall = (s, a, b, y0, y1, dz = 0) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return;
      const len = b - a, mid = (a + b) / 2, hh = y1 - y0 - dz;
      const mats = [side, side, cap, side, side, side];
      if (s.outer) mats[s.h ? (s.n < 0 ? 5 : 4) : (s.n < 0 ? 1 : 0)] = facade;
      const m = s.h ? this.box(root, len, hh, s.t, mats, mid, y0 + hh / 2, s.c) : this.box(root, s.t, hh, len, mats, s.c, y0 + hh / 2, mid);
      m.userData.wall = 1; m.userData.seg = s; m.userData.y0 = y0;
      if (y0 < .01) this.wallAo(root, s, a, b);
      if (y0 < .01 && y1 > .5) { // süpürgelik
        const k = s.h ? this.box(root, len, .08, s.t + .016, skirt, mid, .04, s.c) : this.box(root, s.t + .016, .08, len, skirt, s.c, .04, mid);
        k.castShadow = false;
      }
    };
    const emit = (s, A, B, top) => { // [A,B] aralığında kapı/pencere boşluklarını atlayarak duvar
      let cur = A; const ops = s.open.filter(q => q.b > A && q.a < B).sort((p, q) => p.a - q.a);
      const dz = s.h ? 0 : 0.001; // dikey duvarlar 1 mm alçak: kesişimde titremeyi önler
      for (const q of ops) {
        const qa = Math.max(q.a, A), qb = Math.min(q.b, B);
        if (qa > cur) addWall(s, cur, qa, 0, top, dz);
        const lo = Math.max(cur, qa);
        if (q.elev > 0.01) addWall(s, lo, qb, 0, Math.min(q.elev, top), dz);
        if (q.top < top - 0.01) addWall(s, lo, qb, q.top, top, dz);
        cur = Math.max(cur, qb);
      }
      if (B > cur) addWall(s, cur, B, 0, top, dz);
    };
    for (const s of Ed.segs) {
      if (s.rail) { // asma kat korkuluğu: merdivenin çıktığı yerde açıklık
        if (wallH <= .5) continue;
        let parts = [[s.a, s.b]];
        for (const hl of der.holes) { const b = hl.box, on = s.h ? s.c > b.y0 - .2 && s.c < b.y1 + .2 : s.c > b.x0 - .2 && s.c < b.x1 + .2; if (!on) continue; const lo = s.h ? b.x0 : b.y0, hi = s.h ? b.x1 : b.y1; parts = parts.flatMap(([p, q]) => [[p, Math.min(q, lo)], [Math.max(p, hi), q]]).filter(([p, q]) => q - p > .05); }
        for (const [p, q] of parts) this.buildRail(root, s.h, s.c, p, q, glassM, railM);
        continue;
      }
      if (mz && s.outer && wallMode === 'full') { // asma katlı zemin: galeri bölümünde dış duvar asma kat tavanına kadar
        const brk = new Set([s.a, s.b]), inn = s.e - s.n * .05;
        for (const r of mz.rects) for (const v of s.h ? [r.x, r.x + r.w] : [r.y, r.y + r.d]) if (v > s.a && v < s.b) brk.add(v);
        const xs = [...brk].sort((p, q) => p - q);
        for (let k = 0; k < xs.length - 1; k++) { const m = (xs[k] + xs[k + 1]) / 2, cov = s.h ? inRects(mz.rects, m, inn) : inRects(mz.rects, inn, m); emit(s, xs[k], xs[k + 1], cov ? H + mz.slab : mz.top); }
        continue;
      }
      emit(s, s.a, s.b, wallH);
    }
    for (const hl of der.holes) this.holeRail(root, hl, glassM, railM); // merdiven boşluğu korkuluğu

    // Eşyalar
    for (const it of [...P.items, ...der.ghosts]) {
      if (isLight(it)) continue; // armatürler tavanla birlikte kurulur
      const g = it.type === 'stair' ? this.buildStair(it, P, li, dark) : it.type === 'lift' ? this.buildLift(it, P, li, dark) : this.buildItem(it, wallH, dark);
      if (!g) continue;
      g.position.set(it.cx, 0, it.cy); g.rotation.y = -(it.rot || 0) * D2R;
      g.userData.pick = {k: 'item', id: it.id, lv: it.ghost ? it.lv : li};
      if (it.type === 'zone') g.userData.zoneItem = 1;
      root.add(g);
    }
    this.flushProducts();

    // İnsan boşlukları (zeminde)
    if (Settings.v.clear) {
      const A = Ed.A;
      for (const it of P.items) {
        if (!isSolid(it)) continue;
        for (const sd of ['f', 'b']) {
          const v = sd === 'f' ? it.clear : it.clearB; if (!(v > 0)) continue;
          const bad = A.zoneBad.has(it.id + ':' + sd);
          const m = new T.Mesh(new T.PlaneGeometry(it.w, v), this.mat(bad ? '#E5484D' : '#3FA66B', {transparent: true, opacity: bad ? .3 : .14, depthWrite: false}));
          m.rotation.x = -Math.PI / 2;
          const g = new T.Group(); g.add(m); g.userData.clearZone = 1;
          m.position.set(0, 0.004, sd === 'f' ? it.d / 2 + v / 2 : -it.d / 2 - v / 2);
          g.position.set(it.cx, 0, it.cy); g.rotation.y = -it.rot * D2R; root.add(g);
        }
      }
    }

    // Tabela (yalnız zemin kat) ve tavan
    if (wallMode === 'full' && curLevel(P).kind === 'ground') this.buildSign(P, H, dark);
    const up = P.items.filter(it => it.type === 'stair').map(it => { const b = itemBox(it); return {x: b.x0, y: b.y0, w: b.x1 - b.x0, d: b.y1 - b.y0}; });
    this.buildCeiling(P, H, wallMode === 'full' || (!o.top && !o.walk), {cuts: up, mz, maxLamps: o.maxLamps});

  },
  /* Dış zemin: asfalt + kaldırım + bordür; zemin ve bodrum katların izinin çevresinde şerit olarak (boşluktan alt kat görünsün) */
  buildOutdoor(P, dark) {
    const T = this.T, root = this.root, L = P.levels, SW = 7;
    let x0 = 0, z0 = 0, x1 = L[groundIdx(P)].shop.w, z1 = L[groundIdx(P)].shop.d;
    L.forEach((l, i) => { if (l.kind === 'basement') { x0 = Math.min(x0, l.ox); z0 = Math.min(z0, l.oy); x1 = Math.max(x1, l.ox + l.shop.w); z1 = Math.max(z1, l.oy + l.shop.d); } });
    const strips = (ax0, az0, ax1, az1, bx0, bz0, bx1, bz1) => [[ax0, az0, ax1, bz0], [ax0, bz1, ax1, az1], [ax0, bz0, bx0, bz1], [bx1, bz0, ax1, bz1]].filter(r => r[2] - r[0] > .01 && r[3] - r[1] > .01);
    const plane = (r, m, y, rep) => { const w = r[2] - r[0], d = r[3] - r[1]; const pm = new T.Mesh(new T.PlaneGeometry(w, d), m); pm.rotation.x = -Math.PI / 2; pm.position.set((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2); pm.receiveShadow = true; root.add(pm); return pm; };
    const asph = this.mat(dark ? '#2B302E' : '#9A9C98', {roughness: .95});
    for (const r of strips(x0 - SW - 40, z0 - SW - 40, x1 + SW + 40, z1 + SW + 40, x0 - SW, z0 - SW, x1 + SW, z1 + SW)) plane(r, asph, -.03);
    const tex = this.floorTex(dark ? '#4A504D' : '#D6D2C9', dark ? '#3E4441' : '#C2BDB2', 3);
    for (const r of strips(x0 - SW, z0 - SW, x1 + SW, z1 + SW, x0, z0, x1, z1)) {
      const m = new T.MeshStandardMaterial({color: 0xffffff, roughness: .9, map: tex.clone()}); m._own = true;
      m.map.needsUpdate = true; m.map.repeat.set((r[2] - r[0]) / .5, (r[3] - r[1]) / .5); m.map.offset.set(r[0] / .5 % 1, -r[3] / .5 % 1);
      plane(r, m, -.012);
    }
    const curb = this.mat(dark ? '#5C625F' : '#B9B4AA'), W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [x, z, w, d] of [[cx, z0 - SW - .05, W + SW * 2 + .1, .1], [cx, z1 + SW + .05, W + SW * 2 + .1, .1], [x0 - SW - .05, cz, .1, D + SW * 2], [x1 + SW + .05, cz, .1, D + SW * 2]]) this.box(root, w, .04, d, curb, x, -.01, z);
  },
  /* Cam korkuluk: hat (yatay/dikey), aralık */
  buildRail(root, horiz, c, a, b, glassM, railM, h = 1.0) {
    const len = b - a, mid = (a + b) / 2;
    if (len < .05) return;
    const P3 = (al, y, w, hh, d) => horiz ? [w, hh, d, mid + al, y, c] : [d, hh, w, c, y, mid + al];
    const add = (w, hh, d, m, al, y) => { const [bw, bh, bd, x, yy, z] = P3(al, y, w, hh, d); const k = this.box(root, bw, bh, bd, m, x, yy, z); k.castShadow = false; return k; };
    add(len, h - .08, .012, glassM, 0, (h - .08) / 2 + .04);
    add(len, .045, .05, railM, 0, h);
    add(len, .06, .06, railM, 0, .03);
  },
  holeRail(root, hl, glassM, railM) {
    const b = hl.box;
    if (hl.edge !== 't') this.buildRail(root, true, b.y0, b.x0, b.x1, glassM, railM);
    if (hl.edge !== 'b') this.buildRail(root, true, b.y1, b.x0, b.x1, glassM, railM);
    if (hl.edge !== 'l') this.buildRail(root, false, b.x0, b.y0, b.y1, glassM, railM);
    if (hl.edge !== 'r') this.buildRail(root, false, b.x1, b.y0, b.y1, glassM, railM);
  },
  /* Merdiven: blok basamaklar, sahanlık, korkuluk ve küpeşte (yerel koordinat) */
  buildStair(it, P, li, dark) {
    const T = this.T, g = new T.Group(), R = stairRise(P, li), G = stairGeom(it, R.n), r = R.r, ff = R.ff;
    const top = this.mat(dark ? '#CFC8BC' : '#E4DED3', {roughness: .5}), body = this.mat(dark ? '#8F8A82' : '#BDB7AD', {roughness: .85});
    const nose = this.mat('#3A3F44', {roughness: .5}), rail = this.chrome(), glass = this.glass();
    for (const t of G.treads) {
      const ys = t.k * r;
      if (it.style === 'spiral') {
        const sh = new T.Shape(t.poly.map(([x, y]) => new T.Vector2(x, y)));
        const geo = new T.ExtrudeGeometry(sh, {depth: .05, bevelEnabled: false});
        const m = new T.Mesh(geo, top); m.rotation.x = Math.PI / 2; m.position.y = ys; m.castShadow = true; m.receiveShadow = true; g.add(m);
        continue;
      }
      const bx = polyBox(t.poly), w = bx.x1 - bx.x0, d = bx.y1 - bx.y0, th = Math.min(ys, t.landing ? .2 : .24);
      this.box(g, w, th - .02, d, body, (bx.x0 + bx.x1) / 2, ys - .02 - (th - .02) / 2, (bx.y0 + bx.y1) / 2);
      this.box(g, w, .02, d + .01, top, (bx.x0 + bx.x1) / 2, ys - .01, (bx.y0 + bx.y1) / 2);
    }
    if (it.style === 'spiral') {
      const pole = new T.Mesh(new T.CylinderGeometry(.05, .05, ff + 1, 16), rail); pole.position.y = (ff + 1) / 2; g.add(pole);
      const pts = []; for (let q = 0; q <= 48; q++) { const p = pathAt(G.path, pathLen(G.path) * q / 48), a = Math.atan2(p.y, p.x); pts.push(new T.Vector3(Math.cos(a) * (it.w / 2 - .04), p.t * ff + .95, Math.sin(a) * (it.w / 2 - .04))); }
      const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 96, .02, 8), rail); g.add(tube);
      for (let q = 0; q < pts.length; q += 3) { const p = pts[q], post = new T.Mesh(new T.CylinderGeometry(.008, .008, .95, 6), rail); post.position.set(p.x, p.y - .475, p.z); g.add(post); }
    } else {
      const Lp = pathLen(G.path), side = G.width / 2 - .04;
      for (const sg of [-1, 1]) {
        let prev = null;
        for (let q = 0; q <= Math.ceil(Lp / .25); q++) {
          const p = pathAt(G.path, Math.min(Lp, q * .25)), nx = p.dy * sg * side, ny = -p.dx * sg * side;
          const cur = new T.Vector3(p.x + nx, p.t * ff + .9, p.y + ny);
          if (prev && prev.distanceTo(cur) > .01) { const L = prev.distanceTo(cur), c = new T.Mesh(new T.CylinderGeometry(.02, .02, L, 8), rail); c.position.copy(prev).add(cur).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), cur.clone().sub(prev).normalize()); g.add(c);
            const gp = new T.Mesh(new T.PlaneGeometry(L, .8), glass); gp.position.set((prev.x + cur.x) / 2, (prev.y + cur.y) / 2 - .45, (prev.z + cur.z) / 2); gp.rotation.y = -Math.atan2(cur.z - prev.z, cur.x - prev.x); gp.rotation.z = Math.atan2(cur.y - prev.y, Math.hypot(cur.x - prev.x, cur.z - prev.z)); g.add(gp); }
          prev = cur;
        }
      }
    }
    if (!R.top) { const warnM = this.mat('#E5484D', {transparent: true, opacity: .25, depthWrite: false}); const m = this.box(g, it.w, .02, it.d, warnM, 0, .01, 0); m.castShadow = false; }
    g.traverse(n => { if (n.isMesh && n.material === glass) n.castShadow = false; });
    return g;
  },
  /* Asansör kuyusu (bu kat yüksekliği boyunca): duvarlar, kapı, çağrı butonu */
  buildLift(it, P, li, dark) {
    const T = this.T, g = new T.Group(), w = it.w, d = it.d, t = .1, L = P.levels, H = L[li].shop.h + (L[li + 1] ? L[li + 1].slab : 0);
    const wall = this.mat(dark ? '#9AA3AB' : '#D7DBDE', {roughness: .7}), steel = this.chrome(), dark2 = this.mat('#2E3438', {roughness: .4, metalness: .5});
    this.box(g, w, H, t, wall, 0, H / 2, -d / 2 + t / 2);
    this.box(g, t, H, d, wall, -w / 2 + t / 2, H / 2, 0);
    this.box(g, t, H, d, wall, w / 2 - t / 2, H / 2, 0);
    const dw = Math.min(.9, w - .5), side = (w - dw) / 2;
    this.box(g, side, H, t, wall, -w / 2 + side / 2, H / 2, d / 2 - t / 2);
    this.box(g, side, H, t, wall, w / 2 - side / 2, H / 2, d / 2 - t / 2);
    this.box(g, dw, H - 2.1, t, wall, 0, 2.1 + (H - 2.1) / 2, d / 2 - t / 2);
    this.box(g, dw / 2 - .005, 2.1, .03, steel, -dw / 4, 1.05, d / 2 - t / 2 + .02);
    this.box(g, dw / 2 - .005, 2.1, .03, steel, dw / 4, 1.05, d / 2 - t / 2 + .02);
    this.box(g, dw + .1, .06, .05, dark2, 0, 2.13, d / 2 - t / 2 + .03);
    this.box(g, .08, .16, .02, dark2, dw / 2 + .16, 1.1, d / 2 + .005);
    const b = this.box(g, .03, .03, .01, this.mat('#FFFFFF', {emissive: '#9FD4FF', emissiveIntensity: 2}), dw / 2 + .16, 1.13, d / 2 + .016); b.castShadow = false;
    return g;
  },
  /* Işık durumu: gündüz (yörünge/gez) ya da akşam; tavan ve armatür görünürlüğü */
  lightMode() {
    const walk = this.mode === 'walk', dark = document.documentElement.dataset.mode === 'dark', night = !!Settings.v.night;
    const showCeil = walk || (Settings.v.ceil3d ?? true);
    for (const cg of this.ceils || []) { cg.visible = showCeil; for (const c of cg.children) if (c.userData.autoLamp) c.visible = walk; } // varsayılan paneller yukarıdan bakınca gizli
    for (const c of this.kids()) {
      if (c.userData.label || c.userData.clearZone || c.userData.zoneItem) c.visible = !walk;
      if (c.userData.fixture) c.visible = showCeil;
    }
    const own = !!this.ownLights;
    if (night) {
      this.hemi.intensity = .14; this.sun.intensity = 0; this.scene.environmentIntensity = .1; if (this.fill) this.fill.intensity = 0;
      this.scene.background = this.skyTex('night');
    } else {
      this.hemi.intensity = walk ? (own ? .85 : 1.25) : (dark ? .9 : 1.1);
      this.sun.intensity = walk ? (own ? .9 : 1.2) : 2.0;
      this.scene.environmentIntensity = walk ? (own ? .6 : .85) : .6;
      if (this.fill) this.fill.intensity = walk ? (own ? .55 : 1.4) : 0;
      this.scene.background = this.skyTex(dark);
    }
    const lf = night ? 1.5 : walk ? .7 : .4;
    for (const L of this.lamps || []) L.intensity = L.userData.base * lf;
    for (const m of this.ceilMats || []) m.emissiveIntensity = m.userData.em * (night ? .25 : walk ? 1 : .8);
  },
  /* Tavan dokusu (CanvasTexture): asma tavan karoları, düz boya, ahşap çıta, brüt */
  ceilCanvas(c) {
    this._ceilCv = this._ceilCv || new Map();
    const key = c.type + c.color;
    if (this._ceilCv.has(key)) return this._ceilCv.get(key);
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    g.fillStyle = c.color; g.fillRect(0, 0, N, N);
    if (c.type === 'wood') {
      const pitch = N / 6, gap = pitch * .2;
      for (let k = 0; k < 6; k++) {
        const y = k * pitch;
        g.fillStyle = mixHex(c.color, r() < .5 ? '#000000' : '#FFFFFF', r() * .08); g.fillRect(0, y, N, pitch - gap);
        for (let q = 0; q < 14; q++) { g.fillStyle = `rgba(60,35,15,${.05 + r() * .08})`; g.fillRect(0, y + r() * (pitch - gap), N, .6 + r() * 1.4); }
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + pitch - gap - 1.5, N, 1.5);
        g.fillStyle = '#1C1916'; g.fillRect(0, y + pitch - gap, N, gap);
      }
    } else {
      for (let i = 0; i < (c.type === 'grid' ? 2600 : 900); i++) { g.fillStyle = `rgba(${r() < .7 ? '0,0,0' : '255,255,255'},${.02 + r() * .05})`; const s = c.type === 'grid' ? 1 + r() * 1.6 : 2 + r() * 5; g.fillRect(r() * N, r() * N, s, s); }
      if (c.type === 'grid') {
        const b = 5; // T profil (24 mm)
        g.fillStyle = mixHex(c.color, '#FFFFFF', .55); g.fillRect(0, 0, N, b); g.fillRect(0, N - b, N, b); g.fillRect(0, 0, b, N); g.fillRect(N - b, 0, b, N);
        g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(b, b, N - b * 2, 1.5); g.fillRect(b, b, 1.5, N - b * 2); g.fillRect(b, N - b - 1, N - b * 2, 1); g.fillRect(N - b - 1, b, 1, N - b * 2);
      }
    }
    this._ceilCv.set(key, cv);
    return cv;
  },
  ceilMat(c, fr) {
    const T = this.T, size = c.type === 'grid' ? .6 : c.type === 'wood' ? .6 : 2;
    const t = new T.CanvasTexture(this.ceilCanvas(c));
    t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    t.repeat.set(fr.w / size, fr.d / size); t.offset.set((fr.x / size) % 1, (fr.y / size) % 1);
    const em = c.type === 'none' ? .05 : c.type === 'wood' ? .22 : .42;
    const m = new T.MeshStandardMaterial({map: t, emissiveMap: t, emissive: new T.Color('#FFFFFF'), emissiveIntensity: em, roughness: c.type === 'wood' ? .6 : .95, side: T.FrontSide});
    m._own = true; m.userData.em = em;
    return m;
  },
  buildCeiling(P, H0, full, o = {}) {
    const T = this.T, W = P.shop.w, D = P.shop.d, g = new T.Group(), c = ceilOf(P), mz = o.mz;
    const lights = P.items.filter(isLight);
    if (lights.length) this.ownLights = true;
    // Tavan yüksekliği: asma katın dışında kalan galeri bölümü çift yükseklik
    const Hat = (x, y) => mz && !inRects(mz.rects, x, y) ? mz.top : H0;
    const em = [];
    if (full) {
      const base = shopRects(P).flatMap(r => o.cuts && o.cuts.length ? rectMinus(r, o.cuts) : [r]);
      const parts = [];
      for (const r of base) {
        if (!mz) { parts.push([r, H0]); continue; }
        for (const m of mz.rects) { const x0 = Math.max(r.x, m.x), y0 = Math.max(r.y, m.y), x1 = Math.min(r.x + r.w, m.x + m.w), y1 = Math.min(r.y + r.d, m.y + m.d); if (x1 - x0 > .005 && y1 - y0 > .005) parts.push([{x: x0, y: y0, w: x1 - x0, d: y1 - y0}, H0]); }
        for (const q of rectMinus(r, mz.rects)) parts.push([q, mz.top]);
      }
      for (const [fr, hh] of parts) { // aşağı bakan tek yüzlü düzlem: yukarıdan bakınca görünmez
        const m = this.ceilMat(c, fr); this.ceilMats.push(m);
        const p = new T.Mesh(new T.PlaneGeometry(fr.w, fr.d), m);
        p.rotation.x = Math.PI / 2; p.position.set(fr.x + fr.w / 2, hh - .002, fr.y + fr.d / 2); p.receiveShadow = false; p.castShadow = false; g.add(p);
      }
      if (!lights.length) { // armatür yoksa varsayılan 60×60 paneller
        const lamp = this.mat('#FFFFFF', {emissive: '#FFFFFF', emissiveIntensity: 2.2, roughness: .4});
        const nx = Math.max(1, Math.round(W / 2.4)), nz = Math.max(1, Math.round(D / 2.4));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const x = (i + .5) * W / nx, z = (j + .5) * D / nz;
          if (!inShop(P, x, z) || (o.cuts && inRects(o.cuts, x, z))) continue;
          const H = Hat(x, z);
          const l = this.box(g, .6, .02, .6, lamp, x, H - .012, z); l.castShadow = false; l.receiveShadow = false; l.userData.autoLamp = 1;
          em.push({x, z, y: H - .03, lm: 3600, ang: 1.15, col: '#FFF4E6'});
        }
      }
      this.root.add(g); this.ceils.push(g);
    }
    for (const it of lights) {
      const H = Hat(it.cx, it.cy);
      const f = this.buildFixture(it, H);
      f.position.set(it.cx, 0, it.cy); f.rotation.y = -(it.rot || 0) * D2R;
      f.userData.pick = {k: 'item', id: it.id, lv: P.cur}; f.userData.fixture = 1;
      this.root.add(f);
      const col = CCT_COLOR[it.cct] || CCT_COLOR[4000], lm = lightLm(it);
      if (it.style === 'spot') {
        const n = it.cnt || 1;
        for (let i = 0; i < n; i++) { const [x, z] = toWorld(it, n > 1 ? -it.w / 2 + .05 + i * it.sp : 0, 0); em.push({x, z, y: H - (it.mount === 'surface' ? .12 : .02), lm: lm / n, ang: .55, col}); }
      } else if (it.style === 'linear') {
        const y = it.mount === 'suspended' ? H - it.drop - .08 : it.mount === 'surface' ? H - .08 : H - .02;
        const k = Math.max(1, Math.round(it.w / 1.8));
        for (let i = 0; i < k; i++) { const [x, z] = toWorld(it, -it.w / 2 + (i + .5) * it.w / k, 0); em.push({x, z, y, lm: lm / k, ang: 1.1, col}); }
      } else em.push({x: it.cx, z: it.cy, y: H - lightDepth(it) + .05, lm, ang: 1.3, col});
    }
    this.buildLamps(em, H0, o.maxLamps);
  },
  /* Işık kaynakları: çok sayıda armatür, yakın olanlar birleştirilerek sınırlı sayıda gerçek ışığa dönüşür */
  buildLamps(em, H, max) {
    const T = this.T, MAX = max || (isMobile() ? 6 : 10);
    const rooms = [...Ed.P.rooms].sort((a, b) => a.w * a.d - b.w * b.d);
    const region = (x, z) => rooms.findIndex(r => x > r.x && x < r.x + r.w && z > r.y && z < r.y + r.d);
    let cl = em.map(e => ({...e, n: 1, spread: 0, pts: [[e.x, e.z]], rg: region(e.x, e.z)}));
    while (cl.length > MAX) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const d = Math.hypot(cl[i].x - cl[j].x, cl[i].z - cl[j].z) * (1 + (cl[i].n + cl[j].n) * .05) * (cl[i].rg === cl[j].rg ? 1 : 6); /* aynı odadakiler önce birleşir */ if (d < bd) { bd = d; bi = i; bj = j; } }
      const a = cl[bi], b = cl[bj], lm = a.lm + b.lm;
      const m = {x: (a.x * a.lm + b.x * b.lm) / lm, z: (a.z * a.lm + b.z * b.lm) / lm, y: (a.y * a.lm + b.y * b.lm) / lm, lm, ang: Math.max(a.ang, b.ang), col: a.lm >= b.lm ? a.col : b.col, n: a.n + b.n, pts: a.pts.concat(b.pts), rg: a.lm >= b.lm ? a.rg : b.rg};
      m.spread = Math.max(...m.pts.map(([x, z]) => Math.hypot(x - m.x, z - m.z)));
      cl.splice(bj, 1); cl[bi] = m;
    }
    for (const c of cl) {
      const h = Math.max(.5, c.y), ang = clamp(Math.atan((c.spread + h * Math.tan(c.ang)) / h), c.ang, 1.4);
      const L = new T.SpotLight(new T.Color(c.col), 1, 0, ang, c.n > 1 ? 1 : .75, 2);
      L.castShadow = false;
      L.position.set(c.x, c.y, c.z); L.target.position.set(c.x, 0, c.z);
      L.userData.base = c.lm / (2 * Math.PI * (1 - Math.cos(ang))) * .012;
      this.root.add(L); this.root.add(L.target); this.lamps.push(L);
    }
  },
  /* Armatür modelleri (yerel: x boy, z en; y mutlak yükseklik) */
  buildFixture(it, H) {
    const T = this.T, g = new T.Group();
    const col = CCT_COLOR[it.cct] || CCT_COLOR[4000];
    const glow = this.mat('#FFFFFF', {emissive: col, emissiveIntensity: 3.2, roughness: .3});
    const soft = this.mat('#FFFFFF', {emissive: col, emissiveIntensity: 1.5, roughness: .4});
    const alu = this.mat('#C7CBCF', {metalness: .65, roughness: .32});
    const white = this.mat('#F3F3F1', {roughness: .45});
    const black = this.mat('#1E2124', {roughness: .5, metalness: .2});
    const cyl = (r0, r1, hh, m, x, y, z, seg = 24) => { const c = new T.Mesh(new T.CylinderGeometry(r0, r1, hh, seg), m); c.position.set(x, y, z); g.add(c); return c; };
    const cable = (x0, y0, z0, x1, y1, z1) => { const a = new T.Vector3(x0, y0, z0), b = new T.Vector3(x1, y1, z1), L = a.distanceTo(b); const c = new T.Mesh(new T.CylinderGeometry(.0018, .0018, L, 5), black); c.position.copy(a).add(b).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(c); };
    if (it.style === 'spot') {
      const n = it.cnt || 1;
      for (let i = 0; i < n; i++) {
        const x = n > 1 ? -it.w / 2 + .05 + i * it.sp : 0;
        if (it.mount === 'surface') { cyl(.045, .045, .11, white, x, H - .055, 0); cyl(.034, .034, .004, glow, x, H - .111, 0); cyl(.046, .046, .006, alu, x, H - .108, 0); }
        else { cyl(.056, .056, .006, white, x, H - .003, 0); cyl(.04, .044, .006, alu, x, H - .006, 0); cyl(.03, .03, .016, glow, x, H - .004, 0); } // mercek üstten de görünür
      }
    } else if (it.style === 'linear') {
      const w = it.w, d = Math.max(.035, it.d);
      if (it.mount === 'recessed') { this.box(g, w + .012, .008, d + .012, alu, 0, H - .004, 0); this.box(g, w, .016, d - .012, glow, 0, H - .004, 0); }
      else {
        const y = it.mount === 'suspended' ? H - it.drop : H;
        this.box(g, w, .07, d, alu, 0, y - .035, 0); this.box(g, w - .012, .004, d - .01, glow, 0, y - .072, 0);
        this.box(g, .006, .07, d + .002, black, -w / 2 + .003, y - .035, 0); this.box(g, .006, .07, d + .002, black, w / 2 - .003, y - .035, 0);
        if (it.mount === 'suspended') for (const x of [-w / 2 + .12, w / 2 - .12]) { cable(x, y, 0, x, H, 0); cyl(.025, .025, .012, white, x, H - .006, 0); }
      }
    } else {
      const R = it.w / 2, y = H - (it.drop || .7);
      cyl(.06, .06, .02, white, 0, H - .01, 0);
      if (it.model === 'ring') {
        const ring = new T.Mesh(new T.TorusGeometry(R, .022, 12, 72), alu); ring.rotation.x = Math.PI / 2; ring.position.set(0, y, 0); g.add(ring);
        const band = new T.Mesh(new T.TorusGeometry(R, .012, 8, 72), glow); band.rotation.x = Math.PI / 2; band.position.set(0, y - .016, 0); g.add(band);
        for (let k = 0; k < 3; k++) { const a = k * 2.094; cable(Math.cos(a) * R, y + .02, Math.sin(a) * R, 0, H - .02, 0); }
      } else if (it.model === 'globe') { // sarkma: kablo boyu (kürenin tepesine kadar)
        const cy = y - R;
        cable(0, y, 0, 0, H - .02, 0); cyl(.025, .03, .05, alu, 0, y + .01, 0);
        const s = new T.Mesh(new T.SphereGeometry(R, 40, 24), this.mat('#FFFFFF', {emissive: col, emissiveIntensity: .85, roughness: .25, transparent: true, opacity: .96})); s.position.set(0, cy, 0); g.add(s);
        const core = new T.Mesh(new T.SphereGeometry(R * .35, 20, 14), glow); core.position.set(0, cy, 0); g.add(core);
      } else {
        const by = y - R * .75; // çan: üst ucu sarkma hizasında
        const pts = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI / 2; pts.push(new T.Vector2(.03 + Math.sin(a) * R, Math.cos(a) * R * .75)); }
        const shadeM = this.mat('#2A2F33', {metalness: .5, roughness: .35, side: T.DoubleSide});
        const sh = new T.Mesh(new T.LatheGeometry(pts, 40), shadeM); sh.position.set(0, by, 0); g.add(sh);
        const inner = new T.Mesh(new T.LatheGeometry(pts.map(p => new T.Vector2(p.x * .985, p.y - .004)), 40), this.mat('#FFFFFF', {emissive: col, emissiveIntensity: .9, side: T.BackSide})); inner.position.set(0, by, 0); g.add(inner);
        const bulb = new T.Mesh(new T.SphereGeometry(.055, 20, 14), glow); bulb.position.set(0, by + .08, 0); g.add(bulb);
        cable(0, y, 0, 0, H - .02, 0);
      }
    }
    g.traverse(n => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
    return g;
  },

  /* ---------- Eczane tabelası ---------- */
  buildSign(P, H, dark) {
    const T = this.T;
    let text = (P.sign ?? P.name ?? '').trim();
    if (!text) return;
    text = text.toLocaleUpperCase('tr-TR');
    if (!/ECZANE/.test(text)) text += ' ECZANESİ';
    // Hangi cephe: dış duvardaki (en geniş) giriş kapısı; yoksa ön (alt) duvar
    const doors = P.items.filter(it => it.type === 'door').map(it => ({it, s: wallOf(it, Ed.segs)})).filter(o => o.s && o.s.outer);
    doors.sort((a, b) => (b.it.style === 'double') - (a.it.style === 'double') || b.it.w - a.it.w);
    let s, along, doorTop = 2.2;
    if (doors.length) { s = doors[0].s; along = s.h ? doors[0].it.cx : doors[0].it.cy; doorTop = doors[0].it.h; }
    else { s = Ed.segs.filter(q => q.outer && q.h && q.n > 0).sort((a, b) => (b.eb - b.ea) - (a.eb - a.ea))[0] || Ed.segs.find(q => q.outer); along = (s.ea + s.eb) / 2; }
    const [lo, hi] = segRange(s);
    const out = s.n;                            // dışa doğru yön
    const face = s.c + out * s.t / 2;           // dış yüz hattı
    const tex = this.signTex(text);
    const sh = .62, sl = clamp(sh * tex.aspect, 2.2, Math.max(2.2, hi - lo - .4));
    along = clamp(along, lo + sl / 2 + .1, hi - sl / 2 - .1);
    const y = Math.min(Math.max(doorTop + .12 + sh / 2, 2.3 + sh / 2), H + .25);
    const sm = new T.MeshStandardMaterial({map: tex.t, emissive: 0xffffff, emissiveMap: tex.t, emissiveIntensity: .55, roughness: .45}); sm._own = true;
    const frame = this.mat(dark ? '#3A3F3D' : '#2F3533', {roughness: .5, metalness: .3});
    const g = new T.Group();
    // Uzun kenar duvar boyunca; yüz dışarı
    const mats = [frame, frame, frame, frame, frame, frame];
    const depth = .14;
    let mesh;
    if (s.h) { mats[out > 0 ? 4 : 5] = sm; mesh = this.box(g, sl, sh, depth, mats, along, y, face + out * depth / 2); }
    else {
      mats[out > 0 ? 0 : 1] = sm; mesh = this.box(g, depth, sh, sl, mats, face + out * depth / 2, y, along);

    }
    // Kırmızı "E" bayrak tabela (duvara dik, iki yüzü okunur)
    const et = this.eTex();
    const em = new T.MeshStandardMaterial({map: et, emissive: 0xffffff, emissiveMap: et, emissiveIntensity: .8, roughness: .4}); em._own = true;
    const bs = .58, bd = .1, off = .42;
    const bAlong = along + sl / 2 + .45 <= hi - .3 ? along + sl / 2 + .45 : along - sl / 2 - .45;
    const bm = [frame, frame, frame, frame, frame, frame];
    if (s.h) { bm[0] = em; bm[1] = em; this.box(g, bd, bs, bs, bm, bAlong, y + .02, face + out * (off + .04)); this.box(g, .03, .04, off, frame, bAlong, y + .02, face + out * off / 2); }
    else { bm[4] = em; bm[5] = em; this.box(g, bs, bs, bd, bm, face + out * (off + .04), y + .02, bAlong); this.box(g, off, .04, .03, frame, face + out * off / 2, y + .02, bAlong); }
    this.signInfo = {s, along, face, out, sl, y};
    g.userData.signSeg = s;
    this.root.add(g);
  },
  signTex(text) {
    const T = this.T, c = document.createElement('canvas'), g = c.getContext('2d');
    const Hh = 256, fs = 132;
    g.font = `800 ${fs}px ${getFont()}`;
    const tw = g.measureText(text).width;
    const Wd = Math.ceil(Math.min(4096, Hh + 90 + tw + 90));
    c.width = Wd; c.height = Hh;
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, Wd, Hh);
    g.fillStyle = '#D0102B'; g.fillRect(0, Hh - 18, Wd, 18); g.fillRect(0, 0, Wd, 10);
    // Logo
    const L = Hh - 70, lx = 40, ly = 30;
    g.beginPath(); g.roundRect(lx, ly, L, L, 26); g.fill();
    g.fillStyle = '#FFFFFF'; g.font = `900 ${L * .82}px ${getFont()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('E', lx + L / 2, ly + L / 2 + L * .04);
    // Yazı
    let f = fs; g.font = `800 ${f}px ${getFont()}`;
    const avail = Wd - (lx + L + 60) - 50;
    while (g.measureText(text).width > avail && f > 40) { f -= 4; g.font = `800 ${f}px ${getFont()}`; }
    g.fillStyle = '#C8102E'; g.textAlign = 'left';
    g.fillText(text, lx + L + 60, Hh / 2 + 4);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return {t, aspect: Wd / Hh};
  },
  eTex() {
    if (this._et) return this._et;
    const T = this.T, c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#D0102B'; g.lineWidth = 16; g.strokeRect(8, 8, 240, 240);
    g.fillStyle = '#D0102B'; g.font = `900 200px ${getFont()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('E', 128, 138);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return (this._et = t);
  },

  /* ---------- Dokular ve malzemeler ---------- */
  woodTex() {
    if (this._wood) return this._wood;
    const T = this.T, c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d'); g.fillStyle = '#EDEDED'; g.fillRect(0, 0, 256, 512);
    let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const x = r() * 256; g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 16) g.lineTo(x + Math.sin(y / 70 + i) * 4 * r(), y);
      g.strokeStyle = `rgba(0,0,0,${.03 + r() * .07})`; g.lineWidth = .5 + r() * 2; g.stroke();
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.05)'; g.beginPath(); g.ellipse(r() * 256, r() * 512, 3 + r() * 6, 10 + r() * 20, 0, 0, 7); g.fill(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    return (this._wood = t);
  },
  wood(color, o = {}) {
    const [r, g, b] = hexToRgb(color), lum = (.2126 * r + .7152 * g + .0722 * b) / 255;
    if (lum > .78) return this.mat(color, Object.assign({roughness: .32}, o)); // açık renk: lake
    return this.mat(color, Object.assign({map: this.woodTex(), roughness: .6}, o));
  },
  steel(color = '#A3ABB2', o = {}) { return this.mat(color, Object.assign({metalness: .8, roughness: .32}, o)); },
  chrome() { return this.mat('#E8ECEF', {metalness: 1, roughness: .1}); },
  ceramic() { return this.mat('#FBFBF9', {roughness: .08}); },
  mirror() { return this.mat('#DDE3E6', {metalness: 1, roughness: .03}); },
  aoTex() {
    if (this._ao) return this._ao;
    const T = this.T, c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 24; i++) { const k = i * 2.2; g.fillStyle = 'rgba(0,0,0,.055)'; g.beginPath(); g.roundRect(k, k, 128 - 2 * k, 128 - 2 * k, 40 - k * .6 > 2 ? 40 - k * .6 : 2); g.fill(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return (this._ao = t);
  },
  wallAoTex() {
    if (this._wao) return this._wao;
    const T = this.T, c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.34)'); gr.addColorStop(.35, 'rgba(0,0,0,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return (this._wao = t);
  },
  /* Eşyanın altına yumuşak temas gölgesi */
  contact(g, w, d, strength = .5, pad = .14) {
    const T = this.T;
    const m = new T.Mesh(new T.PlaneGeometry(w + pad * 2, d + pad * 2), this.mat('#000000', {map: this.aoTex(), transparent: true, opacity: strength, depthWrite: false}));
    m.rotation.x = -Math.PI / 2; m.position.y = .0035; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = false;
    g.add(m); return m;
  },
  labelTex(text, bg, fg) {
    const T = this.T, c = document.createElement('canvas'); c.width = 1024; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 160);
    let f = 96; g.font = `800 ${f}px ${getFont()}`;
    while (g.measureText(text).width > 940 && f > 30) { f -= 4; g.font = `800 ${f}px ${getFont()}`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 84);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  },
  /* Işıklı başlık kutusu (OTC / kozmetik) */
  header(g, w, y, z, text, bg, fg) {
    const T = this.T, t = this.labelTex(text || '', bg, fg);
    const sm = new T.MeshStandardMaterial({map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .7, roughness: .4}); sm._own = true;
    const fr = this.mat(bg);
    this.box(g, w, .22, .06, [fr, fr, fr, fr, sm, fr], 0, y, z);
  },

  /* ---------- Ürünler ---------- */
  prodMats() {
    if (this._pm) return this._pm;
    const T = this.T;
    const tex = draw => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
    const med = ['#D7263D', '#1B6CA8', '#2A9D5C', '#F08A24', '#7B4FB8', '#0E8C8C', '#E0569B', '#243B6B', '#E8B923', '#5E6B73', '#3AAFA9', '#B5651D'].map((col, i) =>
      new T.MeshStandardMaterial({roughness: .5, map: tex(g => {
        const full = i % 4 === 3;
        g.fillStyle = full ? col : '#FBFBF8'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = full ? '#FFFFFF' : col;
        if (full) { g.fillRect(6, 34, 52, 5); g.fillRect(6, 44, 36, 4); }
        else { g.fillRect(0, 0, 64, 18 + (i % 3) * 4); g.beginPath(); g.arc(46, 42, 8, 0, 7); g.fill(); g.fillStyle = '#9BA3A7'; g.fillRect(6, 36, 26, 3); g.fillRect(6, 44, 20, 3); g.fillRect(6, 52, 30, 3); }
      })}));
    const cos = [['#FFFFFF', '#C9A96E'], ['#F6D5D8', '#B0676F'], ['#1E1E22', '#D8B56A'], ['#E8EEF3', '#3F6E9A'], ['#F3E6D6', '#8A6A4A'], ['#DDEFE6', '#3E8A66'], ['#FFF3C7', '#C28B1A'], ['#EADFF3', '#7B4FB8']].map(([b, a]) =>
      new T.MeshStandardMaterial({roughness: .18, map: tex(g => { g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillStyle = a; g.fillRect(0, 26, 64, 10); g.fillRect(0, 0, 64, 5); })}));
    const carton = ['#B58A5C', '#C49A6C', '#A77C50'].map((b, i) =>
      new T.MeshStandardMaterial({roughness: .9, map: tex(g => { g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(28, 0, 8, 64); g.fillStyle = 'rgba(0,0,0,.25)'; if (i !== 1) { g.fillRect(8, 40, 20, 3); g.fillRect(8, 46, 14, 3); } })}));
    const bins = ['#2F6FB5', '#D94B3D', '#E8B923', '#3E8A66'].map(col => new T.MeshStandardMaterial({color: col, roughness: .45}));
    return (this._pm = {med, cos, carton, bins});
  },
  rng(seedStr) {
    let seed = hashStr(seedStr);
    return () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  },
  /* Bir raf seviyesine ürün diz. zFront ön kenar; dir +1 → ürünler -z yönüne uzanır.
     kind: med (ilaç kutusu), big (büyük kutu), cos (kozmetik şişe/kutu), carton (koli) */
  fillShelf(g, rnd, x0, x1, y, zFront, depth, maxH, dir = 1, kind = 'med') {
    if (maxH < .07 || depth < .05) return;
    const M = this.T.Matrix4, V = this.T.Vector3, Q = this.T.Quaternion;
    const push = (set, mi, geo, x, yy, z, sx, sy, sz) => this.prods.push({set, mi, geo, g, m: new M().compose(new V(x, yy, z), new Q(), new V(sx, sy, sz))});
    let x = x0 + .01;
    if (kind === 'carton') {
      while (x < x1 - .15) {
        const bw = Math.min(x1 - x - .01, .22 + rnd() * .22), bh = Math.min(maxH - .03, .16 + rnd() * .2), bd = Math.max(.1, depth - .04 - rnd() * .08);
        if (bw < .12) break;
        if (rnd() < .22) push('bins', Math.floor(rnd() * 4), 'box', x + bw / 2, y + Math.min(bh, .18) / 2, zFront - dir * (bd / 2 + .01), bw, Math.min(bh, .18), bd);
        else if (rnd() > .08) push('carton', Math.floor(rnd() * 3), 'box', x + bw / 2, y + bh / 2, zFront - dir * (bd / 2 + .01), bw, bh, bd);
        x += bw + .025;
      }
      return;
    }
    while (x < x1 - .05) {
      if (rnd() < .07) { x += .05 + rnd() * .1; continue; }
      if (kind === 'cos') {
        const cyl = rnd() < .55, mi = Math.floor(rnd() * 8);
        const bw = cyl ? .045 + rnd() * .035 : .06 + rnd() * .06;
        const bh = Math.min(maxH - .03, cyl ? .1 + rnd() * .13 : .08 + rnd() * .1);
        const bd = cyl ? bw : Math.min(depth - .04, .05 + rnd() * .05);
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n && x + bw < x1 - .005; k++) { push('cos', mi, cyl ? 'cyl' : 'box', x + bw / 2, y + bh / 2, zFront - dir * (bd / 2 + .03), bw, bh, bd); x += bw + .012; }
        x += .03;
        continue;
      }
      const big = kind === 'big', mi = Math.floor(rnd() * 12);
      const bw = big ? .07 + rnd() * .1 : .04 + rnd() * .07;
      const bh = Math.min(maxH - .02, big ? .12 + rnd() * .14 : .07 + rnd() * .12);
      const bd = Math.min(depth - .02, big ? .06 + rnd() * .08 : .05 + rnd() * .08);
      const n = 1 + Math.floor(rnd() * 4);
      const rows = depth > bd * 2 + .06 ? 2 : 1;
      for (let k = 0; k < n && x + bw < x1 - .005; k++) {
        for (let r = 0; r < rows; r++) push('med', mi, 'box', x + bw / 2, y + bh / 2, zFront - dir * (bd / 2 + .012 + r * (bd + .01)), bw, bh, bd);
        x += bw + .004;
      }
      x += .01;
    }
  },
  flushProducts() {
    const T = this.T; if (!this.prods || !this.prods.length) return;
    this.root.updateMatrixWorld(true);
    const mats = this.prodMats(), geos = {box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(.5, .5, 1, 16)};
    const by = new Map();
    for (const p of this.prods) { const k = p.set + ':' + p.mi + ':' + p.geo; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
    for (const list of by.values()) {
      const p0 = list[0];
      const im = new T.InstancedMesh(geos[p0.geo], mats[p0.set][p0.mi], list.length);
      list.forEach((p, i) => im.setMatrixAt(i, p.m.clone().premultiply(p.g.matrixWorld)));
      im.castShadow = false; im.receiveShadow = true; im.userData.products = 1;
      this.root.add(im);
    }
    this.prods = [];
  },
  /* Açık raf gövdesi: arka pano, yanlar, raflar + fiyat rayı/pleksi + ürünler, üstte LED'li korniş */
  shelfBay(g, it, o) {
    const {w, y0, y1, zb, depth, levels, rnd, body, panel, shelf, rail, led, kind = 'med', lip, noTop} = o;
    const B = (...a) => this.box(g, ...a);
    const zc = zb + depth / 2;
    B(w - .04, y1 - y0, .018, panel, 0, y0 + (y1 - y0) / 2, zb + .009);
    for (const sx of [-1, 1]) B(.025, y1 - y0 + .06, depth, body, sx * (w / 2 - .0125), y0 + (y1 - y0 + .06) / 2 - .03, zc);
    if (!noTop) B(w, .07, depth + .03, body, 0, y1 + .035, zc + .015);
    const l = B(w - .08, .012, .025, led, 0, y1 - .006, zb + depth - .04); l.castShadow = false;
    const step = (y1 - y0) / levels;
    for (let i = 0; i < levels; i++) {
      const y = y0 + i * step;
      if (i > 0) B(w - .05, .022, depth - .02, shelf, 0, y, zc + .005);
      const r = lip === 'plexi' ? this.box(g, w - .05, .06, .008, this.glass(), 0, y + .03, zb + depth - .004) : B(w - .05, .034, .012, rail, 0, y + .006, zb + depth - .004);
      r.castShadow = false;
      this.fillShelf(g, rnd, -w / 2 + .03, w / 2 - .03, y + .011, zb + depth - .02, depth - .05, step - .05, 1, kind);
    }
  },

  buildItem(it, wallH, dark) {
    const T = this.T, g = new T.Group(), w = it.w, d = it.d, h = it.h;
    const c = it.color, m = this.wood(c), light = this.wood(mixHex(c, '#FFFFFF', .22), {roughness: .5}), darkM = this.mat(mixHex(c, '#000000', .45));
    const metal = this.chrome();
    const B = (...a) => this.box(g, ...a);
    if (isSolid(it) && it.type !== 'column') this.contact(g, isRound(it) ? w * .8 : w, isRound(it) ? d * .8 : d, it.type === 'fixture' ? .35 : .5);
    switch (it.type) {
      case 'cabinet': {
        const st = it.style, rnd = this.rng(it.id), auto = cabAuto(it);
        const shelvesN = it.rows || auto.shelves;
        const panel = this.mat(mixHex(c, '#FFFFFF', .62), {roughness: .8});
        const shelf = this.mat(dark ? '#D9D5CD' : '#F2EFEA', {roughness: .5});
        const rail = this.mat('#39434A', {roughness: .5});
        const led = this.mat('#FFFFFF', {emissive: '#FFF6E5', emissiveIntensity: 2.4});
        const top = this.mat(dark ? '#D8D3CA' : '#EEEAE3', {roughness: .25});
        const drawers = (x0, x1, y0, y1, zf, rows, cols) => {
          const ww = x1 - x0, rh = (y1 - y0) / rows, cw = ww / cols;
          for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
            const x = x0 + cw * (k + .5), y = y0 + rh * (r + .5);
            B(cw - .008, rh - .008, .02, light, x, y, zf);
            B(Math.min(.14, cw * .4), .012, .012, metal, x, y - rh * .1, zf + .02);
            for (const sx of [-1, 1]) B(.01, .01, .02, metal, x + sx * Math.min(.06, cw * .18), y - rh * .1, zf + .012);
            if (rh > .1) { const lb = B(Math.min(.08, cw * .25), Math.min(.035, rh * .2), .004, this.mat('#FFFFFF'), x, y + rh * .22, zf + .012); lb.castShadow = false; }
          }
        };
        const doors = (x0, x1, y0, y1, zf) => {
          const n = Math.max(1, Math.round((x1 - x0) / .5)), dw = (x1 - x0) / n;
          for (let i = 0; i < n; i++) {
            const x = x0 + dw * (i + .5);
            B(dw - .006, y1 - y0, .02, light, x, (y0 + y1) / 2, zf);
            const hx = x + (i % 2 ? -1 : 1) * (dw / 2 - .05);
            B(.012, Math.min(.2, (y1 - y0) * .35), .014, metal, n === 1 ? x + dw / 2 - .05 : hx, y1 - Math.min(.16, (y1 - y0) * .3), zf + .02);
          }
        };
        if (st === 'open') {
          B(w, .1, d - .02, darkM, 0, .05, -.01);
          this.shelfBay(g, it, {w, y0: .1, y1: h - .07, zb: -d / 2, depth: d, levels: shelvesN, rnd, body: m, panel, shelf, rail, led});
        } else if (st === 'drawer') {
          // İlaç dolabı: altta çekmeceler + tezgâh, üstte açık ilaç rafı
          const lowH = auto.lowH, hasTop = h - lowH > .3;
          B(w, lowH - .03, d - .02, m, 0, (lowH - .03) / 2, -.01);
          B(w - .02, .1, d - .06, darkM, 0, .05, -.03);
          drawers(-w / 2 + .01, w / 2 - .01, .1, lowH - .035, d / 2 - .01, it.rows || auto.rows, it.cols || auto.cols);
          B(w + .01, .03, d + .02, top, 0, lowH - .015, .01);
          if (hasTop) {
            const du = Math.min(.34, d * .72);
            const levels = Math.max(2, Math.round((h - lowH - .1) / .34));
            this.shelfBay(g, it, {w, y0: lowH, y1: h - .07, zb: -d / 2, depth: du, levels, rnd, body: m, panel, shelf, rail, led});
          }
        } else if (st === 'otc') {
          // OTC: kapaklı alt dolap, pleksi önlü raflar, ışıklı başlık
          const baseH = .5, du = Math.min(d - .03, .36);
          B(w, baseH - .03, d - .02, m, 0, (baseH - .03) / 2, -.01);
          B(w - .02, .08, d - .06, darkM, 0, .04, -.03);
          doors(-w / 2 + .01, w / 2 - .01, .09, baseH - .04, d / 2 - .01);
          B(w + .01, .03, d + .02, top, 0, baseH - .015, .01);
          const hy = h - .13;
          this.shelfBay(g, it, {w, y0: baseH, y1: hy - .13, zb: -d / 2, depth: du, levels: it.rows || auto.shelves, rnd, body: m, panel: this.mat('#FFFFFF', {roughness: .7}), shelf, rail, led, kind: 'big', lip: 'plexi'});
          this.header(g, w, hy, -d / 2 + du - .02, it.label || 'OTC', ACCENTS[Settings.v.accent]?.l || '#1F7A5A', '#FFFFFF');
        } else if (st === 'cosmetic') {
          // Demir kozmetik: boyalı metal gövde, cam raflar, ayna, ışıklı başlık
          const mc = this.steel(c, {metalness: .55, roughness: .38}), baseH = .6, du = Math.min(d - .02, .4);
          B(w, baseH - .02, d - .02, mc, 0, (baseH - .02) / 2, -.01);
          doors(-w / 2 + .015, w / 2 - .015, .08, baseH - .05, d / 2 - .01);
          B(w + .01, .02, d + .02, this.mat('#F3F1EC', {roughness: .2}), 0, baseH - .01, .01);
          const zb = -d / 2, y1 = h - .28;
          B(w - .04, y1 - baseH, .015, this.mat('#F7F6F3', {roughness: .6}), 0, (baseH + y1) / 2, zb + .008);
          const mir = B(Math.min(.5, w * .3), y1 - baseH - .1, .006, this.mirror(), 0, (baseH + y1) / 2, zb + .018); mir.castShadow = false;
          for (const sx of [-1, 1]) for (const sz of [0, 1]) B(.03, h - baseH, .03, mc, sx * (w / 2 - .015), baseH + (h - baseH) / 2, zb + .015 + sz * (du - .03));
          const n = it.rows || auto.shelves, step = (y1 - baseH) / n;
          for (let i = 0; i < n; i++) {
            const y = baseH + i * step;
            if (i) { const gs = this.box(g, w - .06, .012, du - .02, this.glass(), 0, y, zb + du / 2); gs.castShadow = false; B(w - .06, .025, .01, mc, 0, y + .006, zb + du - .005); }
            const l = B(w - .1, .008, .015, led, 0, y + step - .03, zb + .06); l.castShadow = false;
            this.fillShelf(g, rnd, -w / 2 + .05, w / 2 - .05, y + .008, zb + du - .02, du - .08, step - .06, 1, 'cos');
          }
          B(w, .04, du + .02, mc, 0, h - .02, zb + du / 2);
          this.header(g, w - .02, h - .15, zb + du - .03, it.label || 'KOZMETİK', '#1E2226', '#F2E6CF');
        } else if (st === 'metal') {
          // Demir raf: köşe dikmeleri, sac raflar, çapraz, koliler
          const mc = this.steel(c, {metalness: .6, roughness: .42}), sh = this.steel(mixHex(c, '#FFFFFF', .35), {metalness: .55, roughness: .45});
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.035, h, .035, mc, sx * (w / 2 - .0175), h / 2, sz * (d / 2 - .0175));
          const n = it.rows || auto.shelves, step = (h - .1) / (n - 1 || 1);
          for (let i = 0; i < n; i++) {
            const y = .08 + i * step;
            B(w - .02, .015, d - .02, sh, 0, y, 0);
            for (const sz of [-1, 1]) B(w - .04, .03, .012, mc, 0, y - .01, sz * (d / 2 - .006));
            if (i < n - 1) this.fillShelf(g, rnd, -w / 2 + .03, w / 2 - .03, y + .008, d / 2 - .02, d - .04, step - .03, 1, 'carton');
          }
          const L = Math.hypot(w - .06, h - .1), ang = Math.atan2(h - .1, w - .06);
          for (const sgn of [-1, 1]) { const b = B(L, .012, .006, mc, 0, h / 2, -d / 2 + .01); b.rotation.z = sgn * ang; b.castShadow = false; }
        } else if (st === 'kitchen') {
          // Mutfak tezgâhı: alt dolaplar + çekmece kolonu, granit tezgâh, evye, batarya, üst dolaplar
          const bh = Math.min(.86, h - .04), zf = d / 2 - .01;
          B(w, bh - .1, d - .04, m, 0, .1 + (bh - .1) / 2, -.02);
          B(w - .02, .1, d - .1, this.mat('#2F3533'), 0, .05, -.05);
          const rows = it.rows, dw = rows > 0 && w >= .9 ? Math.min(.5, w * .35) : 0;
          if (dw) drawers(w / 2 - .01 - dw, w / 2 - .01, .1, bh - .005, zf, rows, 1);
          doors(-w / 2 + .01, w / 2 - .01 - dw, .1, bh - .005, zf);
          const stone = this.mat(dark ? '#5D6366' : '#40464A', {roughness: .22, metalness: .05});
          B(w + .02, .04, d + .02, stone, 0, bh + .02, .01);
          const sw = Math.min(.55, w * .32), sx = -w / 2 + .12 + sw / 2, zs = .02;
          const inox = this.steel('#C9CED2', {metalness: .9, roughness: .25});
          B(sw, .006, d - .16, inox, sx, bh + .042, zs);
          const hole = B(sw - .06, .004, d - .24, this.mat('#5E666C', {metalness: .8, roughness: .35}), sx, bh + .046, zs); hole.castShadow = false;
          const tap = new T.Group(); tap.position.set(sx, bh + .04, -d / 2 + .08);
          const tp = new T.Mesh(new T.CylinderGeometry(.018, .022, .28, 14), metal); tp.position.y = .14; tap.add(tp);
          const sp = new T.Mesh(new T.CylinderGeometry(.012, .012, .18, 12), metal); sp.rotation.x = Math.PI / 2; sp.position.set(0, .27, .08); tap.add(sp);
          tap.traverse(n => { n.castShadow = true; }); g.add(tap);
          const ket = new T.Mesh(new T.CylinderGeometry(.08, .095, .22, 20), this.steel('#E3E6E8', {metalness: .5, roughness: .3})); ket.position.set(w / 2 - .25, bh + .15, -.05); ket.castShadow = true; g.add(ket);
          const splash = this.mat('#EDF1F2', {roughness: .15});
          const topU = Math.min(wallH - .05, 2.2);
          B(w, Math.min(.55, topU - bh - .05), .012, splash, 0, bh + .04 + Math.min(.55, topU - bh - .05) / 2, -d / 2 + .006);
          if (it.upper && topU - bh > .9) {
            const uy0 = bh + .6, ud = .34, uz = -d / 2 + ud / 2;
            B(w, topU - uy0, ud - .02, m, 0, (uy0 + topU) / 2, uz - .01);
            doors(-w / 2 + .01, w / 2 - .01, uy0 + .01, topU - .01, uz + ud / 2 - .01);
            const l = B(w - .1, .01, .03, led, 0, uy0 - .006, uz + .05); l.castShadow = false;
          }
        } else if (st === 'gondola') {
          B(w, .12, d, darkM, 0, .06, 0);
          B(w - .02, h - .12, .03, panel, 0, .12 + (h - .12) / 2, 0);
          for (const sx of [-1, 1]) B(.025, h - .1, d, m, sx * (w / 2 - .0125), .1 + (h - .1) / 2, 0);
          const levels = shelvesN, step = (h - .12) / levels;
          for (let i = 0; i < levels; i++) {
            const y = .12 + i * step;
            for (const sg of [-1, 1]) {
              if (i > 0) B(w - .05, .02, d / 2 - .03, shelf, 0, y, sg * (d / 4 + .005));
              const r = B(w - .05, .032, .012, rail, 0, y + .006, sg * (d / 2 - .006)); r.castShadow = false;
              this.fillShelf(g, rnd, -w / 2 + .03, w / 2 - .03, y + .011, sg * (d / 2 - .02), d / 2 - .06, step - .05, sg);
            }
          }
          B(w, .03, d, m, 0, h + .015, 0);
          B(w - .1, .16, .03, this.mat(mixHex(c, '#FFFFFF', .35)), 0, h + .11, 0);
        } else if (st === 'glass') {
          B(w, .12, d, m, 0, .06, 0); B(w, .05, d, m, 0, h - .025, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.03, h, .03, m, sx * (w / 2 - .015), h / 2, sz * (d / 2 - .015));
          B(w - .04, h - .17, .012, panel, 0, .12 + (h - .17) / 2, -d / 2 + .02);
          const l = B(w - .08, .012, .02, led, 0, h - .06, 0); l.castShadow = false;
          const n = shelvesN, step = (h - .17) / n;
          for (let i = 0; i < n; i++) {
            const y = .12 + i * step;
            if (i) { const s = this.box(g, w - .05, .01, d - .05, this.glass(), 0, y, 0); s.castShadow = false; }
            this.fillShelf(g, rnd, -w / 2 + .05, w / 2 - .05, y + .006, d / 2 - .06, d - .14, step - .06, 1, 'cos');
          }
          const gl = this.box(g, w - .03, h - .17, d - .03, this.glass(), 0, .12 + (h - .17) / 2, 0); gl.castShadow = false;
        } else if (st === 'fridge') {
          const white = this.mat('#EDEFF1', {roughness: .3});
          B(w, h, .03, white, 0, h / 2, -d / 2 + .015);
          for (const sx of [-1, 1]) B(.03, h, d - .03, white, sx * (w / 2 - .015), h / 2, .015);
          B(w, .14, d - .03, white, 0, .07, .015); B(w, .12, d - .03, white, 0, h - .06, .015);
          const inner = this.mat('#F7F9FB');
          const n = Math.max(2, Math.round((h - .3) / .3)), step = (h - .26) / n;
          for (let i = 0; i < n; i++) {
            const y = .14 + i * step;
            if (i) B(w - .06, .012, d - .1, inner, 0, y, 0);
            this.fillShelf(g, rnd, -w / 2 + .05, w / 2 - .05, y + .006, d / 2 - .08, d - .16, step - .05);
          }
          const gd = this.box(g, w - .02, h - .02, .012, this.mat('#B8D8EA', {transparent: true, opacity: .22, roughness: .05, depthWrite: false}), 0, h / 2, d / 2 - .006); gd.castShadow = false;
          B(.022, Math.min(.6, h * .4), .03, metal, w / 2 - .06, h * .55, d / 2 + .01);
          const l = B(w - .1, .01, .02, led, 0, h - .13, d / 2 - .1); l.castShadow = false;
        } else if (st === 'wstand') {
          // Cam önü stand: cama bakan kademeli teşhir + arkada ışıklı afiş panosu
          const lac = this.mat(c, {roughness: .3}), steps = 3, td = (d - .05) / steps;
          B(w, .06, d, this.mat('#2F3533'), 0, .03, 0);
          for (let i = 0; i < steps; i++) {
            const th = .22 + i * .2, z = d / 2 - td * (i + .5);
            B(w - .02, th, td, lac, 0, .06 + th / 2, z);
            this.fillShelf(g, rnd, -w / 2 + .05, w / 2 - .05, .06 + th, z + td / 2 - .02, td - .04, .3, 1, 'cos');
          }
          const ph = Math.max(.3, h - .06), pz = -d / 2 + .02;
          const pt = this.labelTex(it.label || ' ', ACCENTS[Settings.v.accent]?.l || '#1F7A5A', '#FFFFFF');
          pt.center.set(.5, .5); pt.rotation = 0;
          const pm = new T.MeshStandardMaterial({map: pt, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: .45, roughness: .4}); pm._own = true;
          this.box(g, w, .2, .03, [lac, lac, lac, lac, pm, lac], 0, h - .12, pz + .02);
          B(w, ph - .2, .025, this.mat(mixHex(c, '#FFFFFF', .2), {roughness: .5}), 0, .06 + (ph - .2) / 2, pz);
          const gy = .06 + .22 + 2 * .2 + .32;
          if (h - gy > .35) {
            const gs = this.box(g, w - .06, .012, .22, this.glass(), 0, gy + (h - gy - .25) / 2, pz + .12); gs.castShadow = false;
            this.fillShelf(g, rnd, -w / 2 + .06, w / 2 - .06, gy + (h - gy - .25) / 2 + .006, pz + .22, .18, .22, 1, 'cos');
          }
          const l = B(w - .1, .012, .03, led, 0, h - .23, pz + .05); l.castShadow = false;
        } else { // kapaklı
          B(w, h, d - .02, m, 0, h / 2, -.01);
          const dh0 = h > 1.2 ? .1 : .06;
          doors(-w / 2 + .01, w / 2 - .01, dh0, h - .02, d / 2 - .01);
          B(w - .02, dh0, d - .06, darkM, 0, dh0 / 2, -.03);
          if (h <= 1.2) B(w + .01, .03, d + .02, top, 0, h + .015, .01);
        }
        break;
      }
      case 'fixture': {
        const cer = this.ceramic();
        if (it.style === 'toilet') {
          const tk = Math.min(.18, d * .26);
          B(w * .92, .36, tk, cer, 0, .6, -d / 2 + tk / 2 + .01);
          B(w * .96, .03, tk + .02, cer, 0, .795, -d / 2 + tk / 2 + .01);
          const btn = new T.Mesh(new T.CylinderGeometry(.025, .025, .01, 18), metal); btn.position.set(0, .815, -d / 2 + tk / 2 + .01); g.add(btn);
          const bl = (d - tk) / 2, bz = -d / 2 + tk + bl;
          const ped = new T.Mesh(new T.CylinderGeometry(w * .22, w * .3, .3, 24), cer); ped.scale.z = 1.3; ped.position.set(0, .15, bz - .03); ped.castShadow = true; g.add(ped);
          const bowl = new T.Mesh(new T.SphereGeometry(.5, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('#FBFBF9', {roughness: .08, side: T.DoubleSide}));
          bowl.scale.set(w * .92, -.2, bl * 2 * .98); bowl.position.set(0, .4, bz); bowl.castShadow = true; g.add(bowl);
          const seat = new T.Mesh(new T.TorusGeometry(.5, .06, 10, 36), this.mat('#FFFFFF', {roughness: .25}));
          seat.rotation.x = Math.PI / 2; seat.scale.set(w * .9, bl * 2 * .92, .5); seat.position.set(0, .41, bz); seat.castShadow = true; g.add(seat);
          const water = new T.Mesh(new T.CircleGeometry(.5, 24), this.mat('#CFE3EA', {roughness: .05, metalness: .2}));
          water.rotation.x = -Math.PI / 2; water.scale.set(w * .45, bl * 1.1, 1); water.position.set(0, .32, bz + .02); g.add(water);
        } else {
          const bh = h;
          B(w, .16, d, cer, 0, bh - .08, 0);
          const inner = new T.Mesh(new T.CircleGeometry(.5, 32), this.mat('#E6EAEC', {roughness: .1}));
          inner.rotation.x = -Math.PI / 2; inner.scale.set(w * .75, d * .6, 1); inner.position.set(0, bh + .002, .03); g.add(inner);
          const col = new T.Mesh(new T.CylinderGeometry(.075, .09, bh - .16, 20), cer); col.position.set(0, (bh - .16) / 2, -d * .1); col.castShadow = true; g.add(col);
          const tp = new T.Mesh(new T.CylinderGeometry(.016, .02, .16, 14), metal); tp.position.set(0, bh + .08, -d / 2 + .05); g.add(tp);
          const sp = new T.Mesh(new T.CylinderGeometry(.01, .01, .1, 12), metal); sp.rotation.x = Math.PI / 2; sp.position.set(0, bh + .15, -d / 2 + .1); g.add(sp);
          const mh = Math.min(.7, wallH - bh - .35);
          if (mh > .2) { const mr = B(w * .95, mh, .012, this.mirror(), 0, bh + .3 + mh / 2, -d / 2 + .006); mr.castShadow = false; }
        }
        break;
      }
      case 'counter': {
        const top = this.mat(dark ? '#D8D3CA' : '#F3EFE9', {roughness: .18});
        const led = this.mat('#FFFFFF', {emissive: mixHex(c, '#FFFFFF', .4), emissiveIntensity: 1.6});
        B(w, h - .04, d - .06, m, 0, (h - .04) / 2, -.03);
        B(w + .02, .04, d + .02, top, 0, h - .02, 0);
        B(w - .06, h - .22, .015, this.mat(mixHex(c, '#FFFFFF', .45), {roughness: .35}), 0, .12 + (h - .22) / 2, d / 2 - .06 + .0075);
        const l = B(w - .08, .015, .01, led, 0, .1, d / 2 - .052); l.castShadow = false;
        B(w, .08, d - .14, darkM, 0, .04, -.07);
        if (w >= 1.5) { // eczane logosu
          const em = new T.MeshStandardMaterial({map: this.eTex(), roughness: .4, emissive: 0xffffff, emissiveMap: this.eTex(), emissiveIntensity: .25}); em._own = true;
          const lg = new T.Mesh(new T.PlaneGeometry(.3, .3), em); lg.position.set(0, h * .56, d / 2 - .06 + .016); g.add(lg);
        }
        if (h > .95 && d > .5) B(w - .04, .03, .32, top, 0, .88, -d / 2 + .16);
        const scr = this.mat('#1D2A36', {emissive: '#2E5A86', emissiveIntensity: .7, roughness: .15});
        const blk = this.mat('#23272B', {roughness: .45});
        const nMon = Math.max(1, Math.floor(w / 1.6));
        for (let i = 0; i < nMon; i++) {
          const x = -w / 2 + w * (i + .5) / nMon;
          B(.06, .16, .06, blk, x, h + .08, -d / 2 + .22);
          B(.18, .012, .14, blk, x, h + .006, -d / 2 + .22);
          this.box(g, .52, .32, .03, [blk, blk, blk, blk, blk, scr], x, h + .3, -d / 2 + .2);
          B(.3, .03, .14, blk, x + .38 < w / 2 ? x + .38 : x - .38, h + .015, -d / 2 + .2);
        }
        break;
      }
      case 'table': {
        const tH = .04;
        if (it.style === 'round') {
          const topM = new T.Mesh(new T.CylinderGeometry(w / 2, w / 2, tH, 40), m); topM.position.y = h - tH / 2; topM.scale.z = d / w; topM.castShadow = topM.receiveShadow = true; g.add(topM);
          const leg = new T.Mesh(new T.CylinderGeometry(.035, .035, h - tH, 12), this.steel('#3A3F42')); leg.position.y = (h - tH) / 2; leg.castShadow = true; g.add(leg);
          const base = new T.Mesh(new T.CylinderGeometry(Math.min(.25, w * .3), Math.min(.25, w * .3), .03, 24), this.steel('#3A3F42')); base.position.y = .015; g.add(base);
        } else {
          B(w, tH, d, m, 0, h - tH / 2, 0);
          const lx = w / 2 - .05, lz = d / 2 - .05, lm = this.steel('#3A3F42', {metalness: .6, roughness: .4});
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.04, h - tH, .04, lm, sx * lx, (h - tH) / 2, sz * lz);
          B(w - .1, .06, .02, lm, 0, h - tH - .03, -d / 2 + .05);
        }
        break;
      }
      case 'column': B(w, wallH, d, this.mat(getComputedStyle(document.documentElement).getPropertyValue('--scene-wall').trim()), 0, wallH / 2, 0); break;
      case 'door': {
        const hh = Math.min(h, wallH > 1 ? h : wallH);
        const s = wallOf(it, Ed.segs), outer = s && s.outer;
        const alu = this.steel('#3B4145', {metalness: .7, roughness: .35});
        const leafMat = outer ? null : this.wood(c);
        const leaf = (parent, L, dir) => {
          if (outer) { // alüminyum çerçeveli cam kapı
            const f = .05;
            this.box(parent, L - .01, f, .045, alu, dir * L / 2, hh - f / 2, .02); this.box(parent, L - .01, .1, .045, alu, dir * L / 2, .05, .02);
            this.box(parent, f, hh, .045, alu, dir * (L - .01 - f / 2), hh / 2, .02); this.box(parent, f, hh, .045, alu, dir * f / 2, hh / 2, .02);
            const gl = this.box(parent, L - .1, hh - .15, .012, this.glass(), dir * L / 2, .1 + (hh - .15) / 2, .02); gl.castShadow = false;
            this.box(parent, .025, .6, .025, metal, dir * (L - .12), hh * .5, .08);
          } else {
            this.box(parent, L - .01, hh - .01, .04, leafMat, dir * L / 2, hh / 2, .02);
            this.box(parent, .12, .018, .018, metal, dir * (L - .1), hh * .47, .06);
            this.box(parent, .018, .05, .03, metal, dir * (L - .06), hh * .47, .045);
          }
        };
        if (it.style === 'sliding') { const p = new T.Group(); p.position.set(-w * .3, 0, d / 2 + .03); leaf(p, w * .55, 1); g.add(p); }
        else {
          const leaves = it.style === 'double' ? [[-w / 2, w / 2, 1], [w / 2, w / 2, -1]] : [[it.flip ? w / 2 : -w / 2, w, it.flip ? -1 : 1]];
          const ang = 75 * D2R;
          for (const [hx, L, dir] of leaves) {
            const piv = new T.Group(); piv.position.set(hx, 0, d / 2); piv.rotation.y = dir > 0 ? -ang : ang;
            leaf(piv, L, dir); g.add(piv);
          }
        }
        const fr = outer ? alu : this.mat(dark ? '#CFCAC0' : '#F1EDE6', {roughness: .5});
        B(.05, hh, d + .02, fr, -w / 2 + .025, hh / 2, 0); B(.05, hh, d + .02, fr, w / 2 - .025, hh / 2, 0);
        if (hh < wallH) B(w, .06, d + .02, fr, 0, hh - .03, 0);
        break;
      }
      case 'window': {
        const top = Math.min(it.elev + h, wallH); if (top <= it.elev) break;
        const hh = top - it.elev, fr = this.steel(dark ? '#AEB6B2' : '#3E4548', {metalness: .6, roughness: .4});
        const gl = this.box(g, w, hh, .02, this.glass(), 0, it.elev + hh / 2, 0); gl.castShadow = false;
        B(w, .05, d + .02, fr, 0, it.elev + .025, 0); B(w, .05, d + .02, fr, 0, top - .025, 0);
        B(.05, hh, d + .02, fr, -w / 2 + .025, it.elev + hh / 2, 0); B(.05, hh, d + .02, fr, w / 2 - .025, it.elev + hh / 2, 0);
        if (w > 1.2) B(.04, hh, .06, fr, 0, it.elev + hh / 2, 0);
        if (it.elev > .05) B(w + .04, .03, d + .08, this.mat('#E9E6E0', {roughness: .3}), 0, it.elev - .015, 0);
        break;
      }
      case 'human': this.person(g, it); break;
      case 'zone': {
        const bad = Ed.A.zoneBad.has(it.id + ':z');
        const geo = it.style === 'circle' ? new T.CircleGeometry(.5, 48) : new T.PlaneGeometry(1, 1);
        const zm = new T.Mesh(geo, this.mat(bad ? '#E5484D' : '#3FA66B', {transparent: true, opacity: bad ? .34 : .24, depthWrite: false}));
        zm.rotation.x = -Math.PI / 2; zm.scale.set(it.style === 'circle' ? w : w, it.style === 'circle' ? d : d, 1); zm.position.y = .005;
        g.add(zm);
        break;
      }
    }
    return g;
  },
  person(g, it) {
    const T = this.T, h = it.h, col = it.color;
    const body = this.mat(col, {roughness: .7}), legs = this.mat(mixHex(col, '#1B2330', .6)), skin = this.mat('#E6C3A5', {roughness: .6});
    const cap = (r, L, m, x, y, z, sx = 1, sz = 1) => { const c = new T.Mesh(new T.CapsuleGeometry(r, Math.max(.01, L), 6, 14), m); c.position.set(x, y, z); c.scale.set(sx, 1, sz); c.castShadow = true; g.add(c); return c; };
    if (it.style === 'wheelchair') {
      const frame = this.mat('#39424A', {metalness: .4, roughness: .4});
      this.box(g, .46, .05, .46, this.mat('#2F3740'), 0, .5, 0);
      this.box(g, .46, .45, .04, this.mat('#2F3740'), 0, .75, -.23);
      for (const sx of [-1, 1]) {
        const wh = new T.Mesh(new T.TorusGeometry(.29, .022, 8, 30), frame); wh.rotation.y = Math.PI / 2; wh.position.set(sx * .3, .3, -.05); wh.castShadow = true; g.add(wh);
        const cw = new T.Mesh(new T.TorusGeometry(.07, .015, 6, 16), frame); cw.rotation.y = Math.PI / 2; cw.position.set(sx * .2, .07, it.d / 2 - .12); g.add(cw);
      }
      this.box(g, .36, .03, .16, frame, 0, .12, it.d / 2 - .1);
      cap(.15, .32, body, 0, .82, -.06, 1.15, .8);
      cap(.06, .34, legs, -.09, .55, .16).rotation.x = Math.PI / 2;
      cap(.06, .34, legs, .09, .55, .16).rotation.x = Math.PI / 2;
      const hd = new T.Mesh(new T.SphereGeometry(.1, 18, 14), skin); hd.position.set(0, 1.18, -.04); hd.castShadow = true; g.add(hd);
      return;
    }
    const legH = h * .47, torso = h - .25 - legH;
    for (const sx of [-1, 1]) cap(.065, legH - .13, legs, sx * .085, legH / 2, 0);
    cap(.16, Math.max(.05, torso - .2), body, 0, legH + torso / 2, 0, 1.3, .75);
    for (const sx of [-1, 1]) cap(.045, torso * .75, body, sx * .26, legH + torso * .45, 0);
    const hd = new T.Mesh(new T.SphereGeometry(.105, 20, 16), skin); hd.position.set(0, h - .12, 0); hd.castShadow = true; g.add(hd);
    const nose = new T.Mesh(new T.SphereGeometry(.02, 8, 6), skin); nose.position.set(0, h - .12, .1); g.add(nose);
  },
  updateSel() {
    const T = this.T; if (!T) return;
    if (this.selHelper) { this.scene.remove(this.selHelper); this.selHelper.geometry.dispose(); this.selHelper = null; }
    if (Ed.multi.length) {
      const box = new T.Box3(), ids = new Set(Ed.multi);
      for (const c of this.kids()) if (c.userData.pick && ids.has(c.userData.pick.id)) box.expandByObject(c);
      if (!box.isEmpty()) { box.expandByScalar(.03); this.selHelper = new T.Box3Helper(box, new T.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())); this.scene.add(this.selHelper); }
      this.req(); return;
    }
    const sel = Ed.sel; if (!sel) { this.req(); return; }
    let obj = null;
    this.root.traverse(n => { if (!obj && n.userData.pick && n.userData.pick.id === sel.id && (sel.k === 'item' || n.userData.floor)) obj = n; });
    if (obj) {
      const box = new T.Box3().setFromObject(obj);
      if (sel.k === 'room') box.max.y = .05;
      box.expandByScalar(.02);
      this.selHelper = new T.Box3Helper(box, new T.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()));
      this.scene.add(this.selHelper);
    }
    this.req();
  },

  /* ---------- Kamera ---------- */
  resetCam() {
    const P = Ed.P; if (!P) return;
    const W = P.shop.w, D = P.shop.d, O = this.lvOrigin();
    if (this.builtMode === 'explode' && this.lvY && P.levels.length > 1) { // tüm katları kadraja al
      const L = P.levels; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const l of L) { x0 = Math.min(x0, l.ox); z0 = Math.min(z0, l.oy); x1 = Math.max(x1, l.ox + l.shop.w); z1 = Math.max(z1, l.oy + l.shop.d); }
      const y0 = Math.min(...this.lvY), y1 = Math.max(...this.lvY.map((y, i) => y + L[i].shop.h));
      this.orb = {tx: (x0 + x1) / 2, ty: (y0 + y1) / 2 - .5, tz: (z0 + z1) / 2, theta: Math.PI / 2 + .55, phi: 1.0, dist: Math.max(x1 - x0, z1 - z0) * 1.05 + (y1 - y0) * 1.15 + 2};
      this._lastTy0 = O.y; this.req(); return;
    }
    this.orb = {tx: O.x + W / 2, ty: O.y, tz: O.z + D / 2, theta: Math.PI / 2 + .55, phi: .92, dist: Math.max(W, D) * 1.15 + 2};
    this._lastTy0 = O.y;
    this.req();
  },
  preset(k) {
    const P = Ed.P; if (!P) return; if (!this.orb) this.resetCam();
    const W = P.shop.w, D = P.shop.d, o = this.orb, O = this.lvOrigin();
    o.tx = O.x + W / 2; o.tz = O.z + D / 2; o.ty = O.y;
    const aspect = this.w / Math.max(1, this.h);
    if (k === 'top') { o.phi = 0.001; o.theta = Math.PI / 2; o.dist = Math.max(D * 1.35, W * 1.35 / aspect) / (2 * Math.tan(22.5 * D2R)) * .9; }
    else { o.phi = .92; o.theta = Math.PI / 2 + .55; o.dist = Math.max(W, D) * 1.15 + 2; }
    this.req();
  },
  applyCam() {
    const c = this.cam;
    if (this.mode === 'walk') {
      const k = this.wk, bob = Math.sin(k.bob) * .016, y = (k.fy || 0) + EYE + bob;
      if (c.fov !== 70) { c.fov = 70; c.updateProjectionMatrix(); }
      c.position.set(k.x, y, k.z);
      const cp = Math.cos(k.pitch);
      c.lookAt(k.x + Math.sin(k.yaw) * cp, y + Math.sin(k.pitch), k.z - Math.cos(k.yaw) * cp);
    } else {
      const o = this.orb; if (!o) return;
      if (c.fov !== 45) { c.fov = 45; c.updateProjectionMatrix(); }
      const sp = Math.sin(o.phi);
      c.position.set(o.tx + o.dist * sp * Math.cos(o.theta), o.ty + o.dist * Math.cos(o.phi), o.tz + o.dist * sp * Math.sin(o.theta));
      c.up.set(0, 1, 0);
      if (o.phi < 0.01) c.up.set(-Math.cos(o.theta), 0, -Math.sin(o.theta));
      c.lookAt(o.tx, o.ty, o.tz);
    }
  },
  setMode(m) {
    const prev = this.mode;
    this.mode = m;
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
    $$('.orbit-only').forEach(b => b.hidden = m !== 'orbit');
    const st = $('#stage'); st.classList.add('is3d'); st.classList.toggle('walking', m === 'walk');
    const touch = matchMedia('(pointer: coarse)').matches;
    $('#joy').hidden = !(m === 'walk' && touch);
    $('#minimap').hidden = m !== 'walk';
    $('#walkNav').hidden = m !== 'walk';
    $('#camLevels').hidden = m === 'walk' || !(Ed.P && multiLevel(Ed.P));
    if (m !== 'walk') $('#liftPanel').hidden = true;
    // Gezintide tüm katlar birlikte kurulur; yörüngede seçili görünüm
    if (this.ready && Ed.P && multiLevel(Ed.P) && prev !== m && ((m === 'walk') !== (this.builtMode === 'all'))) this.build();
    if (m === 'walk') { if (!this.wkInit) this.enterWalk(); this.navUI(); this.startLoop(); }
    else { if (document.pointerLockElement) document.exitPointerLock(); this.keys.clear(); }
    if (this.ready) { this.lightMode(); this.updateSel(); }
    this.hint();
    Ctx.place(); this.req();
  },
  hint() {
    const el = $('#walkHint');
    if (Ed.view !== '3d') { el.hidden = true; return; }
    const touch = matchMedia('(pointer: coarse)').matches;
    let t;
    if (this.mode === 'walk') t = touch ? 'Çubukla yürü · sürükle: etrafına bak · zemine dokun: oraya git · haritaya dokun: ışınlan'
      : this.locked ? 'W A S D yürü · fareyle bak · Esc fareyi bırak' : 'Sürükle: etrafına bak · zemine tıkla: oraya yürü · W A S D / oklar · Q E dön · Shift koş';
    else t = touch ? 'Tek parmak: döndür · iki parmak: yakınlaştır / kaydır · dokun: seç' : 'Sürükle: döndür · sağ tuş/Shift: kaydır · tekerlek: yakınlaştır · tıkla: seç';
    el.textContent = t; el.hidden = false;
  },
  /* Gezinti düğmeleri: kat adları, görünürlük */
  navUI() {
    const P = Ed.P; if (!P) return;
    const up = P.levels[P.cur + 1], dn = P.levels[P.cur - 1];
    const bu = $('#walkNav [data-nav=up]'), bd = $('#walkNav [data-nav=down]');
    bu.hidden = !up; bd.hidden = !dn;
    if (up) { bu.querySelector('.lbl').textContent = levelName(P, P.cur + 1); bu.title = levelName(P, P.cur + 1) + '’a çık'; }
    if (dn) { bd.querySelector('.lbl').textContent = levelName(P, P.cur - 1); bd.title = levelName(P, P.cur - 1) + '’a in'; }
    $('#walkNav [data-nav=home]').hidden = P.levels[P.cur].kind !== 'ground' && false;
  },
  nav(a) {
    const k = this.wk, P = Ed.P;
    if (a === 'left' || a === 'right') { k.yawTo = (k.yawTo ?? k.yaw) + (a === 'left' ? -1 : 1) * Math.PI / 4; }
    else if (a === 'level') { k.pitchTo = 0; }
    else if (a === 'home') { if (P.cur !== groundIdx(P)) Ed.setLevel(groundIdx(P), {walk: true, quiet: true}); this.enterWalk(); this.navUI(); }
    else if (a === 'up' || a === 'down') this.goLevel(P.cur + (a === 'up' ? 1 : -1));
    this.startLoop(); this.req();
  },
  /* Başka kata geç: varsa merdiven çıkışına/girişine, yoksa asansör önüne ya da katın ortasına */
  goLevel(i, near) {
    const P = Ed.P; if (!P.levels[i]) return;
    const from = P.cur, k = this.wk;
    Ed.setLevel(i, {walk: true, quiet: true});
    const O = this.lvOrigin(i);
    let spot = null;
    if (near) spot = near;
    if (!spot) { // merdiven: yukarı çıkınca çıkışın önü, aşağı inince girişin önü
      const lo = Math.min(from, i), st = P.levels[lo].items.find(it => it.type === 'stair');
      if (st && Math.abs(from - i) === 1) {
        const G = stairGeom(st, stairRise(P, lo).n), L = P.levels[lo], up = i > from;
        const e = up ? G.exit : G.entry, [x, y] = toWorld(st, e.x, e.y), [dx, dy] = rotPt(e.dx, e.dy, st.rot || 0);
        const sgn = up ? 1 : -1;
        spot = {x: L.ox + x + dx * .6 * sgn, z: L.oy + y + dy * .6 * sgn, yaw: Math.atan2(dx * sgn, -dy * sgn)};
      }
    }
    if (!spot) { const lift = [...P.items, ...levelDerived(P, i).ghosts].find(it => it.type === 'lift'); if (lift) { const [x, y] = toWorld(lift, 0, lift.d / 2 + .8), [fx, fy] = rotPt(0, 1, lift.rot || 0); spot = {x: O.x + x, z: O.z + y, yaw: Math.atan2(fx, -fy)}; } }
    if (!spot) spot = {x: O.x + P.shop.w / 2, z: O.z + P.shop.d / 2, yaw: k.yaw};
    k.x = spot.x; k.z = spot.z; k.yaw = spot.yaw; k.yawTo = null; k.fy = levelElev(P, i); k.stair = null; k.target = null; k.path = null;
    this.resolve(); this.navUI(); this.miniDirty = true;
    toast(levelName(P, i));
    this.req();
  },
  /* Kat değişince yürüyeni o katın döşemesine al */
  placeOnLevel() { const k = this.wk; if (!k.stair) k.fy = levelElev(Ed.P, Ed.P.cur); this.navUI(); },
  /* Girişten (dış duvardaki kapının önünden) başla; zemin dışındaki katta merdiven çıkışından */
  enterWalk() {
    const P = Ed.P, k = this.wk;
    k.target = null; k.path = null; k.vx = 0; k.vz = 0; k.stair = null; k.yawTo = null; k.pitchTo = null; this.wkInit = true;
    if (P.levels[P.cur].kind !== 'ground') {
      k.fy = levelElev(P, P.cur);
      const hl = levelDerived(P, P.cur).holes[0], O = this.lvOrigin();
      if (hl) { const G = stairGeom(hl.it, stairRise(P, hl.lv).n), [x, y] = toWorld(hl.it, G.exit.x, G.exit.y), [dx, dy] = rotPt(G.exit.dx, G.exit.dy, hl.it.rot || 0); k.x = O.x + x + dx * .7; k.z = O.z + y + dy * .7; const cx = O.x + P.shop.w / 2 - k.x, cz = O.z + P.shop.d / 2 - k.z; k.yaw = Math.atan2(cx, -cz); } // katın ortasına bak
      else { k.x = O.x + P.shop.w / 2; k.z = O.z + P.shop.d / 2; k.yaw = 0; }
      k.pitch = -.05; this.resolve(); return;
    }
    const W = P.shop.w, D = P.shop.d;
    k.fy = 0;
    const outerDoors = P.items.filter(it => it.type === 'door' && (() => { const s = wallOf(it, Ed.segs); return s && s.outer; })());
    outerDoors.sort((a, b) => (b.style === 'double') - (a.style === 'double') || b.w - a.w);
    if (outerDoors.length) {
      const dr = outerDoors[0], s = wallOf(dr, Ed.segs);
      let ix = 0, iz = 0;
      if (s.h) iz = -s.n; else ix = -s.n;
      // Kaldırımda, tabelanın tamamı görünecek uzaklıkta başla
      const si = this.signInfo, aspect = this.w / Math.max(1, this.h);
      const htan = Math.tan(35 * D2R) * aspect;
      const need = si ? (si.sl / 2 + .5) / htan : 3;
      const dist = clamp(need, 3.2, 6.5);
      k.x = dr.cx - ix * dist; k.z = dr.cy - iz * dist;
      if (si) { if (si.s.h) k.x = clamp(si.along, k.x - 1.5, k.x + 1.5); else k.z = clamp(si.along, k.z - 1.5, k.z + 1.5); }
      k.yaw = Math.atan2(ix, -iz); k.pitch = si ? Math.atan2(si.y - EYE, dist) * .6 : 0.08;
    } else {
      k.x = W / 2; k.z = D - .8; k.yaw = 0; k.pitch = -.05;
    }
    this.resolve();
  },
  look(dx, dy) {
    const k = this.wk;
    k.yaw += dx; k.pitch = clamp(k.pitch - dy, -1.25, 1.25); k.yawTo = null; k.pitchTo = null;
    this.req();
  },
  /* Tıklanan noktaya yürü: engellerin etrafından dolaşan yol (A*) */
  walkTo(x, z) {
    const k = this.wk; if (k.stair) return;
    const path = this.findPath(k.x, k.z, x, z);
    if (!path || !path.length) { toast('Oraya yol bulunamadı'); return; }
    k.path = path; k.target = k.path.shift();
    this.startLoop();
  },
  startLoop() {
    if (this.loopOn || Ed.view !== '3d' || this.mode !== 'walk') { if (this.mode !== 'walk') this.req(); return; }
    this.loopOn = true; let last = performance.now();
    const step = now => {
      if (!this.loopOn) return;
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const moving = this.tick(dt);
      this.render();
      if (moving || this.keys.size || this.joy.id != null) requestAnimationFrame(step);
      else { this.loopOn = false; this.liftCheck(); }
    };
    requestAnimationFrame(step);
  },
  stopLoop() { this.loopOn = false; },
  tick(dt) {
    const k = this.wk, K = this.keys;
    let f = 0, s = 0, turn = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
    if (K.has('KeyD')) s += 1;
    if (K.has('KeyA')) s -= 1;
    if (K.has('ArrowRight') || K.has('KeyE')) turn += 1;
    if (K.has('ArrowLeft') || K.has('KeyQ')) turn -= 1;
    if (this.joy.id != null) { f += -this.joy.y; s += this.joy.x; }
    const run = K.has('ShiftLeft') || K.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > .95;
    const speed = run ? 3.0 : 1.5;
    if (turn) { k.yaw += turn * 1.9 * dt; k.yawTo = null; }
    let anim = false;
    if (k.yawTo != null) { const da = k.yawTo - k.yaw; if (Math.abs(da) < .01) { k.yaw = k.yawTo; k.yawTo = null; } else { k.yaw += da * Math.min(1, dt * 8); anim = true; } }
    if (k.pitchTo != null) { const dp = k.pitchTo - k.pitch; if (Math.abs(dp) < .005) { k.pitch = k.pitchTo; k.pitchTo = null; } else { k.pitch += dp * Math.min(1, dt * 8); anim = true; } }
    let vx = 0, vz = 0;
    const L = Math.hypot(f, s);
    if (L > .05) {
      const n = Math.min(1, L) / L; f *= n; s *= n;
      const fx = Math.sin(k.yaw), fz = -Math.cos(k.yaw);
      vx = (fx * f + -fz * s) * speed; vz = (fz * f + fx * s) * speed;
      k.target = null; k.path = null;
    } else if (k.target) {
      const dx = k.target[0] - k.x, dz = k.target[1] - k.z, dd = Math.hypot(dx, dz);
      if (dd < (k.path && k.path.length ? .25 : .08)) { k.target = k.path && k.path.length ? k.path.shift() : null; }
      else { const sp = Math.min(2.2, dd * 3 + (k.path && k.path.length ? 1.2 : 0)); vx = dx / dd * sp; vz = dz / dd * sp;
        const want = Math.atan2(dx, -dz); let da = ((want - k.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; k.yaw += da * Math.min(1, dt * 4); }
    }
    // yumuşak hızlanma / durma
    const a = Math.min(1, dt * (Math.hypot(vx, vz) > .01 ? 9 : 12));
    k.vx = (k.vx || 0) + (vx - (k.vx || 0)) * a; k.vz = (k.vz || 0) + (vz - (k.vz || 0)) * a;
    if (Math.hypot(k.vx, k.vz) < .02) { k.vx = 0; k.vz = 0; }
    vx = k.vx; vz = k.vz;
    const moving = Math.hypot(vx, vz) > .01;
    if (moving) {
      const px = k.x, pz = k.z;
      if (k.stair) this.stairMove(vx * dt, vz * dt);
      else { k.x += vx * dt; k.z += vz * dt; this.resolve(); this.stairCheck(px, pz, vx, vz); }
      const moved = Math.hypot(k.x - px, k.z - pz);
      if (!k.stair && moved < Math.hypot(vx, vz) * dt * .3) { k.vx *= .5; k.vz *= .5; }
      k.bob += moved * 7.5;
      if (k.target && moved < Math.hypot(vx, vz) * dt * .2) { k.target = null; k.path = null; } // takıldı
      if (!k.stair) { const fy = levelElev(Ed.P, Ed.P.cur); k.fy = (k.fy ?? fy) + (fy - (k.fy ?? fy)) * Math.min(1, dt * 10); }
    } else if (Math.sin(k.bob) !== 0) { k.bob = Math.abs(Math.sin(k.bob)) < .05 ? 0 : k.bob + dt * 6; }
    if (moving && this._liftT === undefined) this._liftT = 0;
    if ((this._liftT = (this._liftT || 0) + dt) > .25) { this._liftT = 0; this.liftCheck(); }
    return moving || !!turn || anim || !!k.target || Math.abs(Math.sin(k.bob)) > .01;
  },
  /* ---------- Merdivenler: alttan girişte yukarı, üstteki boşluktan inişte aşağı ---------- */
  stairList() {
    const P = Ed.P, i = P.cur, out = [];
    const add = (lv, it, fromTop) => { const L = P.levels[lv], R = stairRise(P, lv), G = stairGeom(it, R.n); out.push({lv, it: shiftItem(it, L.ox, L.oy), G, len: pathLen(G.path), ff: R.ff, e0: levelElev(P, lv), fromTop, top: R.top}); };
    for (const it of P.items) if (it.type === 'stair') add(i, it, false);
    if (P.levels[i - 1]) for (const it of P.levels[i - 1].items) if (it.type === 'stair') add(i - 1, it, true);
    return out;
  },
  inStair(S, x, z) {
    const [lx, ly] = toLocal(S.it, x, z);
    return S.it.style === 'spiral' ? Math.hypot(lx, ly) < S.it.w / 2 + .05 : Math.abs(lx) < S.it.w / 2 + .05 && Math.abs(ly) < S.it.d / 2 + .05;
  },
  stairCheck(px, pz, vx, vz) {
    const k = this.wk;
    for (const S of this.stairs || []) {
      if (!this.inStair(S, k.x, k.z)) continue;
      const [lx, ly] = toLocal(S.it, k.x, k.z), pr = pathProject(S.G.path, lx, ly);
      const [lvx, lvy] = rotPt(vx, vz, -(S.it.rot || 0));
      if (!S.fromTop && S.top && pr.s < .55 && (lvx * S.G.entry.dx + lvy * S.G.entry.dy) > 0) { k.stair = {S, s: Math.max(.02, pr.s), lat: clamp(pr.lat, -S.G.width / 2 + .22, S.G.width / 2 - .22)}; k.target = null; k.path = null; return; }
      if (S.fromTop && pr.s > S.len - .55) {
        const ex = pathAt(S.G.path, S.len);
        if ((lvx * -ex.dx + lvy * -ex.dy) > 0) { Ed.setLevel(S.lv, {walk: true, quiet: true}); k.stair = {S: Object.assign({}, S, {fromTop: false}), s: Math.min(S.len - .02, pr.s), lat: clamp(pr.lat, -S.G.width / 2 + .22, S.G.width / 2 - .22)}; k.target = null; k.path = null; return; }
      }
      k.x = px; k.z = pz; k.vx *= .3; k.vz *= .3; return; // yandan girilmez (korkuluk / boşluk)
    }
  },
  stairMove(dx, dz) {
    const k = this.wk, st = k.stair, S = st.S;
    const [lx, ly] = rotPt(dx, dz, -(S.it.rot || 0)), p = pathAt(S.G.path, st.s);
    st.s += lx * p.dx + ly * p.dy;
    st.lat = clamp(st.lat + (lx * p.dy - ly * p.dx), -S.G.width / 2 + .22, S.G.width / 2 - .22);
    const P = Ed.P;
    if (st.s <= 0) { // alta indi
      const e = S.G.entry, [x, y] = toWorld(S.it, e.x - e.dx * .25, e.y - e.dy * .25);
      k.x = x; k.z = y; k.fy = S.e0; k.stair = null; this.resolve(); this.navUI(); return;
    }
    if (st.s >= S.len) { // üst kata çıktı
      const e = S.G.exit, [x, y] = toWorld(S.it, e.x + e.dx * .4, e.y + e.dy * .4);
      k.stair = null; Ed.setLevel(S.lv + 1, {walk: true, quiet: true});
      k.x = x; k.z = y; k.fy = levelElev(P, S.lv + 1); this.resolve(); this.navUI(); toast(levelName(P, S.lv + 1)); return;
    }
    const q = pathAt(S.G.path, st.s), [x, y] = toWorld(S.it, q.x + q.dy * st.lat, q.y - q.dx * st.lat);
    k.x = x; k.z = y; k.fy = S.e0 + q.t * S.ff;
  },
  /* ---------- Asansör: kapısının önüne gelince kat seçimi ---------- */
  liftCheck() {
    const el = $('#liftPanel'); if (!el) return;
    const P = Ed.P, k = this.wk;
    if (this.mode !== 'walk' || k.stair || !P || !multiLevel(P)) { el.hidden = true; return; }
    const O = this.lvOrigin(), lifts = [...P.items, ...levelDerived(P, P.cur).ghosts].filter(it => it.type === 'lift');
    let hit = null;
    for (const it of lifts) { const [x, y] = toWorld(it, 0, it.d / 2 + .6); if (Math.hypot(O.x + x - k.x, O.z + y - k.z) < .9) { hit = it; break; } }
    if (!hit) { el.hidden = true; this._liftId = null; return; }
    if (this._liftId === hit.id + P.cur && !el.hidden) return;
    this._liftId = hit.id + P.cur;
    el.innerHTML = ''; el.append(h('h4', null, 'Asansör · kat seç'));
    for (let j = P.levels.length - 1; j >= 0; j--) el.append(h('button', {type: 'button', class: j === P.cur ? 'on' : '', onclick: () => {
      if (j === P.cur) { el.hidden = true; return; }
      const [dx, dy] = lvShift(P, P.cur, j), L = P.levels[j], src = hit.ghost ? hit : hit;
      const [x, y] = toWorld(src, 0, src.d / 2 + .8), [fx, fy] = rotPt(0, 1, src.rot || 0);
      el.hidden = true; this._liftId = null;
      this.goLevel(j, {x: L.ox + x + dx, z: L.oy + y + dy, yaw: Math.atan2(fx, -fy)});
    }}, levelName(P, j)));
    el.hidden = false;
  },
  /* Çarpışma: oyuncu R yarıçaplı daire; duvarlar ve katı eşyalar dışbükey çokgen (dünya koordinatı) */
  buildColliders() {
    const P = Ed.P, list = [], O = P.levels[P.cur], ox = O.ox, oy = O.oy, sh = poly => poly.map(([x, y]) => [x + ox, y + oy]);
    for (const r of wallPieces(Ed.segs, o => o.type === 'door')) list.push(sh(rectPoly(r)));
    const der = levelDerived(P, P.cur);
    for (const it of [...P.items, ...der.ghosts]) {
      if (it.type === 'stair' || (!isSolid(it) && it.type !== 'human')) continue; // merdiven ayrıca ele alınır
      list.push(sh(itemPoly(it)));
    }
    // kapalı pencereler: pencere boşlukları duvar sayılır
    for (const s of Ed.segs) for (const o of s.open) if (o.type === 'window') list.push(sh(rectPoly(segRect(s, o.a, o.b))));
    this.colliders = list;
    this.stairs = this.stairList();
    const W = P.shop.w, D = P.shop.d, gnd = O.kind === 'ground';
    this.bounds = gnd ? [-6.8, -6.8, W + 6.8, D + 6.8] : [ox - .1, oy - .1, ox + W + .1, oy + D + .1];
    if (gnd) { this.bounds[2] += ox; this.bounds[3] += oy; }
    this.navG = null; // yol ızgarası tembel kurulur
  },
  resolve() {
    const k = this.wk, R = .24;
    for (let it = 0; it < 4; it++) {
      let pushed = false;
      for (const poly of this.colliders) {
        const r = pushOut(poly, k.x, k.z, R);
        if (r) { k.x += r[0]; k.z += r[1]; pushed = true; }
      }
      if (!pushed) break;
    }
    const b = this.bounds; if (b) { k.x = clamp(k.x, b[0], b[2]); k.z = clamp(k.z, b[1], b[3]); }
  },
  /* Yol ızgarası (20 cm) + A* + düzleştirme */
  navGrid() {
    if (this.navG) return this.navG;
    const b = this.bounds, c = .2, R = .27, nx = Math.max(1, Math.ceil((b[2] - b[0]) / c)), ny = Math.max(1, Math.ceil((b[3] - b[1]) / c));
    const block = new Uint8Array(nx * ny);
    const mark = (poly, inflate) => {
      const bb = polyBox(poly), i0 = clamp(Math.floor((bb.x0 - inflate - b[0]) / c), 0, nx - 1), i1 = clamp(Math.ceil((bb.x1 + inflate - b[0]) / c), 0, nx - 1);
      const j0 = clamp(Math.floor((bb.y0 - inflate - b[1]) / c), 0, ny - 1), j1 = clamp(Math.ceil((bb.y1 + inflate - b[1]) / c), 0, ny - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = b[0] + (i + .5) * c, y = b[1] + (j + .5) * c; if (pushOut(poly, x, y, inflate)) block[j * nx + i] = 1; }
    };
    for (const p of this.colliders) mark(p, R);
    for (const S of this.stairs || []) mark(itemPoly(S.it), .2);
    // zemin dışındaki katlarda dükkân dışı (boşluklar) yürünemez
    const P = Ed.P, O = P.levels[P.cur];
    if (O.kind !== 'ground') for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = b[0] + (i + .5) * c - O.ox, y = b[1] + (j + .5) * c - O.oy; if (!inShop(P, x, y)) block[j * nx + i] = 1; }
    return (this.navG = {b, c, nx, ny, block});
  },
  findPath(sx, sz, tx, tz) {
    const N = this.navGrid(), {b, c, nx, ny, block} = N;
    const cell = (x, z) => [clamp(Math.floor((x - b[0]) / c), 0, nx - 1), clamp(Math.floor((z - b[1]) / c), 0, ny - 1)];
    const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !block[j * nx + i];
    const near = (i, j) => { if (free(i, j)) return [i, j]; for (let r = 1; r < 25; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj]; return null; };
    const s0 = near(...cell(sx, sz)), g0 = near(...cell(tx, tz)); if (!s0 || !g0) return null;
    const key = (i, j) => j * nx + i, G = new Float32Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1), open = [[0, s0[0], s0[1]]];
    G[key(...s0)] = 0;
    const hfn = (i, j) => Math.hypot(i - g0[0], j - g0[1]);
    const closed = new Uint8Array(nx * ny);
    let found = false, guard = 0;
    while (open.length && guard++ < 60000) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const kk = key(i, j); if (closed[kk]) continue; closed[kk] = 1;
      if (i === g0[0] && j === g0[1]) { found = true; break; }
      for (const [di, dj, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
        const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const nk = key(ni, nj), ng = G[kk] + w; if (ng < G[nk]) { G[nk] = ng; from[nk] = kk; open.push([ng + hfn(ni, nj), ni, nj]); }
      }
    }
    if (!found) return null;
    const pts = []; let kk = key(...g0);
    while (kk >= 0) { pts.push([b[0] + (kk % nx + .5) * c, b[1] + (Math.floor(kk / nx) + .5) * c]); kk = from[kk]; }
    pts.reverse();
    const los = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(L / (c * .5)); for (let t = 1; t < n; t++) { const [i, j] = cell(p[0] + (q[0] - p[0]) * t / n, p[1] + (q[1] - p[1]) * t / n); if (block[j * nx + i]) return false; } return true; };
    const out = []; let a0 = [sx, sz];
    for (let q = 1; q < pts.length; q++) if (!los(a0, pts[q])) { out.push(pts[q - 1]); a0 = pts[q - 1]; }
    out.push(free(...cell(tx, tz)) ? [tx, tz] : pts[pts.length - 1]);
    return out;
  },

  /* ---------- Mini harita ---------- */
  drawMini() {
    const cv = $('#minimap'); if (cv.hidden || !Ed.P) return;
    const P = Ed.P, dpr = Math.min(window.devicePixelRatio || 1, 2), O = P.levels[P.cur];
    const cssW = cv.getBoundingClientRect().width || 180;
    const W = P.shop.w + 1.2, D = P.shop.d + 1.2;
    const cw = cssW, ch = Math.round(cssW * D / W);
    if (this.miniDirty || !this.mini || this.mini.cw !== cw) {
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      const s = cw / W, V = {s, ox: .6 * s, oy: .6 * s};
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const C = planColors();
      drawPlan(off.getContext('2d'), P, V, {w: cw, h: ch, dpr, C: Object.assign({}, C, {bg: C.floor, glass: false}), segs: Ed.segs, A: Ed.A, grid: false, clear: false, labels: false, dims: false});
      if (multiLevel(P)) { const g2 = off.getContext('2d'); g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.font = `800 11px ${getFont()}`; g2.fillStyle = C.ink; g2.textAlign = 'left'; g2.textBaseline = 'top'; g2.fillText(levelName(P, P.cur), 6, 4); }
      this.mini = {cw, ch, V, off}; this.miniDirty = false;
    }
    const m = this.mini, g = cv.getContext('2d'), k = this.wk;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(m.off, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = (k.x - O.ox) * m.V.s + m.V.ox, y = (k.z - O.oy) * m.V.s + m.V.oy;
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    g.beginPath(); g.moveTo(x, y);
    const R = 26, a0 = k.yaw - Math.PI / 2 - .6, a1 = k.yaw - Math.PI / 2 + .6;
    g.arc(x, y, R, a0, a1); g.closePath(); g.fillStyle = rgba(acc.startsWith('#') ? acc : '#1F7A5A', .25); g.fill();
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = acc; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    const tg = k.path && k.path.length ? k.path[k.path.length - 1] : k.target;
    if (tg) { g.beginPath(); g.arc((tg[0] - O.ox) * m.V.s + m.V.ox, (tg[1] - O.oy) * m.V.s + m.V.oy, 4, 0, Math.PI * 2); g.strokeStyle = acc; g.lineWidth = 2; g.stroke(); }
  },

  /* ---------- İşaretçi ---------- */
  pDown(e) {
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    try { this.cv.setPointerCapture(e.pointerId); } catch (_) {}
    this.ptrs.set(e.pointerId, {x, y});
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.drag = {type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: [(a.x + b.x) / 2, (a.y + b.y) / 2], dist0: this.orb ? this.orb.dist : 1};
      return;
    }
    if (this.locked) { this.drag = null; return; }
    const pan = e.button === 2 || e.button === 1 || e.shiftKey;
    this.drag = {type: pan ? 'pan' : 'rot', x, y, lx: x, ly: y, moved: false, touch: e.pointerType !== 'mouse', mouse: e.pointerType === 'mouse', btn: e.button};
  },
  pMove(e) {
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, {x, y});
    const d = this.drag; if (!d) return;
    if (d.type === 'pinch') {
      if (this.ptrs.size < 2) return;
      const [a, b] = [...this.ptrs.values()];
      const dd = Math.hypot(a.x - b.x, a.y - b.y), m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (this.mode === 'orbit') {
        this.orb.dist = clamp(d.dist0 * d.d0 / dd, 1.2, 160);
        this.panBy(m[0] - d.m[0], m[1] - d.m[1]); d.m = m;
      } else { // gezinti: iki parmakla ileri/geri
        const k = this.wk, step = (dd - (d.last || d.d0)) * 0.01; d.last = dd;
        if (!k.stair) { k.x += Math.sin(k.yaw) * step; k.z -= Math.cos(k.yaw) * step; this.resolve(); }
      }
      this.req(); return;
    }
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < (d.touch ? 6 : 3)) return;
    d.moved = true;
    const dx = x - d.lx, dy = y - d.ly; d.lx = x; d.ly = y;
    if (this.mode === 'walk') { this.look(dx * (d.touch ? .006 : .0045), dy * (d.touch ? .006 : .0045)); return; }
    if (d.type === 'pan') this.panBy(dx, dy);
    else { const o = this.orb; o.theta += dx * .008; o.phi = clamp(o.phi - dy * .008, 0.001, 1.52); }
    this.req();
  },
  pUp(e, cancel) {
    this.ptrs.delete(e.pointerId);
    const d = this.drag;
    if (d && d.type === 'pinch') { if (!this.ptrs.size) this.drag = null; return; }
    this.drag = null;
    if (!d || cancel || d.moved) return;
    this.pick(d.x, d.y); // gezintide: zemine tıkla → oraya yürü
  },
  pick(x, y) {
    const T = this.T, rc = new T.Raycaster();
    rc.setFromCamera(new T.Vector2(x / this.w * 2 - 1, -(y / this.h) * 2 + 1), this.cam);
    const hits = rc.intersectObjects(this.root.children, true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      let n = h.object, pick = null, floor = false, lv = null;
      while (n && n !== this.root) { if (n.userData.floor) floor = true; if (n.userData.lv !== undefined && lv === null) lv = n.userData.lv; if (n.userData.pick) { pick = n.userData.pick; break; } n = n.parent; }
      if (this.mode === 'walk') {
        const fy = this.wk.fy || 0, onMine = Math.abs(h.point.y - fy) < .35;
        if ((floor || h.object.userData.floor || (!pick && h.point.y < fy + .05)) && onMine) { this.walkTo(h.point.x, h.point.z); return; }
        if (floor && !onMine) { toast('Bu nokta başka katta · merdivenden ya da alttaki düğmeyle geç'); return; }
      }
      if (pick) { Ed.select(pick); return; }
      if (h.object.userData.wall) break;
    }
    if (this.mode === 'orbit') Ed.select(null);
  },
  panBy(dx, dy) {
    const o = this.orb, k = o.dist * 0.0016;
    const rx = Math.sin(o.theta), rz = -Math.cos(o.theta);   // sağ vektörü
    const fx = -Math.cos(o.theta), fz = -Math.sin(o.theta);  // ileri (yatay)
    o.tx -= rx * dx * k; o.tz -= rz * dx * k;
    o.tx += fx * dy * k; o.tz += fz * dy * k;
    this.req();
  },
  wheel(e) {
    e.preventDefault();
    if (this.mode === 'walk') {
      const k = this.wk, st = -e.deltaY * 0.003;
      if (!k.stair) { k.x += Math.sin(k.yaw) * st; k.z -= Math.cos(k.yaw) * st; this.resolve(); this.req(); }
      return;
    }
    this.orb.dist = clamp(this.orb.dist * Math.exp(e.deltaY * 0.0012 * (e.deltaMode === 1 ? 16 : 1)), 1.2, 160);
    this.req();
  },
  key(e, down) {
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (this.mode !== 'walk' || !codes.includes(e.code)) return false;
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    if (down) this.startLoop();
    return true;
  },
  /* ---------- Render (yüksek kaliteli görsel) ---------- */
  async ready3d() {
    if (!this.T) { this.loading = this.loading || loadThree(); this.T = await this.loading; this.cv = $('#scene'); this.setup(); }
    if (this.sceneDirty || !this.root.children.length) this.build();
  },
  setShadow(n) { const sh = this.sun.shadow; if (sh.mapSize.x === n) return; sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; } },
  /* Etkin katı kadraja sığdıran yörünge kamerası */
  fitOrbit(aspect, view) {
    const P = Ed.P, W = P.shop.w, D = P.shop.d, H = P.shop.h || 2.8, O = this.lvOrigin();
    const r = .5 * Math.hypot(W + 1.2, D + 1.2, H * .6);
    const vf = 45 * D2R, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const f = Math.min(vf, hf);
    const views = {iso: [Math.PI / 2 + .62, .95], iso2: [Math.PI / 2 - .62, .95], back: [-Math.PI / 2 + .62, .95], top: [Math.PI / 2, .001]};
    const [theta, phi] = views[view] || views.iso;
    let dist = r / Math.sin(f / 2) * .88;
    if (view === 'top') dist = Math.max((D + 1.6) / (2 * Math.tan(vf / 2)), (W + 1.6) / (2 * Math.tan(hf / 2))) + H;
    return {tx: O.x + W / 2, ty: O.y + (view === 'top' ? 0 : H * .12), tz: O.z + D / 2, theta, phi, dist};
  },
  /* Girişin hemen içinden, göz hizasında (zemin kat) */
  entrancePose() {
    const P = Ed.P, gv = lvView(P, groundIdx(P)), segs = computeWalls(gv);
    const doors = gv.items.filter(it => it.type === 'door').map(it => ({it, s: wallOf(it, segs)})).filter(o => o.s && o.s.outer);
    doors.sort((a, b) => (b.it.style === 'double') - (a.it.style === 'double') || b.it.w - a.it.w);
    if (!doors.length) return {x: gv.shop.w / 2, z: gv.shop.d - .6, yaw: 0, pitch: -.06, fy: 0};
    const {it, s} = doors[0]; let ix = 0, iz = 0;
    if (s.h) iz = -s.n; else ix = -s.n;
    return {x: it.cx + ix * .7, z: it.cy + iz * .7, yaw: Math.atan2(ix, -iz), pitch: -.08, fy: 0};
  },
  async renderImage(o) {
    await this.ready3d();
    const T = this.T, R = this.R, W = o.w, H = o.h;
    const saved = {mode: this.mode, orb: this.orb ? {...this.orb} : null, wk: {...this.wk}, pr: R.getPixelRatio()};
    if (o.view === 'walk') { this.mode = 'walk'; Object.assign(this.wk, this.entrancePose(), {bob: 0}); }
    const rebuilt = multiLevel(Ed.P) && (this.mode === 'walk') !== (this.builtMode === 'all');
    if (rebuilt) this.build();
    else if (o.view !== 'current') { this.mode = 'orbit'; this.orb = this.fitOrbit(W / H, o.view); }
    else if (!this.orb && this.mode === 'orbit') this.orb = this.fitOrbit(W / H, 'iso');
    this.lightMode();
    const hidden = [];
    const hide = n => { if (n && n.visible) { hidden.push(n); n.visible = false; } };
    hide(this.selHelper);
    for (const c of this.kids()) {
      if (c.userData.clearZone || c.userData.zoneItem || c.userData.label) hide(c);
      if (!o.people && c.userData.pick && Ed.P.levels.some(l => l.items.some(i => i.id === c.userData.pick.id && i.type === 'human'))) hide(c);
    }
    this.setShadow(o.hq ? 4096 : 2048);
    let out;
    const cutRestore = [];
    try {
      R.setPixelRatio(1); R.setSize(W, H, false);
      this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
      this.applyCam();
      if (o.cut && o.view !== 'walk' && o.view !== 'top') cutRestore.push(...this.cutFacing());
      R.render(this.scene, this.cam);
      out = document.createElement('canvas'); out.width = W; out.height = H;
      const g = out.getContext('2d'); g.drawImage(this.cv, 0, 0);
      if (o.dims && o.view !== 'walk') this.drawDims3D(g, W, H);
    } finally {
      for (const [c, sy, py, v] of cutRestore) { c.scale.y = sy; c.position.y = py; c.visible = v; }
      hidden.forEach(n => { n.visible = true; });
      this.mode = saved.mode; this.orb = saved.orb; Object.assign(this.wk, saved.wk);
      this.setShadow(2048);
      R.setPixelRatio(saved.pr); this.resize();
      if (rebuilt) this.build(); else this.lightMode();
      if (Ed.view === '3d') this.req();
    }
    return out;
  },
  /* Render üzerine ölçü çizgileri ve oda etiketleri */
  drawDims3D(g, Wp, Hp) {
    const T = this.T, cam = this.cam, P = Ed.P, W = P.shop.w, D = P.shop.d, Hh = this.wallH, O = this.lvOrigin();
    const k = Math.max(1, Wp / 1250);
    const taken = [];
    const free = (x, y, w, h) => { const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2]; if (taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false; taken.push(r); return true; };
    const pr = (x, y, z) => { const v = new T.Vector3(x + O.x, y + O.y, z + O.z).project(cam); return [(v.x + 1) / 2 * Wp, (1 - v.y) / 2 * Hp, v.z]; };
    const cp = {x: cam.position.x - O.x, y: cam.position.y - O.y, z: cam.position.z - O.z};
    const pill = (x, y, lines, ang = 0, dark = true) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      const f1 = `700 ${15 * k}px ${getFont()}`, f2 = `500 ${12.5 * k}px ${getMono()}`;
      g.font = f1; let w = g.measureText(lines[0]).width;
      if (lines[1]) { g.font = f2; w = Math.max(w, g.measureText(lines[1]).width); }
      const hh = (lines[1] ? 40 : 24) * k, ww = w + 20 * k;
      if (!ang && !free(x, y, ww + 6 * k, hh + 6 * k)) { g.restore(); return; }
      g.beginPath(); g.roundRect(-ww / 2, -hh / 2, ww, hh, 8 * k);
      g.fillStyle = dark ? 'rgba(27,33,31,.88)' : 'rgba(255,255,255,.92)'; g.fill();
      g.fillStyle = dark ? '#FFFFFF' : '#1B211F'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = f1; g.fillText(lines[0], 0, lines[1] ? -8 * k : 1);
      if (lines[1]) { g.font = f2; g.globalAlpha = .8; g.fillText(lines[1], 0, 10 * k); }
      g.restore();
    };
    const dim = (a, b, label, extA, extB) => {
      if (a[2] > 1 || b[2] > 1) return;
      g.save(); g.lineCap = 'round';
      for (const [p, q] of [[extA, a], [extB, b]]) if (p) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.strokeStyle = 'rgba(27,33,31,.45)'; g.lineWidth = 1.2 * k; g.setLineDash([4 * k, 4 * k]); g.stroke(); g.setLineDash([]); }
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 30) { g.restore(); return; }
      const ux = dx / L, uy = dy / L, nx = -uy * 8 * k, ny = ux * 8 * k;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      for (const p of [a, b]) { g.moveTo(p[0] + nx, p[1] + ny); g.lineTo(p[0] - nx, p[1] - ny); }
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 5 * k; g.stroke();
      g.strokeStyle = '#1B211F'; g.lineWidth = 2 * k; g.stroke();
      let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      pill((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [label], ang);
      g.restore();
    };
    const o = OUTER_T, gap = .6;
    const zF = cp.z > D / 2 ? D + o : -o, zE = cp.z > D / 2 ? D + o + gap : -o - gap;
    const xF = cp.x > W / 2 ? W + o : -o, xE = cp.x > W / 2 ? W + o + gap : -o - gap;
    dim(pr(0, 0, zE), pr(W, 0, zE), fmtM(W) + ' m', pr(0, 0, zF), pr(W, 0, zF));
    dim(pr(xE, 0, 0), pr(xE, 0, D), fmtM(D) + ' m', pr(xF, 0, 0), pr(xF, 0, D));
    if (this.mode === 'orbit' && this.orb && this.orb.phi > .2 && Hh > 1) {
      const xc = cp.x > W / 2 ? -o : W + o, zc = zF;
      dim(pr(xc, 0, zc + (zc > 0 ? gap * .6 : -gap * .6)), pr(xc, Hh, zc + (zc > 0 ? gap * .6 : -gap * .6)), fmtM(P.shop.h) + ' m', pr(xc, 0, zc), pr(xc, Hh, zc));
    }
    for (const r of [...P.rooms].sort((a, b) => b.w * b.d - a.w * a.d)) {
      const c = pr(r.x + r.w / 2, .05, r.y + r.d / 2);
      if (c[2] > 1) continue;
      pill(c[0], c[1], [r.name, `${fmtM(r.w)} × ${fmtM(r.d)} m · ${fmtA(r.w * r.d)} m²`], 0, false);
    }
  },
  /* ---------- Video kaydı ---------- */
  videoMime() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  },
  /* Kameraya bakan dış duvarları 1 m'de keser; geri alma listesi döndürür */
  cutFacing() {
    const cp0 = this.cam.position, P = Ed.P, cutH = 1.0, list = [];
    for (const lg of this.root.children) {
      if (lg.userData.level === undefined) continue;
      const li = lg.userData.level, lv = P.levels[li], cp = {x: cp0.x - lg.position.x, z: cp0.z - lg.position.z};
      const facing = sg => sg && sg.outer && (sg.h ? (sg.n < 0 ? cp.z < sg.c : cp.z > sg.c) : (sg.n < 0 ? cp.x < sg.c : cp.x > sg.c));
      const segsL = li === P.cur ? Ed.segs : computeWalls(lvView(P, li));
      for (const c of lg.children) {
        if (c.userData.wall && facing(c.userData.seg)) {
          const y0 = c.userData.y0 || 0, hh = c.geometry.parameters.height, nh = Math.min(hh, cutH - y0);
          list.push([c, c.scale.y, c.position.y, c.visible]);
          if (nh <= .01) c.visible = false; else { c.scale.y = nh / hh; c.position.y = y0 + nh / 2; }
        } else if ((c.userData.signSeg && facing(c.userData.signSeg)) || (c.userData.pick && c.userData.pick.k === 'item' && (() => { const it = lv.items.find(i => i.id === c.userData.pick.id); return it && isOpening(it) && facing(wallOf(it, segsL)); })())) {
          list.push([c, c.scale.y, c.position.y, c.visible]); c.visible = false;
        }
      }
    }
    return list;
  },
  uncut(list) { for (const [c, sy, py, v] of list) { c.scale.y = sy; c.position.y = py; c.visible = v; } },
  /* Otomatik tur: kind = 'orbit' (360°) | 'walk' (girişten içeri) */
  async recordTour(kind, {w, h, seconds, onProgress, isCancelled}) {
    await this.ready3d();
    const mime = this.videoMime(); if (mime === null) throw new Error('Bu tarayıcı video kaydını desteklemiyor');
    const T = this.T, R = this.R, P = Ed.P;
    const saved = {mode: this.mode, orb: this.orb ? {...this.orb} : null, wk: {...this.wk}, pr: R.getPixelRatio()};
    this.recording = true; this.stopLoop();
    const hidden = [];
    R.setPixelRatio(1); R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.mode = kind === 'walk' ? 'walk' : 'orbit';
    const rebuilt = multiLevel(P) && (this.mode === 'walk') !== (this.builtMode === 'all');
    if (rebuilt) this.build(); else this.lightMode();
    if (this.selHelper) { hidden.push(this.selHelper); this.selHelper.visible = false; }
    for (const c of this.kids()) if (c.userData.clearZone || c.userData.zoneItem || c.userData.label) { if (c.visible) { hidden.push(c); c.visible = false; } }
    // Yol
    const base = this.fitOrbit(w / h, 'iso');
    const ent = this.entrancePose();
    const ix = Math.sin(ent.yaw), iz = -Math.cos(ent.yaw);
    const door = [ent.x - ix * .7, ent.z - iz * .7];
    const G0 = P.levels[groundIdx(P)], depth = Math.abs(ix) > .5 ? G0.shop.w : G0.shop.d;
    if (kind === 'walk') this.wk.fy = 0;
    const p0 = [door[0] - ix * 4, door[1] - iz * 4], p2 = [door[0] + ix * Math.min(depth * .5, 4.5), door[1] + iz * Math.min(depth * .5, 4.5)];
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pose = p => {
      if (kind === 'orbit') {
        this.orb = Object.assign({}, base, {theta: base.theta + Math.PI * 2 * p, phi: .88 + Math.sin(p * Math.PI * 2) * .1});
        return;
      }
      const k = this.wk;
      if (p < .45) { const t = ease(p / .45); k.x = p0[0] + (p2[0] - p0[0]) * t; k.z = p0[1] + (p2[1] - p0[1]) * t; k.yaw = ent.yaw; k.pitch = .12 - .2 * t; k.bob = t * 40; }
      else { const t = (p - .45) / .55; k.x = p2[0]; k.z = p2[1]; k.yaw = ent.yaw + Math.sin(t * Math.PI * 2) * 1.05; k.pitch = -.08; k.bob = 0; }
    };
    const stream = this.cv.captureStream(30);
    const rec = new MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: Math.round(w * h * 30 * .14)} : undefined);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    let cut = [];
    try {
      rec.start(500);
      const t0 = performance.now();
      await new Promise(resolve => {
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / 1000 / seconds);
          pose(p); this.uncut(cut); this.applyCam();
          if (kind === 'orbit') cut = this.cutFacing();
          R.render(this.scene, this.cam);
          if (onProgress) onProgress(p);
          if (p >= 1 || (isCancelled && isCancelled())) resolve(); else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      rec.stop(); await done;
    } finally {
      this.uncut(cut);
      hidden.forEach(n => { n.visible = true; });
      this.mode = saved.mode; this.orb = saved.orb; Object.assign(this.wk, saved.wk);
      R.setPixelRatio(saved.pr); this.resize();
      if (rebuilt) this.build(); else this.lightMode();
      this.recording = false; this.req();
    }
    if (isCancelled && isCancelled()) return null;
    return new Blob(chunks, {type: (mime || 'video/webm').split(';')[0]});
  },
  /* Canlı kayıt: kullanıcı gezerken ekrandaki 3B görüntüyü kaydeder */
  startLive() {
    const mime = this.videoMime(); if (mime === null) throw new Error('Bu tarayıcı video kaydını desteklemiyor');
    const stream = this.cv.captureStream(30);
    const rec = new MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: 6e6} : undefined);
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(500);
    // görüntü değişmese de kare üretmek için sürekli çiz
    this.liveRec = true;
    const tick = () => { if (!this.liveRec) return; this.render(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return {stop: async () => { this.liveRec = false; try { rec.requestData(); } catch (e) {} await new Promise(r => setTimeout(r, 300)); rec.stop(); await done; return new Blob(chunks, {type: (mime || 'video/webm').split(';')[0]}); }};
  },
  snapshot() { this.render(); return this.cv.toDataURL('image/png'); },
};

/* Dışbükey çokgenden daireyi dışarı it; gerekirse [dx, dy] döndürür */
function pushOut(poly, x, y, R) {
  const bb = polyBox(poly);
  if (x < bb.x0 - R || x > bb.x1 + R || y < bb.y0 - R || y > bb.y1 + R) return null;
  let inside = true, best = Infinity, bx = 0, by = 0, ex = 0, ey = 0, minPen = Infinity;
  const n = poly.length;
  // yön: saat yönü / tersi fark etmesin
  let area = 0; for (let i = 0; i < n; i++) { const [a, b] = poly[i], [c, d] = poly[(i + 1) % n]; area += a * d - c * b; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1e-9;
    let t = ((x - x1) * vx + (y - y1) * vy) / L2; t = clamp(t, 0, 1);
    const px = x1 + vx * t, py = y1 + vy * t, dd = Math.hypot(x - px, y - py);
    if (dd < best) { best = dd; bx = px; by = py; }
    // dış normal
    const L = Math.sqrt(L2), nx = sg * vy / L, ny = -sg * vx / L;
    const side = (x - x1) * nx + (y - y1) * ny;
    if (side > 0) inside = false;
    if (-side < minPen) { minPen = -side; ex = nx; ey = ny; }
  }
  if (inside) return [ex * (minPen + R), ey * (minPen + R)];
  if (best >= R) return null;
  const k = (R - best) / (best || 1e-9);
  return [(x - bx) * k, (y - by) * k];
}
