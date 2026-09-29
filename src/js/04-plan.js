/* =====================================================================
   2B plan: çizim + etkileşim
   ===================================================================== */

const LIGHT_PLAN = {bg: '#FFFFFF', floor: '#FFFFFF', grid: '#EEF0EC', grid2: '#DADFD7', wall: '#2C3330', ink: '#1B211F', muted: '#6F7974',
  accent: '#1F7A5A', danger: '#C23A2B', warn: '#B26B12', ok: '#2E8555', dark: false};
function planColors() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  return {bg: g('--plan-bg'), floor: g('--plan-floor'), grid: g('--plan-grid'), grid2: g('--plan-grid2'), wall: g('--plan-wall'), ink: g('--plan-ink'),
    muted: g('--plan-muted'), accent: g('--accent'), danger: g('--danger'), warn: g('--warn'), ok: g('--ok'), dark: document.documentElement.dataset.mode === 'dark'};
}

/* ---------- Çizim (ekrana, küçük resme ve PNG'ye ortak) ---------- */
function drawPlan(ctx, P, V, o) {
  const C = o.C, s = V.s, W = P.shop.w, D = P.shop.d, dpr = o.dpr, F = o.fs || 1;
  const segs = o.segs, A = o.A;
  const WT = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * V.ox, dpr * V.oy);
  const ST = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const px = 1 / s;
  const sx = x => x * s + V.ox, sy = y => y * s + V.oy;
  ST();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, o.w, o.h);
  WT();
  const ftint = k => { const F = FLOOR_BY_KEY[k]; return F ? mixHex(C.floor.startsWith('#') ? C.floor : '#FFFFFF', F.base, C.dark ? .16 : .4) : null; };
  ctx.fillStyle = ftint(P.floor) || C.floor; ctx.fillRect(0, 0, W, D);
  for (const r of P.rooms) if (r.floor) { ctx.fillStyle = ftint(r.floor); ctx.fillRect(r.x, r.y, r.w, r.d); }

  // Izgara
  if (o.grid) {
    const step = s * 0.1 >= 7 ? 0.1 : s * 0.5 >= 7 ? 0.5 : 1;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, D); ctx.clip();
    for (const [st, col, lw] of [[step, C.grid, 1], [step < 1 ? 1 : 5, C.grid2, 1]]) {
      ctx.beginPath();
      for (let x = st; x < W; x += st) { ctx.moveTo(x, 0); ctx.lineTo(x, D); }
      for (let y = st; y < D; y += st) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.strokeStyle = col; ctx.lineWidth = lw * px; ctx.stroke();
    }
    ctx.restore();
  }

  // Odalar (zemin rengi)
  for (const r of P.rooms) {
    ctx.fillStyle = rgba(r.color, C.dark ? 0.2 : 0.14);
    ctx.fillRect(r.x, r.y, r.w, r.d);
  }

  // İnsan boşlukları (eşyaların önü / arkası)
  if (o.clear) {
    for (const it of P.items) {
      if (!isSolid(it)) continue;
      for (const side of ['f', 'b']) {
        const poly = clearPoly(it, side); if (!poly) continue;
        const badz = A.zoneBad.has(it.id + ':' + side);
        pathPoly(ctx, poly);
        ctx.fillStyle = rgba(badz ? C.danger : C.ok, badz ? 0.16 : 0.08); ctx.fill();
        ctx.setLineDash([4 * px, 3 * px]); ctx.strokeStyle = rgba(badz ? C.danger : C.ok, badz ? .8 : .45); ctx.lineWidth = 1 * px; ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  // Boşluk (geçiş) öğeleri
  for (const it of P.items) if (it.type === 'zone') {
    const badz = A.zoneBad.has(it.id + ':z');
    withItem(ctx, it, () => {
      ctx.beginPath();
      if (it.style === 'circle') ctx.ellipse(0, 0, it.w / 2, it.d / 2, 0, 0, Math.PI * 2); else ctx.rect(-it.w / 2, -it.d / 2, it.w, it.d);
      ctx.fillStyle = rgba(badz ? C.danger : C.ok, badz ? .2 : .14); ctx.fill();
      ctx.setLineDash([6 * px, 4 * px]); ctx.strokeStyle = badz ? C.danger : C.ok; ctx.lineWidth = 1.5 * px; ctx.stroke(); ctx.setLineDash([]);
      if (it.style !== 'circle') { // genişlik okları
        const y = 0, a = -it.w / 2 + .06, b = it.w / 2 - .06, k = Math.min(.08, it.w / 6);
        ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y);
        ctx.moveTo(a + k, y - k); ctx.lineTo(a, y); ctx.lineTo(a + k, y + k);
        ctx.moveTo(b - k, y - k); ctx.lineTo(b, y); ctx.lineTo(b - k, y + k);
        ctx.lineWidth = 1.2 * px; ctx.stroke();
      }
    });
  }

  // Katı eşyalar
  for (const it of P.items) if (isSolid(it)) {
    withItem(ctx, it, () => drawSolid(ctx, it, C, px, A.bad.has(it.id)));
  }

  // Duvarlar
  ctx.fillStyle = C.wall;
  for (const r of wallPieces(segs)) ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);

  // Kapı ve pencereler
  for (const it of P.items) if (isOpening(it)) {
    const onWall = !!wallOf(it, segs);
    withItem(ctx, it, () => it.type === 'door' ? drawDoor(ctx, it, C, px, onWall, A.zoneBad.has(it.id + ':s')) : drawWindow(ctx, it, C, px, onWall));
  }

  // İnsanlar
  for (const it of P.items) if (it.type === 'human') withItem(ctx, it, () => drawHuman(ctx, it, C, px));

  // ---- Ekran uzayı: yazılar
  ST();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const halo = (t, x, y) => { ctx.lineWidth = 3.5 * F; ctx.strokeStyle = rgba(C.floor.startsWith('#') ? C.floor : '#ffffff', .9); ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
  if (o.labels) {
    for (const r of P.rooms) {
      const cx = sx(r.x + r.w / 2), cy = sy(r.y + r.d / 2), rw = r.w * s, rh = r.d * s;
      ctx.font = `700 ${clamp(s * 0.28, 11, 15) * F}px ${getFont()}`;
      const tw = ctx.measureText(r.name).width;
      const area = fmtA(r.w * r.d) + ' m²';
      const dimsT = `${fmtM(r.w)} × ${fmtM(r.d)} m`;
      const fitsDims = o.roomDims && (ctx.save(), ctx.font = `500 ${clamp(s * 0.22, 10, 13) * F}px ${getMono()}`, ctx.measureText(dimsT).width < rw - 12 * F);
      ctx.restore();
      if (fitsDims && rw > tw + 10 && rh > 56 * F) {
        ctx.fillStyle = C.ink; halo(r.name, cx, cy - 15 * F);
        ctx.font = `500 ${clamp(s * 0.22, 10, 13) * F}px ${getMono()}`; ctx.fillStyle = C.muted; halo(area, cx, cy + 2 * F); halo(dimsT, cx, cy + 17 * F);
      } else if (rw > tw + 10 && rh > 34 * F) {
        ctx.fillStyle = C.ink; halo(r.name, cx, cy - 8 * F);
        ctx.font = `500 ${clamp(s * 0.22, 10, 13) * F}px ${getMono()}`; ctx.fillStyle = C.muted; halo(area, cx, cy + 9 * F);
      } else if (rw > 40 * F && rh > 16 * F) {
        ctx.font = `500 ${10 * F}px ${getMono()}`; ctx.fillStyle = C.muted; halo(area, cx, cy);
      }
    }
    const fItem = `600 ${10.5 * F}px ${getFont()}`;
    ctx.font = fItem;
    for (const it of P.items) {
      if (!(isSolid(it) || it.type === 'zone') || it.type === 'column') continue;
      let t = it.type === 'zone' ? (it.style === 'circle' ? 'Ø ' + fmtCm(it.w) : fmtCm(Math.min(it.w, it.d)) + ' cm') : it.name;
      if (!t) continue;
      const long = it.w >= it.d, L = (long ? it.w : it.d) * s, Sh = (long ? it.d : it.w) * s;
      let tw = ctx.measureText(t).width;
      if (Sh < 12 * F || L < 30 * F) continue;
      const dimT = o.itemDims && it.type !== 'zone' ? `${fmtCm(it.w)}×${fmtCm(it.d)}` : '';
      const two = dimT && Sh > 25 * F;
      if (tw > L - 8) { // kısalt
        while (t.length > 3 && ctx.measureText(t + '…').width > L - 8) t = t.slice(0, -1);
        t += '…'; tw = ctx.measureText(t).width;
        if (t.length < 5) continue;
      }
      let ang = (it.rot + (long ? 0 : 90)) % 180; if (ang > 90) ang -= 180;
      ctx.save(); ctx.translate(sx(it.cx), sy(it.cy)); ctx.rotate(ang * D2R);
      ctx.fillStyle = it.type === 'zone' ? (A.zoneBad.has(it.id + ':z') ? C.danger : C.ok) : C.ink;
      if (it.type === 'zone') { ctx.font = `700 ${11 * F}px ${getMono()}`; halo(t, 0, it.style === 'circle' ? 0 : -9 * F); ctx.font = fItem; }
      else {
        ctx.fillText(t, 0, two ? -5.5 * F : .5);
        if (two) { ctx.font = `500 ${9.5 * F}px ${getMono()}`; ctx.fillStyle = C.muted; ctx.fillText(dimT, 0, 6.5 * F); ctx.font = fItem; }
      }
      ctx.restore();
    }
  }

  // Oda iç ölçüleri
  if (o.roomDimLines) {
    ctx.font = `600 ${10.5 * F}px ${getMono()}`; ctx.strokeStyle = C.muted; ctx.lineWidth = F;
    for (const r of P.rooms) {
      const x0 = sx(r.x + INNER_T / 2), x1 = sx(r.x + r.w - INNER_T / 2), y0 = sy(r.y + INNER_T / 2), y1 = sy(r.y + r.d - INNER_T / 2);
      const pad = 12 * F;
      if (x1 - x0 > 70 * F) dimLine(ctx, x0, y0 + pad, x1, y0 + pad, fmtM(r.w) + ' m', C, false, F);
      if (y1 - y0 > 70 * F) dimLine(ctx, x0 + pad, y0, x0 + pad, y1, fmtM(r.d) + ' m', C, true, F);
    }
  }
  // Dış ölçüler: duvar boyunca parça ölçüleri (cm) + toplam (m)
  if (o.dims) {
    ctx.strokeStyle = C.muted; ctx.fillStyle = C.muted; ctx.lineWidth = F;
    const off = OUTER_T * s + 18 * F, gap = 24 * F;
    if (o.chains) {
      ctx.font = `600 ${10.5 * F}px ${getMono()}`;
      for (const side of ['t', 'b', 'l', 'r']) {
        const horiz = side === 't' || side === 'b', L = horiz ? W : D;
        const pts = new Set([0, L]);
        for (const sg of segs) {
          if (sg.outer) {
            const on = horiz ? (sg.h && (side === 't' ? sg.c < 0 : sg.c > D)) : (!sg.h && (side === 'l' ? sg.c < 0 : sg.c > W));
            if (on) for (const op of sg.open) { pts.add(r3(clamp(op.a, 0, L))); pts.add(r3(clamp(op.b, 0, L))); }
          } else if (horiz ? !sg.h : sg.h) {
            const touches = side === 't' || side === 'l' ? sg.a <= INNER_T : sg.b >= (horiz ? D : W) - INNER_T;
            if (touches) pts.add(r3(sg.c));
          }
        }
        const arr = [...pts].sort((a, b) => a - b);
        if (arr.length < 3) continue;
        chainLine(ctx, arr, side, W, D, s, V, off, C, F);
      }
    }
    ctx.font = `600 ${12 * F}px ${getMono()}`;
    const o2 = o.chains ? off + gap : off;
    dimLine(ctx, sx(0), sy(0) - o2, sx(W), sy(0) - o2, fmtM(W) + ' m', C, false, F);
    dimLine(ctx, sx(0) - o2, sy(0), sx(0) - o2, sy(D), fmtM(D) + ' m', C, true, F);
  }
}
/* Bir dış kenar boyunca zincir ölçü */
function chainLine(ctx, arr, side, W, D, s, V, off, C, F) {
  const horiz = side === 't' || side === 'b';
  const fixed = side === 't' ? V.oy - off : side === 'b' ? D * s + V.oy + off : side === 'l' ? V.ox - off : W * s + V.ox + off;
  const P = v => horiz ? [v * s + V.ox, fixed] : [fixed, v * s + V.oy];
  ctx.beginPath();
  const [a0, b0] = P(arr[0]), [a1, b1] = P(arr[arr.length - 1]);
  ctx.moveTo(a0, b0); ctx.lineTo(a1, b1);
  for (const v of arr) { const [x, y] = P(v); if (horiz) { ctx.moveTo(x - 3 * F, y + 3 * F); ctx.lineTo(x + 3 * F, y - 3 * F); ctx.moveTo(x, y - 5 * F); ctx.lineTo(x, y + 5 * F); } else { ctx.moveTo(x - 3 * F, y + 3 * F); ctx.lineTo(x + 3 * F, y - 3 * F); ctx.moveTo(x - 5 * F, y); ctx.lineTo(x + 5 * F, y); } }
  ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted;
  for (let i = 0; i < arr.length - 1; i++) {
    const len = arr[i + 1] - arr[i]; if (len < .02) continue;
    const t = fmtCm(len), [x0, y0] = P(arr[i]), [x1, y1] = P(arr[i + 1]);
    const px = Math.hypot(x1 - x0, y1 - y0), tw = ctx.measureText(t).width;
    if (px < tw + 6 * F) continue;
    ctx.save(); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); if (!horiz) ctx.rotate(-Math.PI / 2);
    const dy = (side === 't' || side === 'l') ? -7 * F : 8 * F;
    ctx.fillText(t, 0, dy); ctx.restore();
  }
}
function getFont() { return 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; }
function getMono() { return 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; }
function pathPoly(ctx, P) { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
function withItem(ctx, it, fn) { ctx.save(); ctx.translate(it.cx, it.cy); ctx.rotate((it.rot || 0) * D2R); fn(); ctx.restore(); }
function dimLine(ctx, x0, y0, x1, y1, label, C, vert, F = 1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  const t = 5 * F;
  if (vert) { ctx.moveTo(x0 - t, y0); ctx.lineTo(x0 + t, y0); ctx.moveTo(x1 - t, y1); ctx.lineTo(x1 + t, y1); }
  else { ctx.moveTo(x0, y0 - t); ctx.lineTo(x0, y0 + t); ctx.moveTo(x1, y1 - t); ctx.lineTo(x1, y1 + t); }
  ctx.stroke();
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.save(); ctx.translate(mx, my); if (vert) ctx.rotate(-Math.PI / 2);
  const tw = ctx.measureText(label).width + 10 * F;
  ctx.fillStyle = C.bg; ctx.fillRect(-tw / 2, -8 * F, tw, 16 * F);
  ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 0.5);
  ctx.restore();
}

