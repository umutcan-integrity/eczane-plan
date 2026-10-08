/* =====================================================================
   Kroki (rölöve planı): A4 dikey, ölçekli, siyah-beyaz; il/ilçe sağlık
   müdürlüğü başvurularındaki biçimde. PDF (A4) ve PNG olarak verilir.
   ===================================================================== */

const KROKI_FONT = 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", "DejaVu Sans", sans-serif';
const fm2 = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');

const Kroki = {
  opts(P) {
    const sign = (P.sign ?? P.name ?? '').trim().toLocaleUpperCase('tr-TR');
    const name = sign ? (/ECZANE/.test(sign) ? sign : sign + ' ECZANESİ') : '';
    return Object.assign({title: 'ECZANE RÖLÖVE PLANI', name, pharmacist: '', address: '', scale: 'auto', rot: 'auto', north: 0, sign: true, items: true, salesName: 'ECZANE SATIŞ ALANI'}, P.kroki || {});
  },

  /* Net alanlar: 2 cm ızgarada duvar/kolon düşülerek hesaplanır */
  areas(P, segs) {
    const W = P.shop.w, D = P.shop.d, c = .02, nx = Math.max(1, Math.ceil(W / c)), ny = Math.max(1, Math.ceil(D / c));
    const g = new Int16Array(nx * ny);
    const fill = (x0, y0, x1, y1, v) => {
      const i0 = clamp(Math.round(x0 / c), 0, nx), i1 = clamp(Math.round(x1 / c), 0, nx), j0 = clamp(Math.round(y0 / c), 0, ny), j1 = clamp(Math.round(y1 / c), 0, ny);
      for (let j = j0; j < j1; j++) g.fill(v, j * nx + i0, j * nx + i1);
    };
    const rooms = P.rooms.map((r, i) => ({r, i})).sort((a, b) => b.r.w * b.r.d - a.r.w * a.r.d);
    for (const {r, i} of rooms) fill(r.x, r.y, r.x + r.w, r.y + r.d, i + 1);
    for (const w of wallPieces(segs, () => false)) fill(w.x0, w.y0, w.x1, w.y1, -1);
    for (const v of P.voids || []) fill(v.x - .05, v.y - .05, v.x + v.w + .05, v.y + v.d + .05, -1);
    for (const it of P.items) if (it.type === 'column') { const b = itemBox(it); fill(b.x0, b.y0, b.x1, b.y1, -1); }
    const cnt = new Float64Array(P.rooms.length + 1);
    for (let k = 0; k < g.length; k++) if (g[k] >= 0) cnt[g[k]]++;
    const a = c * c;
    // Satış alanı etiketi için duvarlardan en uzak nokta (pah mesafe dönüşümü)
    let pole = null;
    if (cnt[0] > 0) {
      const INF = 1e9, d = new Float32Array(nx * ny);
      for (let k = 0; k < d.length; k++) d[k] = g[k] === 0 ? INF : 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i; if (!d[k]) continue;
        let v = Math.min(d[k], i + 1, j + 1);
        if (i) v = Math.min(v, d[k - 1] + 1); if (j) v = Math.min(v, d[k - nx] + 1);
        if (i && j) v = Math.min(v, d[k - nx - 1] + 1.4); if (j && i < nx - 1) v = Math.min(v, d[k - nx + 1] + 1.4);
        d[k] = v;
      }
      let best = -1;
      for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i; if (!d[k]) continue;
        let v = Math.min(d[k], nx - i, ny - j);
        if (i < nx - 1) v = Math.min(v, d[k + 1] + 1); if (j < ny - 1) v = Math.min(v, d[k + nx] + 1);
        if (i < nx - 1 && j < ny - 1) v = Math.min(v, d[k + nx + 1] + 1.4); if (i && j < ny - 1) v = Math.min(v, d[k + nx - 1] + 1.4);
        d[k] = v;
        if (v > best) { best = v; pole = [(i + .5) * c, (j + .5) * c]; }
      }
    }
    const roomAreas = P.rooms.map((r, i) => ({r, a: cnt[i + 1] * a}));
    const sales = cnt[0] * a;
    return {sales, rooms: roomAreas, useful: sales + roomAreas.reduce((s, x) => s + x.a, 0), net: shopArea(P), pole};
  },

  /* Etiket yerleri: her bölgede duvar ve eşyalardan en uzak nokta (5 cm ızgara) */
  labelPoints(P, segs) {
    const W = P.shop.w, D = P.shop.d, c = .05, nx = Math.max(1, Math.ceil(W / c)), ny = Math.max(1, Math.ceil(D / c));
    const g = new Int16Array(nx * ny);
    const fill = (x0, y0, x1, y1, v) => {
      const i0 = clamp(Math.floor(x0 / c), 0, nx), i1 = clamp(Math.ceil(x1 / c), 0, nx), j0 = clamp(Math.floor(y0 / c), 0, ny), j1 = clamp(Math.ceil(y1 / c), 0, ny);
      for (let j = j0; j < j1; j++) g.fill(v, j * nx + i0, j * nx + i1);
    };
    P.rooms.map((r, i) => ({r, i})).sort((a, b) => b.r.w * b.r.d - a.r.w * a.r.d).forEach(({r, i}) => fill(r.x, r.y, r.x + r.w, r.y + r.d, i + 1));
    for (const w of wallPieces(segs, () => false)) fill(w.x0, w.y0, w.x1, w.y1, -1);
    for (const v of P.voids || []) fill(v.x - .05, v.y - .05, v.x + v.w + .05, v.y + v.d + .05, -1);
    for (const it of P.items) if (it.type !== 'zone' && it.type !== 'human') { const b = itemBox(it); fill(b.x0 - .05, b.y0 - .05, b.x1 + .05, b.y1 + .05, -1); }
    const out = [];
    const d = new Float32Array(nx * ny);
    for (let v = 0; v <= P.rooms.length; v++) {
      for (let k = 0; k < d.length; k++) d[k] = g[k] === v ? 1e9 : 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i; if (!d[k]) continue;
        let t = Math.min(d[k], i + 1, j + 1);
        if (i) t = Math.min(t, d[k - 1] + 1); if (j) t = Math.min(t, d[k - nx] + 1);
        if (i && j) t = Math.min(t, d[k - nx - 1] + 1.41); if (j && i < nx - 1) t = Math.min(t, d[k - nx + 1] + 1.41);
        d[k] = t;
      }
      let best = 0, pt = null;
      for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i; if (!d[k]) continue;
        let t = Math.min(d[k], nx - i, ny - j);
        if (i < nx - 1) t = Math.min(t, d[k + 1] + 1); if (j < ny - 1) t = Math.min(t, d[k + nx] + 1);
        if (i < nx - 1 && j < ny - 1) t = Math.min(t, d[k + nx + 1] + 1.41); if (i && j < ny - 1) t = Math.min(t, d[k + nx - 1] + 1.41);
        d[k] = t;
        if (t > best) { best = t; pt = [(i + .5) * c, (j + .5) * c]; }
      }
      out.push(pt ? {x: pt[0], y: pt[1], r: best * c} : null);
    }
    return out;
  },

  /* Giriş kapısı ve hangi dış kenarda olduğu */
  entrance(P, segs) {
    const doors = P.items.filter(it => it.type === 'door').map(it => ({it, s: wallOf(it, segs)})).filter(o => o.s && o.s.outer);
    doors.sort((a, b) => (b.it.style === 'double') - (a.it.style === 'double') || b.it.w - a.it.w);
    if (!doors.length) return null;
    const {it, s} = doors[0];
    const side = s.h ? (s.n < 0 ? 't' : 'b') : (s.n < 0 ? 'l' : 'r');
    const out = {t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0]}[side];
    return {it, s, side, out};
  },

  label(it) {
    if (/reçete/i.test(it.name)) return {small: it.name.toLocaleLowerCase('tr-TR')};
    switch (it.type) {
      case 'counter': return {t: 'BANKO'};
      case 'table': return {t: 'MASA'};
      case 'cabinet':
        switch (it.style) {
          case 'gondola': case 'wstand': return {t: 'STAND'};
          case 'glass': return {t: 'VİTRİN'};
          case 'fridge': return {t: 'BUZDOLABI'};
          case 'kitchen': return {t: 'TEZGAH'};
          case 'closed': return {t: 'DOLAP'};
          default: return {t: 'RAF'};
        }
    }
    return null;
  },

  /* Bir dış kenar boyunca parça ölçü noktaları */
  chainPts(segs, side, W, D) {
    const horiz = side === 't' || side === 'b', L = horiz ? W : D, pts = new Set([0, L]);
    for (const sg of segs) {
      if (sg.outer) {
        const on = horiz ? (sg.h && (side === 't' ? sg.c < 0 : sg.c > D)) : (!sg.h && (side === 'l' ? sg.c < 0 : sg.c > W));
        if (on) for (const op of sg.open) { pts.add(r3(clamp(op.a, 0, L))); pts.add(r3(clamp(op.b, 0, L))); }
      } else if (horiz ? !sg.h : sg.h) {
        const touches = side === 't' || side === 'l' ? sg.a <= INNER_T : sg.b >= (horiz ? D : W) - INNER_T;
        if (touches) { pts.add(r3(sg.c - sg.t / 2)); pts.add(r3(sg.c + sg.t / 2)); }
      }
    }
    return [...pts].sort((a, b) => a - b);
  },

  /* ---------- Çizim ---------- */
  render(P, o, dpi = 300) {
    const MM = dpi / 25.4, PW = 210, PH = 297;
    const cv = document.createElement('canvas'); cv.width = Math.round(PW * MM); cv.height = Math.round(PH * MM);
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
    const PT = () => g.setTransform(MM, 0, 0, MM, 0, 0);
    const INK = '#111111';
    // Metin (mm cinsinden, piksel uzayında çizilir → keskin)
    const text = (str, x, y, size, opt = {}) => {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.translate(x * MM, y * MM); if (opt.rot) g.rotate(opt.rot * D2R);
      g.font = `${opt.bold ? 700 : 400} ${size * MM}px ${KROKI_FONT}`;
      g.fillStyle = opt.color || INK; g.textAlign = opt.align || 'center'; g.textBaseline = opt.base || 'alphabetic';
      g.fillText(str, 0, 0); g.restore();
    };
    const tw = (str, size, bold) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = `${bold ? 700 : 400} ${size * MM}px ${KROKI_FONT}`; const w = g.measureText(str).width / MM; g.restore(); return w; };
    const line = (x1, y1, x2, y2, lw) => { PT(); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); };
    const rect = (x, y, w, h, lw) => { PT(); g.lineWidth = lw; g.strokeStyle = INK; g.strokeRect(x, y, w, h); };

    // Çerçeveler
    rect(.6, .6, PW - 1.2, PH - 1.2, .2);
    rect(7.4, 7.4, PW - 14.8, PH - 14.8, .45);

    const segs = computeWalls(P), W = P.shop.w, D = P.shop.d, H = P.shop.h || 2.8;
    const ent = this.entrance(P, segs);
    const th = o.rot === 'auto' ? ({b: 0, t: 180, l: 270, r: 90}[ent ? ent.side : 'b']) : (+o.rot || 0);
    const cs = Math.round(Math.cos(th * D2R)), sn = Math.round(Math.sin(th * D2R));
    const R = (x, y) => [x * cs - y * sn, x * sn + y * cs];

    // Ölçek ve yerleşim
    const X0 = 14, X1 = 119, Y0 = 16, Y1 = 266;
    const bw = (th % 180 === 0 ? W : D) + OUTER_T * 2, bh = (th % 180 === 0 ? D : W) + OUTER_T * 2, marg = 22;
    let den = +o.scale || 0;
    if (!den) den = [100, 200, 250, 500, 1000].find(dd => bw * 1000 / dd + marg <= X1 - X0 && bh * 1000 / dd + marg <= Y1 - Y0) || 1000;
    const k = 1000 / den; // mm / m
    const pcx = (X0 + X1) / 2 + 3, pcy = (Y0 + Y1) / 2;
    const toPage = (x, y) => { const [a, b] = R(x - W / 2, y - D / 2); return [pcx + a * k, pcy + b * k]; };
    const WT = () => g.setTransform(MM * k * cs, MM * k * sn, -MM * k * sn, MM * k * cs, MM * (pcx - (W / 2 * cs - D / 2 * sn) * k), MM * (pcy - (W / 2 * sn + D / 2 * cs) * k));
    const wl = mm => mm / k; // mm → dünya birimi (çizgi kalınlığı)
    const readable = a => { a = ((a % 360) + 360) % 360; if (a > 90 && a <= 270) a -= 180; return a > 180 ? a - 360 : a; };

    // Eşyalar (duvarların altında kalsın)
    WT();
    if (o.items) for (const it of P.items) {
      if (it.type === 'human' || it.type === 'zone' || isOpening(it) || it.type === 'column') continue;
      g.save(); g.translate(it.cx, it.cy); g.rotate(it.rot * D2R);
      g.lineWidth = wl(.18); g.strokeStyle = INK; g.fillStyle = '#FFFFFF';
      const w = it.w, d = it.d;
      if (it.type === 'fixture') {
        if (it.style === 'toilet') {
          const t = Math.min(.2, d * .28);
          g.beginPath(); g.rect(-w / 2, -d / 2, w, t); g.fill(); g.stroke();
          g.beginPath(); g.ellipse(0, -d / 2 + t + (d - t) / 2, w / 2 * .9, (d - t) / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        } else {
          g.beginPath(); g.rect(-w / 2, -d / 2, w, d); g.fill(); g.stroke();
          g.beginPath(); g.ellipse(0, .02, w / 2 * .7, d / 2 * .6, 0, 0, Math.PI * 2); g.stroke();
        }
      } else if (isRound(it)) { g.beginPath(); g.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
      else {
        g.beginPath(); g.rect(-w / 2, -d / 2, w, d); g.fill(); g.stroke();
        if (it.type === 'cabinet' && it.style === 'kitchen') { // evye
          const sw = Math.min(.5, w * .3), sx = -w / 2 + Math.min(.25, w * .1);
          g.beginPath(); g.rect(sx, -d / 2 + .08, sw, d - .16); g.stroke();
          g.beginPath(); g.arc(sx + sw / 2, 0, .025, 0, Math.PI * 2); g.stroke();
        }
      }
      g.restore();
    }
    // Duvarlar: birleşik çift çizgi (siyah genişletilmiş + beyaz iç)
    const pieces = wallPieces(segs);
    const e = wl(.32);
    g.fillStyle = INK; for (const r of pieces) g.fillRect(r.x0 - e, r.y0 - e, r.x1 - r.x0 + 2 * e, r.y1 - r.y0 + 2 * e);
    g.fillStyle = '#FFFFFF'; for (const r of pieces) g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    // Kolonlar
    for (const it of P.items) if (it.type === 'column') {
      g.save(); g.translate(it.cx, it.cy); g.rotate(it.rot * D2R);
      g.fillStyle = '#FFFFFF'; g.fillRect(-it.w / 2, -it.d / 2, it.w, it.d);
      g.lineWidth = wl(.32); g.strokeStyle = INK; g.strokeRect(-it.w / 2, -it.d / 2, it.w, it.d); g.restore();
    }
    // Pencereler ve kapılar
    const doorLabels = [];
    for (const it of P.items) {
      if (!isOpening(it)) continue;
      g.save(); g.translate(it.cx, it.cy); g.rotate(it.rot * D2R);
      const w = it.w, d = it.d;
      g.strokeStyle = INK;
      g.lineWidth = wl(.32); g.beginPath(); g.moveTo(-w / 2, -d / 2); g.lineTo(-w / 2, d / 2); g.moveTo(w / 2, -d / 2); g.lineTo(w / 2, d / 2); g.stroke();
      if (it.type === 'window') {
        g.lineWidth = wl(.16); g.beginPath();
        for (const y of [-d / 2, -d / 6, d / 6, d / 2]) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); }
        g.stroke();
      } else if (it.style === 'sliding') {
        g.lineWidth = wl(.18); g.strokeRect(-w / 2, -.03, w * .55, .03); g.strokeRect(-w / 2 + w * .45, 0, w * .55, .03);
      } else {
        const y = d / 2, leaves = it.style === 'double' ? [[-w / 2, w / 2, 1], [w / 2, w / 2, -1]] : [[it.flip ? w / 2 : -w / 2, w, it.flip ? -1 : 1]];
        for (const [hx, L, dir] of leaves) {
          g.lineWidth = wl(.22); g.beginPath(); g.moveTo(hx, y); g.lineTo(hx, y + L); g.stroke();
          g.lineWidth = wl(.14); g.beginPath(); g.arc(hx, y, L, Math.PI / 2, dir > 0 ? 0 : Math.PI, dir > 0); g.stroke();
        }
        doorLabels.push(it);
      }
      g.restore();
    }
    WT(); // dönüşüm geri
    // Kapı etiketleri: 90/210 (duvar boyunca, açılış tarafında)
    for (const it of doorLabels) {
      const [lx, ly] = toWorld(it, 0, it.d / 2 + .22 + 1.6 / k);
      const [px, py] = toPage(lx, ly);
      text(`${fmtCm(it.w)}/${fmtCm(it.h)}`, px, py, 2.1, {rot: readable(it.rot + th), base: 'middle'});
    }

    // Eşya etiketleri
    if (o.items) for (const it of P.items) {
      const L = this.label(it); if (!L) continue;
      const [px, py] = toPage(it.cx, it.cy);
      const long = it.w >= it.d, len = (long ? it.w : it.d) * k, sh = (long ? it.d : it.w) * k;
      const ang = readable(it.rot + th + (long ? 0 : 90));
      if (L.small) {
        const [qx, qy] = toPage(...toWorld(it, 0, -it.d / 2 - 2.6 / k));
        const parts = L.small.split(' ');
        const half = Math.ceil(parts.length * .6);
        text(parts.slice(0, half).join(' '), qx, qy - 1.2, 1.7, {});
        text(parts.slice(half).join(' '), qx, qy + .9, 1.7, {});
        continue;
      }
      let fs = 2.1;
      const w1 = tw(L.t, 1);
      fs = Math.min(fs, (len - 1) / w1, sh * .8);
      if (fs >= 1.1) text(L.t, px, py, fs, {rot: ang, base: 'middle'});
    }

    // Oda adları ve alanları
    const A = this.areas(P, segs);
    const roomText = (lines, cxp, cyp, wpg, hpg, maxFs) => {
      let fs = maxFs;
      for (const l of lines) fs = Math.min(fs, (wpg * .9) / tw(l, 1));
      fs = Math.min(fs, hpg * .8 / (lines.length * 1.25));
      if (fs < .9) return;
      const lh = fs * 1.22, y0 = cyp - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => text(l, cxp, y0 + i * lh, fs, {base: 'middle'}));
    };
    const LP = this.labelPoints(P, segs);
    A.rooms.forEach(({r, a}, i) => {
      const lp = LP[i + 1], rw = (th % 180 === 0 ? r.w : r.d) * k, rh = (th % 180 === 0 ? r.d : r.w) * k;
      const pos = lp && lp.r * k > 3 ? [lp.x, lp.y] : [r.x + r.w / 2, r.y + r.d / 2];
      const [px, py] = toPage(...pos);
      const room = Math.min(rw, rh), free = lp ? lp.r * k * 2 : room;
      const maxFs = clamp(room * .12, 1.3, 3.0);
      roomText([r.name.toLocaleUpperCase('tr-TR'), `A = ${fm2(a)} m2`, `H = ${fm2(H)} m`], px, py, Math.max(free * 1.25, Math.min(rw, 14)), Math.max(free * 1.1, 6), maxFs);
    });
    if (A.sales > .5) {
      const lp = LP[0], pos = lp ? [lp.x, lp.y] : A.pole;
      if (pos) {
        const [px, py] = toPage(...pos), free = lp ? lp.r * k * 2 : 40;
        roomText([o.salesName || 'ECZANE SATIŞ ALANI', `A = ${fm2(A.sales)} m2`, `H = ${fm2(H)} m`], px, py, Math.min(Math.max(free * 1.6, 18), Math.min(W, D) * k * 1.1), Math.max(free * 1.2, 10), 3.0);
      }
    }

    // Ölçüler
    const dim = (p1, p2, nrm, offMM, label, ext = true) => {
      const [x1, y1] = toPage(...p1), [x2, y2] = toPage(...p2), [nx, ny] = R(...nrm);
      const ax = x1 + nx * offMM, ay = y1 + ny * offMM, bx = x2 + nx * offMM, by = y2 + ny * offMM;
      const L = Math.hypot(bx - ax, by - ay); if (L < 2) return;
      PT(); g.strokeStyle = INK;
      if (ext) { g.lineWidth = .1; g.beginPath(); g.moveTo(x1 + nx * .8, y1 + ny * .8); g.lineTo(ax + nx * 1, ay + ny * 1); g.moveTo(x2 + nx * .8, y2 + ny * .8); g.lineTo(bx + nx * 1, by + ny * 1); g.stroke(); }
      g.lineWidth = .13; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
      const ux = (bx - ax) / L, uy = (by - ay) / L, t = .7;
      for (const [x, y] of [[ax, ay], [bx, by]]) { g.moveTo(x - (ux + uy * -1) * t * .7, y - (uy + ux) * t * .7); g.lineTo(x + (ux + uy * -1) * t * .7, y + (uy + ux) * t * .7); }
      g.stroke();
      const ang = readable(Math.atan2(by - ay, bx - ax) / D2R);
      const fs = 1.7, w = tw(label, fs);
      if (w > L - .6) return;
      // yazı çizginin dış tarafında
      const sgn = (ny * Math.cos(ang * D2R) - nx * Math.sin(ang * D2R)) >= 0 ? 1 : -1;
      const ox = -Math.sin(ang * D2R) * .9 * sgn, oy = Math.cos(ang * D2R) * .9 * sgn;
      text(label, (ax + bx) / 2 + ox, (ay + by) / 2 + oy, fs, {rot: ang, base: 'middle'});
    };
    // oda iç ölçüleri
    for (const r of P.rooms) {
      const x0 = r.x + (r.x > .03 ? INNER_T / 2 : 0), x1 = r.x + r.w - (r.x + r.w < W - .03 ? INNER_T / 2 : 0);
      const y0 = r.y + (r.y > .03 ? INNER_T / 2 : 0), y1 = r.y + r.d - (r.y + r.d < D - .03 ? INNER_T / 2 : 0);
      if ((x1 - x0) * k > 8) dim([x0, y0], [x1, y0], [0, 1], 2.4, fmtCm(x1 - x0), false);
      if ((y1 - y0) * k > 8) dim([x0, y0], [x0, y1], [1, 0], 2.4, fmtCm(y1 - y0), false);
    }
    // dış ölçüler: her dış duvar parçası boyunca parça + toplam (giriş duvarı hariç)
    for (const sg of segs) {
      if (!sg.outer || (ent && ent.s === sg)) continue;
      const nrm = sg.h ? [0, sg.n] : [sg.n, 0], c0 = sg.e + sg.n * OUTER_T;
      const P2 = v => sg.h ? [v, c0] : [c0, v];
      const pts = segChain(sg, segs);
      if (pts.length > 2) for (let i = 0; i < pts.length - 1; i++) dim(P2(pts[i]), P2(pts[i + 1]), nrm, 3.5, fmtCm(pts[i + 1] - pts[i]), i === 0);
      dim(P2(sg.ea), P2(sg.eb), nrm, pts.length > 2 ? 7.5 : 3.5, fmtCm(sg.eb - sg.ea));
    }

    // Giriş oku
    if (ent) {
      const [dx, dy] = toPage(ent.it.cx, ent.it.cy), [ox, oy] = R(...ent.out);
      const base = OUTER_T * k / 2 + 2.2;
      const tipX = dx + ox * base, tipY = dy + oy * base, Lh = 5, Wd = 3.4;
      const bxp = tipX + ox * Lh, byp = tipY + oy * Lh, px = -oy, py = ox;
      PT(); g.fillStyle = '#E2231A'; g.beginPath();
      g.moveTo(tipX, tipY); g.lineTo(bxp + px * Wd, byp + py * Wd); g.lineTo(tipX + ox * Lh * .62, tipY + oy * Lh * .62); g.lineTo(bxp - px * Wd, byp - py * Wd); g.closePath(); g.fill();
      text('ECZANE GİRİŞİ', tipX + ox * (Lh + 5), tipY + oy * (Lh + 5), 2.6, {base: 'middle', rot: 0});
    }

    // ---- Sağ sütun
    const cx = 158.5;
    // Kuzey oku
    {
      const nx = 187, ny = 25, r = 7, a = (o.north || 0) + th;
      PT(); g.save(); g.translate(nx, ny); g.rotate(a * D2R);
      g.lineWidth = .3; g.strokeStyle = INK; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(0, -r - 3.5); g.lineTo(-3.2, r * .55); g.lineTo(0, r * .2); g.closePath(); g.fillStyle = INK; g.fill();
      g.beginPath(); g.moveTo(0, -r - 3.5); g.lineTo(3.2, r * .55); g.lineTo(0, r * .2); g.closePath(); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = .25; g.stroke();
      g.restore();
      const q = r * .55 + 2.6;
      text('N', nx - Math.sin(a * D2R) * q, ny + Math.cos(a * D2R) * q, 3.2, {bold: true, base: 'middle'});
    }
    // Başlık
    const title = (o.title || 'ECZANE RÖLÖVE PLANI').toLocaleUpperCase('tr-TR');
    let tfs = Math.min(7.6, 64 / tw(title, 1));
    text(title, cx, 46, tfs);
    text(`ÖLÇEK:1/${den}`, cx, 46 + tfs * 1.18, tfs);
    let y = 46 + tfs * 1.18 + 15;
    if (o.name) { const fs = Math.min(3.8, 64 / tw(o.name, 1)); text(o.name, cx, y, fs); y += 9.5; }
    const ph = `ECZACI ADI: ${(o.pharmacist || '').toLocaleUpperCase('tr-TR')}`;
    text(ph, cx, y, Math.min(3.8, 64 / tw(ph, 1))); y += 15;
    // Adres (satır kaydırmalı)
    const addr = [];
    for (const raw of String(o.address || '').toLocaleUpperCase('tr-TR').split(/\n/)) {
      let cur = '';
      for (const w of raw.trim().split(/\s+/).filter(Boolean)) { const t = cur ? cur + ' ' + w : w; if (tw(t, 3.6) > 64 && cur) { addr.push(cur); cur = w; } else cur = t; }
      if (cur) addr.push(cur);
    }
    for (const l of addr.slice(0, 7)) { text(l, cx, y, 3.6); y += 5.1; }
    // Alan tablosu
    const tx0 = 125, tx1 = 192;
    let ty = Math.max(y + 6, 126);
    const rows = [[o.salesName || 'ECZANE SATIŞ ALANI', A.sales], ...A.rooms.map(x => [x.r.name.toLocaleUpperCase('tr-TR'), x.a])];
    const rfs = rows.length > 8 ? 1.9 : 2.3, pitch = rfs * 1.9;
    let yy = ty + 4.6;
    for (const [n, a] of rows) {
      let nm = n + ':'; while (tw(nm, rfs) > 34 && nm.length > 4) nm = nm.slice(0, -2) + ':';
      text(nm, tx0 + 2, yy, rfs, {align: 'left'});
      text(`${fm2(a)} m2`, 166, yy, rfs, {align: 'right'});
      text(`H: ${fm2(H)} m`, 172, yy, rfs, {align: 'left'});
      yy += pitch;
    }
    const s1 = yy + 1.5;
    line(tx0, s1, tx1, s1, .2);
    text(`TOPLAM FAYDALI ALAN: ${fm2(A.useful)} m2`, (tx0 + tx1) / 2, s1 + 5.6, 2.8);
    const s2 = s1 + 8.6;
    line(tx0, s2, tx1, s2, .2);
    text(`TOPLAM NET ALAN:   ${fm2(A.net)} m2`, (tx0 + tx1) / 2, s2 + 5.6, 2.8);
    const tb = s2 + 8.6;
    rect(tx0, ty, tx1 - tx0, tb - ty, .25);
    // İmza tablosu
    if (o.sign) {
      const sy0 = Math.max(tb + 14, 200), sy1 = 273, rh = (sy1 - sy0) / 3;
      rect(tx0, sy0, tx1 - tx0, sy1 - sy0, .25);
      ['MİMAR:', 'İL/ İLÇE SAĞLIK:', 'ECZACI ODASI:'].forEach((t, i) => {
        if (i) line(tx0, sy0 + rh * i, tx1, sy0 + rh * i, .2);
        text(t, tx0 + 2.2, sy0 + rh * i + 5, 2.6, {align: 'left'});
      });
    }
    return {canvas: cv, den, areas: A};
  },

  /* ---------- Dışa aktarma ---------- */
  async pdf(P, o) {
    const {canvas} = this.render(P, o, 300);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', .94));
    const jpg = new Uint8Array(await blob.arrayBuffer());
    return makePdf(jpg, canvas.width, canvas.height, `${o.name || P.name} - Rölöve Planı`);
  },
  async png(P, o) {
    const {canvas} = this.render(P, o, 300);
    return new Promise(r => canvas.toBlob(r, 'image/png'));
  },

  /* ---------- Pencere ---------- */
  dialog() {
    const P = Ed.P; if (!P) return;
    const o = this.opts(P);
    const save = () => Ed.change(() => { P.kroki = Object.assign({}, o); }, 'kroki');
    let tmr = 0;
    const prev = h('div', {class: 'kprev'});
    const refresh = () => { clearTimeout(tmr); tmr = setTimeout(() => { try { const {canvas, den} = this.render(P, o, 70); prev.innerHTML = ''; prev.append(h('img', {src: canvas.toDataURL('image/png'), alt: 'Kroki önizleme'})); scaleNote.textContent = `Ölçek 1/${den} · A4 dikey`; } catch (e) { prev.textContent = 'Önizleme oluşturulamadı'; } }, 120); };
    const scaleNote = h('small', {class: 'note'});
    const field = (label, key, area) => {
      const inp = area ? h('textarea', {class: 'inp ta', rows: 3}) : h('input', {class: 'inp', maxlength: 80});
      inp.value = o[key] || '';
      inp.addEventListener('input', () => { o[key] = inp.value; save(); refresh(); });
      inp.addEventListener('keydown', e => e.stopPropagation());
      return h('label', {class: 'fl'}, h('span', null, label), inp);
    };
    const chips = (label, key, opts) => {
      const w = h('div', {class: 'chips'});
      const draw = () => { w.innerHTML = ''; for (const [v, t] of opts) w.append(h('button', {type: 'button', class: String(o[key]) === String(v) ? 'on' : '', onclick: () => { o[key] = v; save(); draw(); refresh(); }}, t)); };
      draw(); return h('div', {class: 'fl'}, h('span', null, label), w);
    };
    const sw = (key, t, sub) => { const i = h('input', {type: 'checkbox'}); i.checked = !!o[key]; i.onchange = () => { o[key] = i.checked; save(); refresh(); }; return h('label', {class: 'switch'}, i, h('span', null, t, h('small', null, sub))); };
    $('#modal').classList.add('wide');
    return modal(b => {
      b.append(h('h2', null, 'Kroki çizimi al'));
      b.append(h('p', null, 'Sağlık müdürlüğü başvurularındaki rölöve planı biçiminde, ölçekli A4 kroki. Bilgiler projeyle birlikte saklanır.'));
      const grid = h('div', {class: 'kgrid'});
      const left = h('div', {class: 'kcol'}), right = h('div', {class: 'kcol'});
      left.append(field('Plan başlığı', 'title'), field('Eczane adı', 'name'), field('Eczacı adı', 'pharmacist'), field('Adres', 'address', true), field('Satış alanı adı', 'salesName'));
      left.append(chips('Ölçek', 'scale', [['auto', 'Otomatik'], [50, '1/50'], [100, '1/100'], [200, '1/200']]));
      left.append(chips('Plan yönü', 'rot', [['auto', 'Giriş altta'], [0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']]));
      left.append(chips('Kuzey (planda)', 'north', [[0, '↑'], [45, '↗'], [90, '→'], [135, '↘'], [180, '↓'], [225, '↙'], [270, '←'], [315, '↖']]));
      left.append(sw('items', 'Raf, banko, stand çizimleri', 'Eşyalar RAF / BANKO / STAND yazılarıyla çizilir'));
      left.append(sw('sign', 'İmza tablosu', 'Mimar · İl/İlçe Sağlık · Eczacı Odası'));
      right.append(prev, scaleNote);
      const pdfB = h('button', {type: 'button', class: 'btn primary full', onclick: async () => { pdfB.disabled = true; pdfB.textContent = 'Hazırlanıyor…'; try { const blob = await this.pdf(P, o); download(safeFile(o.name || P.name) + '-kroki.pdf', blob); toast('Kroki PDF indirildi'); } catch (e) { toast('PDF oluşturulamadı', 'err'); } pdfB.disabled = false; pdfB.textContent = 'PDF indir (A4)'; }}, 'PDF indir (A4)');
      const pngB = h('button', {type: 'button', class: 'btn full', onclick: async () => { const blob = await this.png(P, o); download(safeFile(o.name || P.name) + '-kroki.png', blob); }}, 'PNG indir');
      right.append(h('div', {class: 'row2'}, pdfB, pngB));
      grid.append(left, right); b.append(grid);
      refresh();
    }, [{v: null, t: 'Kapat'}]).then(() => $('#modal').classList.remove('wide'));
  },
};

/* Tek sayfalık PDF: A4, JPEG gömülü */
function makePdf(jpg, wpx, hpx, title) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const W = 595.28, H = 841.89;
  const hex = s => { let r = 'FEFF'; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xFFFF) continue; r += c.toString(16).toUpperCase().padStart(4, '0'); } return `<${r}>`; };
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${wpx} /Height ${hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title ${hex(title)} /Producer (Eczane Plan) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);
  const xref = len;
  let x = 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, {type: 'application/pdf'});
}
