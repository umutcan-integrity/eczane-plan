
/* =====================================================================
   ANALİZ: alanlar, insan ölçeği, yönetmelik, geçiş kontrolü
   ===================================================================== */
function netArea(r) {
  const t = state.shop.wall / 2, W = state.shop.w, H = state.shop.h;
  const wx = (r.x > 1e-6 ? t : 0) + (r.x + r.w < W - 1e-6 ? t : 0), wy = (r.y > 1e-6 ? t : 0) + (r.y + r.h < H - 1e-6 ? t : 0);
  return Math.max(0, (r.w - wx) * (r.h - wy));
}
function roomType(r) {
  const n = (r.name || '').toLocaleLowerCase('tr');
  if (/\bwc\b|tuvalet|lavabo/.test(n)) return 'wc';
  if (/mutfak|çay/.test(n)) return 'mutfak';
  if (/bakım|bakim|muayene|uygulama/.test(n)) return 'bakim';
  if (/lab/.test(n)) return 'lab';
  if (/eczacı|eczaci|stok|depo|ofis|büro/.test(n)) return 'ofis';
  if (/hol|koridor|antre/.test(n)) return 'hol';
  return 'other';
}
const CUSTOMER_FREE = new Set(['ofis', 'lab', 'hol', 'mutfak', 'wc']);
function unionArea(rects) {
  if (!rects.length) return 0;
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let A = 0;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (rects.some(r => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) A += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  }
  return A;
}
function interArea(a, b) { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
function itemRoom(it) { const c = itemCenter(it); return roomContaining(c.x, c.y); }
function isFurniture(it) { const d = LIB_BY_KEY[it.key]; return d && d.c !== 'insan' && !['door', 'door2', 'slider', 'window', 'wall', 'strip', 'circle', 'zone'].includes(d.s); }
function roomHasDoor(r) {
  return state.items.some(it => {
    const d = LIB_BY_KEY[it.key]; if (!d || !DOOR_SHAPES.has(d.s) || it.key === 'personel_kapagi') return false;
    const c = itemCenter(it), e = 0.12;
    const onV = (Math.abs(c.x - r.x) < e || Math.abs(c.x - r.x - r.w) < e) && c.y > r.y - e && c.y < r.y + r.h + e;
    const onH = (Math.abs(c.y - r.y) < e || Math.abs(c.y - r.y - r.h) < e) && c.x > r.x - e && c.x < r.x + r.w + e;
    return onV || onH;
  });
}
function analyze() {
  const S = state.shop, total = S.w * S.h;
  const clipped = state.rooms.map(r => ({x: clamp(r.x, 0, S.w), y: clamp(r.y, 0, S.h), w: Math.min(r.w, S.w - r.x), h: Math.min(r.h, S.h - r.y)}));
  const roomsUnion = unionArea(clipped);
  const sales = Math.max(0, total - roomsUnion);
  const overlaps = [];
  for (let i = 0; i < state.rooms.length; i++) for (let j = i + 1; j < state.rooms.length; j++) { const a = interArea(state.rooms[i], state.rooms[j]); if (a > 1e-6) overlaps.push({a: state.rooms[i], b: state.rooms[j], area: a}); }
  const salesItems = state.items.filter(it => isFurniture(it) && !itemRoom(it));
  const salesItemArea = salesItems.reduce((s, it) => s + area(itemAABB(it)), 0);
  const walkable = Math.max(0, sales - salesItemArea);
  let shelf = 0; for (const it of state.items) { const f = SHELF_KEYS[it.key]; if (f) shelf += f * Math.max(it.w, it.h); }
  const has = k => state.items.filter(it => it.key === k);
  const inFree = it => { const r = itemRoom(it); return r && CUSTOMER_FREE.has(roomType(r)); };
  const labs = has('lab_tezgahi'), nark = has('narkotik_kasa'), fr = has('ilac_buzdolabi');
  const entr = state.items.filter(it => /^giris_/.test(it.key));
  const wcRoom = state.rooms.find(r => roomType(r) === 'wc');
  const noDoor = state.rooms.filter(r => !roomHasDoor(r));
  const checks = [
    {t: 'Toplam alan ≥ 35 m² (Yönetmelik Md. 20)', s: total >= 35 ? 'ok' : 'no', d: fmtA(total)},
    {t: 'Laboratuvar tezgâhı müşteri erişimi olmayan odada', s: !labs.length ? 'no' : labs.every(inFree) ? 'ok' : 'no', d: !labs.length ? 'Lab tezgâhı yok — Eşya sekmesinden ekle' : labs.every(inFree) ? (itemRoom(labs[0]) || {}).name : 'Satış veya bakım alanında olamaz'},
    {t: 'Narkotik kasa müşteri erişimi olmayan odada', s: !nark.length ? 'so' : nark.every(inFree) ? 'ok' : 'no', d: !nark.length ? 'Kasa yok' : nark.every(inFree) ? (itemRoom(nark[0]) || {}).name : 'Müşteri erişimi olan alanda'},
    {t: 'İlaç buzdolabı var, mutfakta değil', s: !fr.length ? 'no' : fr.some(it => { const r = itemRoom(it); return r && roomType(r) === 'mutfak'; }) ? 'no' : 'ok', d: !fr.length ? 'Yok' : 'Gıda buzdolabından ayrı olmalı'},
    {t: 'WC var', s: wcRoom ? 'ok' : 'no', d: wcRoom ? `${wcRoom.name} · ${fmtA(wcRoom.w * wcRoom.h)}` : 'Oda adı “WC” içeren oda yok'},
    {t: 'Giriş kapısı net ≥ 0,90 m', s: !entr.length ? 'so' : entr.some(it => Math.max(it.w, it.h) >= 0.9) ? 'ok' : 'no', d: !entr.length ? 'Giriş kapısı eklenmemiş' : fmtM(Math.max(...entr.map(it => Math.max(it.w, it.h)))) + ' m'},
    {t: 'Tüm odalarda kapı var', s: noDoor.length ? 'so' : 'ok', d: noDoor.length ? 'Kapısız: ' + noDoor.map(r => r.name).join(', ') : ''},
  ];
  return {total, roomsUnion, sales, overlaps, salesItemArea, walkable, shelf, checks};
}

/* insan ölçeği ipuçları — oda kartı */
function roomHints(r) {
  const t = roomType(r), net = netArea(r), a = r.w * r.h, mn = Math.min(r.w, r.h), mx = Math.max(r.w, r.h);
  const H = [];
  const fits = (fw, fh) => (r.w >= fw - 1e-6 && r.h >= fh - 1e-6) || (r.w >= fh - 1e-6 && r.h >= fw - 1e-6);
  const inside = itemsInsideRoom(r), hasKey = k => inside.some(i => i.key === k);
  const ok = (cond, tOk, tNo, soft) => H.push({s: cond ? 'ok' : (soft ? 'so' : 'no'), t: cond ? tOk : tNo});
  H.push({s: 'info', t: `Ayakta rahat ${Math.floor(net / ERGO.m2Comfort)} kişi (1 m²/kişi) · ferah ${Math.floor(net / ERGO.m2Spacious)} kişi (1,5 m²)`});
  if (t === 'bakim') {
    const full = fits(ERGO.stretcherL + ERGO.stretcherHead, ERGO.stretcherW + ERGO.stretcherSide);
    const bare = fits(ERGO.stretcherL, ERGO.stretcherW);
    H.push({s: full ? 'ok' : bare ? 'so' : 'no', t: full ? 'Sedye 1,90×0,65 + uzun kenarda 0,90 + baş ucunda 0,60: SIĞAR' : bare ? 'Sedye sığar ama etrafında çalışma boşluğu dar (0,90 + 0,60 gerekir)' : 'Sedye 1,90×0,65: SIĞMAZ'});
    ok(hasKey('sedye') && (hasKey('lavabo') || hasKey('bakim_lavabo')), 'Sedye + lavabo yerleştirilmiş', 'Sedye ve/veya lavabo eksik', true);
    ok(a >= 5, `Alan ${fmtA(a)} ≥ 5 m² (rahat 7)`, `Alan ${fmtA(a)} < 5 m² — bakım için dar`, true);
  } else if (t === 'wc') {
    ok(mn >= 0.9 && mx >= 1.4, 'Klozet + lavabo (min 0,90×1,40): sığar', 'Klozet + lavabo için min 0,90×1,40 gerekir');
    ok(mn >= 2.0 && mx >= 2.2, 'Engelli WC (2,00×2,20, Ø1,50 dönüş): sığar', 'Engelli WC için 2,00×2,20 gerekir (zorunlu değil)', true);
    ok(hasKey('klozet'), 'Klozet yerleştirilmiş', 'Klozet eklenmemiş', true);
  } else if (t === 'mutfak') {
    ok(mn >= 1.8, 'Tezgâh 0,60 + karşısında 1,20 geçiş: sığar', `Dar kenar ${fmtM(mn)} m — tezgâh (0,60) + geçiş (1,20) için 1,80 gerekir`, true);
  } else if (t === 'ofis' || t === 'lab') {
    ok(fits(1.2, 1.5), 'Lab tezgâhı 1,20×0,60 + önünde 0,90: sığar', 'Lab tezgâhı + 0,90 önü için 1,20×1,50 gerekir', true);
    ok(fits(1.4, 1.6), 'Masa 1,40×0,70 + arkada 0,90 sandalye payı: sığar', 'Masa + sandalye payı için 1,40×1,60 gerekir', true);
    ok(hasKey('lab_tezgahi'), 'Laboratuvar tezgâhı bu odada', 'Laboratuvar tezgâhı yok (Yönetmelik Md. 21)', true);
  } else if (t === 'hol') {
    ok(mn >= 0.9, `Koridor ${fmtM(mn)} m — tekerlekli sandalye geçer`, `Koridor ${fmtM(mn)} m — 0,90 altı`, true);
  }
  H.push({s: mn >= ERGO.wheelTurn ? 'ok' : 'so', t: mn >= ERGO.wheelTurn ? 'Tekerlekli sandalye içeride dönebilir (Ø1,50)' : `Tekerlekli sandalye dönemez (dar kenar ${fmtM(mn)} < 1,50)`});
  if (!roomHasDoor(r)) H.push({s: 'so', t: 'Kapı yok — “Kapı ekle” ile ekle'});
  if (roomOverlaps(r)) H.push({s: 'no', t: 'Başka bir odayla çakışıyor'});
  return H;
}
function compareLines(a, w, h) {
  const out = [];
  const fitsOnce = c => (w >= c.w && h >= c.h) || (w >= c.h && h >= c.w);
  for (const c of COMPARE) { if (fitsOnce(c)) out.push({n: c.n, k: a / (c.w * c.h)}); }
  out.sort((p, q) => p.k - q.k);
  return out.slice(0, 2).map(o => `≈ ${fmt1(o.k)} ${o.n}`);
}

/* geçiş kontrolü */
let passageOn = false, passages = [];
function computePassages() {
  const S = state.shop, obs = [];
  for (const it of state.items) if (isFurniture(it) && !itemRoom(it)) obs.push({...itemAABB(it), n: it.name});
  for (const r of state.rooms) obs.push({x: r.x, y: r.y, w: r.w, h: r.h, n: r.name});
  const walls = [{x: -1, y: -1, w: S.w + 2, h: 1, n: 'duvar'}, {x: -1, y: S.h, w: S.w + 2, h: 1, n: 'duvar'}, {x: -1, y: 0, w: 1, h: S.h, n: 'duvar'}, {x: S.w, y: 0, w: 1, h: S.h, n: 'duvar'}];
  const all = obs.concat(walls), res = [];
  // duvar boyunca dizili iki ünite arasındaki niş geçiş değildir: hizalı kenar bir duvar/oda çizgisine oturuyorsa atla
  const lines = {x: [0, S.w], y: [0, S.h]};
  for (const r of state.rooms) { lines.x.push(r.x, r.x + r.w); lines.y.push(r.y, r.y + r.h); }
  const onLine = (v, axis) => lines[axis].some(l => Math.abs(l - v) < 0.03);
  const niche = (A, B, dir) => {
    if (dir === 'h') return (Math.abs(A.y - B.y) < 0.03 && onLine(A.y, 'y')) || (Math.abs(A.y + A.h - B.y - B.h) < 0.03 && onLine(A.y + A.h, 'y'));
    return (Math.abs(A.x - B.x) < 0.03 && onLine(A.x, 'x')) || (Math.abs(A.x + A.w - B.x - B.w) < 0.03 && onLine(A.x + A.w, 'x'));
  };
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j];
    if (A.n === 'duvar' && B.n === 'duvar') continue;
    // dikey boşluk (x aralıkları örtüşür)
    const ox0 = Math.max(A.x, B.x), ox1 = Math.min(A.x + A.w, B.x + B.w);
    if (ox1 - ox0 >= 0.3) {
      const top = A.y < B.y ? A : B, bot = A.y < B.y ? B : A, gap = bot.y - (top.y + top.h);
      if (gap > 0.3 && gap < 1.5 && !niche(A, B, 'v')) {
        const g = {x: ox0, y: top.y + top.h, w: ox1 - ox0, h: gap};
        if (!all.some(o => o !== A && o !== B && interArea(o, g) > 1e-4)) res.push({dir: 'v', x: (ox0 + ox1) / 2, y1: g.y, y2: g.y + gap, gap, a: top.n, b: bot.n});
      }
    }
    const oy0 = Math.max(A.y, B.y), oy1 = Math.min(A.y + A.h, B.y + B.h);
    if (oy1 - oy0 >= 0.3) {
      const left = A.x < B.x ? A : B, right = A.x < B.x ? B : A, gap = right.x - (left.x + left.w);
      if (gap > 0.3 && gap < 1.5 && !niche(A, B, 'h')) {
        const g = {x: left.x + left.w, y: oy0, w: gap, h: oy1 - oy0};
        if (!all.some(o => o !== A && o !== B && interArea(o, g) > 1e-4)) res.push({dir: 'h', y: (oy0 + oy1) / 2, x1: g.x, x2: g.x + gap, gap, a: left.n, b: right.n});
      }
    }
  }
  passages = res.filter(p => p.gap < 1.2).sort((a, b) => a.gap - b.gap);
  return passages;
}
function drawPassages() {
  if (!passageOn) return;
  ctx.save();
  for (const p of passages) {
    const col = p.gap < 0.9 ? TK.danger : TK.warn;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    let x1, y1, x2, y2;
    if (p.dir === 'v') { x1 = x2 = w2sx(p.x); y1 = w2sy(p.y1); y2 = w2sy(p.y2); } else { y1 = y2 = w2sy(p.y); x1 = w2sx(p.x1); x2 = w2sx(p.x2); }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ah = 5;
    if (p.dir === 'v') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ah, y1 + ah); ctx.lineTo(x1 + ah, y1 + ah); ctx.fill(); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ah, y2 - ah); ctx.lineTo(x2 + ah, y2 - ah); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + ah, y1 - ah); ctx.lineTo(x1 + ah, y1 + ah); ctx.fill(); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ah, y2 - ah); ctx.lineTo(x2 - ah, y2 + ah); ctx.fill(); }
    ctx.font = FONT(600, 11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = (x1 + x2) / 2 + (p.dir === 'v' ? 24 : 0), ty = (y1 + y2) / 2 + (p.dir === 'h' ? -12 : 0), txt = fmtM(p.gap);
    const tw = ctx.measureText(txt).width + 8;
    ctx.fillStyle = TK.paper; ctx.fillRect(tx - tw / 2, ty - 8, tw, 16); ctx.fillStyle = col; ctx.fillText(txt, tx, ty);
  }
  ctx.restore();
}
function counterFrontDepth() {
  const counters = state.items.filter(it => /^banko_/.test(it.key));
  if (!counters.length) return null;
  const obs = [];
  for (const it of state.items) if (isFurniture(it) && !/^banko_|^kasa_pos/.test(it.key)) obs.push(itemAABB(it));
  for (const r of state.rooms) obs.push(r);
  let best = null;
  for (const c of counters) {
    const t = deg2rad(c.rot || 0), dirx = -Math.sin(t), diry = Math.cos(t);
    const f = toWorld(c, 0, c.h / 2);
    let d = 0;
    for (d = 0.05; d < 8; d += 0.05) {
      const px = f.x + dirx * d, py = f.y + diry * d;
      if (px < 0 || py < 0 || px > state.shop.w || py > state.shop.h) break;
      if (obs.some(o => pointInRect(o, px, py))) break;
    }
    if (best === null || d < best) best = d;
  }
  return best;
}

