/* =====================================================================
   Geometri: dönüşümler, duvarlar, boşluk ve çakışma analizi
   ===================================================================== */

function rotPt(x, y, deg) { const a = deg * D2R, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
function toWorld(it, lx, ly) { const [x, y] = rotPt(lx, ly, it.rot || 0); return [it.cx + x, it.cy + y]; }
function toLocal(it, wx, wy) { return rotPt(wx - it.cx, wy - it.cy, -(it.rot || 0)); }
function localPoly(it, x0, y0, x1, y1) { return [toWorld(it, x0, y0), toWorld(it, x1, y0), toWorld(it, x1, y1), toWorld(it, x0, y1)]; }
const isRound = it => (it.type === 'table' && it.style === 'round') || (it.type === 'zone' && it.style === 'circle');
const isSolid = it => !!TYPES[it.type]?.solid;
const isOpening = it => it.type === 'door' || it.type === 'window';
function itemPoly(it) {
  if (isRound(it)) {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(toWorld(it, Math.cos(a) * it.w / 2, Math.sin(a) * it.d / 2)); }
    return pts;
  }
  return localPoly(it, -it.w / 2, -it.d / 2, it.w / 2, it.d / 2);
}
function halfExt(it, rot = it.rot || 0) {
  const a = rot * D2R, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return [(c * it.w + s * it.d) / 2, (s * it.w + c * it.d) / 2];
}
function itemBox(it) { const [hx, hy] = halfExt(it); return {x0: it.cx - hx, y0: it.cy - hy, x1: it.cx + hx, y1: it.cy + hy}; }
function rectPoly(r) { return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]; }
function polyBox(P) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return {x0, y0, x1, y1}; }
function roomBox(r) { return {x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.d}; }
const quarter = rot => { const q = Math.round(rot / 90); return Math.abs(rot - q * 90) < 1.5 ? ((q % 4) + 4) % 4 : -1; };

/* SAT: iki dışbükey çokgen eps'ten fazla iç içe geçiyor mu */
function polyOverlap(A, B, eps = 0.01) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      let nx = y1 - y2, ny = x2 - x1; const L = Math.hypot(nx, ny); if (L < 1e-9) continue; nx /= L; ny /= L;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of A) { const p = x * nx + y * ny; if (p < a0) a0 = p; if (p > a1) a1 = p; }
      for (const [x, y] of B) { const p = x * nx + y * ny; if (p < b0) b0 = p; if (p > b1) b1 = p; }
      if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
    }
  }
  return true;
}
function polyOutside(P, W, D, eps = 0.01) { return P.some(([x, y]) => x < -eps || y < -eps || x > W + eps || y > D + eps); }
let _voidPolys = [];
function polyInVoid(poly) { return _voidPolys.some(v => polyOverlap(poly, v, .01)); }

/* ---------- Duvarlar ----------
   Dış duvarlar iç ölçünün dışında (kalınlık OUTER_T). İç duvarlar oda kenarlarından türetilir,
   çizgisi üzerinde ortalanır (INNER_T). Aynı hattaki kenarlar birleştirilir.
   seg: {h: yatay mı, c: hat koordinatı, a..b: hat boyunca aralık, t: kalınlık, outer, open: [boşluklar]} */
/* ---------- Dükkân şekli: dikdörtgen eksi bina boşlukları ----------
   P.voids: [{x,y,w,d}] dükkândan çıkarılan alanlar (L, U, T, ışıklık...) */
