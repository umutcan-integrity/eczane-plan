
/* =====================================================================
   DURUM, GEÇMİŞ, KAYIT
   ===================================================================== */
let state = defaultState();
const settings = {snap: true, grid: true, humanBadge: true, wheelMode: 'zoom'};
const history = {past: [], future: []};
let sel = null;                 // {type:'room'|'item', id}
let tool = 'select';
let clientId = Math.random().toString(36).slice(2, 10);
let remoteDoc = null, remoteReady = false, downloadsApi = null;
let saveTimer = null, savePending = false;

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const snapG = v => Math.round(v / GRID) * GRID;
const fmtM = v => (Math.round(v * 100) / 100).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmtA = v => (Math.round(v * 100) / 100).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' m²';
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('tr-TR', {maximumFractionDigits: 1});
const deg2rad = d => d * Math.PI / 180;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function snapshot() { return JSON.stringify({shop: state.shop, rooms: state.rooms, items: state.items, nextId: state.nextId}); }
function restore(json) {
  const d = JSON.parse(json);
  state.shop = d.shop; state.rooms = d.rooms; state.items = d.items; state.nextId = d.nextId;
  if (sel && !findSel()) sel = null;
}
let lastCommitted = snapshot();
function commit(label) {
  const now = snapshot();
  if (now === lastCommitted) return;
  history.past.push(lastCommitted);
  if (history.past.length > 120) history.past.shift();
  history.future.length = 0;
  lastCommitted = now;
  state.rev = (state.rev || 0) + 1;
  scheduleSave();
  updateUndoButtons();
  renderPanel(false);
  requestDraw();
}
function undo() {
  if (!history.past.length) return;
  history.future.push(lastCommitted);
  lastCommitted = history.past.pop();
  restore(lastCommitted); state.rev++; scheduleSave(); updateUndoButtons(); renderPanel(true); requestDraw(); toast('Geri alındı');
}
function redo() {
  if (!history.future.length) return;
  history.past.push(lastCommitted);
  lastCommitted = history.future.pop();
  restore(lastCommitted); state.rev++; scheduleSave(); updateUndoButtons(); renderPanel(true); requestDraw(); toast('Yinelendi');
}
function updateUndoButtons() { $('#btnUndo').disabled = !history.past.length; $('#btnRedo').disabled = !history.future.length; }

function validState(d) {
  if (!d || typeof d !== 'object' || !d.shop || !Array.isArray(d.rooms) || !Array.isArray(d.items)) return false;
  const num = v => typeof v === 'number' && isFinite(v);
  if (!num(d.shop.w) || !num(d.shop.h) || d.shop.w < 1 || d.shop.h < 1 || d.shop.w > 200 || d.shop.h > 200) return false;
  for (const r of d.rooms) if (!num(r.x) || !num(r.y) || !num(r.w) || !num(r.h) || r.w <= 0 || r.h <= 0) return false;
  for (const it of d.items) if (!num(it.x) || !num(it.y) || !num(it.w) || !num(it.h) || it.w <= 0 || it.h <= 0) return false;
  return true;
}
function sanitize(d) {
  const s = {v: 1, rev: +d.rev || 0, shop: {w: r2(d.shop.w), h: r2(d.shop.h), wall: num0(d.shop.wall, 0.1), name: String(d.shop.name || 'Eczanem').slice(0, 60)}, rooms: [], items: [], nextId: +d.nextId || 1};
  let maxId = 0;
  for (const r of d.rooms) s.rooms.push({id: String(r.id || 'r' + (++maxId)), name: String(r.name || 'Oda').slice(0, 60), x: r3(r.x), y: r3(r.y), w: r3(r.w), h: r3(r.h), color: /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : ROOM_COLORS[0], pin: ['tl','tr','bl','br'].includes(r.pin) ? r.pin : '', locked: !!r.locked});
  for (const it of d.items) s.items.push({id: String(it.id || 'i' + (++maxId)), key: LIB_BY_KEY[it.key] ? it.key : 'kolon', name: String(it.name || (LIB_BY_KEY[it.key] || {}).n || 'Eşya').slice(0, 60), x: r3(it.x), y: r3(it.y), w: r3(it.w), h: r3(it.h), rot: ((+it.rot || 0) % 360 + 360) % 360, flip: !!it.flip, locked: !!it.locked});
  const ids = new Set(); // id çakışmalarını temizle
  for (const o of [...s.rooms, ...s.items]) { while (ids.has(o.id)) o.id = o.id + '_'; ids.add(o.id); }
  const n = Math.max(s.nextId, s.rooms.length + s.items.length + 1);
  s.nextId = n;
  return s;
}
function num0(v, d) { return (typeof v === 'number' && isFinite(v) && v >= 0 && v < 1) ? v : d; }

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!validState(d)) return false;
    state = sanitize(d);
    for (const r of state.rooms) {
      if (/\bwc\b|tuvalet|lavabo/i.test(r.name) && r.pin === 'tr') {
        r.pin = '';
      }
    }
    return true;
  } catch (e) { return false; }
}
function scheduleSave() {
  savePending = true; setSaveStatus('pending');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 450);
}
async function doSave() {
  savePending = false;
  const payload = {v: 1, rev: state.rev, shop: state.shop, rooms: state.rooms, items: state.items, nextId: state.nextId};
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
  if (remoteDoc) {
    try { await remoteDoc.set({rev: state.rev, clientId, updatedAt: new Date().toISOString(), state: payload}); setSaveStatus('cloud'); return; }
    catch (e) { setSaveStatus('local'); return; }
  }
  setSaveStatus('local');
}
function setSaveStatus(kind) {
  const dot = $('#saveDot'), t = $('#saveText');
  dot.classList.toggle('pending', kind === 'pending');
  t.textContent = kind === 'pending' ? 'Kaydediliyor…' : kind === 'cloud' ? 'Kaydedildi (bulut)' : 'Kaydedildi (bu tarayıcı)';
}
async function initRemote() {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  try {
    const db = await window.claude.use('db');
    if (db) {
      remoteDoc = db.doc('plan/current');
      remoteDoc.onSnapshot(snap => {
        remoteReady = true;
        if (!snap.exists) return;
        const d = snap.data();
        if (!d || d.clientId === clientId) return;
        if (!(d.rev > (state.rev || 0))) return;
        if (!validState(d.state)) return;
        state = sanitize(d.state); state.rev = d.rev;
        lastCommitted = snapshot(); history.past.length = 0; history.future.length = 0;
        if (sel && !findSel()) sel = null;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d.state)); } catch (e) {}
        updateUndoButtons(); renderPanel(true); requestDraw(); toast('Başka bir cihazdan gelen plan yüklendi');
      }, () => {});
    }
  } catch (e) {}
  try { downloadsApi = await window.claude.use('downloads'); } catch (e) {}
}

