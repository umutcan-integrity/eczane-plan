/* =====================================================================
   Diyaloglar, menüler, dışa aktarma, tema, ana ekran, yönlendirme
   ===================================================================== */

/* ---------- Diyalog ---------- */
function modal(build, actions) {
  return new Promise(res => {
    const dlg = $('#modal');
    dlg.innerHTML = '';
    let result = null;
    const body = h('div', {class: 'mbody'});
    build(body, v => { result = v; dlg.close(); });
    const foot = h('div', {class: 'mfoot'});
    for (const a of actions || []) foot.append(h('button', {type: 'button', class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), onclick: () => { result = a.get ? a.get() : a.v; dlg.close(); }}, a.t));
    dlg.append(body); if (actions && actions.length) dlg.append(foot);
    dlg.addEventListener('close', () => res(result), {once: true});
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }, {once: false});
    dlg.showModal();
  });
}
function choose(title, text, opts) {
  return modal(b => { b.append(h('h2', null, title)); if (text) b.append(h('p', null, text)); }, opts);
}
async function confirmBox(title, text, okText = 'Tamam', danger) {
  return (await choose(title, text, [{v: false, t: 'Vazgeç'}, {v: true, t: okText, primary: !danger, danger}])) === true;
}
function askText(title, value, label) {
  let inp;
  return modal(b => {
    b.append(h('h2', null, title));
    inp = h('input', {class: 'inp', value: value || '', maxlength: 60, enterkeyhint: 'done'});
    b.append(h('label', {class: 'fl'}, h('span', null, label), inp));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('#modal .btn.primary').click(); } });
  }, [{v: null, t: 'Vazgeç'}, {t: 'Kaydet', primary: 1, get: () => inp.value}]);
}