function inShop(P, x, y) {
  if (x < 0 || y < 0 || x > P.shop.w || y > P.shop.d) return false;
  for (const v of P.voids || []) if (x > v.x && x < v.x + v.w && y > v.y && y < v.y + v.d) return false;
  return true;
}
/* Sıkıştırılmış ızgara: hücre (i,j) dükkânın içinde mi */
function shopGrid(P) {
  const W = P.shop.w, D = P.shop.d, xs = new Set([0, W]), ys = new Set([0, D]);
  for (const v of P.voids || []) { xs.add(clamp(r3(v.x), 0, W)); xs.add(clamp(r3(v.x + v.w), 0, W)); ys.add(clamp(r3(v.y), 0, D)); ys.add(clamp(r3(v.y + v.d), 0, D)); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const ins = [];
  for (let j = 0; j < Y.length - 1; j++) { const row = []; for (let i = 0; i < X.length - 1; i++) row.push(X[i + 1] - X[i] > 1e-4 && Y[j + 1] - Y[j] > 1e-4 && inShop(P, (X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2)); ins.push(row); }
  return {X, Y, ins};
}
/* Dükkân alanını dikdörtgenlere böl (zemin, tavan için) */
function shopRects(P) {
  const {X, Y, ins} = shopGrid(P), out = [];
  let prev = [];
  for (let j = 0; j < Y.length - 1; j++) {
    const runs = [];
    for (let i = 0; i < X.length - 1; i++) if (ins[j][i]) { const l = runs[runs.length - 1]; if (l && l.i1 === i) l.i1 = i + 1; else runs.push({i0: i, i1: i + 1}); }
    const cur = [];
    for (const r of runs) {
      const p = prev.find(q => q.i0 === r.i0 && q.i1 === r.i1);
      if (p) { p.rect.d = Y[j + 1] - p.rect.y; cur.push(p); }
      else { const rect = {x: X[r.i0], y: Y[j], w: X[r.i1] - X[r.i0], d: Y[j + 1] - Y[j]}; out.push(rect); cur.push({...r, rect}); }
    }
    prev = cur;
  }
  return out;
}
function shopArea(P) { return shopRects(P).reduce((s, r) => s + r.w * r.d, 0); }
/* Dış sınır kenarları: {h, e (hat), a..b, n (dışa yön işareti)} */
function outerEdges(P) {
  const {X, Y, ins} = shopGrid(P), nx = X.length - 1, ny = Y.length - 1, raw = [];
  const I = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && ins[j][i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!ins[j][i]) continue;
    if (!I(i, j - 1)) raw.push({h: 1, e: Y[j], a: X[i], b: X[i + 1], n: -1});
    if (!I(i, j + 1)) raw.push({h: 1, e: Y[j + 1], a: X[i], b: X[i + 1], n: 1});
    if (!I(i - 1, j)) raw.push({h: 0, e: X[i], a: Y[j], b: Y[j + 1], n: -1});
    if (!I(i + 1, j)) raw.push({h: 0, e: X[i + 1], a: Y[j], b: Y[j + 1], n: 1});
  }
  raw.sort((p, q) => p.h - q.h || p.n - q.n || p.e - q.e || p.a - q.a);
  const out = [];
  for (const r of raw) { const l = out[out.length - 1]; if (l && l.h === r.h && l.n === r.n && Math.abs(l.e - r.e) < 1e-6 && Math.abs(l.b - r.a) < 1e-6) l.b = r.b; else out.push({...r}); }
  return out;
}
/* Dikdörtgen eksi dikdörtgenler → dikdörtgen parçalar */
function rectMinus(base, cuts) {
  const xs = new Set([base.x, base.x + base.w]), ys = new Set([base.y, base.y + base.d]);
  for (const c of cuts) { for (const x of [c.x, c.x + c.w]) if (x > base.x && x < base.x + base.w) xs.add(x); for (const y of [c.y, c.y + c.d]) if (y > base.y && y < base.y + base.d) ys.add(y); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b), out = [];
  let prev = [];
  for (let j = 0; j < Y.length - 1; j++) {
    const cy = (Y[j] + Y[j + 1]) / 2, runs = [];
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      if (cuts.some(c => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.d)) continue;
      const l = runs[runs.length - 1]; if (l && l.i1 === i) l.i1 = i + 1; else runs.push({i0: i, i1: i + 1});
    }
    const cur = [];
    for (const r of runs) {
      const p = prev.find(q => q.i0 === r.i0 && q.i1 === r.i1);
      if (p) { p.rect.d = r3(Y[j + 1] - p.rect.y); cur.push(p); }
      else { const rect = {x: r3(X[r.i0]), y: r3(Y[j]), w: r3(X[r.i1] - X[r.i0]), d: r3(Y[j + 1] - Y[j])}; out.push(rect); cur.push({...r, rect}); }
    }
    prev = cur;
  }
  return out.filter(r => r.w > .005 && r.d > .005);
}