/* =====================================================================
   GÖRÜNÜM (metre → piksel)
   ===================================================================== */
const canvas = $('#plan'); let ctx = canvas.getContext('2d');
const stage = $('#stage');
let view = {s: 60, ox: 40, oy: 40};
let cw = 0, ch = 0, dpr = 1;
const w2sx = x => x * view.s + view.ox, w2sy = y => y * view.s + view.oy;
const s2wx = px => (px - view.ox) / view.s, s2wy = py => (py - view.oy) / view.s;

let autoFit = true;
function resize() {
  const r = stage.getBoundingClientRect();
  const ocw = cw, och = ch;
  cw = Math.max(50, r.width); ch = Math.max(50, r.height);
  dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  if (autoFit) fit();
  else if (ocw && och) { view.ox += (cw - ocw) / 2; view.oy += (ch - och) / 2; } // merkez sabit kalsın
  requestDraw();
}
function fit() {
  autoFit = true;
  const pad = 46;
  const s = Math.min((cw - pad * 2) / state.shop.w, (ch - pad * 2 - 20) / state.shop.h);
  view.s = clamp(s, 5, 800);
  view.ox = (cw - state.shop.w * view.s) / 2;
  view.oy = (ch - state.shop.h * view.s) / 2 + 8;
  requestDraw();
}
function zoomAt(factor, px, py) {
  autoFit = false;
  const ns = clamp(view.s * factor, 5, 800);
  const wx = s2wx(px), wy = s2wy(py);
  view.s = ns;
  view.ox = px - wx * ns; view.oy = py - wy * ns;
  requestDraw();
}
function canvasPos(e) { const r = canvas.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }

/* =====================================================================
   GEOMETRİ
   ===================================================================== */
const findSel = () => sel ? (sel.type === 'room' ? state.rooms.find(r => r.id === sel.id) : state.items.find(i => i.id === sel.id)) : null;
const roomById = id => state.rooms.find(r => r.id === id);
const itemCenter = it => ({x: it.x + it.w / 2, y: it.y + it.h / 2});
function toLocal(it, wx, wy) {
  const c = itemCenter(it), t = deg2rad(it.rot || 0), dx = wx - c.x, dy = wy - c.y;
  return {x: dx * Math.cos(t) + dy * Math.sin(t), y: -dx * Math.sin(t) + dy * Math.cos(t)};
}
function toWorld(it, lx, ly) {
  const c = itemCenter(it), t = deg2rad(it.rot || 0);
  return {x: c.x + lx * Math.cos(t) - ly * Math.sin(t), y: c.y + lx * Math.sin(t) + ly * Math.cos(t)};
}
function itemAABB(it) {
  const c = itemCenter(it), t = deg2rad(it.rot || 0);
  const hx = Math.abs(it.w / 2 * Math.cos(t)) + Math.abs(it.h / 2 * Math.sin(t));
  const hy = Math.abs(it.w / 2 * Math.sin(t)) + Math.abs(it.h / 2 * Math.cos(t));
  return {x: c.x - hx, y: c.y - hy, w: hx * 2, h: hy * 2};
}
function pointInItem(it, wx, wy, padM = 0) {
  const l = toLocal(it, wx, wy);
  return Math.abs(l.x) <= it.w / 2 + padM && Math.abs(l.y) <= it.h / 2 + padM;
}
const pointInRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const overlap = (a, b, eps = 0.001) => a.x + eps < b.x + b.w && b.x + eps < a.x + a.w && a.y + eps < b.y + b.h && b.y + eps < a.y + a.h;
const area = r => r.w * r.h;
function roomOverlaps(r) { return state.rooms.some(o => o !== r && overlap(o, r)); }
function roomContaining(wx, wy) { return state.rooms.find(r => pointInRect(r, wx, wy)) || null; }
function itemAt(wx, wy, padM) {
  // küçük eşya üstte: alanı küçük olanı önce dene
  const sorted = [...state.items].sort((a, b) => area(a) - area(b));
  for (const it of sorted) if (pointInItem(it, wx, wy, padM)) return it;
  return null;
}
function itemsInRoom(r) { return state.items.filter(it => { const c = itemCenter(it); return pointInRect(r, c.x, c.y); }); }