/* ---------- Açılır menü ---------- */
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function openMenu(anchor, items) {
  closeMenu();
  const m = h('div', {class: 'menu', role: 'menu'});
  for (const it of items) {
    if (it === '-') { m.append(h('hr')); continue; }
    if (!it) continue;
    m.append(h('button', {type: 'button', class: it.danger ? 'danger' : '', html: (it.icon || '') + `<span>${esc(it.t)}</span>`, onclick: () => { closeMenu(); it.fn(); }}));
  }
  document.body.append(m); menuEl = m;
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let left = r.right - mw, top = r.bottom + 6;
  if (left < 8) left = 8;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  setTimeout(() => {
    const off = e => { if (menuEl && !menuEl.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  });
}

/* ---------- Görüntü üretimi ---------- */
function makeThumb(P) {
  try {
    const cw = 320, ch = 200, c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const W = P.shop.w + OUTER_T * 2 + .4, D = P.shop.d + OUTER_T * 2 + .4;
    const s = Math.min(cw / W, ch / D);
    const V = {s, ox: (cw - P.shop.w * s) / 2, oy: (ch - P.shop.d * s) / 2};
    const segs = computeWalls(P);
    const dark = document.documentElement.dataset.mode === 'dark';
    const C = dark ? planColors() : LIGHT_PLAN;
    drawPlan(c.getContext('2d'), P, V, {w: cw, h: ch, dpr: 1, C: Object.assign({}, C, {bg: dark ? (C.glass ? '#121B31' : C.bg) : '#F1F3EF', glass: false}), segs, A: analyze(P, segs), grid: false, clear: false, labels: false, dims: false});
    return c.toDataURL('image/jpeg', .82);
  } catch (e) { return ''; }
}
/* Ölçülü plan tuvali (dışa aktarma için): tüm ölçüler, oda iç ölçüleri, eşya ölçüleri */
function planCanvas(P, cw, ch) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const W = P.shop.w, D = P.shop.d;
  const s0 = Math.min(cw / (W + 2.6), ch / (D + 2.6));
  const F = clamp(s0 / 58, 1.3, 3.2), pad = 92 * F;
  const s = Math.min((cw - pad * 2) / W, (ch - pad * 2) / D);
  const V = {s, ox: (cw - W * s) / 2 + 12 * F, oy: (ch - D * s) / 2 + 12 * F};
  const segs = computeWalls(P);
  const accent = ACCENTS[Settings.v.accent]?.l || '#1F7A5A';
  const C = Object.assign({}, LIGHT_PLAN, {accent});
  drawPlan(c.getContext('2d'), P, V, {w: cw, h: ch, dpr: 1, C, segs, A: analyze(P, segs), grid: false, clear: false, labels: true, dims: true, chains: true, roomDims: true, itemDims: true, fs: F});
  return c;
}
function planPNG(P) {
  const W = P.shop.w + 2.6, D = P.shop.d + 2.6;
  const cw = 3600, ch = Math.round(clamp(cw * D / W, 1500, 3200)), head = 150;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch + head;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cw, ch + head);
  g.drawImage(planCanvas(P, cw, ch), 0, head);
  sheetTitle(g, P, 60, 50, cw - 120, 'Ölçülü yerleşim planı');
  return c;
}
function sheetTitle(g, P, x, y, w, sub) {
  const L = 92;
  g.fillStyle = '#D0102B'; g.beginPath(); g.roundRect(x, y, L, L, 16); g.fill();
  g.fillStyle = '#FFFFFF'; g.font = `900 ${L * .78}px ${getFont()}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', x + L / 2, y + L / 2 + 4);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#1B211F'; g.font = `800 50px ${getFont()}`; g.fillText(P.name, x + L + 28, y + 50);
  g.fillStyle = '#626C67'; g.font = `500 26px ${getFont()}`;
  g.fillText(`${sub} · ${fmtM(P.shop.w)} × ${fmtM(P.shop.d)} m · ${fmtA(shopArea(P))} m² · tavan ${fmtM(P.shop.h)} m · ${new Date().toLocaleDateString('tr-TR')}`, x + L + 28, y + 88);
  g.textAlign = 'right'; g.fillStyle = '#98A09B'; g.font = `600 22px ${getFont()}`;
  g.fillText('Ölçüler: toplam m · parçalar cm', x + w, y + 50);
  g.fillText('Eczane Plan', x + w, y + 84);
}
async function exportPlanPNG() {
  const c = planPNG(Ed.P);
  c.toBlob(b => download(safeFile(Ed.P.name) + '-olculu-plan.png', b), 'image/png');
  toast('Ölçülü plan indiriliyor');
}
function equipmentList(P) {
  const order = {counter: 0, cabinet: 1, table: 2, fixture: 3, column: 4, door: 5, window: 6};
  const map = new Map();
  for (const it of P.items) {
    if (!(it.type in order)) continue;
    const size = it.type === 'door' || it.type === 'window' ? `${fmtCm(it.w)} × ${fmtCm(it.h)}` : `${fmtCm(it.w)} × ${fmtCm(it.d)} × ${fmtCm(it.type === 'column' ? P.shop.h : it.h)}`;
    const key = [it.type, it.style, it.name, size].join('|');
    const e = map.get(key) || {it, size, n: 0}; e.n++; map.set(key, e);
  }
  return [...map.values()].sort((a, b) => order[a.it.type] - order[b.it.type] || a.it.name.localeCompare(b.it.name, 'tr'));
}
/* Tek sayfalık sunum paftası: ölçülü plan + iki 3B render + ekipman listesi */
async function exportSheet() {
  const P = Ed.P;
  toast('Sunum paftası hazırlanıyor…');
  const SW = 4200, SH = 2970, M = 90, headH = 150;
  const c = document.createElement('canvas'); c.width = SW; c.height = SH;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, SW, SH);
  sheetTitle(g, P, M, M - 20, SW - 2 * M, 'Yerleşim ve 3B sunum');
  g.fillStyle = '#E1E4DE'; g.fillRect(M, M + headH - 10, SW - 2 * M, 3);
  const py = M + headH + 20, pw = 2560, ph = SH - py - M - 30;
  g.drawImage(planCanvas(P, pw, ph), M, py);
  const rx = M + pw + 60, rw = SW - M - rx;
  const cap = (t, y) => { g.fillStyle = '#626C67'; g.font = `700 24px ${getFont()}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(t.toLocaleUpperCase('tr-TR'), rx, y); };
  const rr = (img, x, y, w, h) => { g.save(); g.beginPath(); g.roundRect(x, y, w, h, 18); g.clip(); g.drawImage(img, x, y, w, h); g.restore(); g.strokeStyle = '#E1E4DE'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, w, h, 18); g.stroke(); };
  let y = py + 10;
  try {
    const h1 = Math.round(rw * .66);
    cap('3B görünüm', y + 20);
    const iso = await View3D.renderImage({view: 'iso', w: Math.round(rw * 1.4), h: Math.round(h1 * 1.4), dims: true, people: true, cut: true, hq: true});
    rr(iso, rx, y + 36, rw, h1); y += 36 + h1 + 50;
    const h2 = Math.round(rw * .52);
    cap('Girişten bakış', y + 20);
    const walk = await View3D.renderImage({view: 'walk', w: Math.round(rw * 1.4), h: Math.round(h2 * 1.4), dims: false, people: true, hq: true});
    rr(walk, rx, y + 36, rw, h2); y += 36 + h2 + 50;
  } catch (e) {
    g.fillStyle = '#98A09B'; g.font = `500 26px ${getFont()}`; g.fillText('3B görüntü oluşturulamadı (3B motoru yüklenemedi).', rx, y + 40); y += 90;
  }
  // Ekipman listesi
  cap('Ekipman listesi', y + 20); y += 44;
  const list = equipmentList(P), rowH = 34, maxRows = Math.floor((SH - M - 60 - y) / rowH) - 1;
  g.font = `700 22px ${getFont()}`; g.fillStyle = '#98A09B';
  g.fillText('Ekipman', rx, y + 26); g.textAlign = 'right'; g.fillText('Ölçü (cm)', rx + rw - 110, y + 26); g.fillText('Adet', rx + rw, y + 26); g.textAlign = 'left';
  y += rowH;
  list.slice(0, maxRows).forEach((e, i) => {
    if (i % 2 === 0) { g.fillStyle = '#F5F6F3'; g.fillRect(rx - 10, y, rw + 20, rowH); }
    g.fillStyle = '#1B211F'; g.font = `600 21px ${getFont()}`;
    let t = e.it.name; while (g.measureText(t).width > rw - 420 && t.length > 4) t = t.slice(0, -2);
    if (t !== e.it.name) t += '…';
    g.fillText(t, rx, y + 24);
    g.textAlign = 'right'; g.font = `500 20px ${getMono()}`; g.fillStyle = '#4A534F';
    g.fillText(e.size, rx + rw - 110, y + 24); g.fillText(String(e.n), rx + rw, y + 24); g.textAlign = 'left';
    y += rowH;
  });
  if (list.length > maxRows) { g.fillStyle = '#98A09B'; g.font = `500 22px ${getFont()}`; g.fillText(`+ ${list.length - maxRows} kalem daha`, rx, y + 28); }
  g.fillStyle = '#98A09B'; g.font = `500 20px ${getFont()}`; g.textAlign = 'left';
  g.fillText('Ön tasarımdır; resmî kroki yerine geçmez. Ölçüleri yerinde teyit edin.', M, SH - M + 30);
  c.toBlob(b => { download(safeFile(P.name) + '-sunum.png', b); toast('Sunum paftası indirildi'); }, 'image/png');
}
/* 3B render penceresi */
function renderDialog() {
  const st = {view: Ed.view === '3d' ? 'current' : 'iso', res: isMobile() ? 'fhd' : 'qhd', dims: true, people: true, cut: true};
  const RES = {hd: [1280, 720], fhd: [1920, 1080], qhd: [2560, 1440], uhd: [3840, 2160]};
  let blob = null;
  return modal(b => {
    b.append(h('h2', null, 'Render al'));
    b.append(h('p', null, 'Yüksek çözünürlüklü, yumuşak gölgeli 3B görsel. Ölçüler ve oda bilgileri üzerine yazılır.'));
    const chips = (opts, key) => { const w = h('div', {class: 'chips'}); const draw = () => { w.innerHTML = ''; for (const [v, t] of opts) w.append(h('button', {type: 'button', class: st[key] === v ? 'on' : '', onclick: () => { st[key] = v; draw(); }}, t)); }; draw(); return w; };
    const views = [['iso', 'Açılı (ön)'], ['iso2', 'Açılı (yan)'], ['back', 'Arkadan'], ['top', 'Üstten'], ['walk', 'Girişten']];
    if (Ed.view === '3d') views.unshift(['current', 'Şu anki kamera']);
    b.append(h('div', {class: 'fl'}, h('span', null, 'Görünüm'), chips(views, 'view')));
    b.append(h('div', {class: 'fl'}, h('span', null, 'Çözünürlük'), chips([['hd', 'HD'], ['fhd', 'Full HD'], ['qhd', '2K'], ['uhd', '4K']], 'res')));
    const sw = (key, t, sub) => { const i = h('input', {type: 'checkbox'}); i.checked = st[key]; i.onchange = () => { st[key] = i.checked; }; return h('label', {class: 'switch'}, i, h('span', null, t, h('small', null, sub))); };
    b.append(sw('dims', 'Ölçüleri göster', 'Dükkân genişlik/derinlik/yükseklik ve oda ölçüleri'));
    b.append(sw('cut', 'Ön duvarları kes', 'Kameraya bakan dış duvarlar 1 m’de kesilir, içerisi tamamen görünür'));
    b.append(sw('people', 'İnsan figürleri', 'Ölçek için insan ve tekerlekli sandalye'));
    const prev = h('div', {class: 'rprev'});
    const go = h('button', {type: 'button', class: 'btn primary full'}, 'Render al');
    const dl = h('button', {type: 'button', class: 'btn full', hidden: true}, 'İndir (PNG)');
    const sh = navigator.share ? h('button', {type: 'button', class: 'btn full', hidden: true}, 'Paylaş') : null;
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Hazırlanıyor…';
      try {
        const [w, hh] = RES[st.res];
        const cv = await View3D.renderImage({view: st.view, w, h: hh, dims: st.dims, people: st.people, cut: st.cut, hq: true});
        blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        prev.innerHTML = ''; prev.append(h('img', {src: URL.createObjectURL(blob), alt: 'Render önizleme'}));
        dl.hidden = false; if (sh) sh.hidden = false;
        go.textContent = 'Yeniden render al';
      } catch (e) { toast('Render alınamadı: ' + (e && e.message || 'bilinmeyen hata'), 'err'); go.textContent = 'Render al'; }
      go.disabled = false;
    };
    const name = () => safeFile(Ed.P.name) + '-render-' + st.view + '.png';
    dl.onclick = () => blob && download(name(), blob);
    if (sh) sh.onclick = async () => { try { const f = new File([blob], name(), {type: 'image/png'}); if (navigator.canShare && navigator.canShare({files: [f]})) await navigator.share({files: [f], title: Ed.P.name}); else download(f.name, blob); } catch (e) {} };
    b.append(go, prev, h('div', {class: 'row2'}, dl, sh));
  }, [{v: null, t: 'Kapat'}]);
}
function export3DPNG() {
  const url = View3D.snapshot();
  download(safeFile(Ed.P.name) + '-3b.png', url);
}
function exportJSON(p) {
  const data = JSON.stringify(Object.assign({app: 'eczane-plan', exported: new Date().toISOString()}, p), null, 1);
  download(safeFile(p.name) + '.json', new Blob([data], {type: 'application/json'}));
}
async function sharePlan() {
  try {
    const c = Ed.view === '3d' ? null : planPNG(Ed.P);
    const blob = c ? await new Promise(r => c.toBlob(r, 'image/png')) : await (await fetch(View3D.snapshot())).blob();
    const file = new File([blob], safeFile(Ed.P.name) + (c ? '-plan.png' : '-3b.png'), {type: 'image/png'});
    if (navigator.canShare && navigator.canShare({files: [file]})) await navigator.share({files: [file], title: Ed.P.name});
    else download(file.name, blob);
  } catch (e) { if (e && e.name !== 'AbortError') toast('Paylaşılamadı', 'err'); }
}
function importFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      let p = o && o.v === 2 ? normalizeProject(o) : migrateV1(o.state || o);
      if (!p) throw 0;
      p.id = uid(); p.updated = Date.now();
      if (Store.index().some(e => e.name === p.name)) p.name += ' (içe aktarıldı)';
      Store.save(p, makeThumb(p));
      Home.render(); toast(`“${p.name}” içe aktarıldı`);
    } catch (e) { toast('Bu dosya okunamadı (geçerli bir plan JSON’u değil)', 'err'); }
  };
  rd.readAsText(file);
}

