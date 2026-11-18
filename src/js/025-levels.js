/* =====================================================================
   Katlar: bodrum, zemin, asma kat, üst katlar. Her kat kendi dükkân şekli,
   odaları, eşyaları ve tavanıyla saklanır (P.levels, alttan üste). Etkin kat
   P.cur; P.shop / P.items ... etkin katın verisine bağlıdır (erişimci).
   Kat konumu zemin kata göre (ox, oy) kaydırılabilir; yükseklikler zincirlenir.
   ===================================================================== */

const LEVEL_KINDS = {
  basement:  {n: 'Bodrum kat', h: 2.6, slab: .3},
  ground:    {n: 'Zemin kat', h: 2.8, slab: .3},
  mezzanine: {n: 'Asma kat', h: 2.4, slab: .2},
  upper:     {n: 'Üst kat', h: 2.8, slab: .3},
};
const LV_FIELDS = ['shop', 'rooms', 'items', 'voids', 'walls', 'floor', 'ceil'];
const STAIR_MAX_RISE = .18;   // en fazla rıht yüksekliği (m)

/* P.shop, P.items ... → P.levels[P.cur].shop ... */
function bindLevels(p) {
  for (const k of LV_FIELDS) Object.defineProperty(p, k, {get() { return this.levels[this.cur][k]; }, set(v) { this.levels[this.cur][k] = v; }, enumerable: false, configurable: true});
  return p;
}
function newLevel(kind, w, d, h) {
  const K = LEVEL_KINDS[kind] || LEVEL_KINDS.upper;
  return {id: uid(), kind, name: '', slab: K.slab, ox: 0, oy: 0, shop: {w: r3(w), d: r3(d), h: h || K.h}, floor: kind === 'basement' ? 'epoksi' : 'seramik', rooms: [], items: [], voids: [], walls: []};
}
/* Başka bir katı, etkin katı değiştirmeden okumak için hafif görünüm */
function lvView(P, i) {
  return bindLevels({levels: P.levels, cur: i, name: P.name, sign: P.sign, kroki: P.kroki, id: P.id, seq: P.seq});
}
const groundIdx = P => Math.max(0, P.levels.findIndex(l => l.kind === 'ground'));
const curLevel = P => P.levels[P.cur];
const multiLevel = P => P.levels && P.levels.length > 1;

/* Kat taban kotu (m): zemin 0; üstte alt katın yüksekliği + döşeme; altta tersi */
function levelElev(P, i) {
  const L = P.levels, g = groundIdx(P);
  let e = 0;
  if (i > g) for (let j = g; j < i; j++) e += L[j].shop.h + L[j + 1].slab;
  else for (let j = g - 1; j >= i; j--) e -= L[j + 1].slab + L[j].shop.h;
  return r3(e);
}
/* Bir kattan üstündekine kat yüksekliği (döşeme dahil) */
function floorToFloor(P, i) {
  const L = P.levels;
  return L[i].shop.h + (L[i + 1] ? L[i + 1].slab : .3);
}
function levelName(P, i) {
  const L = P.levels, lv = L[i];
  if (lv.name) return lv.name;
  const g = groundIdx(P);
  if (lv.kind === 'ground') return 'Zemin kat';
  if (lv.kind === 'mezzanine') return 'Asma kat';
  if (lv.kind === 'basement') { const k = g - i; return k === 1 ? 'Bodrum kat' : `${k}. bodrum kat`; }
  let n = 0; for (let j = g + 1; j <= i; j++) if (L[j].kind === 'upper') n++;
  return `${n}. kat`;
}
function levelShort(P, i) {
  const L = P.levels, lv = L[i], g = groundIdx(P);
  if (lv.kind === 'ground') return 'Z';
  if (lv.kind === 'mezzanine') return 'A';
  if (lv.kind === 'basement') { const k = g - i; return k === 1 ? 'B' : 'B' + k; }
  let n = 0; for (let j = g + 1; j <= i; j++) if (L[j].kind === 'upper') n++;
  return String(n);
}
/* Kat yerel koordinatı → başka katın yerel koordinatı */
const lvShift = (P, from, to) => [P.levels[from].ox - P.levels[to].ox, P.levels[from].oy - P.levels[to].oy];
function shiftItem(it, dx, dy, extra) { return Object.assign({}, it, {cx: r3(it.cx + dx), cy: r3(it.cy + dy)}, extra || {}); }

