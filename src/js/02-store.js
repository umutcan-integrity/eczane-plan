/* =====================================================================
   Kayıt: ayarlar + projeler (localStorage, yalnızca bu cihaz)
   ===================================================================== */

const ACCENTS = {
  yesil:   {n: 'Yeşil',   l: '#1F7A5A', d: '#3FBF8F'},
  mavi:    {n: 'Mavi',    l: '#2563EB', d: '#6EA8FE'},
  turkuaz: {n: 'Turkuaz', l: '#0E7C86', d: '#3CC8D0'},
  mor:     {n: 'Mor',     l: '#6D3FD9', d: '#B39DFF'},
  turuncu: {n: 'Turuncu', l: '#C2570C', d: '#FB9A4B'},
  kirmizi: {n: 'Kırmızı', l: '#C0262D', d: '#F2777C'},
  pembe:   {n: 'Pembe',   l: '#BE1F6A', d: '#F47CB5'},
  grafit:  {n: 'Grafit',  l: '#2F3A45', d: '#C6D0DA'},
};

const Settings = {
  v: {mode: 'auto', accent: 'yesil', autosave: true, last: null, grid: true, snap: true, clear: true, walls: 'full', lastW: 13.65, lastD: 6.95},
  load() { try { Object.assign(this.v, JSON.parse(localStorage.getItem(K_SET) || '{}')); } catch (e) {} },
  save() { try { localStorage.setItem(K_SET, JSON.stringify(this.v)); } catch (e) {} },
  set(k, val) { this.v[k] = val; this.save(); },
};

