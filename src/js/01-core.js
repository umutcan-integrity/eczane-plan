'use strict';
/* =====================================================================
   Eczane Plan — sade 2B plan çizimi + 3B görüntüleme / gezinti
   Birimler metre. Plan: orijin dükkânın sol üst iç köşesi, x sağa, y aşağı.
   Eşya: merkez (cx, cy), w genişlik (yerel x), d derinlik (yerel y),
   h yükseklik, rot derece (ekranda saat yönü). Yerel +y = ön yüz.
   Oda: x, y sol üst köşe; w, d ölçüler. Odanın kenarları iç duvardır.
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;
const D2R = Math.PI / 180;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmtM = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const fmtCm = v => String(Math.round(v * 100));
const fmtA = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
function parseNum(s) {
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return isFinite(v) ? v : NaN;
}
const normRot = r => ((Math.round(r * 10) / 10) % 360 + 360) % 360;
const isMobile = () => matchMedia('(max-width:900px)').matches;
const isTyping = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };

const GRID = 0.05;          // ızgara ve yapışma adımı
const OUTER_T = 0.20;       // dış duvar kalınlığı
const INNER_T = 0.10;       // iç bölme duvar kalınlığı
const MIN_ITEM = 0.05;
const MIN_ROOM = 0.5;
const EYE = 1.60;           // göz hizası (3B gez)

const K_INDEX = 'eczplan.v2.index', K_PROJ = 'eczplan.v2.p.', K_SET = 'eczplan.v2.settings', K_V1 = 'eczanePlanMasasi.v1';

const ROOM_COLORS = ['#7C93B8', '#D9A441', '#5FA37A', '#9B7BB8', '#D97A6A', '#5FA8A0', '#C98BB0', '#B58A5C', '#9B9B9B'];
const ITEM_COLORS = ['#C9A47E', '#E9E1D3', '#F4F3EF', '#8FA8C0', '#6F8FAF', '#8FB3A0', '#B99470', '#6B7780', '#3E4A52', '#E07A5F', '#D4A5C3', '#E9C46A'];

const TYPES = {
  cabinet: {n: 'Dolap', solid: 1, color: '#C9A47E', front: 1},
  counter: {n: 'Banko', solid: 1, color: '#8FA8C0', front: 1, back: 1},
  table:   {n: 'Masa', solid: 1, color: '#B99470', front: 1, back: 1},
  column:  {n: 'Kolon', solid: 1, color: '#9AA0A6'},
  door:    {n: 'Kapı', opening: 1, color: '#A07D58'},
  window:  {n: 'Pencere', opening: 1, color: '#6FB3E6'},
  human:   {n: 'İnsan', color: '#E07A5F'},
  zone:    {n: 'Boşluk', color: '#3FA66B'},
};
const STYLES = {
  cabinet: [['closed', 'Kapaklı'], ['open', 'Açık raf'], ['drawer', 'Çekmeceli'], ['gondola', 'Gondol'], ['glass', 'Vitrin'], ['fridge', 'Buzdolabı']],
  table:   [['rect', 'Dikdörtgen'], ['round', 'Yuvarlak']],
  door:    [['single', 'Tek kanat'], ['double', 'Çift kanat'], ['sliding', 'Sürgülü']],
  human:   [['stand', 'Ayakta'], ['wheelchair', 'Tekerlekli sandalye']],
  zone:    [['rect', 'Şerit'], ['circle', 'Daire']],
};

/* Eklenebilir öğeler */
const CATALOG = [
  {g: 'Oda & yapı', list: [
    {k: 'room', n: 'Oda', sub: '3 × 3 m', room: {w: 3, d: 3}},
    {k: 'draw', n: 'Oda çiz', sub: 'sürükleyerek', tool: 'room'},
    {k: 'door', n: 'Kapı', sub: '90 cm', t: 'door', s: 'single', w: .9, d: .1, h: 2.1},
    {k: 'door2', n: 'Çift kapı', sub: '160 cm · giriş', t: 'door', s: 'double', w: 1.6, d: .2, h: 2.2},
    {k: 'window', n: 'Pencere', sub: '150 cm', t: 'window', w: 1.5, d: .1, h: 1.4, elev: .9},
    {k: 'column', n: 'Kolon', sub: '40 × 40', t: 'column', w: .4, d: .4, h: 0},
  ]},
  {g: 'Dolaplar', list: [
    {k: 'cab', n: 'Dolap', sub: '100 × 45', t: 'cabinet', s: 'closed', w: 1, d: .45, h: 2.2, clear: .9},
    {k: 'shelf', n: 'Açık raf', sub: '100 × 40', t: 'cabinet', s: 'open', w: 1, d: .4, h: 2.2, clear: .9},
    {k: 'drawer', n: 'Çekmeceli dolap', sub: '100 × 50', t: 'cabinet', s: 'drawer', w: 1, d: .5, h: 2.2, clear: 1},
    {k: 'gondola', n: 'Gondol', sub: '120 × 80 · orta', t: 'cabinet', s: 'gondola', w: 1.2, d: .8, h: 1.5, clear: .9, clearB: .9},
    {k: 'base', n: 'Alt dolap', sub: '100 × 60', t: 'cabinet', s: 'closed', w: 1, d: .6, h: .9, clear: .9},
    {k: 'glass', n: 'Vitrin', sub: '100 × 45', t: 'cabinet', s: 'glass', w: 1, d: .45, h: 1.9, clear: .9},
    {k: 'fridge', n: 'Buzdolabı', sub: '60 × 65', t: 'cabinet', s: 'fridge', w: .6, d: .65, h: 1.8, clear: .9},
  ]},
  {g: 'Banko & masa', list: [
    {k: 'counter', n: 'Banko', sub: '240 × 70', t: 'counter', w: 2.4, d: .7, h: 1.05, clear: 1.2, clearB: .9},
    {k: 'counter1', n: 'Banko modülü', sub: '120 × 70', t: 'counter', w: 1.2, d: .7, h: 1.05, clear: 1.2, clearB: .9},
    {k: 'counterLow', n: 'Alçak banko', sub: '90 × 70 · engelli', t: 'counter', w: .9, d: .7, h: .8, clear: 1.5, clearB: .9},
    {k: 'table', n: 'Masa', sub: '140 × 70', t: 'table', s: 'rect', w: 1.4, d: .7, h: .75, clear: .75, clearB: .75},
    {k: 'desk', n: 'Çalışma masası', sub: '120 × 60', t: 'table', s: 'rect', w: 1.2, d: .6, h: .75, clear: .9},
    {k: 'round', n: 'Yuvarlak masa', sub: 'Ø 80', t: 'table', s: 'round', w: .8, d: .8, h: .75},
  ]},
  {g: 'İnsan & boşluk', list: [
    {k: 'person', n: 'İnsan', sub: '175 cm', t: 'human', s: 'stand', w: .6, d: .4, h: 1.75},
    {k: 'wheel', n: 'Tekerlekli sandalye', sub: '70 × 120', t: 'human', s: 'wheelchair', w: .7, d: 1.2, h: 1.3},
    {k: 'pass90', n: 'Geçiş 90 cm', sub: 'tek kişi', t: 'zone', s: 'rect', w: .9, d: 2, h: 0},
    {k: 'pass120', n: 'Geçiş 120 cm', sub: 'iki kişi', t: 'zone', s: 'rect', w: 1.2, d: 2, h: 0},
    {k: 'turn', n: 'Dönüş alanı', sub: 'Ø 150 · sandalye', t: 'zone', s: 'circle', w: 1.5, d: 1.5, h: 0},
  ]},
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.flatMap(g => g.list).map(e => [e.k, e]));

