
/* =====================================================================
   DIŞA / İÇE AKTARMA
   ===================================================================== */
function planJSON() { return JSON.stringify({v: 1, app: 'Eczane Plan Masası', rev: state.rev, exported: new Date().toISOString(), shop: state.shop, rooms: state.rooms, items: state.items, nextId: state.nextId}, null, 1); }
function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
async function saveFile(filename, data, mime) {
  if (downloadsApi) {
    try { await downloadsApi.save({filename, data}); toast('İndirildi: ' + filename); return true; }
    catch (e) { if (e && e.code === 'declined') return false; }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], {type: mime});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('İndiriliyor: ' + filename + ' (tarayıcı engellediyse metni kopyala)');
    return true;
  } catch (e) { toast('İndirme yapılamadı — JSON metnini kopyalayabilirsin'); return false; }
}
function openExport() {
  $('#jsonBox').value = planJSON();
  const dlg = $('#dlgExport'); try { dlg.showModal(); } catch (e) {}
}
function importJSON(text) {
  let d; try { d = JSON.parse(text); } catch (e) { toast('Dosya geçersiz: JSON okunamadı'); return; }
  if (!validState(d)) { toast('Dosya geçersiz: bu bir eczane planı değil ya da ölçüler bozuk'); return; }
  const s = sanitize(d); s.rev = (state.rev || 0) + 1;
  for (const r of s.rooms) { const W = s.shop.w, H = s.shop.h; r.w = clamp(r.w, MIN_ROOM, W); r.h = clamp(r.h, MIN_ROOM, H); r.x = clamp(r.x, 0, W - r.w); r.y = clamp(r.y, 0, H - r.h); }
  state = s; for (const r of state.rooms) applyPin(r);
  sel = null; $('#shopDims').textContent = `${fmtM(state.shop.w)} × ${fmtM(state.shop.h)} m`;
  commit(); fit(); renderPanel(); toast(`Plan yüklendi (${state.rooms.length} oda, ${state.items.length} eşya)`);
  try { $('#dlgExport').close(); } catch (e) {}
}
function exportPNG() {
  const S = state.shop, pxm = Math.min(220, 2800 / (S.w + 1.5));
  const pad = 70, tableH = 26 * (state.rooms.length + 2) + 40, W = Math.round(S.w * pxm + pad * 2), H = Math.round(S.h * pxm + pad * 2 + 70 + tableH);
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d');
  // geçici olarak çizim hedefini değiştir
  const keep = {ctx, view: {...view}, cw, ch, dpr, sel, rulerLine, guides, drag, passageOn};
  ctx = g; view = {s: pxm, ox: pad, oy: pad + 60}; cw = W; ch = H; dpr = 1; sel = null; rulerLine = null; guides = []; drag = null;
  exporting = true;
  draw();
  exporting = false;
  ctx = keep.ctx; view = keep.view; cw = keep.cw; ch = keep.ch; dpr = keep.dpr; sel = keep.sel; rulerLine = keep.rulerLine; guides = keep.guides; drag = keep.drag;
  // beyaz zemin altına
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d'); o.fillStyle = '#FFFFFF'; o.fillRect(0, 0, W, H); o.drawImage(off, 0, 0);
  o.fillStyle = '#1B2321'; o.font = "700 22px 'Bricolage Grotesque','Archivo',system-ui,sans-serif"; o.textBaseline = 'top';
  o.fillText(`${state.shop.name || 'Eczane'} — yerleşim planı`, pad, 22);
  o.font = "500 13px 'IBM Plex Mono',ui-monospace,monospace"; o.fillStyle = '#5D6864';
  o.fillText(`${fmtM(S.w)} × ${fmtM(S.h)} m · ${fmtA(S.w * S.h)} · ${new Date().toLocaleDateString('tr-TR')}`, pad, 50);
  const an = analyze();
  let ty = S.h * pxm + pad * 2 + 70;
  o.font = "600 12px 'Archivo',system-ui,sans-serif"; o.fillStyle = '#5D6864';
  o.fillText('ODA', pad, ty); o.fillText('EN × BOY', pad + 300, ty); o.fillText('BRÜT / NET m²', pad + 460, ty); ty += 22;
  o.font = "500 13px 'Archivo',system-ui,sans-serif"; o.fillStyle = '#1B2321';
  for (const r of state.rooms) { o.fillStyle = r.color; o.fillRect(pad, ty + 2, 10, 10); o.fillStyle = '#1B2321'; o.fillText(r.name, pad + 16, ty); o.fillText(`${fmtM(r.w)} × ${fmtM(r.h)} m`, pad + 300, ty); o.fillText(`${fmtM(r.w * r.h)} / ${fmtM(netArea(r))}`, pad + 460, ty); ty += 26; }
  o.fillText('Satış alanı (kalan)', pad + 16, ty); o.fillText('—', pad + 300, ty); o.fillText(fmtM(an.sales), pad + 460, ty); ty += 30;
  // ölçek çubuğu
  o.strokeStyle = '#1B2321'; o.lineWidth = 2; const sx = W - pad - pxm, sy = ty + 4; o.beginPath(); o.moveTo(sx, sy); o.lineTo(sx + pxm, sy); o.moveTo(sx, sy - 5); o.lineTo(sx, sy + 5); o.moveTo(sx + pxm, sy - 5); o.lineTo(sx + pxm, sy + 5); o.stroke(); o.font = "600 11px 'IBM Plex Mono',monospace"; o.fillStyle = '#5D6864'; o.textAlign = 'center'; o.fillText('1 m', sx + pxm / 2, sy + 8); o.textAlign = 'left';
  o.font = "500 11px 'Archivo',system-ui,sans-serif"; o.fillStyle = '#8A948F';
  o.fillText('Ön tasarım — resmî kroki yerine geçmez. Eczane Plan Masası', pad, ty);
  return out;
}
let exporting = false;
const LIGHT_TK = {paper:'#FFFFFF', ink:'#1B2321', muted:'#5D6864', faint:'#8A948F', accent:'#1F7A5A', accentSoft:'#DDF0E7', line:'#D8DDD6', lineStrong:'#B4BCB4', gridMinor:'#EDF0EB', gridMajor:'#DADFD8', gridMeter:'#C4CBC3', wall:'#2B3431', wallHatch:'#8A948F', danger:'#C2412D', warn:'#A8690F', surface:'#FFFFFF', furnFill:'#FBFAF4', furnStroke:'#3E4744', glass:'rgba(120,170,220,.25)'};
async function doExportPNG() {
  const cv = exportPNG();
  const name = `eczane-plani-${stamp()}.png`;
  await new Promise(res => cv.toBlob(async b => {
    if (!b) { try { const url = cv.toDataURL('image/png'); window.open(url, '_blank'); toast('Görsel yeni sekmede açıldı — uzun basıp kaydet'); } catch (e) { toast('PNG oluşturulamadı'); } res(); return; }
    await saveFile(name, b, 'image/png'); res();
  }, 'image/png'));
}