function drawSolid(ctx, it, C, px, bad) {
  const w = it.w, d = it.d, x0 = -w / 2, y0 = -d / 2;
  const base = it.color, edge = mixHex(base, '#000000', .45);
  ctx.lineWidth = 1.2 * px; ctx.strokeStyle = edge;
  if (it.type === 'column') {
    ctx.fillStyle = C.wall; ctx.fillRect(x0, y0, w, d);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(-x0, -y0); ctx.moveTo(-x0, y0); ctx.lineTo(x0, -y0);
    ctx.strokeStyle = C.floor; ctx.stroke();
  } else if (it.type === 'table' && it.style === 'round') {
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(base, .55); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0, w / 2 - .04), Math.max(0, d / 2 - .04), 0, 0, Math.PI * 2); ctx.strokeStyle = rgba(edge, .35); ctx.stroke();
  } else if (it.type === 'fixture') {
    const white = C.dark ? '#D9DCDA' : '#FFFFFF';
    ctx.fillStyle = white; ctx.strokeStyle = C.ink.startsWith('#') ? rgba(C.ink, .7) : C.ink; ctx.lineWidth = 1.2 * px;
    if (it.style === 'toilet') {
      const th = Math.min(.2, d * .28);
      ctx.beginPath(); ctx.roundRect(x0, y0, w, th, .03); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, y0 + th + (d - th) / 2, w / 2 * .92, (d - th) / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, y0 + th + (d - th) / 2 + .02, w / 2 * .55, (d - th) / 2 * .62, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.roundRect(x0, y0, w, d, Math.min(.08, d / 3)); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, .03, w / 2 * .7, d / 2 * .6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, .03, .018, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(0, y0 + .08); ctx.lineWidth = 3 * px; ctx.stroke();
    }
  } else {
    ctx.fillStyle = rgba(base, it.type === 'cabinet' && it.style === 'glass' ? .3 : .55);
    ctx.fillRect(x0, y0, w, d); ctx.strokeRect(x0, y0, w, d);
    ctx.beginPath(); ctx.strokeStyle = rgba(edge, .45); ctx.lineWidth = 1 * px;
    if (it.type === 'cabinet') {
      switch (it.style) {
        case 'closed': ctx.moveTo(x0, y0); ctx.lineTo(-x0, -y0); ctx.moveTo(-x0, y0); ctx.lineTo(x0, -y0); break;
        case 'open': { const n = Math.max(1, Math.round(w / .5)); for (let i = 1; i < n; i++) { const x = x0 + w * i / n; ctx.moveTo(x, y0); ctx.lineTo(x, -y0); } break; }
        case 'drawer': { const n = Math.max(1, Math.round(w / .5)); for (let i = 0; i < n; i++) { const a = x0 + w * i / n; ctx.moveTo(a + w / n * .3, d / 2 - .07); ctx.lineTo(a + w / n * .7, d / 2 - .07); } for (let i = 1; i < n; i++) { const x = x0 + w * i / n; ctx.moveTo(x, y0); ctx.lineTo(x, -y0); } break; }
        case 'gondola': ctx.moveTo(x0, 0); ctx.lineTo(-x0, 0); break;
        case 'glass': ctx.rect(x0 + .04, y0 + .04, w - .08, d - .08); break;
        case 'fridge': ctx.rect(x0 + .05, y0 + .05, w - .1, d - .1); break;
        case 'otc': { const n = Math.max(1, Math.round(w / .6)); for (let i = 1; i < n; i++) { const x = x0 + w * i / n; ctx.moveTo(x, y0); ctx.lineTo(x, -y0); } ctx.moveTo(x0, y0 + .06); ctx.lineTo(-x0, y0 + .06); break; }
        case 'cosmetic': ctx.moveTo(x0 + .04, 0); ctx.lineTo(-x0 - .04, 0); ctx.moveTo(x0 + .04, d * .25); ctx.lineTo(-x0 - .04, d * .25); break;
        case 'metal': for (const [a, b] of [[x0, y0], [-x0 - .04, y0], [x0, -y0 - .04], [-x0 - .04, -y0 - .04]]) ctx.rect(a, b, .04, .04); ctx.moveTo(x0, y0); ctx.lineTo(-x0, -y0); break;
        case 'kitchen': { const sw = Math.min(.5, w * .3), sx = x0 + Math.min(.25, w * .1); ctx.roundRect(sx, y0 + .1, sw, d - .2, .04); ctx.moveTo(sx + sw / 2 + .02, y0 + d / 2); ctx.arc(sx + sw / 2, y0 + d / 2, .02, 0, 7); break; }
      }
    } else if (it.type === 'counter') {
      ctx.moveTo(x0 + .04, y0 + .06); ctx.lineTo(-x0 - .04, y0 + .06);
    } else if (it.type === 'table') {
      ctx.rect(x0 + .04, y0 + .04, Math.max(0, w - .08), Math.max(0, d - .08));
    }
    ctx.stroke();
    // Ön yüz (kalın çizgi)
    if (TYPES[it.type].front && it.type !== 'table' && it.type !== 'fixture') {
      ctx.beginPath(); ctx.moveTo(x0, d / 2); ctx.lineTo(-x0, d / 2);
      if (it.style === 'gondola') { ctx.moveTo(x0, y0); ctx.lineTo(-x0, y0); }
      ctx.lineWidth = 3 * px; ctx.strokeStyle = it.type === 'counter' ? C.accent : edge; ctx.stroke();
    }
  }
  if (bad) {
    ctx.beginPath(); if (isRound(it)) ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); else ctx.rect(x0, y0, w, d);
    ctx.lineWidth = 2.5 * px; ctx.strokeStyle = C.danger; ctx.setLineDash([5 * px, 3 * px]); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawDoor(ctx, it, C, px, onWall, bad) {
  const w = it.w, d = it.d, y = d / 2;
  const col = bad ? C.danger : C.ink;
  if (!onWall) { ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = C.danger; ctx.lineWidth = 1.2 * px; ctx.strokeRect(-w / 2, -d / 2, w, d); ctx.setLineDash([]); }
  // söve
  ctx.fillStyle = C.wall;
  ctx.fillRect(-w / 2 - .02, -d / 2, .04, d); ctx.fillRect(w / 2 - .02, -d / 2, .04, d);
  ctx.strokeStyle = col; ctx.lineWidth = 1.4 * px;
  if (it.style === 'sliding') {
    ctx.fillStyle = rgba(it.color, .5);
    ctx.fillRect(-w / 2, -.03, w * .55, .03); ctx.strokeRect(-w / 2, -.03, w * .55, .03);
    ctx.fillRect(-w / 2 + w * .45, 0, w * .55, .03); ctx.strokeRect(-w / 2 + w * .45, 0, w * .55, .03);
    return;
  }
  const leaves = it.style === 'double' ? [[-w / 2, w / 2, 1], [w / 2, w / 2, -1]] : [[it.flip ? w / 2 : -w / 2, w, it.flip ? -1 : 1]];
  for (const [hx, L, dir] of leaves) {
    ctx.beginPath(); ctx.moveTo(hx, y); ctx.lineTo(hx, y + L); // kanat (açık)
    ctx.lineWidth = 2.4 * px; ctx.strokeStyle = col; ctx.stroke();
    ctx.beginPath();
    const a0 = Math.PI / 2, a1 = dir > 0 ? 0 : Math.PI;
    ctx.arc(hx, y, L, a0, a1, dir > 0);
    ctx.setLineDash([4 * px, 3 * px]); ctx.lineWidth = 1 * px; ctx.strokeStyle = rgba(bad ? C.danger : C.ink.startsWith('#') ? C.ink : '#1b211f', .55); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawWindow(ctx, it, C, px, onWall) {
  const w = it.w, d = it.d;
  ctx.fillStyle = C.floor; ctx.fillRect(-w / 2, -d / 2, w, d);
  ctx.strokeStyle = C.wall; ctx.lineWidth = 1 * px; ctx.strokeRect(-w / 2, -d / 2, w, d);
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
  ctx.strokeStyle = '#4A9BD6'; ctx.lineWidth = 2 * px; ctx.stroke();
  if (!onWall) { ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = C.danger; ctx.strokeRect(-w / 2, -d / 2, w, d); ctx.setLineDash([]); }
}
function drawHuman(ctx, it, C, px) {
  const w = it.w, d = it.d, col = it.color;
  ctx.lineWidth = 1.2 * px; ctx.strokeStyle = mixHex(col, '#000000', .4);
  if (it.style === 'wheelchair') {
    ctx.fillStyle = rgba(col, .18); ctx.fillRect(-w / 2 + .06, -d / 2, w - .12, d); ctx.strokeRect(-w / 2 + .06, -d / 2, w - .12, d);
    ctx.fillStyle = mixHex(col, '#000000', .3);
    ctx.fillRect(-w / 2, -d / 2 + .15, .05, .6); ctx.fillRect(w / 2 - .05, -d / 2 + .15, .05, .6);
    ctx.beginPath(); ctx.ellipse(0, -d / 2 + .45, .2, .14, 0, 0, Math.PI * 2); ctx.fillStyle = rgba(col, .6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -d / 2 + .38, .1, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.ellipse(0, 0, w / 2, d / 2 * .8, 0, 0, Math.PI * 2); ctx.fillStyle = rgba(col, .45); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, Math.min(.11, d / 3), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-.04, d / 2 * .8 + .02); ctx.lineTo(0, d / 2 * .8 + .08); ctx.lineTo(.04, d / 2 * .8 + .02); ctx.strokeStyle = col; ctx.lineWidth = 2 * px; ctx.stroke();
}

/* ---------- Etkileşimli plan görünümü ---------- */
const Plan = {
  cv: null, ctx: null, V: {s: 40, ox: 0, oy: 0}, w: 0, h: 0, dpr: 1, raf: 0,
  ptrs: new Map(), act: null, guides: [], measure: null, hover: null, space: false, fitted: false, lastTap: null, C: null,

  init() {
    this.cv = $('#plan'); this.ctx = this.cv.getContext('2d');
    new ResizeObserver(() => this.resize()).observe($('#stage'));
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointercancel', e => this.up(e, true));
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.req(); } });
    cv.addEventListener('wheel', e => this.wheel(e), {passive: false});
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-eczplan')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    cv.addEventListener('drop', e => {
      const k = e.dataTransfer.getData('text/x-eczplan'); if (!k) return;
      e.preventDefault(); const r = cv.getBoundingClientRect();
      Ed.addFromCatalog(CATALOG_BY_KEY[k], this.toW(e.clientX - r.left, e.clientY - r.top));
    });
    $('#zoomIn').onclick = () => this.zoomAt(this.w / 2, this.h / 2, 1.25);
    $('#zoomOut').onclick = () => this.zoomAt(this.w / 2, this.h / 2, 0.8);
    $('#zoomFit').onclick = () => { if (Ed.view === '3d') View3D.resetCam(); else this.fit(); };
  },
  resize() {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return;
    const cw = this.w, ch = this.h;
    this.w = r.width; this.h = r.height; this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    if (!this.fitted) this.fit();
    else if (cw) { this.V.ox += (this.w - cw) / 2; this.V.oy += (this.h - ch) / 2; }
    this.draw();
  },
  fit() {
    const P = Ed.P; if (!P || !this.w) return;
    const m = isMobile() ? 12 : 28, top = 60, dimPad = 40;
    const W = P.shop.w + OUTER_T * 2, D = P.shop.d + OUTER_T * 2;
    const avW = this.w - m * 2 - dimPad, avH = this.h - top - m - dimPad;
    const s = clamp(Math.min(avW / W, avH / D), 4, 400);
    this.V.s = s;
    this.V.ox = m + dimPad + (avW - W * s) / 2 + OUTER_T * s;
    this.V.oy = top + dimPad + (avH - D * s) / 2 + OUTER_T * s;
    this.fitted = true; this.req();
  },
  toW(x, y) { return [(x - this.V.ox) / this.V.s, (y - this.V.oy) / this.V.s]; },
  toS(x, y) { return [x * this.V.s + this.V.ox, y * this.V.s + this.V.oy]; },
  zoomAt(x, y, f) {
    const [wx, wy] = this.toW(x, y);
    this.V.s = clamp(this.V.s * f, 4, 600);
    this.V.ox = x - wx * this.V.s; this.V.oy = y - wy * this.V.s; this.req();
  },
  req() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); },

  draw() {
    const P = Ed.P; if (!P || Ed.view !== '2d' || !this.w) { Ctx.place(); return; }
    this.C = planColors();
    const ctx = this.ctx;
    drawPlan(ctx, P, this.V, {w: this.w, h: this.h, dpr: this.dpr, C: this.C, segs: Ed.segs, A: Ed.A,
      grid: Settings.v.grid, clear: Settings.v.clear, labels: true, dims: true});
    this.overlay(ctx);
    Ctx.place();
  },

  /* Seçim, tutamaklar, mesafeler, kılavuzlar, ölçü */
  overlay(ctx) {
    const C = this.C, P = Ed.P, s = this.V.s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const S = (x, y) => this.toS(x, y);
    // Üzerine gelinen
    if (this.hover && !this.act && !(Ed.sel && Ed.sel.id === this.hover.id)) {
      const o = Ed.objOf(this.hover);
      if (o) { ctx.strokeStyle = rgba(C.accent.startsWith('#') ? C.accent : '#1F7A5A', .6); ctx.lineWidth = 1.5; this.outline(ctx, this.hover, o); ctx.stroke(); }
    }
    const sel = Ed.sel, o = sel && Ed.objOf(sel);
    if (o) {
      // Mesafeler
      if (!(this.act && this.act.type === 'pan')) this.drawGaps(ctx, sel, o);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; this.outline(ctx, sel, o); ctx.stroke();
      if (sel.k === 'room') {
        ctx.font = `700 12px ${getMono()}`;
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
        const [x0, y0] = S(o.x, o.y), [x1, y1] = S(o.x + o.w, o.y + o.d);
        ctx.fillStyle = C.accent;
        this.pill(ctx, (x0 + x1) / 2, y0 + 14, fmtM(o.w) + ' m', C.accent);
        this.pill(ctx, x0 + 14, (y0 + y1) / 2, fmtM(o.d) + ' m', C.accent, true);
      }
      if (!this.act || this.act.type === 'resize' || this.act.type === 'rotate') {
        for (const h of this.handles(sel, o)) {
          ctx.beginPath();
          if (h.rot) { ctx.moveTo(...S(...h.from)); ctx.lineTo(h.x, h.y); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke(); ctx.beginPath(); ctx.arc(h.x, h.y, 7, 0, Math.PI * 2); }
          else ctx.rect(h.x - 5.5, h.y - 5.5, 11, 11);
          ctx.fillStyle = h.rot ? C.accent : '#fff'; ctx.fill(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
          if (h.rot) { ctx.beginPath(); ctx.arc(h.x, h.y, 3.5, -2.2, 1.6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
      }
      if (this.act && this.act.type === 'rotate') {
        const [cx, cy] = S(o.cx, o.cy);
        this.pill(ctx, cx, cy - 28, Math.round(o.rot) + '°', C.accent);
      }
    }
    // Kılavuz çizgileri
    if (this.guides.length) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
      for (const g of this.guides) {
        ctx.beginPath();
        if (g.x != null) { const x = S(g.x, 0)[0]; ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
        else { const y = S(0, g.y)[1]; ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // Oda çizimi
    if (this.act && this.act.type === 'draw' && this.act.r) {
      const r = this.act.r, [x0, y0] = S(r.x, r.y), [x1, y1] = S(r.x + r.w, r.y + r.d);
      ctx.fillStyle = rgba(C.accent.startsWith('#') ? C.accent : '#1F7A5A', .12); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
      ctx.font = `700 12px ${getMono()}`;
      this.pill(ctx, (x0 + x1) / 2, (y0 + y1) / 2, `${fmtM(r.w)} × ${fmtM(r.d)} m · ${fmtA(r.w * r.d)} m²`, C.accent);
    }
    // Ölçü
    if (this.measure) {
      const m = this.measure, [x0, y0] = S(m.a[0], m.a[1]), [x1, y1] = S(m.b[0], m.b[1]);
      const d = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
      const cm = gapComment(d), col = cm.c === 'bad' ? C.danger : cm.c === 'warn' ? C.warn : C.ok;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
      if (d > 0.02) {
        ctx.font = `700 13px ${getMono()}`;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        this.pill(ctx, mx, my - 14, d < 1 ? fmtCm(d) + ' cm' : fmtM(d) + ' m', col);
        ctx.font = `600 11.5px ${getFont()}`;
        this.pill(ctx, mx, my + 12, cm.t, col, false, true);
      }
    }
  },
  pill(ctx, x, y, t, col, vert = false, soft = false) {
    ctx.save(); ctx.translate(x, y); if (vert) ctx.rotate(-Math.PI / 2);
    const tw = ctx.measureText(t).width + 12;
    ctx.beginPath(); ctx.roundRect(-tw / 2, -10, tw, 20, 10);
    ctx.fillStyle = soft ? this.C.floor : col; ctx.fill();
    if (soft) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = soft ? col : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 0.5);
    ctx.restore();
  },
  outline(ctx, sel, o) {
    ctx.beginPath();
    if (sel.k === 'room') { const [x0, y0] = this.toS(o.x, o.y); ctx.rect(x0, y0, o.w * this.V.s, o.d * this.V.s); return; }
    const pts = isRound(o) ? itemPoly(o) : localPoly(o, -o.w / 2, -o.d / 2, o.w / 2, o.d / 2);
    pts.forEach(([x, y], i) => { const [a, b] = this.toS(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.closePath();
  },
  /* Seçili nesne çevresindeki boşluk ölçüleri */
  drawGaps(ctx, sel, o) {
    const C = this.C, P = Ed.P;
    let gaps = [];
    if (sel.k === 'item' && isOpening(o)) gaps = doorGaps(o, Ed.segs);
    else if (sel.k === 'item') {
      const obs = [];
      for (const it of P.items) if (it.id !== o.id && isSolid(it)) obs.push(itemBox(it));
      for (const r of wallPieces(Ed.segs, op => op.type === 'door')) obs.push(r);
      gaps = gapsAround(itemBox(o), obs, 12);
    } else return;
    ctx.font = `700 11.5px ${getMono()}`;
    for (const g of gaps) {
      const [x0, y0] = this.toS(g.x0, g.y0), [x1, y1] = this.toS(g.x1, g.y1);
      const L = Math.hypot(x1 - x0, y1 - y0); if (L < 4) continue;
      const cm = gapComment(g.d), col = o.type === 'human' || o.type === 'zone' || isOpening(o) || isSolid(o) ? (cm.c === 'bad' ? C.danger : cm.c === 'warn' ? C.warn : C.ok) : C.muted;
      const colUse = isOpening(o) ? C.accent : col;
      ctx.strokeStyle = colUse; ctx.lineWidth = 1.3; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      const vx = (x1 - x0) / L, vy = (y1 - y0) / L, nx = -vy * 5, ny = vx * 5;
      ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.moveTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny);
      ctx.stroke();
      if (L > 26) this.pill(ctx, (x0 + x1) / 2, (y0 + y1) / 2, g.d < 1 ? fmtCm(g.d) + ' cm' : fmtM(g.d) + ' m', colUse);
    }
  },
  handles(sel, o) {
    const out = [];
    if (sel.k === 'room') {
      for (const hx of [-1, 0, 1]) for (const hy of [-1, 0, 1]) {
        if (!hx && !hy) continue;
        const [x, y] = this.toS(o.x + o.w / 2 + hx * o.w / 2, o.y + o.d / 2 + hy * o.d / 2);
        out.push({hx, hy, x, y});
      }
      return out;
    }
    const canW = o.type !== 'human', canD = !['human', 'door', 'window'].includes(o.type);
    for (const hx of [-1, 0, 1]) for (const hy of [-1, 0, 1]) {
      if (!hx && !hy) continue;
      if ((hx && !canW) || (hy && !canD)) continue;
      if (isRound(o) && (!hx || !hy)) continue;
      if (!canD && hy) continue;
      const [wx, wy] = toWorld(o, hx * o.w / 2, (canD ? hy : 0) * o.d / 2);
      const [x, y] = this.toS(wx, wy);
      out.push({hx, hy: canD ? hy : 0, x, y});
    }
    if (!isOpening(o) && !(isRound(o))) {
      const from = toWorld(o, 0, -o.d / 2), [fx, fy] = this.toS(...from);
      const [dx, dy] = rotPt(0, -1, o.rot);
      out.push({rot: 1, from, x: fx + dx * 30, y: fy + dy * 30});
    }
    return out;
  },
  hitHandle(x, y, touch) {
    const sel = Ed.sel, o = sel && Ed.objOf(sel); if (!o) return null;
    const R = touch ? 20 : 10;
    let best = null, bd = R;
    for (const h of this.handles(sel, o)) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
    return best;
  },
  hitTest(wx, wy, touch) {
    const P = Ed.P, pad = (touch ? 12 : 6) / this.V.s;
    const cand = [];
    for (let i = P.items.length - 1; i >= 0; i--) {
      const it = P.items[i];
      const [lx, ly] = toLocal(it, wx, wy);
      const hw = Math.max(it.w / 2, pad), hd = Math.max(it.d / 2, pad);
      let inside;
      if (isRound(it)) inside = (lx * lx) / (hw * hw) + (ly * ly) / (hd * hd) <= 1;
      else inside = Math.abs(lx) <= hw && Math.abs(ly) <= hd;
      if (inside) cand.push({it, a: it.w * it.d, pri: it.type === 'zone' ? 1 : 0});
    }
    if (cand.length) { // küçük ve katı öğe önce
      cand.sort((a, b) => a.pri - b.pri || a.a - b.a);
      return {k: 'item', id: cand[0].it.id};
    }
    const rooms = P.rooms.filter(r => wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.d).sort((a, b) => a.w * a.d - b.w * b.d);
    if (rooms.length) return {k: 'room', id: rooms[0].id};
    return null;
  },

  /* ---------- İşaretçi olayları ---------- */
  pos(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
  down(e) {
    if (!Ed.P) return;
    const [x, y] = this.pos(e);
    try { this.cv.setPointerCapture(e.pointerId); } catch (_) {}
    this.ptrs.set(e.pointerId, {x, y});
    const touch = e.pointerType !== 'mouse';
    if (this.ptrs.size === 2) { // iki parmak: yakınlaştır / kaydır
      this.finishAct();
      const [a, b] = [...this.ptrs.values()];
      this.act = {type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: [(a.x + b.x) / 2, (a.y + b.y) / 2], V0: {...this.V}};
      return;
    }
    if (this.ptrs.size > 2) return;
    const [wx, wy] = this.toW(x, y);
    if (e.button === 1 || e.button === 2 || this.space) { this.act = {type: 'pan', x, y, V0: {...this.V}, moved: true}; this.cv.style.cursor = 'grabbing'; return; }
    if (Ed.tool === 'room') { const p = this.snapPt(wx, wy); this.act = {type: 'draw', p0: p, r: null, x, y}; return; }
    if (Ed.tool === 'measure') { const p = this.snapPt(wx, wy, true); this.measure = {a: p, b: p}; this.act = {type: 'measure', x, y}; this.req(); return; }
    const h = this.hitHandle(x, y, touch);
    if (h) {
      const o = Ed.objOf(Ed.sel);
      this.act = {type: h.rot ? 'rotate' : 'resize', h, o0: {...o}, before: Ed.snap(), x, y, moved: false, touch};
      this.collectTargets(Ed.sel);
      return;
    }
    const hit = this.hitTest(wx, wy, touch);
    const isSel = hit && Ed.sel && Ed.sel.k === hit.k && Ed.sel.id === hit.id;
    if (hit && (hit.k === 'item' || isSel)) {
      if (!isSel) Ed.select(hit);
      const o = Ed.objOf(hit);
      const carry = hit.k === 'room' ? Ed.P.items.filter(it => it.cx >= o.x - .06 && it.cx <= o.x + o.w + .06 && it.cy >= o.y - .06 && it.cy <= o.y + o.d + .06).map(it => ({it, cx: it.cx, cy: it.cy})) : [];
      this.act = {type: 'move', sel: hit, o0: {...o}, w0: [wx, wy], before: Ed.snap(), x, y, moved: false, carry, touch};
      this.collectTargets(hit, carry.map(c => c.it.id));
      return;
    }
    this.act = {type: 'tap', hit, x, y, V0: {...this.V}, moved: false, touch};
  },
  move(e) {
    const [x, y] = this.pos(e);
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, {x, y});
    const a = this.act;
    if (!a) { // üzerine gelme
      if (e.pointerType === 'mouse' && Ed.P) {
        const [wx, wy] = this.toW(x, y);
        const h = Ed.tool === 'select' ? this.hitHandle(x, y, false) : null;
        const hit = Ed.tool === 'select' && !h ? this.hitTest(wx, wy, false) : null;
        const prev = this.hover; this.hover = hit;
        this.cv.style.cursor = this.space ? 'grab' : Ed.tool !== 'select' ? 'crosshair' : h ? (h.rot ? 'grab' : this.resizeCursor(h)) : hit ? (hit.k === 'item' || (Ed.sel && Ed.sel.id === hit.id) ? 'move' : 'pointer') : 'default';
        if ((prev && prev.id) !== (hit && hit.id)) this.req();
      }
      return;
    }
    const thr = a.touch ? 7 : 3;
    if (!a.moved && a.type !== 'pinch' && Math.hypot(x - a.x, y - a.y) < thr) return;
    const first = !a.moved; a.moved = true;
    const [wx, wy] = this.toW(x, y);
    switch (a.type) {
      case 'pinch': {
        if (this.ptrs.size < 2) return;
        const [p, q] = [...this.ptrs.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y), m = [(p.x + q.x) / 2, (p.y + q.y) / 2];
        const s = clamp(a.V0.s * d / a.d0, 4, 600);
        const wx0 = (a.m0[0] - a.V0.ox) / a.V0.s, wy0 = (a.m0[1] - a.V0.oy) / a.V0.s;
        this.V.s = s; this.V.ox = m[0] - wx0 * s; this.V.oy = m[1] - wy0 * s; this.req();
        break;
      }
      case 'tap': a.type = 'pan'; // boş alanda sürükleme = kaydır
      // fallthrough
      case 'pan': this.V.ox = a.V0.ox + (x - a.x); this.V.oy = a.V0.oy + (y - a.y); this.req(); break;
      case 'draw': {
        const p = this.snapPt(wx, wy);
        const x0 = Math.min(a.p0[0], p[0]), y0 = Math.min(a.p0[1], p[1]);
        a.r = {x: x0, y: y0, w: Math.abs(p[0] - a.p0[0]), d: Math.abs(p[1] - a.p0[1])};
        this.req(); break;
      }
      case 'measure': {
        let p = this.snapPt(wx, wy, true);
        const m = this.measure; const dx = p[0] - m.a[0], dy = p[1] - m.a[1];
        if (Math.abs(dy) < Math.abs(dx) * .08) p = [p[0], m.a[1]]; else if (Math.abs(dx) < Math.abs(dy) * .08) p = [m.a[0], p[1]];
        m.b = p; this.req(); break;
      }
      case 'move': this.doMove(a, wx, wy, e); break;
      case 'resize': this.doResize(a, wx, wy); break;
      case 'rotate': {
        const o = Ed.objOf(Ed.sel); if (!o) break;
        let ang = Math.atan2(wy - o.cy, wx - o.cx) / D2R + 90;
        if (!e.shiftKey) { ang = Math.round(ang / 15) * 15; }
        o.rot = normRot(ang); Ed.live(); break;
      }
    }
    if (first && (a.type === 'move' || a.type === 'resize' || a.type === 'rotate')) Ctx.place();
  },
  up(e, cancel) {
    this.ptrs.delete(e.pointerId);
    const a = this.act; if (!a) return;
    if (a.type === 'pinch') { if (this.ptrs.size === 0) this.act = null; return; }
    this.act = null; this.guides = [];
    this.cv.style.cursor = '';
    switch (a.type) {
      case 'tap': if (!cancel) this.tap(a); break;
      case 'draw':
        if (a.r && a.r.w >= MIN_ROOM && a.r.d >= MIN_ROOM) { Ed.addRoom(a.r); Ed.setTool('select'); }
        else if (!cancel) toast('Oda çizmek için parmağını/fareyi sürükle');
        break;
      case 'move': case 'resize': case 'rotate':
        if (a.moved) Ed.commit(a.before);
        else if (a.type === 'move' && !cancel) this.tap(a, true);
        break;
    }
    this.req(); Ctx.place();
  },
  finishAct() {
    const a = this.act; if (!a) return;
    if ((a.type === 'move' || a.type === 'resize' || a.type === 'rotate') && a.moved) Ed.commit(a.before);
    this.act = null; this.guides = [];
  },
  tap(a, onSel) {
    const now = Date.now(), last = this.lastTap;
    const hit = onSel ? a.sel : a.hit;
    const dbl = last && now - last.t < 350 && Math.hypot(last.x - a.x, last.y - a.y) < 24 && hit && last.id === hit.id;
    this.lastTap = {t: now, x: a.x, y: a.y, id: hit && hit.id};
    if (!onSel) Ed.select(hit);
    if (dbl) Ed.openProps(true);
  },
  wheel(e) {
    e.preventDefault();
    const [x, y] = this.pos(e);
    if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * .5 && Math.abs(e.deltaX) > 2) { // dokunmatik yüzey kaydırma
      this.V.ox -= e.deltaX; this.V.oy -= e.deltaY; this.req(); return;
    }
    const k = e.ctrlKey ? 0.01 : 0.0015;
    this.zoomAt(x, y, Math.exp(-e.deltaY * k * (e.deltaMode === 1 ? 16 : 1)));
  },
  resizeCursor(h) {
    const o = Ed.objOf(Ed.sel); const rot = Ed.sel.k === 'room' ? 0 : o.rot;
    const [dx, dy] = rotPt(h.hx, h.hy, rot); const ang = ((Math.atan2(dy, dx) / D2R) + 360) % 180;
    return ang < 22.5 || ang >= 157.5 ? 'ew-resize' : ang < 67.5 ? 'nwse-resize' : ang < 112.5 ? 'ns-resize' : 'nesw-resize';
  },

  /* ---------- Yapışma ---------- */
  collectTargets(sel, skipIds = []) {
    const xs = [], ys = [], P = Ed.P, skip = new Set(skipIds);
    if (sel.k === 'room') {
      xs.push(0, P.shop.w); ys.push(0, P.shop.d);
      for (const r of P.rooms) if (r.id !== sel.id) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.d); }
    } else {
      for (const r of wallPieces(Ed.segs)) { xs.push(r.x0, r.x1); ys.push(r.y0, r.y1); }
      for (const it of P.items) if (it.id !== sel.id && !skip.has(it.id) && (isSolid(it) || it.type === 'zone')) { const b = itemBox(it); xs.push(b.x0, b.x1, it.cx); ys.push(b.y0, b.y1, it.cy); }
    }
    this.targets = {xs, ys};
  },
  snapAxis(vals, targets, thr) { // vals: [kenar değerleri]; en küçük düzeltme
    let best = null;
    for (const v of vals) for (const t of targets) { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, t}; }
    return best;
  },
  snapPt(wx, wy, fine) {
    if (!Settings.v.snap) return [r3(wx), r3(wy)];
    const P = Ed.P, thr = 10 / this.V.s;
    const xs = [0, P.shop.w], ys = [0, P.shop.d];
    for (const r of P.rooms) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.d); }
    if (fine) { for (const r of wallPieces(Ed.segs)) { xs.push(r.x0, r.x1); ys.push(r.y0, r.y1); } for (const it of P.items) if (isSolid(it)) { const b = itemBox(it); xs.push(b.x0, b.x1); ys.push(b.y0, b.y1); } }
    const bx = this.snapAxis([wx], xs, thr), by = this.snapAxis([wy], ys, thr);
    return [r3(bx ? bx.t : Math.round(wx / GRID) * GRID), r3(by ? by.t : Math.round(wy / GRID) * GRID)];
  },
  doMove(a, wx, wy, e) {
    const dx = wx - a.w0[0], dy = wy - a.w0[1];
    const snap = Settings.v.snap && !e.altKey, thr = 9 / this.V.s;
    const o = Ed.objOf(a.sel); if (!o) return;
    this.guides = [];
    if (a.sel.k === 'room') {
      let x = a.o0.x + dx, y = a.o0.y + dy;
      if (snap) {
        const bx = this.snapAxis([x, x + o.w], this.targets.xs, thr), by = this.snapAxis([y, y + o.d], this.targets.ys, thr);
        if (bx) { x += bx.d; this.guides.push({x: bx.t}); } else x = Math.round(x / GRID) * GRID;
        if (by) { y += by.d; this.guides.push({y: by.t}); } else y = Math.round(y / GRID) * GRID;
      }
      o.x = r3(x); o.y = r3(y);
      const mx = o.x - a.o0.x, my = o.y - a.o0.y;
      for (const c of a.carry) { c.it.cx = r3(c.cx + mx); c.it.cy = r3(c.cy + my); }
      Ed.live(); return;
    }
    let cx = a.o0.cx + dx, cy = a.o0.cy + dy;
    if (isOpening(o)) { // kapı / pencere: duvara oturt, duvar boyunca kaydır
      const seg = nearestWall(Ed.segs, cx, cy, Math.max(0.6, 36 / this.V.s));
      if (seg) {
        let along = seg.h ? cx : cy;
        if (snap) along = Math.round((along - o.w / 2) / GRID) * GRID + o.w / 2;
        if (a.seg0 === undefined) a.seg0 = wallOf(a.o0, Ed.segs);
        const sameWall = a.seg0 && seg.h === a.seg0.h && Math.abs(seg.c - a.seg0.c) < .01;
        seatOnWall(o, seg, along, !sameWall);
        if (sameWall) { o.rot = a.o0.rot; o.flip = a.o0.flip; }
        o.cx = r3(o.cx); o.cy = r3(o.cy);
        Ed.live(); return;
      }
    }
    if (snap) {
      const [hx, hy] = halfExt(o);
      const bx = this.snapAxis([cx - hx, cx + hx], this.targets.xs, thr), by = this.snapAxis([cy - hy, cy + hy], this.targets.ys, thr);
      if (bx) { cx += bx.d; this.guides.push({x: bx.t}); } else cx = Math.round((cx - hx) / GRID) * GRID + hx;
      if (by) { cy += by.d; this.guides.push({y: by.t}); } else cy = Math.round((cy - hy) / GRID) * GRID + hy;
    }
    o.cx = r3(cx); o.cy = r3(cy);
    Ed.live();
  },
  doResize(a, wx, wy) {
    const o = Ed.objOf(Ed.sel), o0 = a.o0, {hx, hy} = a.h; if (!o) return;
    const snap = Settings.v.snap, thr = 9 / this.V.s;
    this.guides = [];
    if (Ed.sel.k === 'room') {
      let x0 = o0.x, y0 = o0.y, x1 = o0.x + o0.w, y1 = o0.y + o0.d;
      const sn = (v, T, g) => { if (!snap) return r3(v); const b = this.snapAxis([v], T, thr); if (b) { this.guides.push(g(b.t)); return b.t; } return Math.round(v / GRID) * GRID; };
      if (hx < 0) x0 = Math.min(sn(wx, this.targets.xs, t => ({x: t})), x1 - MIN_ROOM);
      if (hx > 0) x1 = Math.max(sn(wx, this.targets.xs, t => ({x: t})), x0 + MIN_ROOM);
      if (hy < 0) y0 = Math.min(sn(wy, this.targets.ys, t => ({y: t})), y1 - MIN_ROOM);
      if (hy > 0) y1 = Math.max(sn(wy, this.targets.ys, t => ({y: t})), y0 + MIN_ROOM);
      o.x = r3(x0); o.y = r3(y0); o.w = r3(x1 - x0); o.d = r3(y1 - y0);
      Ed.live(); return;
    }
    const [lx, ly] = rotPt(wx - o0.cx, wy - o0.cy, -o0.rot);
    const q = quarter(o0.rot);
    let w = o0.w, d = o0.d, ccx = 0, ccy = 0;
    const fit = (len, ax, dir, axisLocal) => { // uzunluğu yapışmayla ayarla
      if (!snap) return Math.max(MIN_ITEM, r3(len));
      len = Math.max(MIN_ITEM, len);
      if (q >= 0) { // eksene hizalı: hareket eden kenarı hedeflere yapıştır
        const [ux, uy] = rotPt(axisLocal === 'x' ? 1 : 0, axisLocal === 'y' ? 1 : 0, o0.rot);
        const worldAxis = Math.abs(ux) > .5 ? 'x' : 'y', sign = worldAxis === 'x' ? Math.sign(ux) : Math.sign(uy);
        const c0 = worldAxis === 'x' ? o0.cx : o0.cy;
        const edge = c0 + sign * (ax + dir * len);
        const b = this.snapAxis([edge], worldAxis === 'x' ? this.targets.xs : this.targets.ys, thr);
        if (b) { this.guides.push(worldAxis === 'x' ? {x: b.t} : {y: b.t}); return Math.max(MIN_ITEM, r3(dir * ((b.t - c0) * sign - ax))); }
      }
      return Math.max(MIN_ITEM, Math.round(len / 0.01) * 0.01);
    };
    if (hx) { const ax = -hx * o0.w / 2; w = fit(hx * (lx - ax), ax, hx, 'x'); ccx = ax + hx * w / 2; }
    if (hy) { const ay = -hy * o0.d / 2; d = fit(hy * (ly - ay), ay, hy, 'y'); ccy = ay + hy * d / 2; }
    if (isRound(o0)) { const m = Math.max(w, d); w = d = m; ccx = -hx * o0.w / 2 + hx * m / 2; ccy = -hy * o0.d / 2 + hy * m / 2; }
    const [dx, dy] = rotPt(ccx, ccy, o0.rot);
    o.w = r3(w); o.d = r3(d); o.cx = r3(o0.cx + dx); o.cy = r3(o0.cy + dy);
    if (isOpening(o)) { const s = wallOf(o0, Ed.segs); if (s) o.d = o0.d; }
    Ed.live();
  },
};

/* Kapı/pencerenin duvar üzerindeki iki yana boşluğu (köşe veya komşu duvara) */
function doorGaps(o, segs) {
  const s = wallOf(o, segs); if (!s) return [];
  const along = s.h ? o.cx : o.cy, a = along - o.w / 2, b = along + o.w / 2;
  let [lo, hi] = segRange(s);
  if (s.h && !s.outer) { lo = s.a; hi = s.b; }
  const stops = [lo, hi];
  for (const t of segs) { // dik duvarlar
    if (!!t.h === !!s.h) continue;
    if (s.c < t.a - s.t / 2 - .01 || s.c > t.b + s.t / 2 + .01) continue;
    if (t.c < lo || t.c > hi) continue;
    stops.push(t.c - t.t / 2, t.c + t.t / 2);
  }
  for (const op of s.open) if (op.id !== o.id) stops.push(op.a, op.b);
  let L = -Infinity, R = Infinity;
  for (const v of stops) { if (v <= a + 1e-3 && v > L) L = v; if (v >= b - 1e-3 && v < R) R = v; }
  const res = [];
  const off = s.h ? (s.c) : s.c;
  if (isFinite(L) && a - L > 0.005) res.push(s.h ? {d: a - L, x0: L, y0: off, x1: a, y1: off} : {d: a - L, x0: off, y0: L, x1: off, y1: a});
  if (isFinite(R) && R - b > 0.005) res.push(s.h ? {d: R - b, x0: b, y0: off, x1: R, y1: off} : {d: R - b, x0: off, y0: b, x1: off, y1: R});
  return res;
}
