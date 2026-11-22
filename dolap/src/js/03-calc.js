/* =====================================================================
   Hesap motoru: dolap ölçüleri → parçalar (3B konum + kesim ölçüsü)
   Her parçanın boy/en/kalınlığı 3B kutusundan türetilir; böylece 3B
   görüntü ile kesim listesi her zaman birebir aynıdır.
   Boy (L) = desen / su yönü; En (W); Kalınlık (T).
   ===================================================================== */
const RAILS = [250, 270, 300, 350, 400, 450, 500, 550, 600, 650, 700];
const hingeCount = h => h <= 900 ? 2 : h <= 1500 ? 3 : h <= 2000 ? 4 : 5;
const hingeAt = (h, n) => n < 2 ? [h / 2] : Array.from({length: n}, (_, i) => 100 + (h - 200) * i / (n - 1));
const HINGE_TYPE = {full: 'Düz menteşe (tam bindirme)', half: 'Yarım bükük menteşe (yarım bindirme)', inset: 'Tam bükük menteşe (gömme kapak)'};
const RAIL_TYPE = {ball: 'Bilyalı teleskopik ray', roller: 'Makaralı ray', hidden: 'Gizli ray (frenli)'};
const KIND_ORDER = ['side', 'top', 'bottom', 'rail', 'divider', 'sep', 'shelf', 'back', 'plinth', 'door', 'dfront', 'dside', 'dfb', 'dbottom'];
const AXI = {x: 0, y: 1, z: 2};

/* Formül: [[değer, 'açıklama', işaret], ...] → {v, s}; değeri sıfır olan ek terimler yazılmaz */
function fx(terms) {
  const ts = terms.filter((q, i) => !i || Math.abs(q[0]) > 1e-9);
  let v = 0, s = '';
  ts.forEach(([x, tx, sg], i) => { const neg = i && sg < 0; v += neg ? -x : x; s += (i ? (neg ? ' − ' : ' + ') : '') + fmt(x) + (tx ? ' ' + tx : ''); });
  return {v, s: ts.length > 1 ? `${s} = ${fmt(v)}` : s};
}