/* Tutamaçlar: hx,hy ∈ {-1,0,1} */
const HANDLES = [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
function handlePositions(obj, type) {
  // ekran koordinatları
  const out = [];
  if (type === 'room') {
    for (const [hx, hy] of HANDLES) {
      if (!roomHandleAllowed(obj, hx, hy)) continue;
      out.push({hx, hy, px: w2sx(obj.x + (hx + 1) / 2 * obj.w), py: w2sy(obj.y + (hy + 1) / 2 * obj.h)});
    }
  } else {
    for (const [hx, hy] of HANDLES) {
      const p = toWorld(obj, hx * obj.w / 2, hy * obj.h / 2);
      out.push({hx, hy, px: w2sx(p.x), py: w2sy(p.y)});
    }
    const rp = toWorld(obj, 0, -obj.h / 2 - 26 / view.s);
    out.push({rot: true, px: w2sx(rp.x), py: w2sy(rp.y)});
  }
  return out;
}
function roomHandleAllowed(r, hx, hy) {
  if (r.locked) return false;
  if (r.pin === 'tr') return hx === -1 || hy === 1 || (hx === 0 && hy === 1) || (hx === -1 && hy === 0);
  if (r.pin === 'tl') return hx === 1 || hy === 1;
  if (r.pin === 'br') return hx === -1 || hy === -1;
  if (r.pin === 'bl') return hx === 1 || hy === -1;
  return true;
}
function handleAt(px, py, radius) {
  const o = findSel(); if (!o || o.locked) return null;
  let best = null, bd = radius; // en yakın tutamaç (düşük zoom'da üst üste binerler)
  for (const h of handlePositions(o, sel.type)) { const d = Math.hypot(h.px - px, h.py - py); if (d <= bd) { bd = d; best = h; } }
  return best;
}
function applyPin(r) {
  if (r.pin === 'tr') { r.x = state.shop.w - r.w; r.y = 0; }
  else if (r.pin === 'tl') { r.x = 0; r.y = 0; }
  else if (r.pin === 'br') { r.x = state.shop.w - r.w; r.y = state.shop.h - r.h; }
  else if (r.pin === 'bl') { r.x = 0; r.y = state.shop.h - r.h; }
}
function clampRoom(r) {
  r.w = clamp(r.w, MIN_ROOM, state.shop.w); r.h = clamp(r.h, MIN_ROOM, state.shop.h);
  r.x = clamp(r.x, 0, state.shop.w - r.w); r.y = clamp(r.y, 0, state.shop.h - r.h);
  applyPin(r);
  r.x = r3(r.x); r.y = r3(r.y); r.w = r3(r.w); r.h = r3(r.h);
}
function clampItem(it) {
  const bb = itemAABB(it);
  let dx = 0, dy = 0;
  if (bb.w <= state.shop.w) { if (bb.x < 0) dx = -bb.x; else if (bb.x + bb.w > state.shop.w) dx = state.shop.w - bb.x - bb.w; }
  if (bb.h <= state.shop.h) { if (bb.y < 0) dy = -bb.y; else if (bb.y + bb.h > state.shop.h) dy = state.shop.h - bb.y - bb.h; }
  it.x = r3(it.x + dx); it.y = r3(it.y + dy);
}

/* =====================================================================
   YAPIŞMA (SNAP)
   ===================================================================== */
let guides = [];
function snapTargets(exclude) {
  const xs = [0, state.shop.w], ys = [0, state.shop.h];
  for (const r of state.rooms) { if (r === exclude) continue; xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); }
  return {xs, ys};
}
function bestSnap(edges, targets, thr) {
  // edges: [{v, off}] — v mevcut kenar değeri, off: hedef − v uygulanınca x değişimi
  let best = null;
  for (const e of edges) for (const t of targets) {
    const d = t - e.v;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, t};
  }
  return best;
}
function snapMoveRect(rect, exclude, allowGrid = true) {
  guides = [];
  if (!settings.snap) return rect;
  const thr = Math.max(0.02, 8 / view.s);
  const {xs, ys} = snapTargets(exclude);
  let x = rect.x, y = rect.y;
  const bx = bestSnap([{v: rect.x}, {v: rect.x + rect.w}], xs, thr);
  const by = bestSnap([{v: rect.y}, {v: rect.y + rect.h}], ys, thr);
  if (bx) { x = rect.x + bx.d; guides.push({axis: 'x', v: bx.t}); } else if (allowGrid) x = snapG(rect.x);
  if (by) { y = rect.y + by.d; guides.push({axis: 'y', v: by.t}); } else if (allowGrid) y = snapG(rect.y);
  return {x, y};
}
function snapValue(v, targets, allowGrid = true) {
  if (!settings.snap) return v;
  const thr = Math.max(0.02, 8 / view.s);
  const b = bestSnap([{v}], targets, thr);
  if (b) return b.t;
  return allowGrid ? snapG(v) : v;
}

/* =====================================================================
   ÇİZİM
   ===================================================================== */