/* =====================================================================
   PANEL
   ===================================================================== */
let activeTab = 'rooms', libQuery = '', libCat = 'satis';
const PIN_LABEL = {'': 'Serbest', tl: 'Sol üst', tr: 'Sağ üst', bl: 'Sol alt', br: 'Sağ alt'};
function numField(label, key, val, opts = {}) {
  return `<div class="field"><label>${label}</label><input type="text" inputmode="decimal" data-num="${key}" value="${fmtM(val)}" ${opts.disabled ? 'disabled' : ''}></div>`;
}
function renderPanel() {
  const body = $('#panelBody');
  const o = findSel();
  let html = '';
  if (o) html += sel.type === 'room' ? roomCard(o) : itemCard(o);
  if (activeTab === 'rooms') html += roomsTab();
  else if (activeTab === 'lib') html += libTab();
  else html += summaryTab();
  body.innerHTML = html;
  bindPanel(body);
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  if (activeTab === 'lib') drawLibIcons(body);
  positionCtxBar();
}
function hintsHtml(list) {
  const ic = {ok: '✓', no: '✗', so: '!', info: '•'};
  return `<div class="hints">${list.map(h => `<div><span class="ic ${h.s}">${ic[h.s] || '•'}</span><span>${esc(h.t)}</span></div>`).join('')}</div>`;
}
function roomCard(r) {
  const a = r.w * r.h, net = netArea(r), cmp = compareLines(a, r.w, r.h);
  return `<div class="card sel">
    <h3>Seçili oda <span class="sp"></span><span class="chip" style="background:${hexA(r.color, .35)}">${esc(roomType(r) === 'other' ? 'oda' : roomType(r))}</span></h3>
    <div class="row"><div class="field grow"><label>Oda adı</label><input type="text" data-name value="${esc(r.name)}"></div></div>
    <div class="swatches">${ROOM_COLORS.map(c => `<button data-color="${c}" class="${c === r.color ? 'on' : ''}" style="background:${c}" title="Renk"></button>`).join('')}</div>
    <div class="row">${numField('X (m)', 'x', r.x, {disabled: r.locked || r.pin})}${numField('Y (m)', 'y', r.y, {disabled: r.locked || r.pin})}${numField('En (m)', 'w', r.w, {disabled: r.locked})}${numField('Boy (m)', 'h', r.h, {disabled: r.locked})}</div>
    <div class="stat"><span class="k">Brüt alan</span><span class="v big" data-live="area">${fmtA(a)}</span><span class="k">Net (duvar düşülmüş)</span><span class="v" data-live="net">${fmtA(net)}</span></div>
    ${cmp.length ? `<div class="cmp" data-live="cmp">${cmp.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="row"><div class="field"><label>Köşe pimi</label><select data-pin>${Object.entries(PIN_LABEL).map(([k, v]) => `<option value="${k}" ${r.pin === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><div class="row"><button class="mini ${r.locked ? 'on' : ''}" data-act="lock">${r.locked ? '🔒 Kilitli' : '🔓 Kilit'}</button><button class="mini" data-act="door">Kapı ekle</button></div></div></div>
    ${r.pin ? '<div class="note">📌 Köşeye sabit — yalnızca boyutu değişir; pimi kaldırmak için “Serbest” seç.</div>' : ''}
    <div data-live="hints">${hintsHtml(roomHints(r))}</div>
    <div class="row"><button class="mini" data-act="dup">Çoğalt</button><button class="mini" data-act="fit">Sığdır</button><span class="sp" style="flex:1"></span><button class="mini danger" data-act="del">Sil</button></div>
  </div>`;
}
function itemCard(it) {
  const d = LIB_BY_KEY[it.key] || {}, room = itemRoom(it), bb = itemAABB(it), isDoor = DOOR_SHAPES.has(d.s);
  const cat = (CATS.find(c => c[0] === d.c) || [])[1] || '';
  return `<div class="card sel">
    <h3>Seçili eşya <span class="sp"></span><span class="chip">${esc(cat)}</span></h3>
    <div class="row"><div class="field grow"><label>Ad</label><input type="text" data-name value="${esc(it.name)}"></div></div>
    <div class="row">${numField('En (m)', 'w', it.w, {disabled: it.locked})}${numField('Derinlik (m)', 'h', it.h, {disabled: it.locked})}
      <div class="field"><label>Döndürme (°)</label><div class="rotwrap"><input type="text" inputmode="numeric" data-rot value="${it.rot || 0}" ${it.locked ? 'disabled' : ''}><button class="mini" data-act="rot-" title="−90°">⟲</button><button class="mini" data-act="rot+" title="+90°">⟳</button></div></div></div>
    <div class="stat"><span class="k">Ekranda kaplama</span><span class="v" data-live="bb">${fmtM(bb.w)} × ${fmtM(bb.h)} m</span><span class="k">Yer</span><span class="v" style="font-family:var(--font-ui)" data-live="room">${room ? esc(room.name) : 'Satış alanı'}</span>${d.hm ? `<span class="k">Yükseklik</span><span class="v">${fmtM(d.hm)} m</span>` : ''}</div>
    ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
    <div class="row">${isDoor ? `<button class="mini ${it.flip ? 'on' : ''}" data-act="flip">Menteşe: ${it.flip ? 'sağ' : 'sol'}</button>` : ''}<button class="mini ${it.locked ? 'on' : ''}" data-act="lock">${it.locked ? '🔒 Kilitli' : '🔓 Kilit'}</button><button class="mini" data-act="dup">Çoğalt</button><span style="flex:1"></span><button class="mini danger" data-act="del">Sil</button></div>
  </div>`;
}
function roomsTab() {
  const an = analyze(), S = state.shop;
  const rows = state.rooms.map(r => `<div class="room-item ${sel && sel.id === r.id ? 'active' : ''}" data-room="${r.id}"><span class="sw" style="background:${r.color}"></span><div><div class="nm">${esc(r.name)} ${r.pin ? '📌' : ''}${r.locked ? '🔒' : ''}</div><div class="dm">${fmtM(r.w)} × ${fmtM(r.h)} m${roomOverlaps(r) ? ' · <span class="warn">çakışıyor</span>' : ''}</div></div><span class="ar">${fmtA(r.w * r.h)}</span></div>`).join('');
  return `<div class="card"><h3>Dükkân</h3>
    <div class="row">${numField('Uzunluk (m)', 'shop.w', S.w)}${numField('En (m)', 'shop.h', S.h)}${numField('Bölme duvar (m)', 'shop.wall', S.wall)}</div>
    <div class="stat"><span class="k">Toplam iç alan</span><span class="v big">${fmtA(an.total)}</span></div>
    <div class="row"><button class="mini" data-act="fliph">⇄ Yatay çevir</button><button class="mini" data-act="flipv">⇅ Dikey çevir</button></div>
    <div class="note">Plan üstten görünüştür. Girişin yeri farklıysa çevir ya da kapıyı taşı.</div></div>
  <div class="card"><h3>Odalar <span class="sp"></span><span class="chip">${state.rooms.length}</span></h3>
    <div class="roomlist">${rows}
      <div class="room-item" style="cursor:default;border-style:dashed"><span class="sw" style="background:transparent;border-color:var(--line-strong)"></span><div><div class="nm">Satış alanı (kalan)</div><div class="dm">dükkân − odalar</div></div><span class="ar">${fmtA(an.sales)}</span></div>
    </div>
    <div class="bar" title="Odalar / satış alanı">${state.rooms.map(r => `<i style="width:${(r.w * r.h / an.total * 100).toFixed(1)}%;background:${r.color}"></i>`).join('')}</div>
    <div class="note">Odalar %${Math.round(an.roomsUnion / an.total * 100)} · Satış alanı %${Math.round(an.sales / an.total * 100)}${an.sales / an.total < 0.5 ? ' — <span style="color:var(--warn)">satış alanı yarının altında</span>' : ''}</div>
  </div>
  <div class="card"><h3>Oda ekle</h3>
    <div class="chips">${ROOM_TEMPLATES.map((t, i) => `<button class="chip" data-tpl="${i}" style="border-left:4px solid ${t.color}">${esc(t.name)} <b>${fmtM(t.w)}×${fmtM(t.h)}</b></button>`).join('')}</div>
    <div class="note">Şablon ilk boş yere düşer; sonra sürükle ve köşelerden boyutlandır. Serbest çizim için üstteki <b>Oda çiz</b> aracı.</div>
  </div>`;
}
function libTab() {
  const q = libQuery.toLocaleLowerCase('tr');
  const list = LIB.filter(d => (q ? d.n.toLocaleLowerCase('tr').includes(q) : d.c === libCat));
  return `<div class="card"><h3>Eşya ekle</h3>
    <input class="search" type="search" placeholder="Ara: banko, sedye, raf…" data-search value="${esc(libQuery)}">
    <div class="chips">${CATS.map(c => `<button class="chip ${!q && libCat === c[0] ? 'on' : ''}" data-cat="${c[0]}">${c[1]}</button>`).join('')}</div>
    <div class="note">${sel && sel.type === 'room' ? 'Eşya seçili odanın ortasına düşer.' : 'Eşya ekranın ortasına düşer; sonra sürükle. Bir oda seçersen onun içine düşer.'}</div>
    <div class="lib">${list.map(d => `<button data-add="${d.key}" title="${esc(d.note || d.n)}"><canvas width="128" height="72" data-icon="${d.key}"></canvas><span class="n">${esc(d.n)}</span><span class="d">${fmtM(d.w)} × ${fmtM(d.h)}</span></button>`).join('')}</div>
  </div>`;
}
function drawLibIcons(root) {
  readTokens();
  root.querySelectorAll('canvas[data-icon]').forEach(cv => {
    const d = LIB_BY_KEY[cv.dataset.icon], g = cv.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 64, 36);
    const s = Math.min(54 / d.w, 28 / d.h, 60);
    g.translate(32, 18);
    drawShape(g, d.s, d.w * s, d.h * s, {tk: TK, w: d.w, h: d.h});
  });
}
function summaryTab() {
  const an = analyze();
  const rows = state.rooms.map(r => `<tr><td><span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${r.color};margin-right:5px"></span>${esc(r.name)}</td><td class="num">${fmtM(r.w)} × ${fmtM(r.h)}</td><td class="num">${fmtM(r.w * r.h)} / ${fmtM(netArea(r))}</td></tr>`).join('');
  const narrow = passageOn ? computePassages() : passages;
  const cf = counterFrontDepth();
  const ic = {ok: '✓', no: '✗', so: '!'};
  return `<div class="card"><h3>Alan özeti</h3>
    <div class="stat"><span class="k">Dükkân</span><span class="v big">${fmtA(an.total)}</span>
      <span class="k">Odalar toplamı</span><span class="v">${fmtA(an.roomsUnion)} <span style="color:var(--muted);font-weight:500">%${Math.round(an.roomsUnion / an.total * 100)}</span></span>
      <span class="k">Satış alanı (kalan)</span><span class="v" style="${an.sales / an.total < 0.5 ? 'color:var(--warn)' : ''}">${fmtA(an.sales)} <span style="color:var(--muted);font-weight:500">%${Math.round(an.sales / an.total * 100)}</span></span>
      <span class="k">Satış alanında eşya</span><span class="v">${fmtA(an.salesItemArea)}</span>
      <span class="k">Yürünebilir alan</span><span class="v">${fmtA(an.walkable)}</span>
      <span class="k">Aynı anda rahat müşteri (4 m²)</span><span class="v">${Math.floor(an.walkable / ERGO.m2CustomerComfort)} kişi · yoğun ${Math.floor(an.walkable / ERGO.m2CustomerBusy)}</span>
      <span class="k">Raf yüzü</span><span class="v">${fmt1(an.shelf)} m <span style="color:var(--muted);font-weight:500">hedef 18–23</span></span>
      ${cf !== null ? `<span class="k">Banko önü serbest derinlik</span><span class="v" style="${cf < 1.5 ? 'color:var(--warn)' : ''}">${fmtM(cf)} m <span style="color:var(--muted);font-weight:500">≥1,50</span></span>` : ''}
      ${narrow.length ? `<span class="k">En dar geçiş</span><span class="v" style="color:${narrow[0].gap < 0.9 ? 'var(--danger)' : 'var(--warn)'}">${fmtM(narrow[0].gap)} m</span>` : ''}
    </div>
    ${an.overlaps.length ? `<div class="check"><span class="m no">✗</span><span>Odalar çakışıyor: ${an.overlaps.map(o => `${esc(o.a.name)} – ${esc(o.b.name)} (${fmtA(o.area)})`).join(', ')}</span></div>` : ''}
    <div class="row"><button class="mini ${passageOn ? 'on' : ''}" data-act="passage">${passageOn ? 'Geçiş kontrolü açık' : 'Geçiş kontrolü'}</button><span class="note">1,20 m altı geçişler planda oklarla gösterilir (0,90 altı kırmızı)</span></div>
    ${passageOn && narrow.length ? `<div class="hints">${narrow.slice(0, 6).map(p => `<div><span class="ic ${p.gap < 0.9 ? 'no' : 'so'}">${p.gap < 0.9 ? '✗' : '!'}</span><span>${fmtM(p.gap)} m — ${esc(p.a)} ↔ ${esc(p.b)}: ${esc(rulerComment(p.gap).t)}</span></div>`).join('')}</div>` : passageOn ? '<div class="note">1,20 m altında geçiş yok 👍</div>' : ''}
  </div>
  <div class="card"><h3>Odalar (brüt / net m²)</h3>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Oda</th><th style="text-align:right">En × Boy</th><th style="text-align:right">m²</th></tr></thead><tbody>${rows}<tr><td>Satış alanı</td><td class="num">—</td><td class="num">${fmtM(an.sales)}</td></tr></tbody></table></div>
    <div class="note">Net alan bölme duvarı (${fmtM(state.shop.wall)} m) düşülerek yaklaşık hesaplanır.</div>
  </div>
  <div class="card"><h3>Yönetmelik kontrol</h3>
    ${an.checks.map(c => `<div class="check"><span class="m ${c.s}">${ic[c.s]}</span><span>${esc(c.t)}${c.d ? ` <span style="color:var(--muted)">— ${esc(c.d)}</span>` : ''}</span></div>`).join('')}
    <div class="note">Eczacılar ve Eczaneler Hakkında Yönetmelik Md. 20–22 özetidir; il sağlık müdürlüğü ve eczacı odasıyla teyit et. Bu plan ön tasarımdır, resmî kroki yerine geçmez.</div>
  </div>
  <div class="card"><h3>Kısayollar</h3>
    <div class="note" style="line-height:1.9"><span class="kbd">V</span> Seç · <span class="kbd">O</span> Oda çiz · <span class="kbd">C</span> Cetvel · <span class="kbd">H</span> Kaydır · <span class="kbd">F</span> Sığdır · <span class="kbd">G</span> Izgara · <span class="kbd">S</span> Yapış · <span class="kbd">R</span> Döndür 90° · <span class="kbd">L</span> Kilit · <span class="kbd">Del</span> Sil · <span class="kbd">Ok</span> 5 cm · <span class="kbd">Shift+Ok</span> 25 cm · <span class="kbd">Ctrl+Z</span> Geri · <span class="kbd">Ctrl+Y</span> Yinele · <span class="kbd">Ctrl+D</span> Çoğalt · <span class="kbd">Alt</span> Yapışmayı geçici kapat · <span class="kbd">Space</span> Kaydır · <span class="kbd">Esc</span> İptal · Boş alana çift tık: sığdır</div>
  </div>`;
}
function bindPanel(body) {
  const o = findSel();
  body.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('change', () => { if (!o) return; o.name = inp.value.trim().slice(0, 60) || o.name; commit(); renderPanel(); }));
  body.querySelectorAll('[data-num]').forEach(inp => {
    const apply = () => {
      const k = inp.dataset.num, prev = k.startsWith('shop.') ? state.shop[k.slice(5)] : (o ? o[k] : 0);
      let v = parseNum(inp.value, prev);
      if (k === 'shop.w' || k === 'shop.h') { v = clamp(v, 2, 100); state.shop[k.slice(5)] = r2(v); for (const r of state.rooms) clampRoom(r); for (const it of state.items) clampItem(it); $('#shopDims').textContent = `${fmtM(state.shop.w)} × ${fmtM(state.shop.h)} m`; }
      else if (k === 'shop.wall') { state.shop.wall = clamp(v, 0, 0.5); }
      else if (o) {
        if (sel.type === 'room') { if (k === 'w' || k === 'h') v = Math.max(MIN_ROOM, v); o[k] = r3(v); clampRoom(o); }
        else { if (k === 'w' || k === 'h') { const c = itemCenter(o); o[k] = Math.max(MIN_ITEM, r3(v)); o.x = r3(c.x - o.w / 2); o.y = r3(c.y - o.h / 2); } else o[k] = r3(v); clampItem(o); }
      }
      commit(); renderPanel();
    };
    inp.addEventListener('change', apply);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } });
  });
  body.querySelectorAll('[data-rot]').forEach(inp => inp.addEventListener('change', () => { if (o) { setRotation(o, parseFloat(inp.value.replace(',', '.')) || 0); renderPanel(); } }));
  body.querySelectorAll('[data-pin]').forEach(s => s.addEventListener('change', () => { if (o) { o.pin = s.value; clampRoom(o); commit(); renderPanel(); } }));
  body.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { if (o) { o.color = b.dataset.color; commit(); renderPanel(); } }));
  body.querySelectorAll('[data-room]').forEach(el => el.addEventListener('click', () => { selectObj('room', el.dataset.room); renderPanel(); }));
  body.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => addRoomTemplate(ROOM_TEMPLATES[+b.dataset.tpl])));
  body.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addItem(b.dataset.add)));
  body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { libCat = b.dataset.cat; libQuery = ''; renderPanel(); }));
  const sr = body.querySelector('[data-search]');
  if (sr) { sr.addEventListener('input', () => { libQuery = sr.value; const pos = sr.selectionStart; renderPanel(); const n = $('#panelBody [data-search]'); n.focus(); n.setSelectionRange(pos, pos); }); }
  body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => doAct(b.dataset.act)));
}
function doAct(act) {
  const o = findSel();
  switch (act) {
    case 'lock': toggleLock(); renderPanel(); break;
    case 'del': deleteSel(); break;
    case 'dup': duplicateSel(); break;
    case 'door': if (o && sel.type === 'room') addDoorToRoom(o); break;
    case 'flip': if (o) { o.flip = !o.flip; commit(); renderPanel(); } break;
    case 'rot+': rotateSel(90); renderPanel(); break;
    case 'rot-': rotateSel(-90); renderPanel(); break;
    case 'fit': if (o) { const bb = sel.type === 'room' ? o : itemAABB(o); const s = clamp(Math.min((cw - 120) / bb.w, (ch - 120) / bb.h), 5, 800); autoFit = false; view.s = s; view.ox = cw / 2 - (bb.x + bb.w / 2) * s; view.oy = ch / 2 - (bb.y + bb.h / 2) * s; requestDraw(); } break;
    case 'fliph': flipPlan('h'); break;
    case 'flipv': flipPlan('v'); break;
    case 'passage': passageOn = !passageOn; if (passageOn) computePassages(); renderPanel(); requestDraw(); break;
  }
}
function updateLive() {
  const o = findSel(); if (!o) return;
  const body = $('#panelBody');
  const set = (k, v) => { const el = body.querySelector(`[data-live="${k}"]`); if (el) el.textContent = v; };
  const setV = (k, v) => { const el = body.querySelector(`[data-num="${k}"]`); if (el && document.activeElement !== el) el.value = fmtM(v); };
  if (sel.type === 'room') { set('area', fmtA(o.w * o.h)); set('net', fmtA(netArea(o))); setV('x', o.x); setV('y', o.y); setV('w', o.w); setV('h', o.h); const ce = body.querySelector('[data-live="cmp"]'); if (ce) ce.innerHTML = compareLines(o.w * o.h, o.w, o.h).map(c => `<span class="chip">${esc(c)}</span>`).join(''); const he = body.querySelector('[data-live="hints"]'); if (he) he.innerHTML = hintsHtml(roomHints(o)); }
  else { const bb = itemAABB(o), r = itemRoom(o); set('bb', `${fmtM(bb.w)} × ${fmtM(bb.h)} m`); set('room', r ? r.name : 'Satış alanı'); setV('w', o.w); setV('h', o.h); const ri = body.querySelector('[data-rot]'); if (ri && document.activeElement !== ri) ri.value = o.rot || 0; }
  if (passageOn) computePassages();
  positionCtxBar();
}
/* mini bağlam çubuğu */
function positionCtxBar() {
  const bar = $('#ctxbar'), o = findSel();
  if (!o || drag) { bar.hidden = true; return; }
  const bb = sel.type === 'room' ? o : itemAABB(o);
  const px = w2sx(bb.x + bb.w / 2), py = w2sy(bb.y) - 46;
  bar.hidden = false;
  bar.style.left = clamp(px - bar.offsetWidth / 2, 6, cw - bar.offsetWidth - 6) + 'px';
  bar.style.top = clamp(py < 8 ? w2sy(bb.y + bb.h) + 12 : py, 6, ch - 44) + 'px';
  bar.querySelector('[data-act="rot+"]').hidden = sel.type !== 'item';
  bar.querySelector('[data-act="lock"]').textContent = o.locked ? '🔒' : '🔓';
}
