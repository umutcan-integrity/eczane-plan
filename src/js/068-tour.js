/* =====================================================================
   Tanıtım (spotlight): her ekranda bir kez, önemli yerleri tek tek gösterir.
   Ekranın geri kalanı kararır, hedef aydınlanır, yanında kısa açıklama çıkar.
   Adımlar uygulamaya özel: Tour.S[ekran] = [{el, t, d}]; görünmeyen hedef atlanır.
   Bu dosya iki uygulamada aynıdır (dolap/src/js/058-tour.js = src/js/068-tour.js).
   ===================================================================== */
const Tour = {
  K: 'tour.v1', S: {}, cur: null, _t: 0,
  seen() { try { return JSON.parse(localStorage.getItem(this.K) || '{}'); } catch (e) { return {}; } },
  done(id) { return !!this.seen()[id]; },
  mark(id) { try { const o = this.seen(); o[id] = 1; localStorage.setItem(this.K, JSON.stringify(o)); } catch (e) {} },
  reset() { try { localStorage.removeItem(this.K); } catch (e) {} },
  /* ilk kez gelindiğinde kendiliğinden (otomatik tarayıcı testlerinde kapalı) */
  auto(id, delay = 700) {
    if (this.cur || this.done(id) || navigator.webdriver) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => { if (!this.cur && !this.done(id) && !document.querySelector('dialog[open]') && !(this.block && this.block(id))) this.start(id); }, delay);
  },
  vis(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    return r;
  },
  list(sel) { return typeof sel === 'function' ? [].concat(sel() || []) : [].concat(sel).flatMap(s => [...document.querySelectorAll(s)]); },
  /* görünür hedef; yoksa kaydırılarak görülebilecek (ekran dışındaki) ilk hedef */
  find(sel) {
    const L = this.list(sel).filter(Boolean);
    for (const el of L) if (this.vis(el)) return el;
    for (const el of L) { if (!el.isConnected) continue; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); if (r.width >= 4 && r.height >= 4 && cs.visibility !== 'hidden' && el.closest('[hidden]') === null && (r.top > innerHeight || r.bottom < 0)) return el; }
    return null;
  },
  start(id) {
    const steps = (this.S[id] || []).filter(s => !s.when || s.when());
    if (!steps.length) return false;
    this.close(false);
    const root = document.createElement('div'); root.className = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="tour-hole"></div><div class="tour-card" tabindex="-1"><b class="tour-t"></b><p class="tour-d"></p><div class="tour-f"><span class="tour-n"></span><button type="button" class="btn ghost sm tour-skip">Geç</button><button type="button" class="btn sm tour-prev">Geri</button><button type="button" class="btn primary sm tour-next">İleri</button></div></div>';
    document.body.append(root);
    const T = this.cur = {id, steps, i: 0, root, hole: root.querySelector('.tour-hole'), card: root.querySelector('.tour-card')};
    root.querySelector('.tour-skip').onclick = () => this.close(true);
    root.querySelector('.tour-prev').onclick = () => this.go(-1);
    root.querySelector('.tour-next').onclick = () => this.go(1);
    root.addEventListener('click', e => { if (e.target === root || e.target === T.hole) e.stopPropagation(); });
    T.key = e => { if (e.key === 'Escape') { e.preventDefault(); this.close(true); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(-1); } };
    T.re = () => this.place();
    addEventListener('keydown', T.key, true); addEventListener('resize', T.re);
    T.dir = 1; this.show();
    return true;
  },
  go(d) {
    const T = this.cur; if (!T) return;
    T.dir = d; T.i += d;
    if (T.i >= T.steps.length) return this.close(true);
    if (T.i < 0) T.i = 0;
    this.show();
  },
  show() {
    const T = this.cur; if (!T) return;
    /* hedefi görünmeyen adımı atla (yön korunur) */
    while (T.i >= 0 && T.i < T.steps.length && !this.find(T.steps[T.i].el)) T.i += T.dir;
    if (T.i >= T.steps.length || T.i < 0) {
      if (T.dir < 0) { T.dir = 1; T.i = 0; while (T.i < T.steps.length && !this.find(T.steps[T.i].el)) T.i++; }
      if (T.i >= T.steps.length || T.i < 0) return this.close(true);
    }
    const s = T.steps[T.i], el = this.find(s.el);
    if (s.before) s.before(el);
    if (!this.vis(el)) el.scrollIntoView({block: 'center', behavior: 'instant'});
    T.el = el;
    const vis = T.steps.filter(x => this.find(x.el)).length, pos = T.steps.slice(0, T.i + 1).filter(x => this.find(x.el)).length;
    T.card.querySelector('.tour-t').textContent = s.t;
    T.card.querySelector('.tour-d').textContent = s.d;
    T.card.querySelector('.tour-n').textContent = `${pos} / ${vis}`;
    T.card.querySelector('.tour-prev').hidden = pos <= 1;
    T.card.querySelector('.tour-next').textContent = pos >= vis ? 'Tamam' : 'İleri';
    this.place();
    T.card.querySelector('.tour-next').focus({preventScroll: true});
  },
  place() {
    const T = this.cur; if (!T || !T.el) return;
    const r = this.vis(T.el) || T.el.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(W - 8, r.right + pad) - x, h = Math.min(H - 8, r.bottom + pad) - y;
    Object.assign(T.hole.style, {left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px'});
    const c = T.card, cw = Math.min(340, W - 24); c.style.width = cw + 'px';
    const ch = c.offsetHeight, gap = 12;
    let cx, cy;
    if (y + h + gap + ch < H - 8) { cy = y + h + gap; cx = x + w / 2 - cw / 2; }          /* altına */
    else if (y - gap - ch > 8) { cy = y - gap - ch; cx = x + w / 2 - cw / 2; }           /* üstüne */
    else if (x + w + gap + cw < W - 8) { cx = x + w + gap; cy = y + h / 2 - ch / 2; }    /* sağına */
    else if (x - gap - cw > 8) { cx = x - gap - cw; cy = y + h / 2 - ch / 2; }           /* soluna */
    else { cx = W / 2 - cw / 2; cy = H - ch - 16; }                                      /* hedef büyükse altta */
    c.style.left = Math.round(Math.max(12, Math.min(W - cw - 12, cx))) + 'px';
    c.style.top = Math.round(Math.max(12, Math.min(H - ch - 12, cy))) + 'px';
  },
  close(markDone) {
    const T = this.cur; if (!T) return;
    removeEventListener('keydown', T.key, true); removeEventListener('resize', T.re);
    T.root.remove(); this.cur = null;
    if (markDone) this.mark(T.id);
  },
};
