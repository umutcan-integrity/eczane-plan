/* =====================================================================
   Kolay kullanım: genel bileşenler, bölme kartı, adım adım sihirbaz
   ===================================================================== */
const Wg = {
  step(label, val, onSet, min, max, o = {}) {
    const mk = d => h('button', {type: 'button', 'aria-label': d < 0 ? 'azalt' : 'artır', disabled: d < 0 ? val <= min : val >= max, onclick: () => { const x = clamp(val + d, min, max); if (x !== val) onSet(x); }}, d < 0 ? '−' : '+');
    return h('div', {class: 'lblrow'}, h('span', null, label), h('div', {class: 'step' + (o.big ? ' big' : '')}, mk(-1), h('b', null, o.fmt ? o.fmt(val) : val), mk(1)));
  },
  tiles(opts, cur, onPick, o = {}) {
    return h('div', {class: 'tiles' + (o.cls ? ' ' + o.cls : '')}, opts.map(([v, t, ic, desc, badge]) => h('button', {type: 'button', class: String(cur) === String(v) ? 'on' : '', onclick: () => onPick(v)},
      ic ? (typeof ic === 'string' ? pic(ic) : ic) : null, h('b', null, t), desc ? h('small', null, desc) : null, badge ? h('em', null, badge) : null)));
  },
  chips(opts, cur, onPick) {
    return h('div', {class: 'chips'}, opts.map(([v, t]) => h('button', {type: 'button', class: String(cur) === String(v) ? 'on' : '', onclick: () => onPick(v)}, t)));
  },
  num(label, val, onVal, o = {}) {
    const inp = h('input', {class: 'inp' + (o.big ? ' big' : ''), inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', value: (o.empty && !val) ? '' : fmt(val, 2), placeholder: o.ph || ''});
    const ok = x => isFinite(x) && x >= (o.min ?? 0) && x <= (o.max ?? 1e5);
    inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      if (o.empty && raw === '') { inp.classList.remove('bad'); onVal(0, true); return; }
      const x = evalNum(raw);
      if (!ok(x)) { inp.classList.add('bad'); onVal(null, false); return; }
      inp.classList.remove('bad'); onVal(x, true);
    });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    inp.addEventListener('change', () => { if (!inp.classList.contains('bad')) { const x = evalNum(inp.value); if (isFinite(x)) inp.value = fmt(x, 2); } });
    const lab = h('label', {class: 'fld'}, label ? h('span', null, label) : null, h('div', {class: 'inpw'}, inp, h('i', null, o.unit ?? 'mm')), o.hint ? h('small', null, o.hint) : null);
    lab.inp = inp;
    return lab;
  },
};

