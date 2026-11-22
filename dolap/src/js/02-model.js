/* =====================================================================
   Veri modeli: iş (job) → dolaplar (cabinet) → bölmeler (section)
   ===================================================================== */
const FINISHES = {
  beyaz: ['Beyaz', '#F2F1EC'], krem: ['Krem', '#E9DFCB'], gri: ['Açık gri', '#C8CCCB'], tas: ['Taş gri', '#9A9C97'],
  antrasit: ['Antrasit', '#41464B'], siyah: ['Siyah', '#232528'], mese: ['Meşe', '#C49A6C'], kayin: ['Kayın', '#D8B48C'],
  ceviz: ['Ceviz', '#7B5539'], yesil: ['Adaçayı', '#8FA58C'], mavi: ['Gece mavisi', '#33475E'], arka: ['Arkalık (ham)', '#DCD3C2'],
};
const MAT_KEYS = ['body', 'back', 'front', 'drawer'];
const MAT_NAMES = {body: 'Gövde', back: 'Arkalık / çekmece tabanı', front: 'Kapak ve çekmece önü', drawer: 'Çekmece kutusu'};
const DEF_MATS = () => ({
  body: {label: 'MDF Lam Beyaz', color: 'beyaz', L: 2800, W: 2100, grain: false},
  back: {label: 'Arkalık MDF', color: 'arka', L: 2800, W: 2100, grain: false},
  front: {label: 'MDF Lam Meşe', color: 'mese', L: 2800, W: 2100, grain: true},
  drawer: {label: 'MDF Lam Beyaz', color: 'beyaz', L: 2800, W: 2100, grain: false},
});

const SEC_DEF = {w: 0, shelves: 1, shelfType: 'adj', drawers: 0, drawerH: 0, hanger: false, door: 'auto', hinge: 'L'};
const S = o => Object.assign({}, SEC_DEF, o);
/* Bölmeden bağımsız tüm yapı ayarları (dolaplar arası "ayarları uygula" bunları kopyalar) */
const CAB_DEF = {
  name: 'Dolap', qty: 1, W: 600, H: 820, D: 560,
  t: 18,                 // gövde kalınlığı
  build: 'sides',        // sides: yanlar tam boy · top: üst tabla yanların üstünde · over: alt+üst tabla tam
  top: 'panel',          // panel: üst tabla · rails: ön/arka kuşak · none: üst yok
  railW: 100,            // kuşak eni
  base: 'legs',          // none · legs: ayak + klipsli baza · plinth: yanlar yere iner · frame: baza kasası · wall: duvara asma
  baseH: 100, plinthSet: 40,
  back: 'groove',        // groove: kanallı · nailed: arkadan çakma · inset: gömme (tam kalınlık) · none
  backT: 8, grooveD: 8, grooveO: 15, backTol: 1,
  overlay: 'full',       // full: tam bindirme · half: yarım bindirme · inset: gömme kapak
  frontT: 18, gap: 3, edge: 1.5,
  shelfGap: 1, shelfSet: 20,
  drawerT: 18, railGap: 13, railType: 'ball',
  bandBody: 0.8, bandFront: 1, bandDrawer: 0.8, deduct: true,
};
const STRUCT_KEYS = Object.keys(CAB_DEF).filter(k => !['name', 'qty', 'W', 'H', 'D'].includes(k));

const PRESETS = [
  {k: 'base', n: 'Alt dolap', d: 'Mutfak; ayak + baza, kuşaklı, 1 raf', o: {W: 600, H: 820, D: 560, base: 'legs', baseH: 100, top: 'rails', sections: [S({shelves: 1})]}},
  {k: 'drawers', n: 'Çekmeceli alt dolap', d: '3 eşit çekmece, ayaklı', o: {W: 600, H: 820, D: 560, base: 'legs', baseH: 100, top: 'rails', sections: [S({shelves: 0, drawers: 3})]}},
  {k: 'sink', n: 'Evye alt dolabı', d: 'Çift kapak, rafsız, kuşaklı', o: {W: 800, H: 820, D: 560, base: 'legs', baseH: 100, top: 'rails', sections: [S({shelves: 0, door: '2'})]}},
  {k: 'wall', n: 'Üst dolap', d: 'Duvara asma, 1 raf', o: {W: 800, H: 720, D: 320, base: 'wall', top: 'panel', sections: [S({shelves: 1})]}},
  {k: 'tall', n: 'Boy dolabı (kiler)', d: 'Ayaklı, 4 raf, tek kapak', o: {W: 600, H: 2100, D: 560, base: 'legs', baseH: 100, top: 'panel', sections: [S({shelves: 4, door: '1'})]}},
  {k: 'wardrobe', n: 'Gardırop', d: 'Askı + raflı/çekmeceli bölme', o: {W: 1000, H: 2200, D: 580, base: 'plinth', baseH: 80, top: 'panel', sections: [S({shelves: 1, hanger: true, hinge: 'L'}), S({shelves: 4, drawers: 2, drawerH: 180, hinge: 'R'})]}},
  {k: 'chest', n: 'Şifonyer / komodin', d: '4 çekmece, bazalı', o: {W: 800, H: 850, D: 450, base: 'plinth', baseH: 60, top: 'panel', build: 'top', sections: [S({shelves: 0, drawers: 4})]}},
  {k: 'book', n: 'Kitaplık / açık raf', d: 'Kapaksız, 4 raf', o: {W: 800, H: 2000, D: 320, base: 'plinth', baseH: 60, top: 'panel', sections: [S({shelves: 4, door: 'none'})]}},
  {k: 'pharmacy', n: 'Eczane raf dolabı', d: 'İki bölmeli açık raf, sabit raflı', o: {W: 1000, H: 2100, D: 400, base: 'plinth', baseH: 100, top: 'panel', sections: [S({shelves: 6, shelfType: 'fixed', door: 'none'}), S({shelves: 6, shelfType: 'fixed', door: 'none'})]}},
  {k: 'blank', n: 'Boş gövde', d: 'Sadece kasa, raf ve kapak yok', o: {W: 600, H: 720, D: 560, base: 'none', top: 'panel', sections: [S({shelves: 0, door: 'none'})]}},
];

