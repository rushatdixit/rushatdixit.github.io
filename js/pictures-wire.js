// The Kanthal wire's other end. The furnace's left lead (js/furnace.js) stops just under its ammeter; from there this
// draws it on, as a fixed lead down to a coil of the same wire resting beside the "pictures" heading. A free end leaves
// the coil and follows the reader down the pictures section: the further they scroll, the more wire is paid out and the
// smaller the coil gets (it spins as it gives); scrolling back up winds it in again.
//
// The photos are placed at random on every visit, so both wires are routed on the live page: the photos, their titles,
// the heading and the coil (and, for the fixed lead, the project list and the furnace's meters) are measured, blown up by
// a clearance, and an A* search on a coarse grid finds a way round them that keeps going down the page. The corners are
// then rounded off into a smooth cable, each one checked against the obstacles again.
//
// Everything is drawn in one SVG laid over the page, under all text and images, that never takes the pointer.
// ?debugpath=1 also draws the blown-up obstacles and the raw grid routes; window.__pictureWire has hooks for tests.
(() => {
  const main = document.querySelector('main');
  const section = document.querySelector('.pictures');
  const skyFade = document.querySelector('.sky-fade');
  const heading = section && section.querySelector('.section-title');
  const box = section && section.querySelector('.pictures-featured');
  const projects = document.querySelector('.projects');
  const furnace = document.querySelector('.furnace');
  if (!main || !section || !heading || !box) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const debug = new URLSearchParams(location.search).get('debugpath') === '1';
  const NS = 'http://www.w3.org/2000/svg';
  const ANG = (-20 * Math.PI) / 180, CA = Math.cos(ANG), SA = Math.sin(ANG);   // the coil tilts like the tube: up 20° to the right
  const SQ = 0.55;                      // ... and lies on the page, seen at a slant: its circles are ellipses this flat
  const TIP_AT = 0.6;                   // the free end keeps to this height of the window
  const DAMP = 0.09;                    // seconds: how quickly the free end catches up (it is pulled, not snapped)
  const TURN = 6, UP = 25;              // A*: extra cost of a turn, and of every step up the page
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f = (v) => +v.toFixed(2);

  /* ---------------- the overlay ---------------- */
  const el = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const svg = el('svg', { class: 'pwire', 'aria-hidden': 'true', focusable: 'false' });
  main.insertBefore(svg, skyFade || section);
  const defs = el('defs', {}, svg);
  const light = el('linearGradient', { id: 'pw-light', gradientUnits: 'userSpaceOnUse' }, defs);   // lit from the top left
  for (const [o, c] of [[0, '#d3d7de'], [0.5, '#8e939c'], [1, '#4c5058']]) el('stop', { offset: o, 'stop-color': c }, light);
  // a wire is three strokes on one path, like the furnace's Kanthal: a wide faint one, a mid one, a thin bright core
  const strand = (parent, extra = '') => [1, 2, 3].map((i) => el('path', { class: `pw-k${i} ${extra}` }, parent));
  const gCoil = el('g', { class: 'pw-coil' }, svg);
  const rims = [0, 1, 2].map((i) => el('ellipse', { class: `pw-rim pw-rim-${i}` }, gCoil));
  const face = el('ellipse', { class: 'pw-face' }, gCoil);
  const spiral = strand(gCoil, 'pw-spiral');
  const hub = el('ellipse', { class: 'pw-hub' }, gCoil);
  const spokes = el('path', { class: 'pw-spokes' }, gCoil);
  const lead = strand(el('g', {}, svg));
  const gFree = el('g', {}, svg);
  const conn = strand(gFree);
  const free = strand(gFree);
  const tip = el('circle', { class: 'pw-tip' }, gFree);
  const cap = el('line', { class: 'pw-cap' }, gFree);
  const gDebug = debug ? el('g', { class: 'pw-debug' }, svg) : null;

  /* ---------------- the coil's shape ---------------- */
  // a point rho from the coil's centre at angle t, on the slanted disc
  const ell = (cx, cy, rho, t) => {
    const lx = rho * Math.cos(t), ly = SQ * rho * Math.sin(t);
    return [cx + lx * CA - ly * SA, cy + lx * SA + ly * CA];
  };
  const halfX = (r) => Math.hypot(r * CA, SQ * r * SA);
  const halfY = (r) => Math.hypot(r * SA, SQ * r * CA);
  const T_DEP = Math.atan2(-SQ * SA, CA);          // the angle of the disc's right-hand edge: the wire leaves there, heading down

  /* ---------------- measuring (one read phase) ---------------- */
  function measure() {
    const sx = window.scrollX, sy = window.scrollY;
    const page = (r) => ({ x0: r.left + sx, y0: r.top + sy, x1: r.right + sx, y1: r.bottom + sy });
    const rectOf = (e) => page(e.getBoundingClientRect());
    const textRects = (e) => {
      const rg = document.createRange();
      rg.selectNodeContents(e);
      return [...rg.getClientRects()].filter((r) => r.width && r.height).map(page);
    };
    const W = document.documentElement.clientWidth;
    const m = { W, vw: W / 100, phone: W < 700 };
    m.heading = rectOf(heading);
    m.frames = [...box.querySelectorAll('.featured-frame')].map(rectOf);
    m.caps = [...box.querySelectorAll('.featured figcaption')].map(rectOf);
    m.lead = furnace && furnace.furnaceLeadEnd ? furnace.furnaceLeadEnd() : null;
    // what the fixed lead must keep clear of on its way down from the furnace
    m.leadObs = [];
    if (projects) {
      for (const li of projects.querySelectorAll('.project-list .project')) m.leadObs.push(rectOf(li));
      for (const t of projects.querySelectorAll('.section-title, .projects-intro')) m.leadObs.push(...textRects(t));
    }
    if (furnace && furnace.furnaceMeters) {
      for (const r of furnace.furnaceMeters()) {
        if (!r) continue;
        const left = r.left ?? r.x, top = r.top ?? r.y;
        const right = r.right ?? left + r.width, bottom = r.bottom ?? top + r.height;
        m.leadObs.push(page({ left, top, right, bottom }));
      }
      const red = furnace.querySelector('[data-wire="voltmeter-red"]');     // the voltmeter's slack red lead, as little boxes
      const ctm = red && red.getScreenCTM();
      if (ctm) {
        const len = red.getTotalLength();
        for (let i = 0; i <= 40; i++) {
          const p = new DOMPoint(red.getPointAtLength((i / 40) * len).x, red.getPointAtLength((i / 40) * len).y).matrixTransform(ctm);
          m.leadObs.push(page({ left: p.x - 2, top: p.y - 2, right: p.x + 2, bottom: p.y + 2 }));
        }
      }
    }
    return m;
  }

  /* ---------------- A* on a grid ---------------- */
  // S to E round the obstacles (each blown up by c), within `bounds`, keeping `edge` from the window's sides. 4-way moves,
  // 1 a step, TURN for a turn, UP more for a step up. Returns the grid cells' centres, with S and E as its ends.
  function route(S, E, obs, bounds, o) {
    const { c, cs, edge, W } = o;
    const x0 = bounds.x0, y0 = bounds.y0;
    const cols = Math.max(2, Math.ceil((bounds.x1 - x0) / cs)), rows = Math.max(2, Math.ceil((bounds.y1 - y0) / cs));
    const N = cols * rows;
    const blocked = new Uint8Array(N);
    const range = (lo, hi, o0, n) => [Math.max(0, Math.floor((lo - o0) / cs - 0.5) + 1), Math.min(n - 1, Math.ceil((hi - o0) / cs - 0.5) - 1)];
    const mark = (r, pad, v) => {
      const [i0, i1] = range(r.x0 - pad, r.x1 + pad, x0, cols), [j0, j1] = range(r.y0 - pad, r.y1 + pad, y0, rows);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * cols + i] = v;
    };
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cs;
      if (x < edge || x > W - edge) for (let j = 0; j < rows; j++) blocked[j * cols + i] = 1;
    }
    for (const r of obs) mark(r, c, 1);
    for (const r of o.open || []) mark(r, 0, 0);
    const cellOf = (p) => [clamp(Math.floor((p[0] - x0) / cs), 0, cols - 1), clamp(Math.floor((p[1] - y0) / cs), 0, rows - 1)];
    const [si, sj] = cellOf(S), [ei, ej] = cellOf(E);
    blocked[sj * cols + si] = 0;
    blocked[ej * cols + ei] = 0;
    const goal = ej * cols + ei;

    const g = new Float32Array(N * 4).fill(Infinity);
    const from = new Int32Array(N * 4).fill(-1);
    const closed = new Uint8Array(N * 4);
    const heap = [];                                  // binary heap of [f, state]
    const push = (fv, st) => {
      heap.push([fv, st]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const DI = [1, 0, -1, 0], DJ = [0, 1, 0, -1];     // right, down, left, up
    const h = (i, j) => Math.abs(i - ei) + Math.abs(j - ej) + UP * Math.max(0, j - ej);
    const s0 = (sj * cols + si) * 4 + (o.startDir ?? 1);
    g[s0] = 0;
    push(h(si, sj), s0);
    let found = -1;
    while (heap.length) {
      const [, st] = pop();
      if (closed[st]) continue;
      closed[st] = 1;
      const idx = st >> 2, d = st & 3;
      if (idx === goal) { found = st; break; }
      const i = idx % cols, j = (idx / cols) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const ni = i + DI[nd], nj = j + DJ[nd];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nidx = nj * cols + ni;
        if (blocked[nidx]) continue;
        const ns = nidx * 4 + nd, ng = g[st] + 1 + (nd !== d ? TURN : 0) + (nd === 3 ? UP : 0);
        if (ng < g[ns]) { g[ns] = ng; from[ns] = st; push(ng + h(ni, nj), ns); }
      }
    }
    if (found < 0) return null;
    const cells = [];
    for (let st = found; st >= 0; st = from[st]) {
      const idx = st >> 2;
      if (!cells.length || cells[cells.length - 1] !== idx) cells.push(idx);
    }
    cells.reverse();
    const pts = cells.map((idx) => [x0 + ((idx % cols) + 0.5) * cs, y0 + (((idx / cols) | 0) + 0.5) * cs]);
    return { raw: pts.slice(), pts: snapEnds(S, E, pts) };
  }

  // the cells' centres lie up to half a cell off S and E: slide the first and last straight runs onto them exactly
  function snapEnds(S, E, cells) {
    const c = cells.map((q) => q.slice());
    const same = (a, b) => Math.abs(a - b) < 1e-6;
    // the first run (from the first cell while the cells stay in one column or row) moves onto S's column or row
    if (c.length >= 2) {
      const vert = same(c[0][0], c[1][0]), v0 = vert ? c[0][0] : c[0][1];
      for (let k = 0; k < c.length && same(vert ? c[k][0] : c[k][1], v0); k++) c[k][vert ? 0 : 1] = vert ? S[0] : S[1];
    } else if (c.length === 1) c[0] = [S[0], E[1]];
    // ... and the last run onto E's
    if (c.length >= 2) {
      const n = c.length, vert = same(c[n - 1][0], c[n - 2][0]), v0 = vert ? c[n - 1][0] : c[n - 1][1];
      for (let k = n - 1; k >= 0 && same(vert ? c[k][0] : c[k][1], v0); k--) c[k][vert ? 0 : 1] = vert ? E[0] : E[1];
    }
    // every leg square: a slanted one (left where the two snaps met) becomes down-then-across
    const p = [S];
    for (const q of [...c, E]) {
      const a = p[p.length - 1];
      if (!same(a[0], q[0]) && !same(a[1], q[1])) p.push([a[0], q[1]]);
      p.push(q);
    }
    // drop repeats and points in the middle of straight runs
    const out = [p[0]];
    for (let k = 1; k < p.length; k++) {
      const q = p[k], last = out[out.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.5) continue;
      if (out.length >= 2) {
        const pr = out[out.length - 2];
        const col = (Math.abs(pr[0] - last[0]) < 0.5 && Math.abs(last[0] - q[0]) < 0.5) || (Math.abs(pr[1] - last[1]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5);
        if (col) { out[out.length - 1] = q; continue; }
      }
      out.push(q);
    }
    return out;
  }

  /* ---------------- rounding the corners into a cable ---------------- */
  // Every corner becomes an arc of radius R (no more than half of either side, all of an end side), checked against the
  // obstacles; a corner whose arc comes too close is rounded less and less until it doesn't. Returns the SVG path, a
  // sample every pixel or so (x, y, length so far) and the total length.
  function smooth(pts, R, isClear, lastMax = Infinity) {
    const n = pts.length;
    const corners = [];
    for (let k = 1; k < n - 1; k++) {
      const A = pts[k - 1], P = pts[k], B = pts[k + 1];
      const l1 = Math.hypot(P[0] - A[0], P[1] - A[1]), l2 = Math.hypot(B[0] - P[0], B[1] - P[1]);
      const u = [(P[0] - A[0]) / l1, (P[1] - A[1]) / l1], v = [(B[0] - P[0]) / l2, (B[1] - P[1]) / l2];
      let r = Math.min(R, l1 * (k === 1 ? 1 : 0.5), l2 * (k === n - 2 ? 1 : 0.5), k === n - 2 ? lastMax : Infinity);
      const arcPt = (rr, ph) => {
        const cx = P[0] - u[0] * rr + v[0] * rr, cy = P[1] - u[1] * rr + v[1] * rr;
        return [cx - v[0] * rr * Math.cos(ph) + u[0] * rr * Math.sin(ph), cy - v[1] * rr * Math.cos(ph) + u[1] * rr * Math.sin(ph)];
      };
      const ok = (rr) => { for (let i = 0; i <= 16; i++) { const q = arcPt(rr, (i / 16) * (Math.PI / 2)); if (!isClear(q[0], q[1])) return false; } return true; };
      while (r > 1.5 && !ok(r)) r /= 2;
      if (r <= 1.5) r = 0;
      corners.push({ P, u, v, r, arcPt, sweep: u[0] * v[1] - u[1] * v[0] > 0 ? 1 : 0 });
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    const xs = [pts[0][0]], ys = [pts[0][1]], ss = [0];
    const add = (x, y) => {
      const i = xs.length - 1;
      ss.push(ss[i] + Math.hypot(x - xs[i], y - ys[i]));
      xs.push(x);
      ys.push(y);
    };
    const lineTo = (q) => {
      const a = [xs[xs.length - 1], ys[ys.length - 1]], len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len));
      for (let i = 1; i <= steps; i++) add(a[0] + ((q[0] - a[0]) * i) / steps, a[1] + ((q[1] - a[1]) * i) / steps);
      d += ` L${f(q[0])},${f(q[1])}`;
    };
    for (const cn of corners) {
      if (!cn.r) { lineTo(cn.P); continue; }
      const t1 = cn.arcPt(cn.r, 0), t2 = cn.arcPt(cn.r, Math.PI / 2);
      lineTo(t1);
      const steps = Math.max(2, Math.ceil((cn.r * Math.PI) / 2));
      for (let i = 1; i <= steps; i++) { const q = cn.arcPt(cn.r, (i / steps) * (Math.PI / 2)); add(q[0], q[1]); }
      d += ` A${f(cn.r)},${f(cn.r)} 0 0 ${cn.sweep} ${f(t2[0])},${f(t2[1])}`;
    }
    lineTo(pts[n - 1]);
    return { d, xs, ys, ss, L: ss[ss.length - 1] };
  }

  /* ---------------- the plan: where the coil sits, and both routes ---------------- */
  function plan(m) {
    const { W, vw, phone } = m;
    const c = phone ? 8 : Math.max(16, 1.5 * vw);           // clearance round everything
    const cs = phone ? 4 : 10;                               // grid cell
    const edge = phone ? 5 : c;                              // kept from the window's sides
    const corner = (phone ? 3 : 2.5) * vw;
    const w0 = Math.max(3, 0.45 * vw);
    const widths = m.lead && m.lead.widths ? m.lead.widths : [w0, w0 * 0.62, w0 * 0.3];
    const hw = widths[0] / 2;
    const rFull = (phone ? 7 : 4.5) * vw, rHub = (phone ? 2 : 1) * vw;
    const T = widths[0] * 2.4;                               // the roll's thickness: three layers of wire
    const hx = halfX(rFull), hy = halfY(rFull);
    // the coil: just right of the heading, resting on its bottom line; just under it if there's no room beside it
    let cx = m.heading.x1 + c + hx + hw, cy = m.heading.y1 - hy - T;
    if (cx + hx + c + edge > W) { cx = m.heading.x0 + hx + hw; cy = m.heading.y1 + c + hy; }
    const coilRect = { x0: cx - hx - hw, y0: cy - hy - hw, x1: cx + hx + hw, y1: cy + hy + T + hw };
    const coil = { cx, cy, rFull, rHub, T, rect: coilRect };

    const obsFree = [...m.frames, ...m.caps, m.heading, coilRect];
    const inflatedFree = obsFree.map((r) => ({ x0: r.x0 - hw - 2, y0: r.y0 - hw - 2, x1: r.x1 + hw + 2, y1: r.y1 + hw + 2 }));
    const clearOf = (list) => (x, y) => !list.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);

    // the free wire: off the disc's right-hand edge, down to a point just clear of the coil, then round everything to just
    // under the last title
    const dep = ell(cx, cy, rFull, T_DEP);
    const G = [dep[0], coilRect.y1 + c + cs / 2];
    const lastCap = m.caps[m.caps.length - 1];
    const E = lastCap ? [lastCap.x0 + Math.min(16, (lastCap.x1 - lastCap.x0) / 2), lastCap.y1 + c + cs] : [G[0], G[1] + 200];
    const opts = { c, cs, edge, W };
    const freeR = route(G, E, obsFree, { x0: 0, y0: Math.min(G[1], coilRect.y0) - 2 * cs, x1: W, y1: E[1] + 6 * cs }, opts);
    // its first stretch: from the edge of the full coil down to G (later redrawn from wherever the coil's edge is)
    const kc = (G[1] - dep[1]) / 2;
    const bz = (t) => {
      const a = [dep, [dep[0], dep[1] + kc], [G[0], G[1] - kc], G], mt = 1 - t;
      return [0, 1].map((q) => mt * mt * mt * a[0][q] + 3 * mt * mt * t * a[1][q] + 3 * mt * t * t * a[2][q] + t * t * t * a[3][q]);
    };
    let connLen = 0;
    const connPts = [dep];
    for (let i = 1; i <= 24; i++) { const q = bz(i / 24); connLen += Math.hypot(q[0] - connPts[i - 1][0], q[1] - connPts[i - 1][1]); connPts.push(q); }
    const freeS = freeR ? smooth(freeR.pts, corner, clearOf(inflatedFree)) : null;

    // the fixed lead: from the furnace's stub, round the list and the meters, to just above the coil, then down onto its hub
    let leadS = null, leadR = null, leadGoal = null;
    if (m.lead) {
      const S = [m.lead.x, m.lead.y];
      leadGoal = [cx, coilRect.y0 - c - cs / 2];
      const obsLead = [...m.leadObs, m.heading, coilRect, ...m.frames, ...m.caps];
      const open = [{ x0: S[0] - cs, y0: S[1] - cs, x1: S[0] + cs, y1: S[1] + c + 2 * cs }];
      leadR = route(S, leadGoal, obsLead, { x0: 0, y0: Math.min(S[1], leadGoal[1]) - 6 * cs, x1: W, y1: Math.max(S[1], leadGoal[1]) + 6 * cs }, { ...opts, open });
      if (leadR) {
        const pts = leadR.pts.slice();
        const last = pts[pts.length - 1];
        pts.push([last[0], cy]);                                // straight down onto the hub
        const inflatedLead = [...m.leadObs, m.heading, ...m.frames, ...m.caps].map((r) => ({ x0: r.x0 - hw - 2, y0: r.y0 - hw - 2, x1: r.x1 + hw + 2, y1: r.y1 + hw + 2 }));
        // the last corner, onto the drop, must have finished turning before it reaches the coil
        leadS = smooth(pts, corner, clearOf(inflatedLead), coilRect.y0 - leadGoal[1] - 1);
      }
    }

    // one table for the free end: the first stretch, then the route
    const xs = [], ys = [], ss = [];
    connPts.forEach((q, i) => { xs.push(q[0]); ys.push(q[1]); ss.push(i ? ss[i - 1] + Math.hypot(q[0] - connPts[i - 1][0], q[1] - connPts[i - 1][1]) : 0); });
    if (freeS) for (let i = 1; i < freeS.xs.length; i++) { xs.push(freeS.xs[i]); ys.push(freeS.ys[i]); ss.push(connLen + freeS.ss[i]); }
    const ymax = new Float32Array(ys.length);
    for (let i = 0; i < ys.length; i++) ymax[i] = Math.max(i ? ymax[i - 1] : -Infinity, ys[i]);
    const L = ss[ss.length - 1] || 0;

    const tops = [coilRect.y0, G[1]];
    if (m.lead) tops.push(m.lead.y);
    const top = Math.min(...tops) - 40, bottom = E[1] + 60;
    return { m, c, cs, widths, coil, G, E, dep, connLen, freeR, freeS, leadR, leadS, leadGoal, xs, ys, ss, ymax, L, top, bottom, obsFree, obsLead: m.lead ? [...m.leadObs, m.heading, coilRect, ...m.frames, ...m.caps] : [] };
  }

  /* ---------------- drawing ---------------- */
  let P = null;                                              // the current plan
  const setD = (strokes, d) => { for (const p of strokes) p.setAttribute('d', d); };
  const setW = (strokes, w) => strokes.forEach((p, i) => p.setAttribute('stroke-width', f(w[i])));

  function applyPlan() {
    const { m, widths, top, bottom } = P;
    Object.assign(svg.style, { top: `${f(top)}px`, width: `${m.W}px`, height: `${f(bottom - top)}px` });
    svg.setAttribute('viewBox', `0 ${f(top)} ${m.W} ${f(bottom - top)}`);
    for (const s of [lead, conn, free, spiral]) setW(s, widths);
    setD(lead, P.leadS ? P.leadS.d : '');
    setD(free, P.freeS ? P.freeS.d : '');
    for (const p of free) p.style.strokeDasharray = `0 ${f(P.L + 50)}`;
    tip.setAttribute('r', f(widths[0] * 0.32));
    cap.setAttribute('stroke-width', f(widths[0] * 0.5));
    for (const r of rims) r.setAttribute('stroke-width', f(widths[2]));
    spokes.setAttribute('stroke-width', f(Math.max(1, widths[2])));
    hub.setAttribute('stroke-width', f(widths[2]));
    if (gDebug) {
      gDebug.textContent = '';
      for (const [list, c] of [[P.obsFree, P.c], [P.obsLead, P.c]]) {
        for (const r of list) el('rect', { x: f(r.x0 - c), y: f(r.y0 - c), width: f(r.x1 - r.x0 + 2 * c), height: f(r.y1 - r.y0 + 2 * c) }, gDebug);
      }
      for (const rt of [P.freeR, P.leadR]) if (rt) el('polyline', { points: rt.raw.map((q) => `${f(q[0])},${f(q[1])}`).join(' ') }, gDebug);
      if (!P.freeR) console.warn('pictures-wire: no route for the free wire');
      if (P.leadR === null && P.m.lead) console.warn('pictures-wire: no route for the fixed lead');
    }
    lastR = -1;
  }

  const sIndex = (s) => {                                    // the sample at length s (binary search)
    let lo = 0, hi = P.ss.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (P.ss[mid] < s) lo = mid + 1; else hi = mid; }
    return lo;
  };
  // how much wire is out when the free end is to be level with page height y: the first length at which the wire has
  // got down that far (a running maximum, so the length never jumps back where the route climbs)
  function sOfY(y) {
    if (!P || !P.L || y <= P.ys[0]) return 0;
    const ym = P.ymax;
    if (y >= ym[ym.length - 1] - 1) return P.L;              // (a pixel short of the bottom counts: scroll positions are rounded)
    let lo = 0, hi = ym.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ym[mid] < y) lo = mid + 1; else hi = mid; }
    return P.ss[lo];
  }

  let lastR = -1, lastSpin = 0, drawCost = 0;
  function draw(s) {
    const t0 = performance.now();
    const { coil, widths, L, connLen } = P;
    const { cx, cy, rFull, rHub, T } = coil;
    const frac = L ? clamp(s / L, 0, 1) : 0;
    const r = Math.sqrt(rHub * rHub + (rFull * rFull - rHub * rHub) * (1 - frac));
    const spin = reduceMotion ? 0 : (2 * L * (rFull - r)) / (rFull * rFull - rHub * rHub);
    // the roll: its rim layers, top face and spiral, the hub and its spokes (turning as the wire pays out)
    if (Math.abs(r - lastR) > 0.3 || Math.abs(spin - lastSpin) > 0.01) {
      lastR = r;
      lastSpin = spin;
      const rot = `rotate(${f((ANG * 180) / Math.PI)} ${f(cx)} ${f(cy)})`;
      rims.forEach((e, i) => {
        const oy = (T * (3 - i)) / 3;
        e.setAttribute('cx', f(cx)); e.setAttribute('cy', f(cy + oy));
        e.setAttribute('rx', f(r)); e.setAttribute('ry', f(SQ * r));
        e.setAttribute('transform', `rotate(${f((ANG * 180) / Math.PI)} ${f(cx)} ${f(cy + oy)})`);
      });
      for (const e of [face]) { e.setAttribute('cx', f(cx)); e.setAttribute('cy', f(cy)); e.setAttribute('rx', f(r)); e.setAttribute('ry', f(SQ * r)); e.setAttribute('transform', rot); }
      const pitch = widths[0] * 1.15, turns = Math.max(0.6, (r - rHub) / pitch), n = Math.ceil(turns * 40);
      const t1 = T_DEP, ta = t1 - 2 * Math.PI * turns;
      let d = '';
      for (let i = 0; i <= n; i++) {
        const t = ta + ((t1 - ta) * i) / n, q = ell(cx, cy, rHub + ((r - rHub) * i) / n, t);
        d += `${i ? ' L' : 'M'}${f(q[0])},${f(q[1])}`;
      }
      setD(spiral, d);
      light.setAttribute('x1', f(cx - r)); light.setAttribute('y1', f(cy - SQ * r));
      light.setAttribute('x2', f(cx + r)); light.setAttribute('y2', f(cy + SQ * r));
      hub.setAttribute('cx', f(cx)); hub.setAttribute('cy', f(cy));
      hub.setAttribute('rx', f(rHub * 0.95)); hub.setAttribute('ry', f(SQ * rHub * 0.95)); hub.setAttribute('transform', rot);
      let sd = '';
      for (let k = 0; k < 3; k++) { const q = ell(cx, cy, rHub * 0.8, -spin + (k * 2 * Math.PI) / 3); sd += `M${f(cx)},${f(cy)} L${f(q[0])},${f(q[1])} `; }
      spokes.setAttribute('d', sd);
      // the first stretch, from wherever the coil's edge now is down to the route's start
      const D = ell(cx, cy, r, T_DEP), G = P.G, k = (G[1] - D[1]) / 2;
      setD(conn, `M${f(D[0])},${f(D[1])} C${f(D[0])},${f(D[1] + k)} ${f(G[0])},${f(G[1] - k)} ${f(G[0])},${f(G[1])}`);
    }
    // how much is out: first the stretch off the coil, then the route
    const sc = Math.min(s, connLen), sr = Math.max(0, s - connLen);
    for (const p of conn) p.style.strokeDasharray = `${f(sc * 1.15)} ${f(connLen * 3 + 50)}`;   // a touch over: the live stretch is a little longer
    for (const p of free) p.style.strokeDasharray = `${f(sr)} ${f(L + 50)}`;
    // (a dash of no length still draws its round end as a dot: hide what isn't out yet)
    for (const p of conn) p.style.visibility = sc > 0.5 ? '' : 'hidden';
    for (const p of free) p.style.visibility = sr > 0.5 ? '' : 'hidden';
    const i = sIndex(s), x = P.xs[i], y = P.ys[i];
    const done = s >= L - 0.5 && L > 0;
    tip.setAttribute('cx', f(x)); tip.setAttribute('cy', f(y));
    tip.style.opacity = s > 0.5 && !done ? '' : '0';
    if (done) {                                              // the blunt end, square across the wire
      const j = Math.max(0, i - 3), tx = x - P.xs[j], ty = y - P.ys[j], tl = Math.hypot(tx, ty) || 1;
      const nx = (-ty / tl) * widths[0] * 0.6, ny = (tx / tl) * widths[0] * 0.6;
      cap.setAttribute('x1', f(x - nx)); cap.setAttribute('y1', f(y - ny)); cap.setAttribute('x2', f(x + nx)); cap.setAttribute('y2', f(y + ny));
      cap.style.opacity = '';
    } else cap.style.opacity = '0';
    state.s = s; state.r = r; state.spin = spin; state.tip = [x, y];
    drawCost = drawCost * 0.9 + (performance.now() - t0) * 0.1;
  }

  /* ---------------- the loop: routes when the layout changes, follows the scroll ---------------- */
  const state = { s: 0, r: 0, spin: 0, tip: [0, 0], reroutes: 0, ratioBefore: null, ratioAfter: null, history: [] };
  let sCur = 0, needRoute = true, snap = true, req = 0, lastTs = 0;
  const target = () => sOfY(window.scrollY + TIP_AT * window.innerHeight);
  function frame(ts) {
    req = 0;
    if (needRoute) {
      needRoute = false;
      const ratio = P && P.L ? sCur / P.L : null;
      P = plan(measure());                                   // all the reading happens here, then only writes follow
      applyPlan();
      state.reroutes++;
      if (ratio !== null) {
        sCur = ratio * P.L;
        state.ratioBefore = ratio;
        state.ratioAfter = P.L ? sCur / P.L : 0;
        state.history = [...state.history.slice(-9), { before: ratio, after: state.ratioAfter, L: P.L }];
      }
    }
    if (!P) return;
    const t = target();
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (snap || reduceMotion) { sCur = t; snap = false; }
    else sCur += (t - sCur) * (1 - Math.exp(-dt / DAMP));
    if (Math.abs(t - sCur) < 0.25) sCur = t;
    draw(sCur);
    if (sCur !== t) req = requestAnimationFrame(frame);
    else lastTs = 0;
  }
  const schedule = () => { if (!req) req = requestAnimationFrame(frame); };
  const reroute = () => { needRoute = true; schedule(); };
  window.addEventListener('scroll', schedule, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(reroute, 150); });
  if (window.ResizeObserver) { const ro = new ResizeObserver(reroute); ro.observe(section); if (projects) ro.observe(projects); }
  if (furnace) furnace.addEventListener('furnacelayout', reroute);
  box.addEventListener('featuredlayout', reroute);
  box.addEventListener('load', reroute, true);              // each photo as it arrives (load doesn't bubble: captured)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reroute);
  window.addEventListener('load', reroute);
  reroute();

  /* ---------------- hooks for tests ---------------- */
  // check(): every pixel of both routes against the obstacles as they are (not blown up). The only contacts allowed are
  // where the wires meet the coil: the free end's first stretch off its edge and the fixed lead's drop onto its hub.
  window.__pictureWire = {
    state: () => ({ ...state, history: state.history.slice(), L: P ? P.L : 0, rFull: P ? P.coil.rFull : 0, rHub: P ? P.coil.rHub : 0, end: P ? P.E : null, coil: P ? P.coil : null,
      leadStart: P && P.m.lead ? [P.m.lead.x, P.m.lead.y] : null, leadEnd: P && P.leadS ? [P.leadS.xs[P.leadS.xs.length - 1], P.leadS.ys[P.leadS.ys.length - 1]] : null,
      routed: !!(P && P.freeS), leadRouted: !!(P && P.leadS), drawMs: drawCost, tipViewportY: P ? state.tip[1] - window.scrollY : 0 }),
    samples: () => (P ? { xs: P.xs.slice(), ys: P.ys.slice(), ss: P.ss.slice() } : null),
    obstacles: () => (P ? { free: P.obsFree, lead: P.obsLead, clearance: P.c } : null),
    check() {
      if (!P) return { ok: false, reason: 'no plan' };
      const hits = [];
      const inside = (r, x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
      const names = (list, n) => list.map((r, i) => ({ r, name: n(i) }));
      const m = P.m;
      const freeObs = [...names(m.frames, (i) => `photo ${i + 1}`), ...names(m.caps, (i) => `title ${i + 1}`), { r: m.heading, name: 'heading' }, { r: P.coil.rect, name: 'coil' }];
      if (P.freeS) {
        const S = P.freeS;
        for (let i = 0; i < S.xs.length; i++) for (const o of freeObs) if (inside(o.r, S.xs[i], S.ys[i])) hits.push({ wire: 'free', at: [f(S.xs[i]), f(S.ys[i])], obstacle: o.name });
      }
      if (P.leadS) {
        const S = P.leadS, goalY = P.leadGoal[1];
        const leadObs = [...names(m.leadObs, (i) => `furnace/list ${i + 1}`), ...freeObs];
        for (let i = 0; i < S.xs.length; i++) {
          for (const o of leadObs) {
            if (o.name === 'coil' && S.ys[i] >= goalY - 1 && Math.abs(S.xs[i] - P.coil.cx) < 1) continue;   // the drop onto the hub
            if (inside(o.r, S.xs[i], S.ys[i])) hits.push({ wire: 'lead', at: [f(S.xs[i]), f(S.ys[i])], obstacle: o.name });
          }
        }
      }
      return { ok: !!P.freeS && (!m.lead || !!P.leadS) && hits.length === 0, freeRouted: !!P.freeS, leadRouted: !!P.leadS, hits: hits.slice(0, 20), hitCount: hits.length };
    },
    reroute,
  };
})();
