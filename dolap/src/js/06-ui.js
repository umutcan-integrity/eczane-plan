/* =====================================================================
   Arayüz: dolap listesi, ölçü formu, parça kartı, kesim listesi,
   levha planı, yazdırma, CSV
   ===================================================================== */
const getP = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
const setP = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; };

/* küçük çizimler: yapı tipi ve baza tipi */
const BUILD_IC = {
  sides: '<rect x="4" y="2" width="4" height="30"/><rect x="32" y="2" width="4" height="30"/><rect x="8" y="2" width="24" height="4" class="a"/><rect x="8" y="28" width="24" height="4" class="a"/>',
  top: '<rect x="4" y="2" width="32" height="4" class="a"/><rect x="4" y="6" width="4" height="26"/><rect x="32" y="6" width="4" height="26"/><rect x="8" y="28" width="24" height="4" class="a"/>',
  over: '<rect x="4" y="2" width="32" height="4" class="a"/><rect x="4" y="28" width="32" height="4" class="a"/><rect x="4" y="6" width="4" height="22"/><rect x="32" y="6" width="4" height="22"/>',
};
const BASE_IC = {
  none: '<rect x="6" y="4" width="28" height="28" rx="1"/>',
  legs: '<rect x="6" y="3" width="28" height="22" rx="1"/><path d="M10 25v6M30 25v6" stroke-width="3"/>',
  plinth: '<path d="M6 3h28v29h-3V24H9v8H6z"/><path d="M9 28h22" class="a" stroke-width="3"/>',
  frame: '<rect x="6" y="3" width="28" height="22" rx="1"/><rect x="8" y="25" width="24" height="6" class="a"/>',
  wall: '<path d="M37 2v31" stroke-width="2.4"/><rect x="5" y="7" width="28" height="20" rx="1"/>',
};
const pic = inner => { const s = sv('svg', {viewBox: '0 0 40 34', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6}); s.innerHTML = inner.replace(/class="a"/g, 'fill="currentColor" fill-opacity=".35"'); return s; };