/* ---------- Duvarlar ----------
   Dış duvarlar dükkân şeklinin çevresinde, iç ölçünün dışında (OUTER_T). İç duvarlar oda kenarlarından
   ve serbest çizilen duvarlardan (P.walls) türetilir; yalnızca dükkânın içinde kalan kısımları tutulur.
   seg: {h, c: hat, a..b: aralık, t, outer, n: dışa yön (dış duvar), e/ea/eb: iç yüz hattı ve aralığı, open: []} */
function computeWalls(P) {
  const to = OUTER_T, ti = INNER_T, eps = .004;
  const segs = [];
  for (const e of outerEdges(P)) {
    let a = e.a, b = e.b;
    const IN = (x, y) => inShop(P, x, y);
    if (e.h) {
      if (!IN(a - eps, e.e - e.n * eps)) a -= to;   // dış köşe: uzat
      if (!IN(b + eps, e.e - e.n * eps)) b += to;
    } else {
      if (IN(e.e + e.n * eps, a - eps)) a += to;     // iç köşe: kısalt (yatay duvar kapatır)
      if (IN(e.e + e.n * eps, b + eps)) b -= to;
    }
    if (b - a > .005) segs.push({h: e.h, c: r3(e.e + e.n * to / 2), a: r3(a), b: r3(b), t: to, outer: 1, n: e.n, e: e.e, ea: e.a, eb: e.b});
  }
  const {X, Y} = shopGrid(P);
  const H = new Map(), V = new Map(), extra = [];
  const add = (map, c, a, b) => {
    if (b - a < 0.02) return;
    const k = Math.round(c * 200) / 200;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push([a, b]);
  };
  for (const r of P.rooms) {
    for (const y of [r.y, r.y + r.d]) add(H, y, r.x, r.x + r.w);
    for (const x of [r.x, r.x + r.w]) add(V, x, r.y, r.y + r.d);
  }
  for (const w of P.walls || []) {
    const h = Math.abs(w.y1 - w.y2) < .001, a = h ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), b = h ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2), c = h ? w.y1 : w.x1;
    if (Math.abs((w.t || ti) - ti) < .005) add(h ? H : V, c, a, b);
    else extra.push({h, c, a, b, t: w.t});
  }
  const merge = list => {
    list.sort((p, q) => p[0] - q[0]); const out = [];
    for (const [a, b] of list) { const l = out[out.length - 1]; if (l && a <= l[1] + 0.005) l[1] = Math.max(l[1], b); else out.push([a, b]); }
    return out;
  };
  /* Yalnızca iki yanı da dükkânın içinde olan parçaları tut (sınırdakini dış duvar karşılar) */
  const clip = (h, c, a, b, t) => {
    const br = [a, b, ...(h ? X : Y).filter(v => v > a && v < b)].sort((p, q) => p - q), keep = [];
    for (let i = 0; i < br.length - 1; i++) {
      const m = (br[i] + br[i + 1]) / 2, d = t / 2 + .005;
      const ok = h ? inShop(P, m, c - d) && inShop(P, m, c + d) : inShop(P, c - d, m) && inShop(P, c + d, m);
      if (!ok) continue;
      const l = keep[keep.length - 1]; if (l && Math.abs(l[1] - br[i]) < 1e-6) l[1] = br[i + 1]; else keep.push([br[i], br[i + 1]]);
    }
    for (let [p, q] of keep) {
      if (h) { // köşeleri kapatmak için uçları yarım kalınlık uzat (dükkân içinde kalıyorsa)
        if (inShop(P, p - t / 2 + .001, c)) p -= t / 2;
        if (inShop(P, q + t / 2 - .001, c)) q += t / 2;
      }
      if (q - p > .01) segs.push({h, c, a: r3(p), b: r3(q), t});
    }
  };
  for (const [k, l] of H) for (const [a, b] of merge(l)) clip(1, k, a, b, ti);
  for (const [k, l] of V) for (const [a, b] of merge(l)) clip(0, k, a, b, ti);
  for (const x of extra) clip(x.h ? 1 : 0, x.c, x.a, x.b, x.t);
  for (const s of segs) s.open = [];
  for (const it of P.items) {
    if (!isOpening(it)) continue;
    const s = wallOf(it, segs); if (!s) continue;
    const along = s.h ? it.cx : it.cy;
    const a = Math.max(s.a, along - it.w / 2), b = Math.min(s.b, along + it.w / 2);
    if (b - a < 0.02) continue;
    const elev = it.type === 'window' ? it.elev : 0;
    s.open.push({a, b, type: it.type, elev, top: elev + it.h, id: it.id});
  }
  return segs;
}
/* Kapı/pencerenin üzerinde durduğu duvar (yoksa null) */
function wallOf(it, segs) {
  const q = quarter(it.rot || 0); if (q < 0) return null;
  const horiz = q % 2 === 0;
  const lc = horiz ? it.cy : it.cx, along = horiz ? it.cx : it.cy;
  let best = null, bd = Infinity;
  for (const s of segs) {
    if (!!s.h !== horiz) continue;
    const dist = Math.abs(s.c - lc); if (dist > s.t / 2 + 0.06) continue;
    if (along < s.a - 0.01 || along > s.b + 0.01) continue;
    if (dist < bd) { bd = dist; best = s; }
  }
  return best;
}
/* Duvar hattında kapının kayabileceği aralık */
function segRange(s) {
  if (s.outer) return [s.ea, s.eb];
  if (!s.outer && s.h) return [s.a + INNER_T / 2, s.b - INNER_T / 2];
  return [s.a, s.b];
}
/* Noktaya en yakın duvar hattı (kapı yerleştirme için) */
function nearestWall(segs, x, y, maxD) {
  let best = null, bd = maxD;
  for (const s of segs) {
    const along = s.h ? x : y, lc = s.h ? y : x;
    const [a, b] = segRange(s);
    const d = Math.hypot(along - clamp(along, a, b), lc - s.c);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function segRect(s, a, b) { return s.h ? {x0: a, y0: s.c - s.t / 2, x1: b, y1: s.c + s.t / 2} : {x0: s.c - s.t / 2, y0: a, x1: s.c + s.t / 2, y1: b}; }
/* Duvar parçaları; filtreye uyan boşluklar kesilir */
function wallPieces(segs, filter = () => true) {
  const out = [];
  for (const s of segs) {
    let cur = s.a;
    const ops = s.open.filter(filter).sort((p, q) => p.a - q.a);
    for (const o of ops) { if (o.a > cur + 1e-4) out.push(segRect(s, cur, o.a)); cur = Math.max(cur, o.b); }
    if (s.b > cur + 1e-4) out.push(segRect(s, cur, s.b));
  }
  return out;
}

/* Kapıyı duvara oturt: hat, yön ve kalınlık. Açılış tarafı korunur. */
function seatOnWall(it, s, along, reorient) {
  const [lo, hi] = segRange(s);
  const half = it.w / 2;
  along = hi - lo >= it.w ? clamp(along, lo + half, hi - half) : (lo + hi) / 2;
  const q = quarter(it.rot || 0);
  // Dış duvara yeni geçen kapı içeri açılsın; iç duvarda mevcut taraf korunur
  const inward = s.h ? (s.n < 0 ? 0 : 180) : (s.n < 0 ? 270 : 90);
  if (s.h) { it.cy = s.c; it.cx = along; if (q !== 0 && q !== 2) it.rot = s.outer ? inward : 0; }
  else { it.cx = s.c; it.cy = along; if (q !== 1 && q !== 3) it.rot = s.outer ? inward : 90; }
  if (reorient && s.outer) it.rot = inward;
  it.d = s.t;
}

/* ---------- Boşluk alanları ---------- */
function clearPoly(it, side) {
  if (side === 'f' && it.clear > 0) return localPoly(it, -it.w / 2, it.d / 2, it.w / 2, it.d / 2 + it.clear);
  if (side === 'b' && it.clearB > 0) return localPoly(it, -it.w / 2, -it.d / 2 - it.clearB, it.w / 2, -it.d / 2);
  return null;
}
/* Kapı kanadının süpürdüğü alan (çeyrek daire, dışbükey çokgen) */
function swingPolys(it) {
  if (it.type !== 'door' || it.style === 'sliding') return [];
  const leaves = it.style === 'double' ? [[-it.w / 2, it.w / 2, 1], [it.w / 2, it.w / 2, -1]] : [[it.flip ? it.w / 2 : -it.w / 2, it.w, it.flip ? -1 : 1]];
  const y0 = it.d / 2, out = [];
  for (const [hx, L, dir] of leaves) {
    const pts = [toWorld(it, hx, y0)];
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(toWorld(it, hx + dir * Math.cos(a) * L, y0 + Math.sin(a) * L)); }
    out.push(pts);
  }
  return out;
}

/* ---------- Analiz: çakışmalar ve insan boşlukları ---------- */
function analyze(P, segs) {
  const W = P.shop.w, D = P.shop.d;
  const nm = it => it.name || TYPES[it.type].n;
  const solids = P.items.filter(isSolid).map(it => ({it, poly: itemPoly(it)}));
  const walls = wallPieces(segs, o => o.type === 'door').map(rectPoly);
  _voidPolys = (P.voids || []).map(v => rectPoly({x0: v.x, y0: v.y, x1: v.x + v.w, y1: v.y + v.d}));
  const bad = new Set(), zoneBad = new Set(), issues = [];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (polyOverlap(a.poly, b.poly)) { bad.add(a.it.id); bad.add(b.it.id); issues.push({id: a.it.id, t: `${nm(a.it)} ile ${nm(b.it)} üst üste`}); }
  }
  for (const s of solids) {
    if (polyOutside(s.poly, W, D) || polyInVoid(s.poly)) { bad.add(s.it.id); issues.push({id: s.it.id, t: `${nm(s.it)} dükkânın dışına taşıyor`}); continue; }
    if (s.it.type !== 'column' && walls.some(w => polyOverlap(s.poly, w, 0.015))) { bad.add(s.it.id); issues.push({id: s.it.id, t: `${nm(s.it)} duvarın içine giriyor`}); }
  }
  const blocker = (poly, self) => {
    for (const s of solids) if (s.it !== self && polyOverlap(poly, s.poly)) return nm(s.it);
    if (walls.some(w => polyOverlap(poly, w, 0.015))) return 'duvar';
    if (polyOutside(poly, W, D, 0.02) || polyInVoid(poly)) return 'dış duvar';
    return null;
  };
  for (const it of P.items) {
    if (isSolid(it)) {
      for (const side of ['f', 'b']) {
        const poly = clearPoly(it, side); if (!poly) continue;
        const b = blocker(poly, it);
        if (b) {
          zoneBad.add(it.id + ':' + side);
          const v = side === 'f' ? it.clear : it.clearB;
          issues.push({id: it.id, w: 1, t: `${nm(it)} ${side === 'f' ? 'önündeki' : 'arkasındaki'} ${fmtCm(v)} cm geçişi ${b === 'duvar' || b === 'dış duvar' ? 'duvar' : b} kesiyor`});
        }
      }
    } else if (it.type === 'zone') {
      const b = blocker(itemPoly(it), it);
      if (b) { zoneBad.add(it.id + ':z'); issues.push({id: it.id, w: 1, t: `${nm(it)} alanına ${b} giriyor`}); }
    } else if (it.type === 'door') {
      for (const poly of swingPolys(it)) {
        const hit = solids.find(s => polyOverlap(poly, s.poly, 0.02));
        if (hit) { zoneBad.add(it.id + ':s'); issues.push({id: it.id, w: 1, t: `${nm(it)} açılırken ${nm(hit.it)} ile çarpışıyor`}); break; }
      }
    }
  }
  return {bad, zoneBad, issues};
}