/* Palet simgeleri (üstten görünüş) */
function palIcon(k) {
  const S = (inner) => `<svg viewBox="0 0 44 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
  const acc = 'var(--accent)';
  switch (k) {
    case 'room': return S(`<rect x="6" y="3" width="32" height="24" rx="1" stroke-width="2.6"/>`);
    case 'draw': return S(`<rect x="6" y="3" width="32" height="24" rx="1" stroke-dasharray="3 3"/><path d="M26 15l8 8m0-5v5h-5" stroke="${acc}" stroke-width="2"/>`);
    case 'door': return S(`<path d="M4 25h8M32 25h8" stroke-width="3"/><path d="M12 25V5" /><path d="M12 5a20 20 0 0120 20" stroke-dasharray="2 2"/>`);
    case 'door2': return S(`<path d="M2 25h6M36 25h6" stroke-width="3"/><path d="M8 25V11M36 25V11"/><path d="M8 11a14 14 0 0114 14a14 14 0 0114-14" stroke-dasharray="2 2"/>`);
    case 'window': return S(`<path d="M2 15h8M34 15h8" stroke-width="4"/><path d="M10 13h24M10 17h24" stroke="#5AA6DE"/><path d="M10 15h24" stroke="#5AA6DE" stroke-width=".8"/>`);
    case 'column': return S(`<rect x="15" y="8" width="14" height="14" fill="currentColor" fill-opacity=".25"/><path d="M15 8l14 14M29 8L15 22"/>`);
    case 'cab': return S(`<rect x="4" y="9" width="36" height="13" fill="#C9A47E" fill-opacity=".35"/><path d="M4 9l36 13M40 9L4 22"/><path d="M4 22h36" stroke-width="2.6"/>`);
    case 'shelf': return S(`<rect x="4" y="10" width="36" height="11" fill="#C9A47E" fill-opacity=".35"/><path d="M12 10v11M20 10v11M28 10v11M36 10v11" stroke-width="1"/><path d="M4 21h36" stroke-width="2.6"/>`);
    case 'drawer': return S(`<rect x="4" y="8" width="36" height="14" fill="#C9A47E" fill-opacity=".35"/><path d="M8 19h6M19 19h6M30 19h6" stroke-width="1.4"/><path d="M4 22h36" stroke-width="2.6"/>`);
    case 'gondola': return S(`<rect x="6" y="5" width="32" height="20" fill="#C9A47E" fill-opacity=".35"/><path d="M6 15h32"/><path d="M6 5h32M6 25h32" stroke-width="2.6"/>`);
    case 'base': return S(`<rect x="4" y="7" width="36" height="16" fill="#E9E1D3" fill-opacity=".6"/><path d="M4 23h36" stroke-width="2.6"/><path d="M22 7v16" stroke-width="1"/>`);
    case 'glass': return S(`<rect x="4" y="9" width="36" height="13" fill="#6FB3E6" fill-opacity=".25"/><path d="M4 22h36" stroke-width="2.6"/>`);
    case 'fridge': return S(`<rect x="13" y="5" width="18" height="20" fill="#F4F3EF" fill-opacity=".5"/><rect x="16" y="8" width="12" height="14" stroke-width="1"/><path d="M13 25h18" stroke-width="2.6"/>`);
    case 'counter': return S(`<rect x="2" y="9" width="40" height="13" rx="1" fill="#8FA8C0" fill-opacity=".4"/><path d="M2 22h40" stroke="${acc}" stroke-width="2.6"/><path d="M4 12h36" stroke-width="1"/>`);
    case 'counter1': return S(`<rect x="10" y="9" width="24" height="13" rx="1" fill="#8FA8C0" fill-opacity=".4"/><path d="M10 22h24" stroke="${acc}" stroke-width="2.6"/><path d="M12 12h20" stroke-width="1"/>`);
    case 'counterLow': return S(`<rect x="12" y="10" width="20" height="12" rx="1" fill="#8FA8C0" fill-opacity=".4"/><path d="M12 22h20" stroke="${acc}" stroke-width="2.6"/><circle cx="22" cy="16" r="3" stroke-width="1.2"/>`);
    case 'table': return S(`<rect x="5" y="8" width="34" height="15" rx="1.5" fill="#B99470" fill-opacity=".35"/>`);
    case 'desk': return S(`<rect x="7" y="7" width="30" height="13" rx="1.5" fill="#B99470" fill-opacity=".35"/><rect x="17" y="21" width="10" height="7" rx="3" stroke-width="1.2"/>`);
    case 'round': return S(`<circle cx="22" cy="15" r="11" fill="#B99470" fill-opacity=".35"/>`);
    case 'person': return S(`<ellipse cx="22" cy="16" rx="11" ry="6" fill="#E07A5F" fill-opacity=".35"/><circle cx="22" cy="15" r="4" fill="#E07A5F" fill-opacity=".8" stroke="none"/>`);
    case 'wheel': return S(`<rect x="14" y="4" width="16" height="22" rx="2" fill="#E07A5F" fill-opacity=".2"/><path d="M12 8v14M32 8v14" stroke-width="3"/><circle cx="22" cy="13" r="3.5" fill="#E07A5F" fill-opacity=".8" stroke="none"/>`);
    case 'pass90': return S(`<rect x="15" y="2" width="14" height="26" fill="#3FA66B" fill-opacity=".18" stroke="#3FA66B" stroke-dasharray="3 2"/><path d="M18 15h8M18 15l2-2M18 15l2 2M26 15l-2-2M26 15l-2 2" stroke="#3FA66B" stroke-width="1.2"/>`);
    case 'pass120': return S(`<rect x="11" y="2" width="22" height="26" fill="#3FA66B" fill-opacity=".18" stroke="#3FA66B" stroke-dasharray="3 2"/><path d="M14 15h16M14 15l2-2M14 15l2 2M30 15l-2-2M30 15l-2 2" stroke="#3FA66B" stroke-width="1.2"/>`);
    case 'turn': return S(`<circle cx="22" cy="15" r="12" fill="#3FA66B" fill-opacity=".18" stroke="#3FA66B" stroke-dasharray="3 2"/><path d="M16 15a6 6 0 1112 0" stroke="#3FA66B"/><path d="M28 15l2-3M28 15l-3-1" stroke="#3FA66B"/>`);
  }
  return S('');
}

/* Ölçü yorumu (insan geçişi) */
function gapComment(d) {
  if (d < 0.45) return {t: 'Kimse geçemez', c: 'bad'};
  if (d < 0.60) return {t: 'Yan dönerek zor geçilir', c: 'bad'};
  if (d < 0.90) return {t: 'Tek kişi geçer', c: 'warn'};
  if (d < 1.20) return {t: 'Tek kişi rahat · tekerlekli sandalye geçer', c: 'ok'};
  if (d < 1.50) return {t: 'İki kişi yan yana geçer', c: 'ok'};
  return {t: 'Geniş · tekerlekli sandalye dönebilir', c: 'ok'};
}

/* Renk yardımcıları */
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* Göreli zaman */
function relTime(t) {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'az önce';
  if (d < 3600) return Math.floor(d / 60) + ' dk önce';
  if (d < 86400) return Math.floor(d / 3600) + ' sa önce';
  if (d < 172800) return 'dün';
  return new Date(t).toLocaleDateString('tr-TR', {day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
}

/* Bildirim */
let toastTimer = 0;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + kind; }, kind === 'err' ? 3800 : 2000);
}

function download(name, blobOrUrl) {
  const a = document.createElement('a');
  a.download = name;
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function safeFile(s) { return (s || 'plan').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'plan'; }
