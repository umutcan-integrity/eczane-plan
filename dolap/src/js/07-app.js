/* =====================================================================
   Uygulama: durum, geri al / yinele, kayıt, görünümler, menüler
   ===================================================================== */
const A = {
  job: null, R: null, sel: null, view: '3d', m: 'form',
  undo: [], redo: [], _coal: null, dirty: false,
  get cab() { return this.job.cabs.find(c => c.id === this.job.cur) || this.job.cabs[0]; },
  mobile() { return matchMedia('(max-width:900px)').matches; },
  visible() { return this.mobile() ? (this.m === 'form' ? null : this.m) : this.view; },

  load(job) {
    this.job = normalizeJob(job); this.sel = null; this.undo = []; this.redo = [];
    this.recalc(); UI.cabs(); UI.form(); UI.pcard(); this.views(true); this.title(); this.saved();
  },
  recalc() { this.R = calcCab(this.cab); },
  change(fn, o = {}) {
    const now = Date.now();
    if (!(o.key && this._coal && this._coal.key === o.key && now - this._coal.t < 1000)) { this.undo.push(JSON.stringify(this.job)); if (this.undo.length > 100) this.undo.shift(); this.redo = []; }
    this._coal = o.key ? {key: o.key, t: now} : null;
    fn();
    this.recalc();
    if (this.sel && !this.R.parts.some(p => p.id === this.sel)) this.sel = null;
    if (o.full) UI.form(); else UI.sum();
    UI.cabs(); UI.pcard(); this.views(o.fit); this.title();
    this.dirty = true; this.saved(); this.saveSoon();
  },
  restore(snap) {
    const cur = this.job.cur;
    this.job = normalizeJob(JSON.parse(snap));
    if (this.job.cabs.some(c => c.id === cur)) this.job.cur = cur;
    this.recalc(); if (this.sel && !this.R.parts.some(p => p.id === this.sel)) this.sel = null;
    UI.cabs(); UI.form(); UI.pcard(); this.views(); this.title();
    this.dirty = true; this.saved(); this.saveSoon();
  },
  doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.job)); this.restore(this.undo.pop()); this._coal = null; },
  doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.job)); this.restore(this.redo.pop()); this._coal = null; },
  saveSoon: debounce(() => A.saveNow(), 500),
  saveNow() { if (!this.dirty) return; if (Store.save(this.job)) { this.dirty = false; this.saved(); } else { $('#saveText').textContent = 'Kaydedilemedi!'; toast('Tarayıcı belleği dolu: JSON indirip eski işleri sil', 'err'); } },
  saved() { $('#saveDot').classList.toggle('dirty', this.dirty); $('#saveText').textContent = this.dirty ? 'Kaydediliyor…' : 'Kaydedildi'; $('#btnUndo').disabled = !this.undo.length; $('#btnRedo').disabled = !this.redo.length; },
  title() { $('#jobText').textContent = this.job.name; document.title = `${this.job.name} · Dolap Tasarımı`; },

  setCab(id) {
    if (id === this.job.cur) return;
    this.job.cur = id; this.sel = null; this.recalc();
    UI.cabs(); UI.form(); UI.pcard(); this.views(true);
    this.dirty = true; this.saveSoon(); this.saved();
  },
  dupCab() {
    const c = clone(this.cab); c.id = uid(); c.name = c.name.replace(/( \(kopya\))?$/, ' (kopya)');
    this.change(() => { const i = this.job.cabs.indexOf(this.cab); this.job.cabs.splice(i + 1, 0, c); this.job.cur = c.id; this.sel = null; }, {full: true});
    toast('Dolap çoğaltıldı');
  },
  async delCab() {
    if (this.job.cabs.length < 2) return;
    if (!await Modal.confirm(`“${this.cab.name}” silinsin mi?`, 'Sil', true)) return;
    this.change(() => { const i = this.job.cabs.indexOf(this.cab); this.job.cabs.splice(i, 1); this.job.cur = this.job.cabs[Math.max(0, i - 1)].id; this.sel = null; }, {full: true, fit: true});
  },
  async applyAll() {
    if (!await Modal.confirm('Gövde kalınlığı, birleşim, arkalık, kapak, çekmece rayı ve kenar bandı ayarları diğer tüm dolaplara kopyalansın mı? (Ölçüler, baza ve iç düzen değişmez.)', 'Uygula')) return;
    const keys = STRUCT_KEYS.filter(k => !['base', 'baseH', 'plinthSet', 'top', 'railW'].includes(k)), src = this.cab;
    this.change(() => { for (const c of this.job.cabs) if (c !== src) for (const k of keys) c[k] = src[k]; }, {full: true});
    toast('Ayarlar tüm dolaplara uygulandı');
  },
  pickRef(refs) {
    const mine = refs.find(r => r.cab === this.cab.id), r = mine || refs[0]; if (!r) return;
    if (r.cab !== this.cab.id) this.setCab(r.cab);
    UI.selectPart(r.id, {show: true});
  },

  /* ---------- görünümler ---------- */
  show(v) {
    if (this.mobile()) { this.m = v; $('#app').dataset.m = v; for (const b of $$('#mtabs button')) b.classList.toggle('on', b.dataset.v === v); }
    if (v !== 'form') { this.view = v; Settings.set('view', v); for (const b of $$('#viewSeg button')) b.classList.toggle('on', b.dataset.v === v); }
    $('#v3d').hidden = this.view !== '3d'; $('#vcut').hidden = this.view !== 'cut'; $('#vnest').hidden = this.view !== 'nest';
    this.views();
  },
  views(fit) {
    const v = this.visible();
    if (fit) this._fit = true;
    if (v === '3d') {
      if (!V.ready) { V.init().then(() => { V.onPick = id => UI.selectPart(id); UI.tools(); this.views(true); }).catch(() => {}); return; }
      V.resize(); V.build(this.cab, this.R, this.job.mats, this._fit); this._fit = false;
      V.select(this.sel);
    }
    if (v === 'cut') UI.cut();
    if (v === 'nest') UI.nest();
  },

  /* ---------- işler ---------- */
  async jobs() {
    const list = h('div', {class: 'jobs'});
    const draw = () => {
      list.innerHTML = '';
      const L = Store.list();
      if (!L.length) list.append(h('p', null, 'Kayıtlı iş yok.'));
      for (const it of L) list.append(h('div', {class: 'job' + (it.id === this.job.id ? ' on' : '')},
        h('div', {onclick: () => { Modal.close(); this.openJob(it.id); }}, h('b', null, it.name), h('small', null, `${it.k || 1} dolap tipi · ${it.n || 1} dolap · ${new Date(it.updated).toLocaleString('tr-TR', {dateStyle: 'short', timeStyle: 'short'})}`)),
        h('button', {class: 'icon-btn sm', type: 'button', title: 'Çoğalt', onclick: () => { const j = Store.load(it.id); if (!j) return; j.id = uid(); j.name += ' (kopya)'; Store.save(j); draw(); }}, icon(IC.copy)),
        h('button', {class: 'icon-btn sm', type: 'button', title: 'Sil', onclick: async () => { if (it.id === this.job.id) { toast('Açık olan iş silinemez; önce başka bir iş aç', 'err'); return; } Store.remove(it.id); draw(); }}, icon(IC.trash))));
    };
    this.saveNow(); draw();
    const imp = h('input', {type: 'file', accept: 'application/json,.json', hidden: true, onchange: e => { Modal.close(); this.importFile(e.target.files[0]); }});
    await Modal.open({title: 'İşler', wide: false, body: [h('p', null, 'İşler yalnızca bu cihazın tarayıcısında saklanır. Başka cihaza taşımak için JSON indir.'), list, imp],
      actions: [{t: 'JSON yükle', onClick: () => { imp.click(); return false; }}, {t: 'Yeni iş', primary: true, onClick: () => { this.newJobAsk(); return true; }}]});
  },
  openJob(id) { this.saveNow(); const j = Store.load(id); if (!j) { toast('İş açılamadı', 'err'); return; } Store.set('last', id); this.load(j); toast(`“${j.name}” açıldı`); },
  async newJobAsk() {
    const name = await Modal.prompt('Yeni iş', 'Yeni iş', 'İş / müşteri adı'); if (!name) return;
    this.saveNow(); const j = newJob(name); Store.save(j); this.load(j); toast('Yeni iş açıldı');
  },
  async rename() { const n = await Modal.prompt('İşi yeniden adlandır', this.job.name, 'İş / müşteri adı'); if (!n) return; this.change(() => { this.job.name = n; }); },
  exportJson() { this.saveNow(); download(fileSafe(this.job.name) + '.dolap.json', JSON.stringify(Object.assign({app: 'dolap-tasarimi', v: 1}, this.job), null, 1), 'application/json'); toast('JSON indirildi'); },
  importFile(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const j = normalizeJob(JSON.parse(rd.result)); if (Store.load(j.id)) j.id = uid(); Store.save(j); this.load(j); toast(`“${j.name}” yüklendi`); } catch (e) { toast('Dosya okunamadı (dolap JSON değil)', 'err'); } };
    rd.readAsText(f);
  },
  menu(anchor) {
    const seg = h('div', {class: 'seg sm'});
    const drawSeg = () => { seg.innerHTML = ''; for (const [k, t] of [['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu'], ['glass', 'Şeffaf']]) seg.append(h('button', {type: 'button', class: Settings.v.mode === k ? 'on' : '', onclick: () => { Settings.set('mode', k); Theme.apply(); drawSeg(); }}, t)); };
    drawSeg();
    Menu.show(anchor, [
      {t: 'Yeni iş', ic: IC.plus, fn: () => this.newJobAsk()},
      {t: 'İşler…', ic: IC.folder, fn: () => this.jobs()},
      {t: 'İşi yeniden adlandır', ic: IC.edit, fn: () => this.rename()},
      '-',
      {t: 'Kesim listesi CSV (Excel)', ic: IC.table, fn: () => UI.csv()},
      {t: 'Yazdır / PDF', ic: IC.print, fn: () => UI.print()},
      {t: 'JSON indir (yedek)', ic: IC.down, fn: () => this.exportJson()},
      {t: 'JSON yükle', ic: IC.up, fn: () => { const i = h('input', {type: 'file', accept: 'application/json,.json', onchange: e => this.importFile(e.target.files[0])}); i.click(); }},
      '-',
      {el: h('div', {class: 'mseg'}, seg)},
      {t: 'Nasıl kullanılır?', ic: IC.help, fn: () => this.help()},
    ]);
  },
  help() {
    Modal.open({title: 'Dolap Tasarımı', wide: true, body: h('div', {class: 'help'},
      h('h4', null, '1 · Ölçüleri gir'),
      h('p', null, 'Sol panelde dolabın dış genişlik, yükseklik ve derinliğini (mm) gir. Gövde kalınlığı, birleşim şekli (yanlar tam boy / üst tabla üstte / tablalar tam), üst (tabla ya da kuşak), baza, arkalık ve kapak tipini seç. Her değişiklikte tüm parçalar anında yeniden hesaplanır.'),
      h('h4', null, '2 · İç düzen'),
      h('p', null, 'Bölme sayısını artırınca ara dikmeler eklenir. Her bölme için raf sayısı (hareketli / sabit), çekmece, askı borusu ve kapak (otomatik / yok / tek / çift) seçilir. Çekmece önü yüksekliği boş bırakılırsa çekmeceler bölmeyi eşit doldurur; yazılırsa alta çekmece, üstüne ara tabla + raf/kapak gelir.'),
      h('h4', null, '3 · Kontrol et'),
      h('p', null, '“Hesap özeti” iç ölçüleri, montaj kontrolünü (parçalar birleşince dış ölçünün tuttuğunu) ve çakışma kontrolünü gösterir. 3B görünümde parçaya dokun: üstünde boy / en / kalınlık çizgileri ve kartta formülüyle kesim ölçüsü görünür. Gerekirse kesim ölçüsünü elle düzelt.'),
      h('h4', null, '4 · Kesime gönder'),
      h('ul', null,
        h('li', null, h('b', null, 'Kesim listesi: '), 'malzeme ve kalınlığa göre gruplu; aynı ölçülü parçalar tek satırda adetlenir. Boy = desen (su) yönü.'),
        h('li', null, h('b', null, 'Kesim ölçüsü: '), '“Bant kalınlığını düş” açıkken bitmiş ölçüden bantlı kenarların bant kalınlığı çıkarılmış ölçüdür.'),
        h('li', null, h('b', null, 'Levha planı: '), 'testere payı ve kenar traşı ile giyotin kesime uygun yerleşim; levha sayısı ve doluluk oranı.'),
        h('li', null, h('b', null, 'Çıktı: '), 'Yazdır / PDF ile kesim listesi, ön görünüş çizimleri, hırdavat ve levha planı; CSV ile Excel’e aktar.')),
      h('h4', null, 'Kayıt'),
      h('p', null, 'İşler bu cihazda otomatik kaydedilir. Bir işte birden çok dolap olabilir; kesim listesi “Tüm iş” seçiliyken tüm dolapları adetleriyle birlikte toplar.')),
    actions: [{t: 'Tamam', primary: true}]});
  },
};

