/* =====================================================================
   3B görünüm (three.js): parçalar, kapak/çekmece açma, patlatma,
   seçilen parçanın üstünde boy / en / kalınlık ölçü çizgileri
   ===================================================================== */
const THREE_URLS = ['./vendor/three.module.min.js', 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js'];
const MM = .001;

const V = {
  T: null, ready: false, loading: null,
  doorMode: 'closed', explode: false, dims: true, focus: true,
  open: 0, exp: 0, sel: null, hover: null,
  holders: [], meshes: [], byId: new Map(), extras: [],
  orb: {th: .6, ph: 1.12, r: 3, tx: 0, ty: 0, tz: 0},
  cab: null, R: null, onPick: null, lastKey: '',

  async init() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      let T = null, err;
      for (const u of THREE_URLS) { try { T = await import(u); break; } catch (e) { err = e; } }
      if (!T) { $('#load3d').textContent = '3B kütüphanesi yüklenemedi.'; throw err; }
      this.T = T;
      const cv = $('#cv');
      const ren = this.ren = new T.WebGLRenderer({canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true});
      ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const sc = this.scene = new T.Scene();
      this.cam = new T.PerspectiveCamera(32, 1, .01, 60);
      sc.add(new T.HemisphereLight(0xffffff, 0x8a8f8c, 1.55));
      const d1 = new T.DirectionalLight(0xffffff, 1.55); d1.position.set(2.2, 3.4, 4.2); sc.add(d1);
      const d2 = new T.DirectionalLight(0xffffff, .55); d2.position.set(-3, 1.5, -1.5); sc.add(d2);
      this.root = new T.Group(); sc.add(this.root);
      this.dimG = new T.Group(); sc.add(this.dimG);
      /* zemin gölgesi */
      const cnv = document.createElement('canvas'); cnv.width = cnv.height = 128;
      const g2 = cnv.getContext('2d'), grd = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,.34)'); grd.addColorStop(.55, 'rgba(0,0,0,.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
      this.shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({map: new T.CanvasTexture(cnv), transparent: true, depthWrite: false}));
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .0005; sc.add(this.shadow);
      this.ray = new T.Raycaster();
      this.bindEvents(cv);
      new ResizeObserver(() => this.resize()).observe($('#v3d'));
      this.resize();
      this.ready = true; $('#load3d').hidden = true;
    })();
    return this.loading;
  },

  /* ---------- sahneyi kur ---------- */
  build(c, R, mats, fitCam) {
    const T = this.T; if (!T) return;
    this.cab = c; this.R = R;
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    this.root.clear(); this.holders = []; this.meshes = []; this.byId.clear();
    const dark = document.documentElement.dataset.mode === 'dark';
    const edgeCol = dark ? 0x0b0d0c : 0x2c3330;
    const metal = new T.MeshStandardMaterial({color: 0x7D848B, metalness: .75, roughness: .28});
    const drawers = new Map();
    const ctrOf = b => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    for (const p of R.parts) {
      const b = p.box, ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]], ctr = ctrOf(b);
      const fin = FINISHES[(mats[p.mat] || {}).color] || FINISHES.beyaz;
      const col = new T.Color(fin[1]);
      if (p.kind === 'back' || p.kind === 'dbottom') col.offsetHSL(0, 0, -.04);
      const geo = new T.BoxGeometry(ext[0] * MM, ext[1] * MM, ext[2] * MM);
      const mat = new T.MeshStandardMaterial({color: col, roughness: .7, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
      const mesh = new T.Mesh(geo, mat);
      const edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({color: edgeCol, transparent: true, opacity: .55}));
      mesh.add(edges);
      mesh.userData = {p, edges, col: col.clone(), ext, ctr};
      this.meshes.push(mesh); this.byId.set(p.id, mesh);
      if (p.off) { mat.transparent = true; mat.opacity = .25; }
      let holder;
      if (p.hinge) {
        holder = new T.Group(); holder.position.set(p.hinge.x * MM, ctr[1] * MM, p.hinge.z * MM);
        mesh.position.set((ctr[0] - p.hinge.x) * MM, 0, (ctr[2] - p.hinge.z) * MM);
        holder.add(mesh); holder.userData = {kind: 'door', side: p.hinge.side, ctr};
        this.root.add(holder); this.holders.push(holder);
        this.addHandle(mesh, p, ext, ctr, metal, 'door');
      } else if (p.grp) {
        let G = drawers.get(p.grp);
        if (!G) { G = new T.Group(); G.userData = {kind: 'drawer', ctrs: [], slide: (R.extras.find(x => x.grp === p.grp) || {}).slide || 300}; drawers.set(p.grp, G); this.root.add(G); this.holders.push(G); }
        mesh.position.set(ctr[0] * MM, ctr[1] * MM, ctr[2] * MM); G.add(mesh); G.userData.ctrs.push(ctr);
        if (p.kind === 'dfront') { G.userData.front = ctr; this.addHandle(mesh, p, ext, ctr, metal, 'drawer'); }
      } else {
        mesh.position.set(ctr[0] * MM, ctr[1] * MM, ctr[2] * MM);
        holder = mesh; mesh.userData.kind = 'part'; mesh.userData.hctr = ctr;
        this.root.add(mesh); this.holders.push(mesh);
      }
    }
    for (const G of drawers.values()) { const cs = G.userData.ctrs; G.userData.ctr = [0, 1, 2].map(a => cs.reduce((s, q) => s + q[a], 0) / cs.length); if (G.userData.front) G.userData.ctr[2] = G.userData.front[2]; }
    /* ayak, askı borusu */
    for (const x of R.extras) {
      if (x.type === 'leg') { const m = new T.Mesh(new T.CylinderGeometry(.017, .02, x.h * MM, 16), new T.MeshStandardMaterial({color: 0x2b2d2f, roughness: .6})); m.position.set(x.x * MM, x.h * MM / 2, x.z * MM); m.userData = {kind: 'hw', hctr: [x.x, x.h / 2, x.z]}; this.root.add(m); this.holders.push(m); }
      if (x.type === 'rod') { const l = (x.x1 - x.x0) * MM, m = new T.Mesh(new T.CylinderGeometry(.0125, .0125, l, 20), metal); m.rotation.z = Math.PI / 2; m.position.set((x.x0 + x.x1) / 2 * MM, x.y * MM, x.z * MM); m.userData = {kind: 'hw', hctr: [(x.x0 + x.x1) / 2, x.y, x.z]}; this.root.add(m); this.holders.push(m); }
    }
    for (const o of this.holders) o.userData.base = o.position.clone();
    const fd = R.dims ? R.dims.fdepth : c.D;
    this.center = [c.W / 2, c.H / 2, fd / 2];
    this.shadow.scale.set(c.W * MM * 1.6, fd * MM * 2.2, 1); this.shadow.position.set(c.W * MM / 2, .0005, fd * MM / 2);
    this.shadow.visible = c.base !== 'wall';
    const key = `${c.id}|${Math.round(c.W / 50)}|${Math.round(c.H / 50)}|${Math.round(c.D / 50)}`;
    if (fitCam || key !== this.lastKey) this.fit();
    this.lastKey = key;
    if (this.sel && !this.byId.has(this.sel)) this.sel = null;
    this.applyState(); this.req();
  },
  addHandle(mesh, p, ext, ctr, mat, type) {
    const T = this.T, c = this.cab, hx = ext[0] / 2, hy = ext[1] / 2, hz = ext[2] / 2;
    let geo, lx, ly;
    if (type === 'door') {
      const len = Math.min(160, ext[1] * .4); geo = new T.BoxGeometry(.011, len * MM, .012);
      lx = (p.hinge.side === 'L' ? 1 : -1) * (hx - 38);
      if (c.base === 'wall') ly = -hy + 70 + len / 2;
      else if (ext[1] > 1100) ly = clamp(1050 - ctr[1], -hy + 120, hy - 120);
      else ly = hy - 70 - len / 2;
    } else {
      const len = Math.min(160, ext[0] * .45); geo = new T.BoxGeometry(len * MM, .011, .012);
      lx = 0; ly = ext[1] > 260 ? hy - 60 : 0;
    }
    const m = new T.Mesh(geo, mat); m.position.set(lx * MM, ly * MM, (hz + 16) * MM);
    const post = new T.BoxGeometry(.008, .008, .016);
    for (const s of [-1, 1]) { const q = new T.Mesh(post, mat); if (type === 'door') q.position.set(lx * MM, (ly + s * (geo.parameters.height / MM / 2 - 8)) * MM, (hz + 8) * MM); else q.position.set((s * (geo.parameters.width / MM / 2 - 8)) * MM, ly * MM, (hz + 8) * MM); mesh.add(q); }
    mesh.add(m);
  },

  /* ---------- durum: kapak açık / patlatma / seçim ---------- */
  setDoor(mode) { this.doorMode = mode; this.animate(); },
  setExplode(on) { this.explode = on; this.animate(); },
  animate() { if (!this._anim) { this._anim = true; this.req(); } },
  applyState() {
    const T = this.T; if (!T) return;
    const C = this.center, k = this.exp;
    for (const o of this.holders) {
      const u = o.userData, base = u.base; if (!base) continue;
      let ctr = u.ctr || u.hctr || C;
      let dx = (ctr[0] - C[0]) * .55 * k, dy = (ctr[1] - C[1]) * .42 * k, dz = (ctr[2] - C[2]) * .9 * k;
      if (u.kind === 'door') dz += 260 * k;
      if (u.kind === 'drawer') dz += 200 * k + u.slide * this.open;
      if (u.kind === 'hw') { dx = dy = dz = 0; if (k > .01) dy = (ctr[1] - C[1]) * .42 * k; }
      o.position.set(base.x + dx * MM, base.y + dy * MM, base.z + dz * MM);
      if (u.kind === 'door') o.rotation.y = (u.side === 'L' ? -1 : 1) * 1.7 * this.open;
    }
    const hideFronts = this.doorMode === 'hidden';
    const selM = this.sel ? this.byId.get(this.sel) : null;
    const acc = new T.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1F7A5A');
    for (const m of this.meshes) {
      const p = m.userData.p, mt = m.material, ed = m.userData.edges.material;
      m.visible = !(hideFronts && (p.kind === 'door' || p.kind === 'dfront')) || m === selM;
      const isSel = m === selM, isHov = m.userData.p.id === this.hover && !isSel;
      mt.emissive.set(isSel ? acc : isHov ? acc : 0x000000); mt.emissiveIntensity = isSel ? .55 : isHov ? .22 : 0;
      const fade = selM && this.focus && !isSel;
      mt.transparent = fade || !!p.off; mt.opacity = fade ? .14 : p.off ? .25 : 1; mt.depthWrite = !fade;
      ed.opacity = isSel ? 1 : fade ? .12 : .55; ed.color.set(isSel ? acc : (document.documentElement.dataset.mode === 'dark' ? 0x0b0d0c : 0x2c3330));
      m.renderOrder = isSel ? 2 : 0;
      for (const ch of m.children) if (ch !== m.userData.edges && ch.material) ch.visible = !fade;
    }
  },
  select(id) { this.sel = id; this.applyState(); this.req(); },

  /* ---------- kamera ---------- */
  fit() {
    const c = this.cab; if (!c) return;
    const fd = this.R && this.R.dims ? this.R.dims.fdepth : c.D;
    const o = this.orb; o.tx = c.W / 2 * MM; o.ty = c.H / 2 * MM; o.tz = fd / 2 * MM;
    const rs = .5 * Math.hypot(c.W, c.H, fd) * MM * (this.explode ? 1.5 : 1);
    const fovV = this.cam.fov * Math.PI / 180, fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.cam.aspect);
    o.r = rs / Math.sin(Math.min(fovV, fovH) / 2) * 1.08;
    this.camUpd();
  },
  view(name) {
    const o = this.orb;
    if (name === 'iso') { o.th = .6; o.ph = 1.12; } else if (name === 'front') { o.th = 0; o.ph = Math.PI / 2 - .001; } else if (name === 'side') { o.th = Math.PI / 2; o.ph = Math.PI / 2 - .001; } else if (name === 'top') { o.th = 0; o.ph = .02; }
    this.fit(); this.req();
  },
  camUpd() {
    const o = this.orb, cm = this.cam;
    cm.position.set(o.tx + o.r * Math.sin(o.ph) * Math.sin(o.th), o.ty + o.r * Math.cos(o.ph), o.tz + o.r * Math.sin(o.ph) * Math.cos(o.th));
    cm.lookAt(o.tx, o.ty, o.tz);
    cm.near = Math.max(.005, o.r / 200); cm.far = o.r * 20 + 10; cm.updateProjectionMatrix();
  },
  resize() {
    if (!this.ren) return;
    const el = $('#v3d'), w = el.clientWidth, hh = el.clientHeight; if (!w || !hh) return;
    this.ren.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); this.req();
  },
  req() { if (!this._raf && this.ren) this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); },
  render() {
    if (!this.ren || !this.cab) return;
    if (this._anim) {
      const to = this.doorMode === 'open' ? 1 : 0, te = this.explode ? 1 : 0;
      this.open += (to - this.open) * .2; this.exp += (te - this.exp) * .18;
      if (Math.abs(to - this.open) < .002 && Math.abs(te - this.exp) < .002) { this.open = to; this.exp = te; this._anim = false; }
      this.applyState();
      if (this._anim) this.req();
    }
    this.camUpd();
    this.root.updateMatrixWorld(true);
    this.updDims();
    this.ren.render(this.scene, this.cam);
    this.placeLabels();
  },

  /* ---------- ölçü çizgileri ---------- */
  lineMat(cssVar) { const T = this.T, col = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || '#c2410c'; return new T.LineBasicMaterial({color: new T.Color(col), depthTest: false, transparent: true}); },
  updDims() {
    const T = this.T;
    for (const ch of this.dimG.children) { ch.geometry.dispose(); ch.material.dispose(); }
    this.dimG.clear(); this.labels = [];
    const seg = (pts, cssVar) => { const g = new T.BufferGeometry().setFromPoints(pts); const l = new T.LineSegments(g, this.lineMat(cssVar)); l.renderOrder = 999; this.dimG.add(l); };
    const selM = this.sel ? this.byId.get(this.sel) : null;
    if (selM && selM.visible) {
      const p = selM.userData.p, ext = selM.userData.ext, hh = ext.map(v => v / 2 * MM);
      const camL = selM.worldToLocal(this.cam.position.clone()), cl = [camL.x, camL.y, camL.z];
      const off = Math.max(.018, this.orb.r * .012), tick = off * .55;
      const roles = {}; ['L', 'W', 'T'].forEach((r, i) => roles[AXI[p.ax[i]]] = r);
      for (let a = 0; a < 3; a++) {
        const role = roles[a], b = (a + 1) % 3, c2 = (a + 2) % 3;
        const sb = cl[b] >= 0 ? 1 : -1, sc = cl[c2] >= 0 ? 1 : -1;
        /* çizgiyi, kameraya bakan kenara, dışarı doğru kaydırarak koy */
        const ob = off, oc = off * .4;
        const mk = (ta, db, dc) => { const v = [0, 0, 0]; v[a] = ta; v[b] = sb * (hh[b] + db); v[c2] = sc * (hh[c2] + dc); return selM.localToWorld(new T.Vector3(...v)); };
        const p0 = mk(-hh[a], ob, oc), p1 = mk(hh[a], ob, oc);
        const pts = [p0, p1, mk(-hh[a], 0, 0), mk(-hh[a], ob + tick, oc), mk(hh[a], 0, 0), mk(hh[a], ob + tick, oc)];
        seg(pts, role === 'L' ? '--dimL' : role === 'W' ? '--dimW' : '--dimT');
        const net = role === 'L' ? p.L : role === 'W' ? p.Wd : p.T, cut = role === 'L' ? p.cL : role === 'W' ? p.cW : p.T;
        const txt = `<em>${role === 'L' ? 'Boy' : role === 'W' ? 'En' : 'Kal.'}</em>${fmt(net)}${Math.abs(cut - net) > .05 ? ` <em>· kesim ${fmt(cut)}</em>` : ''}`;
        this.labels.push({pos: p0.clone().add(p1).multiplyScalar(.5), html: txt, cls: role});
      }
    } else if (this.dims && this.cab && !this.sel) {
      const c = this.cab, fd = this.R && this.R.dims ? this.R.dims.fdepth : c.D, o = Math.max(.05, this.orb.r * .02), tk = o * .5;
      const V3 = (x, y, z) => new T.Vector3(x, y, z), W = c.W * MM, H = c.H * MM, D = fd * MM;
      const ex = this.exp * .3;
      seg([V3(0, H + o, D), V3(W, H + o, D), V3(0, H, D), V3(0, H + o + tk, D), V3(W, H, D), V3(W, H + o + tk, D)], '--dimL');
      seg([V3(-o - ex, 0, D), V3(-o - ex, H, D), V3(0, 0, D), V3(-o - tk - ex, 0, D), V3(0, H, D), V3(-o - tk - ex, H, D)], '--dimW');
      seg([V3(W + o + ex, H, 0), V3(W + o + ex, H, D), V3(W, H, 0), V3(W + o + tk + ex, H, 0), V3(W, H, D), V3(W + o + tk + ex, H, D)], '--dimT');
      this.labels.push({pos: V3(W / 2, H + o, D), html: `<em>Genişlik</em>${fmt(c.W)}`, cls: 'L'});
      this.labels.push({pos: V3(-o - ex, H / 2, D), html: `<em>Yükseklik</em>${fmt(c.H)}`, cls: 'W'});
      this.labels.push({pos: V3(W + o + ex, H, D / 2), html: `<em>Derinlik</em>${fmt(c.D)}${fd !== c.D ? ` <em>(kapakla ${fmt(fd)})</em>` : ''}`, cls: 'T'});
    }
  },
  placeLabels() {
    const box = $('#lbls'), L = this.labels || [];
    while (box.children.length < L.length) box.append(h('div', {class: 'lbl'}));
    const w = this.ren.domElement.clientWidth, hh = this.ren.domElement.clientHeight;
    [...box.children].forEach((el, i) => {
      const q = L[i]; if (!q) { el.hidden = true; return; }
      const v = q.pos.clone().project(this.cam);
      if (v.z > 1) { el.hidden = true; return; }
      el.hidden = false; el.className = 'lbl ' + q.cls; if (el._h !== q.html) { el.innerHTML = q.html; el._h = q.html; }
      el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px,${((1 - v.y) / 2 * hh).toFixed(1)}px) translate(-50%,-50%)`;
    });
  },

  /* ---------- fare / dokunma ---------- */
  pick(cx, cy) {
    const r = this.ren.domElement.getBoundingClientRect();
    const v = new this.T.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const vis = this.meshes.filter(m => m.visible);
    const hit = this.ray.intersectObjects(vis, false);
    if (!hit.length) return null;
    /* odakta solukken öndeki saydam parçalar yerine seçili olmayan ilk opak parçayı tercih et */
    return hit[0].object.userData.p.id;
  },
  bindEvents(cv) {
    const ptr = new Map(); let moved = 0, last = null, pinch = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => { const hn = $('#hint3d'); if (hn) hn.hidden = true; cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, {x: e.clientX, y: e.clientY}); moved = 0; last = {x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey || e.ctrlKey || e.metaKey}; pinch = null; });
    cv.addEventListener('pointermove', e => {
      const o = this.orb;
      if (!ptr.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && this.ready && this.cab) { const id = this.pick(e.clientX, e.clientY); if (id !== this.hover) { this.hover = id; cv.style.cursor = id ? 'pointer' : ''; this.applyState(); this.req(); } }
        return;
      }
      const pr = ptr.get(e.pointerId), dx = e.clientX - pr.x, dy = e.clientY - pr.y;
      pr.x = e.clientX; pr.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (pinch) { o.r = clamp(o.r * pinch.d / Math.max(d, 1), .2, 30); this.pan(mx - pinch.mx, my - pinch.my); }
        pinch = {d, mx, my};
      } else if (last && (last.b === 2 || last.b === 1 || last.sh)) this.pan(dx, dy);
      else { o.th -= dx * .008; o.ph = clamp(o.ph - dy * .008, .03, Math.PI - .03); }
      this.req();
    });
    const up = e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId);
      if (!ptr.size && moved < 6 && last && last.b === 0 && this.ready) { const id = this.pick(e.clientX, e.clientY); this.onPick && this.onPick(id); }
      if (ptr.size < 2) pinch = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.applyState(); this.req(); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.orb.r = clamp(this.orb.r * Math.exp(e.deltaY * .0012), .2, 30); this.req(); }, {passive: false});
    cv.addEventListener('dblclick', e => { const id = this.pick(e.clientX, e.clientY), m = id && this.byId.get(id); if (m) { const v = new this.T.Vector3(); m.getWorldPosition(v); Object.assign(this.orb, {tx: v.x, ty: v.y, tz: v.z}); this.req(); } });
  },
  pan(dx, dy) {
    const T = this.T, o = this.orb, el = this.ren.domElement, k = 2 * o.r * Math.tan(this.cam.fov * Math.PI / 360) / el.clientHeight;
    const right = new T.Vector3().setFromMatrixColumn(this.cam.matrix, 0), upv = new T.Vector3().setFromMatrixColumn(this.cam.matrix, 1);
    const mv = right.multiplyScalar(-dx * k).add(upv.multiplyScalar(dy * k));
    o.tx += mv.x; o.ty += mv.y; o.tz += mv.z;
  },
  snapshot() { try { this.render(); return this.ren.domElement.toDataURL('image/png'); } catch (e) { return null; } },
};

/* ---------- 2B ön görünüş (liste simgeleri ve çıktı için) ---------- */
function frontSVG(c, R, opt = {}) {
  const mini = !!opt.mini, pad = mini ? 0 : Math.max(c.W, c.H) * .12;
  const vw = c.W + 2 * pad, vh = c.H + 2 * pad;
  const svg = sv('svg', {viewBox: `${-pad} ${-pad} ${vw} ${vh}`, class: opt.cls || '', preserveAspectRatio: 'xMidYMid meet'});
  const Y = y => c.H - y, sw = Math.max(c.W, c.H) / (mini ? 28 : 260);
  const rect = (b, st) => svg.append(sv('rect', Object.assign({x: b[0], y: Y(b[4]), width: b[3] - b[0], height: b[4] - b[1]}, st)));
  const body = R.parts.filter(p => ['side', 'top', 'bottom', 'rail', 'divider', 'sep', 'shelf', 'plinth'].includes(p.kind) && !(p.kind === 'rail' && p.id === 'rail-b'));
  const fronts = R.parts.filter(p => p.kind === 'door' || p.kind === 'dfront');
  if (mini) {
    rect([0, 0, 0, c.W, c.H, 0], {fill: 'none', stroke: 'currentColor', 'stroke-width': sw * 1.4, 'stroke-linejoin': 'round'});
    for (const p of fronts) { rect(p.box, {fill: 'none', stroke: 'currentColor', 'stroke-width': sw}); }
    if (!fronts.length) for (const p of body.filter(q => q.kind === 'shelf' || q.kind === 'divider')) rect(p.box, {fill: 'currentColor', stroke: 'none', opacity: .55});
    return svg;
  }
  if (opt.theme) svg.classList.add('pvw');
  for (const x of R.extras.filter(q => q.type === 'leg' && q.z > c.D / 2)) svg.append(sv('rect', {x: x.x - 16, y: Y(x.h), width: 32, height: x.h, class: 'pv-l', fill: '#333'}));
  for (const p of body) rect(p.box, {fill: '#e8e4dc', stroke: '#222', 'stroke-width': sw, class: 'pv-b'});
  for (const p of R.parts.filter(q => q.kind === 'dfb' && q.id.endsWith('-F'))) rect(p.box, {fill: 'none', stroke: '#888', 'stroke-width': sw * .7, 'stroke-dasharray': `${sw * 4} ${sw * 3}`, class: 'pv-x'});
  for (const x of R.extras.filter(q => q.type === 'rod')) svg.append(sv('line', {x1: x.x0, y1: Y(x.y), x2: x.x1, y2: Y(x.y), stroke: '#555', 'stroke-width': sw * 2.4, 'stroke-linecap': 'round', class: 'pv-r'}));
  for (const p of fronts) {
    const b = p.box;
    rect(b, {fill: 'none', stroke: '#1d4ed8', 'stroke-width': sw * 1.1, 'stroke-dasharray': opt.theme ? null : `${sw * 8} ${sw * 4}`, class: 'pv-f'});
    if (p.hinge) { const hx = p.hinge.side === 'L' ? b[0] : b[3], fxx = p.hinge.side === 'L' ? b[3] : b[0]; svg.append(sv('path', {d: `M${fxx} ${Y(b[4])} L${hx} ${Y((b[1] + b[4]) / 2)} L${fxx} ${Y(b[1])}`, fill: 'none', stroke: '#1d4ed8', 'stroke-width': sw * .6, opacity: .6, class: 'pv-h'})); }
    if (opt.theme) {
      const hl = p.hinge ? Math.min(160, (b[4] - b[1]) * .3) : Math.min(160, (b[3] - b[0]) * .4);
      if (p.hinge) { const xh = p.hinge.side === 'L' ? b[3] - 40 : b[0] + 40, ym = c.base === 'wall' ? b[1] + 70 + hl / 2 : (b[4] - b[1]) > 1100 ? clamp(1050, b[1] + 120, b[4] - 120) : b[4] - 70 - hl / 2; svg.append(sv('line', {x1: xh, y1: Y(ym - hl / 2), x2: xh, y2: Y(ym + hl / 2), class: 'pv-k', 'stroke-width': sw * 2.2, 'stroke-linecap': 'round'})); }
      else { const xm = (b[0] + b[3]) / 2, ym = (b[4] - b[1]) > 260 ? b[4] - 60 : (b[1] + b[4]) / 2; svg.append(sv('line', {x1: xm - hl / 2, y1: Y(ym), x2: xm + hl / 2, y2: Y(ym), class: 'pv-k', 'stroke-width': sw * 2.2, 'stroke-linecap': 'round'})); }
    }
  }
  /* ölçüler */
  const fs = Math.max(c.W, c.H) / 26, dl = (x1, y1, x2, y2, txt, vert) => {
    svg.append(sv('line', {x1, y1, x2, y2, stroke: '#c2410c', 'stroke-width': sw, class: 'pv-d'}));
    for (const [px, py] of [[x1, y1], [x2, y2]]) svg.append(sv('line', Object.assign(vert ? {x1: px - fs * .3, y1: py, x2: px + fs * .3, y2: py} : {x1: px, y1: py - fs * .3, x2: px, y2: py + fs * .3}, {stroke: '#c2410c', 'stroke-width': sw, class: 'pv-d'})));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    svg.append(sv('text', vert ? {x: mx - fs * .35, y: my, 'font-size': fs, 'text-anchor': 'middle', transform: `rotate(-90 ${mx - fs * .35} ${my})`, fill: '#c2410c', 'font-family': 'Arial', class: 'pv-t'} : {x: mx, y: my - fs * .3, 'font-size': fs, 'text-anchor': 'middle', fill: '#c2410c', 'font-family': 'Arial', class: 'pv-t'}, txt));
  };
  dl(0, -pad * .45, c.W, -pad * .45, fmt(c.W));
  dl(-pad * .45, 0, -pad * .45, c.H, fmt(c.H), true);
  if (R.secs.length > 1) { let y = c.H + pad * .5; for (const s of R.secs) dl(s.sx, y, s.sx + s.sw, y, fmt(s.sw)); }
  return svg;
}