/* ---------- bölme içeriği ---------- */
const CONTENT_IC = {
  shelf: '<rect x="5" y="2" width="30" height="30" rx="1"/><path d="M5 11h30M5 18h30M5 25h30" stroke-width="2.2"/>',
  drw: '<rect x="5" y="2" width="30" height="30" rx="1"/><path d="M5 12h30M5 22h30"/><path d="M17 7h6M17 17h6M17 27h6" stroke-width="2.4"/>',
  mix: '<rect x="5" y="2" width="30" height="30" rx="1"/><path d="M5 9h30M5 16h30" stroke-width="2.2"/><path d="M5 23h30"/><path d="M17 20h6M17 28h6" stroke-width="2.4"/>',
  hang: '<rect x="5" y="2" width="30" height="30" rx="1"/><path d="M5 8h30" stroke-width="2.2"/><path d="M8 12h24" stroke-width="2.4"/><path d="M20 12v3l-7 6h14l-7-6"/>',
  empty: '<rect x="5" y="2" width="30" height="30" rx="1"/>',
};
const CONTENT = [['shelf', 'Raf', CONTENT_IC.shelf], ['drw', 'Çekmece', CONTENT_IC.drw], ['mix', 'Çekmece + raf', CONTENT_IC.mix], ['hang', 'Askı', CONTENT_IC.hang], ['empty', 'Boş', CONTENT_IC.empty]];
const contentOf = s => s.hanger ? 'hang' : s.drawers > 0 ? (s.drawerH > 0 ? 'mix' : 'drw') : s.shelves > 0 ? 'shelf' : 'empty';
function setContent(s, k) {
  const sh = !s.hanger && s.shelves > 0 ? s.shelves : 0;
  if (k === 'shelf') Object.assign(s, {hanger: false, drawers: 0, drawerH: 0, shelves: sh || 2});
  if (k === 'drw') Object.assign(s, {hanger: false, drawers: s.drawers > 0 ? s.drawers : 3, drawerH: 0});
  if (k === 'mix') Object.assign(s, {hanger: false, drawers: s.drawers > 0 ? Math.min(s.drawers, 3) : 2, drawerH: s.drawerH > 0 ? s.drawerH : 180, shelves: sh || 2});
  if (k === 'hang') Object.assign(s, {hanger: true, drawers: 0, drawerH: 0, shelves: 1});
  if (k === 'empty') Object.assign(s, {hanger: false, drawers: 0, drawerH: 0, shelves: 0});
}
/* act: {set(fn) → değiştir + yeniden çiz, soft(fn, key) → değiştir, sadece önizleme/özet} */
function secCard(s, i, n, R, act) {
  const k = contentOf(s), SI = R && R.secs[i], w = R && R.dims ? R.dims.widths[i] : 0;
  const body = [];
  body.push(Wg.tiles(CONTENT, k, v => act.set(q => setContent(q, v)), {cls: 'sm'}));
  if (k === 'shelf') body.push(Wg.step('Raf sayısı', s.shelves, x => act.set(q => { q.shelves = x; }), 1, 20, {big: true}));
  if (k === 'drw') body.push(Wg.step('Çekmece sayısı', s.drawers, x => act.set(q => { q.drawers = x; }), 1, 8, {big: true}));
  if (k === 'mix') {
    body.push(Wg.step('Çekmece sayısı (altta)', s.drawers, x => act.set(q => { q.drawers = x; }), 1, 6, {big: true}));
    body.push(Wg.num('Her çekmecenin ön yüksekliği', s.drawerH, (x, ok) => { if (ok && x >= 60) act.soft(q => { q.drawerH = x; }, 'dh' + i); }, {min: 60, max: 800, hint: 'Genelde 150–250 mm'}));
    body.push(Wg.step('Raf sayısı (üstte)', s.shelves, x => act.set(q => { q.shelves = x; }), 0, 15, {big: true}));
  }
  if (k === 'hang') body.push(h('label', {class: 'chk big'}, h('input', {type: 'checkbox', checked: s.shelves > 0, onchange: e => act.set(q => { q.shelves = e.target.checked ? 1 : 0; })}), 'Askının üstünde şapkalık raf olsun'));
  if (k !== 'drw') {
    body.push(h('div', {class: 'fld'}, h('span', null, 'Kapak'), Wg.chips([['auto', 'Otomatik'], ['1', 'Tek kapak'], ['2', 'Çift kapak'], ['none', 'Kapaksız']], s.door, v => act.set(q => { q.door = v; }))));
    if (SI && SI.doors === 1) body.push(h('div', {class: 'fld'}, h('span', null, 'Kapak hangi taraftan açılsın? (menteşe)'), Wg.chips([['L', 'Soldan'], ['R', 'Sağdan']], s.hinge, v => act.set(q => { q.hinge = v; }))));
  }
  if (s.shelves > 0 && k !== 'hang') body.push(h('div', {class: 'fld'}, h('span', null, 'Raflar'), Wg.chips([['adj', 'Hareketli (pimli)'], ['fixed', 'Sabit']], s.shelfType, v => act.set(q => { q.shelfType = v; }))));
  if (n > 1) body.push(Wg.num('Bölme genişliği (boş bırak = otomatik)', s.w, (x, ok) => { if (ok) act.soft(q => { q.w = x; }, 'w' + i); }, {empty: true, min: 0, max: 6000, ph: w ? `otomatik · ${fmt(w)}` : 'otomatik'}));
  return h('div', {class: 'sec'},
    h('div', {class: 'sec-h'}, h('b', null, n > 1 ? `${i + 1}. bölme` : 'Dolabın içi'), h('small', null, w ? `iç genişlik ${fmt(w)} mm` : ''), act.del && n > 1 ? h('button', {class: 'icon-btn sm', type: 'button', title: 'Bölmeyi sil', onclick: act.del}, icon(IC.trash)) : null),
    body);
}
/* bölme sayısı resimleri */
function secsPic(n) {
  let d = '<rect x="4" y="2" width="32" height="30" rx="1"/>';
  for (let i = 1; i < n; i++) { const x = 4 + 32 * i / n; d += `<path d="M${x} 2v30" stroke-width="2.2"/>`; }
  return d;
}
const suggestSecs = W => W <= 650 ? 1 : W <= 1100 ? 2 : W <= 1600 ? 3 : 4;