/* ---------- Merdiven ---------- */
/* Basamak sayısı ve rıht: kat yüksekliğini ≤ 18 cm rıhtlara böl */
function stairRise(P, i) {
  const top = !!P.levels[i + 1], ff = floorToFloor(P, i);
  const n = Math.max(4, Math.ceil(ff / STAIR_MAX_RISE - 1e-6));
  return {ff, n, r: ff / n, top};
}
/* Merdiven geometrisi (yerel; ön yüz +y = alt giriş): basamaklar, yürüme yolu (t: 0 alt kat → 1 üst kat) */
function stairGeom(it, n) {
  const w = it.w, d = it.d, m = it.flip ? -1 : 1, st = it.style || 'straight';
  const treads = [], R4 = (x0, y0, x1, y1) => [[x0 * m, y0], [x1 * m, y0], [x1 * m, y1], [x0 * m, y1]];
  let path, exit, width = w, flights = [];
  if (st === 'L' || st === 'U') {
    const sw = clamp(it.sw || 1, .6, st === 'U' ? w / 2 : Math.min(w, d) - .3);
    width = sw;
    if (st === 'L') {
      const L1 = d - sw, L2 = w - sw, s1 = clamp(Math.round((n - 2) * L1 / (L1 + L2)), 1, n - 3), s2 = n - 2 - s1, g1 = L1 / s1, g2 = L2 / s2;
      for (let k = 1; k <= s1; k++) treads.push({poly: R4(-w / 2, d / 2 - k * g1, -w / 2 + sw, d / 2 - (k - 1) * g1), k});
      treads.push({poly: R4(-w / 2, -d / 2, -w / 2 + sw, -d / 2 + sw), k: s1 + 1, landing: true});
      for (let j = 1; j <= s2; j++) treads.push({poly: R4(-w / 2 + sw + (j - 1) * g2, -d / 2, -w / 2 + sw + j * g2, -d / 2 + sw), k: s1 + 1 + j});
      const cx1 = -w / 2 + sw / 2, cy = -d / 2 + sw / 2;
      path = [[cx1, d / 2, 0], [cx1, -d / 2 + sw, (s1 + .5) / n], [cx1, cy, (s1 + 1) / n], [-w / 2 + sw, cy, (s1 + 1.5) / n], [w / 2, cy, 1]];
      exit = {x: w / 2 * m, y: cy, dx: m, dy: 0};
      flights = [{len: L1, steps: s1, going: g1}, {len: L2, steps: s2, going: g2}];
    } else {
      const L = d - sw, s1 = Math.ceil((n - 2) / 2), s2 = n - 2 - s1, g1 = L / s1, g2 = L / s2;
      for (let k = 1; k <= s1; k++) treads.push({poly: R4(-w / 2, d / 2 - k * g1, -w / 2 + sw, d / 2 - (k - 1) * g1), k});
      treads.push({poly: R4(-w / 2, -d / 2, w / 2, -d / 2 + sw), k: s1 + 1, landing: true});
      for (let j = 1; j <= s2; j++) treads.push({poly: R4(w / 2 - sw, -d / 2 + sw + (j - 1) * g2, w / 2, -d / 2 + sw + j * g2), k: s1 + 1 + j});
      const cx1 = -w / 2 + sw / 2, cx2 = w / 2 - sw / 2, cy = -d / 2 + sw / 2;
      path = [[cx1, d / 2, 0], [cx1, -d / 2 + sw, (s1 + .5) / n], [cx1, cy, (s1 + 1) / n], [cx2, cy, (s1 + 1) / n], [cx2, -d / 2 + sw, (s1 + 1.5) / n], [cx2, d / 2, 1]];
      exit = {x: cx2 * m, y: d / 2, dx: 0, dy: 1};
      flights = [{len: L, steps: s1, going: g1}, {len: L, steps: s2, going: g2}];
    }
    path = path.map(([x, y, t]) => [x * m, y, t]);
  } else if (st === 'spiral') {
    const Rr = w / 2, r0 = .07, S = clamp((n - 1) * 24, 270, 340) * D2R, da = S / (n - 1), dir = m, a0 = Math.PI / 2, wl = Rr * .62;
    const P2 = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    for (let k = 1; k <= n - 1; k++) {
      const a1 = a0 + dir * (k - 1) * da, a2 = a0 + dir * k * da, poly = [];
      for (let q = 0; q <= 4; q++) poly.push(P2(Rr, a1 + (a2 - a1) * q / 4));
      poly.push(P2(r0, a2), P2(r0, a1));
      treads.push({poly, k});
    }
    path = [];
    for (let q = 0; q <= 24; q++) { const a = a0 + dir * S * q / 24; const [x, y] = P2(wl, a); path.push([x, y, q / 24]); }
    const aE = a0 + dir * S;
    exit = {x: Math.cos(aE) * wl, y: Math.sin(aE) * wl, dx: -Math.sin(aE) * dir, dy: Math.cos(aE) * dir};
    width = Math.min(Rr - wl, wl - r0) * 2;
    flights = [{len: S * wl, steps: n - 1, going: da * wl}];
  } else {
    const g = d / (n - 1);
    for (let k = 1; k <= n - 1; k++) treads.push({poly: R4(-w / 2, d / 2 - k * g, w / 2, d / 2 - (k - 1) * g), k});
    path = [[0, d / 2, 0], [0, -d / 2, 1]];
    exit = {x: 0, y: -d / 2, dx: 0, dy: -1};
    flights = [{len: d, steps: n - 1, going: g}];
  }
  const p0 = path[0], p1 = path[1], L0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const entry = {x: p0[0], y: p0[1], dx: (p1[0] - p0[0]) / L0, dy: (p1[1] - p0[1]) / L0};
  return {treads, path, entry, exit, width, flights};
}
/* Yol üzerinde: toplam uzunluk, s'deki nokta, en yakın nokta */
function pathLen(path) { let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return L; }
function pathAt(path, s) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= acc + L || i === path.length - 1) {
      const u = L ? clamp((s - acc) / L, 0, 1) : 0;
      return {x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, t: a[2] + (b[2] - a[2]) * u, dx: L ? (b[0] - a[0]) / L : 0, dy: L ? (b[1] - a[1]) / L : 1};
    }
    acc += L;
  }
  const e = path[path.length - 1]; return {x: e[0], y: e[1], t: e[2], dx: 0, dy: 1};
}
function pathProject(path, x, y) {
  let best = {d: Infinity, s: 0, lat: 0}, acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
    const u = L2 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / L2, 0, 1) : 0;
    const px = a[0] + vx * u, py = a[1] + vy * u, dd = Math.hypot(x - px, y - py);
    if (dd < best.d) best = {d: dd, s: acc + u * L, lat: L ? ((x - a[0]) * vy - (y - a[1]) * vx) / L : 0};
    acc += L;
  }
  return best;
}
/* Merdiven bilgisi + uyarılar (yerinde, kat i'de duran merdiven) */
function stairInfo(P, i, it) {
  const R = stairRise(P, i), G = stairGeom(it, R.n), warn = [];
  const going = Math.min(...G.flights.map(f => f.going));
  if (!R.top) warn.push('Üstünde kat yok: merdiven bir üst kata bağlanır. Önce kat ekle.');
  if (it.style === 'spiral') { if (going < .2) warn.push(`Döner merdivende yürüme çizgisinde basamak ${fmtCm(going)} cm: dar. Çapı büyüt (Ø 180–200 cm).`); }
  else if (going < .25) warn.push(`Basamak derinliği ${fmtCm(going)} cm: çok dik (en az 26–28 cm önerilir). Merdiveni uzat.`);
  else if (2 * R.r + going < .58 || 2 * R.r + going > .66) warn.push('Rıht/basamak oranı rahat değil (2 rıht + 1 basamak ≈ 60–64 cm).');
  if (G.width < .9) warn.push(`Kol genişliği ${fmtCm(G.width)} cm: en az 90 cm (kamuya açık alanda 120 cm) önerilir.`);
  if (R.top) {
    const up = lvView(P, i + 1), [dx, dy] = lvShift(P, i, i + 1);
    const ex = toWorld(it, G.exit.x, G.exit.y), ax = ex[0] + dx + G.exit.dx * .3, ay = ex[1] + dy + G.exit.dy * .3;
    const b = itemBox(it);
    const inside = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].every(([x, y]) => inShop(up, x + dx, y + dy));
    if (!inside) warn.push(`Merdiven boşluğu ${levelName(P, i + 1)} sınırının dışına taşıyor.`);
    else if (!inShop(up, ax, ay)) warn.push(`Merdivenin çıkışı ${levelName(P, i + 1)} içinde değil: yönünü çevir.`);
  }
  return Object.assign({}, R, {geom: G, going, warn});
}

