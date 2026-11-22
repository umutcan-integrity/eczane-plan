/* =====================================================================
   Levha yerleşimi (giyotin kesim): panel ebatlama makinesinde
   uçtan uca düz kesimlerle çıkarılabilecek yerleşim üretir.
   Levha x ekseni = levha boyu (desen yönü). Testere payı (kerf) ve
   kenar traşlama payı (trim) hesaba katılır.
   ===================================================================== */
function nestGroup(G, job) {
  const m = G.m, kerf = job.kerf, trim = job.trim, grain = !!m.grain;
  const PL = m.L - 2 * trim, PW = m.W - 2 * trim;
  const items = [];
  for (const r of G.rows) if (!r.off) for (let i = 0; i < r.n; i++) items.push({no: r.no, l: r.cL, w: r.cW, row: r});
  const fits = it => (it.l <= PL + 1e-6 && it.w <= PW + 1e-6) || (!grain && it.w <= PL + 1e-6 && it.l <= PW + 1e-6);
  const bad = items.filter(i => !fits(i)), ok = items.filter(fits);
  const orders = [
    (a, b) => b.l * b.w - a.l * a.w,
    (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w,
    (a, b) => b.l - a.l || b.w - a.w,
    (a, b) => b.w - a.w || b.l - a.l,
  ];
  let best = null;
  for (const ord of orders) for (const rule of ['short', 'long']) {
    const r = pack([...ok].sort(ord), rule);
    if (!best || r.sheets.length < best.sheets.length || (r.sheets.length === best.sheets.length && r.last < best.last)) best = r;
  }
  const sheets = best ? best.sheets : [];
  for (const sh of sheets) { sh.area = sh.parts.reduce((a, p) => a + p.a * p.b, 0); sh.use = sh.area / (PL * PW); }
  const used = sheets.reduce((a, s) => a + s.area, 0);
  return {sheets, bad, PL, PW, L: m.L, W: m.W, trim, kerf, grain, use: sheets.length ? used / (sheets.length * m.L * m.W) : 0};

  function pack(list, rule) {
    const sheets = [];
    const find = (sh, it) => {
      let bf = null;
      for (const f of sh.free) for (const rot of grain ? [0] : [0, 1]) {
        const a = rot ? it.w : it.l, b = rot ? it.l : it.w;
        if (a + kerf <= f.w + 1e-6 && b + kerf <= f.h + 1e-6) {
          const s1 = Math.min(f.w - a, f.h - b), s2 = Math.max(f.w - a, f.h - b);
          if (!bf || s1 < bf.s1 - 1e-6 || (Math.abs(s1 - bf.s1) < 1e-6 && s2 < bf.s2)) bf = {sh, f, rot, a, b, s1, s2};
        }
      }
      return bf;
    };
    for (const it of list) {
      let bf = null;
      for (const sh of sheets) { const c = find(sh, it); if (c && (!bf || c.s1 < bf.s1)) bf = c; }
      if (!bf) { const sh = {free: [{x: 0, y: 0, w: PL + kerf, h: PW + kerf}], parts: []}; sheets.push(sh); bf = find(sh, it); if (!bf) continue; }
      const {sh, f, a, b, rot} = bf, A = a + kerf, B = b + kerf;
      sh.parts.push({no: it.no, row: it.row, x: f.x, y: f.y, a, b, rot});
      sh.free.splice(sh.free.indexOf(f), 1);
      const wR = f.w - A, hR = f.h - B;
      const horiz = rule === 'short' ? wR < hR : wR >= hR;
      const r1 = horiz ? {x: f.x + A, y: f.y, w: wR, h: B} : {x: f.x + A, y: f.y, w: wR, h: f.h};
      const r2 = horiz ? {x: f.x, y: f.y + B, w: f.w, h: hR} : {x: f.x, y: f.y + B, w: A, h: hR};
      for (const r of [r1, r2]) if (r.w > kerf + 20 && r.h > kerf + 20) sh.free.push(r);
    }
    const lastSh = sheets[sheets.length - 1];
    return {sheets, last: lastSh ? lastSh.parts.reduce((a, p) => a + p.a * p.b, 0) : 0};
  }
}

/* Levha çizimi (SVG, mm ölçekli) */
function sheetSVG(N, sh, opts = {}) {
  const {L, W, trim} = N, fs = Math.max(40, Math.min(L, W) / 18);
  const svg = sv('svg', {viewBox: `0 0 ${L} ${W}`, role: 'img', 'aria-label': `Levha ${L} × ${W}`});
  svg.append(sv('defs', null, sv('pattern', {id: 'hatch', width: 40, height: 40, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'}, sv('rect', {width: 40, height: 40, class: 'pl', style: 'fill:transparent'}), sv('line', {x1: 0, y1: 0, x2: 0, y2: 40, class: 'gr'}))));
  svg.append(sv('rect', {x: 0, y: 0, width: L, height: W, class: 'pl'}));
  svg.append(sv('rect', {x: trim, y: trim, width: N.PL, height: N.PW, class: 'us'}));
  if (N.grain) svg.append(sv('path', {d: `M${L - 260} ${W - 30}h200m-40 -18l40 18l-40 18`, fill: 'none', stroke: 'currentColor', 'stroke-width': 6, class: 'gr', style: 'opacity:.7'}));
  for (const p of sh.parts) {
    const x = trim + p.x, y = trim + p.y, g = sv('g', {'data-no': p.no});
    const r = sv('rect', {x, y, width: p.a, height: p.b, class: 'pt' + (opts.sel && opts.sel(p) ? ' on' : '')});
    if (opts.onPick) r.addEventListener('click', () => opts.onPick(p));
    r.append(sv('title', null, `${p.no} · ${p.row.name} · ${fmt(p.row.cL)} × ${fmt(p.row.cW)} mm${p.rot ? ' (döndürülmüş)' : ''}`));
    g.append(r);
    const mn = Math.min(p.a, p.b);
    if (mn > fs * 1.3) {
      const big = Math.min(fs * 1.25, mn * .4);
      g.append(sv('text', {x: x + p.a / 2, y: y + p.b / 2 + (p.b > big * 3.2 ? -big * .25 : big * .35), 'font-size': big, 'font-weight': 800, 'text-anchor': 'middle'}, String(p.no)));
      if (p.b > big * 3.2 && p.a > fs * 5) g.append(sv('text', {x: x + p.a / 2, y: y + p.b / 2 + big * .95, 'font-size': fs * .8, 'text-anchor': 'middle'}, `${fmt(p.rot ? p.b : p.a)} × ${fmt(p.rot ? p.a : p.b)}`));
    } else if (mn > fs * .95) g.append(sv('text', {x: x + p.a / 2, y: y + p.b / 2 + fs * .3, 'font-size': fs * .8, 'font-weight': 800, 'text-anchor': 'middle'}, String(p.no)));
    if (p.rot && mn > fs * .95) g.append(sv('text', {x: x + 8, y: y + fs * .8, 'font-size': fs * .6, style: 'opacity:.7'}, '↻'));
    svg.append(g);
  }
  return svg;
}