/* Seçili nesnenin dört yöndeki en yakın engele uzaklığı (eksen hizalı kutularla) */
function gapsAround(box, obstacles, maxD = 8) {
  const res = [];
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  const dirs = [['r', 1, 0], ['l', -1, 0], ['d', 0, 1], ['u', 0, -1]];
  for (const [k, dx, dy] of dirs) {
    let best = maxD, hit = null;
    for (const o of obstacles) {
      if (dx) {
        if (ov(box.y0, box.y1, o.y0, o.y1) <= 0.005) continue;
        const d = dx > 0 ? o.x0 - box.x1 : box.x0 - o.x1;
        if (d >= -0.001 && d < best) { best = d; hit = o; }
      } else {
        if (ov(box.x0, box.x1, o.x0, o.x1) <= 0.005) continue;
        const d = dy > 0 ? o.y0 - box.y1 : box.y0 - o.y1;
        if (d >= -0.001 && d < best) { best = d; hit = o; }
      }
    }
    if (!hit || best < 0.005) continue;
    let x0, y0, x1, y1;
    if (dx) {
      const y = (Math.max(box.y0, hit.y0) + Math.min(box.y1, hit.y1)) / 2;
      x0 = dx > 0 ? box.x1 : box.x0; x1 = x0 + dx * best; y0 = y1 = y;
    } else {
      const x = (Math.max(box.x0, hit.x0) + Math.min(box.x1, hit.x1)) / 2;
      y0 = dy > 0 ? box.y1 : box.y0; y1 = y0 + dy * best; x0 = x1 = x;
    }
    res.push({k, d: best, x0, y0, x1, y1});
  }
  return res;
}