let drawQueued = false;
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
let TK = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  TK = {paper: g('--paper'), ink: g('--ink'), muted: g('--muted'), faint: g('--faint'), accent: g('--accent'), accentSoft: g('--accent-soft'), line: g('--line'), lineStrong: g('--line-strong'), gridMinor: g('--grid-minor'), gridMajor: g('--grid-major'), gridMeter: g('--grid-meter'), wall: g('--wall'), wallHatch: g('--wall-hatch'), danger: g('--danger'), warn: g('--warn'), surface: g('--surface')};
  if (typeof exporting !== 'undefined' && exporting) Object.assign(TK, LIGHT_TK);
  TK.dark = isDark();
  TK.furnFill = TK.dark ? '#2B322F' : '#FBFAF4';
  TK.furnStroke = TK.dark ? '#C4CEC7' : '#3E4744';
  TK.glass = TK.dark ? 'rgba(120,180,220,.25)' : 'rgba(120,170,220,.25)';
}
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true; if (t === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
const FONT = (w, px, mono) => `${w} ${px}px ${mono ? "'IBM Plex Mono',ui-monospace,Menlo,monospace" : "'Archivo',system-ui,sans-serif"}`;

let drag = null, rulerLine = null, pointerWorld = null, hoverId = null;

function draw() {
  readTokens();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = TK.paper; ctx.fillRect(0, 0, cw, ch);
  const S = state.shop, s = view.s;
  const X0 = w2sx(0), Y0 = w2sy(0), X1 = w2sx(S.w), Y1 = w2sy(S.h);

  // --- ızgara (dükkân içi)
  if (settings.grid) {
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
    const step = s >= 34 ? 0.1 : s >= 14 ? 0.5 : 1;
    ctx.lineWidth = 1;
    for (let x = 0; x <= S.w + 1e-9; x = r3(x + step)) {
      const px = Math.round(w2sx(x)) + 0.5;
      const isM = Math.abs(x - Math.round(x)) < 1e-6, isH = Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;
      ctx.strokeStyle = isM ? TK.gridMeter : isH ? TK.gridMajor : TK.gridMinor;
      ctx.beginPath(); ctx.moveTo(px, Y0); ctx.lineTo(px, Y1); ctx.stroke();
    }
    for (let y = 0; y <= S.h + 1e-9; y = r3(y + step)) {
      const py = Math.round(w2sy(y)) + 0.5;
      const isM = Math.abs(y - Math.round(y)) < 1e-6, isH = Math.abs(y * 2 - Math.round(y * 2)) < 1e-6;
      ctx.strokeStyle = isM ? TK.gridMeter : isH ? TK.gridMajor : TK.gridMinor;
      ctx.beginPath(); ctx.moveTo(X0, py); ctx.lineTo(X1, py); ctx.stroke();
    }
    ctx.restore();
  }

  // --- odalar
  const overlapping = new Set();
  for (let i = 0; i < state.rooms.length; i++) for (let j = i + 1; j < state.rooms.length; j++)
    if (overlap(state.rooms[i], state.rooms[j])) { overlapping.add(state.rooms[i].id); overlapping.add(state.rooms[j].id); }
  for (const r of state.rooms) drawRoom(r, overlapping.has(r.id));

  // --- dış duvar
  const T = 0.25 * s; // dış duvar kalınlığı (çizim)
  ctx.save();
  ctx.fillStyle = TK.wall;
  ctx.beginPath(); ctx.rect(X0 - T, Y0 - T, (X1 - X0) + 2 * T, (Y1 - Y0) + 2 * T); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.fill('evenodd');
  ctx.restore();

  // --- eşyalar (büyükten küçüğe → küçükler üstte)
  const items = [...state.items].sort((a, b) => area(b) - area(a));
  for (const it of items) drawItem(it);

  // --- oda etiketleri (eşyaların üstünde okunur kalsın)
  for (const r of state.rooms) drawRoomLabel(r, overlapping.has(r.id));

  // --- metre cetvelleri
  drawRulers(X0, Y0, X1, Y1);

  // --- kılavuzlar
  if (guides.length) {
    ctx.save(); ctx.strokeStyle = TK.accent; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
    for (const g of guides) {
      ctx.beginPath();
      if (g.axis === 'x') { const px = Math.round(w2sx(g.v)) + 0.5; ctx.moveTo(px, Y0 - T); ctx.lineTo(px, Y1 + T); }
      else { const py = Math.round(w2sy(g.v)) + 0.5; ctx.moveTo(X0 - T, py); ctx.lineTo(X1 + T, py); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- oda çizme önizleme
  if (drag && drag.kind === 'draw-room' && drag.rect) {
    const r = drag.rect;
    ctx.save(); ctx.fillStyle = hexA(TK.accent, .15); ctx.strokeStyle = TK.accent; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.fillRect(w2sx(r.x), w2sy(r.y), r.w * s, r.h * s); ctx.strokeRect(w2sx(r.x), w2sy(r.y), r.w * s, r.h * s); ctx.restore();
    drawBadge(w2sx(r.x + r.w) + 12, w2sy(r.y + r.h) + 12, `${fmtM(r.w)} × ${fmtM(r.h)} m · ${fmtA(r.w * r.h)}`);
  }

  // --- seçim
  const so = findSel();
  if (so) drawSelection(so);

  // --- cetvel
  if (rulerLine) drawRulerLine(rulerLine);

  // --- sürükleme rozeti
  if (drag && drag.badge) drawBadge(drag.badge.px, drag.badge.py, drag.badge.text, drag.badge.sub);

  drawScaleBar();
  updateStatus();
}

function drawRoom(r, bad) {
  const s = view.s, px = w2sx(r.x), py = w2sy(r.y), pw = r.w * s, ph = r.h * s;
  ctx.save();
  ctx.fillStyle = hexA(r.color, TK.dark ? .22 : .18);
  ctx.fillRect(px, py, pw, ph);
  // bölme duvarı: sınır çizgisi üzerine ortalanmış kalınlık
  const t = Math.max(2, state.shop.wall * s);
  ctx.strokeStyle = bad ? TK.danger : TK.wall; ctx.lineWidth = t;
  ctx.strokeRect(px, py, pw, ph);
  if (bad) {
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    ctx.strokeStyle = hexA(TK.danger.startsWith('#') ? TK.danger : '#C2412D', .35); ctx.lineWidth = 1;
    for (let d = -ph; d < pw; d += 10) { ctx.beginPath(); ctx.moveTo(px + d, py); ctx.lineTo(px + d + ph, py + ph); ctx.stroke(); }
  }
  ctx.restore();
}
function drawRoomLabel(r, bad) {
  const s = view.s, pw = r.w * s, ph = r.h * s, cx = w2sx(r.x + r.w / 2), cy = w2sy(r.y + r.h / 2);
  if (pw < 28 || ph < 16) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let nameSize = 13; ctx.font = FONT(700, nameSize);
  while (ctx.measureText(r.name).width > pw - 10 && nameSize > 9) { nameSize--; ctx.font = FONT(700, nameSize); }
  const lines = [{t: r.name, f: FONT(700, nameSize), c: TK.ink}];
  if (ph > 46 && pw > 70) lines.push({t: `${fmtM(r.w)} × ${fmtM(r.h)} m`, f: FONT(500, 11, true), c: TK.muted});
  if (ph > 34 && pw > 56) lines.push({t: fmtA(r.w * r.h), f: FONT(600, 12, true), c: bad ? TK.danger : TK.ink});
  const lh = 15, total = lines.length * lh;
  // arka plan plakası
  let maxW = 0; for (const l of lines) { ctx.font = l.f; maxW = Math.max(maxW, ctx.measureText(l.t).width); }
  ctx.fillStyle = hexA(TK.dark ? '#141817' : '#FFFFFF', .72);
  roundRect(cx - maxW / 2 - 6, cy - total / 2 - 3, maxW + 12, total + 6, 5); ctx.fill();
  lines.forEach((l, i) => { ctx.font = l.f; ctx.fillStyle = l.c; ctx.fillText(l.t, cx, cy - total / 2 + lh * i + lh / 2); });
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawItem(it) {
  const s = view.s, c = itemCenter(it), d = LIB_BY_KEY[it.key] || {s: 'rect'};
  ctx.save();
  ctx.translate(w2sx(c.x), w2sy(c.y)); ctx.rotate(deg2rad(it.rot || 0));
  if (it.flip) ctx.scale(-1, 1);
  drawShape(ctx, d.s, it.w * s, it.h * s, {tk: TK, w: it.w, h: it.h, sel: sel && sel.type === 'item' && sel.id === it.id});
  ctx.restore();
  if (DOOR_SHAPES.has(d.s) || d.s === 'window') { // dış duvara oturan kapı/cam: dış duvarı kes
    const bb = itemAABB(it), T = 0.25, S = state.shop, e = 0.02, isWin = d.s === 'window';
    const cut = (x, y, w, h) => { ctx.save(); ctx.fillStyle = TK.paper; ctx.fillRect(w2sx(x), w2sy(y), w * s, h * s); if (isWin) { ctx.fillStyle = TK.glass; ctx.fillRect(w2sx(x), w2sy(y), w * s, h * s); ctx.strokeStyle = TK.furnStroke; ctx.lineWidth = 1; ctx.strokeRect(w2sx(x), w2sy(y), w * s, h * s); } ctx.restore(); };
    if (bb.x < e) cut(-T, bb.y, T, bb.h); if (bb.x + bb.w > S.w - e) cut(S.w, bb.y, T, bb.h);
    if (bb.y < e) cut(bb.x, -T, bb.w, T); if (bb.y + bb.h > S.h - e) cut(bb.x, S.h, bb.w, T);
  }
  // etiket (ekran uzayında, düz)
  const bb = itemAABB(it), bw = bb.w * s, bh = bb.h * s;
  if (d.s === 'strip' || d.s === 'circle') {
    ctx.save(); ctx.font = FONT(600, 11, true); ctx.fillStyle = TK.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const t = d.s === 'circle' ? 'Ø ' + fmtM(it.w) + ' m' : fmtM(Math.min(it.w, it.h)) + ' m';
    if (bw > 40) ctx.fillText(t, w2sx(c.x), w2sy(c.y)); ctx.restore();
    return;
  }
  if (bw < 34 || bh < 14 || ['door', 'door2', 'slider', 'window', 'wall', 'column', 'human', 'human_walk', 'human2', 'pos', 'screen'].includes(d.s)) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 11; ctx.font = FONT(500, size);
  let t = it.name;
  if (ctx.measureText(t).width > bw - 6) { size = 10; ctx.font = FONT(500, size); }
  if (ctx.measureText(t).width > bw - 6) { t = shortName(it.name); }
  while (ctx.measureText(t).width > bw - 4 && t.length > 3) t = t.slice(0, -2) + '…';
  if (t.length <= 3 && ctx.measureText(t).width > bw - 4) { ctx.restore(); return; }
  ctx.fillStyle = TK.ink; ctx.globalAlpha = .9;
  ctx.fillText(t, w2sx(c.x), w2sy(c.y));
  ctx.restore();
}
function shortName(n) { return n.replace(/\s*\(.*?\)\s*/g, '').split(/[\/,]/)[0].trim(); }

/* Şekil çizimi: piksel uzayında, merkez orijinde, W×H */
function drawShape(g, shape, W, H, o) {
  const tk = o.tk, fill = tk.furnFill, stroke = tk.furnStroke;
  const x = -W / 2, y = -H / 2;
  g.lineWidth = 1.2; g.lineJoin = 'round';
  const rect = (rx = x, ry = y, rw = W, rh = H, rad = 0) => { if (rad) { rr(g, rx, ry, rw, rh, rad); } else { g.beginPath(); g.rect(rx, ry, rw, rh); } };
  const fs = () => { g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.stroke(); };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  switch (shape) {
    case 'counter': { rect(); fs(); g.strokeStyle = stroke; line(x + 3, y + H * .78, x + W - 3, y + H * .78); g.setLineDash([3, 3]); line(x, y + H + 4, x + W, y + H + 4); g.setLineDash([]); break; }
    case 'pos': { rect(x, y, W, H, 3); fs(); g.fillStyle = stroke; g.fillRect(x + W * .15, y + H * .2, W * .7, H * .35); break; }
    case 'shelf': { rect(); fs(); g.strokeStyle = stroke; const n = Math.max(1, Math.round(o.w / 0.25)); for (let i = 1; i < n; i++) line(x + W * i / n, y, x + W * i / n, y + H); g.lineWidth = 2; line(x, y + H * .72, x + W, y + H * .72); g.lineWidth = 1.2; break; }
    case 'drawer': { rect(); fs(); const cols = Math.max(1, Math.round(o.w / 0.33)), rows = 2; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.beginPath(); g.rect(x + 2 + i * (W - 4) / cols, y + 2 + j * (H - 4) / rows, (W - 4) / cols - 1.5, (H - 4) / rows - 1.5); g.strokeStyle = stroke; g.globalAlpha = .6; g.stroke(); g.globalAlpha = 1; } break; }
    case 'gondola': { rect(); fs(); line(x, 0, x + W, 0); const n = Math.max(1, Math.round(o.w / 0.6)); for (let i = 1; i < n; i++) line(x + W * i / n, y, x + W * i / n, y + H); break; }
    case 'gondola1': { rect(); fs(); line(x, y + H * .35, x + W, y + H * .35); const n = Math.max(1, Math.round(o.w / 0.6)); for (let i = 1; i < n; i++) line(x + W * i / n, y, x + W * i / n, y + H); break; }
    case 'showcase': { rect(); fs(); g.fillStyle = tk.glass; g.fillRect(x + 2, y + 2, W - 4, H - 4); g.strokeStyle = stroke; g.strokeRect(x + 3, y + 3, W - 6, H - 6); break; }
    case 'fridge': { rect(x, y, W, H, 2); fs(); line(x + W * .1, y + H * .85, x + W * .9, y + H * .85); g.fillStyle = stroke; g.fillRect(x + W * .12, y + H * .88, W * .18, 2); if (W > 22) { g.font = `${Math.min(12, H * .35)}px system-ui`; g.fillStyle = stroke; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❄', 0, -H * .1); } break; }
    case 'bench': { rect(x, y, W, H, 3); fs(); const n = Math.max(1, Math.round(o.w / 0.6)); for (let i = 1; i < n; i++) line(x + W * i / n, y + 2, x + W * i / n, y + H - 2); g.lineWidth = 2.5; line(x + 1, y + H * .18, x + W - 1, y + H * .18); break; }
    case 'table': { rect(x, y, W, H, Math.min(6, H * .2)); fs(); break; }
    case 'chair': { rect(x, y + H * .2, W, H * .8, 3); fs(); g.lineWidth = 2.5; line(x + 1, y + H * .12, x + W - 1, y + H * .12); break; }
    case 'sink': { rect(x, y, W, H, 3); fs(); g.beginPath(); g.ellipse(0, H * .06, W * .34, H * .3, 0, 0, Math.PI * 2); g.strokeStyle = stroke; g.stroke(); g.fillStyle = stroke; g.beginPath(); g.arc(0, y + H * .18, Math.max(1.5, W * .05), 0, Math.PI * 2); g.fill(); break; }
    case 'safe': { rect(); fs(); g.beginPath(); g.arc(0, 0, Math.min(W, H) * .22, 0, Math.PI * 2); g.stroke(); line(0, 0, 0, -Math.min(W, H) * .22); break; }
    case 'cabinet': { rect(); fs(); line(0, y, 0, y + H); g.fillStyle = stroke; g.fillRect(-W * .06 - 1.5, H * .1, 1.5, H * .18); g.fillRect(W * .06, H * .1, 1.5, H * .18); break; }
    case 'rack': { rect(); fs(); g.globalAlpha = .55; line(x, y, x + W, y + H); line(x + W, y, x, y + H); g.globalAlpha = 1; const n = Math.max(1, Math.round(o.w / 0.5)); for (let i = 1; i < n; i++) line(x + W * i / n, y, x + W * i / n, y + H); break; }
    case 'zone': { g.setLineDash([4, 3]); rect(); g.fillStyle = hexA(tk.warn.startsWith('#') ? tk.warn : '#A8690F', .12); g.fill(); g.strokeStyle = tk.warn; g.stroke(); g.setLineDash([]); break; }
    case 'appliance': { rect(x, y, W, H, 2); fs(); const r = Math.min(W, H) * .18; for (const [dx, dy] of [[-.25, -.22], [.25, -.22], [-.25, .22], [.25, .22]]) { g.beginPath(); g.arc(W * dx, H * dy, r, 0, Math.PI * 2); g.stroke(); } break; }
    case 'stretcher': { rect(x, y, W, H, 4); fs(); rr(g, x + 4, y + H * .15, Math.min(W * .16, 22), H * .7, 3); g.strokeStyle = stroke; g.stroke(); g.setLineDash([2, 3]); line(x + W * .3, y + 3, x + W * .3, y + H - 3); g.setLineDash([]); break; }
    case 'screen': { g.lineWidth = Math.max(2, H); g.strokeStyle = stroke; g.beginPath(); const n = 4; for (let i = 0; i <= n; i++) { const px = x + W * i / n, py = (i % 2 ? -1 : 1) * Math.max(2, H); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); break; }
    case 'bin': { g.beginPath(); g.arc(0, 0, Math.min(W, H) / 2, 0, Math.PI * 2); fs(); g.fillStyle = tk.danger; g.beginPath(); g.arc(0, 0, Math.min(W, H) * .18, 0, Math.PI * 2); g.fill(); break; }
    case 'toilet': { rect(x, y, W, H * .28, 2); fs(); g.beginPath(); g.ellipse(0, y + H * .28 + H * .36, W * .42, H * .34, 0, 0, Math.PI * 2); fs(); g.beginPath(); g.ellipse(0, y + H * .28 + H * .36, W * .26, H * .22, 0, 0, Math.PI * 2); g.stroke(); break; }
    case 'door': case 'door2': case 'slider': {
      // kapı boşluğu
      g.fillStyle = tk.paper; g.fillRect(x, y - 1, W, H + 2);
      g.strokeStyle = stroke; g.lineWidth = 1.5;
      if (shape === 'slider') { g.setLineDash([]); line(x, y + H / 2, x + W, y + H / 2); g.lineWidth = 3; line(x + W * .05, y - H * .4, x + W * .55, y - H * .4); g.lineWidth = 1; g.setLineDash([3, 2]); line(x + W * .5, y - H * .4, x + W * 1.0, y - H * .4); g.setLineDash([]); break; }
      const leaves = shape === 'door2' ? 2 : 1, L = W / leaves;
      for (let k = 0; k < leaves; k++) {
        const hx = k === 0 ? x : x + W, dir = k === 0 ? 1 : -1; // menteşe
        g.beginPath(); g.moveTo(hx, y); g.arc(hx, y, L, dir === 1 ? -Math.PI / 2 : -Math.PI, dir === 1 ? 0 : -Math.PI / 2, dir === -1); g.closePath();
        g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .08); g.fill();
        g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.arc(hx, y, L, dir === 1 ? -Math.PI / 2 : -Math.PI, dir === 1 ? 0 : -Math.PI / 2, dir === -1); g.stroke(); g.setLineDash([]);
        g.lineWidth = 3; line(hx, y, hx, y - L);
      }
      break;
    }
    case 'window': { g.fillStyle = tk.paper; g.fillRect(x, y - 1, W, H + 2); g.fillStyle = tk.glass; g.fillRect(x, y + H * .3, W, H * .4); g.strokeStyle = stroke; g.lineWidth = 1; line(x, y + H * .3, x + W, y + H * .3); line(x, y + H * .7, x + W, y + H * .7); break; }
    case 'column': { rect(); g.fillStyle = tk.wall; g.fill(); break; }
    case 'wall': { rect(); g.fillStyle = tk.wall; g.fill(); break; }
    case 'human': { // üstten: omuzlar + kafa
      g.beginPath(); g.ellipse(0, 0, W / 2, H / 2, 0, 0, Math.PI * 2); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .55); g.fill(); g.strokeStyle = tk.accent; g.stroke();
      g.beginPath(); g.arc(0, 0, Math.min(W, H) * .36, 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill();
      g.beginPath(); g.moveTo(0, -H / 2 - 1); g.lineTo(-3, -H / 2 - 6); g.lineTo(3, -H / 2 - 6); g.closePath(); g.fillStyle = tk.accent; g.fill(); // bakış yönü
      break; }
    case 'human_lying': { rr(g, x + H * .55, y + H * .1, W - H * .55, H * .8, H * .3); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .45); g.fill(); g.strokeStyle = tk.accent; g.stroke(); g.beginPath(); g.arc(x + H * .3, 0, H * .28, 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill(); break; }
    case 'wheelchair': { // W: uzunluk (ileri), H: genişlik
      rr(g, x + W * .3, y + H * .15, W * .45, H * .7, 3); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .35); g.fill(); g.strokeStyle = tk.accent; g.stroke();
      g.lineWidth = 3; line(x + W * .25, y + 1, x + W * .75, y + 1); line(x + W * .25, y + H - 1, x + W * .75, y + H - 1); g.lineWidth = 1.2;
      g.beginPath(); g.arc(x + W * .2, y + H * .2, Math.max(2, H * .06), 0, Math.PI * 2); g.arc(x + W * .2, y + H * .8, Math.max(2, H * .06), 0, Math.PI * 2); g.fill();
      line(x + W * .75, y + H * .5, x + W, y + H * .5); line(x + W * .95, y + H * .3, x + W * .95, y + H * .7); g.lineWidth = 3; line(x + W * .3, y + H * .1, x + W * .3, y + H * .9); g.lineWidth = 1.2;
      g.beginPath(); g.arc(x + W * .5, 0, Math.min(W, H) * .17, 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill();
      break; }
    case 'circle': { g.setLineDash([5, 4]); g.beginPath(); g.arc(0, 0, W / 2, 0, Math.PI * 2); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .10); g.fill(); g.strokeStyle = tk.accent; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); break; }
    case 'strip': { g.setLineDash([5, 4]); rect(); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .12); g.fill(); g.strokeStyle = tk.accent; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
      const short = W <= H; // kısa kenarda ok
      g.lineWidth = 1.2; if (short) { line(x + 4, 0, x + W - 4, 0); line(x + 4, 0, x + 9, -4); line(x + 4, 0, x + 9, 4); line(x + W - 4, 0, x + W - 9, -4); line(x + W - 4, 0, x + W - 9, 4); }
      else { line(0, y + 4, 0, y + H - 4); line(0, y + 4, -4, y + 9); line(0, y + 4, 4, y + 9); line(0, y + H - 4, -4, y + H - 9); line(0, y + H - 4, 4, y + H - 9); }
      break; }
    case 'basket': { rect(x, y, W, H, 3); fs(); g.beginPath(); g.rect(x + W * .2, y + H * .2, W * .6, H * .6); g.stroke(); line(x + W * .2, y + H * .5, x + W * .8, y + H * .5); break; }
    case 'lab': { rect(); fs(); g.strokeStyle = stroke; line(x + 3, y + H * .78, x + W - 3, y + H * .78); g.beginPath(); g.ellipse(x + W * .78, y + H * .42, W * .12, H * .26, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = stroke; g.beginPath(); g.arc(x + W * .78, y + H * .12, 1.8, 0, Math.PI * 2); g.fill(); if (W > 40) { g.font = `600 ${Math.min(11, H * .3)}px system-ui`; g.fillStyle = stroke; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LAB', x + W * .38, y + H * .4); } break; }
    case 'cart': { rect(x, y, W, H, 3); fs(); for (const [dx, dy] of [[.3, .3], [-.3, .3], [.3, -.3], [-.3, -.3]]) { g.beginPath(); g.arc(W * dx, H * dy, Math.max(1.5, Math.min(W, H) * .08), 0, Math.PI * 2); g.fillStyle = stroke; g.fill(); } break; }
    case 'stool': { g.beginPath(); g.arc(0, 0, Math.min(W, H) / 2, 0, Math.PI * 2); fs(); g.beginPath(); g.arc(0, 0, Math.min(W, H) * .18, 0, Math.PI * 2); g.stroke(); break; }
    case 'human_walk': { g.setLineDash([3, 3]); rect(); g.strokeStyle = tk.accent; g.stroke(); g.setLineDash([]); g.save(); g.translate(0, -H * .1); g.beginPath(); g.ellipse(0, 0, W / 2, Math.min(H * .27, W * .33), 0, 0, Math.PI * 2); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .55); g.fill(); g.strokeStyle = tk.accent; g.stroke(); g.beginPath(); g.arc(0, 0, Math.min(W, H) * .2, 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill(); g.restore(); g.fillStyle = tk.accent; g.beginPath(); g.moveTo(0, y + H - 2); g.lineTo(-4, y + H * .78); g.lineTo(4, y + H * .78); g.closePath(); g.fill(); break; }
    case 'human2': { for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * W / 4, 0, W / 4 - 1, H / 2, 0, 0, Math.PI * 2); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .55); g.fill(); g.strokeStyle = tk.accent; g.stroke(); g.beginPath(); g.arc(k * W / 4, 0, Math.min(W / 4, H) * .36, 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill(); } break; }
    case 'stroller': { rr(g, x + W * .1, y + H * .1, W * .8, H * .55, 5); g.fillStyle = hexA(tk.accent.startsWith('#') ? tk.accent : '#1F7A5A', .35); g.fill(); g.strokeStyle = tk.accent; g.stroke(); for (const [dx, dy] of [[.28, .3], [-.28, .3], [.28, -.3], [-.28, -.3]]) { g.beginPath(); g.arc(W * dx, H * dy, Math.max(2, W * .07), 0, Math.PI * 2); g.fillStyle = tk.accent; g.fill(); } g.lineWidth = 2; line(x + W * .2, y + H * .9, x + W * .8, y + H * .9); g.lineWidth = 1.2; break; }
    default: { rect(); fs(); }
  }
}
function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function drawSelection(o) {
  const s = view.s;
  ctx.save();
  ctx.strokeStyle = TK.accent; ctx.lineWidth = 2;
  if (sel.type === 'room') {
    ctx.strokeRect(w2sx(o.x), w2sy(o.y), o.w * s, o.h * s);
  } else {
    const c = itemCenter(o);
    ctx.translate(w2sx(c.x), w2sy(c.y)); ctx.rotate(deg2rad(o.rot || 0));
    ctx.strokeRect(-o.w * s / 2 - 2, -o.h * s / 2 - 2, o.w * s + 4, o.h * s + 4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (!o.locked) {
    const hs = handlePositions(o, sel.type);
    for (const h of hs) {
      ctx.beginPath();
      if (h.rot) {
        const c = itemCenter(o), top = toWorld(o, 0, -o.h / 2);
        ctx.strokeStyle = TK.accent; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.moveTo(w2sx(top.x), w2sy(top.y)); ctx.lineTo(h.px, h.py); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(h.px, h.py, 6, 0, Math.PI * 2);
        ctx.fillStyle = TK.accent; ctx.fill(); ctx.strokeStyle = TK.surface; ctx.lineWidth = 1.5; ctx.stroke();
        void c;
      } else {
        ctx.rect(h.px - 5, h.py - 5, 10, 10);
        ctx.fillStyle = TK.surface; ctx.fill(); ctx.strokeStyle = TK.accent; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  } else {
    ctx.font = FONT(600, 10); ctx.fillStyle = TK.accent; ctx.textAlign = 'left';
    const bb = sel.type === 'room' ? o : itemAABB(o);
    ctx.fillText('🔒 kilitli', w2sx(bb.x) + 4, w2sy(bb.y) - 6);
  }
  // seçili eşyanın ölçüsü
  if (sel.type === 'item') {
    const bb = itemAABB(o);
    drawBadge(w2sx(bb.x + bb.w / 2), w2sy(bb.y + bb.h) + 16, `${fmtM(o.w)} × ${fmtM(o.h)} m` + (LIB_BY_KEY[o.key] && LIB_BY_KEY[o.key].hm ? ` · yük. ${fmtM(LIB_BY_KEY[o.key].hm)} m` : ''), null, true);
  }
  ctx.restore();
}
function drawBadge(px, py, text, sub, centered) {
  ctx.save();
  ctx.font = FONT(600, 12, true);
  const w1 = ctx.measureText(text).width;
  let w2 = 0; if (sub) { ctx.font = FONT(500, 11); w2 = ctx.measureText(sub).width; }
  const W = Math.max(w1, w2) + 16, H = sub ? 38 : 24;
  let x = centered ? px - W / 2 : px, y = centered ? py - H / 2 : py;
  x = clamp(x, 4, cw - W - 4); y = clamp(y, 4, ch - H - 4);
  ctx.fillStyle = TK.ink; roundRect(x, y, W, H, 6); ctx.fill();
  ctx.fillStyle = TK.paper; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = FONT(600, 12, true); ctx.fillText(text, x + 8, y + 12);
  if (sub) { ctx.font = FONT(500, 11); ctx.globalAlpha = .85; ctx.fillText(sub, x + 8, y + 27); }
  ctx.restore();
}
function drawRulerLine(l) {
  const d = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
  ctx.save();
  ctx.strokeStyle = TK.warn; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w2sx(l.x1), w2sy(l.y1)); ctx.lineTo(w2sx(l.x2), w2sy(l.y2)); ctx.stroke();
  for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) { ctx.beginPath(); ctx.arc(w2sx(x), w2sy(y), 4, 0, Math.PI * 2); ctx.fillStyle = TK.warn; ctx.fill(); }
  ctx.restore();
  if (d > 0.01) {
    const dx = Math.abs(l.x2 - l.x1), dy = Math.abs(l.y2 - l.y1);
    const rc = rulerComment(d);
    const sub = (dx > 0.01 && dy > 0.01) ? `yatay ${fmtM(dx)} · dikey ${fmtM(dy)} — ${rc.t}` : rc.t;
    drawBadge(w2sx((l.x1 + l.x2) / 2), w2sy((l.y1 + l.y2) / 2) - 30, `${fmtM(d)} m`, sub, true);
  }
}
function drawRulers(X0, Y0, X1, Y1) {
  const S = state.shop, s = view.s, T = 0.25 * s;
  ctx.save(); ctx.fillStyle = TK.muted; ctx.strokeStyle = TK.lineStrong; ctx.lineWidth = 1;
  ctx.font = FONT(500, 10, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const every = s >= 40 ? 1 : s >= 20 ? 2 : 5;
  for (let m = 0; m <= Math.floor(S.w); m += every) {
    const px = w2sx(m); ctx.beginPath(); ctx.moveTo(px, Y0 - T - 3); ctx.lineTo(px, Y0 - T - 8); ctx.stroke(); ctx.fillText(m + '', px, Y0 - T - 10);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let m = 0; m <= Math.floor(S.h); m += every) {
    const py = w2sy(m); ctx.beginPath(); ctx.moveTo(X0 - T - 3, py); ctx.lineTo(X0 - T - 8, py); ctx.stroke(); ctx.fillText(m + '', X0 - T - 11, py);
  }
  // toplam ölçü yazıları
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = FONT(600, 11, true); ctx.fillStyle = TK.ink;
  ctx.fillText(`${fmtM(S.w)} m`, (X0 + X1) / 2, Y1 + T + 6);
  ctx.save(); ctx.translate(X1 + T + 8, (Y0 + Y1) / 2); ctx.rotate(Math.PI / 2); ctx.fillText(`${fmtM(S.h)} m`, 0, 0); ctx.restore();
  ctx.restore();
}
function drawScaleBar() {
  if (exporting) return;
  const s = view.s, x = 14, y = 16, L = s; // 1 m
  ctx.save();
  ctx.strokeStyle = TK.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + L, y - 4); ctx.lineTo(x + L, y + 4); ctx.stroke();
  ctx.font = FONT(600, 10, true); ctx.fillStyle = TK.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('1 m', x, y + 6);
  if (settings.humanBadge && s > 30) { // insan referansı: omuz 0,5 m — ölçek çubuğunun altında
    const hy = y + 24 + s * .15;
    ctx.translate(x + s * .25, hy); drawShape(ctx, 'human', s * .5, s * .3, {tk: TK, w: .5, h: .3});
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.font = FONT(500, 10); ctx.fillStyle = TK.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('insan (omuz 50 cm)', x + s * .5 + 8, hy);
  }
  ctx.restore();
}
function updateStatus() {
  $('#zoomText').textContent = Math.round(view.s / 60 * 100) + '%';
  $('#cursorText').textContent = pointerWorld ? `${fmtM(pointerWorld.x)} , ${fmtM(pointerWorld.y)} m` : '—';
}