const Store = {
  index() {
    try { const l = JSON.parse(localStorage.getItem(K_INDEX) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  },
  writeIndex(l) { localStorage.setItem(K_INDEX, JSON.stringify(l)); },
  load(id) {
    try { const raw = localStorage.getItem(K_PROJ + id); return raw ? normalizeProject(JSON.parse(raw)) : null; } catch (e) { return null; }
  },
  /* Hata olursa (kota dolu) istisna fırlatır */
  save(p, thumb) {
    p.updated = Date.now();
    localStorage.setItem(K_PROJ + p.id, JSON.stringify(p));
    const l = this.index().filter(e => e.id !== p.id);
    const old = this.index().find(e => e.id === p.id);
    l.unshift({id: p.id, name: p.name, updated: p.updated, w: p.shop.w, d: p.shop.d, rooms: p.rooms.length, items: p.items.length, thumb: thumb || old?.thumb || ''});
    try { this.writeIndex(l); }
    catch (e) { l[0].thumb = ''; this.writeIndex(l); }
  },
  remove(id) {
    localStorage.removeItem(K_PROJ + id);
    this.writeIndex(this.index().filter(e => e.id !== id));
  },
  rename(id, name) {
    const p = this.load(id); if (!p) return;
    p.name = name; this.save(p);
  },
};

/* Proje oluştur / doğrula */
function newProject(name, w, d) {
  const now = Date.now();
  return {v: 2, id: uid(), name: name || 'Yeni proje', created: now, updated: now,
    shop: {w: r3(w), d: r3(d), h: 2.8}, floor: 'seramik', rooms: [], items: [], voids: [], walls: [], seq: 1};
}
function makeItem(e, cx, cy, extra = {}) {
  const t = TYPES[e.t];
  return Object.assign({
    id: '', type: e.t, style: e.s || '', name: e.n, cx: r3(cx), cy: r3(cy), w: e.w, d: e.d, h: e.h, rot: 0,
    color: e.color || t.color, clear: e.clear || 0, clearB: e.clearB || 0, elev: e.elev || 0, flip: false,
    rows: e.rows || 0, cols: e.cols || 0, split: 0, label: e.label || '', upper: !!e.upper,
  }, extra);
}
function nextId(p, pre) { p.seq = (p.seq || 1) + 1; return pre + p.seq.toString(36) + Math.random().toString(36).slice(2, 4); }

function normalizeProject(o) {
  if (!o || typeof o !== 'object') return null;
  const num = (v, d, min = -1e4, max = 1e4) => (typeof v === 'number' && isFinite(v)) ? clamp(v, min, max) : d;
  const shop = o.shop || {};
  const p = {
    v: 2, id: typeof o.id === 'string' && o.id ? o.id : uid(), name: String(o.name || 'Proje').slice(0, 80),
    created: num(o.created, Date.now(), 0, 1e15), updated: num(o.updated, Date.now(), 0, 1e15),
    shop: {w: num(shop.w, 10, 1, 200), d: num(shop.d, 6, 1, 200), h: num(shop.h, 2.8, 2, 8)},
    rooms: [], items: [], seq: num(o.seq, 1, 0, 1e9),
  };
  if (typeof o.sign === 'string') p.sign = o.sign.slice(0, 60);
  p.voids = (Array.isArray(o.voids) ? o.voids : []).filter(v => v && typeof v === 'object').map(v => ({id: typeof v.id === 'string' ? v.id : uid(), x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 1, .05, 200), d: num(v.d, 1, .05, 200)}));
  p.walls = (Array.isArray(o.walls) ? o.walls : []).filter(v => v && typeof v === 'object').map(v => ({id: typeof v.id === 'string' ? v.id : uid(), x1: num(v.x1, 0), y1: num(v.y1, 0), x2: num(v.x2, 1), y2: num(v.y2, 0), t: num(v.t, INNER_T, .05, .6)}))
    .filter(w => Math.abs(w.x1 - w.x2) < .001 || Math.abs(w.y1 - w.y2) < .001);
  p.floor = FLOOR_BY_KEY[o.floor] ? o.floor : 'seramik';
  if (o.kroki && typeof o.kroki === 'object') {
    const k = o.kroki, str = (v, n) => typeof v === 'string' ? v.slice(0, n) : undefined;
    p.kroki = {title: str(k.title, 60), name: str(k.name, 80), pharmacist: str(k.pharmacist, 80), address: str(k.address, 400), salesName: str(k.salesName, 60),
      scale: [50, 100, 200, 250, 500].includes(+k.scale) ? +k.scale : 'auto', rot: [0, 90, 180, 270].includes(+k.rot) && k.rot !== 'auto' ? +k.rot : 'auto',
      north: isFinite(+k.north) ? normRot(+k.north) : 0, sign: k.sign !== false, items: k.items !== false};
    for (const key in p.kroki) if (p.kroki[key] === undefined) delete p.kroki[key];
  }
  const ids = new Set();
  const fresh = pre => { let id; do { id = pre + Math.random().toString(36).slice(2, 8); } while (ids.has(id)); return id; };
  for (const r of Array.isArray(o.rooms) ? o.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    let id = typeof r.id === 'string' && r.id && !ids.has(r.id) ? r.id : fresh('r'); ids.add(id);
    p.rooms.push({id, name: String(r.name ?? 'Oda').slice(0, 60), x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 3, MIN_ROOM, 200), d: num(r.d, 3, MIN_ROOM, 200),
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : ROOM_COLORS[p.rooms.length % ROOM_COLORS.length], floor: FLOOR_BY_KEY[r.floor] ? r.floor : ''});
  }
  for (const it of Array.isArray(o.items) ? o.items : []) {
    if (!it || typeof it !== 'object' || !TYPES[it.type]) continue;
    let id = typeof it.id === 'string' && it.id && !ids.has(it.id) ? it.id : fresh('i'); ids.add(id);
    const styles = STYLES[it.type];
    p.items.push({
      id, type: it.type, style: styles ? (styles.some(s => s[0] === it.style) ? it.style : styles[0][0]) : '',
      name: String(it.name ?? TYPES[it.type].n).slice(0, 60),
      cx: num(it.cx, 1), cy: num(it.cy, 1), w: num(it.w, 1, MIN_ITEM, 100), d: num(it.d, .5, 0.02, 100), h: num(it.h, 1, 0, 10),
      rot: normRot(num(it.rot, 0)), color: /^#[0-9a-f]{6}$/i.test(it.color) ? it.color : TYPES[it.type].color,
      clear: num(it.clear, 0, 0, 5), clearB: num(it.clearB, 0, 0, 5), elev: num(it.elev, 0, 0, 5), flip: !!it.flip,
      rows: Math.round(num(it.rows, 0, 0, 16)), cols: Math.round(num(it.cols, 0, 0, 8)), split: num(it.split, 0, 0, 3),
      label: String(it.label ?? '').slice(0, 30), upper: !!it.upper,
    });
  }
  return p;
}

