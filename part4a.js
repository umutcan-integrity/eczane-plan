
/* =====================================================================
   ETKİLEŞİM: fare / dokunmatik / klavye
   ===================================================================== */
const pointers = new Map();
let pinch = null, altDown = false, spaceDown = false, longPressTimer = null;
const isTouch = e => e.pointerType === 'touch';

function setTool(t) {
  tool = t;
  document.querySelectorAll('.tbtn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.className = 'plan tool-' + t; canvas.style.cursor = '';
  if (t !== 'ruler') rulerLine = null;
  $('#hint').textContent = {
    select: 'Bir odaya veya eşyaya tıkla · sürükleyerek taşı · köşelerden boyutlandır · boş alanı sürükleyerek kaydır',
    room: 'Oda çiz: boş alanda sürükleyerek dikdörtgen çiz (ya da Odalar sekmesinden şablon ekle)',
    ruler: 'Cetvel: iki nokta arasında sürükle · Shift ile düz çizgi · Esc temizler',
    pan: 'Kaydır: sürükle · tekerlek ile yakınlaştır',
  }[t];
  requestDraw();
}

function selectObj(type, id) {
  const changed = !sel || sel.type !== type || sel.id !== id;
  sel = {type, id};
  if (changed) renderPanel(true);
  requestDraw();
}
function clearSel() { if (sel) { sel = null; renderPanel(true); } requestDraw(); }

function itemsInsideRoom(r) { return state.items.filter(it => { const c = itemCenter(it); return pointInRect(r, c.x, c.y); }); }

function onDown(e) {
  if (e.button === 2) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const p = canvasPos(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) { // pinch başlat, süren sürüklemeyi geri sar
    if (drag) rollbackDrag();
    const [a, b] = [...pointers.values()];
    pinch = {d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), c0: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, s0: view.s, ox0: view.ox, oy0: view.oy};
    return;
  }
  if (pointers.size > 2 || pinch) return;
  const wx = s2wx(p.x), wy = s2wy(p.y), touch = isTouch(e);
  const base = {x0: p.x, y0: p.y, moved: false, touch, id: e.pointerId, vox: view.ox, voy: view.oy};
  canvas.classList.add('dragging');
  if (tool === 'pan' || e.button === 1 || spaceDown) { drag = {...base, kind: 'pan'}; return; }
  if (tool === 'ruler') {
    const x = settings.snap && !altDown ? snapG(wx) : wx, y = settings.snap && !altDown ? snapG(wy) : wy;
    rulerLine = {x1: x, y1: y, x2: x, y2: y}; drag = {...base, kind: 'ruler'}; return;
  }
  if (tool === 'room') { drag = {...base, kind: 'draw-room', sx: snapG(clamp(wx, 0, state.shop.w)), sy: snapG(clamp(wy, 0, state.shop.h)), rect: null}; return; }

  // ---- seç / taşı
  const h = handleAt(p.x, p.y, touch ? 22 : 12);
  if (h) {
    const o = findSel();
    drag = {...base, kind: h.rot ? 'rotate' : 'resize', handle: h, start: {...o}, startSnap: snapshot()};
    return;
  }
  const it = itemAt(wx, wy, (touch ? 10 : 4) / view.s);
  const rm = it ? null : roomContaining(wx, wy);
  const target = it || rm, type = it ? 'item' : 'room';
  if (!target) { clearSel(); drag = {...base, kind: 'pan'}; return; }
  const wasSelected = sel && sel.id === target.id;
  selectObj(type, target.id);
  const startMove = () => {
    const d = {...base, kind: 'move', type, obj: target, start: {x: target.x, y: target.y}, wx0: wx, wy0: wy, startSnap: snapshot(), roomItems: []};
    if (type === 'room') d.roomItems = itemsInsideRoom(target).map(i => ({it: i, x: i.x, y: i.y}));
    return d;
  };
  if (target.locked) { drag = {...base, kind: 'locked', name: target.name}; return; }
  if (touch && !wasSelected) {
    // dokunmatik: seçili olmayan nesnede sürükle = kaydır; 400 ms uzun basma = taşı
    drag = {...base, kind: 'pan-or-hold'};
    longPressTimer = setTimeout(() => {
      if (drag && drag.kind === 'pan-or-hold' && !drag.moved) { drag = startMove(); try { navigator.vibrate && navigator.vibrate(10); } catch (err) {} requestDraw(); }
    }, 400);
    return;
  }
  drag = startMove();
}