/* ---------- Katlar arası türetilen veriler ----------
   holes: alt kattaki merdivenlerin bu katta açtığı döşeme boşlukları
   ghosts: başka katlardaki asansörlerin bu kattaki kuyuları */
const _lvDer = new Map();
function levelDerived(P, i) {
  if (!P.levels) return {holes: [], ghosts: []};
  const L = P.levels, below = L[i - 1];
  const key = JSON.stringify([i, L.map(l => [l.ox, l.oy, l.shop.h, l.slab, l.items.filter(t => t.type === 'stair' || t.type === 'lift').map(t => [t.id, t.style, t.cx, t.cy, t.w, t.d, t.rot, t.flip, t.sw])])]);
  const c = _lvDer.get(P.id + ':' + i);
  if (c && c.key === key) return c.v;
  const holes = [], ghosts = [];
  if (below) {
    const [dx, dy] = lvShift(P, i - 1, i), n = stairRise(P, i - 1).n;
    for (const it of below.items) if (it.type === 'stair') {
      const s = shiftItem(it, dx, dy, {ghost: true, lv: i - 1}), G = stairGeom(it, n), b = itemBox(s);
      const [ex, ey] = toWorld(s, G.exit.x, G.exit.y);
      const dE = {t: Math.abs(ey - b.y0), b: Math.abs(ey - b.y1), l: Math.abs(ex - b.x0), r: Math.abs(ex - b.x1)};
      const edge = Object.keys(dE).sort((p, q) => dE[p] - dE[q])[0];
      holes.push({it: s, box: b, poly: itemPoly(s), edge, lv: i - 1});
    }
  }
  L.forEach((lv, j) => { if (j === i) return; const [dx, dy] = lvShift(P, j, i); for (const it of lv.items) if (it.type === 'lift') ghosts.push(shiftItem(it, dx, dy, {ghost: true, lv: j})); });
  const v = {holes, ghosts};
  _lvDer.set(P.id + ':' + i, {key, v});
  return v;
}
/* Asma kat: zemin katın üstündeki iç kenarlar duvar değil korkuluk olur */
function mezzRailCheck(P) {
  if (!P.levels || curLevel(P).kind !== 'mezzanine') return null;
  const i = P.cur, g = P.levels.findIndex((l, j) => j < i && l.kind === 'ground');
  if (g < 0) return null;
  const gv = lvView(P, g), [dx, dy] = lvShift(P, i, g);
  return (x, y) => inShop(gv, x + dx, y + dy);
}
/* Zemin katın üstündeki asma katın ayak izi (zemin yerel koordinatında) */
function mezzOver(P, i) {
  const L = P.levels; if (!L || L[i].kind !== 'ground') return null;
  const j = i + 1; if (!L[j] || L[j].kind !== 'mezzanine') return null;
  const [dx, dy] = lvShift(P, j, i);
  return {lv: j, rects: shopRects(lvView(P, j)).map(r => ({x: r3(r.x + dx), y: r3(r.y + dy), w: r.w, d: r.d})), top: L[i].shop.h + L[j].slab + L[j].shop.h, slab: L[j].slab};
}
/* Kat ekle (veri): bodrum en alta, asma kat zeminin hemen üstüne, üst kat en üste. Eklenen katın sırası döner. */
function levelAdd(P, kind) {
  const L = P.levels, g = groundIdx(P);
  if (kind === 'mezzanine' && L.some(l => l.kind === 'mezzanine')) return -1;
  const idx = kind === 'basement' ? 0 : kind === 'mezzanine' ? g + 1 : L.length;
  const top = L[L.length - 1], ref = kind === 'basement' ? L[0] : kind === 'mezzanine' || top.kind === 'mezzanine' ? L[g] : top;
  const lv = newLevel(kind, ref.shop.w, ref.shop.d);
  lv.ox = ref.ox; lv.oy = ref.oy;
  lv.voids = ref.voids.map(v => Object.assign({}, v, {id: uid()}));
  if (kind === 'mezzanine') { // girişin karşı tarafında, zeminin ~%45'i kadar
    const gv = lvView(P, g), ent = Kroki.entrance(gv, computeWalls(gv)), W = ref.shop.w, D = ref.shop.d, side = ent ? ent.side : 'b';
    const q = v => Math.round(v * .45 / GRID) * GRID;
    lv.voids = [];
    if (side === 'b' || side === 't') { lv.shop.d = q(D); lv.oy = side === 'b' ? 0 : r3(D - lv.shop.d); }
    else { lv.shop.w = q(W); lv.ox = side === 'r' ? 0 : r3(W - lv.shop.w); }
    lv.ceil = {type: 'flat', color: '#F4F3EF'};
  }
  L.splice(idx, 0, lv);
  if (idx <= P.cur && L.length > 1) P.cur++;
  return idx;
}
/* Kat listesi için toplam/özet alanlar */
function levelArea(P, i) { return shopArea(lvView(P, i)); }