/* ---------- Video ---------- */
function videoResult(blob) {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm', name = `${safeFile(Ed.P.name)}-video.${ext}`;
  const url = URL.createObjectURL(blob);
  return modal(b => {
    b.append(h('h2', null, 'Video hazır'));
    b.append(h('video', {src: url, controls: true, playsinline: true, autoplay: true, muted: true, loop: true, class: 'vprev'}));
    b.append(h('p', {class: 'tip'}, `${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB · ${ext.toUpperCase()}${ext === 'webm' ? ' (WhatsApp vb. için MP4 gerekirse telefonda Safari/Chrome ile tekrar kaydedebilirsin)' : ''}`));
    const row = h('div', {class: 'row2'});
    row.append(h('button', {type: 'button', class: 'btn primary full', onclick: () => download(name, blob)}, 'İndir'));
    if (navigator.share) row.append(h('button', {type: 'button', class: 'btn full', onclick: async () => { try { const f = new File([blob], name, {type: blob.type}); if (navigator.canShare && navigator.canShare({files: [f]})) await navigator.share({files: [f], title: Ed.P.name}); else download(name, blob); } catch (e) {} }}, 'Paylaş'));
    b.append(row);
  }, [{v: null, t: 'Kapat'}]);
}
function videoDialog() {
  if (View3D.videoMime() === null) { toast('Bu tarayıcı video kaydını desteklemiyor', 'err'); return; }
  const st = {kind: 'walk', res: isMobile() ? '720' : '1080', sec: 15};
  return modal(b => {
    b.append(h('h2', null, 'Video al'));
    b.append(h('p', null, 'Dükkânın 3B videosunu kaydet; indirip paylaşabilirsin.'));
    const chips = (opts, key) => { const w = h('div', {class: 'chips'}); const draw = () => { w.innerHTML = ''; for (const [v, t] of opts) w.append(h('button', {type: 'button', class: String(st[key]) === String(v) ? 'on' : '', onclick: () => { st[key] = v; draw(); }}, t)); }; draw(); return w; };
    b.append(h('div', {class: 'fl'}, h('span', null, 'Tür'), chips([['walk', 'Girişten içeri yürüyüş'], ['orbit', '360° dış tur'], ['live', 'Kendin gez (canlı kayıt)']], 'kind')));
    b.append(h('div', {class: 'fl'}, h('span', null, 'Çözünürlük'), chips([['720', '720p'], ['1080', '1080p']], 'res')));
    b.append(h('div', {class: 'fl'}, h('span', null, 'Süre (otomatik turlar)'), chips([[10, '10 sn'], [15, '15 sn'], [25, '25 sn']], 'sec')));
    b.append(h('p', {class: 'tip'}, 'Canlı kayıtta 3B ekranda ne yaparsan (gezinme, döndürme) kaydedilir; bitirince “Durdur”a bas.'));
    const go = h('button', {type: 'button', class: 'btn primary full', onclick: () => { $('#modal').close(); startVideo(st); }}, 'Kaydı başlat');
    b.append(go);
  }, [{v: null, t: 'Vazgeç'}]);
}
async function startVideo(st) {
  if (Ed.view !== '3d') { Ed.setView('3d'); await new Promise(r => setTimeout(r, 400)); }
  await View3D.ready3d();
  const bar = $('#recBar'), txt = $('#recText'), stopBtn = $('#recStop');
  bar.hidden = false;
  if (st.kind === 'live') {
    let rec;
    try { rec = View3D.startLive(); } catch (e) { bar.hidden = true; toast(e.message, 'err'); return; }
    txt.textContent = 'Kaydediliyor — gez, döndür, sonra Durdur';
    const t0 = Date.now(), iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); txt.textContent = `Kaydediliyor ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    stopBtn.textContent = 'Durdur';
    stopBtn.onclick = async () => { clearInterval(iv); bar.hidden = true; const blob = await rec.stop(); videoResult(blob); };
    return;
  }
  let cancelled = false;
  stopBtn.textContent = 'İptal'; stopBtn.onclick = () => { cancelled = true; };
  $('#stage').classList.add('recording');
  const [w, h] = st.res === '1080' ? [1920, 1080] : [1280, 720];
  try {
    const blob = await View3D.recordTour(st.kind, {w, h, seconds: st.sec, isCancelled: () => cancelled, onProgress: p => { txt.textContent = `Video kaydediliyor %${Math.round(p * 100)}`; }});
    if (blob) videoResult(blob);
  } catch (e) { toast('Video alınamadı: ' + (e && e.message || 'hata'), 'err'); }
  finally { bar.hidden = true; $('#stage').classList.remove('recording'); }
}

/* ---------- Tema ---------- */
const Theme = {
  apply() {
    const v = Settings.v, root = document.documentElement;
    const glass = v.mode === 'glass';
    const mode = glass ? 'dark' : v.mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : v.mode;
    root.dataset.mode = mode;
    if (glass) root.dataset.glass = '1'; else delete root.dataset.glass;
    const a = ACCENTS[v.accent] || ACCENTS.yesil;
    const col = mode === 'dark' ? a.d : a.l;
    root.style.setProperty('--accent', col);
    root.style.setProperty('--accent-ink', mode === 'dark' ? '#0E1512' : '#FFFFFF');
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = glass ? '#0A1020' : mode === 'dark' ? '#1B201E' : '#FFFFFF';
    if (Ed.P) { Plan.req(); View3D.markDirty(); View3D.miniDirty = true; Props.render(); }
  },
  dialog() {
    return modal(b => {
      b.append(h('h2', null, 'Görünüm'));
      const modes = [['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu'], ['glass', 'Şeffaf']];
      const seg = h('div', {class: 'seg', style: 'width:100%'});
      const drawSeg = () => { seg.innerHTML = ''; for (const [k, t] of modes) seg.append(h('button', {type: 'button', class: Settings.v.mode === k ? 'on' : '', style: 'flex:1;padding:0 6px', onclick: () => { Settings.set('mode', k); Theme.apply(); drawSeg(); drawAcc(); }}, t)); };
      drawSeg();
      b.append(h('div', {class: 'fl'}, h('span', null, 'Tema'), seg));
      const acc = h('div', {class: 'accents'});
      const drawAcc = () => { acc.innerHTML = ''; const dark = document.documentElement.dataset.mode === 'dark'; for (const [k, a] of Object.entries(ACCENTS)) acc.append(h('button', {type: 'button', title: a.n, 'aria-label': a.n, class: Settings.v.accent === k ? 'on' : '', style: `background:${dark ? a.d : a.l}`, onclick: () => { Settings.set('accent', k); Theme.apply(); drawAcc(); }})); };
      drawAcc();
      b.append(h('div', {class: 'fl'}, h('span', null, 'Vurgu rengi'), acc));
      const auto = h('input', {type: 'checkbox'}); auto.checked = Settings.v.autosave;
      auto.onchange = () => { Settings.set('autosave', auto.checked); if (Ed.P) { if (auto.checked && Ed.dirty) Ed.save(true); Ed.updateSaveUI(); } };
      b.append(h('label', {class: 'switch'}, auto, h('span', null, 'Otomatik kaydet', h('small', null, 'Açıkken her değişiklik birkaç saniye içinde cihaza kaydedilir. Kapalıyken yalnızca Kaydet’e basınca kaydedilir.'))));
    }, [{v: null, t: 'Tamam', primary: 1}]);
  },
};

function helpDialog() {
  return modal(b => {
    b.append(h('h2', null, 'Nasıl kullanılır?'));
    b.append(h('p', null, 'Bir öğeye dokun ve sürükle. Seçiliyken köşelerinden boyutlandır, üstteki yuvarlak tutamaçla döndür. Etrafındaki boşluklar cm olarak gösterilir.'));
    const dl = h('dl', {class: 'help'});
    const rows = [
      ['Sürükle (boş alan)', 'Planı kaydır'], ['İki parmak / tekerlek', 'Yakınlaştır'], ['Çift dokun', 'Özellikleri aç'],
      ['V · O · M', 'Seç · Oda çiz · Ölç'], ['R', 'Döndür / kapı yönünü çevir'], ['Ctrl+D', 'Yanına kopyala'], ['Del', 'Sil'],
      ['Oklar', '5 cm kaydır (Shift: 1 cm)'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['Ctrl+S', 'Kaydet'], ['1 · 2', '2B / 3B'],
      ['G · S · B', 'Izgara · mıknatıs · boşluklar'], ['Alt + sürükle', 'Yapışmadan taşı'],
      ['3B Gez: W A S D', 'Yürü (Shift koş, Q/E dön)'], ['3B Gez: fare', 'Tıkla → fareyle bak, Esc bırak'],
    ];
    for (const [k, v] of rows) dl.append(h('dt', null, k), h('dd', null, v));
    b.append(dl);
    b.append(h('p', {class: 'tip'}, 'Kapı ve pencereler duvara kendiliğinden oturur; sürükleyince duvar boyunca kayar, başka duvara yaklaşınca oraya geçer. Açılış yönünü bağlam çubuğundaki “Yönü çevir” ya da özelliklerdeki resimli seçiciyle değiştir.'));
  }, [{v: null, t: 'Anladım', primary: 1}]);
}

/* ---------- Ana ekran ---------- */
const Home = {
  tpl: 'empty',
  init() {
    const form = $('#newForm');
    this.shape = 'rect';
    const sh = $('#newShape');
    for (const [k, t] of SHAPES) sh.append(h('button', {type: 'button', class: 'btn' + (k === 'rect' ? ' on' : ''), 'data-v': k, title: t + ' şekli', html: shapeIcon(k) + `<span>${t}</span>`, onclick: e => { this.shape = k; $$('#newShape button').forEach(x => x.classList.toggle('on', x.dataset.v === k)); }}));
    $$('#newTpl button').forEach(b => b.onclick = () => {
      this.tpl = b.dataset.v;
      $$('#newTpl button').forEach(x => x.classList.toggle('on', x === b));
      const s = this.tpl === 'sample';
      $('#newShapeWrap').hidden = s;
      $('#newW').disabled = $('#newD').disabled = s;
      if (s) { $('#newW').value = '13,65'; $('#newD').value = '6,95'; }
    });
    $('#newW').value = fmtM(Settings.v.lastW || 13.65); $('#newD').value = fmtM(Settings.v.lastD || 6.95);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#newName').value.trim();
      if (!name) { $('#newName').focus(); toast('Önce projeye bir isim ver'); return; }
      const w = parseNum($('#newW').value), d = parseNum($('#newD').value);
      if (!(w >= 2 && w <= 150 && d >= 2 && d <= 150)) { toast('Ölçüler 2–150 m arasında olmalı', 'err'); return; }
      const p = this.tpl === 'sample' ? sampleProject(name) : newProject(name, w, d);
      if (this.tpl !== 'sample' && this.shape !== 'rect') p.voids = shapeVoids(this.shape, p.shop.w, p.shop.d);
      if (this.tpl !== 'sample') { Settings.set('lastW', w); Settings.set('lastD', d); }
      try { Store.save(p, makeThumb(p)); } catch (err) { toast('Depolama dolu; eski projelerden birini sil', 'err'); return; }
      $('#newName').value = '';
      Router.go(p.id);
    });
    $('#importFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
    $('#homeSettings').onclick = () => Theme.dialog();
    $('#homeHelp').onclick = () => helpDialog();
  },
  render() {
    const list = Store.index().sort((a, b) => b.updated - a.updated);
    const root = $('#projList'); root.innerHTML = '';
    if (!list.length) {
      root.append(h('div', {class: 'empty', style: 'grid-column:1/-1'}, h('b', null, 'Henüz proje yok'), 'Soldan bir isim verip “Başla”ya dokun. Projelerin burada listelenir.'));
      return;
    }
    list.forEach((e, i) => {
      const more = h('button', {class: 'icon-btn more', type: 'button', title: 'Seçenekler', html: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'});
      const card = h('div', {class: 'card proj', role: 'button', tabindex: 0},
        h('div', {class: 'th'}, e.thumb ? h('img', {src: e.thumb, alt: '', loading: 'lazy'}) : h('span', {class: 'note'}, 'Önizleme yok')),
        i === 0 ? h('span', {class: 'badge'}, 'SON PROJE') : null,
        h('div', {class: 'meta'}, h('span', {class: 'nm'}, e.name), h('span', {class: 'sub'}, `${fmtM(e.w)} × ${fmtM(e.d)} m · ${relTime(e.updated)}`)),
        more);
      card.addEventListener('click', ev => { if (!more.contains(ev.target)) Router.go(e.id); });
      card.addEventListener('keydown', ev => { if (ev.key === 'Enter') Router.go(e.id); });
      more.addEventListener('click', ev => { ev.stopPropagation(); this.menu(more, e); });
      root.append(card);
    });
  },
  menu(anchor, e) {
    openMenu(anchor, [
      {t: 'Aç', icon: ICONS.open, fn: () => Router.go(e.id)},
      {t: 'Yeniden adlandır', icon: ICONS.edit, fn: async () => { const n = await askText('Yeniden adlandır', e.name, 'Proje adı'); if (n && n.trim()) { Store.rename(e.id, n.trim().slice(0, 60)); this.render(); } }},
      {t: 'Çoğalt', icon: ICONS.copy, fn: () => { const p = Store.load(e.id); if (!p) return; p.id = uid(); p.name = e.name + ' (kopya)'; p.created = Date.now(); try { Store.save(p, e.thumb); } catch (err) { toast('Depolama dolu', 'err'); } this.render(); }},
      {t: 'JSON indir (yedek)', icon: ICONS.json, fn: () => { const p = Store.load(e.id); if (p) exportJSON(p); }},
      '-',
      {t: 'Sil', icon: ICONS.del, danger: 1, fn: async () => { if (await confirmBox('Proje silinsin mi?', `“${e.name}” bu cihazdan kalıcı olarak silinecek.`, 'Sil', true)) { Store.remove(e.id); this.render(); toast('Proje silindi'); } }},
    ]);
  },
};

/* ---------- Yönlendirme (#/p/<id>) ---------- */
const Router = {
  cur: null,
  go(id) { location.hash = '#/p/' + id; },
  home() { if (location.hash) location.hash = ''; else this.route(); },
  async route() {
    const m = location.hash.match(/^#\/p\/([\w-]+)/);
    const id = m ? m[1] : null;
    if (id === this.cur && (id ? Ed.P : true)) return;
    if (Ed.P && Ed.P.id !== id) {
      const ok = await Ed.close();
      if (!ok) { history.pushState(null, '', '#/p/' + Ed.P.id); return; }
    }
    this.cur = id;
    if (id) { if (!Ed.open(id)) this.cur = null; }
    else {
      $('#editor').hidden = true; $('#home').hidden = false; document.title = 'Eczane Plan';
      Home.render();
    }
  },
};

/* ---------- Düzenleyici bağlantıları ---------- */
function bindEditor() {
  $('#btnHome').onclick = () => Router.home();
  $('#pname').onclick = () => Ed.rename();
  $('#btnUndo').onclick = () => Ed.undo();
  $('#btnRedo').onclick = () => Ed.redo();
  $('#btnSave').onclick = () => Ed.save();
  $$('#viewSeg button').forEach(b => b.onclick = () => Ed.setView(b.dataset.v));
  $$('#tools2d [data-tool]').forEach(b => b.onclick = () => Ed.setTool(Ed.tool === b.dataset.tool && b.dataset.tool !== 'select' ? 'select' : b.dataset.tool));
  $('#hintDone').onclick = () => Ed.setTool('select');
  const tog = (id, key, after) => {
    const b = $(id); b.classList.toggle('on', !!Settings.v[key]);
    b.onclick = () => { Settings.set(key, !Settings.v[key]); b.classList.toggle('on', !!Settings.v[key]); Plan.req(); if (after) after(); };
  };
  $('#togMulti').onclick = () => {
    Plan.multiMode = !Plan.multiMode; $('#togMulti').classList.toggle('on', Plan.multiMode);
    toast(Plan.multiMode ? 'Çoklu seçim: dokunarak ekle/çıkar, boş alanda sürükleyerek alan seç' : 'Çoklu seçim kapalı');
  };
  tog('#togGrid', 'grid'); tog('#togSnap', 'snap', () => toast(Settings.v.snap ? 'Mıknatıs açık' : 'Mıknatıs kapalı')); tog('#togClear', 'clear', () => View3D.markDirty());
  $$('#ctxbar [data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'rotate') Ed.rotate(90); else if (a === 'dup') Ed.duplicate(); else if (a === 'del') Ed.remove(); else if (a === 'edit') Ed.openProps();
  });
  $$('#dock [data-dock]').forEach(b => b.onclick = () => {
    const a = b.dataset.dock;
    if (a === 'add') Sheets.toggle('sheetAdd');
    else if (a === 'props') Sheets.toggle('sheetProps');
    else { Sheets.closeAll(); Ed.setTool(Ed.tool === a ? 'select' : a); }
  });
  $$('[data-close]').forEach(b => b.onclick = () => Sheets.closeAll());
  $$('#modeSeg button').forEach(b => b.onclick = () => View3D.setMode(b.dataset.v));
  $('#camTop').onclick = () => View3D.preset('top');
  $('#camIso').onclick = () => View3D.preset('iso');
  $('#camRender').onclick = () => renderDialog();
  $('#camVideo').onclick = () => videoDialog();
  $('#btnKroki').onclick = () => Kroki.dialog();
  const wl = {full: 'Duvar: tam', half: 'Duvar: yarım', none: 'Duvar: yok'};
  $('#camWallsLbl').textContent = wl[Settings.v.walls] || wl.full;
  $('#camWalls').onclick = () => {
    const order = ['full', 'half', 'none'], n = order[(order.indexOf(Settings.v.walls) + 1) % 3];
    Settings.set('walls', n); $('#camWallsLbl').textContent = wl[n];
    View3D.markDirty(); toast(wl[n]);
  };
  $('#btnMenu').onclick = () => openMenu($('#btnMenu'), [
    {t: 'Render al (3B görsel)', icon: ICONS.camera, fn: renderDialog},
    {t: 'Video al (3B tur)', icon: ICONS.video, fn: videoDialog},
    {t: 'Kroki çizimi al (A4 PDF)', icon: ICONS.kroki, fn: () => Kroki.dialog()},
    {t: 'Sunum paftası (plan + 3B + liste)', icon: ICONS.png, fn: exportSheet},
    {t: 'Ölçülü plan indir (PNG)', icon: ICONS.png, fn: exportPlanPNG},
    navigator.share ? {t: 'Paylaş', icon: ICONS.share, fn: sharePlan} : null,
    {t: 'JSON yedeği indir', icon: ICONS.json, fn: () => exportJSON(Ed.P)},
    '-',
    {t: 'Yeniden adlandır', icon: ICONS.edit, fn: () => Ed.rename()},
    {t: 'Dükkân ölçüleri', icon: ICONS.grid, fn: () => { Ed.select(null); Ed.openProps(); if (!isMobile()) setTimeout(() => $('#props .num input')?.focus(), 30); }},
    {t: 'Görünüm ve tema', icon: ICONS.theme, fn: () => Theme.dialog()},
    {t: 'Kısayollar ve yardım', icon: ICONS.help, fn: () => helpDialog()},
  ]);
}

/* ---------- Klavye ---------- */
function onKey(e) {
  if (!Ed.P || $('#editor').hidden || $('#modal').open) return;
  if (isTyping()) return;
  if (Ed.view === '3d' && View3D.key(e, true)) { e.preventDefault(); return; }
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? Ed.redo() : Ed.undo(); return; }
  if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); Ed.redo(); return; }
  if (mod && (k === 's' || k === 'S')) { e.preventDefault(); Ed.save(); return; }
  if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); Ed.duplicate(); return; }
  if (mod && (k === 'a' || k === 'A') && Ed.view === '2d') { e.preventDefault(); Ed.selectAll(); return; }
  if (mod) return;
  if (k === ' ' && Ed.view === '2d') { Plan.space = true; Plan.cv.style.cursor = 'grab'; e.preventDefault(); return; }
  if (k === '1') return Ed.setView('2d');
  if (k === '2') return Ed.setView('3d');
  if (Ed.view !== '2d') { if (k === 'Escape') Ed.select(null); return; }
  switch (k) {
    case 'Delete': case 'Backspace': if (Ed.sel || Ed.multi.length) { e.preventDefault(); Ed.remove(); } break;
    case 'Escape': if (Ed.tool !== 'select') Ed.setTool('select'); else { Ed.select(null); Sheets.closeAll(); } break;
    case 'r': case 'R': Ed.rotate(e.shiftKey ? -90 : 90); break;
    case 'v': case 'V': Ed.setTool('select'); break;
    case 'o': case 'O': Ed.setTool('room'); break;
    case 'm': case 'M': Ed.setTool('measure'); break;
    case 'd': case 'D': Ed.setTool('wall'); break;
    case 'e': case 'E': Ed.setTool('erase'); break;
    case 'a': case 'A': Ed.setTool('addarea'); break;
    case 'f': case 'F': Plan.fit(); break;
    case 'g': case 'G': $('#togGrid').click(); break;
    case 's': case 'S': $('#togSnap').click(); break;
    case 'b': case 'B': $('#togClear').click(); break;
    case '+': case '=': Plan.zoomAt(Plan.w / 2, Plan.h / 2, 1.25); break;
    case '-': Plan.zoomAt(Plan.w / 2, Plan.h / 2, .8); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!Ed.sel && !Ed.multi.length) return;
      e.preventDefault();
      const st = e.shiftKey ? .01 : .05;
      Ed.nudge(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0);
      break;
    }
  }
}
function onKeyUp(e) {
  if (Ed.view === '3d') View3D.key(e, false);
  if (e.key === ' ') { Plan.space = false; if (Plan.cv) Plan.cv.style.cursor = ''; }
}

/* ---------- Başlat ---------- */
function boot() {
  Settings.load();
  Theme.apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (Settings.v.mode === 'auto') Theme.apply(); });
  migrateOldData();
  Home.init();
  Plan.init();
  bindEditor();
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { View3D.keys.clear(); Plan.space = false; });
  addEventListener('hashchange', () => Router.route());
  addEventListener('resize', () => { closeMenu(); if (!isMobile()) Sheets.closeAll(); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  // Kapanırken bekleyen otomatik kaydı yaz
  const flush = () => { if (Ed.P && Ed.dirty && Settings.v.autosave) Ed.save(true); };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  addEventListener('beforeunload', e => { if (Ed.P && Ed.dirty && !Settings.v.autosave) { e.preventDefault(); e.returnValue = ''; } });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  Router.route();
}
boot();