const Theme = {
  apply() {
    const r = document.documentElement, m0 = Settings.v.mode || 'auto', glass = m0 === 'glass';
    const mode = glass ? 'dark' : m0 === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m0;
    r.dataset.mode = mode; if (glass) r.dataset.glass = '1'; else delete r.dataset.glass;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = glass ? '#0A1020' : mode === 'dark' ? '#1B201E' : '#FFFFFF';
    if (V.ready && A.job) { V.build(A.cab, A.R, A.job.mats); }
  },
};

/* ---------- başlat ---------- */
(function boot() {
  Settings.load(); Theme.apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (Settings.v.mode === 'auto') Theme.apply(); });
  let job = Store.load(Store.get('last', '')) || (Store.list()[0] && Store.load(Store.list()[0].id));
  if (!job) { job = newJob('İlk iş'); Store.save(job); }
  A.view = ['3d', 'cut', 'nest'].includes(Settings.v.view) ? Settings.v.view : '3d';
  A.load(job);
  A.show(A.mobile() ? 'form' : A.view);
  for (const b of $$('#viewSeg button')) b.onclick = () => A.show(b.dataset.v);
  for (const b of $$('#mtabs button')) b.onclick = () => A.show(b.dataset.v);
  $('#btnUndo').onclick = () => A.doUndo(); $('#btnRedo').onclick = () => A.doRedo();
  $('#btnPrint').onclick = () => UI.print();
  $('#btnJobs').onclick = () => A.jobs();
  $('#btnMenu').onclick = e => A.menu(e.currentTarget);
  $('#jobName').onclick = () => A.rename();
  addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? A.doRedo() : A.doUndo(); }
      else if (k === 'y' && !typing) { e.preventDefault(); A.doRedo(); }
      else if (k === 's') { e.preventDefault(); A.dirty = true; A.saveNow(); toast('Kaydedildi'); }
      else if (k === 'p') { e.preventDefault(); UI.print(); }
    } else if (e.key === 'Escape' && A.sel && !$('#modal').open) UI.selectPart(null);
  });
  let wasMobile = A.mobile();
  addEventListener('resize', () => { const m = A.mobile(); if (m !== wasMobile) { wasMobile = m; A.show(m ? A.m : A.view); } });
  addEventListener('beforeunload', () => A.saveNow());
  document.addEventListener('visibilitychange', () => { if (document.hidden) A.saveNow(); });
})();
