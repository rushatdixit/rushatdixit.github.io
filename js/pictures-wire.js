// The Kanthal wire's other end. The furnace's left lead (js/furnace.js) stops just under its ammeter; from there this
// draws it on, as a fixed lead down to beside the "pictures" heading. As the reader scrolls, the wire is laid on down the
// section, its end keeping to 60% of the window's height: it weaves down the open side of each photo and across the gap
// to the open side of the next, and ends just under the last title. Scrolling back up draws it back in.
//
// The photos are placed at random on every visit, so the way is found on the live page: the photos, their titles and
// the heading are measured and blown up by a generous clearance, a waypoint is set in the free lane beside each photo,
// and an A* search on a coarse grid joins them up, preferring to keep going down the page. The corners are rounded off
// into a smooth cable, each checked against the obstacles again. The fixed lead is routed the same way, round the
// project list and the furnace's meters.
//
// The wire is drawn in one SVG laid over the page, under all text and images, that never takes the pointer.
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
  const AX = [Math.cos((20 * Math.PI) / 180), -Math.sin((20 * Math.PI) / 180)];
  const TIP_AT = 0.6;                   // the wire's end keeps to this height of the window
  const DAMP = 0.09;                    // seconds: how quickly it catches up (it is pulled, not snapped)
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
  // A wire is round metal lit from the top left: a soft shadow down-right, the steel body, a lighter mid-tone and a
  // narrow highlight, the lit strokes shifted toward the light. Shifted the same way whichever way the wire runs, the
  // highlight lands on its lit edge: the left of a run going down, the top of one going across.
  const SHIFT = [[0.45, 0.7], [0, 0], [-0.12, -0.12], [-0.24, -0.24]], WIDTH = [1.5, 1, 0.6, 0.22];
  const strand = (parent, extra = '') => [0, 1, 2, 3].map((i) => el('path', { class: `pw-s${i} ${extra}` }, parent));
  const setStrand = (ps, w) => ps.forEach((q, i) => {
    q.setAttribute('stroke-width', f(w * WIDTH[i]));
    q.setAttribute('transform', `translate(${f(SHIFT[i][0] * w)} ${f(SHIFT[i][1] * w)})`);
  });
  const gWire = el('g', {}, svg);
  const lead = strand(gWire);
  const laid = strand(gWire);
  const gDebug = debug ? el('g', { class: 'pw-debug' }, svg) : null;

  /* ---------------- the clearance round the wire's way ---------------- */
  // The clearance kept round the wire's way: what a roll of radius r and width `depth`, its axle running back at 20°,
  // would reach from its centre (r left and down, r plus the axle's offsets right and up, plus half the wire). It was
  // the coil's room; it keeps the wire well clear of the photos and gives the weave its lanes.
  const reach = (r, depth, hw) => ({ l: r + hw, r: r + depth * AX[0] + hw, u: r - depth * AX[1] + hw, d: r + hw });

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

  /* ---------------- the plan: where the wire starts, the way it is laid, and the fixed lead ---------------- */
  function plan(m) {
    const { W, vw, phone } = m;
    const c = phone ? 8 : Math.max(16, 1.5 * vw);           // clearance round everything
    const cs = phone ? 4 : 10;                               // grid cell
    const edgeM = phone ? 4 : 8;                             // how close that room may come to the window's sides
    const corner = (phone ? 3 : 2.5) * vw;
    const wire = m.lead && m.lead.width ? m.lead.width : Math.max(3, 0.45 * vw);   // the Kanthal's width, as the furnace draws it
    const hw = wire / 2;
    const rFull = (phone ? 6 : 2.4) * vw, rHub = (phone ? 1.8 : 0.8) * vw;
    const depth = rFull * 0.5;                               // the roll's width, back along the axle (it stays as it unwinds)
    const R = reach(rFull, depth, hw);
    // where it rests: just right of the heading, standing on its bottom line; just under it if there's no room beside it
    let cx = m.heading.x1 + c + R.l + cs, cy = m.heading.y1 - R.d;
    if (cx + R.r + edgeM > W) { cx = m.heading.x0 + R.l; cy = m.heading.y1 + c + R.u; }
    const C0 = [cx, cy];
    const restRect = { x0: cx - R.l, y0: cy - R.u, x1: cx + R.r, y1: cy + R.d };

    // The wire's way. A point on it must keep that reach plus c from every obstacle (to its left, right, above and
    // below), and the whole reach inside the window.
    const pad = { l: R.r + c, r: R.l + c, t: R.d + c, b: R.u + c };
    const xLo = edgeM + R.l, xHi = W - edgeM - R.r;
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
    const grid = makeGrid(obs, { x0: 0, y0: cy - R.u - 6 * cs, x1: W, y1: E[1] + 6 * cs }, pad, xLo, xHi, cs);
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
    // the corners rounded so that the way still keeps all that room
    const coilClear = clearOf(obs.map((r) => blowUp(r, { l: R.r + 2, r: R.l + 2, t: R.d + 2, b: R.u + 2 })));
    const path = pts ? smooth(simplify(pts), corner, coilClear) : null;

    // the fixed lead: from the furnace's stub, round the list and the meters, to just above where the laid wire starts, then down
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
        leadS = smooth(simplify(lp), corner, lc, restRect.y0 - leadGoal[1] - 1);   // done turning before the drop
      }
    }

    let ymax = null;
    if (path) {
      ymax = new Float32Array(path.ys.length);
      for (let i = 0; i < path.ys.length; i++) ymax[i] = Math.max(i ? ymax[i - 1] : -Infinity, path.ys[i]);
    }
    const tops = [restRect.y0];
    if (m.lead) tops.push(m.lead.y);
    return { m, c, cs, wire, hw, rFull, rHub, depth, C0, restRect, pad, obs, wps, E, raw, path, ymax, L: path ? path.L : 0,
      leadS, leadR, leadGoal, obsLead, top: Math.min(...tops) - 40, bottom: E[1] + R.d + 60 };
  }

  /* ---------------- drawing ---------------- */
  let P = null;                                              // the current plan
  const setD = (strokes, d) => { for (const p of strokes) p.setAttribute('d', d); };

  function applyPlan() {
    const { m, wire, top, bottom } = P;
    Object.assign(svg.style, { top: `${f(top)}px`, width: `${m.W}px`, height: `${f(bottom - top)}px` });
    svg.setAttribute('viewBox', `0 ${f(top)} ${m.W} ${f(bottom - top)}`);
    setStrand(lead, wire);
    setStrand(laid, wire);
    setD(lead, P.leadS ? P.leadS.d : '');
    setD(laid, P.path ? P.path.d : '');
    if (gDebug) {
      gDebug.textContent = '';
      const rect = (r) => el('rect', { x: f(r.x0), y: f(r.y0), width: f(r.x1 - r.x0), height: f(r.y1 - r.y0) }, gDebug);
      for (const r of P.obs) rect(blowUp(r, P.pad));
      for (const r of P.obsLead) rect(blowUp(r, { l: P.c, r: P.c, t: P.c, b: P.c }));
      for (const cells of [...P.raw, P.leadR || []]) if (cells.length) el('polyline', { points: cells.map((q) => `${f(q[0])},${f(q[1])}`).join(' ') }, gDebug);
      for (const w of [...P.wps, P.E]) el('circle', { cx: f(w[0]), cy: f(w[1]), r: 4 }, gDebug);
      if (!P.path) console.warn('pictures-wire: no way found for the wire');
      if (P.m.lead && !P.leadS) console.warn('pictures-wire: no route for the fixed lead');
    }
  }

  // the point at length s along the wire's way (between samples, so it glides)
  function pointAt(s) {
    const { ss, xs, ys } = P.path;
    let lo = 0, hi = ss.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ss[mid] < s) lo = mid + 1; else hi = mid; }
    if (lo === 0) return [xs[0], ys[0]];
    const t = (s - ss[lo - 1]) / ((ss[lo] - ss[lo - 1]) || 1);
    return [xs[lo - 1] + (xs[lo] - xs[lo - 1]) * t, ys[lo - 1] + (ys[lo] - ys[lo - 1]) * t];
  }
  // how much wire is laid when its end is to be level with page height y: the first length at which its way has
  // got down that far (a running maximum, so the length never jumps back where the way climbs)
  function sOfY(y) {
    if (!P || !P.path || y <= P.path.ys[0]) return 0;
    const ym = P.ymax;
    if (y >= ym[ym.length - 1] - 1) return P.L;              // (a pixel short of the bottom counts: scroll positions are rounded)
    let lo = 0, hi = ym.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ym[mid] < y) lo = mid + 1; else hi = mid; }
    return P.path.ss[lo];
  }

  let drawCost = 0;
  function draw(s) {
    const t0 = performance.now();
    // the wire laid so far, from beside the heading to its end (the strokes' round caps make the end)
    for (const p of laid) { p.style.strokeDasharray = `${f(s)} ${f(P.L + 50)}`; p.style.visibility = s > 0.5 ? '' : 'hidden'; }
    state.s = s;
    state.pos = P.path ? pointAt(s) : P.C0;
    drawCost = drawCost * 0.9 + (performance.now() - t0) * 0.1;
  }

  /* ---------------- the loop: routes when the layout changes, follows the scroll ---------------- */
  const state = { s: 0, pos: [0, 0], reroutes: 0, ratioBefore: null, ratioAfter: null, history: [] };
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
    state: () => ({ ...state, history: state.history.slice(), L: P ? P.L : 0,
      rest: P ? P.C0 : null, end: P ? P.E : null, routed: !!(P && P.path), leadRouted: !!(P && P.leadS),
      leadStart: P && P.m.lead ? [P.m.lead.x, P.m.lead.y] : null,
      leadEnd: P && P.leadS ? [P.leadS.xs[P.leadS.xs.length - 1], P.leadS.ys[P.leadS.ys.length - 1]] : null,
      drawMs: drawCost, posViewportY: state.pos[1] - window.scrollY }),
    samples: () => (P && P.path ? { xs: P.path.xs.slice(), ys: P.path.ys.slice(), ss: P.path.ss.slice() } : null),
    obstacles: () => (P ? { wire: P.obs, lead: P.obsLead, pad: P.pad, clearance: P.c } : null),
    // check(): every pixel of the wire's way against the photos, titles and heading as they are (not blown up) and the
    // window's sides; and the fixed lead against all of those and the list and meters.
    check() {
      if (!P) return { ok: false, reason: 'no plan' };
      const m = P.m, hits = [];
      const named = [...m.frames.map((r, i) => ({ r, name: `photo ${i + 1}` })), ...m.caps.map((r, i) => ({ r, name: `title ${i + 1}` })), { r: m.heading, name: 'heading' }];
      if (P.path) {
        const { xs, ys } = P.path;
        for (let i = 0; i < xs.length; i++) {
          for (const o of named) if (inside(o.r, xs[i], ys[i])) hits.push({ what: 'wire', at: [f(xs[i]), f(ys[i])], obstacle: o.name });
          if (xs[i] - P.hw < 0 || xs[i] + P.hw > m.W) hits.push({ what: 'wire', at: [f(xs[i]), f(ys[i])], obstacle: 'window edge' });
        }
      }
      if (P.leadS) {
        const { xs, ys } = P.leadS, goalY = P.leadGoal[1];
        const leadObs = [...m.leadObs.map((r, i) => ({ r, name: `furnace/list ${i + 1}` })), ...named, { r: P.restRect, name: 'start' }];
        for (let i = 0; i < xs.length; i++) for (const o of leadObs) {
          if (o.name === 'start' && ys[i] >= goalY - 1 && Math.abs(xs[i] - P.C0[0]) < 1) continue;   // the drop into it
          if (inside(o.r, xs[i], ys[i])) hits.push({ what: 'lead', at: [f(xs[i]), f(ys[i])], obstacle: o.name });
        }
      }
      return { ok: !!P.path && (!m.lead || !!P.leadS) && hits.length === 0, routed: !!P.path, leadRouted: !!P.leadS,
        waypoints: P.wps.length, figures: m.figs.length, hits: hits.slice(0, 20), hitCount: hits.length };
    },
    // zigzag(): at each photo's mid-height the wire's way is on that photo's open side
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
