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
    drawPlan(c.getContext('2d'), P, V, {w: cw, h: ch, dpr: 1, C: Object.assign({}, C, {bg: dark ? C.bg : '#F1F3EF'}), segs, A: analyze(P, segs), grid: false, clear: false, labels: false, dims: false});
    return c.toDataURL('image/jpeg', .82);
  } catch (e) { return ''; }
}
function planPNG(P) {
  const pad = 1.1, W = P.shop.w + pad * 2, D = P.shop.d + pad * 2;
  const s = clamp(Math.min(3600 / W, 2600 / D), 60, 220);
  const head = 96, cw = Math.round(W * s), ch = Math.round(D * s) + head;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const segs = computeWalls(P);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const C = Object.assign({}, LIGHT_PLAN, {accent: Settings.v.mode === 'dark' ? ACCENTS[Settings.v.accent]?.l || accent : accent});
  drawPlan(g, P, {s, ox: pad * s, oy: head + pad * s}, {w: cw, h: ch, dpr: 1, C, segs, A: analyze(P, segs), grid: false, clear: Settings.v.clear, labels: true, dims: true});
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#1B211F'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `700 34px ${getFont()}`; g.fillText(P.name, 40, 50);
  g.font = `500 20px ${getFont()}`; g.fillStyle = '#626C67';
  g.fillText(`${fmtM(P.shop.w)} × ${fmtM(P.shop.d)} m · ${fmtA(P.shop.w * P.shop.d)} m² · ${new Date().toLocaleDateString('tr-TR')}`, 40, 80);
  g.textAlign = 'right'; g.font = `600 16px ${getFont()}`; g.fillStyle = '#98A09B'; g.fillText('Eczane Plan', cw - 40, 50);
  return c;
}
async function exportPlanPNG() {
  const c = planPNG(Ed.P);
  c.toBlob(b => download(safeFile(Ed.P.name) + '-plan.png', b), 'image/png');
  toast('Plan resmi indiriliyor');
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

/* ---------- Tema ---------- */
const Theme = {
  apply() {
    const v = Settings.v, root = document.documentElement;
    const mode = v.mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : v.mode;
    root.dataset.mode = mode;
    const a = ACCENTS[v.accent] || ACCENTS.yesil;
    const col = mode === 'dark' ? a.d : a.l;
    root.style.setProperty('--accent', col);
    root.style.setProperty('--accent-ink', mode === 'dark' ? '#0E1512' : '#FFFFFF');
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = mode === 'dark' ? '#1B201E' : '#FFFFFF';
    if (Ed.P) { Plan.req(); View3D.markDirty(); View3D.miniDirty = true; Props.render(); }
  },
  dialog() {
    return modal(b => {
      b.append(h('h2', null, 'Görünüm'));
      const modes = [['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']];
      const seg = h('div', {class: 'seg', style: 'width:100%'});
      const drawSeg = () => { seg.innerHTML = ''; for (const [k, t] of modes) seg.append(h('button', {type: 'button', class: Settings.v.mode === k ? 'on' : '', style: 'flex:1', onclick: () => { Settings.set('mode', k); Theme.apply(); drawSeg(); }}, t)); };
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
    $$('#newTpl button').forEach(b => b.onclick = () => {
      this.tpl = b.dataset.v;
      $$('#newTpl button').forEach(x => x.classList.toggle('on', x === b));
      const s = this.tpl === 'sample';
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
  const wl = {full: 'Duvar: tam', half: 'Duvar: yarım', none: 'Duvar: yok'};
  $('#camWallsLbl').textContent = wl[Settings.v.walls] || wl.full;
  $('#camWalls').onclick = () => {
    const order = ['full', 'half', 'none'], n = order[(order.indexOf(Settings.v.walls) + 1) % 3];
    Settings.set('walls', n); $('#camWallsLbl').textContent = wl[n];
    View3D.markDirty(); toast(wl[n]);
  };
  $('#btnMenu').onclick = () => openMenu($('#btnMenu'), [
    {t: 'Plan resmi indir (PNG)', icon: ICONS.png, fn: exportPlanPNG},
    Ed.view === '3d' ? {t: '3B görüntü indir (PNG)', icon: ICONS.png, fn: export3DPNG} : null,
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
  if (mod) return;
  if (k === ' ' && Ed.view === '2d') { Plan.space = true; Plan.cv.style.cursor = 'grab'; e.preventDefault(); return; }
  if (k === '1') return Ed.setView('2d');
  if (k === '2') return Ed.setView('3d');
  if (Ed.view !== '2d') { if (k === 'Escape') Ed.select(null); return; }
  switch (k) {
    case 'Delete': case 'Backspace': if (Ed.sel) { e.preventDefault(); Ed.remove(); } break;
    case 'Escape': if (Ed.tool !== 'select') Ed.setTool('select'); else { Ed.select(null); Sheets.closeAll(); } break;
    case 'r': case 'R': Ed.rotate(e.shiftKey ? -90 : 90); break;
    case 'v': case 'V': Ed.setTool('select'); break;
    case 'o': case 'O': Ed.setTool('room'); break;
    case 'm': case 'M': Ed.setTool('measure'); break;
    case 'f': case 'F': Plan.fit(); break;
    case 'g': case 'G': $('#togGrid').click(); break;
    case 's': case 'S': $('#togSnap').click(); break;
    case 'b': case 'B': $('#togClear').click(); break;
    case '+': case '=': Plan.zoomAt(Plan.w / 2, Plan.h / 2, 1.25); break;
    case '-': Plan.zoomAt(Plan.w / 2, Plan.h / 2, .8); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!Ed.sel) return;
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
