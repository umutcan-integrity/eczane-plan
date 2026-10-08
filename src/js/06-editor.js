/* =====================================================================
   Düzenleyici: durum, geçmiş, kaydetme, komutlar
   ===================================================================== */

const Ed = {
  P: null, segs: [], A: {bad: new Set(), zoneBad: new Set(), issues: []}, sel: null, tool: 'select', view: '2d',
  hist: [], fut: [], dirty: false, saveTimer: 0, _ck: null, _ct: 0, multi: [],

  open(id) {
    const p = Store.load(id);
    if (!p) { toast('Proje bulunamadı', 'err'); Router.home(); return false; }
    this.P = p; this.sel = null; this.hist = []; this.fut = []; this.dirty = false; this.tool = 'select';
    Settings.set('last', id);
    this.recompute();
    $('#home').hidden = true; $('#editor').hidden = false;
    document.title = p.name + ' · Eczane Plan';
    $('#pnameText').textContent = p.name;
    Plan.fitted = false; Plan.measure = null;
    View3D.sceneDirty = true; View3D.orb = null; View3D.wkInit = false; View3D.mode = 'orbit';
    this.setView('2d', true);
    this.setTool('select');
    Palette.render(); Props.render(); this.updateSaveUI(); this.updateUndoUI();
    Sheets.closeAll();
    requestAnimationFrame(() => Plan.resize());
    return true;
  },
  async close() {
    if (!this.P) return true;
    if (this.dirty) {
      if (Settings.v.autosave) this.save(true);
      else {
        const r = await choose('Kaydedilmemiş değişiklikler', 'Projeden çıkmadan önce kaydetmek ister misin?',
          [{v: 'cancel', t: 'Vazgeç'}, {v: 'discard', t: 'Kaydetme', danger: 1}, {v: 'save', t: 'Kaydet', primary: 1}]);
        if (r === 'save') this.save(true);
        else if (r !== 'discard') return false;
      }
    }
    View3D.hide();
    this.P = null; this.sel = null;
    return true;
  },
  snap() { const P = this.P; return JSON.stringify({name: P.name, sign: P.sign, floor: P.floor, kroki: P.kroki, shop: P.shop, rooms: P.rooms, items: P.items, voids: P.voids, walls: P.walls}); },
  restore(str) {
    const o = JSON.parse(str);
    Object.assign(this.P, {name: o.name, floor: o.floor, shop: o.shop, rooms: o.rooms, items: o.items, voids: o.voids || [], walls: o.walls || []});
    if (o.kroki) this.P.kroki = o.kroki; else delete this.P.kroki;
    if (o.sign === undefined) delete this.P.sign; else this.P.sign = o.sign;
    if (this.sel && !this.objOf(this.sel)) this.sel = null;
    if (this.multi.length) { this.multi = this.multi.filter(id => this.P.items.some(i => i.id === id)); if (this.multi.length < 2) this.multi = []; }
    $('#pnameText').textContent = this.P.name;
  },
  recompute() { this.segs = computeWalls(this.P); this.A = analyze(this.P, this.segs); },
  /* Sürükleme sırasında (geçmişe yazmadan) */
  live() { this.recompute(); Plan.req(); Props.sync(); },
  change(fn, key) { const b = this.snap(); fn(); return this.commit(b, key); },
  commit(before, key) {
    const now = this.snap();
    if (now === before) { this.recompute(); Plan.req(); return false; }
    const t = Date.now();
    if (!(key && key === this._ck && t - this._ct < 1500)) { this.hist.push(before); if (this.hist.length > 200) this.hist.shift(); }
    this._ck = key; this._ct = t; this.fut = [];
    this.touch(); return true;
  },
  touch(full) {
    this.recompute();
    this.dirty = true; this.updateSaveUI(); this.updateUndoUI();
    if (Settings.v.autosave) { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(true), 900); }
    Plan.req(); View3D.markDirty();
    if (full) Props.render(); else Props.sync();
    Ctx.place();
  },
  undo() {
    if (!this.hist.length) return;
    this.fut.push(this.snap()); this.restore(this.hist.pop()); this._ck = null;
    this.touch(true); toast('Geri alındı');
  },
  redo() {
    if (!this.fut.length) return;
    this.hist.push(this.snap()); this.restore(this.fut.pop()); this._ck = null;
    this.touch(true);
  },
  updateUndoUI() { $('#btnUndo').disabled = !this.hist.length; $('#btnRedo').disabled = !this.fut.length; },
  save(silent) {
    if (!this.P) return;
    clearTimeout(this.saveTimer);
    try {
      Store.save(this.P, makeThumb(this.P));
      this.dirty = false; this.updateSaveUI();
      if (!silent) toast('Kaydedildi ✓');
    } catch (e) {
      toast('Kaydedilemedi — tarayıcı depolaması dolu olabilir. JSON olarak indir.', 'err');
    }
  },
  updateSaveUI() {
    $('#saveDot').classList.toggle('dirty', this.dirty);
    $('#saveText').textContent = this.dirty ? (Settings.v.autosave ? 'Kaydediliyor…' : 'Kaydedilmedi') : 'Kaydedildi';
  },

  objOf(sel) {
    if (!sel || !this.P) return null;
    const list = sel.k === 'room' ? this.P.rooms : sel.k === 'void' ? this.P.voids : sel.k === 'wall' ? this.P.walls : this.P.items;
    return (list || []).find(o => o.id === sel.id) || null;
  },
  selObj() { return this.objOf(this.sel); },
  select(sel) {
    const hadMulti = this.multi.length > 0; this.multi = [];
    const same = !hadMulti && ((this.sel && sel && this.sel.id === sel.id) || (!this.sel && !sel));
    this.sel = sel && this.objOf(sel) ? {k: sel.k, id: sel.id} : null;
    if (!same) Props.render();
    Plan.req(); View3D.updateSel(); Ctx.place();
    $('#dockPropsLbl').textContent = this.sel ? 'Özellikler' : 'Proje';
  },
  /* ---------- Çoklu seçim (Ctrl/Shift ile) ---------- */
  multiObjs() { return this.multi.map(id => this.P.items.find(i => i.id === id)).filter(Boolean); },
  setMulti(ids) {
    ids = [...new Set(ids)].filter(id => this.P.items.some(i => i.id === id));
    if (ids.length <= 1) { this.select(ids.length ? {k: 'item', id: ids[0]} : null); return; }
    this.sel = null; this.multi = ids;
    Props.render(); Plan.req(); View3D.updateSel(); Ctx.place();
    $('#dockPropsLbl').textContent = 'Özellikler';
  },
  toggleMulti(id) {
    const ids = new Set(this.multi.length ? this.multi : (this.sel && this.sel.k === 'item' ? [this.sel.id] : []));
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    this.setMulti([...ids]);
  },
  selectAll() { this.setMulti(this.P.items.filter(i => i.type !== 'zone').map(i => i.id)); },
  groupBox(its) { return its.reduce((b, it) => { const q = itemBox(it); return {x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1)}; }, {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity}); },
  /* Hizalama: l, cx, r, t, cy, b; dağıtma: dh, dv */
  align(mode) {
    const its = this.multiObjs(); if (its.length < 2) return;
    const B = this.groupBox(its);
    this.change(() => {
      if (mode === 'dh' || mode === 'dv') {
        const h = mode === 'dh', sorted = [...its].sort((a, b) => h ? a.cx - b.cx : a.cy - b.cy);
        const sizes = sorted.map(it => { const b = itemBox(it); return h ? b.x1 - b.x0 : b.y1 - b.y0; });
        const total = sizes.reduce((a, b) => a + b, 0), span = h ? B.x1 - B.x0 : B.y1 - B.y0, gap = (span - total) / (sorted.length - 1);
        let pos = h ? B.x0 : B.y0;
        sorted.forEach((it, i) => { const c = pos + sizes[i] / 2; if (h) it.cx = r3(c); else it.cy = r3(c); pos += sizes[i] + gap; });
        return;
      }
      for (const it of its) {
        const [hx, hy] = halfExt(it);
        if (mode === 'l') it.cx = r3(B.x0 + hx); if (mode === 'r') it.cx = r3(B.x1 - hx); if (mode === 'cx') it.cx = r3((B.x0 + B.x1) / 2);
        if (mode === 't') it.cy = r3(B.y0 + hy); if (mode === 'b') it.cy = r3(B.y1 - hy); if (mode === 'cy') it.cy = r3((B.y0 + B.y1) / 2);
      }
    });
  },
  setTool(t) {
    this.tool = t;
    $$('#tools2d [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $$('#dock [data-dock]').forEach(b => b.classList.toggle('on', b.dataset.dock === t));
    if (t !== 'measure') Plan.measure = null;
    Plan.hoverPt = null;
    const pill = $('#hintPill');
    if (t === 'room') { $('#hintText').textContent = 'Oda çizmek için köşeden köşeye sürükle'; pill.hidden = false; }
    else if (t === 'wall') { $('#hintText').textContent = 'Duvar çizmek için iki nokta arasında sürükle (yatay/dikey)'; pill.hidden = false; }
    else if (t === 'erase') { $('#hintText').textContent = 'Silgi: kapalı alana dokun ya da sürükleyerek kes'; pill.hidden = false; }
    else if (t === 'addarea') { $('#hintText').textContent = 'Alan ekle: sürükleyerek dükkânı büyüt ya da boşluğa dokun'; pill.hidden = false; }
    else if (t === 'measure') { $('#hintText').textContent = 'Ölçmek için iki nokta arasında sürükle'; pill.hidden = false; }
    else pill.hidden = true;
    if (t !== 'select') { this.select(null); Sheets.closeAll(); }
    Plan.req();
  },
  setView(v, quiet) {
    this.view = v;
    $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const is3 = v === '3d';
    $('#plan').hidden = is3; $('#tools2d').hidden = is3; $('#tools3d').hidden = !is3;
    $('#dock').style.display = is3 ? 'none' : '';
    $('#hintPill').hidden = is3 || this.tool === 'select';
    $('#zoomOut').hidden = $('#zoomIn').hidden = is3;
    if (is3) { if (this.tool !== 'select') this.setTool('select'); View3D.show(); }
    else { View3D.hide(); Plan.resize(); }
    Ctx.place();
  },

  /* ---------- Ekleme ---------- */
  viewCenter() {
    const [x, y] = Plan.toW(Plan.w / 2, Plan.h / 2 + (isMobile() ? 0 : 10));
    return [clamp(x, 0.5, this.P.shop.w - 0.5), clamp(y, 0.5, this.P.shop.d - 0.5)];
  },
  addFromCatalog(e, at) {
    if (!e || !this.P) return;
    if (e.tool) { this.setTool(e.tool); Sheets.closeAll(); return; }
    if (this.view !== '2d') this.setView('2d');
    const [x, y] = at || this.viewCenter();
    if (e.room) {
      const w = e.room.w, d = e.room.d;
      this.addRoom({x: Math.round((x - w / 2) / GRID) * GRID, y: Math.round((y - d / 2) / GRID) * GRID, w, d});
      Sheets.closeAll(); return;
    }
    const it = makeItem(e, x, y);
    it.id = nextId(this.P, 'i');
    if (it.type === 'column') it.h = this.P.shop.h;
    let placedAtWindow = false;
    if (e.s === 'wstand') placedAtWindow = this.placeAtWindow(it, x, y);
    if (placedAtWindow) { /* vitrin camının önüne yerleşti */ }
    else if (isOpening(it)) {
      const seg = nearestWall(this.segs, x, y, Infinity);
      if (seg) { seatOnWall(it, seg, seg.h ? x : y, true); it.cx = r3(it.cx); it.cy = r3(it.cy); }
    } else {
      const [hx, hy] = halfExt(it);
      it.cx = r3(Math.round((it.cx - hx) / GRID) * GRID + hx); it.cy = r3(Math.round((it.cy - hy) / GRID) * GRID + hy);
    }
    this.change(() => this.P.items.push(it));
    this.select({k: 'item', id: it.id});
    Sheets.closeAll();
    if (isOpening(it)) toast(`${it.name} en yakın duvara yerleşti · sürükleyerek duvar boyunca kaydır`);
    if (placedAtWindow) toast('Cam önü stand en yakın vitrin camının önüne yerleşti');
  },
  /* Cam önü stand: en yakın pencerenin içine, önü cama bakacak şekilde */
  placeAtWindow(it, x, y) {
    const wins = this.P.items.filter(i => i.type === 'window').map(i => ({i, s: wallOf(i, this.segs)})).filter(o => o.s);
    if (!wins.length) return false;
    wins.sort((a, b) => Math.hypot(a.i.cx - x, a.i.cy - y) - Math.hypot(b.i.cx - x, b.i.cy - y));
    const {i: win, s} = wins[0];
    let inward = s.outer ? -s.n : ((s.h ? y : x) > s.c ? 1 : -1);
    it.w = r3(clamp(win.w - .1, .6, 3));
    const off = s.t / 2 + .1 + it.d / 2;
    if (s.h) { it.cx = win.cx; it.cy = r3(s.c + inward * off); it.rot = inward > 0 ? 180 : 0; }
    else { it.cy = win.cy; it.cx = r3(s.c + inward * off); it.rot = inward > 0 ? 90 : 270; }
    return true;
  },
  addRoom(r) {
    const P = this.P, n = P.rooms.length;
    const room = {id: nextId(P, 'r'), name: 'Oda ' + (n + 1), x: r3(r.x), y: r3(r.y), w: r3(r.w), d: r3(r.d), color: ROOM_COLORS[n % ROOM_COLORS.length]};
    this.change(() => P.rooms.push(room));
    this.select({k: 'room', id: room.id});
  },

  /* ---------- Dükkân şekli: duvar, silgi, alan ekle ---------- */
  addWall(p0, p1) {
    const P = this.P, w = {id: nextId(P, 'w'), x1: r3(p0[0]), y1: r3(p0[1]), x2: r3(p1[0]), y2: r3(p1[1]), t: Settings.v.wallT || INNER_T};
    this.change(() => P.walls.push(w));
    toast(`Duvar eklendi · ${fmtCm(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))} cm`);
  },
  /* Alanı dükkândan çıkar: içindeki eşyalar varsa sor */
  async removeRegion(rects, label) {
    const P = this.P;
    const inside = P.items.filter(it => inRects(rects, it.cx, it.cy) && !(isOpening(it) && wallOf(it, this.segs) && wallOf(it, this.segs).outer));
    if (inside.length) {
      const names = [...new Set(inside.map(i => i.name || TYPES[i.type].n))].slice(0, 5).join(', ');
      const r = await choose('Alanın içinde eşya var', `${label} içinde ${inside.length} öğe var: ${names}${inside.length > 5 ? '…' : ''}. Önce bunları kaldırabilir ya da alanla birlikte silebilirsin.`,
        [{v: 'cancel', t: 'Vazgeç'}, {v: 'del', t: 'Eşyalarla birlikte sil', danger: 1}]);
      if (r !== 'del') return false;
    }
    const ids = new Set(inside.map(i => i.id));
    const cover = r => { let a = 0; for (const q of rects) { const w = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x), d = Math.min(r.y + r.d, q.y + q.d) - Math.max(r.y, q.y); if (w > 0 && d > 0) a += w * d; } return a / (r.w * r.d); };
    this.change(() => {
      P.items = P.items.filter(i => !ids.has(i.id));
      P.rooms = P.rooms.filter(r => cover(r) < .6);
      P.walls = P.walls.filter(w => !inRects(rects, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2));
      for (const q of rects) P.voids.push({id: nextId(P, 'v'), x: r3(q.x), y: r3(q.y), w: r3(q.w), d: r3(q.d)});
      reseatOpenings(P);
    });
    this.select(null);
    toast(`${label} dükkândan çıkarıldı · geri almak için ↶`);
    return true;
  },
  eraseAt(x, y) {
    const P = this.P;
    if ((P.voids || []).some(v => x > v.x && x < v.x + v.w && y > v.y && y < v.y + v.d)) return this.restoreVoidAt(x, y);
    const rg = regionAt(P, this.segs, x, y);
    if (!rg) { toast('Burası duvar ya da dükkânın dışı'); return; }
    if (rg.area > shopArea(P) * .8) { toast('Bu alan dükkânın tamamı; silmek için önce Duvar çiz ile bölün', 'err'); return; }
    const room = P.rooms.find(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d);
    this.removeRegion(rg.rects, room ? `“${room.name}”` : 'Seçilen alan');
  },
  cutArea(r) {
    const P = this.P, W = P.shop.w, D = P.shop.d;
    const x0 = clamp(r.x, 0, W), y0 = clamp(r.y, 0, D), x1 = clamp(r.x + r.w, 0, W), y1 = clamp(r.y + r.d, 0, D);
    if (x1 - x0 < .05 || y1 - y0 < .05) { toast('Kesilecek alan dükkânın içinde olmalı'); return; }
    const rect = {x: x0, y: y0, w: x1 - x0, d: y1 - y0};
    if (rect.w * rect.d > shopArea(P) * .8) { toast('Dükkânın neredeyse tamamı kesilemez', 'err'); return; }
    this.removeRegion([rect], 'Kesilen alan');
  },
  restoreVoidAt(x, y) {
    const P = this.P, v = (P.voids || []).find(q => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.d);
    if (!v) { toast(this.tool === 'addarea' ? 'Dükkânı büyütmek için dışarıya doğru sürükle' : 'Burada bina boşluğu yok'); return; }
    this.change(() => { P.voids = P.voids.filter(q => q !== v); reseatOpenings(P); });
    toast('Alan dükkâna geri eklendi');
  },
  /* Dikdörtgeni dükkâna kat: içerideyse boşluklardan düş, dışarıdaysa sınırı büyüt */
  addArea(r) {
    const P = this.P;
    this.change(() => {
      let W = P.shop.w, D = P.shop.d;
      const nx0 = Math.min(0, r.x), ny0 = Math.min(0, r.y), nx1 = Math.max(W, r.x + r.w), ny1 = Math.max(D, r.y + r.d);
      const dx = r3(-nx0), dy = r3(-ny0);
      if (dx || dy) { // her şeyi kaydır
        for (const q of P.rooms) { q.x = r3(q.x + dx); q.y = r3(q.y + dy); }
        for (const q of P.voids) { q.x = r3(q.x + dx); q.y = r3(q.y + dy); }
        for (const q of P.walls) { q.x1 = r3(q.x1 + dx); q.x2 = r3(q.x2 + dx); q.y1 = r3(q.y1 + dy); q.y2 = r3(q.y2 + dy); }
        for (const q of P.items) { q.cx = r3(q.cx + dx); q.cy = r3(q.cy + dy); }
        Plan.V.ox -= dx * Plan.V.s; Plan.V.oy -= dy * Plan.V.s;
      }
      const rr = {x: r.x + dx, y: r.y + dy, w: r.w, d: r.d}, old = {x: dx, y: dy, w: W, d: D};
      const NW = r3(nx1 - nx0), ND = r3(ny1 - ny0);
      let voids = P.voids.flatMap(v => rectMinus(v, [rr]).map(q => Object.assign(q, {id: v.id + (q.x !== v.x || q.y !== v.y ? 'b' : '')})));
      if (NW > W + 1e-6 || ND > D + 1e-6) voids = voids.concat(rectMinus({x: 0, y: 0, w: NW, d: ND}, [old, rr]).map(q => Object.assign(q, {id: nextId(P, 'v')})));
      const seen = new Set(); for (const v of voids) { if (seen.has(v.id)) v.id = nextId(P, 'v'); seen.add(v.id); }
      P.voids = voids; P.shop.w = NW; P.shop.d = ND;
      reseatOpenings(P);
    });
    toast(`Alan eklendi · dükkân ${fmtA(shopArea(P))} m²`);
  },
  setShape(shape) {
    const P = this.P;
    this.change(() => { P.voids = shapeVoids(shape, P.shop.w, P.shop.d); reseatOpenings(P); });
    Plan.fit();
  },

  /* ---------- Seçim komutları ---------- */
  duplicate() {
    if (this.multi.length) {
      const its = this.multiObjs(), B = this.groupBox(its), P = this.P;
      const wB = B.x1 - B.x0, dB = B.y1 - B.y0;
      const [dx, dy] = B.x1 + wB <= P.shop.w ? [wB, 0] : B.y1 + dB <= P.shop.d ? [0, dB] : [.3, .3];
      const copies = its.map(it => Object.assign({}, it, {id: nextId(P, 'i'), cx: r3(it.cx + dx), cy: r3(it.cy + dy)}));
      this.change(() => P.items.push(...copies));
      this.setMulti(copies.map(c => c.id)); toast(`${copies.length} öğe kopyalandı`);
      return;
    }
    const o = this.selObj(); if (!o) return;
    const P = this.P;
    if (this.sel.k === 'void') return;
    if (this.sel.k === 'wall') {
      const horiz = Math.abs(o.y1 - o.y2) < .001, w = Object.assign({}, o, {id: nextId(P, 'w')});
      if (horiz) { w.y1 = w.y2 = r3(o.y1 + .6); } else { w.x1 = w.x2 = r3(o.x1 + .6); }
      this.change(() => P.walls.push(w)); this.select({k: 'wall', id: w.id}); return;
    }
    if (this.sel.k === 'room') {
      const r = Object.assign({}, o, {id: nextId(P, 'r'), name: o.name + ' 2'});
      r.x = r3(o.x + o.w <= P.shop.w - o.w ? o.x + o.w : o.x); r.y = r3(r.x === o.x ? o.y + o.d : o.y);
      this.change(() => P.rooms.push(r)); this.select({k: 'room', id: r.id}); return;
    }
    const it = Object.assign({}, o, {id: nextId(P, 'i')});
    if (isOpening(o)) {
      const s = wallOf(o, this.segs);
      if (s) seatOnWall(it, s, (s.h ? o.cx : o.cy) + o.w + .3);
      else { it.cx += .3; it.cy += .3; }
    } else {
      const [dx, dy] = rotPt(o.w, 0, o.rot); // yanına, bitişik
      it.cx = r3(o.cx + dx); it.cy = r3(o.cy + dy);
    }
    this.change(() => P.items.push(it)); this.select({k: 'item', id: it.id});
  },
  remove() {
    if (this.multi.length) {
      const ids = new Set(this.multi), n = ids.size;
      this.change(() => { this.P.items = this.P.items.filter(i => !ids.has(i.id)); });
      this.select(null); toast(`${n} öğe silindi · geri almak için ↶`); return;
    }
    const o = this.selObj(); if (!o) return;
    const k = this.sel.k;
    this.change(() => {
      if (k === 'room') this.P.rooms = this.P.rooms.filter(r => r !== o);
      else if (k === 'void') { this.P.voids = this.P.voids.filter(r => r !== o); reseatOpenings(this.P); }
      else if (k === 'wall') this.P.walls = this.P.walls.filter(r => r !== o);
      else this.P.items = this.P.items.filter(i => i !== o);
    });
    this.select(null);
    toast(k === 'void' ? 'Alan dükkâna geri eklendi · geri almak için ↶' : `${o.name || (k === 'wall' ? 'Duvar' : 'Öğe')} silindi · geri almak için ↶`);
  },
  rotate(delta = 90) {
    if (this.multi.length) { // grubu merkezi etrafında döndür
      const its = this.multiObjs(), B = this.groupBox(its), cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
      this.change(() => { for (const it of its) { const [x, y] = rotPt(it.cx - cx, it.cy - cy, delta); it.cx = r3(cx + x); it.cy = r3(cy + y); it.rot = normRot(it.rot + delta); } });
      return;
    }
    const o = this.selObj(); if (!o || this.sel.k === 'room' || this.sel.k === 'void') return;
    if (this.sel.k === 'wall') { // orta noktası etrafında 90°
      const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, hl = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) / 2, horiz = Math.abs(o.y1 - o.y2) < .001;
      this.change(() => { if (horiz) { o.x1 = o.x2 = r3(mx); o.y1 = r3(my - hl); o.y2 = r3(my + hl); } else { o.y1 = o.y2 = r3(my); o.x1 = r3(mx - hl); o.x2 = r3(mx + hl); } });
      return;
    }
    if (isOpening(o) && wallOf(o, this.segs)) { this.cycleSwing(); return; }
    this.change(() => { o.rot = normRot(o.rot + delta); });
  },
  /* Kapı açılış yönü: menteşe sağ/sol × bu taraf/öbür taraf */
  cycleSwing() {
    const o = this.selObj(); if (!o) return;
    this.change(() => {
      if (o.type === 'window' || o.style === 'double' || o.style === 'sliding') { o.rot = normRot(o.rot + 180); return; }
      if (!o.flip) o.flip = true; else { o.flip = false; o.rot = normRot(o.rot + 180); }
    });
    Props.render();
  },
  setSwing(rot, flip) { const o = this.selObj(); if (!o) return; this.change(() => { o.rot = rot; o.flip = flip; }); Props.render(); },
  nudge(dx, dy) {
    if (this.multi.length) { const its = this.multiObjs(); this.change(() => { for (const it of its) { it.cx = r3(it.cx + dx); it.cy = r3(it.cy + dy); } }, 'nudge'); return; }
    const o = this.selObj(); if (!o) return;
    this.change(() => {
      if (this.sel.k === 'room' || this.sel.k === 'void') { o.x = r3(o.x + dx); o.y = r3(o.y + dy); }
      else if (this.sel.k === 'wall') { o.x1 = r3(o.x1 + dx); o.x2 = r3(o.x2 + dx); o.y1 = r3(o.y1 + dy); o.y2 = r3(o.y2 + dy); }
      else { o.cx = r3(o.cx + dx); o.cy = r3(o.cy + dy); }
    }, 'nudge');
  },
  openProps(focus) {
    Sheets.open('sheetProps');
    if (focus && !isMobile()) setTimeout(() => { const i = $('#props input[type=text]'); if (i) { i.focus(); i.select(); } }, 30);
  },
  async rename() {
    const n = await askText('Projeyi yeniden adlandır', this.P.name, 'Proje adı');
    if (n == null || !n.trim()) return;
    this.change(() => { this.P.name = n.trim().slice(0, 60); });
    $('#pnameText').textContent = this.P.name; document.title = this.P.name + ' · Eczane Plan';
    Props.render();
  },
};