function onMove(e) {
  const p = canvasPos(e);
  pointerWorld = {x: s2wx(p.x), y: s2wy(p.y)};
  if (!pointers.has(e.pointerId)) { updateStatus(); updateCursor(p); return; }
  pointers.set(e.pointerId, p);
  if (pinch) {
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), c = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      const ns = clamp(pinch.s0 * d / pinch.d0, 5, 800);
      autoFit = false; view.s = ns; view.ox = c.x - (pinch.c0.x - pinch.ox0) * ns / pinch.s0; view.oy = c.y - (pinch.c0.y - pinch.oy0) * ns / pinch.s0;
      requestDraw();
    }
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  e.preventDefault();
  const dx = p.x - drag.x0, dy = p.y - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) > (drag.touch ? 8 : 4)) drag.moved = true;
  const wx = s2wx(p.x), wy = s2wy(p.y);
  const noSnap = altDown || !settings.snap;
  switch (drag.kind) {
    case 'pan': autoFit = false; view.ox = drag.vox + dx; view.oy = drag.voy + dy; break;
    case 'pan-or-hold': if (drag.moved) { clearTimeout(longPressTimer); drag.kind = 'pan'; view.ox = drag.vox + dx; view.oy = drag.voy + dy; } break;
    case 'locked': if (drag.moved && !drag.warned) { drag.warned = true; toast(`${drag.name} kilitli — açmak için 🔒 simgesine bas`); } break;
    case 'move': {
      if (!drag.moved) break;
      const o = drag.obj;
      let nx = drag.start.x + (wx - drag.wx0), ny = drag.start.y + (wy - drag.wy0);
      if (drag.type === 'room') {
        const sn = noSnap ? {x: nx, y: ny} : snapMoveRect({x: nx, y: ny, w: o.w, h: o.h}, o);
        o.x = sn.x; o.y = sn.y; clampRoom(o);
        const ddx = o.x - drag.start.x, ddy = o.y - drag.start.y;
        for (const ri of drag.roomItems) { ri.it.x = r3(ri.x + ddx); ri.it.y = r3(ri.y + ddy); }
        drag.badge = {px: p.x + 14, py: p.y - 34, text: `X ${fmtM(o.x)} · Y ${fmtM(o.y)} m`, sub: `${fmtM(o.w)} × ${fmtM(o.h)} m · ${fmtA(o.w * o.h)}` + (roomOverlaps(o) ? ' · ÇAKIŞIYOR' : '')};
      } else {
        // eşya: AABB üzerinden yapış
        const tmp = {...o, x: nx, y: ny}; const bb = itemAABB(tmp);
        const sn = noSnap ? {x: bb.x, y: bb.y} : snapMoveRect(bb, null);
        o.x = r3(nx + (sn.x - bb.x)); o.y = r3(ny + (sn.y - bb.y)); clampItem(o);
        const c = itemCenter(o), room = roomContaining(c.x, c.y);
        drag.badge = {px: p.x + 14, py: p.y - 34, text: `X ${fmtM(itemAABB(o).x)} · Y ${fmtM(itemAABB(o).y)} m`, sub: room ? `${room.name} içinde` : 'Satış alanında'};
      }
      break;
    }
    case 'resize': {
      const o = findSel(), st = drag.start, hh = drag.handle;
      if (!o) break;
      if (sel.type === 'room') {
        const {xs, ys} = snapTargets(o);
        const sx = noSnap ? wx : snapValue(wx, xs), sy = noSnap ? wy : snapValue(wy, ys);
        guides = [];
        if (hh.hx === 1) { const right = clamp(sx, st.x + MIN_ROOM, state.shop.w); o.w = right - st.x; if (!noSnap && xs.some(t => Math.abs(t - right) < 1e-6)) guides.push({axis: 'x', v: right}); }
        if (hh.hx === -1) { const left = clamp(sx, 0, st.x + st.w - MIN_ROOM); o.x = left; o.w = st.x + st.w - left; if (!noSnap && xs.some(t => Math.abs(t - left) < 1e-6)) guides.push({axis: 'x', v: left}); }
        if (hh.hy === 1) { const bot = clamp(sy, st.y + MIN_ROOM, state.shop.h); o.h = bot - st.y; if (!noSnap && ys.some(t => Math.abs(t - bot) < 1e-6)) guides.push({axis: 'y', v: bot}); }
        if (hh.hy === -1) { const top = clamp(sy, 0, st.y + st.h - MIN_ROOM); o.y = top; o.h = st.y + st.h - top; if (!noSnap && ys.some(t => Math.abs(t - top) < 1e-6)) guides.push({axis: 'y', v: top}); }
        clampRoom(o);
        drag.badge = {px: p.x + 14, py: p.y - 34, text: `${fmtM(o.w)} × ${fmtM(o.h)} m`, sub: `${fmtA(o.w * o.h)} brüt · ${fmtA(netArea(o))} net`};
      } else {
        const l = toLocal(st, wx, wy);
        let nw = st.w, nh = st.h;
        if (hh.hx === 1) nw = l.x + st.w / 2; if (hh.hx === -1) nw = st.w / 2 - l.x;
        if (hh.hy === 1) nh = l.y + st.h / 2; if (hh.hy === -1) nh = st.h / 2 - l.y;
        if (!noSnap) { nw = snapG(nw); nh = snapG(nh); }
        nw = Math.max(MIN_ITEM, r3(nw)); nh = Math.max(MIN_ITEM, r3(nh));
        const shx = hh.hx * (nw - st.w) / 2, shy = hh.hy * (nh - st.h) / 2;
        const c0 = itemCenter(st), t = deg2rad(st.rot || 0);
        const cx = c0.x + shx * Math.cos(t) - shy * Math.sin(t), cy = c0.y + shx * Math.sin(t) + shy * Math.cos(t);
        o.w = nw; o.h = nh; o.x = r3(cx - nw / 2); o.y = r3(cy - nh / 2); clampItem(o);
        drag.badge = {px: p.x + 14, py: p.y - 34, text: `${fmtM(o.w)} × ${fmtM(o.h)} m`, sub: fmtA(o.w * o.h)};
      }
      break;
    }
    case 'rotate': {
      const o = findSel(); if (!o) break;
      const c = itemCenter(drag.start);
      let ang = Math.atan2(wy - c.y, wx - c.x) * 180 / Math.PI + 90;
      if (!e.shiftKey) ang = Math.round(ang / 15) * 15;
      ang = ((Math.round(ang) % 360) + 360) % 360;
      o.rot = ang;
      // merkez sabit kalsın (x,y sol üst; w/h değişmediği için sabit)
      clampItem(o);
      drag.badge = {px: p.x + 14, py: p.y - 34, text: `${ang}°`, sub: 'Shift: serbest açı'};
      break;
    }
    case 'draw-room': {
      const cx = snapG(clamp(wx, 0, state.shop.w)), cy = snapG(clamp(wy, 0, state.shop.h));
      const x = Math.min(drag.sx, cx), y = Math.min(drag.sy, cy);
      drag.rect = {x, y, w: r3(Math.abs(cx - drag.sx)), h: r3(Math.abs(cy - drag.sy))};
      break;
    }
    case 'ruler': {
      let x = noSnap ? wx : snapG(wx), y = noSnap ? wy : snapG(wy);
      if (e.shiftKey) { if (Math.abs(x - rulerLine.x1) > Math.abs(y - rulerLine.y1)) y = rulerLine.y1; else x = rulerLine.x1; }
      rulerLine.x2 = x; rulerLine.y2 = y;
      break;
    }
  }
  requestDraw(); updateLive();
}

