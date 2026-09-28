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

/* ---------- Duvarlar ----------
   Dış duvarlar iç ölçünün dışında (kalınlık OUTER_T). İç duvarlar oda kenarlarından türetilir,
   çizgisi üzerinde ortalanır (INNER_T). Aynı hattaki kenarlar birleştirilir.
   seg: {h: yatay mı, c: hat koordinatı, a..b: hat boyunca aralık, t: kalınlık, outer, open: [boşluklar]} */
function computeWalls(P) {
  const W = P.shop.w, D = P.shop.d, to = OUTER_T, ti = INNER_T, E = 0.03;
  const segs = [
    {h: 1, c: -to / 2, a: -to, b: W + to, t: to, outer: 1},
    {h: 1, c: D + to / 2, a: -to, b: W + to, t: to, outer: 1},
    {h: 0, c: -to / 2, a: 0, b: D, t: to, outer: 1},
    {h: 0, c: W + to / 2, a: 0, b: D, t: to, outer: 1},
  ];
  const H = new Map(), V = new Map();
  const add = (map, c, a, b, lim) => {
    a = Math.max(a, 0); b = Math.min(b, lim); if (b - a < 0.02) return;
    const k = Math.round(c * 200) / 200;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push([a, b]);
  };
  for (const r of P.rooms) {
    for (const y of [r.y, r.y + r.d]) if (y > E && y < D - E) add(H, y, r.x, r.x + r.w, W);
    for (const x of [r.x, r.x + r.w]) if (x > E && x < W - E) add(V, x, r.y, r.y + r.d, D);
  }
  const merge = list => {
    list.sort((p, q) => p[0] - q[0]); const out = [];
    for (const [a, b] of list) { const l = out[out.length - 1]; if (l && a <= l[1] + 0.005) l[1] = Math.max(l[1], b); else out.push([a, b]); }
    return out;
  };
  for (const [k, l] of H) for (const [a, b] of merge(l)) segs.push({h: 1, c: k, a: Math.max(0, a - ti / 2), b: Math.min(W, b + ti / 2), t: ti});
  for (const [k, l] of V) for (const [a, b] of merge(l)) segs.push({h: 0, c: k, a, b, t: ti});
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
  if (s.outer && s.h) return [s.a + OUTER_T, s.b - OUTER_T];
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
  const inward = s.h ? (s.c < 0 ? 0 : 180) : (s.c < 0 ? 270 : 90);
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
  const bad = new Set(), zoneBad = new Set(), issues = [];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (polyOverlap(a.poly, b.poly)) { bad.add(a.it.id); bad.add(b.it.id); issues.push({id: a.it.id, t: `${nm(a.it)} ile ${nm(b.it)} üst üste`}); }
  }
  for (const s of solids) {
    if (polyOutside(s.poly, W, D)) { bad.add(s.it.id); issues.push({id: s.it.id, t: `${nm(s.it)} dükkânın dışına taşıyor`}); continue; }
    if (s.it.type !== 'column' && walls.some(w => polyOverlap(s.poly, w, 0.015))) { bad.add(s.it.id); issues.push({id: s.it.id, t: `${nm(s.it)} duvarın içine giriyor`}); }
  }
  const blocker = (poly, self) => {
    for (const s of solids) if (s.it !== self && polyOverlap(poly, s.poly)) return nm(s.it);
    if (walls.some(w => polyOverlap(poly, w, 0.015))) return 'duvar';
    if (polyOutside(poly, W, D, 0.02)) return 'dış duvar';
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