/* Örnek eczane yerleşimi (13,65 × 6,95 m) */
function sampleProject(name) {
  const p = newProject(name, 13.65, 6.95);
  const room = (n, x, y, w, d, c, floor = '') => p.rooms.push({id: nextId(p, 'r'), name: n, x, y, w, d, color: ROOM_COLORS[c], floor});
  room('WC', 12.05, 0, 1.60, 1.80, 0, 'gri');
  room('Mutfak', 10.05, 0, 2.00, 1.80, 1, 'dama');
  room('Hol', 10.05, 1.80, 3.60, 0.95, 8);
  room('Eczacı Odası', 10.05, 2.75, 3.60, 2.15, 3, 'parke');
  room('Bakım Odası', 10.05, 4.90, 3.60, 2.05, 2, 'vinil');
  const put = (k, cx, cy, rot = 0, ex = {}) => {
    const it = makeItem(CATALOG_BY_KEY[k], cx, cy, Object.assign({rot}, ex));
    it.id = nextId(p, 'i'); p.items.push(it); return it;
  };
  // Giriş cephesi (sol dış duvar)
  put('door2', -0.10, 3.45, 270, {name: 'Giriş'});
  put('window', -0.10, 1.35, 90, {name: 'Vitrin camı', w: 2.2, d: .2, elev: .3, h: 2.2});
  put('window', -0.10, 5.55, 90, {name: 'Vitrin camı', w: 2.2, d: .2, elev: .3, h: 2.2});
  // Satış alanı
  put('cosmetic', 2.40, 0.225, 0, {name: 'Dermokozmetik', w: 3.0, label: 'DERMOKOZMETİK'});
  put('otc', 5.80, 0.225, 0, {name: 'OTC dolabı', w: 3.4});
  put('shelf', 3.30, 6.75, 180, {name: 'Duvar rafı', w: 4.8});
  put('gondola', 3.20, 1.95); put('gondola', 5.60, 1.95); put('gondola', 3.20, 5.00); put('gondola', 5.60, 5.00);
  put('counter', 8.25, 3.15, 90, {name: 'Banko', w: 3.8});
  put('drawer', 8.725, 0.225, 0, {name: 'İlaç dolabı', w: 1.65, d: .45, clear: .8, cols: 3});
  put('drawer', 9.775, 1.10, 90, {name: 'İlaç dolabı', w: 1.30, d: .45, clear: .9, cols: 3});
  put('drawer', 9.775, 3.875, 90, {name: 'İlaç dolabı', w: 2.05, d: .45, clear: .9, cols: 4});
  put('round', 7.60, 6.40, 0, {name: 'Tansiyon masası', w: .7, d: .7});
  // İç kapılar
  put('door', 10.70, 1.80, 0, {name: 'Mutfak kapısı', w: .8});
  put('door', 12.75, 1.80, 0, {name: 'WC kapısı', w: .8});
  put('door', 10.05, 2.275, 90, {name: 'Hol kapısı', w: .8});
  put('door', 10.80, 2.75, 180, {name: 'Oda kapısı'});
  put('door', 10.05, 5.90, 90, {name: 'Bakım kapısı'});
  // Mutfak / oda içleri
  put('kitchen', 11.05, 0.30, 0, {name: 'Mutfak tezgâhı', w: 1.9});
  put('toilet', 13.40, 0.35, 0, {name: 'Klozet'});
  put('sink', 12.30, 0.50, 270, {name: 'Lavabo'});
  put('base', 10.75, 4.55, 180, {name: 'Laboratuvar tezgâhı', w: 1.2});
  put('cab', 11.80, 3.025, 0, {name: 'Ofis dolabı', w: .9, h: 2.0});
  put('desk', 12.95, 3.15, 0, {name: 'Eczacı masası', w: 1.3, d: .7});
  put('metal', 11.95, 4.65, 180, {name: 'Demir raf (stok)'});
  put('metal', 13.05, 4.65, 180, {name: 'Demir raf (stok)'});
  put('cab', 13.35, 5.30, 270, {name: 'Tıbbi dolap', w: .6, d: .4, h: 1.8, clear: 0});
  put('table', 12.20, 6.45, 0, {name: 'Muayene masası', w: 1.9, d: .65, clear: 0, clearB: .9});
  // İnsan ölçeği
  put('person', 7.30, 3.30, 270, {name: 'Müşteri'});
  put('wheel', 6.90, 4.70, 270, {name: 'Tekerlekli sandalye'});
  put('turn', 4.40, 3.47, 0, {name: 'Dönüş alanı'});
  return p;
}