function onUp(e) {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) { pinch = null; drag = null; canvas.classList.remove('dragging'); } return; }
  if (!had || !drag || drag.id !== e.pointerId) return;
  clearTimeout(longPressTimer);
  const d = drag; drag = null; guides = []; canvas.classList.remove('dragging');
  switch (d.kind) {
    case 'move': case 'resize': case 'rotate': if (d.moved) commit(); break;
    case 'draw-room': {
      if (d.rect && d.rect.w >= MIN_ROOM && d.rect.h >= MIN_ROOM) {
        const r = addRoom({name: 'Yeni Oda', ...d.rect, color: ROOM_COLORS[state.rooms.length % ROOM_COLORS.length]});
        selectObj('room', r.id); commit(); toast(`${r.name} eklendi — adını panelden değiştir`);
      } else if (d.moved) toast('Oda en az 0,60 × 0,60 m olmalı');
      setTool('select');
      break;
    }
    case 'ruler': if (!d.moved) rulerLine = null; break;
  }
  requestDraw(); renderPanel(false);
}
function rollbackDrag() {
  clearTimeout(longPressTimer);
  if (drag && drag.startSnap && drag.moved) { restore(drag.startSnap); }
  drag = null; guides = []; canvas.classList.remove('dragging'); requestDraw();
}
function onCancel(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; rollbackDrag(); }
function updateCursor(p) {
  if (tool !== 'select' || drag) return;
  const h = handleAt(p.x, p.y, 12);
  if (h) { canvas.style.cursor = h.rot ? 'grab' : (h.hx * h.hy === 0 ? (h.hx ? 'ew-resize' : 'ns-resize') : (h.hx === h.hy ? 'nwse-resize' : 'nesw-resize')); return; }
  const it = itemAt(s2wx(p.x), s2wy(p.y), 2 / view.s) || roomContaining(s2wx(p.x), s2wy(p.y));
  canvas.style.cursor = it ? 'move' : 'default';
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onCancel);
canvas.addEventListener('lostpointercapture', e => { if (drag && drag.id === e.pointerId) onCancel(e); });
canvas.addEventListener('pointerleave', () => { pointerWorld = null; updateStatus(); });
window.addEventListener('blur', () => { pointers.clear(); pinch = null; rollbackDrag(); altDown = false; spaceDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', e => {
  const p = canvasPos(e);
  if (!itemAt(s2wx(p.x), s2wy(p.y), 2 / view.s) && !roomContaining(s2wx(p.x), s2wy(p.y))) fit();
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const p = canvasPos(e);
  const mult = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ch : 1;
  const dy = e.deltaY * mult, dx = e.deltaX * mult;
  if (e.ctrlKey || e.metaKey || (settings.wheelMode === 'zoom' && Math.abs(dx) < 1)) {
    zoomAt(clamp(Math.exp(-dy * 0.0018), 0.5, 2), p.x, p.y);
  } else { autoFit = false; view.ox -= dx; view.oy -= dy; requestDraw(); }
}, {passive: false});
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), {passive: false});