function calcCab(c) {
  const R = {parts: [], hw: [], warn: [], sum: [], secs: [], extras: [], check: [], ok: false, dims: null};
  const P = R.parts, warn = (lvl, t) => R.warn.push({lvl, t});
  const {W, H, D, t} = c, bt = c.backT, tf = c.frontT, dt = c.drawerT, g = c.gap, e = c.edge;
  const bb = c.bandBody, bf = c.bandFront, bd = c.bandDrawer;
  if (!(W >= 100 && H >= 100 && D >= 100)) { warn('err', 'Genişlik, yükseklik ve derinlik en az 100 mm olmalı.'); return R; }
  if (W > 6000 || H > 4000 || D > 1500) { warn('err', 'Ölçüler çok büyük görünüyor (mm girildiğinden emin ol).'); return R; }
  if (!(t >= 5 && t <= 50 && 3 * t < Math.min(W, H))) { warn('err', 'Gövde kalınlığı geçersiz.'); return R; }
  const hw = (k, n, q, note = '') => { if (q > 0) R.hw.push({k, n, q, note}); };
  const add = o => {
    const b = o.box, ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const p = Object.assign({mat: 'body', bandL: [0, 0], bandW: [0, 0], notes: [], sub: ''}, o);
    p.L = ext[AXI[o.ax[0]]]; p.Wd = ext[AXI[o.ax[1]]]; p.T = ext[AXI[o.ax[2]]];
    P.push(p); return p;
  };

  /* ---- taban / gövde yüksekliği ---- */
  let base = c.base; const botOver = c.build === 'over';
  if (base === 'plinth' && botOver) { base = 'frame'; warn('info', 'Alt tabla yanların altında olduğu için yanlar yere inemez; baza, ayrı baza kasası olarak hesaplandı.'); }
  const raised = base === 'legs' || base === 'frame';
  const bH = base === 'none' || base === 'wall' ? 0 : c.baseH;
  if (bH && (bH < 20 || bH > H - 3 * t - 60)) { warn('err', 'Baza / ayak yüksekliği dolap yüksekliğine göre geçersiz.'); return R; }
  const y0c = raised ? bH : 0, Hc = H - y0c, yTop1 = H;
  const hasTop = c.top !== 'none', topOver = hasTop && (c.build === 'top' || botOver);
  const nailed = c.back === 'nailed', zb0 = nailed ? bt : 0, Dc = D - zb0;
  const go = c.grooveO, gd = c.grooveD, tol = c.backTol;
  const Di = c.back === 'groove' ? D - go - bt : c.back === 'none' ? D : D - bt, zi0 = D - Di;
  const botY0 = base === 'plinth' ? bH : y0c, yb = botY0 + t, yt = hasTop ? yTop1 - t : yTop1;
  const sideH = Hc - (topOver ? t : 0) - (botOver ? t : 0), sideY0 = y0c + (botOver ? t : 0);
  const Wi = W - 2 * t, Hi = yt - yb;
  if (Wi < 60 || Hi < 60 || Di < 60) { warn('err', 'İç hacim çok küçük; ölçüleri ve kalınlıkları kontrol et.'); return R; }
  if (c.back === 'groove' && (gd >= t * .75 || go + bt >= D / 3)) warn('warn', `Arkalık kanalı (${fmt(gd)} mm derin, arkadan ${fmt(go)} mm) gövde kalınlığına / derinliğe göre fazla.`);
  const inset = c.overlay === 'inset', half = c.overlay === 'half';

  /* ---- yan dikmeler ---- */
  const baseTx = base === 'legs' ? '(ayak)' : '(baza kasası)';
  const fSide = fx([[H, '(yükseklik)'], [y0c, baseTx, -1], [topOver ? t : 0, '(üst tabla)', -1], [botOver ? t : 0, '(alt tabla)', -1]]);
  const fDc = fx([[D, '(derinlik)'], [zb0, '(çakma arkalık)', -1]]);
  const grooveNote = c.back === 'groove' ? `Arkalık kanalı: arka kenardan ${fmt(go)} mm içeride, ${fmt(bt + .5)} mm genişlik, ${fmt(gd)} mm derinlik.` : null;
  for (const [sd, nm] of [['L', 'sol'], ['R', 'sağ']]) {
    const x0 = sd === 'L' ? 0 : W - t;
    add({id: 'side-' + sd, name: 'Yan dikme', sub: nm, kind: 'side', box: [x0, sideY0, zb0, x0 + t, sideY0 + sideH, D], ax: 'yzx', bandL: [bb, 0], fL: fSide.s, fW: fDc.s, notes: [grooveNote, base === 'plinth' ? `Alt tabla yerden ${fmt(bH)} mm yukarıda (baza boşluğu); ön baza ${fmt(c.plinthSet)} mm içeride.` : null].filter(Boolean)});
  }
  /* ---- üst ---- */
  const fTop = topOver ? fx([[W, '(genişlik)']]) : fx([[W, '(genişlik)'], [2 * t, '(2 yan)', -1]]);
  const tx0 = topOver ? 0 : t, tx1 = topOver ? W : W - t;
  if (c.top === 'panel') add({id: 'top', name: 'Üst tabla', kind: 'top', box: [tx0, yTop1 - t, zb0, tx1, yTop1, D], ax: 'xzy', bandL: [bb, 0], fL: fTop.s, fW: fDc.s, notes: [grooveNote].filter(Boolean)});
  else if (c.top === 'rails') {
    const rw = Math.min(c.railW, Dc / 2);
    add({id: 'rail-f', name: 'Ön kuşak', kind: 'rail', box: [tx0, yTop1 - t, D - rw, tx1, yTop1, D], ax: 'xzy', bandL: [bb, 0], fL: fTop.s, fW: `${fmt(rw)} (kuşak eni)`});
    add({id: 'rail-b', name: 'Arka kuşak', kind: 'rail', box: [tx0, yTop1 - t, zb0, tx1, yTop1, zb0 + rw], ax: 'xzy', fL: fTop.s, fW: `${fmt(rw)} (kuşak eni)`, notes: [c.back === 'groove' ? 'Arkalık kanalı arka kuşakta da açılır.' : null].filter(Boolean)});
  }
  /* ---- alt tabla ---- */
  const fBot = botOver ? fx([[W, '(genişlik)']]) : fx([[W, '(genişlik)'], [2 * t, '(2 yan)', -1]]);
  add({id: 'bottom', name: 'Alt tabla', kind: 'bottom', box: [botOver ? 0 : t, botY0, zb0, botOver ? W : W - t, botY0 + t, D], ax: 'xzy', bandL: [bb, 0], fL: fBot.s, fW: fDc.s, notes: [grooveNote].filter(Boolean)});

  /* ---- arkalık ---- */
  if (c.back === 'groove') {
    const y1 = hasTop ? yt + gd - tol : yt - tol;
    add({id: 'back', name: 'Arkalık', kind: 'back', mat: 'back', box: [t - gd + tol, yb - gd + tol, go, W - t + gd - tol, y1, go + bt], ax: 'yxz',
      fL: fx([[Hi, '(iç yükseklik)'], [gd, '(alt kanal)'], [hasTop ? gd : 0, '(üst kanal)'], [hasTop ? 2 * tol : tol, '(boşluk payı)', -1]]).s,
      fW: fx([[Wi, '(iç genişlik)'], [2 * gd, '(2 yan kanal)'], [2 * tol, '(boşluk payı)', -1]]).s,
      notes: [`Yanların, alt tablanın${hasTop ? ' ve üstün' : ''} kanalına geçer (kanal ${fmt(gd)} mm, arka kenardan ${fmt(go)} mm).`]});
  } else if (nailed) {
    const y0 = (base === 'plinth' ? botY0 : y0c) + tol;
    add({id: 'back', name: 'Arkalık', kind: 'back', mat: 'back', box: [tol, y0, 0, W - tol, yTop1 - tol, bt], ax: 'yxz',
      fL: fx([[H, '(yükseklik)'], [base === 'plinth' ? bH : y0c, base === 'plinth' ? '(baza boşluğu)' : baseTx, -1], [2 * tol, '(kenar payı)', -1]]).s,
      fW: fx([[W, '(genişlik)'], [2 * tol, '(kenar payı)', -1]]).s,
      notes: ['Gövdenin arkasına çakılır / vidalanır; gövde parçalarının derinliği arkalık kalınlığı kadar azdır.']});
  } else if (c.back === 'inset') {
    add({id: 'back', name: 'Arkalık (gömme)', kind: 'back', mat: 'back', box: [t, yb, 0, W - t, yt, bt], ax: 'yxz', fL: fx([[Hi, '(iç yükseklik)']]).s, fW: fx([[Wi, '(iç genişlik)']]).s, notes: ['Yanların ve tablaların arasına, arka kenarla aynı hizada oturur.']});
  }

  /* ---- bölmeler ---- */
  const secs = c.sections, n = secs.length, avail = Wi - (n - 1) * t;
  let fixedSum = 0, autoN = 0;
  for (const s of secs) { if (s.w > 0) fixedSum += s.w; else autoN++; }
  const autoW = autoN ? (avail - fixedSum) / autoN : 0;
  const widths = secs.map(s => s.w > 0 ? s.w : autoW);
  if (!autoN && Math.abs(fixedSum - avail) > .05) { warn('warn', `Bölme genişlikleri toplamı (${fmt(fixedSum)}) kullanılabilir iç genişliğe (${fmt(avail)}) eşit değil; son bölme ${fmt(widths[n - 1] + avail - fixedSum)} mm yapıldı.`); widths[n - 1] += avail - fixedSum; }
  if (widths.some(w => w < 60)) { warn('err', `Bölme çok dar (${widths.map(fmt).join(' / ')} mm). Bölme sayısını azalt ya da genişlikleri düzelt.`); return R; }

  const FY0 = inset ? yb : botY0, FY1 = inset ? yt : yTop1;
  const cnt = {hinge: 0, pin: 0, handle: 0, rails: [], rods: [], hingeType: HINGE_TYPE[c.overlay] || HINGE_TYPE.full};
  const maxRail = Di - (inset ? tf : 0) - 10, railLen = RAILS.filter(r => r <= maxRail).pop() || 0;
  let x = t;
  for (let i = 0; i < n; i++) {
    const s = secs[i], sw = widths[i], sx = x, first = i === 0, last = i === n - 1, tag = n > 1 ? `B${i + 1}` : '';
    const SI = {i, sx, sw, shelves: 0, drawers: 0, doors: 0};
    R.secs.push(SI);
    x += sw;
    if (!last) {
      add({id: `div-${i + 1}`, name: 'Ara dikme', sub: n > 2 ? `${i + 1}. ara` : '', kind: 'divider', box: [x, yb, zi0, x + t, yt, D], ax: 'yzx', bandL: [bb, 0],
        fL: fx([[Hi, '(iç yükseklik)']]).s, fW: fx([[Di, '(iç derinlik)']]).s, notes: [`Soldan ${fmt(x)} mm (iç yüzden ${fmt(x - t)} mm).`]});
      x += t;
    }
    /* ön (kapak/çekmece) yatay sınırları */
    let fx0, fx1;
    if (inset) { fx0 = sx + e; fx1 = sx + sw - e; }
    else { fx0 = first ? (half ? t / 2 + g / 2 : e) : sx - t / 2 + g / 2; fx1 = last ? (half ? W - t / 2 - g / 2 : W - e) : sx + sw + t / 2 - g / 2; }
    const frontW = fx1 - fx0;
    let yLo = yb, yHi = yt, dy0 = FY0 + e, doorsOn = true;
    /* çekmeceler */
    const nd = s.drawers;
    if (nd > 0) {
      const auto = !(s.drawerH > 0);
      const fh = auto ? (FY1 - FY0 - 2 * e - (nd - 1) * g) / nd : s.drawerH;
      const fronts = Array.from({length: nd}, (_, k) => FY0 + e + k * (fh + g));
      const zoneTop = FY0 + e + nd * fh + (nd - 1) * g;
      let sepY0 = null;
      if (auto) doorsOn = false;
      else if (zoneTop > FY1 - e - 80) { warn('err', `${tag || 'Bölme'}: ${nd} × ${fmt(fh)} mm çekmece bölme yüksekliğine sığmıyor.`); doorsOn = false; }
      else {
        sepY0 = inset ? zoneTop + e : zoneTop + g / 2 - t / 2;
        add({id: `sep-${i}`, name: 'Ara tabla', sub: 'çekmece üstü', kind: 'sep', box: [sx, sepY0, zi0, sx + sw, sepY0 + t, D], ax: 'xzy', bandL: [bb, 0], fL: fx([[sw, '(bölme iç genişliği)']]).s, fW: fx([[Di, '(iç derinlik)']]).s, notes: [`Alt tablanın üst yüzünden ${fmt(sepY0 - yb)} mm yukarıda (sabit, minifix ile).`]});
        yLo = sepY0 + t; dy0 = inset ? yLo + e : zoneTop + g;
      }
      if (fh < 80) warn('warn', `${tag || 'Bölme'}: çekmece önü ${fmt(fh)} mm — çok alçak.`);
      if (!railLen) warn('err', `İç derinlik (${fmt(Di)} mm) çekmece rayı için yetersiz (en kısa ray 250 mm).`);
      const boxW = sw - 2 * c.railGap, fbL = boxW - 2 * dt, zf = (inset ? D - tf : D) - 2;
      const span = k => { const fy = fronts[k]; return [k === 0 ? yb : fy - g / 2, k === nd - 1 ? (auto ? yt : sepY0) : fy + fh + g / 2]; };
      /* aynı bölmedeki tüm çekmece kutuları eşit yükseklikte (en dar açıklığa göre) */
      const bhAll = Math.floor(Math.min(fh - 40, ...fronts.map((_, k) => { const [lo, hi] = span(k); return hi - lo - 28 - bt; })) / 10) * 10;
      for (let k = 0; k < nd; k++) {
        const fy = fronts[k], [lo] = span(k);
        const did = `drw-${i}-${k}`, lbl = `${tag ? tag + ' · ' : ''}${k + 1}. çekmece`;
        add({id: `dfront-${i}-${k}`, name: 'Çekmece önü', sub: lbl, kind: 'dfront', mat: 'front', grp: did, box: [fx0, fy, inset ? D - tf : D, fx1, fy + fh, inset ? D : D + tf], ax: 'xyz', bandL: [bf, bf], bandW: [bf, bf],
          fL: inset ? fx([[sw, '(bölme iç genişliği)'], [2 * e, '(kenar payı)', -1]]).s : `${fmt(frontW)} (ön genişliği: ${first ? (half ? 'yarım bindirme' : 'dış kenar') : 'dikme ortası'} → ${last ? (half ? 'yarım bindirme' : 'dış kenar') : 'dikme ortası'}, boşluklar düşülmüş)`,
          fW: auto ? `${fmt(fh)} ((ön yüksekliği ${fmt(FY1 - FY0)} − ${fmt(2 * e)} kenar − ${nd - 1} × ${fmt(g)} ara boşluk) ÷ ${nd})` : `${fmt(fh)} (girilen çekmece önü yüksekliği)`,
          notes: ['Kulp / kulpsuz profil yerini montajda belirle.']});
        cnt.handle++;
        if (!railLen || boxW < 100) continue;
        const bh = bhAll;
        if (bh < 50) { warn('warn', `${lbl}: çekmece kutusu için yükseklik yetersiz.`); continue; }
        const by0 = lo + 12, x0 = sx + c.railGap, x1 = x0 + boxW;
        const common = {grp: did, mat: 'drawer'};
        const sNote = `Ray: ${RAIL_TYPE[c.railType] || ''} ${railLen} mm, her yanda ${fmt(c.railGap)} mm ray payı.`;
        add(Object.assign({id: `dside-${i}-${k}-L`, name: 'Çekmece yanı', sub: lbl, kind: 'dside', box: [x0, by0 + bt, zf - railLen, x0 + dt, by0 + bt + bh, zf], ax: 'zyx', bandL: [bd, 0], fL: `${railLen} (ray boyu)`, fW: `${bh} (kutu yüksekliği: ön yüksekliği − 40, 10'a yuvarlanmış)`, notes: [sNote]}, common));
        add(Object.assign({id: `dside-${i}-${k}-R`, name: 'Çekmece yanı', sub: lbl, kind: 'dside', box: [x1 - dt, by0 + bt, zf - railLen, x1, by0 + bt + bh, zf], ax: 'zyx', bandL: [bd, 0], fL: `${railLen} (ray boyu)`, fW: `${bh} (kutu yüksekliği)`, notes: [sNote]}, common));
        const fbF = fx([[sw, '(bölme iç genişliği)'], [2 * c.railGap, '(2 ray payı)', -1], [2 * dt, '(2 çekmece yanı)', -1]]);
        add(Object.assign({id: `dfb-${i}-${k}-F`, name: 'Çekmece iç ön / arka', sub: lbl, kind: 'dfb', box: [x0 + dt, by0 + bt, zf - dt, x1 - dt, by0 + bt + bh, zf], ax: 'xyz', bandL: [bd, 0], fL: fbF.s, fW: `${bh} (kutu yüksekliği)`}, common));
        add(Object.assign({id: `dfb-${i}-${k}-B`, name: 'Çekmece iç ön / arka', sub: lbl, kind: 'dfb', box: [x0 + dt, by0 + bt, zf - railLen, x1 - dt, by0 + bt + bh, zf - railLen + dt], ax: 'xyz', bandL: [bd, 0], fL: fbF.s, fW: `${bh} (kutu yüksekliği)`}, common));
        add({id: `dbot-${i}-${k}`, name: 'Çekmece tabanı', sub: lbl, kind: 'dbottom', mat: 'back', grp: did, box: [x0, by0, zf - railLen, x1, by0 + bt, zf], ax: 'zxy', fL: `${railLen} (ray boyu)`, fW: fx([[sw, '(bölme iç genişliği)'], [2 * c.railGap, '(2 ray payı)', -1]]).s, notes: ['Kutunun altına çakılır / vidalanır.']});
        cnt.rails.push(railLen);
        R.extras.push({type: 'drawer', grp: did, slide: railLen * .72});
      }
      SI.drawers = nd;
    }
    /* raflar / askı */
    const hasDoor = doorsOn && s.door !== 'none' && (FY1 - e - dy0) > 60;
    const setIn = inset && hasDoor ? tf : 0;
    const adj = s.shelfType !== 'fixed';
    const mkShelf = (id, y0, sub) => {
      const dep = adj ? Di - c.shelfSet - setIn : Di - setIn;
      const w0 = adj ? sx + c.shelfGap : sx, w1 = adj ? sx + sw - c.shelfGap : sx + sw;
      add({id, name: adj ? 'Raf (hareketli)' : 'Raf (sabit)', sub, kind: 'shelf', box: [w0, y0, zi0, w1, y0 + t, zi0 + dep], ax: 'xzy', bandL: [bb, 0],
        fL: adj ? fx([[sw, '(bölme iç genişliği)'], [2 * c.shelfGap, '(raf boşluğu)', -1]]).s : fx([[sw, '(bölme iç genişliği)']]).s,
        fW: fx([[Di, '(iç derinlik)'], [adj ? c.shelfSet : 0, '(önden geri çekme)', -1], [setIn, '(gömme kapak)', -1]]).s,
        notes: [adj ? 'Raf pimi ile taşınır (4 adet).' : 'Sabit raf: yanlara minifix / kavela ile bağlanır.', `Alt yüzü, alt tablanın üst yüzünden ${fmt(y0 - yb)} mm yukarıda.`]});
      if (adj) cnt.pin += 4;
    };
    if (doorsOn || !nd) {
      if (s.hanger) {
        let rodY = yHi - 60;
        if (s.shelves > 0) { const y0 = yHi - 350 - t; if (y0 - yLo > 700) { mkShelf(`shelf-${i}-1`, y0, `${tag ? tag + ' · ' : ''}şapkalık`); rodY = y0 - 60; SI.shelves = 1; } }
        if (rodY - yLo < 900) warn('warn', `${tag || 'Bölme'}: askı altında ${fmt(rodY - yLo)} mm boşluk var (uzun elbise için ~1500 mm gerekir).`);
        if (Di < 500) warn('warn', `İç derinlik ${fmt(Di)} mm; askı için en az 520–550 mm önerilir.`);
        const rl = sw - 2;
        cnt.rods.push(rl); R.extras.push({type: 'rod', x0: sx + 1, x1: sx + sw - 1, y: rodY, z: zi0 + Di / 2});
        SI.rodY = rodY;
      } else if (s.shelves > 0) {
        const ns = s.shelves, gap = (yHi - yLo - ns * t) / (ns + 1);
        if (gap < 60) warn('err', `${tag || 'Bölme'}: ${ns} raf için yükseklik yetersiz (raf arası ${fmt(gap)} mm).`);
        for (let k = 1; k <= ns; k++) mkShelf(`shelf-${i}-${k}`, yLo + k * gap + (k - 1) * t, `${tag ? tag + ' · ' : ''}${k}. raf`);
        SI.shelves = ns; SI.gap = gap;
        if (sw > (t >= 25 ? 1000 : 800)) warn('warn', `${tag || 'Bölme'}: ${fmt(sw)} mm raf açıklığı ${fmt(t)} mm malzemede sehim yapabilir; ara dikme ekle ya da daha kalın malzeme kullan.`);
      }
    }
    /* kapaklar */
    if (hasDoor) {
      const dy1 = FY1 - e, dh = dy1 - dy0;
      const nDoor = s.door === 'auto' ? (frontW > 600 ? 2 : 1) : s.door === '2' ? 2 : 1;
      const dw = nDoor === 2 ? (frontW - g) / 2 : frontW;
      const hc = hingeCount(dh), hp = hingeAt(dh, hc).map(v => fmt(v)).join(', ');
      const zz = inset ? [D - tf, D] : [D, D + tf];
      const edgeTxt = side => inset ? 'iç yüz' : side ? (half ? 'yarım bindirme' : 'dış kenar') : 'dikme ortası';
      const wText = nDoor === 2
        ? `${fmt(dw)} ((ön genişliği ${fmt(frontW)} − ${fmt(g)} kapak arası) ÷ 2)`
        : inset ? `${fmt(frontW)} (bölme iç genişliği ${fmt(sw)} − ${fmt(2 * e)} kenar payı)` : `${fmt(frontW)} (${edgeTxt(first)} → ${edgeTxt(last)}, kenar ${fmt(first ? e : g / 2)} / ${fmt(last ? e : g / 2)} mm boşluk)`;
      const hText = nd > 0 ? `${fmt(dh)} (çekmeceler üstünden ön üst kenarına, boşluklar düşülmüş)` : inset ? fx([[yt - yb, '(iç yükseklik)'], [2 * e, '(kenar payı)', -1]]).s : fx([[FY1 - FY0, base === 'plinth' ? '(yükseklik − baza)' : raised ? '(gövde yüksekliği)' : '(yükseklik)'], [2 * e, '(üst/alt kenar payı)', -1]]).s;
      for (let k = 0; k < nDoor; k++) {
        const hinge = nDoor === 2 ? (k ? 'R' : 'L') : s.hinge === 'R' ? 'R' : 'L';
        const x0 = fx0 + k * (dw + g);
        add({id: `door-${i}-${k}`, name: 'Kapak', sub: `${tag ? tag + ' · ' : ''}${nDoor === 2 ? (k ? 'sağ' : 'sol') : (hinge === 'L' ? 'soldan menteşeli' : 'sağdan menteşeli')}`, kind: 'door', mat: 'front', box: [x0, dy0, zz[0], x0 + dw, dy1, zz[1]], ax: 'yxz', bandL: [bf, bf], bandW: [bf, bf],
          hinge: {side: hinge, x: hinge === 'L' ? x0 : x0 + dw, z: zz[0]}, fL: hText, fW: wText,
          notes: [`${hc} menteşe: Ø35 kap, ${hinge === 'L' ? 'sol' : 'sağ'} kenardan 22,5 mm (kap merkezi); alttan ${hp} mm.`, cnt.hingeType + '.']});
        cnt.hinge += hc; cnt.handle++;
        if (dw > 600) warn('warn', `${tag || 'Bölme'}: kapak genişliği ${fmt(dw)} mm (> 600 mm); çift kapak önerilir.`);
        if (dw < 150) warn('warn', `${tag || 'Bölme'}: kapak genişliği ${fmt(dw)} mm çok dar.`);
      }
      SI.doors = nDoor;
      if (dh > 2400) warn('warn', `Kapak yüksekliği ${fmt(dh)} mm; levha boyunu ve kapak eğilmesini kontrol et.`);
    }
  }

  /* ---- baza ---- */
  if (base === 'plinth') {
    add({id: 'plinth', name: 'Baza (ön)', kind: 'plinth', box: [t, 0, D - c.plinthSet - t, W - t, bH, D - c.plinthSet], ax: 'xyz', fL: fx([[W, '(genişlik)'], [2 * t, '(2 yan)', -1]]).s, fW: `${fmt(bH)} (baza yüksekliği)`, notes: [`Yanların arasına, ön kenardan ${fmt(c.plinthSet)} mm içeride.`]});
  } else if (base === 'legs') {
    const z0 = D - c.plinthSet - t;
    add({id: 'plinth', name: 'Baza (klipsli)', kind: 'plinth', box: [0, 3, z0, W, bH, z0 + t], ax: 'xyz', fL: `${fmt(W)} (dolap genişliği; yan yana dolaplarda tek parça kesilebilir)`, fW: fx([[bH, '(ayak yüksekliği)'], [3, '(yer boşluğu)', -1]]).s, notes: ['Ayaklara klipsle takılır.']});
    const nl = W > 1000 ? 6 : 4;
    hw('leg', 'Ayarlı plastik ayak', nl, `${fmt(bH)} mm`); hw('clip', 'Baza klipsi', nl / 2);
    const xs = nl === 6 ? [50, W / 2, W - 50] : [50, W - 50];
    for (const lx of xs) for (const lz of [zb0 + 50, z0 - 35]) R.extras.push({type: 'leg', x: lx, z: lz, h: bH});
  } else if (base === 'frame') {
    const z1 = D - c.plinthSet;
    add({id: 'frame-f', name: 'Baza kasası', sub: 'ön', kind: 'plinth', box: [0, 0, z1 - t, W, bH, z1], ax: 'xyz', fL: fx([[W, '(genişlik)']]).s, fW: `${fmt(bH)} (baza yüksekliği)`});
    add({id: 'frame-b', name: 'Baza kasası', sub: 'arka', kind: 'plinth', box: [0, 0, zb0, W, bH, zb0 + t], ax: 'xyz', fL: fx([[W, '(genişlik)']]).s, fW: `${fmt(bH)} (baza yüksekliği)`});
    const fl = fx([[D, '(derinlik)'], [c.plinthSet, '(geri çekme)', -1], [zb0, '(arkalık)', -1], [2 * t, '(ön+arka baza)', -1]]);
    for (const [sd, x0] of [['L', 0], ['R', W - t]]) add({id: 'frame-' + sd, name: 'Baza kasası', sub: 'yan', kind: 'plinth', box: [x0, 0, zb0 + t, x0 + t, bH, z1 - t], ax: 'zyx', fL: fl.s, fW: `${fmt(bH)} (baza yüksekliği)`});
  } else if (base === 'wall') hw('hang', 'Dolap askı aparatı (sağ + sol)', 2, 'askı rayı ile');

  /* ---- hırdavat ---- */
  if (cnt.hinge) hw('hinge', cnt.hingeType, cnt.hinge, 'Ø35 kap, kapanış frenli önerilir');
  if (cnt.pin) hw('pin', 'Raf pimi', cnt.pin, 'Ø5');
  const rl = {}; for (const r of cnt.rails) rl[r] = (rl[r] || 0) + 1;
  for (const [l, q] of Object.entries(rl)) hw('rail' + l, RAIL_TYPE[c.railType] || 'Çekmece rayı', q, `${l} mm, takım (sağ + sol)`);
  const rd = {}; for (const r of cnt.rods) rd[r] = (rd[r] || 0) + 1;
  for (const [l, q] of Object.entries(rd)) { hw('rod' + l, 'Askı borusu (oval)', q, `${fmt(Number(l))} mm`); hw('rodh', 'Askı borusu rozeti', 2 * q); }
  if (cnt.handle) hw('handle', 'Kulp', cnt.handle);
  let joints = 0;
  for (const p of P) {
    if (['top', 'bottom', 'rail', 'sep'].includes(p.kind) || (p.kind === 'shelf' && p.name.includes('sabit'))) joints += 2 * (p.Wd > 450 ? 3 : 2);
    if (p.kind === 'divider') joints += 2 * (p.Wd > 450 ? 3 : 2);
  }
  hw('minifix', 'Minifix + kavela (tahmini)', joints, 'gövde birleşimleri');

  /* ---- kesim ölçüleri, kenar bandı, elle düzeltmeler ---- */
  for (const p of P) {
    p.cL = r1(p.L - (c.deduct ? p.bandW[0] + p.bandW[1] : 0));
    p.cW = r1(p.Wd - (c.deduct ? p.bandL[0] + p.bandL[1] : 0));
    p.L = r1(p.L); p.Wd = r1(p.Wd); p.T = r1(p.T);
    const o = c.over && c.over[p.id];
    if (o) { if (o.cL > 0) { p.cL0 = p.cL; p.cL = o.cL; p.ovr = true; } if (o.cW > 0) { p.cW0 = p.cW; p.cW = o.cW; p.ovr = true; } if (o.off) p.off = true; }
  }
  P.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  /* ---- montaj ve çakışma kontrolü ---- */
  const body = P.filter(p => !['door', 'dfront', 'dside', 'dfb', 'dbottom', 'plinth'].includes(p.kind));
  const bx = [0, 1, 2].map(a => [Math.min(...body.map(p => p.box[a])), Math.max(...body.map(p => p.box[a + 3]))]);
  const okW = Math.abs(bx[0][0]) < .05 && Math.abs(bx[0][1] - W) < .05, okH = Math.abs(bx[1][1] - H) < .05 && Math.abs(bx[1][0] - (raised ? y0c : 0)) < .05, okD = Math.abs(bx[2][0]) < .05 && Math.abs(bx[2][1] - D) < .05;
  if (okW && okH && okD) R.check.push({lvl: 'ok', t: `Montaj kontrolü: parçalar birleşince gövde ${fmt(W)} × ${fmt(Hc)} × ${fmt(D)} mm${raised ? ` (+ ${fmt(bH)} ${base === 'legs' ? 'ayak' : 'baza'} = ${fmt(H)})` : ''} çıkıyor.`});
  else R.check.push({lvl: 'err', t: `Montaj kontrolü tutmadı: parçalardan ${fmt(bx[0][1] - bx[0][0])} × ${fmt(bx[1][1] - bx[1][0])} × ${fmt(bx[2][1] - bx[2][0])} mm çıkıyor.`});
  const clash = [];
  for (let a = 0; a < P.length; a++) for (let b2 = a + 1; b2 < P.length; b2++) {
    const A = P[a].box, B = P[b2].box, ov = [0, 1, 2].map(k => Math.min(A[k + 3], B[k + 3]) - Math.max(A[k], B[k]));
    if (ov.every(v => v > .05)) {
      const backPair = (P[a].kind === 'back' || P[b2].kind === 'back') && c.back === 'groove' && Math.min(...ov) <= gd + .05;
      if (!backPair) clash.push(`${P[a].name}${P[a].sub ? ' (' + P[a].sub + ')' : ''} ↔ ${P[b2].name}${P[b2].sub ? ' (' + P[b2].sub + ')' : ''}`);
    }
  }
  if (clash.length) R.check.push({lvl: 'err', t: `Çakışan parçalar: ${clash.slice(0, 4).join(', ')}${clash.length > 4 ? ` +${clash.length - 4}` : ''}`});
  else R.check.push({lvl: 'ok', t: 'Çakışma kontrolü: hiçbir parça birbirinin içine girmiyor.'});
  const fdepth = P.some(p => p.kind === 'door' || p.kind === 'dfront') && !inset ? D + tf : D;
  R.dims = {W, H, D, fdepth, Wi, Hi, Di, Hc, y0c, yb, yt, bH, base, widths};
  R.sum = [
    ['İç genişlik', fmt(Wi)], ['İç yükseklik', fmt(Hi)], ['İç derinlik', fmt(Di)],
    ...(n > 1 ? [['Bölme genişlikleri', widths.map(v => fmt(v)).join(' / ')]] : []),
    ...(railLen && secs.some(s => s.drawers) ? [['Çekmece rayı', railLen + ' mm']] : []),
    ['Kapaklı toplam derinlik', fmt(fdepth)],
  ];
  R.ok = !R.warn.some(w => w.lvl === 'err') && !R.check.some(w => w.lvl === 'err');
  return R;
}