/* Dolap için otomatik değerler (çekmece / raf sayısı, çekmece bölümü) */
function cabAuto(it) {
  const h = it.h, w = it.w, st = it.style;
  let lowH = 0;
  if (st === 'drawer') lowH = it.split > 0 ? Math.min(it.split, h) : (h >= 1.4 ? clamp(h * .4, .75, .95) : h);
  const rows = st === 'kitchen' ? 3 : Math.max(1, Math.round((lowH - .14) / .19));
  const cols = Math.max(1, Math.round(w / .45));
  let shelves;
  switch (st) {
    case 'otc': shelves = Math.max(2, Math.round((h - .5 - .3) / .34)); break;
    case 'cosmetic': shelves = Math.max(2, Math.round((h - .62 - .28) / .32)); break;
    case 'metal': shelves = Math.max(3, Math.round(h / .42)); break;
    case 'gondola': shelves = Math.max(2, Math.round((h - .14) / .34)); break;
    case 'glass': shelves = 4; break;
    default: shelves = Math.max(2, Math.round((h - .2) / .36));
  }
  return {lowH, rows, cols, shelves};
}

/* ---------- Silgi: duvarlarla kapalı bölge ----------
   5 cm ızgarada duvarlar (kapı boşlukları kapalı sayılır) ve dükkân dışı engel; tıklanan noktadan taşma. */
