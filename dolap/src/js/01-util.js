'use strict';
/* =====================================================================
   Dolap Tasarımı — bağımsız uygulama (ana eczane planından ayrı)
   Tüm ölçüler milimetre (mm). Koordinat: x sağa (genişlik), y yukarı
   (yükseklik), z öne (derinlik); dolabın sol-arka-alt köşesi (0,0,0).
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const icon = (d, sw = 1.9) => { const s = sv('svg', {viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}); s.innerHTML = d; return s; };
const IC = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  down: '<path d="M12 4v12m0 0l-5-5m5 5l5-5"/><path d="M4 20h16"/>',
  up: '<path d="M12 16V4m0 0L7 9m5-5l5 5"/><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.1-1.5 2.2M12 17h.01"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  door: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M14.5 12h.01"/>',
  explode: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  front: '<rect x="5" y="4" width="14" height="16" rx="1"/>',
  side: '<path d="M8 4h8l3 3v13H8z"/>',
  top: '<rect x="4" y="7" width="16" height="10" rx="1"/><path d="M4 7l3-3h10l3 3"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/>',
};

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const clone = o => JSON.parse(JSON.stringify(o));
/* mm yazımı: ondalık virgül, binlik ayırıcı yok (2800 → "2800", 559.2 → "559,2") */
function fmt(v, d = 1) {
  if (v == null || !isFinite(v)) return '–';
  const x = Math.round(v * 10 ** d) / 10 ** d;
  return x.toLocaleString('tr-TR', {maximumFractionDigits: d, useGrouping: false});
}
const fmt2 = v => fmt(v, 2);
/* Girdi: "600", "559,5", "600-18*2" gibi basit hesaplar da kabul edilir */
function evalNum(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/[x×]/g, '*').replace(/−/g, '-');
  if (!s) return NaN;
  if (!/^[0-9+\-*/().]+$/.test(s)) return NaN;
  try { const v = Function('"use strict";return(' + s + ')')(); return typeof v === 'number' && isFinite(v) ? v : NaN; } catch (e) { return NaN; }
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (kind === 'err' ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 4200 : 2400);
}
function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], {type});
  const a = h('a', {href: URL.createObjectURL(blob), download: name}); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const fileSafe = s => String(s || 'dolap').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'dolap';

/* ---------- modal ---------- */
const Modal = {
  open({title, body, actions = [], wide = false, onClose}) {
    const d = $('#modal'); d.className = 'modal' + (wide ? ' wide' : ''); d.innerHTML = '';
    return new Promise(res => {
      let done = false;
      const close = v => { if (done) return; done = true; d.close(); onClose && onClose(v); res(v); };
      const head = h('div', {class: 'mhead'}, h('h3', null, title), h('button', {class: 'icon-btn sm', type: 'button', 'aria-label': 'Kapat', onclick: () => close(null)}, icon(IC.x)));
      const b = h('div', {class: 'mbody'}, body);
      const foot = actions.length ? h('div', {class: 'mfoot'}, actions.map(a => h('button', {type: 'button', class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), onclick: () => { const v = a.value !== undefined ? a.value : a.onClick ? a.onClick() : true; if (v !== false) close(v); }}, a.t))) : null;
      d.append(head, b, foot || '');
      d.onclose = () => close(null);
      d.onclick = e => { if (e.target === d) close(null); };
      d.showModal();
      const f = d.querySelector('input,select'); if (f) setTimeout(() => { f.focus(); f.select && f.select(); }, 30);
      Modal.close = close;
    });
  },
  close() {},
  confirm(text, okText = 'Tamam', danger = false) { return Modal.open({title: 'Emin misin?', body: h('p', null, text), actions: [{t: 'Vazgeç', value: false}, {t: okText, primary: !danger, danger, value: true}]}); },
  prompt(title, value = '', label = '') {
    const inp = h('input', {class: 'inp txt', value, maxlength: 80, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); Modal.close(inp.value.trim()); } }});
    return Modal.open({title, body: h('label', {class: 'fld'}, label && h('span', null, label), inp), actions: [{t: 'Vazgeç', value: null}, {t: 'Kaydet', primary: true, onClick: () => inp.value.trim()}]});
  },
};

/* ---------- açılır menü ---------- */
const Menu = {
  show(anchor, items) {
    const m = $('#menu'); m.innerHTML = '';
    for (const it of items) {
      if (it === '-') { m.append(h('hr')); continue; }
      if (it.el) { m.append(it.el); continue; }
      m.append(h('button', {type: 'button', onclick: () => { Menu.hide(); it.fn(); }}, it.ic ? icon(it.ic) : null, it.t));
    }
    m.hidden = false;
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = clamp(r.right - mw, 8, innerWidth - mw - 8) + 'px';
    m.style.top = (r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', Menu._out = e => { if (!m.contains(e.target)) Menu.hide(); }, {once: false}), 0);
  },
  hide() { $('#menu').hidden = true; if (Menu._out) document.removeEventListener('pointerdown', Menu._out); Menu._out = null; },
};
