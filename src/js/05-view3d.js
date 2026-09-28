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
    if (!this.R || Ed.view !== '3d') return;
    this.applyCam();
    this.R.render(this.scene, this.cam);
    if (this.mode === 'walk') this.drawMini();
  },

  /* ---------- Malzemeler ---------- */
  mat(color, o = {}) {
    const key = color + JSON.stringify(o);
    if (!this.mats.has(key)) {
      const T = this.T;
      this.mats.set(key, new T.MeshStandardMaterial(Object.assign({color: new T.Color(color), roughness: .78, metalness: 0}, o)));
    }
    return this.mats.get(key);
  },
  glass() { return this.mat('#A9D4EE', {transparent: true, opacity: .28, roughness: .05, depthWrite: false}); },
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
    const T = this.T, P = Ed.P, W = P.shop.w, D = P.shop.d, H = P.shop.h || 2.8;
    const cs = getComputedStyle(document.documentElement), css = n => cs.getPropertyValue(n).trim();
    const dark = document.documentElement.dataset.mode === 'dark';
    this.clearRoot();
    this.prods = []; this.signInfo = null;
    const SW = 7;   // kaldırım genişliği
    this.scene.background = new T.Color(css('--scene-bg'));
    const root = this.root;
    const wallMode = Settings.v.walls || 'full';
    const wallH = wallMode === 'full' ? H : wallMode === 'half' ? 1.1 : 0.06;
    this.wallH = wallH;

    // Dış zemin: asfalt + dükkân çevresinde kaldırım
    const ground = new T.Mesh(new T.PlaneGeometry(W + 80, D + 80), this.mat(dark ? '#2B302E' : '#9A9C98', {roughness: .95}));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.03, D / 2); ground.receiveShadow = true; root.add(ground);
    const swM = new T.MeshStandardMaterial({color: 0xffffff, roughness: .9, map: this.floorTex(dark ? '#4A504D' : '#D6D2C9', dark ? '#3E4441' : '#C2BDB2', 3)});
    swM._own = true; swM.map.repeat.set((W + SW * 2) / 0.5, (D + SW * 2) / 0.5);
    const walk = new T.Mesh(new T.PlaneGeometry(W + SW * 2, D + SW * 2), swM);
    walk.rotation.x = -Math.PI / 2; walk.position.set(W / 2, -0.012, D / 2); walk.receiveShadow = true; root.add(walk);
    // Kaldırım bordürü
    const curb = this.mat(dark ? '#5C625F' : '#B9B4AA');
    for (const [x, z, w, d] of [[W / 2, -SW - .05, W + SW * 2 + .1, .1], [W / 2, D + SW + .05, W + SW * 2 + .1, .1], [-SW - .05, D / 2, .1, D + SW * 2], [W + SW + .05, D / 2, .1, D + SW * 2]]) this.box(root, w, .04, d, curb, x, -.01, z);

    // İç zemin (seramik)
    const fb = css('--scene-floor');
    const fm = new T.MeshStandardMaterial({color: 0xffffff, roughness: .35, map: this.floorTex(fb, mixHex(fb, '#000000', .09), 2)});
    fm._own = true; fm.map.repeat.set(W / 0.6, D / 0.6);
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), fm);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); floor.receiveShadow = true; floor.userData.floor = 1; root.add(floor);

    // Oda zeminleri + etiketleri
    for (const r of P.rooms) {
      const rm = new T.MeshStandardMaterial({color: 0xffffff, roughness: .45, map: this.floorTex(mixHex(fb, r.color, .22), mixHex(mixHex(fb, r.color, .22), '#000000', .08), 2)});
      rm._own = true; rm.map.repeat.set(r.w / .45, r.d / .45);
      const m = new T.Mesh(new T.PlaneGeometry(r.w, r.d), rm);
      m.rotation.x = -Math.PI / 2; m.position.set(r.x + r.w / 2, 0.002, r.y + r.d / 2); m.receiveShadow = true;
      m.userData.pick = {k: 'room', id: r.id}; m.userData.floor = 1; root.add(m);
      if (!Settings.v.roomLabels3d && Settings.v.roomLabels3d !== undefined) continue;
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
    const addWall = (s, a, b, y0, y1, dz = 0) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return;
      const len = b - a, mid = (a + b) / 2, hh = y1 - y0 - dz;
      const mats = [side, side, cap, side, side, side];
      if (s.outer) mats[s.h ? (s.c < 0 ? 5 : 4) : (s.c < 0 ? 1 : 0)] = facade;
      const m = s.h ? this.box(root, len, hh, s.t, mats, mid, y0 + hh / 2, s.c) : this.box(root, s.t, hh, len, mats, s.c, y0 + hh / 2, mid);
      m.userData.wall = 1;
      if (y0 < .01 && wallH > .5) { // süpürgelik
        const k = s.h ? this.box(root, len, .08, s.t + .016, skirt, mid, .04, s.c) : this.box(root, s.t + .016, .08, len, skirt, s.c, .04, mid);
        k.castShadow = false;
      }
    };
    for (const s of Ed.segs) {
      let cur = s.a; const ops = [...s.open].sort((p, q) => p.a - q.a);
      const dz = s.h ? 0 : 0.001; // dikey duvarlar 1 mm alçak: kesişimde titremeyi önler
      for (const o of ops) {
        if (o.a > cur) addWall(s, cur, o.a, 0, wallH, dz);
        const lo = Math.max(cur, o.a);
        if (o.elev > 0.01) addWall(s, lo, o.b, 0, Math.min(o.elev, wallH), dz);
        if (o.top < wallH - 0.01) addWall(s, lo, o.b, o.top, wallH, dz);
        cur = Math.max(cur, o.b);
      }
      if (s.b > cur) addWall(s, cur, s.b, 0, wallH, dz);
    }

    // Eşyalar
    for (const it of P.items) {
      const g = this.buildItem(it, wallH, dark);
      if (!g) continue;
      g.position.set(it.cx, 0, it.cy); g.rotation.y = -(it.rot || 0) * D2R;
      g.userData.pick = {k: 'item', id: it.id};
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

    // Tabela ve tavan
    if (wallMode === 'full') { this.buildSign(P, H, dark); this.buildCeiling(P, H); }
    else this.ceil = null;

    // Güneş / gölge kutusu
    const ext = Math.max(W, D) * .75 + 4;
    const sc = this.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
    this.sun.position.set(W / 2 + 7, 15, D / 2 + 10); this.sun.target.position.set(W / 2, 0, D / 2);
    this.lightMode();

    this.buildColliders();
    this.updateSel();
    this.miniDirty = true;
  },
  /* Gezinirken tavan görünür, iç ışık artar */
  lightMode() {
    const walk = this.mode === 'walk', dark = document.documentElement.dataset.mode === 'dark';
    if (this.ceil) this.ceil.visible = walk;
    for (const c of this.root.children) if (c.userData.label || c.userData.clearZone || c.userData.zoneItem) c.visible = !walk;
    this.hemi.intensity = walk ? 1.25 : (dark ? .9 : 1.1);
    this.sun.intensity = walk ? 1.2 : 2.0;
    this.scene.environmentIntensity = walk ? .85 : .6;
    if (this.fill) this.fill.intensity = walk ? 1.4 : 0;
  },
  buildCeiling(P, H) {
    const T = this.T, W = P.shop.w, D = P.shop.d, g = new T.Group();
    const cm = this.mat('#F5F4F0', {roughness: .95, side: T.DoubleSide, emissive: '#F2F0EA', emissiveIntensity: .62});
    const c = new T.Mesh(new T.PlaneGeometry(W, D), cm);
    c.rotation.x = Math.PI / 2; c.position.set(W / 2, H - .002, D / 2); c.receiveShadow = false; c.castShadow = false; g.add(c);
    const lamp = this.mat('#FFFFFF', {emissive: '#FFFFFF', emissiveIntensity: 2.2, roughness: .4});
    const nx = Math.max(1, Math.round(W / 2.4)), nz = Math.max(1, Math.round(D / 2.4));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const l = this.box(g, .6, .02, .6, lamp, (i + .5) * W / nx, H - .012, (j + .5) * D / nz); l.castShadow = false; l.receiveShadow = false;
    }
    g.visible = this.mode === 'walk';
    this.root.add(g); this.ceil = g;
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
    else { s = Ed.segs.find(q => q.outer && q.h && q.c > 0); along = P.shop.w / 2; }
    const [lo, hi] = segRange(s);
    const out = s.c < 0 ? -1 : 1;              // dışa doğru yön
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
    const T = this.T, c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#D0102B'; g.lineWidth = 16; g.strokeRect(8, 8, 240, 240);
    g.fillStyle = '#D0102B'; g.font = `900 200px ${getFont()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('E', 128, 138);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
  },

  /* ---------- Ürünler (ilaç kutuları) ---------- */
  prodMats() {
    if (this._pm) return this._pm;
    const T = this.T, pal = ['#D7263D', '#1B6CA8', '#2A9D5C', '#F08A24', '#7B4FB8', '#0E8C8C', '#E0569B', '#243B6B', '#E8B923', '#5E6B73', '#3AAFA9', '#B5651D'];
    this._pm = pal.map((col, i) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const full = i % 4 === 3;
      g.fillStyle = full ? col : '#FBFBF8'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = full ? '#FFFFFF' : col;
      if (full) { g.fillRect(6, 34, 52, 5); g.fillRect(6, 44, 36, 4); }
      else {
        g.fillRect(0, 0, 64, 18 + (i % 3) * 4);
        g.beginPath(); g.arc(46, 42, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9BA3A7'; g.fillRect(6, 36, 26, 3); g.fillRect(6, 44, 20, 3); g.fillRect(6, 52, 30, 3);
      }
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.magFilter = T.LinearFilter; t.generateMipmaps = true;
      return new T.MeshStandardMaterial({map: t, roughness: .5});
    });
    return this._pm;
  },
  rng(seedStr) {
    let seed = hashStr(seedStr);
    return () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  },
  /* Bir raf seviyesine ürün diz: x0..x1 boyunca, zön ön kenar, dir +1 → ürünler -z yönüne uzanır */
  fillShelf(g, rnd, x0, x1, y, zFront, depth, maxH, dir = 1, big) {
    if (maxH < .07 || depth < .05) return;
    const M = this.T.Matrix4, V = this.T.Vector3, Q = this.T.Quaternion;
    let x = x0 + .01;
    while (x < x1 - .05) {
      if (rnd() < .07) { x += .05 + rnd() * .1; continue; } // boşluk
      const mi = Math.floor(rnd() * 12);
      const bw = big ? .07 + rnd() * .1 : .04 + rnd() * .07;
      const bh = Math.min(maxH - .02, big ? .12 + rnd() * .14 : .07 + rnd() * .12);
      const bd = Math.min(depth - .02, big ? .06 + rnd() * .08 : .05 + rnd() * .08);
      const n = 1 + Math.floor(rnd() * 4);
      const rows = depth > bd * 2 + .06 ? 2 : 1;
      for (let k = 0; k < n && x + bw < x1 - .005; k++) {
        for (let r = 0; r < rows; r++) {
          const z = zFront - dir * (bd / 2 + .012 + r * (bd + .01));
          const m = new M().compose(new V(x + bw / 2, y + bh / 2, z), new Q(), new V(bw, bh, bd));
          this.prods.push({mi, m, g});
        }
        x += bw + .004;
      }
      x += .01;
    }
  },
  flushProducts() {
    const T = this.T; if (!this.prods || !this.prods.length) return;
    this.root.updateMatrixWorld(true);
    const mats = this.prodMats(), geo = new T.BoxGeometry(1, 1, 1);
    const by = new Map();
    for (const p of this.prods) { if (!by.has(p.mi)) by.set(p.mi, []); by.get(p.mi).push(p); }
    for (const [mi, list] of by) {
      const im = new T.InstancedMesh(geo, mats[mi], list.length);
      list.forEach((p, i) => im.setMatrixAt(i, p.m.clone().premultiply(p.g.matrixWorld)));
      im.castShadow = false; im.receiveShadow = true; im.userData.products = 1;
      this.root.add(im);
    }
    this.prods = [];
  },
  /* Açık raf gövdesi: arka pano, yanlar, raflar + fiyat rayı + ürünler, üstte LED'li korniş */
  shelfBay(g, it, o) {
    const {w, y0, y1, zb, depth, levels, rnd, body, panel, shelf, rail, led, big} = o;
    const B = (...a) => this.box(g, ...a);
    const zc = zb + depth / 2;
    B(w - .04, y1 - y0, .018, panel, 0, y0 + (y1 - y0) / 2, zb + .009);
    for (const sx of [-1, 1]) B(.025, y1 - y0 + .06, depth, body, sx * (w / 2 - .0125), y0 + (y1 - y0 + .06) / 2 - .03, zc);
    B(w, .07, depth + .03, body, 0, y1 + .035, zc + .015);
    const l = B(w - .08, .012, .025, led, 0, y1 - .006, zb + depth - .04); l.castShadow = false;
    const step = (y1 - y0) / levels;
    for (let i = 0; i < levels; i++) {
      const y = y0 + i * step;
      if (i > 0) B(w - .05, .022, depth - .02, shelf, 0, y, zc + .005);
      const r = B(w - .05, .034, .012, rail, 0, y + .006, zb + depth - .004); r.castShadow = false;
      this.fillShelf(g, rnd, -w / 2 + .03, w / 2 - .03, y + .011, zb + depth - .02, depth - .05, step - .05, 1, big);
    }
  },

  buildItem(it, wallH, dark) {
    const T = this.T, g = new T.Group(), w = it.w, d = it.d, h = it.h;
    const c = it.color, m = this.mat(c), light = this.mat(mixHex(c, '#FFFFFF', .22)), darkM = this.mat(mixHex(c, '#000000', .35));
    const metal = this.mat('#B8BEC4', {metalness: .6, roughness: .35});
    const B = (...a) => this.box(g, ...a);
    switch (it.type) {
      case 'cabinet': {
        const st = it.style, rnd = this.rng(it.id);
        const panel = this.mat(mixHex(c, '#FFFFFF', .62), {roughness: .8});
        const shelf = this.mat(dark ? '#D9D5CD' : '#F2EFEA', {roughness: .6});
        const rail = this.mat('#39434A', {roughness: .5});
        const led = this.mat('#FFFFFF', {emissive: '#FFF6E5', emissiveIntensity: 2.4});
        const top = this.mat(dark ? '#D8D3CA' : '#EEEAE3', {roughness: .35});
        const drawers = (x0, x1, y0, y1, zf, rowH = .2) => {
          const ww = x1 - x0, rows = Math.max(1, Math.round((y1 - y0) / rowH)), cols = Math.max(1, Math.round(ww / .45));
          const rh = (y1 - y0) / rows, cw = ww / cols;
          for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
            const x = x0 + cw * (k + .5), y = y0 + rh * (r + .5);
            B(cw - .01, rh - .01, .018, light, x, y, zf);
            B(Math.min(.14, cw * .35), .014, .022, metal, x, y - rh * .12, zf + .015);
            const lb = B(Math.min(.07, cw * .2), Math.min(.035, rh * .22), .004, this.mat('#FFFFFF'), x, y + rh * .2, zf + .011); lb.castShadow = false;
          }
        };
        if (st === 'open') {
          B(w, .1, d - .02, darkM, 0, .05, -.01);
          const levels = Math.max(2, Math.round((h - .2) / .36));
          this.shelfBay(g, it, {w, y0: .1, y1: h - .07, zb: -d / 2, depth: d, levels, rnd, body: m, panel, shelf, rail, led});
        } else if (st === 'drawer') {
          // Altta çekmeceler + tezgâh, üstte açık ilaç rafı
          const hasTop = h >= 1.4, lowH = hasTop ? clamp(h * .4, .75, .95) : h;
          B(w, lowH - .03, d - .02, m, 0, (lowH - .03) / 2, -.01);
          B(w, .1, d - .06, darkM, 0, .05, -.03);
          drawers(-w / 2 + .01, w / 2 - .01, .1, lowH - .04, d / 2 - .01, .19);
          B(w + .01, .03, d + .02, top, 0, lowH - .015, .01);
          if (hasTop) {
            const du = Math.min(.34, d * .72);
            const levels = Math.max(2, Math.round((h - lowH - .1) / .34));
            this.shelfBay(g, it, {w, y0: lowH, y1: h - .07, zb: -d / 2, depth: du, levels, rnd, body: m, panel, shelf, rail, led});
          }
        } else if (st === 'gondola') {
          B(w, .12, d, darkM, 0, .06, 0);
          B(w - .02, h - .12, .03, panel, 0, .12 + (h - .12) / 2, 0);
          for (const sx of [-1, 1]) B(.025, h - .1, d, m, sx * (w / 2 - .0125), .1 + (h - .1) / 2, 0);
          const levels = Math.max(2, Math.round((h - .14) / .34)), step = (h - .12) / levels;
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
          const n = 4, step = (h - .17) / n;
          for (let i = 0; i < n; i++) {
            const y = .12 + i * step;
            if (i) { const s = this.box(g, w - .05, .01, d - .05, this.glass(), 0, y, 0); s.castShadow = false; }
            this.fillShelf(g, rnd, -w / 2 + .05, w / 2 - .05, y + .006, d / 2 - .06, d - .14, step - .06, 1, true);
          }
          const gl = this.box(g, w - .03, h - .17, d - .03, this.glass(), 0, .12 + (h - .17) / 2, 0); gl.castShadow = false;
        } else if (st === 'fridge') {
          const white = this.mat('#EDEFF1', {roughness: .35});
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
        } else { // kapaklı
          B(w, h, d - .02, m, 0, h / 2, -.01);
          const n = Math.max(1, Math.round(w / .5)), dw = (w - .02) / n;
          const dh = h > 1.2 ? h - .12 : h - .08, dy = h > 1.2 ? .1 + dh / 2 : .06 + dh / 2;
          for (let i = 0; i < n; i++) {
            const x = -w / 2 + .01 + dw * (i + .5);
            B(dw - .008, dh, .018, light, x, dy, d / 2 - .01);
            const hxp = x + (i % 2 ? -1 : 1) * (dw / 2 - .05);
            B(.014, Math.min(.22, dh * .2), .022, metal, n === 1 ? x + dw / 2 - .05 : hxp, h > 1.2 ? 1.05 : h - .12, d / 2 + .008);
          }
          B(w, h > 1.2 ? .1 : .06, d - .06, darkM, 0, h > 1.2 ? .05 : .03, -.03);
          if (h <= 1.2) B(w + .01, .03, d + .02, top, 0, h + .015, .01);
        }
        break;
      }
      case 'counter': {
        const top = this.mat(dark ? '#D8D3CA' : '#F1EDE6', {roughness: .3});
        const led = this.mat('#FFFFFF', {emissive: mixHex(c, '#FFFFFF', .4), emissiveIntensity: 1.6});
        B(w, h - .04, d - .06, m, 0, (h - .04) / 2, -.03);
        B(w + .02, .04, d + .02, top, 0, h - .02, 0);
        // müşteri yüzü: açık renk pano + alt LED
        B(w - .06, h - .22, .015, this.mat(mixHex(c, '#FFFFFF', .45), {roughness: .5}), 0, .12 + (h - .22) / 2, d / 2 - .06 + .0075);
        const l = B(w - .08, .015, .01, led, 0, .1, d / 2 - .052); l.castShadow = false;
        B(w, .08, d - .14, darkM, 0, .04, -.07);
        // personel tarafı: alçak çalışma yüzeyi, ekran ve POS
        if (h > .95 && d > .5) B(w - .04, .03, .32, top, 0, .88, -d / 2 + .16);
        const scr = this.mat('#1D2A36', {emissive: '#2E5A86', emissiveIntensity: .7, roughness: .2});
        const blk = this.mat('#23272B', {roughness: .5});
        const nMon = Math.max(1, Math.floor(w / 1.6));
        for (let i = 0; i < nMon; i++) {
          const x = -w / 2 + w * (i + .5) / nMon;
          B(.06, .16, .06, blk, x, h + .08, -d / 2 + .22);
          this.box(g, .52, .32, .03, [blk, blk, blk, blk, blk, scr], x, h + .3, -d / 2 + .2);
          B(.3, .03, .14, blk, x + .38 < w / 2 ? x + .38 : x - .38, h + .015, -d / 2 + .2);
        }
        break;
      }
      case 'table': {
        const tH = .04;
        if (it.style === 'round') {
          const top = new T.Mesh(new T.CylinderGeometry(w / 2, w / 2, tH, 40), m); top.position.y = h - tH / 2; top.scale.z = d / w; top.castShadow = top.receiveShadow = true; g.add(top);
          const leg = new T.Mesh(new T.CylinderGeometry(.035, .035, h - tH, 12), darkM); leg.position.y = (h - tH) / 2; leg.castShadow = true; g.add(leg);
          const base = new T.Mesh(new T.CylinderGeometry(Math.min(.25, w * .3), Math.min(.25, w * .3), .03, 24), darkM); base.position.y = .015; g.add(base);
        } else {
          B(w, tH, d, m, 0, h - tH / 2, 0);
          const lx = w / 2 - .05, lz = d / 2 - .05;
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.045, h - tH, .045, darkM, sx * lx, (h - tH) / 2, sz * lz);
        }
        break;
      }
      case 'column': B(w, wallH, d, this.mat(getComputedStyle(document.documentElement).getPropertyValue('--scene-wall').trim()), 0, wallH / 2, 0); break;
      case 'door': {
        const hh = Math.min(h, wallH > 1 ? h : wallH);
        if (it.style === 'sliding') { B(w * .55, hh, .035, m, w * .2, hh / 2, d / 2 + .03); break; }
        const leaves = it.style === 'double' ? [[-w / 2, w / 2, 1], [w / 2, w / 2, -1]] : [[it.flip ? w / 2 : -w / 2, w, it.flip ? -1 : 1]];
        const ang = 75 * D2R;
        for (const [hx, L, dir] of leaves) {
          const piv = new T.Group(); piv.position.set(hx, 0, d / 2); piv.rotation.y = dir > 0 ? -ang : ang;
          this.box(piv, L - .01, hh - .01, .04, m, dir * L / 2, hh / 2, .02);
          this.box(piv, .02, .02, .12, metal, dir * (L - .08), hh * .48, .06);
          g.add(piv);
        }
        // söve
        const fr = this.mat(dark ? '#8C9590' : '#5B6461');
        B(.04, hh, d + .01, fr, -w / 2 + .02, hh / 2, 0); B(.04, hh, d + .01, fr, w / 2 - .02, hh / 2, 0);
        if (hh < wallH) B(w, .05, d + .01, fr, 0, hh - .025, 0);
        break;
      }
      case 'window': {
        const top = Math.min(it.elev + h, wallH); if (top <= it.elev) break;
        const hh = top - it.elev, fr = this.mat(dark ? '#AEB6B2' : '#4E5754');
        const gl = this.box(g, w, hh, .02, this.glass(), 0, it.elev + hh / 2, 0); gl.castShadow = false;
        B(w, .05, d + .02, fr, 0, it.elev + .025, 0); B(w, .05, d + .02, fr, 0, top - .025, 0);
        B(.05, hh, d + .02, fr, -w / 2 + .025, it.elev + hh / 2, 0); B(.05, hh, d + .02, fr, w / 2 - .025, it.elev + hh / 2, 0);
        if (w > 1.2) B(.04, hh, .06, fr, 0, it.elev + hh / 2, 0);
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
    const W = P.shop.w, D = P.shop.d;
    this.orb = {tx: W / 2, ty: 0, tz: D / 2, theta: Math.PI / 2 + .55, phi: .92, dist: Math.max(W, D) * 1.15 + 2};
    this.req();
  },
  preset(k) {
    const P = Ed.P; if (!P) return; if (!this.orb) this.resetCam();
    const W = P.shop.w, D = P.shop.d, o = this.orb;
    o.tx = W / 2; o.tz = D / 2; o.ty = 0;
    const aspect = this.w / Math.max(1, this.h);
    if (k === 'top') { o.phi = 0.001; o.theta = Math.PI / 2; o.dist = Math.max(D * 1.35, W * 1.35 / aspect) / (2 * Math.tan(22.5 * D2R)) * .9; }
    else { o.phi = .92; o.theta = Math.PI / 2 + .55; o.dist = Math.max(W, D) * 1.15 + 2; }
    this.req();
  },
  applyCam() {
    const c = this.cam;
    if (this.mode === 'walk') {
      const k = this.wk, bob = Math.sin(k.bob) * .016;
      if (c.fov !== 70) { c.fov = 70; c.updateProjectionMatrix(); }
      c.position.set(k.x, EYE + bob, k.z);
      const cp = Math.cos(k.pitch);
      c.lookAt(k.x + Math.sin(k.yaw) * cp, EYE + bob + Math.sin(k.pitch), k.z - Math.cos(k.yaw) * cp);
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
    this.mode = m;
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
    $$('.orbit-only').forEach(b => b.hidden = m !== 'orbit');
    const st = $('#stage'); st.classList.add('is3d'); st.classList.toggle('walking', m === 'walk');
    const touch = matchMedia('(pointer: coarse)').matches;
    $('#joy').hidden = !(m === 'walk' && touch);
    $('#minimap').hidden = m !== 'walk';
    if (m === 'walk') { if (!this.wkInit) this.enterWalk(); this.startLoop(); }
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
    if (this.mode === 'walk') t = touch ? 'Sol alttaki çubukla yürü · ekranı sürükleyerek dön · haritaya dokun: ışınlan'
      : this.locked ? 'W A S D yürü · fareyle bak · Shift koş · Esc fareyi bırak' : 'Ekrana tıkla: fareyle bak · W A S D / ok tuşları yürü · Shift koş';
    else t = touch ? 'Tek parmak: döndür · iki parmak: yakınlaştır / kaydır · dokun: seç' : 'Sürükle: döndür · sağ tuş/Shift: kaydır · tekerlek: yakınlaştır · tıkla: seç';
    el.textContent = t; el.hidden = false;
  },
  /* Girişten (dış duvardaki kapının önünden) başla */
  enterWalk() {
    const P = Ed.P, W = P.shop.w, D = P.shop.d;
    const outerDoors = P.items.filter(it => it.type === 'door' && (() => { const s = wallOf(it, Ed.segs); return s && s.outer; })());
    outerDoors.sort((a, b) => (b.style === 'double') - (a.style === 'double') || b.w - a.w);
    const k = this.wk;
    if (outerDoors.length) {
      const dr = outerDoors[0], s = wallOf(dr, Ed.segs);
      let ix = 0, iz = 0;
      if (s.h) iz = s.c < 0 ? 1 : -1; else ix = s.c < 0 ? 1 : -1;
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
    k.target = null; k.vx = 0; k.vz = 0; this.wkInit = true;
    this.resolve();
  },
  look(dx, dy) {
    const k = this.wk;
    k.yaw += dx; k.pitch = clamp(k.pitch - dy, -1.25, 1.25);
    this.req();
  },
  walkTo(x, z) {
    const P = Ed.P;
    this.wk.target = [clamp(x, -3, P.shop.w + 3), clamp(z, -3, P.shop.d + 3)];
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
      else this.loopOn = false;
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
    if (turn) k.yaw += turn * 1.9 * dt;
    let vx = 0, vz = 0;
    const L = Math.hypot(f, s);
    if (L > .05) {
      const n = Math.min(1, L) / L; f *= n; s *= n;
      const fx = Math.sin(k.yaw), fz = -Math.cos(k.yaw);
      vx = (fx * f + -fz * s) * speed; vz = (fz * f + fx * s) * speed;
      k.target = null;
    } else if (k.target) {
      const dx = k.target[0] - k.x, dz = k.target[1] - k.z, dd = Math.hypot(dx, dz);
      if (dd < .08) k.target = null;
      else { const sp = Math.min(2.2, dd * 3); vx = dx / dd * sp; vz = dz / dd * sp;
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
      k.x += vx * dt; k.z += vz * dt; this.resolve();
      const moved = Math.hypot(k.x - px, k.z - pz);
      if (moved < Math.hypot(vx, vz) * dt * .3) { k.vx *= .5; k.vz *= .5; }
      k.bob += moved * 7.5;
      if (k.target && moved < Math.hypot(vx, vz) * dt * .2) k.target = null; // takıldı
    } else if (Math.sin(k.bob) !== 0) { k.bob = Math.abs(Math.sin(k.bob)) < .05 ? 0 : k.bob + dt * 6; }
    return moving || !!turn || !!k.target || Math.abs(Math.sin(k.bob)) > .01;
  },
  /* Çarpışma: oyuncu R yarıçaplı daire; duvarlar ve katı eşyalar dışbükey çokgen */
  buildColliders() {
    const P = Ed.P, list = [];
    for (const r of wallPieces(Ed.segs, o => o.type === 'door')) list.push(rectPoly(r));
    for (const it of P.items) {
      if (!isSolid(it) && !(it.type === 'human')) continue;
      if (it.type === 'human') { const p = itemPoly(it); list.push(p); continue; }
      list.push(itemPoly(it));
    }
    // kapalı pencereler: sürgülü kapı dahil geçilir; pencere boşlukları duvar sayılır (pencere altı zaten duvar)
    for (const s of Ed.segs) for (const o of s.open) if (o.type === 'window') list.push(rectPoly(segRect(s, o.a, o.b)));
    this.colliders = list;
    const W = P.shop.w, D = P.shop.d;
    this.bounds = [-6.8, -6.8, W + 6.8, D + 6.8];
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

  /* ---------- Mini harita ---------- */
  drawMini() {
    const cv = $('#minimap'); if (cv.hidden || !Ed.P) return;
    const P = Ed.P, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cv.getBoundingClientRect().width || 180;
    const W = P.shop.w + 1.2, D = P.shop.d + 1.2;
    const cw = cssW, ch = Math.round(cssW * D / W);
    if (this.miniDirty || !this.mini || this.mini.cw !== cw) {
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      const s = cw / W, V = {s, ox: .6 * s, oy: .6 * s};
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const C = planColors();
      drawPlan(off.getContext('2d'), P, V, {w: cw, h: ch, dpr, C: Object.assign({}, C, {bg: C.floor}), segs: Ed.segs, A: Ed.A, grid: false, clear: false, labels: false, dims: false});
      this.mini = {cw, ch, V, off}; this.miniDirty = false;
    }
    const m = this.mini, g = cv.getContext('2d'), k = this.wk;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(m.off, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = k.x * m.V.s + m.V.ox, y = k.z * m.V.s + m.V.oy;
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    g.beginPath(); g.moveTo(x, y);
    const R = 26, a0 = k.yaw - Math.PI / 2 - .6, a1 = k.yaw - Math.PI / 2 + .6;
    g.arc(x, y, R, a0, a1); g.closePath(); g.fillStyle = rgba(acc.startsWith('#') ? acc : '#1F7A5A', .25); g.fill();
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = acc; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    if (k.target) { g.beginPath(); g.arc(k.target[0] * m.V.s + m.V.ox, k.target[1] * m.V.s + m.V.oy, 4, 0, Math.PI * 2); g.strokeStyle = acc; g.stroke(); }
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
        this.orb.dist = clamp(d.dist0 * d.d0 / dd, 1.2, 120);
        this.panBy(m[0] - d.m[0], m[1] - d.m[1]); d.m = m;
      } else { // gezinti: iki parmakla ileri/geri
        const k = this.wk, step = (dd - (d.last || d.d0)) * 0.01; d.last = dd;
        k.x += Math.sin(k.yaw) * step; k.z -= Math.cos(k.yaw) * step; this.resolve();
      }
      this.req(); return;
    }
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < (d.touch ? 6 : 3)) return;
    d.moved = true;
    const dx = x - d.lx, dy = y - d.ly; d.lx = x; d.ly = y;
    if (this.mode === 'walk') { this.look(dx * (d.touch ? .006 : .004), dy * (d.touch ? .006 : .004)); return; }
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
    // Dokunma: seç / yürü
    if (this.mode === 'walk' && d.mouse && d.btn === 0 && !this.locked) {
      try { this.cv.requestPointerLock(); } catch (_) {}
      return;
    }
    this.pick(d.x, d.y);
  },
  pick(x, y) {
    const T = this.T, rc = new T.Raycaster();
    rc.setFromCamera(new T.Vector2(x / this.w * 2 - 1, -(y / this.h) * 2 + 1), this.cam);
    const hits = rc.intersectObjects(this.root.children, true);
    for (const h of hits) {
      let n = h.object, pick = null, floor = false;
      while (n && n !== this.root) { if (n.userData.floor) floor = true; if (n.userData.pick) { pick = n.userData.pick; break; } n = n.parent; }
      if (this.mode === 'walk' && (floor || h.object.userData.floor || (!pick && h.point.y < .02))) { this.walkTo(h.point.x, h.point.z); return; }
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
      k.x += Math.sin(k.yaw) * st; k.z -= Math.cos(k.yaw) * st; this.resolve(); this.req(); return;
    }
    this.orb.dist = clamp(this.orb.dist * Math.exp(e.deltaY * 0.0012 * (e.deltaMode === 1 ? 16 : 1)), 1.2, 120);
    this.req();
  },
  key(e, down) {
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (this.mode !== 'walk' || !codes.includes(e.code)) return false;
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    if (down) this.startLoop();
    return true;
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