/* =====================================================================
   BAŞLATMA
   ===================================================================== */
function init() {
  const hadLocal = loadLocal();
  lastCommitted = snapshot();
  $('#shopDims').textContent = `${fmtM(state.shop.w)} × ${fmtM(state.shop.h)} m`;
  // bağlam çubuğu
  const bar = document.createElement('div'); bar.id = 'ctxbar'; bar.hidden = true;
  bar.innerHTML = `<button class="ibtn" data-act="rot+" title="Döndür 90° (R)">⟳</button><button class="ibtn" data-act="dup" title="Çoğalt (Ctrl+D)">⧉</button><button class="ibtn" data-act="lock" title="Kilit (L)">🔓</button><button class="ibtn" data-act="del" title="Sil (Delete)" style="color:var(--danger)">🗑</button>`;
  bar.style.cssText = 'position:absolute;display:flex;gap:3px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px;box-shadow:var(--shadow);z-index:5';
  bar.querySelectorAll('button').forEach(b => { b.style.cssText = 'min-width:34px;justify-content:center;border:0;border-radius:999px;padding:6px 8px'; b.addEventListener('click', () => doAct(b.dataset.act)); });
  stage.appendChild(bar);
  // araçlar
  document.querySelectorAll('.tbtn[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#btnUndo').addEventListener('click', undo); $('#btnRedo').addEventListener('click', redo);
  $('#btnSnap').addEventListener('click', toggleSnap); $('#btnGrid').addEventListener('click', toggleGrid);
  $('#btnHuman').addEventListener('click', () => { settings.humanBadge = !settings.humanBadge; $('#btnHuman').classList.toggle('on', settings.humanBadge); requestDraw(); });
  $('#btnExport').addEventListener('click', openExport);
  $('#btnReset').addEventListener('click', () => ask('Plan sıfırlansın mı? Mevcut plan geri alınabilir (Ctrl+Z), ama önce JSON yedek almanı öneririm.', ['Varsayılan plan', 'Boş plan (sadece WC)', 'Vazgeç']).then(i => {
    if (i < 0 || i === 2) return;
    const d = defaultState(i === 1 ? 'empty' : 'default'); d.rev = (state.rev || 0) + 1; state = d; sel = null;
    $('#shopDims').textContent = `${fmtM(state.shop.w)} × ${fmtM(state.shop.h)} m`;
    commit(); fit(); renderPanel(); toast('Plan sıfırlandı');
  }));
  $('#zoomIn').addEventListener('click', () => zoomAt(1.25, cw / 2, ch / 2));
  $('#zoomOut').addEventListener('click', () => zoomAt(1 / 1.25, cw / 2, ch / 2));
  $('#zoomFit').addEventListener('click', fit);
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; $('#panel').classList.remove('collapsed'); renderPanel(); }));
  $('#panelToggle').addEventListener('click', () => { const p = $('#panel'); p.classList.toggle('collapsed'); $('#panelToggle').textContent = p.classList.contains('collapsed') ? '▴ Panel' : '▾ Panel'; setTimeout(resize, 220); });
  // dışa aktarma diyaloğu
  $('#expPng').addEventListener('click', doExportPNG);
  $('#expJson').addEventListener('click', () => saveFile(`eczane-plani-${stamp()}.json`, planJSON(), 'application/json'));
  $('#expCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(planJSON()); toast('Panoya kopyalandı'); } catch (e) { $('#jsonBox').select(); toast('Metni seçtim — Ctrl+C ile kopyala'); } });
  $('#impPaste').addEventListener('click', () => importJSON($('#jsonBox').value));
  $('#impFile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(importJSON); e.target.value = ''; });
  $('#expPrint').addEventListener('click', () => { try { $('#dlgExport').close(); } catch (e) {} setTimeout(() => window.print(), 200); });
  $('#dlgClose').addEventListener('click', () => $('#dlgExport').close());
  // tema / boyut
  new ResizeObserver(() => resize()).observe(stage);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { requestDraw(); renderPanel(); });
  new MutationObserver(() => { requestDraw(); renderPanel(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  document.fonts && document.fonts.ready.then(() => { requestDraw(); renderPanel(); });
  resize(); fit(); setTool('select'); renderPanel(); updateUndoButtons(); setSaveStatus('local');
  initRemote();
  if (!hadLocal) setTimeout(() => toast('Dükkânın 13,65 × 6,95 m (94,9 m²) hazır. Örnek yerleşimi dilediğin gibi değiştir.'), 400);
}
// draw() içine geçiş okları ve dışa aktarma modu için kanca
const _draw = draw;
draw = function () { _draw(); if (!exporting) drawPassages(); if (!exporting) positionCtxBar(); };
init();