/* ---------- Mobil alt paneller / masaüstü yan paneller ---------- */
const Sheets = {
  open(id) { if (!isMobile()) return; for (const s of $$('.side')) s.classList.toggle('open', s.id === id); },
  toggle(id) { if (!isMobile()) return; const el = $('#' + id); const o = !el.classList.contains('open'); this.closeAll(); if (o) el.classList.add('open'); },
  closeAll() { for (const s of $$('.side')) s.classList.remove('open'); },
};

/* ---------- Seçim üstü hızlı araç çubuğu ---------- */
const Ctx = {
  place() {
    const bar = $('#ctxbar'); if (!bar) return;
    const o = Ed.selObj();
    const act = Plan.act && ['move', 'resize', 'rotate', 'pinch', 'pan', 'gmove', 'marquee'].includes(Plan.act.type) && Plan.act.moved !== false;
    if (Ed.multi.length && Ed.view === '2d' && !act) {
      const B = Ed.groupBox(Ed.multiObjs());
      const rotBtn = bar.querySelector('[data-act=rotate]'); rotBtn.hidden = false; rotBtn.querySelector('.lbl').textContent = 'Döndür';
      bar.querySelector('[data-act=dup]').hidden = false; bar.querySelector('[data-act=del] .lbl').textContent = 'Sil';
      bar.hidden = false;
      const [x0, y0] = Plan.toS(B.x0, B.y0), [x1, y1] = Plan.toS(B.x1, B.y1), bw = bar.offsetWidth, bh = bar.offsetHeight;
      let top = y0 - bh - 18; if (top < 58) top = y1 + 34;
      if (top + bh > Plan.h - 8) top = Math.max(58, Plan.h - bh - 8);
      bar.style.transform = `translate(${Math.round(clamp((x0 + x1) / 2 - bw / 2, 8, Plan.w - bw - 8))}px,${Math.round(top)}px)`;
      return;
    }
    if (!o || Ed.view !== '2d' || act) { bar.hidden = true; return; }
    const isRoom = Ed.sel.k === 'room' || Ed.sel.k === 'void', isWall = Ed.sel.k === 'wall';
    const rotBtn = bar.querySelector('[data-act=rotate]');
    rotBtn.hidden = isRoom;
    bar.querySelector('[data-act=dup]').hidden = Ed.sel.k === 'void';
    bar.querySelector('[data-act=del] .lbl').textContent = Ed.sel.k === 'void' ? 'Geri ekle' : 'Sil';
    const door = !isRoom && !isWall && isOpening(o) && wallOf(o, Ed.segs);
    rotBtn.querySelector('.lbl').textContent = door ? 'Yönü çevir' : 'Döndür';
    rotBtn.title = door ? 'Açılış yönünü çevir (R)' : '90° döndür (R)';
    bar.hidden = false;
    let box;
    if (isRoom) box = roomBox(o); else if (isWall) box = wallBox(o); else box = polyBox(itemPoly(o));
    const [x0, y0] = Plan.toS(box.x0, box.y0), [x1, y1] = Plan.toS(box.x1, box.y1);
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let top = y0 - bh - 16;
    if (!isRoom && !isWall && Ed.sel && !isRound(o) && !isOpening(o)) top -= 26; // döndürme tutamağı
    if (top < 58) top = y1 + 16;
    if (top + bh > Plan.h - 8) top = Math.max(58, Math.min(Plan.h - bh - 8, (y0 + y1) / 2 - bh / 2));
    const left = clamp((x0 + x1) / 2 - bw / 2, 8, Plan.w - bw - 8);
    bar.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  },
};