/* ---------- iş geneli: kesim satırları ---------- */
const bandSig = p => `${p.bandL[0]}|${p.bandL[1]}|${p.bandW[0]}|${p.bandW[1]}`;
function cutRows(job, cabs) {
  const groups = new Map();
  for (const c of cabs) {
    const R = calcCab(c);
    for (const p of R.parts) {
      /* aynı stok (ad + kalınlık + levha + desen) tek grupta: aynı levhalardan kesilir */
      const mat = job.mats[p.mat], gk = `${mat.label.trim().toLowerCase()}|${p.T}|${mat.L}|${mat.W}|${mat.grain ? 1 : 0}`;
      if (!groups.has(gk)) groups.set(gk, {key: gk, mat: p.mat, T: p.T, label: `${mat.label} · ${fmt(p.T)} mm`, m: mat, rows: new Map()});
      const G = groups.get(gk), rk = `${p.name}|${p.cL}|${p.cW}|${bandSig(p)}|${p.off ? 1 : 0}`;
      if (!G.rows.has(rk)) G.rows.set(rk, {name: p.name, kind: p.kind, cL: p.cL, cW: p.cW, L: p.L, Wd: p.Wd, T: p.T, bandL: p.bandL, bandW: p.bandW, off: !!p.off, ovr: !!p.ovr, n: 0, cabs: new Map(), refs: []});
      const row = G.rows.get(rk);
      row.n += c.qty; row.ovr = row.ovr || !!p.ovr;
      row.cabs.set(c.name, (row.cabs.get(c.name) || 0) + c.qty);
      row.refs.push({cab: c.id, id: p.id});
    }
  }
  const out = [...groups.values()].sort((a, b) => MAT_KEYS.indexOf(a.mat) - MAT_KEYS.indexOf(b.mat) || b.T - a.T);
  let no = 0;
  for (const G of out) {
    G.rows = [...G.rows.values()].sort((a, b) => a.off - b.off || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.cL - a.cL || b.cW - a.cW);
    for (const r of G.rows) r.no = ++no;
    const act = G.rows.filter(r => !r.off);
    G.count = act.reduce((a, r) => a + r.n, 0);
    G.area = act.reduce((a, r) => a + r.n * r.cL * r.cW, 0) / 1e6;
  }
  return out;
}
/* kenar bandı metrajı (bitmiş ölçü üzerinden) */
function bandTotals(groups) {
  const m = new Map();
  for (const G of groups) for (const r of G.rows) {
    if (r.off) continue;
    for (const b of r.bandL) if (b > 0) m.set(b, (m.get(b) || 0) + r.L * r.n);
    for (const b of r.bandW) if (b > 0) m.set(b, (m.get(b) || 0) + r.Wd * r.n);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, mm]) => ({t, m: mm / 1000}));
}
function hwTotals(cabs) {
  const m = new Map();
  for (const c of cabs) for (const x of calcCab(c).hw) {
    const k = x.k + '|' + x.n + '|' + x.note;
    if (!m.has(k)) m.set(k, Object.assign({}, x, {q: 0}));
    m.get(k).q += x.q * c.qty;
  }
  return [...m.values()];
}