window.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (e.key === 'Alt') { altDown = true; if (!typing) e.preventDefault(); }
  if (typing) { if (e.key === 'Escape') t.blur(); return; }
  const mod = e.ctrlKey || e.metaKey, o = findSel();
  if (e.key === ' ') { if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; } e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); openExport(); return; }
  if (mod) return;
  switch (e.key) {
    case 'Escape': if (rulerLine) { rulerLine = null; requestDraw(); } else if (tool !== 'select') setTool('select'); else clearSel(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSel(); break;
    case 'v': case 'V': setTool('select'); break;
    case 'o': case 'O': case 'n': case 'N': setTool('room'); break;
    case 'c': case 'C': case 'm': case 'M': setTool('ruler'); break;
    case 'h': case 'H': setTool('pan'); break;
    case 'f': case 'F': case '0': fit(); break;
    case 'g': case 'G': toggleGrid(); break;
    case 's': case 'S': toggleSnap(); break;
    case 'l': case 'L': toggleLock(); break;
    case '+': case '=': zoomAt(1.2, cw / 2, ch / 2); break;
    case '-': case '_': zoomAt(1 / 1.2, cw / 2, ch / 2); break;
    case 'r': case 'R': rotateSel(e.shiftKey ? -90 : 90); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!o || o.locked) break;
      e.preventDefault();
      const step = e.shiftKey ? 0.25 : 0.05;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudge(o, dx, dy); break;
    }
    case '?': toast('Kısayollar Özet sekmesinin altında'); break;
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Alt') altDown = false;
  if (e.key === ' ') { spaceDown = false; canvas.style.cursor = ''; }
});