/* ---------- sihirbaz ---------- */
const Wiz = {
  d: null, mats: null, mode: 'new', i: 0, seen: 0, bad: new Set(), id: null,
  STEPS: [
    {k: 'type', t: 'Tip', q: 'Ne tür bir dolap yapıyorsun?', p: 'Birini seç; hepsi sonradan değiştirilebilir.'},
    {k: 'dims', t: 'Ölçü', q: 'Dolabın dış ölçüleri', p: 'Milimetre (mm) olarak gir. Yükseklik ayak / baza dahil toplam yüksekliktir.'},
    {k: 'secs', t: 'Bölme', q: 'Kaç bölme olsun?', p: 'Bölmeler arasına ara dikme konur.'},
    {k: 'inside', t: 'İç', q: 'Bölmelerin içinde ne olsun?', p: 'Raf, çekmece, askı… Sayısını + / − ile ayarla.'},
    {k: 'door', t: 'Kapak', q: 'Kapak olsun mu?', p: 'Otomatik: bölme 600 mm’den genişse çift, değilse tek kapak.'},
    {k: 'base', t: 'Alt', q: 'Dolabın altı nasıl olsun?', p: 'Ayak, baza ya da duvara asma.'},
    {k: 'mat', t: 'Malzeme', q: 'Malzeme ve renk', p: 'Gövde kalınlığı, arkalık ve renkler.'},
    {k: 'end', t: 'Bitir', q: 'Son kontrol', p: 'Adını ve adedini yaz, özeti kontrol et.'},
  ],
  open(mode = 'new', cab) {
    this.mode = mode; this.bad = new Set(); this.mats = clone(A.job.mats);
    if (mode === 'edit' && cab) { this.d = clone(cab); this.id = cab.id; this.i = 1; this.seen = this.STEPS.length - 1; }
    else { this.d = this.fromPreset('base'); this.id = null; this.i = 0; this.seen = 0; }
    $('#wiz').hidden = false; document.body.classList.add('wiz-on');
    this.render();
  },
  fromPreset(k) {
    const c = newCab(k, A.job), cur = A.cab;
    if (cur) for (const key of ['t', 'backT', 'frontT', 'drawerT', 'bandBody', 'bandFront', 'bandDrawer', 'deduct', 'overlay', 'gap', 'edge', 'railGap', 'railType', 'back', 'grooveD', 'grooveO', 'backTol']) c[key] = cur[key];
    return c;
  },
  async close(ask = true) {
    if (ask && (this.mode === 'edit' || this.seen > 0) && !await Modal.confirm(this.mode === 'edit' ? 'Değişiklikler kaydedilmeden çıkılsın mı?' : 'Dolap oluşturmaktan vazgeçilsin mi?', 'Çık', true)) return;
    $('#wiz').hidden = true; document.body.classList.remove('wiz-on');
  },
  go(i) { if (i < 0 || i >= this.STEPS.length || i > this.seen + (this.canNext() ? 1 : 0)) return; this.i = i; this.seen = Math.max(this.seen, i); this.render(); $('#wiz .wiz-body').scrollTop = 0; },
  canNext() { return !(this.STEPS[this.i].k === 'dims' && this.bad.size); },
  next() { if (!this.canNext()) { toast('Ölçüleri kontrol et', 'err'); return; } if (this.i === this.STEPS.length - 1) this.finish(); else this.go(this.i + 1); },
  finish() {
    const d = normalizeCab(this.d), mats = this.mats;
    if (this.mode === 'edit') {
      A.change(() => { const k = A.job.cabs.findIndex(c => c.id === this.id); if (k >= 0) A.job.cabs[k] = d; else A.job.cabs.push(d); A.job.cur = d.id; A.job.mats = mats; A.sel = null; }, {full: true, fit: true});
      toast('Dolap güncellendi');
    } else {
      A.change(() => { A.job.cabs.push(d); A.job.cur = d.id; A.job.mats = mats; A.sel = null; }, {full: true, fit: true});
      toast(`${d.name} oluşturuldu`);
    }
    this.close(false);
    A.show(A.mobile() ? '3d' : '3d');
  },
  calc() { return calcCab(normalizeCab(this.d)); },
  preview() {
    const box = $('#wiz .wiz-pv'); if (!box) return;
    const c = normalizeCab(this.d), R = calcCab(c);
    box.innerHTML = '';
    if (R.parts.length) box.append(frontSVG(c, R, {theme: true}));
    const info = [`${fmt(c.W)} × ${fmt(c.H)} × ${fmt(c.D)} mm`];
    const sh = R.parts.filter(p => p.kind === 'shelf').length, dr = R.parts.filter(p => p.kind === 'dfront').length, dd = R.parts.filter(p => p.kind === 'door').length;
    if (sh) info.push(`${sh} raf`); if (dr) info.push(`${dr} çekmece`); if (dd) info.push(`${dd} kapak`);
    box.append(h('div', {class: 'pv-info'}, info.join(' · ')));
    const errs = R.warn.filter(w => w.lvl === 'err');
    if (errs.length) box.append(h('div', {class: 'iss'}, errs[0].t));
    /* bölme kartlarındaki genişlik ipuçları */
    $$('#wiz .sec').forEach((el, i) => { const w = R.dims && R.dims.widths[i], sm = el.querySelector('.sec-h small'); if (sm) sm.textContent = w ? `iç genişlik ${fmt(w)} mm` : ''; });
  },
  render() {
    const root = $('#wiz'), st = this.STEPS[this.i], d = this.d, last = this.i === this.STEPS.length - 1;
    root.innerHTML = '';
    const steps = h('div', {class: 'wiz-steps'}, this.STEPS.map((s, i) => h('button', {type: 'button', class: (i === this.i ? 'on' : '') + (i < this.i || (i <= this.seen && i !== this.i) ? ' done' : ''), disabled: i > this.seen + (this.canNext() && i === this.i + 1 ? 1 : 0), onclick: () => this.go(i)}, h('i', null, i + 1), h('span', null, s.t))));
    const main = h('div', {class: 'wiz-main'}, this['s_' + st.k]());
    root.append(h('div', {class: 'wiz-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.mode === 'edit' ? 'Dolabı düzenle' : 'Yeni dolap'},
      h('div', {class: 'wiz-head'}, h('div', null, h('b', null, this.mode === 'edit' ? 'Dolabı düzenle' : 'Yeni dolap'), h('small', null, `Adım ${this.i + 1} / ${this.STEPS.length}`)),
        h('button', {class: 'icon-btn', type: 'button', 'aria-label': 'Kapat', onclick: () => this.close()}, icon(IC.x))),
      steps,
      h('div', {class: 'wiz-body'},
        h('div', {class: 'wiz-q'}, h('h2', null, st.q), h('p', null, st.p)),
        h('div', {class: 'wiz-cols'}, main, st.k === 'type' ? null : h('div', {class: 'wiz-pv'}))),
      h('div', {class: 'wiz-foot'},
        h('button', {class: 'btn big', type: 'button', disabled: this.i === 0, onclick: () => this.go(this.i - 1)}, '‹ Geri'),
        h('div', {class: 'grow'}),
        this.mode === 'edit' && !last ? h('button', {class: 'btn big ghost', type: 'button', onclick: () => this.finish()}, 'Kaydet ve çık') : null,
        h('button', {class: 'btn big primary', type: 'button', onclick: () => this.next()}, last ? (this.mode === 'edit' ? 'Kaydet' : 'Dolabı oluştur ✓') : 'İleri ›'))));
    this.preview();
    const f = root.querySelector('.wiz-main input.inp'); if (f && !A.mobile()) setTimeout(() => f.focus(), 30);
  },

  /* ---------- adımlar ---------- */
  s_type() {
    const cur = this.d._preset || (this.mode === 'edit' ? null : 'base');
    return h('div', {class: 'tiles big'}, PRESETS.map(p => {
      const c = newCab(p.k), R = calcCab(c);
      return h('button', {type: 'button', class: cur === p.k ? 'on' : '', onclick: () => {
        const keep = this.mode === 'edit' ? {id: this.d.id, qty: this.d.qty} : {};
        this.d = Object.assign(this.fromPreset(p.k), keep, {_preset: p.k}); this.bad.clear();
        this.seen = Math.max(this.seen, 1); this.go(1);
      }}, frontSVG(c, R, {mini: true}), h('b', null, p.n), h('small', null, p.d));
    }));
  },
  s_dims() {
    const d = this.d;
    const field = (key, label, min, max, sugg) => {
      const f = Wg.num(label, d[key], (x, ok) => { if (ok) { d[key] = x; this.bad.delete(key); } else this.bad.add(key); this.preview(); this.footState(); }, {min, max, big: true});
      const chips = h('div', {class: 'chips sugg'}, sugg.map(v => h('button', {type: 'button', onclick: () => { d[key] = v; f.inp.value = v; f.inp.classList.remove('bad'); this.bad.delete(key); this.preview(); this.footState(); }}, v)));
      return h('div', {class: 'dimf'}, f, chips);
    };
    const wall = d.base === 'wall', tall = d.H > 1200;
    return [
      field('W', 'Genişlik', 100, 6000, [400, 450, 500, 600, 800, 900, 1000, 1200]),
      field('H', 'Yükseklik', 100, 4000, wall ? [360, 600, 720, 900] : tall ? [1800, 2000, 2100, 2200, 2400] : [720, 820, 870, 900, 2100]),
      field('D', 'Derinlik', 100, 1500, wall ? [300, 320, 350] : [300, 400, 450, 560, 580, 600]),
    ];
  },
  footState() { const b = $('#wiz .wiz-foot .btn.primary'); if (b) b.disabled = !this.canNext(); },
  s_secs() {
    const d = this.d, n = d.sections.length, sug = suggestSecs(d.W);
    const setN = k => {
      const cur = d.sections;
      if (k > cur.length) for (let i = cur.length; i < k; i++) cur.push(Object.assign({}, cur[cur.length - 1], {w: 0, hinge: i === k - 1 ? 'R' : 'L'}));
      else cur.length = k;
      cur.forEach(s => { s.w = 0; });
      this.render();
    };
    return [
      Wg.tiles([1, 2, 3, 4].map(k => [k, k === 1 ? 'Tek bölme' : `${k} bölme`, secsPic(k), k === 1 ? 'Ara dikme yok' : `${k - 1} ara dikme`, k === sug ? 'önerilen' : null]), n, setN, {cls: 'big4'}),
      n > 4 ? h('p', {class: 'tip'}, `Şu an ${n} bölme var.`) : null,
      h('p', {class: 'tip'}, 'Bölme genişlikleri otomatik eşit bölünür; istersen bir sonraki adımda elle girebilirsin.'),
    ];
  },
  s_inside() {
    const d = this.d, R = this.calc();
    return h('div', {class: 'secs'}, d.sections.map((s, i) => secCard(s, i, d.sections.length, R, {
      set: fn => { fn(d.sections[i]); this.render(); },
      soft: fn => { fn(d.sections[i]); this.preview(); },
    })));
  },
  s_door() {
    const d = this.d, R = this.calc();
    const any = d.sections.some(s => contentOf(s) !== 'drw' && s.door !== 'none');
    const allDrw = d.sections.every(s => contentOf(s) === 'drw');
    if (allDrw) return h('p', {class: 'tip big'}, 'Tüm bölmeler çekmeceli; kapak gerekmez. Çekmece önleri kapak malzemesinden kesilir.');
    const out = [Wg.tiles([['yes', 'Kapaklı', '<rect x="5" y="2" width="30" height="30" rx="1"/><path d="M20 2v30"/><path d="M16 14v6M24 14v6" stroke-width="2.4"/>', 'Otomatik tek / çift'], ['no', 'Kapaksız', CONTENT_IC.shelf, 'Açık raf']], any ? 'yes' : 'no', v => { for (const s of d.sections) if (contentOf(s) !== 'drw') s.door = v === 'yes' ? 'auto' : 'none'; this.render(); }, {cls: 'big2'})];
    if (any) {
      if (d.sections.length > 1) d.sections.forEach((s, i) => { if (contentOf(s) === 'drw') return; out.push(h('div', {class: 'fld'}, h('span', null, `${i + 1}. bölme kapağı`), Wg.chips([['auto', 'Otomatik'], ['1', 'Tek'], ['2', 'Çift'], ['none', 'Yok']], s.door, v => { s.door = v; this.render(); }))); });
      d.sections.forEach((s, i) => { const SI = R.secs[i]; if (SI && SI.doors === 1) out.push(h('div', {class: 'fld'}, h('span', null, d.sections.length > 1 ? `${i + 1}. bölme kapağı hangi taraftan açılsın?` : 'Kapak hangi taraftan açılsın?'), Wg.chips([['L', 'Soldan'], ['R', 'Sağdan']], s.hinge, v => { s.hinge = v; this.render(); }))); });
      out.push(h('div', {class: 'fld'}, h('span', null, 'Kapak gövdeye nasıl oturacak?'), Wg.chips([['full', 'Gövdeyi örter (bindirme)'], ['inset', 'Gövdenin içinde (gömme)']], d.overlay === 'inset' ? 'inset' : 'full', v => { d.overlay = v; this.render(); })));
    }
    return out;
  },
  s_base() {
    const d = this.d;
    const out = [Wg.tiles([['legs', 'Ayaklı', BASE_IC.legs, 'Ayar ayağı + önde baza (mutfak)'], ['plinth', 'Bazalı', BASE_IC.plinth, 'Yanlar yere iner, önde baza'], ['none', 'Düz', BASE_IC.none, 'Yere direkt oturur'], ['wall', 'Duvara asılı', BASE_IC.wall, 'Üst dolap']], d.base === 'frame' ? 'plinth' : d.base, v => { d.base = v; if (v === 'wall' && d.top === 'rails') d.top = 'panel'; this.render(); }, {cls: 'big2'})];
    if (['legs', 'plinth', 'frame'].includes(d.base)) {
      const f = Wg.num(d.base === 'legs' ? 'Ayak yüksekliği' : 'Baza yüksekliği', d.baseH, (x, ok) => { if (ok) { d.baseH = x; this.preview(); } }, {min: 20, max: 400, big: true});
      out.push(h('div', {class: 'dimf'}, f, h('div', {class: 'chips sugg'}, [60, 80, 100, 120, 150].map(v => h('button', {type: 'button', onclick: () => { d.baseH = v; f.inp.value = v; this.preview(); }}, v)))));
    }
    if (d.base !== 'wall') out.push(h('div', {class: 'fld'}, h('span', null, 'Üstü'), Wg.chips([['panel', 'Üst tabla'], ['rails', 'Kuşak (üstüne tezgâh gelecek)']], d.top === 'rails' ? 'rails' : 'panel', v => { d.top = v; this.render(); })));
    return out;
  },
  s_mat() {
    const d = this.d, m = this.mats;
    const sw = key => h('div', {class: 'sw big'}, Object.entries(FINISHES).filter(([k]) => k !== 'arka').map(([fk, [fn, col]]) => h('button', {type: 'button', title: fn, 'aria-label': fn, class: m[key].color === fk ? 'on' : '', style: `background:${col}`, onclick: () => { m[key].color = fk; if (key === 'body' && m.drawer.color === m.body.color) m.drawer.color = fk; this.render(); }})));
    const backV = d.back === 'none' ? 'none' : d.back === 'nailed' ? 'nailed' : 'groove';
    return [
      h('div', {class: 'fld'}, h('span', null, 'Gövde kalınlığı'), Wg.tiles([[16, '16 mm'], [18, '18 mm'], [25, '25 mm']], d.t, v => { d.t = v; d.drawerT = Math.min(d.drawerT, v); this.render(); }, {cls: 'mini'})),
      h('div', {class: 'fld'}, h('span', null, 'Arkalık'), Wg.chips([['groove', 'Kanallı (8 mm)'], ['nailed', 'Arkadan çakma (4 mm)'], ['none', 'Arkalıksız']], backV, v => { d.back = v; d.backT = v === 'nailed' ? 4 : 8; this.render(); })),
      h('div', {class: 'fld'}, h('span', null, `Gövde rengi · ${FINISHES[m.body.color] ? FINISHES[m.body.color][0] : ''}`), sw('body')),
      d.sections.some(s => s.door !== 'none' || s.drawers) ? h('div', {class: 'fld'}, h('span', null, `Kapak / çekmece önü rengi · ${FINISHES[m.front.color] ? FINISHES[m.front.color][0] : ''}`), sw('front')) : null,
      h('p', {class: 'tip'}, 'Renkler bu işteki tüm dolaplar için geçerlidir. Bant kalınlığı, paylar ve levha ölçüsü sonradan “Usta ayarları”ndan değişir.'),
    ];
  },
  s_end() {
    const d = this.d, R = this.calc();
    const nameIn = h('input', {class: 'inp txt big', value: d.name, maxlength: 60, oninput: e => { d.name = e.target.value || 'Dolap'; }});
    const errs = [...R.warn, ...R.check].filter(w => w.lvl === 'err'), warns = R.warn.filter(w => w.lvl === 'warn');
    return [
      h('label', {class: 'fld'}, h('span', null, 'Dolabın adı'), nameIn),
      Wg.step('Kaç adet yapılacak?', d.qty, x => { d.qty = x; this.render(); }, 1, 99, {big: true}),
      h('div', {class: 'sum'}, h('h4', null, 'Özet'),
        h('div', {class: 'kv'}, [['Dış ölçü', `${fmt(d.W)} × ${fmt(d.H)} × ${fmt(d.D)}`], ...R.sum.slice(0, 3), ['Parça sayısı', `${R.parts.length}${d.qty > 1 ? ` × ${d.qty} = ${R.parts.length * d.qty}` : ''}`]].flatMap(([k, v]) => [h('span', null, k), h('b', null, v)])),
        errs.length ? errs.map(w => h('div', {class: 'iss'}, w.t)) : R.check.map(w => h('div', {class: 'iss ok'}, w.t)),
        warns.map(w => h('div', {class: 'iss warn'}, w.t))),
    ];
  },
};
