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
    this.hemi = new T.HemisphereLight(0xffffff, 0x9a9486, 1.9); this.scene.add(this.hemi);
    const sun = this.sun = new T.DirectionalLight(0xffffff, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    this.scene.add(sun); this.scene.add(sun.target);
    this.root = new T.Group(); this.scene.add(this.root);
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
  floorTex(base, line) {
    const T = this.T, c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
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
    this.scene.background = new T.Color(css('--scene-bg'));
    const root = this.root;
    const wallMode = Settings.v.walls || 'full';
    const wallH = wallMode === 'full' ? H : wallMode === 'half' ? 1.1 : 0.06;
    this.wallH = wallH;

    // Zemin (dış: kaldırım) ve iç zemin
    const ground = new T.Mesh(new T.PlaneGeometry(W + 60, D + 60), this.mat(dark ? '#2A302D' : '#D9D8D2'));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.012, D / 2); ground.receiveShadow = true; root.add(ground);
    const walk = new T.Mesh(new T.PlaneGeometry(W + 6, D + 6), this.mat(dark ? '#353B38' : '#E6E4DE'));
    walk.rotation.x = -Math.PI / 2; walk.position.set(W / 2, -0.008, D / 2); walk.receiveShadow = true; root.add(walk);
    const fm = new T.MeshStandardMaterial({color: 0xffffff, roughness: .6, map: this.floorTex(css('--scene-floor'), mixHex(css('--scene-floor'), '#000000', .07))});
    fm._own = true; fm.map.repeat.set(W / 0.6, D / 0.6);
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), fm);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); floor.receiveShadow = true; floor.userData.floor = 1; root.add(floor);

    // Oda zeminleri + etiketleri
    for (const r of P.rooms) {
      const m = new T.Mesh(new T.PlaneGeometry(r.w, r.d), this.mat(mixHex(css('--scene-floor'), r.color, .28), {roughness: .7}));
      m.rotation.x = -Math.PI / 2; m.position.set(r.x + r.w / 2, 0.002, r.y + r.d / 2); m.receiveShadow = true;
      m.userData.pick = {k: 'room', id: r.id}; m.userData.floor = 1; root.add(m);
      const {t, aspect} = this.textTex([r.name, fmtA(r.w * r.d) + ' m²'], dark ? '#FFFFFF' : '#1B211F');
      const lh = clamp(Math.min(r.w, r.d) * .22, .25, .7), lw = lh * aspect;
      const s = Math.min(1, (r.w * .85) / lw);
      const lm = new T.MeshBasicMaterial({map: t, transparent: true, depthWrite: false}); lm._own = true;
      const lab = new T.Mesh(new T.PlaneGeometry(lw * s, lh * s), lm);
      lab.rotation.x = -Math.PI / 2; lab.position.set(r.x + r.w / 2, 0.006, r.y + r.d / 2); lab.renderOrder = 2;
      root.add(lab);
    }

    // Duvarlar (kapı/pencere boşlukları kesilmiş), üst yüzü koyu
    const side = this.mat(css('--scene-wall'), {roughness: .92});
    const cap = this.mat(dark ? '#9FA8A3' : '#3A423F');
    const wm = [side, side, cap, side, side, side];
    const addWall = (s, a, b, y0, y1, dz = 0) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return;
      const len = b - a, mid = (a + b) / 2, hh = y1 - y0 - dz;
      const m = s.h ? this.box(root, len, hh, s.t, wm, mid, y0 + hh / 2, s.c) : this.box(root, s.t, hh, len, wm, s.c, y0 + hh / 2, mid);
      m.userData.wall = 1;
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
      root.add(g);
    }
    // İnsan boşlukları (zeminde)
    if (Settings.v.clear) {
      const A = Ed.A;
      for (const it of P.items) {
        if (!isSolid(it)) continue;
        for (const side of ['f', 'b']) {
          const v = side === 'f' ? it.clear : it.clearB; if (!(v > 0)) continue;
          const bad = A.zoneBad.has(it.id + ':' + side);
          const m = new T.Mesh(new T.PlaneGeometry(it.w, v), this.mat(bad ? '#E5484D' : '#3FA66B', {transparent: true, opacity: bad ? .3 : .16, depthWrite: false}));
          m.rotation.x = -Math.PI / 2;
          const g = new T.Group(); g.add(m);
          m.position.set(0, 0.004, side === 'f' ? it.d / 2 + v / 2 : -it.d / 2 - v / 2);
          g.position.set(it.cx, 0, it.cy); g.rotation.y = -it.rot * D2R; root.add(g);
        }
      }
    }

    // Güneş / gölge kutusu
    const ext = Math.max(W, D) * .75 + 3;
    const sc = this.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix();
    this.sun.position.set(W / 2 + 6, 14, D / 2 + 9); this.sun.target.position.set(W / 2, 0, D / 2);
    this.hemi.intensity = dark ? 1.5 : 1.9;

    this.buildColliders();
    this.updateSel();
    this.miniDirty = true;
  },

  buildItem(it, wallH, dark) {
    const T = this.T, g = new T.Group(), w = it.w, d = it.d, h = it.h;
    const c = it.color, m = this.mat(c), light = this.mat(mixHex(c, '#FFFFFF', .22)), darkM = this.mat(mixHex(c, '#000000', .35));
    const metal = this.mat('#B8BEC4', {metalness: .6, roughness: .35});
    const B = (...a) => this.box(g, ...a);
    switch (it.type) {
      case 'cabinet': {
        const st = it.style;
        if (st === 'open') {
          B(w, h, .02, m, 0, h / 2, -d / 2 + .01);
          B(.02, h, d, m, -w / 2 + .01, h / 2, 0); B(.02, h, d, m, w / 2 - .01, h / 2, 0);
          B(w, .02, d, m, 0, h - .01, 0); B(w, .08, d, darkM, 0, .04, 0);
          const n = Math.max(2, Math.floor((h - .1) / .38));
          for (let i = 1; i < n; i++) B(w - .04, .02, d - .02, light, 0, .08 + i * (h - .1) / n, .01);
          this.products(g, it, n, .08, (h - .1) / n, d);
        } else if (st === 'gondola') {
          B(w, .12, d, darkM, 0, .06, 0);
          B(w - .02, h - .12, .04, m, 0, .12 + (h - .12) / 2, 0);
          const n = Math.max(2, Math.floor((h - .2) / .35));
          for (let i = 0; i < n; i++) {
            const y = .13 + i * (h - .2) / n;
            for (const sgn of [-1, 1]) B(w - .02, .02, d / 2 - .03, light, 0, y, sgn * (d / 4 + .005));
          }
          B(w, .03, .08, darkM, 0, h, 0);
          this.products(g, it, n, .13, (h - .2) / n, d, true);
        } else if (st === 'drawer') {
          B(w, h, d - .02, m, 0, h / 2, -.01);
          const rows = Math.max(2, Math.round((h - .1) / .28)), cols = Math.max(1, Math.round(w / .5));
          const rh = (h - .1) / rows, cw = w / cols;
          for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
            const x = -w / 2 + cw * (k + .5), y = .1 + rh * (r + .5);
            B(cw - .012, rh - .012, .016, light, x, y, d / 2 - .01);
            B(Math.min(.12, cw * .3), .014, .02, metal, x, y + rh * .25, d / 2 + .005);
          }
          B(w, .1, d - .06, darkM, 0, .05, -.03);
        } else if (st === 'glass') {
          B(w, .12, d, m, 0, .06, 0); B(w, .05, d, m, 0, h - .025, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.03, h, .03, m, sx * (w / 2 - .015), h / 2, sz * (d / 2 - .015));
          const gl = this.box(g, w - .03, h - .17, d - .03, this.glass(), 0, .12 + (h - .17) / 2, 0); gl.castShadow = false;
          for (let i = 1; i <= 3; i++) { const s = this.box(g, w - .05, .01, d - .05, this.glass(), 0, .12 + i * (h - .17) / 4, 0); s.castShadow = false; }
        } else if (st === 'fridge') {
          B(w, h, d - .02, this.mat('#E9ECEF'), 0, h / 2, -.01);
          const gd = this.box(g, w - .08, h - .16, .012, this.mat('#2B3A44', {transparent: true, opacity: .75, roughness: .1}), 0, h / 2 + .03, d / 2 - .004); gd.castShadow = false;
          B(.025, Math.min(.6, h * .4), .03, metal, w / 2 - .07, h * .55, d / 2 + .01);
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
        }
        break;
      }
      case 'counter': {
        const top = this.mat(dark ? '#D8D3CA' : '#EFEAE2', {roughness: .45});
        B(w, h - .04, d - .06, m, 0, (h - .04) / 2, -.03);
        B(w, .04, d, top, 0, h - .02, 0);
        B(w - .04, .1, .012, darkM, 0, h - .2, d / 2 - .06 + .006);
        B(w, .08, d - .14, darkM, 0, .04, -.07);
        // personel tarafında alçak çalışma yüzeyi
        if (h > .95 && d > .5) B(w - .04, .03, .3, top, 0, .9, -d / 2 + .15);
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
  /* Raflara hafif renkli ürün kutuları (tekrarlanabilir desen) */
  products(g, it, levels, y0, step, d, both) {
    const T = this.T, cols = ['#E8EEF2', '#F3E3D3', '#DDEBDD', '#F2D7DA', '#E1E3F2', '#FFFFFF', '#F5EDC9'];
    let seed = hashStr(it.id);
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
    const inst = new Map();
    const sides = both ? [-1, 1] : [1];
    for (let l = 0; l < levels; l++) {
      const y = y0 + l * step + .01;
      const maxH = Math.min(.26, step - .06); if (maxH < .06) continue;
      for (const sg of sides) {
        let x = -it.w / 2 + .03;
        while (x < it.w / 2 - .06) {
          const bw = .05 + rnd() * .09, bh = .07 + rnd() * (maxH - .07), bd = Math.min(both ? d / 2 - .08 : d - .1, .08 + rnd() * .12);
          if (x + bw > it.w / 2 - .03) break;
          if (rnd() > .12) {
            const col = cols[Math.floor(rnd() * cols.length)];
            if (!inst.has(col)) inst.set(col, []);
            const zc = both ? sg * (d / 4 + .01) : (-d / 2 + .03 + (d - .06) / 2 + .02);
            inst.get(col).push([x + bw / 2, y + bh / 2 + .01, zc, bw, bh, bd]);
          }
          x += bw + .012;
        }
      }
    }
    const geo = new T.BoxGeometry(1, 1, 1), M = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3();
    for (const [col, list] of inst) {
      const im = new T.InstancedMesh(geo, this.mat(col, {roughness: .6}), list.length);
      list.forEach(([x, y, z, sx, sy, sz], i) => { V.set(x, y, z); S.set(sx, sy, sz); M.compose(V, Q, S); im.setMatrixAt(i, M); });
      im.castShadow = false; im.receiveShadow = true; g.add(im);
    }
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
      const k = this.wk, bob = Math.sin(k.bob) * .022;
      if (c.fov !== 72) { c.fov = 72; c.updateProjectionMatrix(); }
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
      k.x = dr.cx - ix * 2.2; k.z = dr.cy - iz * 2.2;
      k.yaw = Math.atan2(ix, -iz); k.pitch = -0.05;
    } else {
      k.x = W / 2; k.z = D - .8; k.yaw = 0; k.pitch = -.05;
    }
    k.target = null; this.wkInit = true;
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
    const moving = Math.hypot(vx, vz) > .01;
    if (moving) {
      const px = k.x, pz = k.z;
      k.x += vx * dt; k.z += vz * dt; this.resolve();
      const moved = Math.hypot(k.x - px, k.z - pz);
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
    this.bounds = [-4, -4, W + 4, D + 4];
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