/* ---------- nesne işlemleri ---------- */
let nudgeTimer = null;
function nudge(o, dx, dy) {
  if (sel.type === 'room') {
    const items = itemsInsideRoom(o);
    const ox = o.x, oy = o.y; o.x = r3(o.x + dx); o.y = r3(o.y + dy); clampRoom(o);
    for (const it of items) { it.x = r3(it.x + (o.x - ox)); it.y = r3(it.y + (o.y - oy)); }
  } else { o.x = r3(o.x + dx); o.y = r3(o.y + dy); clampItem(o); }
  requestDraw(); updateLive();
  clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => commit(), 250);
}
function rotateSel(deg) {
  const o = findSel(); if (!o || sel.type !== 'item' || o.locked) return;
  o.rot = (((o.rot || 0) + deg) % 360 + 360) % 360; clampItem(o); commit();
}
function setRotation(o, deg) { o.rot = ((Math.round(deg) % 360) + 360) % 360; clampItem(o); commit(); }
function toggleLock() { const o = findSel(); if (!o) return; o.locked = !o.locked; commit(); toast(o.locked ? `${o.name} kilitlendi` : `${o.name} kilidi açıldı`); }
function deleteSel() {
  const o = findSel(); if (!o) return;
  if (o.locked) { toast(`${o.name} kilitli — önce kilidi aç`); return; }
  if (sel.type === 'room') {
    const inside = itemsInsideRoom(o);
    const doIt = (alsoItems) => {
      state.rooms = state.rooms.filter(r => r !== o);
      if (alsoItems) state.items = state.items.filter(i => !inside.includes(i));
      sel = null; commit(); renderPanel(true); toast(`${o.name} silindi`);
    };
    if (inside.length) ask(`${o.name} silinsin mi? İçindeki ${inside.length} eşya için:`, ['Eşyaları da sil', 'Eşyalar kalsın', 'Vazgeç']).then(i => { if (i === 0) doIt(true); else if (i === 1) doIt(false); });
    else doIt(false);
  } else {
    state.items = state.items.filter(i => i !== o); sel = null; commit(); renderPanel(true); toast(`${o.name} silindi`);
  }
}
function duplicateSel() {
  const o = findSel(); if (!o) return;
  const copy = JSON.parse(JSON.stringify(o)); copy.id = (sel.type === 'room' ? 'r' : 'i') + (state.nextId++); copy.locked = false;
  if (sel.type === 'room') { copy.pin = ''; copy.x = r3(copy.x + 0.3); copy.y = r3(copy.y + 0.3); state.rooms.push(copy); clampRoom(copy); }
  else { copy.x = r3(copy.x + 0.3); copy.y = r3(copy.y + 0.3); state.items.push(copy); clampItem(copy); }
  sel = {type: sel.type, id: copy.id}; commit(); renderPanel(true); toast(`${copy.name} çoğaltıldı`);
}
function addRoom(spec) {
  const r = {id: 'r' + (state.nextId++), name: spec.name, x: r3(spec.x), y: r3(spec.y), w: r3(spec.w), h: r3(spec.h), color: spec.color || ROOM_COLORS[state.rooms.length % ROOM_COLORS.length], pin: spec.pin || '', locked: false};
  state.rooms.push(r); clampRoom(r); return r;
}
function addRoomTemplate(t) {
  // ilk boş yer: 0,25 m adımla tara
  let pos = null;
  outer: for (let y = 0; y + t.h <= state.shop.h + 1e-9; y = r3(y + 0.25)) for (let x = 0; x + t.w <= state.shop.w + 1e-9; x = r3(x + 0.25)) {
    const cand = {x, y, w: t.w, h: t.h};
    if (!state.rooms.some(r => overlap(r, cand))) { pos = cand; break outer; }
  }
  if (!pos) { pos = {x: 0, y: 0, w: Math.min(t.w, state.shop.w), h: Math.min(t.h, state.shop.h)}; toast('Boş yer bulunamadı — oda sol üste kondu, taşıyabilirsin'); }
  const r = addRoom({...t, ...pos});
  selectObj('room', r.id); commit(); toast(`${r.name} eklendi`);
  return r;
}
function addItem(key, opts = {}) {
  const d = LIB_BY_KEY[key]; if (!d) return;
  let cx, cy;
  const so = findSel();
  if (so && sel.type === 'room') { cx = so.x + so.w / 2; cy = so.y + so.h / 2; }
  else { cx = clamp(s2wx(cw / 2), 0, state.shop.w); cy = clamp(s2wy(ch / 2), 0, state.shop.h); }
  const it = {id: 'i' + (state.nextId++), key, name: d.n, x: r3(snapG(cx - d.w / 2)), y: r3(snapG(cy - d.h / 2)), w: d.w, h: d.h, rot: opts.rot || 0, flip: false, locked: false};
  state.items.push(it); clampItem(it);
  selectObj('item', it.id); commit(); toast(`${d.n} eklendi — sürükleyerek yerleştir`);
  return it;
}
function addDoorToRoom(r) {
  const W = state.shop.w, H = state.shop.h;
  const walls = [];
  const free = (x, y) => !state.rooms.some(o => o !== r && pointInRect(o, x, y));
  if (r.y + r.h < H - 1e-6 && free(r.x + r.w / 2, r.y + r.h + 0.05)) walls.push({side: 'b', len: r.w});
  if (r.x > 1e-6 && free(r.x - 0.05, r.y + r.h / 2)) walls.push({side: 'l', len: r.h});
  if (r.x + r.w < W - 1e-6 && free(r.x + r.w + 0.05, r.y + r.h / 2)) walls.push({side: 'r', len: r.h});
  if (r.y > 1e-6 && free(r.x + r.w / 2, r.y - 0.05)) walls.push({side: 't', len: r.w});
  if (!walls.length) { // satış alanına açılan duvar yoksa herhangi bir iç duvar
    if (r.y + r.h < H - 1e-6) walls.push({side: 'b', len: r.w}); if (r.x > 1e-6) walls.push({side: 'l', len: r.h});
    if (r.x + r.w < W - 1e-6) walls.push({side: 'r', len: r.h}); if (r.y > 1e-6) walls.push({side: 't', len: r.w});
  }
  if (!walls.length) { toast('Bu odanın iç duvarı yok'); return; }
  walls.sort((a, b) => b.len - a.len);
  const wall = walls[0];
  const key = roomType(r) === 'wc' ? 'wc_kapisi' : 'ic_kapi', d = LIB_BY_KEY[key];
  if (wall.len < d.w + 0.1) { toast('Duvar kapı için çok kısa'); return; }
  let cx, cy, rot;
  if (wall.side === 'b') { cx = r.x + r.w / 2; cy = r.y + r.h; rot = 0; }
  else if (wall.side === 't') { cx = r.x + r.w / 2; cy = r.y; rot = 180; }
  else if (wall.side === 'l') { cx = r.x; cy = r.y + r.h / 2; rot = 90; }
  else { cx = r.x + r.w; cy = r.y + r.h / 2; rot = 270; }
  const it = {id: 'i' + (state.nextId++), key, name: d.n, x: r3(cx - d.w / 2), y: r3(cy - d.h / 2), w: d.w, h: d.h, rot, flip: false, locked: false};
  state.items.push(it); clampItem(it); selectObj('item', it.id); commit(); toast('Kapı eklendi — R ile döndür, panelden menteşe yönü');
}
function flipPlan(axis) {
  const W = state.shop.w, H = state.shop.h;
  for (const r of state.rooms) {
    if (axis === 'h') { r.x = r3(W - r.x - r.w); r.pin = {tl: 'tr', tr: 'tl', bl: 'br', br: 'bl'}[r.pin] || ''; }
    else { r.y = r3(H - r.y - r.h); r.pin = {tl: 'bl', bl: 'tl', tr: 'br', br: 'tr'}[r.pin] || ''; }
  }
  for (const it of state.items) {
    const c = itemCenter(it);
    if (axis === 'h') { it.x = r3(W - c.x - it.w / 2); it.rot = ((360 - (it.rot || 0)) % 360 + 360) % 360; }
    else { it.y = r3(H - c.y - it.h / 2); it.rot = ((180 - (it.rot || 0)) % 360 + 360) % 360; }
    it.flip = !it.flip;
  }
  commit(); renderPanel(true); toast(axis === 'h' ? 'Plan yatay çevrildi (sağ-sol)' : 'Plan dikey çevrildi (üst-alt)');
}
function toggleGrid() { settings.grid = !settings.grid; $('#btnGrid').classList.toggle('on', settings.grid); requestDraw(); }
function toggleSnap() { settings.snap = !settings.snap; $('#btnSnap').classList.toggle('on', settings.snap); toast(settings.snap ? 'Yapışma açık' : 'Yapışma kapalı (Alt ile de geçici kapatılır)'); }

/* ---------- küçük yardımcılar ---------- */
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function ask(msg, buttons) {
  return new Promise(res => {
    let dlg = $('#dlgAsk');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlgAsk'; document.body.appendChild(dlg); }
    dlg.innerHTML = `<p style="margin:0 0 12px;font-size:14px">${esc(msg)}</p><div class="row" style="justify-content:flex-end">${buttons.map((b, i) => `<button class="ibtn ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(b)}</button>`).join('')}</div>`;
    dlg.querySelectorAll('button').forEach(b => b.onclick = () => { dlg.close(); res(+b.dataset.i); });
    dlg.oncancel = () => res(-1);
    try { dlg.showModal(); } catch (e) { res(0); }
  });
}
function parseNum(str, prev) {
  if (typeof str !== 'string') return prev;
  let s = str.trim().replace(',', '.');
  if (!s) return prev;
  let v = parseFloat(s); if (!isFinite(v)) return prev;
  if (v > 20) v = v / 100; // cm girildi
  return v;
}