/* Eski (v1) plan verisini yeni projeye çevir */
const V1_MAP = {
  banko_modul: ['counter1'], banko_duz: ['counter'], banko_engelli: ['counterLow'],
  duvar_rafi: ['shelf'], dermokozmetik_unite: ['shelf'], cekmeceli_ilac_dolabi: ['drawer'], gondol_cift: ['gondola'],
  gondol_tek: ['shelf'], gondol_baslik: ['shelf'], vitrin_dolabi: ['glass'], ilac_buzdolabi: ['fridge'], ofis_dolabi: ['cab'],
  stok_rafi: ['shelf'], stok_rafi_agir: ['shelf'], mutfak_tezgahi: ['base'], mutfak_dolabi: ['cab'], tibbi_dolap: ['cab'],
  temizlik_dolabi: ['cab'], lab_tezgahi: ['base'], buzdolabi: ['fridge'], mini_buzdolabi: ['fridge'],
  tansiyon_masasi: ['table'], danisma_masasi: ['table'], eczaci_masasi: ['desk'], bilgisayar_masasi: ['desk'], sedye: ['table'],
  giris_kapisi_cift: ['door2'], giris_kapisi_tek: ['door'], ic_kapi: ['door'], wc_kapisi: ['door'], surgu_kapi: ['door', {style: 'sliding'}],
  vitrin_cami: ['window', {elev: .3, h: 2.2}], pencere: ['window'], kolon: ['column'],
  insan_ayakta: ['person'], insan_yuruyen: ['person'], iki_kisi_yanyana: ['person'], tekerlekli_sandalye: ['wheel'],
  donus: ['turn'], gecis: ['pass90'], gecis_rahat: ['pass120'],
};
function migrateV1(o) {
  if (!o || !o.shop || !Array.isArray(o.rooms) || !Array.isArray(o.items)) return null;
  const p = newProject(o.shop.name || 'Önceki plan', +o.shop.w || 13.65, +o.shop.h || 6.95);
  p.name = 'Önceki plan';
  for (const r of o.rooms) p.rooms.push({id: nextId(p, 'r'), name: r.name || 'Oda', x: +r.x || 0, y: +r.y || 0, w: +r.w || 1, d: +r.h || 1, color: r.color || ROOM_COLORS[0]});
  for (const it of o.items) {
    const m = V1_MAP[it.key]; if (!m) continue;
    const e = CATALOG_BY_KEY[m[0]];
    const w = +it.w || e.w, d = +it.h || e.d;
    const n = makeItem(e, (+it.x || 0) + w / 2, (+it.y || 0) + d / 2, Object.assign({w, d, rot: normRot(+it.rot || 0), name: it.name || e.n, flip: !!it.flip}, m[1] || {}));
    if (n.type === 'door' || n.type === 'window') n.d = .1;
    n.id = nextId(p, 'i'); p.items.push(n);
  }
  return normalizeProject(p);
}
function migrateOldData() {
  try {
    if (Store.index().length) return;
    const raw = localStorage.getItem(K_V1); if (!raw) return;
    const p = migrateV1(JSON.parse(raw)); if (!p) return;
    Store.save(p, '');
  } catch (e) {}
}

/* Hazır dükkân şekilleri: boşluk dikdörtgenleri */
const SHAPES = [['rect', 'Dikdörtgen'], ['L', 'L'], ['U', 'U'], ['T', 'T']];
function shapeVoids(shape, W, D) {
  const g = v => Math.round(v / GRID) * GRID;
  switch (shape) {
    case 'L': return [{id: uid(), x: r3(g(W * .55)), y: 0, w: r3(W - g(W * .55)), d: r3(g(D * .45))}];
    case 'U': { const a = g(W * .35), b = g(W * .65); return [{id: uid(), x: r3(a), y: 0, w: r3(b - a), d: r3(g(D * .4))}]; }
    case 'T': { const a = g(W * .3), b = g(W * .7), y = g(D * .55); return [{id: uid(), x: 0, y: r3(y), w: r3(a), d: r3(D - y)}, {id: uid(), x: r3(b), y: r3(y), w: r3(W - b), d: r3(D - y)}]; }
  }
  return [];
}
/* Şekil simgesi (SVG) */
function shapeIcon(shape) {
  const path = {rect: 'M4 6h28v20H4z', L: 'M4 6h15v9h13v11H4z', U: 'M4 6h9v8h10V6h9v20H4z', T: 'M4 6h28v11h-8v9H12v-9H4z'}[shape];
  return `<svg viewBox="0 0 36 32" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="${path}"/></svg>`;
}