const UI = {
  /* ---------- ortak alan üreticileri ---------- */
  num(label, path, o = {}) {
    const c = A.cab, v = getP(c, path);
    const inp = h('input', {class: 'inp', inputmode: 'decimal', autocomplete: 'off', value: (o.empty && !v) ? '' : fmt(v, 2), placeholder: o.ph || '', 'data-path': path});
    if (o.auto != null) inp.dataset.auto = o.auto;
    const ok = x => isFinite(x) && x >= (o.min ?? 0) && x <= (o.max ?? 1e5);
    inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      if (o.empty && raw === '') { inp.classList.remove('bad'); A.change(() => setP(A.cab, path, 0), {key: path}); return; }
      const x = evalNum(raw);
      if (!ok(x)) { inp.classList.add('bad'); return; }
      inp.classList.remove('bad');
      A.change(() => setP(A.cab, path, x), {key: path, full: o.full});
    });
    inp.addEventListener('change', () => { const x = getP(A.cab, path); if (!inp.classList.contains('bad')) inp.value = (o.empty && !x) ? '' : fmt(x, 2); });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    return h('label', {class: 'fld'}, h('span', {title: label}, label), h('div', {class: 'inpw'}, inp, h('i', null, o.unit ?? 'mm')), o.hint ? h('small', null, o.hint) : null);
  },
  chips(label, path, opts, o = {}) {
    const cur = o.get ? o.get() : getP(A.cab, path);
    const box = h('div', {class: 'chips' + (o.blocks ? ' blocks' : '')}, opts.map(([v, t, ic, title]) => h('button', {type: 'button', class: String(cur) === String(v) ? 'on' : '', title: title || '', onclick: () => { if (o.set) o.set(v); else A.change(() => setP(A.cab, path, v), {full: true}); }}, ic ? pic(ic) : null, t)));
    return label ? h('div', {class: 'fld'}, h('span', null, label), box, o.hint ? h('small', null, o.hint) : null) : box;
  },
  step(label, path, min, max, o = {}) {
    const v = getP(A.cab, path), set = d => { const x = clamp(getP(A.cab, path) + d, min, max); if (x !== getP(A.cab, path)) A.change(() => setP(A.cab, path, x), {full: true}); };
    return h('div', {class: 'lblrow'}, h('span', null, label), h('div', {class: 'step'}, h('button', {type: 'button', 'aria-label': 'azalt', onclick: () => set(-1)}, '−'), h('b', null, o.fmt ? o.fmt(v) : v), h('button', {type: 'button', 'aria-label': 'artır', onclick: () => set(1)}, '+')));
  },
  check(label, path, o = {}) {
    return h('label', {class: 'chk'}, h('input', {type: 'checkbox', checked: !!getP(A.cab, path), onchange: e => A.change(() => setP(A.cab, path, e.target.checked), {full: o.full !== false})}), label);
  },
  grp(key, title, sub, ...body) {
    const open = !!Settings.v.open[key];
    const d = h('details', {class: 'grp', open, 'data-k': key}, h('summary', null, title, sub ? h('small', null, sub) : null), h('div', {class: 'body'}, body));
    d.addEventListener('toggle', () => { Settings.v.open[key] = d.open ? 1 : 0; Settings.set('open', Settings.v.open); });
    return d;
  },

  /* ---------- dolap listesi ---------- */
  cabs() {
    const box = $('#cabs'), J = A.job; box.innerHTML = '';
    box.append(h('div', {class: 'cabs-head'}, h('b', null, `Dolaplar · ${J.cabs.length}`),
      h('button', {class: 'btn sm primary', type: 'button', onclick: () => Wiz.open('new')}, icon(IC.plus), 'Dolap oluştur')));
    for (const c of J.cabs) {
      const R = A.cab && c.id === A.cab.id ? A.R : calcCab(c);
      const bad = R.warn.some(w => w.lvl === 'err') || R.check.some(w => w.lvl === 'err'), wr = R.warn.some(w => w.lvl === 'warn');
      const ic = R.parts.length ? frontSVG(c, R, {mini: true, cls: 'ic'}) : pic(BASE_IC.none);
      ic.classList.add('ic');
      box.append(h('div', {class: 'cab' + (c.id === J.cur ? ' on' : ''), role: 'button', tabindex: 0, onclick: () => A.setCab(c.id), onkeydown: e => { if (e.key === 'Enter') A.setCab(c.id); }},
        ic, h('div', {class: 'tx'}, h('b', null, c.name), h('small', null, `${fmt(c.W)} × ${fmt(c.H)} × ${fmt(c.D)} mm`)),
        bad ? h('i', {class: 'warnb', title: 'Hata var'}) : wr ? h('i', {class: 'warnb w', title: 'Uyarı var'}) : null,
        h('span', {class: 'qty', title: 'Adet'}, `× ${c.qty}`)));
    }
  },
  /* ---------- form (düzenleme) ---------- */
  form() {
    const c = A.cab, R = A.R, F = $('#form'), sc = $('#side').scrollTop;
    F.innerHTML = '';
    if (!c) {
      F.append(h('div', {class: 'empty-side'}, h('b', null, 'Bu işte henüz dolap yok'), h('p', null, 'Dolap oluştur’a bas; tipini, ölçüsünü ve içini adım adım soracağız.'),
        h('button', {class: 'btn primary big full', type: 'button', onclick: () => Wiz.open('new')}, icon(IC.plus), 'Dolap oluştur')));
      return;
    }
    const hasDrw = c.sections.some(s => s.drawers), hasDoor = R.parts.some(p => p.kind === 'door' || p.kind === 'dfront');
    const sub = (t, ...kids) => [h('div', {class: 'subh'}, t), ...kids];
    F.append(
      h('div', {class: 'cabhead'},
        h('input', {class: 'inp txt nm', value: c.name, maxlength: 60, 'aria-label': 'Dolap adı', oninput: e => A.change(() => { A.cab.name = e.target.value || 'Dolap'; }, {key: 'name'})}),
        UI.step('Adet', 'qty', 1, 99),
        h('button', {class: 'btn primary big full', type: 'button', onclick: () => Wiz.open('edit', A.cab)}, icon(IC.edit), 'Soru soru düzenle')),
      UI.grp('dims', 'Ölçüler', `${fmt(c.W)} × ${fmt(c.H)} × ${fmt(c.D)}`,
        h('div', {class: 'row r3'}, UI.num('Genişlik', 'W', {min: 100, max: 6000}), UI.num('Yükseklik', 'H', {min: 100, max: 4000}), UI.num('Derinlik', 'D', {min: 100, max: 1500})),
        h('p', {class: 'tip'}, 'mm olarak. Yükseklik ayak / baza dahil.')),
      h('div', {class: 'sum', id: 'sum'}),
      UI.grp('secs', 'İç düzen', `${c.sections.length} bölme`, UI.secs()),
      UI.grp('base', 'Alt ve üst', ({none: 'düz', legs: 'ayaklı', plinth: 'bazalı', frame: 'baza kasası', wall: 'duvara asılı'})[c.base] + (['legs', 'plinth', 'frame'].includes(c.base) ? ` · ${fmt(c.baseH)} mm` : ''),
        Wg.tiles([['legs', 'Ayaklı', BASE_IC.legs], ['plinth', 'Bazalı', BASE_IC.plinth], ['none', 'Düz', BASE_IC.none], ['wall', 'Duvara asılı', BASE_IC.wall]], c.base === 'frame' ? 'plinth' : c.base, v => A.change(() => { A.cab.base = v; }, {full: true}), {cls: 'sm'}),
        ['legs', 'plinth', 'frame'].includes(c.base) ? UI.num(c.base === 'legs' ? 'Ayak yüksekliği' : 'Baza yüksekliği', 'baseH', {min: 20, max: 400}) : null,
        UI.chips('Üstü', 'top', [['panel', 'Üst tabla'], ['rails', 'Kuşak (tezgâh altı)'], ['none', 'Açık']])),
      UI.grp('adv', 'Usta ayarları', 'kalınlık, arkalık, paylar, bant',
        ...sub('Gövde',
          h('div', {class: 'row'}, UI.num('Gövde kalınlığı', 't', {min: 5, max: 50, full: true}), h('div', {class: 'fld'}, h('span', null, 'Hızlı seç'), UI.chips(null, 't', [[16, '16'], [18, '18'], [25, '25']]))),
          UI.chips('Birleşim', 'build', [['sides', 'Yanlar tam boy', BUILD_IC.sides, 'Üst ve alt tabla yanların arasında'], ['top', 'Üst tabla üstte', BUILD_IC.top, 'Üst tabla yanların üstüne oturur, alt tabla arada'], ['over', 'Tablalar tam', BUILD_IC.over, 'Alt ve üst tabla tam genişlik, yanlar arada']], {blocks: true}),
          c.top === 'rails' ? UI.num('Kuşak eni', 'railW', {min: 40, max: 300}) : null,
          ['legs', 'plinth', 'frame'].includes(c.base) ? UI.chips('Baza tipi', 'base', [['legs', 'Ayak + klipsli baza'], ['plinth', 'Yanlar yere iner'], ['frame', 'Baza kasası']]) : null,
          ['legs', 'plinth', 'frame'].includes(c.base) ? UI.num('Bazanın önden geri çekmesi', 'plinthSet', {min: 0, max: 200}) : null),
        ...sub('Arkalık',
          UI.chips(null, 'back', [['groove', 'Kanallı'], ['nailed', 'Arkadan çakma'], ['inset', 'Gömme (tam kalınlık)'], ['none', 'Yok']]),
          c.back !== 'none' ? h('div', {class: 'row'}, UI.num('Arkalık kalınlığı', 'backT', {min: 2, max: 30, full: true}), c.back !== 'inset' ? UI.num(c.back === 'groove' ? 'Kanal boşluk payı' : 'Kenardan içeri pay', 'backTol', {min: 0, max: 10, hint: 'her kenarda'}) : h('div')) : null,
          c.back === 'groove' ? h('div', {class: 'row'}, UI.num('Kanal derinliği', 'grooveD', {min: 2, max: 20}), UI.num('Kanalın arkadan mesafesi', 'grooveO', {min: 0, max: 80})) : null),
        ...(hasDoor ? sub('Kapak',
          UI.chips('Kapak tipi', 'overlay', [['full', 'Tam bindirme'], ['half', 'Yarım bindirme'], ['inset', 'Gömme']], {hint: c.overlay === 'half' ? 'Yan yana dolaplarda: dış kenarda yanın yarısını örter.' : null}),
          h('div', {class: 'row r3'}, UI.num('Kapak kalınlığı', 'frontT', {min: 3, max: 40, full: true}), UI.num('Kapak arası', 'gap', {min: 0, max: 10}), UI.num('Dış kenar payı', 'edge', {min: 0, max: 10}))) : []),
        ...sub('Raf',
          h('div', {class: 'row'}, UI.num('Raf yan boşluğu', 'shelfGap', {min: 0, max: 5, hint: 'hareketli raf, her yanda'}), UI.num('Raf geri çekme', 'shelfSet', {min: 0, max: 100, hint: 'hareketli raf, önden'}))),
        ...(hasDrw ? sub('Çekmece',
          UI.chips('Ray', 'railType', [['ball', 'Bilyalı'], ['roller', 'Makaralı'], ['hidden', 'Gizli ray']], {set: v => A.change(() => { A.cab.railType = v; A.cab.railGap = v === 'hidden' ? 5 : v === 'roller' ? 12.5 : 13; }, {full: true})}),
          h('div', {class: 'row'}, UI.num('Ray payı (her yan)', 'railGap', {min: 0, max: 30}), UI.num('Çekmece gövde kal.', 'drawerT', {min: 6, max: 30, full: true}))) : []),
        ...sub('Kenar bandı',
          UI.chips('Gövde ön kenarları', 'bandBody', [[0, 'Yok'], [.4, '0,4'], [.8, '0,8'], [1, '1'], [2, '2']]),
          hasDoor ? UI.chips('Kapak / çekmece önü (4 kenar)', 'bandFront', [[0, 'Yok (boyalı)'], [.8, '0,8'], [1, '1'], [2, '2']]) : null,
          hasDrw ? UI.chips('Çekmece kutusu üst kenarı', 'bandDrawer', [[0, 'Yok'], [.4, '0,4'], [.8, '0,8'], [1, '1']]) : null,
          UI.check('Bant kalınlığını kesim ölçüsünden düş', 'deduct'),
          h('p', {class: 'tip'}, 'Örn. 560 derinlikli yan, 0,8 bantla 559,2 kesilir.')),
        A.job.cabs.length > 1 ? h('button', {class: 'btn full', type: 'button', onclick: () => A.applyAll()}, 'Bu ayarları tüm dolaplara uygula') : null),
      UI.grp('mats', 'Renk, malzeme ve levha', 'tüm iş', UI.mats()),
      h('div', {class: 'row', style: 'margin:14px 0 6px'},
        h('button', {class: 'btn', type: 'button', onclick: () => A.dupCab()}, icon(IC.copy), 'Çoğalt'),
        h('button', {class: 'btn danger', type: 'button', onclick: () => A.delCab()}, icon(IC.trash), 'Sil')),
    );
    UI.sum();
    $('#side').scrollTop = sc;
  },
  secs() {
    const c = A.cab, n = c.sections.length, R = A.R;
    const wrap = h('div', {class: 'secs'});
    wrap.append(h('div', {class: 'fld'}, h('span', null, 'Bölme sayısı'), Wg.tiles([1, 2, 3, 4].map(k => [k, k === 1 ? 'Tek' : `${k}`, secsPic(k)]), n, k => A.change(() => {
      const cur = A.cab.sections;
      if (k > cur.length) for (let i = cur.length; i < k; i++) cur.push(Object.assign({}, cur[cur.length - 1], {w: 0, hinge: 'R'}));
      else cur.length = k;
    }, {full: true}), {cls: 'mini4'})));
    c.sections.forEach((s, i) => wrap.append(secCard(s, i, n, R, {
      set: fn => A.change(() => fn(A.cab.sections[i]), {full: true}),
      soft: (fn, key) => A.change(() => fn(A.cab.sections[i]), {key: 'sec' + key}),
      del: () => A.change(() => { A.cab.sections.splice(i, 1); }, {full: true}),
    })));
    return wrap;
  },
  mats() {
    const J = A.job, box = h('div', {class: 'mats'});
    const setJ = (fn, key, full) => A.change(fn, {key, full});
    for (const k of MAT_KEYS) {
      const m = J.mats[k];
      const plate = q => { const inp = h('input', {class: 'inp', inputmode: 'decimal', value: m[q]}); inp.addEventListener('input', () => { const x = evalNum(inp.value); if (!(x >= 300 && x <= 6000)) { inp.classList.add('bad'); return; } inp.classList.remove('bad'); setJ(() => { A.job.mats[k][q] = x; }, 'm' + k + q); }); return h('label', {class: 'fld'}, h('span', null, q === 'L' ? 'Levha boyu' : 'Levha eni'), h('div', {class: 'inpw'}, inp, h('i', null, 'mm'))); };
      box.append(h('div', {class: 'mat'},
        h('div', {class: 'mat-h'}, MAT_NAMES[k]),
        h('input', {class: 'inp txt', value: m.label, maxlength: 40, oninput: e => setJ(() => { A.job.mats[k].label = e.target.value || MAT_NAMES[k]; }, 'ml' + k)}),
        h('div', {class: 'sw'}, Object.entries(FINISHES).map(([fk, [fn, col]]) => h('button', {type: 'button', title: fn, 'aria-label': fn, class: m.color === fk ? 'on' : '', style: `background:${col}`, onclick: () => setJ(() => { A.job.mats[k].color = fk; }, null, true)}))),
        h('div', {class: 'row'}, plate('L'), plate('W')),
        h('label', {class: 'chk'}, h('input', {type: 'checkbox', checked: m.grain, onchange: e => setJ(() => { A.job.mats[k].grain = e.target.checked; }, null, true)}), 'Desenli (parçalar döndürülmez, boy = levha boyu)')));
    }
    const jn = (label, key) => { const inp = h('input', {class: 'inp', inputmode: 'decimal', value: fmt(J[key])}); inp.addEventListener('input', () => { const x = evalNum(inp.value); if (!(x >= 0 && x <= 50)) { inp.classList.add('bad'); return; } inp.classList.remove('bad'); setJ(() => { A.job[key] = x; }, 'j' + key); }); return h('label', {class: 'fld'}, h('span', null, label), h('div', {class: 'inpw'}, inp, h('i', null, 'mm'))); };
    box.append(h('div', {class: 'row'}, jn('Testere payı', 'kerf'), jn('Levha kenar traşı', 'trim')));
    return box;
  },
  sum() {
    const el = $('#sum'); if (!el) return;
    const R = A.R; el.innerHTML = ''; if (!R) return;
    el.append(h('h4', null, 'Hesap özeti'));
    if (R.sum.length) el.append(h('div', {class: 'kv'}, R.sum.flatMap(([k, v]) => [h('span', null, k), h('b', null, v)])));
    for (const w of [...R.warn.filter(x => x.lvl === 'err'), ...R.check, ...R.warn.filter(x => x.lvl !== 'err')]) el.append(h('div', {class: 'iss ' + w.lvl}, w.t));
    const c = A.cab; if (!c) return;
    const ds = $('#form details[data-k=dims] summary small'); if (ds) ds.textContent = `${fmt(c.W)} × ${fmt(c.H)} × ${fmt(c.D)}`;
    const cs = $('#form details[data-k=cab] summary small'); if (cs) cs.textContent = c.name;
    /* bölme genişliği "otomatik" ipuçları */
    for (const s of $$('#form .sec')) { const i = $$('#form .sec').indexOf(s), w = R.dims && R.dims.widths[i], sm = s.querySelector('.sec-h small'); if (sm) sm.textContent = w ? `iç genişlik ${fmt(w)} mm` : ''; }
  },

  /* ---------- 3B araç çubuğu ve parça kartı ---------- */
  tools() {
    const t = $('#tools3d'); t.innerHTML = '';
    const tb = (txt, ic, on, fn, title) => h('button', {class: 'tb' + (on ? ' on' : ''), type: 'button', title: title || txt, onclick: fn}, ic ? icon(ic) : null, txt);
    const dm = V.doorMode;
    t.append(
      tb('Kapalı', IC.door, dm === 'closed', () => { V.setDoor('closed'); UI.tools(); }, 'Kapaklar kapalı'),
      tb('Açık', null, dm === 'open', () => { V.setDoor('open'); UI.tools(); }, 'Kapakları aç, çekmeceleri çek'),
      tb('Gizle', null, dm === 'hidden', () => { V.setDoor('hidden'); UI.tools(); }, 'Kapak ve çekmece önlerini gizle'),
      h('i', {class: 'sep'}),
      tb('Patlat', IC.explode, V.explode, () => { V.setExplode(!V.explode); if (V.explode) setTimeout(() => { V.fit(); V.req(); }, 0); UI.tools(); }, 'Parçaları ayrık göster'),
      tb('Ölçüler', IC.ruler, V.dims, () => { V.dims = !V.dims; V.req(); UI.tools(); }, 'Dış ölçüleri göster'),
      tb('Odak', IC.focus, V.focus, () => { V.focus = !V.focus; V.applyState(); V.req(); UI.tools(); }, 'Seçili parça dışındakileri soluklaştır'),
      h('i', {class: 'sep'}),
      tb('', IC.cube, false, () => V.view('iso'), 'Perspektif'), tb('', IC.front, false, () => V.view('front'), 'Önden'), tb('', IC.side, false, () => V.view('side'), 'Yandan'), tb('', IC.top, false, () => V.view('top'), 'Üstten'),
    );
  },
  selectPart(id, o = {}) {
    A.sel = id || null;
    if (V.ready) V.select(A.sel);
    UI.pcard();
    for (const tr of $$('#vcut tr[data-refs]')) tr.classList.toggle('on', !!A.sel && A.cab && tr.dataset.refs.split(' ').includes(A.cab.id + ':' + A.sel));
    if (o.show && A.sel) A.show('3d');
  },
  pcard() {
    const el = $('#pcard'), p = A.sel && A.R && A.R.parts.find(q => q.id === A.sel);
    if (!p) { el.hidden = true; return; }
    const c = A.cab, m = A.job.mats[p.mat], same = A.R.parts.filter(q => q.name === p.name && q.cL === p.cL && q.cW === p.cW && bandSig(q) === bandSig(p)).length;
    const bandTxt = UI.bandText(p, true);
    const ovIn = (q, v) => h('input', {class: 'inp', inputmode: 'decimal', value: fmt(v), 'data-q': q});
    const iL = ovIn('cL', p.cL), iW = ovIn('cW', p.cW);
    const applyOv = () => {
      const L = evalNum(iL.value), Wv = evalNum(iW.value);
      if (!(L > 0 && Wv > 0)) { toast('Geçerli bir ölçü gir', 'err'); return; }
      const bL = p.cL0 ?? p.cL, bW = p.cW0 ?? p.cW;
      A.change(() => {
        const ov = A.cab.over[p.id] || {};
        ov.cL = Math.abs(L - bL) > .01 ? L : 0; ov.cW = Math.abs(Wv - bW) > .01 ? Wv : 0;
        if (!ov.cL && !ov.cW && !ov.off) delete A.cab.over[p.id]; else A.cab.over[p.id] = ov;
      }, {});
      toast('Kesim ölçüsü güncellendi');
    };
    el.innerHTML = '';
    el.append(
      h('div', {class: 'pc-h'}, h('div', null, h('b', null, p.name, p.ovr ? h('span', {class: 'badge', style: 'margin-left:6px'}, 'elle') : null, p.off ? h('span', {class: 'badge off', style: 'margin-left:6px'}, 'listede yok') : null), h('small', null, [p.sub, c.name, `${m.label} · ${fmt(p.T)} mm`].filter(Boolean).join(' · '))),
        h('button', {class: 'icon-btn sm', type: 'button', 'aria-label': 'Kapat', onclick: () => UI.selectPart(null)}, icon(IC.x))),
      h('div', null, h('div', {class: 'pc-tag'}, 'Kesim ölçüsü (boy × en × kalınlık)'),
        h('div', {class: 'pc-cut'}, h('span', {class: 'n L'}, fmt(p.cL)), h('span', {class: 'x'}, '×'), h('span', {class: 'n W'}, fmt(p.cW)), h('span', {class: 'x'}, '×'), h('span', {class: 'n T'}, fmt(p.T)), h('span', {class: 'u'}, 'mm'),
          h('span', {class: 'u', style: 'margin-left:auto'}, `bu dolapta ${same} adet${c.qty > 1 ? ` · toplam ${same * c.qty}` : ''}`))),
      h('div', {class: 'pc-f'},
        h('div', null, h('b', null, 'Boy: '), p.fL || fmt(p.L)),
        h('div', null, h('b', null, 'En: '), p.fW || fmt(p.Wd)),
        (Math.abs(p.L - p.cL) > .05 || Math.abs(p.Wd - p.cW) > .05) && !p.ovr ? h('div', null, h('b', null, 'Kesim: '), `${fmt(p.L)} × ${fmt(p.Wd)} bitmiş ölçüden bant düşülür → ${fmt(p.cL)} × ${fmt(p.cW)}`) : null,
        p.ovr ? h('div', null, h('b', null, 'Elle düzeltildi: '), `hesaplanan ${fmt(p.cL0 ?? p.cL)} × ${fmt(p.cW0 ?? p.cW)}`) : null,
        h('div', null, h('b', null, 'Kenar bandı: '), bandTxt),
        h('div', null, h('b', null, 'Desen yönü: '), m.grain ? 'boy boyunca (levha boyuna paralel)' : 'desensiz; levhada döndürülebilir')),
      p.notes.length ? h('ul', {class: 'pc-n'}, p.notes.map(x => h('li', null, x))) : null,
      h('details', {open: p.ovr || p.off}, h('summary', {class: 'pc-tag', style: 'cursor:pointer;padding:2px 0'}, 'Elle ayarla'),
        h('div', {style: 'display:flex;flex-direction:column;gap:8px;margin-top:8px'},
          h('div', {class: 'ovr'}, h('label', {class: 'fld'}, h('span', null, 'Kesim boyu'), h('div', {class: 'inpw'}, iL, h('i', null, 'mm'))), h('label', {class: 'fld'}, h('span', null, 'Kesim eni'), h('div', {class: 'inpw'}, iW, h('i', null, 'mm'))),
            h('button', {class: 'btn sm primary', type: 'button', style: 'min-height:40px', onclick: applyOv}, 'Uygula')),
          h('div', {style: 'display:flex;gap:8px;flex-wrap:wrap'},
            p.ovr ? h('button', {class: 'btn sm', type: 'button', onclick: () => A.change(() => { const ov = A.cab.over[p.id]; if (ov) { delete ov.cL; delete ov.cW; if (!ov.off) delete A.cab.over[p.id]; } }, {})}, 'Hesaplanana dön') : null,
            h('button', {class: 'btn sm', type: 'button', onclick: () => A.change(() => { const ov = A.cab.over[p.id] || (A.cab.over[p.id] = {}); ov.off = !ov.off; if (!ov.off && !ov.cL && !ov.cW) delete A.cab.over[p.id]; }, {})}, p.off ? 'Listeye geri al' : 'Kesim listesinden çıkar')),
          h('p', {class: 'tip'}, 'Elle girilen ölçü yalnız kesim listesine yansır ve “elle” etiketiyle işaretlenir. Dolap ölçüleri değişince bu ölçüyü kontrol et.')))
    );
    el.hidden = false;
  },
  bandText(p, long) {
    const parts = [];
    const nL = p.bandL.filter(b => b > 0), nW = p.bandW.filter(b => b > 0);
    if (nL.length) parts.push(`${nL.length} boy kenarı (${fmt(nL[0])} mm)`);
    if (nW.length) parts.push(`${nW.length} en kenarı (${fmt(nW[0])} mm)`);
    if (!parts.length) return 'yok';
    if (long && p.kind !== 'door' && p.kind !== 'dfront' && nL.length === 1) parts[0] += ' — ' + (['dside', 'dfb'].includes(p.kind) ? 'üst kenar' : 'ön kenar');
    return parts.join(' + ');
  },
  bandSVG(r) {
    const s = sv('svg', {class: 'bsvg', viewBox: '0 0 44 26'});
    s.append(sv('rect', {x: 4, y: 4, width: 36, height: 18, rx: 2}));
    if (r.bandL[0] > 0) s.append(sv('line', {x1: 5, y1: 4, x2: 39, y2: 4}));
    if (r.bandL[1] > 0) s.append(sv('line', {x1: 5, y1: 22, x2: 39, y2: 22}));
    if (r.bandW[0] > 0) s.append(sv('line', {x1: 4, y1: 5, x2: 4, y2: 21}));
    if (r.bandW[1] > 0) s.append(sv('line', {x1: 40, y1: 5, x2: 40, y2: 21}));
    return s;
  },
  bandShort(r) {
    const nL = r.bandL.filter(b => b > 0), nW = r.bandW.filter(b => b > 0);
    if (!nL.length && !nW.length) return '—';
    return [nL.length ? `${nL.length} boy` : '', nW.length ? `${nW.length} en` : ''].filter(Boolean).join(' + ') + ` · ${fmt((nL[0] || nW[0]))}`;
  },

  /* ---------- kesim listesi ---------- */
  scopeCabs() { return Settings.v.scope === 'cab' ? [A.cab].filter(Boolean) : A.job.cabs; },
  scopeSeg(rerender) {
    const J = A.job;
    return h('div', {class: 'seg sm'}, [['job', `Tüm iş (${J.cabs.reduce((a, c) => a + c.qty, 0)} dolap)`], ['cab', 'Bu dolap']].map(([v, t]) => h('button', {type: 'button', class: Settings.v.scope === v ? 'on' : '', onclick: () => { Settings.set('scope', v); rerender(); }}, t)));
  },
  cut() {
    const el = $('#vcut'), J = A.job, cabs = UI.scopeCabs(), G = cutRows(J, cabs), sc = el.scrollTop;
    el.innerHTML = '';
    const tot = G.reduce((a, g) => a + g.count, 0), area = G.reduce((a, g) => a + g.area, 0), bands = bandTotals(G), sheets = G.map(g => nestGroup(g, J));
    const inner = h('div', {class: 'pane-in'});
    inner.append(
      h('div', {class: 'ptool'}, h('h2', null, 'Kesim listesi'), UI.scopeSeg(() => UI.cut()),
        h('button', {class: 'btn sm', type: 'button', onclick: () => UI.csv()}, icon(IC.table), 'Excel (CSV)'),
        h('button', {class: 'btn sm primary', type: 'button', onclick: () => UI.print()}, icon(IC.print), 'Yazdır / PDF')),
      h('p', {class: 'pnote'}, 'Ölçüler mm. Boy = desen (su) yönü. Kalın yazılan kesim ölçüsüdür' + (A.cab && A.cab.deduct ? ' (bant kalınlığı düşülmüş)' : '') + '; altında bitmiş ölçü görünür. Satıra dokununca parça 3B’de seçilir.'),
      h('div', {class: 'tot'},
        h('div', null, h('span', null, 'Toplam parça'), h('b', null, tot)),
        h('div', null, h('span', null, 'Toplam alan'), h('b', null, fmt2(area) + ' m²')),
        h('div', null, h('span', null, 'Levha (tahmini)'), h('b', null, sheets.reduce((a, n) => a + n.sheets.length, 0)), sheets.length > 1 ? h('small', {class: 'pnote'}, ' ' + sheets.map(n => n.sheets.length).join(' + ')) : null),
        ...bands.map(b => h('div', null, h('span', null, `Bant ${fmt(b.t)} mm`), h('b', null, `${fmt(b.m)} m`), h('small', {class: 'pnote'}, ` +%10 fire: ${fmt(b.m * 1.1)} m`)))));
    G.forEach((g, gi) => {
      const col = (FINISHES[g.m.color] || FINISHES.beyaz)[1], N = sheets[gi];
      const tb = h('tbody');
      for (const r of g.rows) {
        const refs = r.refs.map(x => x.cab + ':' + x.id).join(' ');
        const cabTxt = [...r.cabs.entries()].map(([nm, q]) => cabs.length > 1 || J.cabs.length > 1 ? `${nm}${r.cabs.size > 1 ? ' ×' + q : ''}` : '').filter(Boolean).join(', ');
        const diff = Math.abs(r.cL - r.L) > .05 || Math.abs(r.cW - r.Wd) > .05;
        tb.append(h('tr', {'data-refs': refs, class: A.sel && A.cab && r.refs.some(x => x.cab === A.cab.id && x.id === A.sel) ? 'on' : '', onclick: () => A.pickRef(r.refs)},
          h('td', {class: 'no'}, r.no),
          h('td', {class: r.off ? 'off' : ''}, r.name, r.ovr ? h('span', {class: 'badge', style: 'margin-left:6px'}, 'elle') : null, cabTxt ? h('span', {class: 'sub'}, cabTxt) : null),
          h('td', {class: 'num big' + (r.off ? ' off' : '')}, fmt(r.cL), diff && !r.ovr ? h('span', {class: 'sub'}, fmt(r.L)) : null),
          h('td', {class: 'num big' + (r.off ? ' off' : '')}, fmt(r.cW), diff && !r.ovr ? h('span', {class: 'sub'}, fmt(r.Wd)) : null),
          h('td', {class: 'num'}, r.n),
          h('td', null, h('div', {style: 'display:flex;align-items:center;gap:8px'}, UI.bandSVG(r), h('span', {class: 'btxt'}, UI.bandShort(r))))));
      }
      inner.append(h('section', {class: 'card mgrp'},
        h('div', {class: 'mgrp-h'}, h('i', {class: 'chipx', style: `background:${col}`}), h('b', null, g.label), h('small', null, `${g.count} parça · ${fmt2(g.area)} m² · ${N.sheets.length} levha (${g.m.L}×${g.m.W}${g.m.grain ? ', desenli' : ''})`)),
        N.bad.length ? h('div', {class: 'iss', style: 'margin:10px 16px 0'}, `Levhaya sığmayan parça: ${[...new Set(N.bad.map(b => b.no))].map(x => '#' + x).join(', ')} — levha ölçüsünü kontrol et ya da parçayı ek yerinden böl.`) : null,
        h('div', {class: 'tbl-w'}, h('table', {class: 'cl'}, h('thead', null, h('tr', null, h('th', null, 'No'), h('th', null, 'Parça'), h('th', {class: 'num'}, 'Boy'), h('th', {class: 'num'}, 'En'), h('th', {class: 'num'}, 'Adet'), h('th', null, 'Bant'))), tb))));
    });
    const hwl = hwTotals(cabs);
    if (hwl.length) inner.append(h('section', {class: 'card mgrp'}, h('div', {class: 'mgrp-h'}, h('b', null, 'Hırdavat listesi'), h('small', null, 'tüm adetler dahil')),
      h('div', {class: 'tbl-w'}, h('table', {class: 'cl'}, h('thead', null, h('tr', null, h('th', null, 'Malzeme'), h('th', null, 'Açıklama'), h('th', {class: 'num'}, 'Adet'))),
        h('tbody', null, hwl.map(x => h('tr', {style: 'cursor:default'}, h('td', null, x.n), h('td', {style: 'color:var(--muted)'}, x.note), h('td', {class: 'num big'}, x.q))))))));
    const chk = h('section', {class: 'card', style: 'padding:12px 16px;display:flex;flex-direction:column;gap:6px'}, h('b', null, 'Kontrol'));
    for (const c of cabs) { const R = calcCab(c); for (const w of [...R.check, ...R.warn]) chk.append(h('div', {class: 'iss ' + w.lvl}, `${c.name}: ${w.t}`)); }
    inner.append(chk);
    el.append(inner);
    el.scrollTop = sc;
  },

  /* ---------- levha planı ---------- */
  nest() {
    const el = $('#vnest'), J = A.job, cabs = UI.scopeCabs(), G = cutRows(J, cabs), sc = el.scrollTop;
    el.innerHTML = '';
    const inner = h('div', {class: 'pane-in'});
    const jn = (label, key) => { const inp = h('input', {class: 'inp', inputmode: 'decimal', value: fmt(J[key]), style: 'width:90px'}); inp.addEventListener('change', () => { const x = evalNum(inp.value); if (x >= 0 && x <= 50) A.change(() => { A.job[key] = x; }, {full: true}); else inp.value = fmt(J[key]); }); return h('label', {class: 'fld', style: 'flex-direction:row;align-items:center;gap:6px'}, h('span', null, label), h('div', {class: 'inpw'}, inp, h('i', null, 'mm'))); };
    inner.append(h('div', {class: 'ptool'}, h('h2', null, 'Levha planı'), UI.scopeSeg(() => UI.nest()), jn('Testere', 'kerf'), jn('Traş', 'trim'), h('button', {class: 'btn sm primary', type: 'button', onclick: () => UI.print()}, icon(IC.print), 'Yazdır')),
      h('p', {class: 'pnote'}, 'Giyotin (uçtan uca düz) kesime uygun yerleşim. Numaralar kesim listesindeki “No” sütunudur. ↻ işaretli parça levhada döndürülmüştür. Levha ölçüsü, desen ve paylar “Malzeme ve levha” bölümünden değişir.'));
    for (const g of G) {
      const N = nestGroup(g, J), col = (FINISHES[g.m.color] || FINISHES.beyaz)[1];
      const box = h('div', {class: 'sheets'});
      N.sheets.forEach((sh, i) => box.append(h('div', {class: 'sheet'}, h('div', {class: 'sheet-t'}, h('b', null, `Levha ${i + 1}`), h('span', null, `${sh.parts.length} parça · %${Math.round(sh.use * 100)} dolu`)),
        sheetSVG(N, sh, {onPick: p => A.pickRef(p.row.refs), sel: p => A.sel && A.cab && p.row.refs.some(x => x.cab === A.cab.id && x.id === A.sel)}))));
      inner.append(h('section', {class: 'card mgrp'},
        h('div', {class: 'mgrp-h'}, h('i', {class: 'chipx', style: `background:${col}`}), h('b', null, g.label), h('small', null, `${N.sheets.length} levha ${g.m.L}×${g.m.W} · ortalama doluluk %${Math.round(N.use * 100)}${g.m.grain ? ' · desenli: döndürme yok' : ''}`)),
        N.bad.length ? h('div', {class: 'iss', style: 'margin:10px 16px 0'}, `Sığmayan parça: ${[...new Set(N.bad.map(b => '#' + b.no))].join(', ')}`) : null,
        N.sheets.length ? box : h('p', {class: 'pnote', style: 'padding:14px 16px'}, 'Bu malzemede parça yok.')));
    }
    el.append(inner); el.scrollTop = sc;
  },

  /* ---------- yazdırma ---------- */
  print() {
    const J = A.job, cabs = UI.scopeCabs(), G = cutRows(J, cabs), P = $('#print');
    P.innerHTML = '';
    const d = new Date();
    P.append(h('h1', null, J.name + ' — Kesim listesi'), h('div', {class: 'meta'}, `${d.toLocaleDateString('tr-TR')} · ${cabs.length} dolap tipi, toplam ${cabs.reduce((a, c) => a + c.qty, 0)} dolap · ölçüler mm · Boy = desen yönü · kesim ölçüsü ${cabs.some(c => c.deduct) ? 'bant düşülmüş' : 'bant düşülmemiş'}`));
    const grid = h('div', {class: 'psheets'});
    for (const c of cabs) {
      const R = calcCab(c);
      grid.append(h('div', {class: 'psheet'}, h('b', null, `${c.name} × ${c.qty}`), h('div', null, `${fmt(c.W)} × ${fmt(c.H)} × ${fmt(c.D)} · gövde ${fmt(c.t)} · arkalık ${({groove: 'kanallı', nailed: 'çakma', inset: 'gömme', none: 'yok'})[c.back]} ${c.back !== 'none' ? fmt(c.backT) : ''} · ${({full: 'tam bindirme', half: 'yarım bindirme', inset: 'gömme'})[c.overlay]} kapak · bant ${fmt(c.bandBody)}/${fmt(c.bandFront)}`),
        frontSVG(c, R), R.warn.filter(w => w.lvl !== 'info').length ? h('div', {style: 'color:#b00'}, R.warn.filter(w => w.lvl !== 'info').map(w => '• ' + w.t).join(' ')) : null));
    }
    P.append(h('h2', null, 'Dolaplar (ön görünüş)'), grid);
    for (const g of G) {
      P.append(h('h2', null, `${g.label} — ${g.count} parça, ${fmt2(g.area)} m²`),
        h('table', null, h('thead', null, h('tr', null, ['No', 'Parça', 'Dolap', 'Boy (kesim)', 'En (kesim)', 'Adet', 'Bant', 'Bitmiş ölçü'].map((x, i) => h('th', {class: i >= 3 && i <= 5 ? 'num' : ''}, x)))),
          h('tbody', null, g.rows.filter(r => !r.off).map(r => h('tr', null, h('td', null, r.no), h('td', null, r.name + (r.ovr ? ' (elle)' : '')), h('td', null, [...r.cabs.keys()].join(', ')), h('td', {class: 'num big'}, fmt(r.cL)), h('td', {class: 'num big'}, fmt(r.cW)), h('td', {class: 'num big'}, r.n),
            h('td', null, h('div', {style: 'display:flex;gap:6px;align-items:center'}, UI.bandSVG(r), UI.bandShort(r))), h('td', null, `${fmt(r.L)} × ${fmt(r.Wd)} × ${fmt(r.T)}`))))));
    }
    const bands = bandTotals(G), hwl = hwTotals(cabs);
    P.append(h('h2', null, 'Kenar bandı ve hırdavat'),
      h('table', null, h('tbody', null, bands.map(b => h('tr', null, h('td', null, `Kenar bandı ${fmt(b.t)} mm`), h('td', null, 'bitmiş kenar uzunluğu'), h('td', {class: 'num big'}, `${fmt(b.m)} m (+%10: ${fmt(b.m * 1.1)} m)`))),
        hwl.map(x => h('tr', null, h('td', null, x.n), h('td', null, x.note), h('td', {class: 'num big'}, x.q))))));
    G.forEach((g, gi) => {
      const N = nestGroup(g, J); if (!N.sheets.length) return;
      P.append(h('h2', {class: gi === 0 ? 'pbreak' : ''}, `Levha planı — ${g.label} (${N.sheets.length} × ${g.m.L}×${g.m.W}, testere ${fmt(J.kerf)}, traş ${fmt(J.trim)})`),
        h('div', {class: 'psheets'}, N.sheets.map((sh, i) => h('div', {class: 'psheet'}, h('div', null, `Levha ${i + 1} · ${sh.parts.length} parça · %${Math.round(sh.use * 100)}`), sheetSVG(N, sh)))));
    });
    setTimeout(() => window.print(), 60);
  },
  csv() {
    const J = A.job, cabs = UI.scopeCabs(), G = cutRows(J, cabs);
    const q = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [['No', 'Malzeme', 'Kalınlık', 'Parça', 'Dolap', 'Kesim boy', 'Kesim en', 'Adet', 'Boy kenarı bant', 'En kenarı bant', 'Bant kalınlığı', 'Desenli', 'Bitmiş boy', 'Bitmiş en', 'Not'].join(';')];
    for (const g of G) for (const r of g.rows) if (!r.off) {
      const nL = r.bandL.filter(b => b > 0), nW = r.bandW.filter(b => b > 0);
      lines.push([r.no, g.m.label, fmt(g.T), r.name, [...r.cabs.keys()].join(', '), fmt(r.cL), fmt(r.cW), r.n, nL.length, nW.length, fmt(nL[0] || nW[0] || 0), g.m.grain ? 'evet' : 'hayır', fmt(r.L), fmt(r.Wd), r.ovr ? 'elle düzeltildi' : ''].map(q).join(';'));
    }
    download(fileSafe(J.name) + ' - kesim listesi.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV indirildi (Excel ile açılır)');
  },
};