/* ---------- Ekle paleti ---------- */
const Palette = {
  render() {
    const root = $('#palette'); root.innerHTML = '';
    for (const g of CATALOG) {
      const sec = document.createElement('div'); sec.className = 'pal-g';
      sec.innerHTML = `<h4>${esc(g.g)}</h4>`;
      const grid = document.createElement('div'); grid.className = 'pal';
      for (const e of g.list) {
        const b = document.createElement('button');
        b.innerHTML = `${palIcon(e.k)}<span class="n">${esc(e.n)}</span><span class="s">${esc(e.sub)}</span>`;
        b.title = e.tool ? 'Plan üzerinde sürükleyerek oda çiz' : 'Tıkla: görünen alanın ortasına ekle · sürükle: plana bırak';
        b.onclick = () => Ed.addFromCatalog(e);
        if (!e.tool) {
          b.draggable = true;
          b.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/x-eczplan', e.k); ev.dataTransfer.effectAllowed = 'copy'; });
        }
        grid.appendChild(b);
      }
      sec.appendChild(grid); root.appendChild(sec);
    }
    const tip = document.createElement('p'); tip.className = 'tip';
    tip.innerHTML = '<b>İpucu:</b> Kapı ve pencereler en yakın duvara kendiliğinden oturur. Dolapları <b>Kopyala</b> ile yan yana dizebilirsin.';
    root.appendChild(tip);
  },
};

