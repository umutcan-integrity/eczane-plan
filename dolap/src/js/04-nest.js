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
/* parça grupları: levha planında renk ve açıklama */
const PART_GROUPS = [
  {k: 'g', n: 'Gövde', kinds: ['side', 'top', 'bottom', 'rail', 'divider', 'sep']},
  {k: 's', n: 'Raf', kinds: ['shelf']},
  {k: 'd', n: 'Kapak', kinds: ['door']},
  {k: 'c', n: 'Çekmece', kinds: ['dfront', 'dside', 'dfb', 'dbottom']},
  {k: 'b', n: 'Arkalık', kinds: ['back']},
  {k: 'p', n: 'Baza', kinds: ['plinth']},
];
const partGroup = kind => PART_GROUPS.find(g => g.kinds.includes(kind)) || PART_GROUPS[0];

function sheetSVG(N, sh, opts = {}) {
  const {L, W, trim} = N, fs = Math.max(42, Math.min(L, W) / 17), m = fs * 1.9;
  const svg = sv('svg', {viewBox: `${-m} ${-m} ${L + m * 1.2} ${W + m * 1.2}`, role: 'img', 'aria-label': `Levha ${fmt(L)} × ${fmt(W)} mm`});
  svg.append(sv('defs', null, sv('pattern', {id: 'hatch', width: 36, height: 36, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'}, sv('line', {x1: 0, y1: 0, x2: 0, y2: 36, class: 'gr'}))));
  /* levha ölçüleri (dışarıda, oklu) */
  const arrow = (x1, y1, x2, y2, txt, vert) => {
    const g = sv('g', {class: 'sdim'}), a = fs * .45;
    g.append(sv('line', {x1, y1, x2, y2}));
    const ux = Math.sign(x2 - x1), uy = Math.sign(y2 - y1);
    g.append(sv('path', {d: `M${x1} ${y1}l${ux * a + uy * a * .45} ${uy * a - ux * a * .45}l${-uy * a * .9} ${ux * a * .9}Z`}));
    g.append(sv('path', {d: `M${x2} ${y2}l${-ux * a + uy * a * .45} ${-uy * a - ux * a * .45}l${-uy * a * .9} ${ux * a * .9}Z`}));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const t = sv('text', vert ? {x: mx - fs * .35, y: my, transform: `rotate(-90 ${mx - fs * .35} ${my})`, 'text-anchor': 'middle', 'font-size': fs * .85, 'font-weight': 700} : {x: mx, y: my - fs * .35, 'text-anchor': 'middle', 'font-size': fs * .85, 'font-weight': 700}, txt);
    g.append(t); svg.append(g);
  };
  arrow(0, -m * .45, L, -m * .45, `${fmt(L)} mm`);
  arrow(-m * .45, 0, -m * .45, W, `${fmt(W)} mm`, true);
  svg.append(sv('rect', {x: 0, y: 0, width: L, height: W, class: 'pl'}));
  svg.append(sv('rect', {x: trim, y: trim, width: N.PL, height: N.PW, class: 'us'}));
  if (N.grain) svg.append(sv('path', {d: `M${L - 300} ${W - 34}h220m-44 -20l44 20l-44 20`, fill: 'none', 'stroke-width': 7, class: 'gr', style: 'opacity:.9'}));
  const cw = .56; /* yaklaşık harf genişliği (font boyuna oranla) */
  for (const p of sh.parts) {
    const x = trim + p.x, y = trim + p.y, grp = partGroup(p.row.kind), g = sv('g', {'data-no': p.no, class: 'pg k-' + grp.k + (opts.sel && opts.sel(p) ? ' on' : '')});
    const r = sv('rect', {x, y, width: p.a, height: p.b, class: 'pt'});
    if (opts.onPick) g.addEventListener('click', () => opts.onPick(p));
    r.append(sv('title', null, `${p.no} · ${p.row.name} · ${fmt(p.row.cL)} × ${fmt(p.row.cW)} mm`));
    g.append(r);
    /* yazı: sığarsa "no · ad" + ölçü; dar parçada dik yazılır; sığmazsa yalnız numara */
    const vert = p.b > p.a * 1.15, len = vert ? p.b : p.a, thick = vert ? p.a : p.b;
    const name = `${p.no} · ${p.row.name}`, size = `${fmt(p.row.cL)} × ${fmt(p.row.cW)}`;
    const cx = x + p.a / 2, cy = y + p.b / 2, rot = vert ? {transform: `rotate(-90 ${cx} ${cy})`} : {};
    let f = Math.min(fs, thick / 2.6);
    const fitsName = name.length * f * cw < len * .92, fitsSize = size.length * f * .9 * cw < len * .92;
    if (f >= fs * .55 && fitsName && fitsSize && thick > f * 2.5) {
      g.append(sv('text', Object.assign({x: cx, y: cy - f * .15, 'font-size': f, 'font-weight': 750, 'text-anchor': 'middle'}, rot), name));
      g.append(sv('text', Object.assign({x: cx, y: cy + f * .95, 'font-size': f * .9, 'text-anchor': 'middle', class: 'sz'}, rot), size));
    } else {
      f = Math.min(fs, thick * .7, len / (String(p.no).length * cw + .6));
      if (f > fs * .4) g.append(sv('text', Object.assign({x: cx, y: cy + f * .35, 'font-size': f, 'font-weight': 800, 'text-anchor': 'middle'}, rot), String(p.no)));
    }
    svg.append(g);
  }
  return svg;
}
