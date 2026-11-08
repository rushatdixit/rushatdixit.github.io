// The Kanthal wire's other end. The furnace's left lead (js/furnace.js) stops just under its ammeter; from there this
// draws it on, as a fixed lead down to a coil of the same wire resting beside the "pictures" heading. As the reader
// scrolls, the coil rolls down the section, keeping to 60% of the window's height, and lays the wire out behind it: it
// weaves down the open side of each photo and across the gap to the open side of the next, shrinking as it gives wire
// and turning as it goes, until only its hub is left, just under the last title. Scrolling back up winds it in again.
//
// The photos are placed at random on every visit, so the way is found on the live page: the photos, their titles and
// the heading are measured and blown up by the coil's size plus a clearance, a waypoint is set in the free lane beside
// each photo, and an A* search on a coarse grid joins them up, preferring to keep going down the page. The corners are
// rounded off into a smooth cable, each checked against the obstacles again. The fixed lead is routed the same way, round
// the project list and the furnace's meters.
//
// Everything is drawn in one SVG laid over the page, under all text and images, that never takes the pointer.
// ?debugpath=1 also draws the blown-up obstacles, the waypoints and the raw grid routes; ?order=LRLR (js/featured.js)
// forces the photos' sides; window.__pictureWire has hooks for tests.
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
  const TIP_AT = 0.6;                   // the coil keeps to this height of the window
  const DAMP = 0.09;                    // seconds: how quickly it catches up (it is pulled, not snapped)
  const TURN = 6, UP = 25;              // A*: extra cost of a turn, and of every step up the page
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f = (v) => +v.toFixed(2);

  /* ---------------- the overlay: the wires first, the coil on top of them ---------------- */
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
  const gWire = el('g', {}, svg);
  const lead = strand(gWire);
  const laid = strand(gWire);
  const gCoil = el('g', { class: 'pw-coil' }, svg);
  const rims = [0, 1, 2].map((i) => el('ellipse', { class: `pw-rim pw-rim-${i}` }, gCoil));
  const face = el('ellipse', { class: 'pw-face' }, gCoil);
  const spiral = strand(gCoil, 'pw-spiral');
  const hub = el('ellipse', { class: 'pw-hub' }, gCoil);
  const spokes = el('path', { class: 'pw-spokes' }, gCoil);
  const gDebug = debug ? el('g', { class: 'pw-debug' }, svg) : null;

  /* ---------------- the coil's shape ---------------- */
  // a point rho from the coil's centre at angle t, on the slanted disc
  const ell = (cx, cy, rho, t) => {
    const lx = rho * Math.cos(t), ly = SQ * rho * Math.sin(t);
    return [cx + lx * CA - ly * SA, cy + lx * SA + ly * CA];
  };
  const halfX = (r) => Math.hypot(r * CA, SQ * r * SA);   // the ellipse's half-width and half-height on screen
  const halfY = (r) => Math.hypot(r * SA, SQ * r * CA);
  const T_OUT = Math.atan2(-SQ * SA, CA);                // where the spiral's outer end lies: the disc's right-hand edge

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
    m.figs = [...box.querySelectorAll('.featured')].map((fg) => ({
      frame: rectOf(fg.querySelector('.featured-frame')),
      cap: rectOf(fg.querySelector('figcaption')),
      right: fg.classList.contains('featured--right'),      // the photo hangs on the right: its open side is the left
    }));
    m.frames = m.figs.map((g) => g.frame);
    m.caps = m.figs.map((g) => g.cap);
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
        m.leadObs.push(page({ left, top, right: r.right ?? left + r.width, bottom: r.bottom ?? top + r.height }));
      }
      const red = furnace.querySelector('[data-wire="voltmeter-red"]');     // the voltmeter's slack red lead, as little boxes
      const ctm = red && red.getScreenCTM();
      if (ctm) {
        const len = red.getTotalLength();
        for (let i = 0; i <= 40; i++) {
          const q = red.getPointAtLength((i / 40) * len), p = new DOMPoint(q.x, q.y).matrixTransform(ctm);
          m.leadObs.push(page({ left: p.x - 2, top: p.y - 2, right: p.x + 2, bottom: p.y + 2 }));
        }
      }
    }
    return m;
  }

  /* ---------------- A* on a grid ---------------- */
  // The grid: cells whose centres fall inside an obstacle blown up by `pad` ({l, r, t, b}: how far a centre must keep to
  // the left of it, right, above and below), or outside [xLo, xHi], are blocked. Built once and searched for every leg.
  function makeGrid(obs, bounds, pad, xLo, xHi, cs, open = []) {
    const x0 = bounds.x0, y0 = bounds.y0;
    const cols = Math.max(2, Math.ceil((bounds.x1 - x0) / cs)), rows = Math.max(2, Math.ceil((bounds.y1 - y0) / cs));
    const blocked = new Uint8Array(cols * rows);
    const range = (lo, hi, o0, n) => [Math.max(0, Math.floor((lo - o0) / cs - 0.5) + 1), Math.min(n - 1, Math.ceil((hi - o0) / cs - 0.5) - 1)];
    const mark = (r, p, v) => {
      const [i0, i1] = range(r.x0 - p.l, r.x1 + p.r, x0, cols), [j0, j1] = range(r.y0 - p.t, r.y1 + p.b, y0, rows);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * cols + i] = v;
    };
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cs;
      if (x < xLo || x > xHi) for (let j = 0; j < rows; j++) blocked[j * cols + i] = 1;
    }
    for (const r of obs) mark(r, pad, 1);
    const zero = { l: 0, r: 0, t: 0, b: 0 };
    for (const r of open) mark(r, zero, 0);
    return { x0, y0, cols, rows, cs, blocked };
  }

  // S to E on the grid: 4-way moves, 1 a step, TURN for a turn, UP more for a step up, starting in direction startDir
  // (0 right, 1 down, 2 left, 3 up). Returns the cells' centres and the direction it arrives in, or null.
  function astar(G, S, E, startDir = 1) {
    const { x0, y0, cols, rows, cs } = G;
    const blocked = G.blocked.slice();
    const cellOf = (p) => [clamp(Math.floor((p[0] - x0) / cs), 0, cols - 1), clamp(Math.floor((p[1] - y0) / cs), 0, rows - 1)];
    const [si, sj] = cellOf(S), [ei, ej] = cellOf(E);
    blocked[sj * cols + si] = 0;
    blocked[ej * cols + ei] = 0;
    const goal = ej * cols + ei, N = cols * rows;
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
    const DI = [1, 0, -1, 0], DJ = [0, 1, 0, -1];
    const h = (i, j) => Math.abs(i - ei) + Math.abs(j - ej) + UP * Math.max(0, j - ej);
    const s0 = (sj * cols + si) * 4 + startDir;
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
    return { cells: cells.map((idx) => [x0 + ((idx % cols) + 0.5) * cs, y0 + (((idx / cols) | 0) + 0.5) * cs]), dir: found & 3 };
  }

  // the cells' centres lie up to half a cell off S and E: slide the first and last straight runs onto them exactly, and
  // keep every leg square
  function snapEnds(S, E, cells) {
    const c = cells.map((q) => q.slice());
    const same = (a, b) => Math.abs(a - b) < 1e-6;
    if (c.length >= 2) {
      const vert = same(c[0][0], c[1][0]), v0 = vert ? c[0][0] : c[0][1];
      for (let k = 0; k < c.length && same(vert ? c[k][0] : c[k][1], v0); k++) c[k][vert ? 0 : 1] = vert ? S[0] : S[1];
    } else if (c.length === 1) c[0] = [S[0], E[1]];
    if (c.length >= 2) {
      const n = c.length, vert = same(c[n - 1][0], c[n - 2][0]), v0 = vert ? c[n - 1][0] : c[n - 1][1];
      for (let k = n - 1; k >= 0 && same(vert ? c[k][0] : c[k][1], v0); k--) c[k][vert ? 0 : 1] = vert ? E[0] : E[1];
    }
    const p = [S];
    for (const q of [...c, E]) {
      const a = p[p.length - 1];
      if (!same(a[0], q[0]) && !same(a[1], q[1])) p.push([a[0], q[1]]);   // a slanted leg becomes down, then across
      p.push(q);
    }
    return p;
  }

  // drop repeats and the points in the middle of straight runs
  function simplify(p) {
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
  // Every corner becomes an arc of radius R (no more than half of either side, all of an end side, and lastMax for the
  // last), checked with isClear; a corner whose arc comes too close is rounded less and less until it doesn't. Returns
  // the SVG path, a sample every pixel or so (x, y, length so far) and the total length.
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
      corners.push({ P, r, arcPt, sweep: u[0] * v[1] - u[1] * v[0] > 0 ? 1 : 0 });
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
      const a = [xs[xs.length - 1], ys[ys.length - 1]], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1])));
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

  const blowUp = (r, p) => ({ x0: r.x0 - p.l, y0: r.y0 - p.t, x1: r.x1 + p.r, y1: r.y1 + p.b });
  const clearOf = (list) => (x, y) => !list.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);

  /* ---------------- the plan: where the coil rests, the way it rolls, and the fixed lead ---------------- */
  function plan(m) {
    const { W, vw, phone } = m;
    const c = phone ? 8 : Math.max(16, 1.5 * vw);           // clearance round everything
    const cs = phone ? 4 : 10;                               // grid cell
    const edgeM = phone ? 4 : 8;                             // how close the coil may come to the window's sides
    const corner = (phone ? 3 : 2.5) * vw;
    const w0 = Math.max(3, 0.45 * vw);
    const widths = m.lead && m.lead.widths ? m.lead.widths : [w0, w0 * 0.62, w0 * 0.3];
    const hw = widths[0] / 2;
    const rFull = (phone ? 7 : 3.2) * vw, rHub = (phone ? 2 : 0.8) * vw;
    const T = widths[0] * 2.4;                               // the roll's thickness: three layers of wire
    const hx = halfX(rFull) + hw, hy = halfY(rFull) + hw;   // the full coil's reach from its centre (its rims hang T lower)
    // where it rests: just right of the heading, sitting on its bottom line; just under it if there's no room beside it
    let cx = m.heading.x1 + c + hx + cs, cy = m.heading.y1 - hy - T;
    if (cx + hx + edgeM > W) { cx = m.heading.x0 + hx; cy = m.heading.y1 + c + hy; }
    const C0 = [cx, cy];
    const restRect = { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy + T };

    // The coil's way. A centre must keep hx + c to either side of an obstacle, hy + T + c above it (the rims hang below
    // the centre) and hy + c below it, and its whole coil inside the window.
    const pad = { l: hx + c, r: hx + c, t: hy + T + c, b: hy + c };
    const xLo = edgeM + hx, xHi = W - edgeM - hx;
    const obs = [...m.frames, ...m.caps, m.heading];
    // the waypoints: beside each photo, at its mid-height, in the middle of the free lane on its open side
    const wps = [];
    for (const g of m.figs) {
      const lo = g.right ? xLo : Math.max(g.frame.x1, g.cap.x1) + pad.r;
      const hi = g.right ? Math.min(g.frame.x0, g.cap.x0) - pad.l : xHi;
      if (hi - lo >= cs) wps.push([(lo + hi) / 2, (g.frame.y0 + g.frame.y1) / 2]);
    }
    // the end: under the last title (or photo), clear of both by the clearance, as near the title's middle as allowed
    const lastFig = m.figs[m.figs.length - 1];
    const E = lastFig
      ? [clamp((lastFig.cap.x0 + lastFig.cap.x1) / 2, xLo, xHi), Math.max(lastFig.cap.y1, lastFig.frame.y1) + pad.b + cs]
      : [cx, cy + 300];
    const grid = makeGrid(obs, { x0: 0, y0: cy - hy - T - 6 * cs, x1: W, y1: E[1] + 6 * cs }, pad, xLo, xHi, cs);
    // chain the legs: C0 -> each waypoint -> E (a waypoint it can't reach is skipped)
    let pts = [C0], dir = 1, from = C0;
    const raw = [];
    const stops = [...wps, E];
    for (let k = 0; k < stops.length; k++) {
      const leg = astar(grid, from, stops[k], dir);
      if (!leg) { if (k === stops.length - 1) { pts = null; break; } continue; }
      raw.push(leg.cells);
      pts = pts.concat(snapEnds(from, stops[k], leg.cells).slice(1));
      from = stops[k];
      dir = leg.dir;
    }
    // the corners rounded so that the coil (not just the wire) still keeps clear of everything
    const coilClear = clearOf(obs.map((r) => blowUp(r, { l: hx + 2, r: hx + 2, t: hy + T + 2, b: hy + 2 })));
    const path = pts ? smooth(simplify(pts), corner, coilClear) : null;

    // the fixed lead: from the furnace's stub, round the list and the meters, to just above the resting coil, then down
    // into its centre (where the laid wire starts)
    let leadS = null, leadR = null, leadGoal = null;
    const obsLead = [...m.leadObs, m.heading, restRect, ...m.frames, ...m.caps];
    if (m.lead) {
      const S = [m.lead.x, m.lead.y];
      leadGoal = [cx, restRect.y0 - c - cs / 2];
      const open = [{ x0: S[0] - cs, y0: S[1] - cs, x1: S[0] + cs, y1: S[1] + c + 2 * cs }];
      const uni = { l: c, r: c, t: c, b: c };
      const lg = makeGrid(obsLead, { x0: 0, y0: Math.min(S[1], leadGoal[1]) - 6 * cs, x1: W, y1: Math.max(S[1], leadGoal[1]) + 6 * cs }, uni, c, W - c, cs, open);
      const leg = astar(lg, S, leadGoal, 1);
      if (leg) {
        leadR = leg.cells;
        const lp = simplify(snapEnds(S, leadGoal, leg.cells));
        lp.push([leadGoal[0], cy]);
        const lc = clearOf([...m.leadObs, m.heading, ...m.frames, ...m.caps].map((r) => blowUp(r, { l: hw + 2, r: hw + 2, t: hw + 2, b: hw + 2 })));
        leadS = smooth(simplify(lp), corner, lc, restRect.y0 - leadGoal[1] - 1);   // done turning before it reaches the coil
      }
    }

    let ymax = null;
    if (path) {
      ymax = new Float32Array(path.ys.length);
      for (let i = 0; i < path.ys.length; i++) ymax[i] = Math.max(i ? ymax[i - 1] : -Infinity, path.ys[i]);
    }
    const tops = [restRect.y0];
    if (m.lead) tops.push(m.lead.y);
    return { m, c, cs, widths, rFull, rHub, T, C0, restRect, pad, obs, wps, E, raw, path, ymax, L: path ? path.L : 0,
      leadS, leadR, leadGoal, obsLead, top: Math.min(...tops) - 40, bottom: E[1] + hy + T + 60 };
  }

  /* ---------------- drawing ---------------- */
  let P = null;                                              // the current plan
  const setD = (strokes, d) => { for (const p of strokes) p.setAttribute('d', d); };
  const setW = (strokes, w) => strokes.forEach((p, i) => p.setAttribute('stroke-width', f(w[i])));

  function applyPlan() {
    const { m, widths, top, bottom } = P;
    Object.assign(svg.style, { top: `${f(top)}px`, width: `${m.W}px`, height: `${f(bottom - top)}px` });
    svg.setAttribute('viewBox', `0 ${f(top)} ${m.W} ${f(bottom - top)}`);
    for (const s of [lead, laid, spiral]) setW(s, widths);
    setD(lead, P.leadS ? P.leadS.d : '');
    setD(laid, P.path ? P.path.d : '');
    for (const r of rims) r.setAttribute('stroke-width', f(widths[2]));
    spokes.setAttribute('stroke-width', f(Math.max(1, widths[2])));
    hub.setAttribute('stroke-width', f(widths[2]));
    if (gDebug) {
      gDebug.textContent = '';
      const rect = (r) => el('rect', { x: f(r.x0), y: f(r.y0), width: f(r.x1 - r.x0), height: f(r.y1 - r.y0) }, gDebug);
      for (const r of P.obs) rect(blowUp(r, P.pad));
      for (const r of P.obsLead) rect(blowUp(r, { l: P.c, r: P.c, t: P.c, b: P.c }));
      for (const cells of [...P.raw, P.leadR || []]) if (cells.length) el('polyline', { points: cells.map((q) => `${f(q[0])},${f(q[1])}`).join(' ') }, gDebug);
      for (const w of [...P.wps, P.E]) el('circle', { cx: f(w[0]), cy: f(w[1]), r: 4 }, gDebug);
      if (!P.path) console.warn('pictures-wire: no way found for the coil');
      if (P.m.lead && !P.leadS) console.warn('pictures-wire: no route for the fixed lead');
    }
    lastKey = '';
  }

  // the point at length s along the coil's way (between samples, so it glides)
  function pointAt(s) {
    const { ss, xs, ys } = P.path;
    let lo = 0, hi = ss.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ss[mid] < s) lo = mid + 1; else hi = mid; }
    if (lo === 0) return [xs[0], ys[0]];
    const t = (s - ss[lo - 1]) / ((ss[lo] - ss[lo - 1]) || 1);
    return [xs[lo - 1] + (xs[lo] - xs[lo - 1]) * t, ys[lo - 1] + (ys[lo] - ys[lo - 1]) * t];
  }
  // how far along the coil should be when it is to be level with page height y: the first length at which its way has
  // got down that far (a running maximum, so the length never jumps back where the way climbs)
  function sOfY(y) {
    if (!P || !P.path || y <= P.path.ys[0]) return 0;
    const ym = P.ymax;
    if (y >= ym[ym.length - 1] - 1) return P.L;              // (a pixel short of the bottom counts: scroll positions are rounded)
    let lo = 0, hi = ym.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ym[mid] < y) lo = mid + 1; else hi = mid; }
    return P.path.ss[lo];
  }
  const radiusAt = (s) => {
    const { rFull, rHub, L } = P, frac = L ? clamp(s / L, 0, 1) : 0;
    return Math.sqrt(rHub * rHub + (rFull * rFull - rHub * rHub) * (1 - frac));
  };

  let lastKey = '', drawCost = 0;
  function draw(s) {
    const t0 = performance.now();
    const { widths, L, rFull, rHub, T } = P;
    const r = radiusAt(s);
    const spin = reduceMotion ? 0 : (2 * L * (rFull - r)) / (rFull * rFull - rHub * rHub);
    const [cx, cy] = P.path ? pointAt(s) : P.C0;
    // the wire laid so far, from where the coil rested to where it is now (under it)
    for (const p of laid) { p.style.strokeDasharray = `${f(s)} ${f(L + 50)}`; p.style.visibility = s > 0.5 ? '' : 'hidden'; }
    // the roll: its rim layers, top face and spiral, the hub and its spokes (turning as it rolls)
    const key = `${f(cx)},${f(cy)},${f(r)},${f(spin)}`;
    if (key !== lastKey) {
      lastKey = key;
      const deg = f((ANG * 180) / Math.PI);
      rims.forEach((e, i) => {
        const oy = cy + (T * (3 - i)) / 3;
        e.setAttribute('cx', f(cx)); e.setAttribute('cy', f(oy));
        e.setAttribute('rx', f(r)); e.setAttribute('ry', f(SQ * r));
        e.setAttribute('transform', `rotate(${deg} ${f(cx)} ${f(oy)})`);
      });
      const rot = `rotate(${deg} ${f(cx)} ${f(cy)})`;
      face.setAttribute('cx', f(cx)); face.setAttribute('cy', f(cy));
      face.setAttribute('rx', f(r)); face.setAttribute('ry', f(SQ * r)); face.setAttribute('transform', rot);
      const pitch = widths[0] * 1.15, turns = Math.max(0.6, (r - rHub) / pitch), n = Math.ceil(turns * 40);
      const t1 = T_OUT - spin, ta = t1 - 2 * Math.PI * turns;
      let d = '';
      for (let i = 0; i <= n; i++) {
        const q = ell(cx, cy, rHub + ((r - rHub) * i) / n, ta + ((t1 - ta) * i) / n);
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
    }
    state.s = s; state.r = r; state.spin = spin; state.pos = [cx, cy];
    drawCost = drawCost * 0.9 + (performance.now() - t0) * 0.1;
  }

  /* ---------------- the loop: routes when the layout changes, follows the scroll ---------------- */
  const state = { s: 0, r: 0, spin: 0, pos: [0, 0], reroutes: 0, ratioBefore: null, ratioAfter: null, history: [] };
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
  const inside = (r, x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  window.__pictureWire = {
    state: () => ({ ...state, history: state.history.slice(), L: P ? P.L : 0, rFull: P ? P.rFull : 0, rHub: P ? P.rHub : 0,
      rest: P ? P.C0 : null, end: P ? P.E : null, routed: !!(P && P.path), leadRouted: !!(P && P.leadS),
      leadStart: P && P.m.lead ? [P.m.lead.x, P.m.lead.y] : null,
      leadEnd: P && P.leadS ? [P.leadS.xs[P.leadS.xs.length - 1], P.leadS.ys[P.leadS.ys.length - 1]] : null,
      drawMs: drawCost, posViewportY: state.pos[1] - window.scrollY }),
    samples: () => (P && P.path ? { xs: P.path.xs.slice(), ys: P.path.ys.slice(), ss: P.path.ss.slice() } : null),
    obstacles: () => (P ? { coil: P.obs, lead: P.obsLead, pad: P.pad, clearance: P.c } : null),
    // check(): along the coil's whole way (every 2px), the coil as it is there (its size at that point) and the wire
    // under it, against the photos, titles and heading as they are (not blown up); and the fixed lead against all of
    // those and the list and meters. The lead's only contact is its drop into the resting coil.
    check() {
      if (!P) return { ok: false, reason: 'no plan' };
      const m = P.m, hits = [];
      const named = [...m.frames.map((r, i) => ({ r, name: `photo ${i + 1}` })), ...m.caps.map((r, i) => ({ r, name: `title ${i + 1}` })), { r: m.heading, name: 'heading' }];
      if (P.path) {
        const { xs, ys, ss } = P.path, hw = P.widths[0] / 2;
        let next = 0;
        for (let i = 0; i < xs.length; i++) {
          for (const o of named) if (inside(o.r, xs[i], ys[i])) hits.push({ what: 'wire', at: [f(xs[i]), f(ys[i])], obstacle: o.name });
          if (ss[i] < next && i < xs.length - 1) continue;
          next = ss[i] + 2;
          const r = radiusAt(ss[i]), hx = halfX(r) + hw, hy = halfY(r) + hw;
          const coil = { x0: xs[i] - hx, y0: ys[i] - hy, x1: xs[i] + hx, y1: ys[i] + hy + P.T };
          for (const o of named) if (overlap(coil, o.r)) hits.push({ what: 'coil', at: [f(xs[i]), f(ys[i])], obstacle: o.name });
          if (coil.x0 < 0 || coil.x1 > m.W) hits.push({ what: 'coil', at: [f(xs[i]), f(ys[i])], obstacle: 'window edge' });
        }
      }
      if (P.leadS) {
        const { xs, ys } = P.leadS, goalY = P.leadGoal[1];
        const leadObs = [...m.leadObs.map((r, i) => ({ r, name: `furnace/list ${i + 1}` })), ...named, { r: P.restRect, name: 'coil at rest' }];
        for (let i = 0; i < xs.length; i++) for (const o of leadObs) {
          if (o.name === 'coil at rest' && ys[i] >= goalY - 1 && Math.abs(xs[i] - P.C0[0]) < 1) continue;   // the drop into it
          if (inside(o.r, xs[i], ys[i])) hits.push({ what: 'lead', at: [f(xs[i]), f(ys[i])], obstacle: o.name });
        }
      }
      return { ok: !!P.path && (!m.lead || !!P.leadS) && hits.length === 0, routed: !!P.path, leadRouted: !!P.leadS,
        waypoints: P.wps.length, figures: m.figs.length, hits: hits.slice(0, 20), hitCount: hits.length };
    },
    // zigzag(): at each photo's mid-height the coil's way is on that photo's open side
    zigzag() {
      if (!P || !P.path) return { ok: false, figures: [] };
      const { xs, ys } = P.path;
      const figures = P.m.figs.map((g) => {
        const y = (g.frame.y0 + g.frame.y1) / 2;
        let best = -1;
        for (let i = 0; i < ys.length; i++) if (best < 0 || Math.abs(ys[i] - y) < Math.abs(ys[best] - y)) best = i;
        const x = xs[best], ok = g.right ? x < g.frame.x0 : x > g.frame.x1;
        return { side: g.right ? 'R' : 'L', x: f(x), ok };
      });
      return { ok: figures.every((q) => q.ok), figures };
    },
    reroute,
  };
})();