/* ---------- DOM yardımcıları ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

/* ---------- Özellikler paneli ---------- */
const Props = {
  syncers: [], liveFns: [],
  render() {
    const root = $('#props'); if (!root || !Ed.P) return;
    this.syncers = []; this.liveFns = [];
    root.innerHTML = '';
    const o = Ed.selObj();
    if (Ed.multi.length) { $('#propsTitle').textContent = `${Ed.multi.length} öğe seçili`; this.multiPanel(root); }
    else if (!o) { $('#propsTitle').textContent = 'Proje'; this.project(root); }
    else if (Ed.sel.k === 'room') { $('#propsTitle').textContent = 'Oda'; this.room(root, o); }
    else if (Ed.sel.k === 'void') { $('#propsTitle').textContent = 'Bina boşluğu'; this.voidPanel(root, o); }
    else if (Ed.sel.k === 'wall') { $('#propsTitle').textContent = 'Duvar'; this.wallPanel(root, o); }
    else { $('#propsTitle').textContent = TYPES[o.type].n + (o.type === 'cabinet' && o.style ? ' · ' + STYLES.cabinet.find(s => s[0] === o.style)[1] : ''); this.item(root, o); }
  },
  sync() { for (const f of this.syncers) f(); for (const f of this.liveFns) f(); },
  refreshLive() { for (const f of this.liveFns) f(); },

  grp(title, ...kids) { return h('div', {class: 'pgrp'}, title ? h('h4', null, title) : null, ...kids); },
  text(label, get, set, key) {
    const inp = h('input', {type: 'text', value: get(), maxlength: 60, enterkeyhint: 'done'});
    inp.addEventListener('input', () => Ed.change(() => set(inp.value), key));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
    this.syncers.push(() => { if (document.activeElement !== inp) inp.value = get(); });
    return h('div', {class: 'pf'}, h('label', null, label), inp);
  },
  /* Sayı alanı: unit 'cm' veya 'm'; değer metre */
  num(label, get, set, {unit = 'cm', step, min = 0.01, max = 100, key} = {}) {
    step = step ?? 0.05;
    const show = v => unit === 'cm' ? String(Math.round(v * 100)) : unit === '°' ? String(Math.round(v)) : fmtM(v);
    const inp = h('input', {type: 'text', inputmode: 'decimal', value: show(get()), 'aria-label': label});
    const apply = v => { if (!isFinite(v)) { inp.value = show(get()); return; } v = clamp(v, min, max); Ed.change(() => set(r3(v)), key); inp.value = show(get()); };
    const parse = () => { const v = parseNum(inp.value); return unit === 'cm' ? v / 100 : v; };
    inp.addEventListener('change', () => apply(parse()));
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { inp.blur(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); apply(get() + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)); }
    });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    const b = (t, d) => h('button', {type: 'button', tabindex: -1, 'aria-label': d > 0 ? 'Artır' : 'Azalt', onclick: () => apply(get() + d * step)}, t);
    this.syncers.push(() => { if (document.activeElement !== inp) inp.value = show(get()); });
    return h('div', {class: 'pf'}, h('label', null, label + (unit ? ` (${unit})` : '')), h('div', {class: 'num'}, b('−', -1), inp, b('+', 1)));
  },
  swatches(colors, get, set) {
    const wrap = h('div', {class: 'swatches'});
    const draw = () => { wrap.innerHTML = ''; for (const c of colors) wrap.append(h('button', {type: 'button', class: c.toLowerCase() === get().toLowerCase() ? 'on' : '', style: `background:${c}`, title: c, onclick: () => { Ed.change(() => set(c)); draw(); }})); };
    draw(); return wrap;
  },
  chips(opts, get, set) {
    const wrap = h('div', {class: 'chips'});
    const draw = () => { wrap.innerHTML = ''; for (const [v, t] of opts) wrap.append(h('button', {type: 'button', class: String(get()) === String(v) ? 'on' : '', onclick: () => { set(v); draw(); }}, t)); };
    draw(); this.syncers.push(draw); return wrap;
  },
  actions(list) {
    return h('div', {class: 'acts'}, list.map(([t, fn, cls, icon]) => h('button', {type: 'button', class: 'btn ' + (cls || ''), onclick: fn, html: (icon || '') + `<span>${esc(t)}</span>`})));
  },

  /* ---- Proje (seçim yok) ---- */
  project(root) {
    const P = Ed.P;
    const areaEl = h('div', {class: 'big-area'});
    const drawArea = () => { areaEl.innerHTML = `<b>${fmtA(shopArea(P))}</b><span>m² dükkân alanı</span>`; };
    drawArea(); this.liveFns.push(drawArea);
    root.append(this.grp('Dükkân',
      this.text('Proje adı', () => P.name, v => { P.name = v.slice(0, 60); $('#pnameText').textContent = P.name || 'Proje'; }, 'pname'),
      this.text('Tabela yazısı (3B cephede)', () => P.sign ?? P.name, v => { P.sign = v.slice(0, 60); }, 'psign'),
      h('p', {class: 'tip', style: 'margin-top:-4px'}, '“Eczanesi” yazmazsan kendisi eklenir. Boş bırakırsan tabela gösterilmez.'),
      h('div', {class: 'prow'},
        this.num('Genişlik', () => P.shop.w, v => { P.shop.w = v; }, {unit: 'm', min: 2, max: 150, key: 'shopw'}),
        this.num('Derinlik', () => P.shop.d, v => { P.shop.d = v; }, {unit: 'm', min: 2, max: 150, key: 'shopd'})),
      h('div', {class: 'prow'},
        this.num('Tavan yüksekliği', () => P.shop.h, v => { P.shop.h = v; for (const it of P.items) if (it.type === 'column') it.h = v; }, {unit: 'm', min: 2.2, max: 6, key: 'shoph'}),
        h('div', {class: 'pf'})),
      areaEl));

    // Odalar
    const list = h('div', {class: 'rlist'});
    const drawRooms = () => {
      list.innerHTML = '';
      if (!P.rooms.length) list.append(h('p', {class: 'tip'}, 'Henüz oda yok. ', h('b', null, 'Oda çiz'), ' aracıyla sürükleyerek ya da Ekle → Oda ile ekle.'));
      for (const r of P.rooms) list.append(h('button', {class: 'ritem', type: 'button', onclick: () => { Ed.select({k: 'room', id: r.id}); Ed.openProps(); }},
        h('i', {style: `background:${r.color}`}), h('span', {class: 't'}, h('b', null, r.name), h('small', null, `${fmtM(r.w)} × ${fmtM(r.d)} m`)), h('span', {class: 'a'}, fmtA(r.w * r.d) + ' m²')));
      const roomsA = P.rooms.reduce((s, r) => s + r.w * r.d, 0);
      if (P.rooms.length) list.append(h('div', {class: 'kv', style: 'margin-top:4px'}, h('span', null, 'Odalar toplamı'), h('b', null, fmtA(roomsA) + ' m²'), h('span', null, 'Satış / açık alan'), h('b', null, fmtA(Math.max(0, shopArea(P) - roomsA)) + ' m²')));
    };
    drawRooms(); this.liveFns.push(drawRooms);
    root.append(this.shapeGroup());
    root.append(this.grp('Zemin', this.floorPicker(() => P.floor, k => { P.floor = k; })));
    root.append(this.grp('Odalar', list));

    // Kontrol
    const iss = h('div', {class: 'issues'});
    const drawIssues = () => {
      iss.innerHTML = '';
      const L = Ed.A.issues;
      if (!L.length) { iss.append(h('div', {class: 'okline', html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>Çakışma yok, geçişler açık'})); return; }
      for (const x of L.slice(0, 30)) iss.append(h('button', {type: 'button', class: 'issue' + (x.w ? ' w' : ''), onclick: () => Ed.select({k: 'item', id: x.id})}, h('i', null, x.w ? '!' : '×'), h('span', null, x.t)));
      if (L.length > 30) iss.append(h('p', {class: 'tip'}, `+${L.length - 30} uyarı daha`));
    };
    drawIssues(); this.liveFns.push(drawIssues);
    root.append(this.grp('Kontrol', iss));

    // Özet
    const kv = h('div', {class: 'kv'});
    const drawSum = () => {
      let cab = 0, cnt = 0, counter = 0, foot = 0;
      for (const it of P.items) {
        if (it.type === 'cabinet') { cnt++; cab += it.w * (it.style === 'gondola' ? 2 : 1); }
        if (it.type === 'counter') counter += it.w;
        if (isSolid(it) && it.type !== 'column') foot += it.w * it.d;
      }
      kv.innerHTML = '';
      kv.append(h('span', null, 'Dolap / raf'), h('b', null, `${cnt} adet`),
        h('span', null, 'Dolap cephesi'), h('b', null, fmtM(cab) + ' m'),
        h('span', null, 'Banko uzunluğu'), h('b', null, fmtM(counter) + ' m'),
        h('span', null, 'Boş zemin (yaklaşık)'), h('b', null, fmtA(Math.max(0, shopArea(P) - foot)) + ' m²'));
    };
    drawSum(); this.liveFns.push(drawSum);
    root.append(this.grp('Özet', kv));
    root.append(this.grp(null, h('p', {class: 'tip', html: '<b>Kullanım:</b> Bir öğeye dokun → seç; sürükle → taşı; köşe tutamaklarıyla boyutlandır. Boş alanda sürükle → planı kaydır, iki parmakla yakınlaştır. Seçiliyken çevresindeki boşluklar cm olarak görünür: <span style="color:var(--danger)">kırmızı</span> geçilemez, <span style="color:var(--warn)">turuncu</span> tek kişi, <span style="color:var(--ok)">yeşil</span> rahat.'})));
  },

  /* ---- Oda ---- */
  room(root, r) {
    const P = Ed.P;
    const area = h('div', {class: 'big-area'});
    const drawA = () => { const n = P.items.filter(it => it.cx > r.x && it.cx < r.x + r.w && it.cy > r.y && it.cy < r.y + r.d).length; area.innerHTML = `<b>${fmtA(r.w * r.d)}</b><span>m² · ${n} öğe</span>`; };
    drawA(); this.liveFns.push(drawA);
    root.append(this.grp(null,
      this.text('Oda adı', () => r.name, v => { r.name = v; }, 'rname:' + r.id),
      area,
      h('div', {class: 'prow'},
        this.num('Genişlik', () => r.w, v => { r.w = v; }, {unit: 'm', min: MIN_ROOM, max: 150, key: 'rw'}),
        this.num('Derinlik', () => r.d, v => { r.d = v; }, {unit: 'm', min: MIN_ROOM, max: 150, key: 'rd'})),
      h('div', {class: 'prow'},
        this.num('Sol kenar (X)', () => r.x, v => { r.x = v; }, {unit: 'm', min: -50, max: 200, key: 'rx'}),
        this.num('Üst kenar (Y)', () => r.y, v => { r.y = v; }, {unit: 'm', min: -50, max: 200, key: 'ry'}))));
    root.append(this.grp('Renk', this.swatches(ROOM_COLORS, () => r.color, c => { r.color = c; })));
    root.append(this.grp('Zemin', this.floorPicker(() => r.floor || '', k => { r.floor = k; }, true)));
    root.append(this.grp(null,
      this.actions([['Kopyala', () => Ed.duplicate(), '', ICONS.dup], ['Sil', () => Ed.remove(), 'danger', ICONS.del], ['Bitti', () => { Ed.select(null); Sheets.closeAll(); }, '', ICONS.ok]]),
      h('p', {class: 'tip'}, 'Odayı taşıyınca içindeki dolap, banko ve kapılar da birlikte taşınır. Kenarlar komşu odalara ve dış duvarlara yapışır.')));
  },

  /* ---- Eşya ---- */
  item(root, it) {
    const T = TYPES[it.type];
    const top = this.grp(null, this.text('Ad', () => it.name, v => { it.name = v; }, 'iname:' + it.id));
    if (STYLES[it.type]) top.append(h('div', {class: 'pf'}, h('label', null, 'Tür'), this.chips(STYLES[it.type], () => it.style, v => {
      Ed.change(() => {
        it.style = v;
        const def = Object.values(CATALOG_BY_KEY).find(e => e.t === it.type && e.s === v);
        if (def) { if (def.label && !it.label) it.label = def.label; if (def.rows && !it.rows) it.rows = def.rows; if (def.upper) it.upper = true; }
        if ((it.type === 'table' && v === 'round') || (it.type === 'zone' && v === 'circle')) { const m = Math.max(it.w, it.d); it.w = it.d = m; }
        if (it.type === 'human') { if (v === 'wheelchair') { it.w = .7; it.d = 1.2; it.h = 1.3; } else { it.w = .6; it.d = .4; it.h = 1.75; } }
        if (it.type === 'door' && v === 'double' && it.w < 1.2) it.w = 1.6;
        if (it.type === 'door' && v !== 'double' && it.w > 1.2) it.w = .9;
      });
      Props.render();
    })));
    root.append(top);

    // Kapı / pencere
    if (isOpening(it)) {
      const onWall = wallOf(it, Ed.segs);
      const g = this.grp(it.type === 'door' ? 'Kapı' : 'Pencere');
      if (!onWall) g.append(h('div', {class: 'issue w'}, h('i', null, '!'), h('span', null, 'Duvar üzerinde değil. Bir duvara sürükle ya da: ')),
        h('button', {class: 'btn', type: 'button', onclick: () => { const s = nearestWall(Ed.segs, it.cx, it.cy, Infinity); if (s) Ed.change(() => { seatOnWall(it, s, s.h ? it.cx : it.cy); }); Props.render(); }}, 'En yakın duvara oturt'));
      g.append(this.num('Genişlik', () => it.w, v => { it.w = v; const s = wallOf(it, Ed.segs); if (s) seatOnWall(it, s, s.h ? it.cx : it.cy); }, {min: .4, max: 6, key: 'ow'}));
      if (it.type === 'door') g.append(this.chips([[.8, '80'], [.9, '90'], [1, '100'], [1.2, '120'], [1.6, '160 çift']], () => it.w, v => {
        Ed.change(() => { it.w = v; if (v >= 1.4 && it.style === 'single') it.style = 'double'; if (v < 1.2 && it.style === 'double') it.style = 'single'; const s = wallOf(it, Ed.segs); if (s) seatOnWall(it, s, s.h ? it.cx : it.cy); });
        Props.render();
      }));
      if (it.type === 'window') g.append(h('div', {class: 'prow'},
        this.num('Denizlik', () => it.elev, v => { it.elev = v; }, {min: 0, max: 3, key: 'wel'}),
        this.num('Yükseklik', () => it.h, v => { it.h = v; }, {min: .2, max: 4, key: 'wh'})));
      else g.append(this.num('Yükseklik', () => it.h, v => { it.h = v; }, {min: 1.8, max: 4, key: 'dh'}));
      if (it.type === 'door' && onWall && it.style !== 'sliding') {
        g.append(h('div', {class: 'pf'}, h('label', null, 'Açılış yönü — doğru görüneni seç'), this.swingPicker(it)));
      } else if (onWall) {
        g.append(h('button', {class: 'btn', type: 'button', onclick: () => Ed.cycleSwing()}, 'Tarafını çevir'));
      }
      root.append(g);
      root.append(this.grp(null, this.actions([['Kopyala', () => Ed.duplicate(), '', ICONS.dup], ['Sil', () => Ed.remove(), 'danger', ICONS.del], ['Bitti', () => { Ed.select(null); Sheets.closeAll(); }, '', ICONS.ok]])));
      return;
    }

    // Ölçüler
    const size = this.grp('Ölçüler');
    if (it.type === 'human') size.append(h('p', {class: 'tip'}, `Gerçek ölçü: ${fmtCm(it.w)} × ${fmtCm(it.d)} cm, boy ${fmtCm(it.h)} cm. Geçitleri ve banko önünü kontrol etmek için sürükle.`));
    else if (isRound(it)) size.append(h('div', {class: 'prow'}, this.num('Çap', () => it.w, v => { it.w = it.d = v; }, {min: .2, max: 10, key: 'dia'}), it.type === 'table' ? this.num('Yükseklik', () => it.h, v => { it.h = v; }, {min: .3, max: 1.2, key: 'ih'}) : h('div', {class: 'pf'})));
    else {
      size.append(h('div', {class: 'prow'},
        this.num(it.type === 'zone' ? 'Genişlik' : 'Genişlik', () => it.w, v => { it.w = v; }, {min: MIN_ITEM, max: 30, key: 'iw'}),
        this.num(it.type === 'zone' ? 'Uzunluk' : 'Derinlik', () => it.d, v => { it.d = v; }, {min: MIN_ITEM, max: 30, key: 'id'})));
      if (it.type !== 'zone' && it.type !== 'column') size.append(h('div', {class: 'prow'}, this.num('Yükseklik', () => it.h, v => { it.h = v; }, {min: .1, max: 4, key: 'ih'}), h('div', {class: 'pf'})));
      if (it.type === 'zone') size.append(this.chips([[.6, '60'], [.9, '90'], [1.2, '120'], [1.5, '150']], () => it.w, v => { Ed.change(() => { it.w = v; }); }));
    }
    root.append(size);
    if (it.type === 'cabinet') { const og = this.cabinetOpts(it); if (og) root.append(og); }

    // Yön
    if (!isRound(it)) {
      const rotG = this.grp('Yön');
      rotG.append(h('div', {class: 'prow'},
        h('button', {class: 'btn', type: 'button', title: '90° sola', onclick: () => Ed.rotate(-90), html: ICONS.rotL}),
        this.num('Açı', () => it.rot, v => { it.rot = normRot(v); }, {unit: '°', step: 15, min: -360, max: 720, key: 'rot'}),
        h('button', {class: 'btn', type: 'button', title: '90° sağa', onclick: () => Ed.rotate(90), html: ICONS.rotR})));
      if (T.front) rotG.append(h('p', {class: 'tip'}, it.type === 'counter' ? 'Mavi kalın çizgi müşteri tarafıdır.' : 'Kalın çizgi ön (kapak) tarafıdır.'));
      root.append(rotG);
    }

    // İnsan boşluğu
    if (T.front) {
      const cg = this.grp('İnsan boşluğu');
      cg.append(h('div', {class: 'prow'},
        this.num(it.type === 'counter' ? 'Müşteri tarafı' : 'Önünde', () => it.clear, v => { it.clear = v; }, {min: 0, max: 5, key: 'clf'}),
        T.back || it.style === 'gondola' ? this.num(it.type === 'counter' ? 'Personel tarafı' : 'Arkasında', () => it.clearB, v => { it.clearB = v; }, {min: 0, max: 5, key: 'clb'}) : h('div', {class: 'pf'})));
      cg.append(h('p', {class: 'tip'}, it.type === 'counter' ? 'Önerilen: müşteri önü ≥ 120 cm, banko arkası ≥ 90 cm.' : it.type === 'table' ? 'Sandalye için ≥ 75 cm önerilir. 0 = gösterme.' : 'Kapak/çekmece açılıp önünde durabilmek için ≥ 90 cm önerilir. 0 = gösterme.'));
      root.append(cg);
    }

    // Renk
    if (it.type !== 'zone' && it.type !== 'column') root.append(this.grp('Renk', this.swatches(it.type === 'human' ? ['#E07A5F', '#3D7DD8', '#3FA66B', '#8E6CC9', '#E9C46A', '#5B6770'] : ITEM_COLORS, () => it.color, c => { it.color = c; })));

    // Konum
    root.append(this.grp('Konum (merkez)', h('div', {class: 'prow'},
      this.num('X', () => it.cx, v => { it.cx = v; }, {unit: 'm', min: -50, max: 200, key: 'icx'}),
      this.num('Y', () => it.cy, v => { it.cy = v; }, {unit: 'm', min: -50, max: 200, key: 'icy'}))));

    root.append(this.grp(null, this.actions([['Kopyala', () => Ed.duplicate(), '', ICONS.dup], ['Sil', () => Ed.remove(), 'danger', ICONS.del], ['Bitti', () => { Ed.select(null); Sheets.closeAll(); }, '', ICONS.ok]])));
  },

  /* Dükkân şekli: hazır şablonlar + boşluklar + araçlar */
  shapeGroup() {
    const P = Ed.P, g = this.grp('Dükkân şekli');
    const row = h('div', {class: 'shapes'});
    for (const [k, t] of SHAPES) row.append(h('button', {type: 'button', class: 'btn', title: t + ' şekli', onclick: async () => {
      if (P.voids.length && !await confirmBox('Şekil değiştirilsin mi?', 'Mevcut bina boşlukları bu şablonla değiştirilecek. Geri almak için ↶ kullanabilirsin.', 'Uygula')) return;
      Ed.setShape(k); Props.render();
    }, html: shapeIcon(k) + `<span>${t}</span>`}));
    g.append(row);
    const tools = h('div', {class: 'acts'});
    for (const [t, tool, icon] of [['Duvar çiz', 'wall', ICONS.wallT], ['Silgi', 'erase', ICONS.eraser], ['Alan ekle', 'addarea', ICONS.addArea]]) tools.append(h('button', {type: 'button', class: 'btn', onclick: () => { Sheets.closeAll(); Ed.setTool(tool); }, html: icon + `<span>${t}</span>`}));
    g.append(tools);
    const live = h('div', {class: 'kv'});
    const draw = () => {
      live.innerHTML = '';
      const va = (P.voids || []).reduce((a, v) => a + v.w * v.d, 0);
      live.append(h('span', null, 'Kullanılabilir alan'), h('b', null, fmtA(shopArea(P)) + ' m²'));
      if (P.voids.length) live.append(h('span', null, `Bina boşluğu (${P.voids.length})`), h('b', null, fmtA(Math.max(0, P.shop.w * P.shop.d - shopArea(P))) + ' m²'));
      if ((P.walls || []).length) live.append(h('span', null, 'Serbest duvar'), h('b', null, P.walls.length + ' adet'));
    };
    draw(); this.liveFns.push(draw);
    g.append(live, h('p', {class: 'tip', html: '<b>Silgi</b> ile odaya ya da duvarla kapanan alana dokun → dükkândan çıkar (L, U şekli). Sürükleyerek köşe/çentik kesebilirsin. <b>Alan ekle</b> ile dışarı doğru sürükleyip dükkânı büyüt. <b>Duvar çiz</b> ile alanı böl.'}));
    return g;
  },
  voidPanel(root, v) {
    root.append(this.grp(null,
      h('p', {class: 'tip'}, 'Bu alan dükkâna dahil değil (bina boşluğu, komşu, ışıklık…). Çevresine dış duvar çizilir; alan hesabına girmez.'),
      h('div', {class: 'prow'}, this.num('Genişlik', () => v.w, x => { v.w = x; }, {unit: 'm', min: .1, max: 200, key: 'vw'}), this.num('Derinlik', () => v.d, x => { v.d = x; }, {unit: 'm', min: .1, max: 200, key: 'vd'})),
      h('div', {class: 'prow'}, this.num('Sol kenar (X)', () => v.x, x => { v.x = x; }, {unit: 'm', min: -50, max: 200, key: 'vx'}), this.num('Üst kenar (Y)', () => v.y, x => { v.y = x; }, {unit: 'm', min: -50, max: 200, key: 'vy'}))));
    root.append(this.grp(null, h('button', {type: 'button', class: 'btn full primary', onclick: () => Ed.remove()}, 'Dükkâna geri ekle'),
      h('button', {type: 'button', class: 'btn full', style: 'margin-top:6px', onclick: () => { Ed.select(null); Sheets.closeAll(); }}, 'Bitti')));
  },
  wallPanel(root, w) {
    const horiz = () => Math.abs(w.y1 - w.y2) < .001;
    const len = () => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    root.append(this.grp(null,
      this.num('Uzunluk', len, L => { if (horiz()) w.x2 = r3(w.x1 + Math.sign(w.x2 - w.x1 || 1) * L); else w.y2 = r3(w.y1 + Math.sign(w.y2 - w.y1 || 1) * L); }, {min: .1, max: 100, key: 'wl'}),
      h('div', {class: 'pf'}, h('label', null, 'Kalınlık (cm)'), this.chips([[.1, '10'], [.15, '15'], [.2, '20'], [.25, '25']], () => w.t, t => { Ed.change(() => { w.t = t; }); Settings.set('wallT', t); })),
      h('p', {class: 'tip'}, `${horiz() ? 'Yatay' : 'Dikey'} duvar. Uçlarındaki tutamaçlarla uzat/kısalt, gövdesinden sürükleyerek taşı. Kapı ve pencereler bu duvara da oturur.`)));
    root.append(this.grp(null, this.actions([['Döndür', () => Ed.rotate(90), '', ICONS.rotR], ['Kopyala', () => Ed.duplicate(), '', ICONS.dup], ['Sil', () => Ed.remove(), 'danger', ICONS.del]])));
  },
  /* Çoklu seçim paneli: hizala, dağıt, döndür, kopyala, sil */
  multiPanel(root) {
    const its = Ed.multiObjs();
    const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${d}</svg>`;
    const AL = [
      ['l', 'Sola hizala', ic('<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>')],
      ['cx', 'Yatay ortala', ic('<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>')],
      ['r', 'Sağa hizala', ic('<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>')],
      ['t', 'Üste hizala', ic('<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>')],
      ['cy', 'Dikey ortala', ic('<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>')],
      ['b', 'Alta hizala', ic('<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>')],
      ['dh', 'Yatay eşit aralık', ic('<path d="M3 4v16M21 4v16"/><rect x="7" y="8" width="3" height="8" rx="1"/><rect x="14" y="8" width="3" height="8" rx="1"/>')],
      ['dv', 'Dikey eşit aralık', ic('<path d="M4 3h16M4 21h16"/><rect x="8" y="7" width="8" height="3" rx="1"/><rect x="8" y="14" width="8" height="3" rx="1"/>')],
    ];
    const grid = h('div', {class: 'aligns'});
    for (const [k, t, svg] of AL) grid.append(h('button', {type: 'button', class: 'btn', title: t, 'aria-label': t, onclick: () => Ed.align(k), html: svg}));
    root.append(this.grp('Hizala ve dağıt', grid));
    const B = Ed.groupBox(its);
    root.append(this.grp('Seçim', h('div', {class: 'kv'}, h('span', null, 'Öğe sayısı'), h('b', null, String(its.length)), h('span', null, 'Kapladığı alan'), h('b', null, `${fmtCm(B.x1 - B.x0)} × ${fmtCm(B.y1 - B.y0)} cm`)),
      h('p', {class: 'tip'}, 'Seçili öğelerden birini sürükleyince hepsi birlikte taşınır. Oklarla 5 cm (Shift ile 1 cm) kaydır. Ctrl/Shift + tıkla ile ekle/çıkar, Ctrl + boş alanda sürükle ile alan seç.')));
    root.append(this.grp(null, this.actions([['Döndür', () => Ed.rotate(90), '', ICONS.rotR], ['Kopyala', () => Ed.duplicate(), '', ICONS.dup], ['Sil', () => Ed.remove(), 'danger', ICONS.del]]),
      h('button', {type: 'button', class: 'btn full', style: 'margin-top:6px', onclick: () => { Ed.select(null); Sheets.closeAll(); }}, 'Seçimi kaldır')));
  },
  /* Dolap türüne göre ayarlar: çekmece sayısı, raf sayısı, başlık, üst dolap */
  cabinetOpts(it) {
    const st = it.style;
    const cnt = (label, get, set, min, max, autoFn) => {
      const wrap = h('div', {class: 'pf'});
      const val = h('input', {type: 'text', inputmode: 'numeric', 'aria-label': label});
      const show = () => { const v = get(); val.value = v ? String(v) : String(autoFn()); val.style.opacity = v ? 1 : .55; };
      const apply = v => { if (!isFinite(v)) return show(); Ed.change(() => set(clamp(Math.round(v), min, max)), 'cnt:' + label); show(); };
      val.addEventListener('change', () => apply(parseNum(val.value)));
      val.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') val.blur(); });
      const b = (t, d) => h('button', {type: 'button', tabindex: -1, onclick: () => apply((get() || autoFn()) + d)}, t);
      show(); this.syncers.push(() => { if (document.activeElement !== val) show(); });
      wrap.append(h('label', null, label), h('div', {class: 'num'}, b('−', -1), val, b('+', 1)));
      return wrap;
    };
    const g = this.grp(st === 'drawer' || st === 'kitchen' ? 'Çekmeceler' : 'Raflar');
    if (st === 'drawer') {
      g.append(h('div', {class: 'prow'},
        cnt('Çekmece sırası (alt alta)', () => it.rows, v => { it.rows = v; }, 1, 12, () => cabAuto(it).rows),
        cnt('Yan yana', () => it.cols, v => { it.cols = v; }, 1, 8, () => cabAuto(it).cols)));
      g.append(h('div', {class: 'prow'},
        this.num('Çekmece bölümü yüksekliği', () => it.split || cabAuto(it).lowH, v => { it.split = v; }, {min: .3, max: 3, key: 'split'}),
        h('div', {class: 'pf'})));
      g.append(h('p', {class: 'tip'}, `Toplam ${(it.rows || cabAuto(it).rows) * (it.cols || cabAuto(it).cols)} çekmece. Çekmece bölümü dolap boyuna eşitse üst raf olmaz.`));
    } else if (st === 'kitchen') {
      g.append(h('div', {class: 'prow'}, cnt('Çekmece sayısı', () => it.rows, v => { it.rows = v; }, 0, 6, () => 3), h('div', {class: 'pf'})));
      const up = h('input', {type: 'checkbox'}); up.checked = !!it.upper;
      up.onchange = () => Ed.change(() => { it.upper = up.checked; });
      g.append(h('label', {class: 'switch'}, up, h('span', null, 'Üst dolaplar', h('small', null, 'Tezgâhın üstünde duvar dolabı'))));
    } else if (['open', 'otc', 'cosmetic', 'metal', 'gondola', 'glass'].includes(st)) {
      g.append(h('div', {class: 'prow'}, cnt('Raf sayısı', () => it.rows, v => { it.rows = v; }, 1, 10, () => cabAuto(it).shelves), h('div', {class: 'pf'})));
    } else if (st === 'wstand') {
      g.querySelector('h4').textContent = 'Afiş';
      g.append(h('button', {type: 'button', class: 'btn full', onclick: () => { if (Ed.change(() => Ed.placeAtWindow(it, it.cx, it.cy))) toast('Stand en yakın camın önüne alındı'); else toast('Planda pencere / vitrin camı yok'); }}, 'En yakın camın önüne yerleştir'));
    } else return null;
    if (st === 'otc' || st === 'cosmetic' || st === 'wstand') g.append(this.text(st === 'wstand' ? 'Afiş yazısı (cama bakar)' : 'Işıklı başlık yazısı', () => it.label, v => { it.label = v.slice(0, 24); }, 'lbl:' + it.id));
    return g;
  },
  /* Zemin seçici: tüm kaplamalar önizlemeli */
  floorPicker(get, set, inherit) {
    const wrap = h('div', {class: 'floors'});
    const draw = () => {
      wrap.innerHTML = '';
      const opts = inherit ? [{k: '', n: 'Dükkânla aynı'}, ...FLOORS] : FLOORS;
      for (const f of opts) {
        const img = f.k ? h('img', {src: floorThumb(f.k), alt: ''}) : h('span', {class: 'inh'}, '=');
        wrap.append(h('button', {type: 'button', class: get() === f.k ? 'on' : '', title: f.n, onclick: () => { Ed.change(() => set(f.k)); draw(); }}, img, h('small', null, f.n)));
      }
    };
    draw(); return wrap;
  },
  /* Dört küçük plan çizimi: menteşe × açılış tarafı */
  swingPicker(it) {
    const base = quarter(it.rot) % 2 === 0 ? 0 : 90;
    const opts = [[base, false], [base, true], [base + 180, false], [base + 180, true]];
    const wrap = h('div', {class: 'swing'});
    for (const [rot, flip] of opts) {
      const on = Math.abs(normRot(rot) - normRot(it.rot)) < 1 && !!flip === !!it.flip;
      const fake = {cx: 0, cy: 0, w: 1, d: .12, rot: normRot(rot), flip, style: it.style};
      const S = (lx, ly) => { const [x, y] = toWorld(fake, lx, ly); return [(x * 26 + 32).toFixed(1), (y * 26 + 32).toFixed(1)]; };
      const y = .06;
      const wallA = S(-1.2, 0), wallB = S(-.5, 0), wallC = S(.5, 0), wallD = S(1.2, 0);
      const leaves = it.style === 'double' ? [[-.5, .5, 1], [.5, .5, -1]] : [[flip ? .5 : -.5, 1, flip ? -1 : 1]];
      let path = '';
      for (const [hx, L, dir] of leaves) {
        const arc = [];
        for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 * (1 - i / 10); arc.push(S(hx + dir * Math.cos(a) * L, y + Math.sin(a) * L).join(',')); }
        path += `<path d="M${S(hx, y)} L${S(hx, y + L)}" stroke-width="2.6"/><polyline points="${arc.join(' ')}" stroke-dasharray="3 2"/>`;
      }
      const svg = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M${wallA} L${wallB} M${wallC} L${wallD}" stroke-width="5" stroke="var(--plan-wall)"/>${path}</svg>`;
      wrap.append(h('button', {type: 'button', class: on ? 'on' : '', title: 'Bu yönü seç', onclick: () => Ed.setSwing(normRot(rot), flip), html: svg}));
    }
    return wrap;
  },
};

const ICONS = {
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>',
  rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 102.3-5.6"/><path d="M4 4v5h5"/></svg>',
  rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  kroki: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 9h6v8H9zM12 9v4h3"/></svg>',
  wallT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18M3 15h18M7 9v6M12 9v6M17 9v6"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 4l6 6-9 9H6l-3-3z"/><path d="M9 9l6 6M6 19h14"/></svg>',
  addArea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h10v6h6v10H4z"/><path d="M17 3v6M14 6h6" stroke-width="2.2"/></svg>',
  png: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  json: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v12m0 0l-5-5m5 5l5-5"/><path d="M4 18v2h16v-2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.3M8.2 13.2l7.6 4.3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.1-1.5 2.2M12 17h.01"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
};