function newCab(key = 'base', job) {
  const p = PRESETS.find(x => x.k === key) || PRESETS[0];
  const c = Object.assign(clone(CAB_DEF), {id: uid(), sections: [S()], over: {}}, clone(p.o));
  c.name = p.n;
  if (job) { const same = job.cabs.filter(x => x.name.startsWith(p.n)).length; if (same) c.name = `${p.n} ${same + 1}`; }
  return c;
}
function normalizeCab(c) {
  c = Object.assign(clone(CAB_DEF), c || {});
  if (!c.id) c.id = uid();
  for (const k of Object.keys(CAB_DEF)) if (typeof CAB_DEF[k] === 'number') { const v = Number(c[k]); c[k] = isFinite(v) ? v : CAB_DEF[k]; }
  c.qty = Math.max(1, Math.round(c.qty));
  if (!Array.isArray(c.sections) || !c.sections.length) c.sections = [S()];
  c.sections = c.sections.slice(0, 12).map(s => { const o = Object.assign({}, SEC_DEF, s); for (const k of ['w', 'shelves', 'drawers', 'drawerH']) o[k] = Math.max(0, Number(o[k]) || 0); o.shelves = Math.min(30, Math.round(o.shelves)); o.drawers = Math.min(12, Math.round(o.drawers)); o.hanger = !!o.hanger; return o; });
  if (!c.over || typeof c.over !== 'object') c.over = {};
  c.deduct = c.deduct !== false;
  return c;
}
function newJob(name = 'Yeni iş') {
  return {id: uid(), name, created: Date.now(), updated: Date.now(), mats: DEF_MATS(), kerf: 4, trim: 10, cabs: [], cur: null};
}
function normalizeJob(j) {
  j = Object.assign({id: uid(), name: 'İş', created: Date.now(), updated: Date.now(), kerf: 4, trim: 10}, j || {});
  const dm = DEF_MATS(); j.mats = j.mats || {};
  for (const k of MAT_KEYS) { j.mats[k] = Object.assign({}, dm[k], j.mats[k] || {}); for (const q of ['L', 'W']) j.mats[k][q] = Number(j.mats[k][q]) || dm[k][q]; j.mats[k].grain = !!j.mats[k].grain; }
  j.kerf = Math.max(0, Number(j.kerf) || 0); j.trim = Math.max(0, Number(j.trim) || 0);
  j.cabs = (Array.isArray(j.cabs) ? j.cabs : []).map(normalizeCab);
  if (!j.cabs.some(c => c.id === j.cur)) j.cur = j.cabs.length ? j.cabs[0].id : null;
  return j;
}

/* ---------- kayıt (yalnız bu cihaz) ---------- */
const Store = {
  K: 'dolap.v1.',
  get(k, d) { try { const v = localStorage.getItem(this.K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(this.K + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(this.K + k); } catch (e) {} },
  list() { const l = this.get('index', []); return Array.isArray(l) ? l.sort((a, b) => b.updated - a.updated) : []; },
  load(id) { const j = this.get('job.' + id, null); return j ? normalizeJob(j) : null; },
  save(j) {
    j.updated = Date.now();
    if (!this.set('job.' + j.id, j)) return false;
    const l = this.list().filter(x => x.id !== j.id);
    l.push({id: j.id, name: j.name, updated: j.updated, n: j.cabs.reduce((a, c) => a + c.qty, 0), k: j.cabs.length});
    this.set('index', l); this.set('last', j.id);
    return true;
  },
  remove(id) { this.del('job.' + id); this.set('index', this.list().filter(x => x.id !== id)); },
};
const Settings = {
  v: null,
  load() { this.v = Object.assign({mode: null, open: {dims: 1, secs: 1, base: 1}, view: '3d', scope: 'job'}, Store.get('settings', {})); if (!this.v.mode) { try { this.v.mode = JSON.parse(localStorage.getItem('eczplan.v2.settings') || '{}').mode || 'auto'; } catch (e) { this.v.mode = 'auto'; } } },
  set(k, v) { this.v[k] = v; Store.set('settings', this.v); },
};