let _blockCache = null;
function blockGrid(P, segs) {
  if (_blockCache && _blockCache.segs === segs) return _blockCache;
  const c = .05, W = P.shop.w, D = P.shop.d, nx = Math.max(1, Math.ceil(W / c)), ny = Math.max(1, Math.ceil(D / c));
  const b = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (!inShop(P, (i + .5) * c, (j + .5) * c)) b[j * nx + i] = 1;
  for (const r of wallPieces(segs, () => false)) {
    const i0 = clamp(Math.floor(r.x0 / c), 0, nx), i1 = clamp(Math.ceil(r.x1 / c), 0, nx), j0 = clamp(Math.floor(r.y0 / c), 0, ny), j1 = clamp(Math.ceil(r.y1 / c), 0, ny);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) b[j * nx + i] = 1;
  }
  return (_blockCache = {segs, c, nx, ny, b});
}
function regionAt(P, segs, x, y) {
  const G = blockGrid(P, segs), {c, nx, ny, b} = G;
  let i = Math.floor(x / c), j = Math.floor(y / c);
  if (i < 0 || j < 0 || i >= nx || j >= ny || b[j * nx + i]) return null;
  const m = new Uint8Array(nx * ny), st = [j * nx + i]; m[st[0]] = 1; let n = 0;
  while (st.length) {
    const k = st.pop(); n++;
    const ii = k % nx, jj = (k - ii) / nx;
    if (ii > 0 && !m[k - 1] && !b[k - 1]) { m[k - 1] = 1; st.push(k - 1); }
    if (ii < nx - 1 && !m[k + 1] && !b[k + 1]) { m[k + 1] = 1; st.push(k + 1); }
    if (jj > 0 && !m[k - nx] && !b[k - nx]) { m[k - nx] = 1; st.push(k - nx); }
    if (jj < ny - 1 && !m[k + nx] && !b[k + nx]) { m[k + nx] = 1; st.push(k + nx); }
  }
  // dikdörtgenlere böl
  const rects = []; let prev = [];
  for (let j = 0; j < ny; j++) {
    const runs = [];
    for (let i = 0; i < nx; i++) if (m[j * nx + i]) { const l = runs[runs.length - 1]; if (l && l.i1 === i) l.i1 = i + 1; else runs.push({i0: i, i1: i + 1}); }
    const cur = [];
    for (const r of runs) {
      const p = prev.find(q => q.i0 === r.i0 && q.i1 === r.i1);
      if (p) { p.rect.d = (j + 1) * c - p.rect.y; cur.push(p); }
      else { const rect = {x: r.i0 * c, y: j * c, w: (r.i1 - r.i0) * c, d: c}; rects.push(rect); cur.push({...r, rect}); }
    }
    prev = cur;
  }
  // kenarları duvar eksenlerine / dükkân sınırına yapıştır
  const xs = [0, P.shop.w], ys = [0, P.shop.d];
  for (const v of P.voids || []) { xs.push(v.x, v.x + v.w); ys.push(v.y, v.y + v.d); }
  for (const s of segs) { if (s.outer) (s.h ? ys : xs).push(s.e); else (s.h ? ys : xs).push(s.c); }
  const sn = (v, L) => { let best = v, bd = .14; for (const t of L) { const d = Math.abs(t - v); if (d < bd) { bd = d; best = t; } } return r3(best); };
  const out = rects.map(r => { const x0 = sn(r.x, xs), x1 = sn(r.x + r.w, xs), y0 = sn(r.y, ys), y1 = sn(r.y + r.d, ys); return {x: x0, y: y0, w: r3(x1 - x0), d: r3(y1 - y0)}; }).filter(r => r.w > .02 && r.d > .02);
  return {rects: out, area: n * c * c};
}
const inRects = (rects, x, y) => rects.some(r => x > r.x + 1e-4 && x < r.x + r.w - 1e-4 && y > r.y + 1e-4 && y < r.y + r.d - 1e-4);
/* Dış duvar başına parça ölçü noktaları (kapı/pencere ve birleşen iç duvarlar) */
function segChain(s, segs) {
  const pts = new Set([s.ea, s.eb]);
  for (const op of s.open) { pts.add(r3(clamp(op.a, s.ea, s.eb))); pts.add(r3(clamp(op.b, s.ea, s.eb))); }
  for (const t of segs) {
    if (t.outer || !!t.h === !!s.h) continue;
    if (t.c <= s.ea + .01 || t.c >= s.eb - .01) continue;
    if (Math.abs(t.a - s.e) < t.t + .02 || Math.abs(t.b - s.e) < t.t + .02) { pts.add(r3(t.c - t.t / 2)); pts.add(r3(t.c + t.t / 2)); }
  }
  return [...pts].sort((a, b) => a - b);
}
function wallBox(w) { const t = (w.t || INNER_T) / 2; return {x0: Math.min(w.x1, w.x2) - t, y0: Math.min(w.y1, w.y2) - t, x1: Math.max(w.x1, w.x2) + t, y1: Math.max(w.y1, w.y2) + t}; }
/* Şekil değişince kapı/pencereleri yeni duvarlarına oturt; duvarı kalmayan dış cephe açıklıklarını kaldır */
function reseatOpenings(P) {
  const segs = computeWalls(P);
  P.items = P.items.filter(it => {
    if (!isOpening(it)) return true;
    const s = wallOf(it, segs);
    if (s) { const q = quarter(it.rot), keepRot = it.rot, keepFlip = it.flip; seatOnWall(it, s, s.h ? it.cx : it.cy); if (q >= 0 && (q % 2 === 0) === !!s.h) { it.rot = keepRot; it.flip = keepFlip; } it.cx = r3(it.cx); it.cy = r3(it.cy); return true; }
    return inShop(P, it.cx, it.cy);
  });
}
