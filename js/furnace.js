// The tube furnace in the projects section: a big quartz tube wound with a coiled-coil heater, running up to the right
// and off the edge of the window, with a thermocouple and three 7-segment meters, holding 1100 °C with an on/off
// controller (1098–1104 °C).
//
// The parts are placed in design units (about 1vw each at scale 1). layout() fits the whole setup (the tube's near end,
// the thermocouple, the start of the coil and the three meters) into the figure's box by one scale, whichever of width or
// height runs out first, and as far left as the text beside it allows, which leaves more of the tube in view on the right:
// the box is the right part of the section and one window tall under the header, so with the
// section's top under the header (where the header's "projects" link lands) everything is in view. Only the leads (in from
// the window's edges) leave it. The heating wire is one Kanthal wire from edge to edge: in from the left edge, under the
// list, through the ammeter, along the tube to 95% of the window's width, and off the right edge. The tube stops just
// after the coil.
//
// Layers, back to front, inside the figure's link (all built here):
//   back SVG (the thermocouple inside the tube) and the back half of the coil (a canvas), both under the glass, which
//   blurs and bends them; the glass (a rotated rounded box with a backdrop-filter, clipped to the tube's outline); the
//   front SVG (edges, the near rim, highlights, leads); the front half of the coil; the glow; the meters (CSS 3D boxes,
//   so leads pass behind their cases); the collars where leads join a case; and on top, invisible shapes that take the
//   pointer (the rest lets clicks through to the planets).
// The coil and the glow are canvases: their shapes are drawn once per layout into white masks, and each frame only
// recolours them (no SVG filter is animated).
(() => {
  const fig = document.querySelector('.furnace');
  if (!fig) return;
  const link = fig.querySelector('.furnace-link');
  const section = fig.closest('.projects');
  const list = section && section.querySelector('.project-list');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = window.matchMedia('(min-width: 768px)');
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------------- geometry: an orthographic view of a cylinder ---------------- */
  const AL = (20 * Math.PI) / 180;                 // the axis rises 20° to the right on screen
  const BE = (18 * Math.PI) / 180;                 // ... and tips 18° into the screen, so its circles are ellipses
  const R = 6.5;                                   // 13 units across
  const L = 80 / Math.cos(BE);                     // 80 units on screen: further than the helix can go in any window
  const C0 = [50, 28.2];                           // the centre of the near (left) end
  const a3 = [Math.cos(BE) * Math.cos(AL), -Math.cos(BE) * Math.sin(AL), -Math.sin(BE)];   // along the axis
  const n1 = [-Math.sin(AL), -Math.cos(AL), 0];                                            // across it, on screen ("up")
  const n2 = [Math.sin(BE) * Math.cos(AL), -Math.sin(BE) * Math.sin(AL), Math.cos(BE)];    // across it, toward the viewer
  const u = [Math.cos(AL), -Math.sin(AL)];                                                 // the axis on screen
  const down = [-n1[0], -n1[1]];                                                           // "down", across the tube
  const at = (s, rho, th) => [                     // a point s along the axis, rho from it, at angle th (3D: x, y, z)
    C0[0] + s * a3[0] + rho * (Math.cos(th) * n1[0] + Math.sin(th) * n2[0]),
    C0[1] + s * a3[1] + rho * (Math.cos(th) * n1[1] + Math.sin(th) * n2[1]),
    s * a3[2] + rho * Math.sin(th) * n2[2],
  ];
  const axisPt = (s, off = 0) => [C0[0] + s * a3[0] + off * n1[0], C0[1] + s * a3[1] + off * n1[1]];
  // a point in the tube's screen frame: a units along the tube from the near end's centre, c units across ("up")
  const P = (a, c) => [C0[0] + a * u[0] + c * n1[0], C0[1] + a * u[1] + c * n1[1]];
  const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const capRx = R * Math.sin(BE);                  // the ends' half-width along the axis
  const PAST_COIL = 2.5;                           // the tube's far end, this far along the axis past the coil's end
  const f = (v) => +v.toFixed(3);
  const pt = (p) => `${f(p[0])},${f(p[1])}`;

  // a point on a cubic Bézier, and its path
  const bez = (p, t) => {
    const m = 1 - t;
    return [0, 1].map((i) => m * m * m * p[0][i] + 3 * m * m * t * p[1][i] + 3 * m * t * t * p[2][i] + t * t * t * p[3][i]);
  };
  const bezD = (p) => `M${pt(p[0])} C${pt(p[1])} ${pt(p[2])} ${pt(p[3])}`;

  /* ---------------- the meters' places (cases span a0..a1 along the tube, c0..c1 across it) ---------------- */
  const TEMP = { a0: 4, a1: 24, c0: 9.1, c1: 18.1 };              // above the tube's left half
  const AMP = { a0: -3, a1: 12, c0: -18, c1: -11 };               // under the tube's near end
  const VOLT = { a0: 28, a1: 43, c0: -16.1, c1: -9.1 };           // under the tube, to the right
  // Each meter is a box seen in the tube's space: rotateZ(-AL) rotateY(BE) takes its long edge along the tube's axis, and
  // TX tips its face up, which shows the bottom face (the near end shows the left face, as the tube's does). The origin is
  // the middle of the front face, which is sized so it still covers the place above. The box is deep enough for its faces
  // to show about 15% of its height at these shallow angles.
  const TX = (16 * Math.PI) / 180, DEPTH = 0.54, PERSP = 140;
  const faceW = (m) => (m.a1 - m.a0) / Math.cos(BE);
  const faceH = (m) => (m.c1 - m.c0) / Math.cos(TX);
  const depth = (m) => DEPTH * (m.c1 - m.c0);
  const faceCtr = (m) => P((m.a0 + m.a1) / 2, (m.c0 + m.c1) / 2);
  // where a point of the box lands on screen: the same rotations and perspective as the CSS
  const boxPt = (m, x, y, z) => {
    const y1 = y * Math.cos(TX) - z * Math.sin(TX), z1 = y * Math.sin(TX) + z * Math.cos(TX);
    const x2 = x * Math.cos(BE) + z1 * Math.sin(BE), z2 = -x * Math.sin(BE) + z1 * Math.cos(BE);
    const k = PERSP / (PERSP - z2), c = faceCtr(m);
    return [c[0] + k * (x2 * Math.cos(AL) + y1 * Math.sin(AL)), c[1] + k * (-x2 * Math.sin(AL) + y1 * Math.cos(AL))];
  };
  const boxCorners = (m) => {
    const hw = faceW(m) / 2, hh = faceH(m) / 2, d = depth(m);
    return [[-hw, -hh, 0], [hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0], [-hw, -hh, -d], [-hw, hh, -d], [hw, hh, -d]].map((q) => boxPt(m, ...q));
  };
  // the outer edge of a meter's bottom face, a units along the tube: where a lead joins the case
  const sideOut = (m, a) => boxPt(m, (a - (m.a0 + m.a1) / 2) / Math.cos(BE), faceH(m) / 2, -depth(m));

  // the coiled coil: a small coil (~1.8 across) riding on a large helix just outside the glass, 3.4 units apart on screen,
  // unwinding at both ends into plain wire
  const RH = R * 1.04, RC = 0.68, PITCH = 3.4 / Math.cos(BE), S0 = 0.8;
  const TURNS = (L - S0) / PITCH;
  const SMALL = Math.round((2 * Math.PI * RH) / 1.1);    // small turns per big turn: a pitch of ~1.1, loops just apart
  const coilStart = at(S0, RH, Math.PI);                  // at the bottom of the near end
  const END_TH = 0.62 * Math.PI;                          // the coil ends on the tube's front, its wire heading down
  // the left lead's fixed part: from the coil's start straight down, in at the ammeter's top edge, out of its bottom face
  const ampOut = sideOut(AMP, AMP.a0 + 2.5);
  const leadDrop = [coilStart, add(coilStart, [0.25, 4]), [ampOut[0], ampOut[1] - 4], ampOut];

  // the helix up to the last place it's on the tube's front (at END_TH) left of xEnd; returns the two halves and that place
  function coilPolylines(xEnd) {
    const front = [], back = [];
    let cur = null, curFront = null;
    const push = (p, isFront) => {
      if (isFront !== curFront) {
        if (cur && cur.length) cur.push(p);       // the two halves meet at the tube's edge
        cur = [p];
        (isFront ? front : back).push(cur);
        curFront = isFront;
      } else cur.push(p);
    };
    const big = (t) => at(S0 + (L - S0) * t, RH, Math.PI + 2 * Math.PI * TURNS * t);
    const tOf = (k) => (2 * Math.PI * k + END_TH - Math.PI) / (2 * Math.PI * TURNS);
    let k = 1;
    while (big(tOf(k + 1))[0] <= xEnd) k++;
    const tEnd = tOf(k), n = Math.ceil(tEnd * TURNS * SMALL * 12);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * tEnd, th = Math.PI + 2 * Math.PI * TURNS * t;
      const B = big(t);
      const Bn = big(Math.min(1, t + 1e-5)), Bp = big(Math.max(0, t - 1e-5));
      let T = [Bn[0] - Bp[0], Bn[1] - Bp[1], Bn[2] - Bp[2]];
      const tl = Math.hypot(...T); T = T.map((v) => v / tl);
      const N1 = [0, 1, 2].map((j) => Math.cos(th) * n1[j] + Math.sin(th) * n2[j]);
      const N2 = [T[1] * N1[2] - T[2] * N1[1], T[2] * N1[0] - T[0] * N1[2], T[0] * N1[1] - T[1] * N1[0]];
      const ph = 2 * Math.PI * SMALL * TURNS * t, r = RC * Math.min(1, t * TURNS * 3, (tEnd - t) * TURNS * 3);   // unwinding at both ends
      push([B[0] + r * (Math.cos(ph) * N1[0] + Math.sin(ph) * N2[0]), B[1] + r * (Math.cos(ph) * N1[1] + Math.sin(ph) * N2[1])],
        Math.sin(th) > 0);
    }
    const a = big(tEnd - 1e-4), b = big(tEnd + 1e-4), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { front, back, end: big(tEnd), endDir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], endS: S0 + (L - S0) * tEnd };
  }

  /* ---------------- SVG helpers ---------------- */
  const el = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const layerSvg = (cls) => el('svg', { class: `furnace-layer ${cls}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const ellipsePts = (s, scale) => { const pts = []; for (let i = 0; i <= 72; i++) pts.push(at(s, R * scale, (i / 72) * 2 * Math.PI)); return pts; };
  const ellipsePath = (s, scale) => 'M' + ellipsePts(s, scale).map(pt).join(' L') + ' Z';
  const ringPath = (s) => {                        // the glass wall seen at the end: between the outer and inner ellipses
    const outer = ellipsePts(s, 1), inner = ellipsePts(s, 0.9).reverse();
    return `M${outer.map(pt).join(' L')} Z M${inner.map(pt).join(' L')} Z`;
  };
  const line = (a, b, cls, parent) => el('line', { class: cls, x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) }, parent);

  /* ---------------- back SVG: seen through the glass ---------------- */
  const back = layerSvg('furnace-back');
  // the thermocouple's sheath inside the tube, its tip near the middle of the part on screen
  const TC_OFF = -0.28 * R;
  const tcIn = axisPt(0, TC_OFF), tcTip = axisPt(L * 0.33, TC_OFF), tcOut = axisPt(-7 / Math.cos(BE), TC_OFF);
  line(tcIn, tcTip, 'f-sheath', back);
  line([tcIn[0], tcIn[1] - 0.18], [tcTip[0], tcTip[1] - 0.18], 'f-sheath-hl', back);

  /* ---------------- canvases ---------------- */
  const canvas = (cls) => { const c = document.createElement('canvas'); c.className = `furnace-layer ${cls}`; c.setAttribute('aria-hidden', 'true'); return c; };
  const backCv = canvas('furnace-coil furnace-coil-back');
  const frontCv = canvas('furnace-coil furnace-coil-front');
  const glowCv = canvas('furnace-glow');

  /* ---------------- the glass ---------------- */
  const glass = document.createElement('div');
  glass.className = 'furnace-glass';
  glass.style.transform = 'translate(-50%, -50%) rotate(-20deg)';
  // the bend near the edges (Chromium only): a displacement map across the tube, sampling inward near both edges
  const refract = document.getElementById('furnace-refract');
  const feImg = refract && refract.querySelector('feImage');
  const feMap = refract && refract.querySelector('feDisplacementMap');
  const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands.some((b) => /Chromium/.test(b.brand)));
  if (chromium && refract) document.documentElement.classList.add('furnace-svg-glass');
  if (feImg) {
    const stops = [[0, 236], [0.1, 196], [0.22, 150], [0.32, 128], [0.68, 128], [0.78, 106], [0.9, 60], [1, 20]];
    const s = stops.map(([o, g]) => `<stop offset='${o}' stop-color='rgb(128,${g},128)'/>`).join('');
    feImg.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' preserveAspectRatio='none'><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>${s}</linearGradient><rect width='10' height='10' fill='url(#g)'/></svg>`));
  }

  /* ---------------- front SVG ---------------- */
  const front = layerSvg('furnace-front');
  const defs = el('defs', {}, front);
  const hlGrad = el('linearGradient', { id: 'furnace-hl', gradientUnits: 'userSpaceOnUse',
    x1: f(axisPt(0)[0]), y1: f(axisPt(0)[1]), x2: f(axisPt(L)[0]), y2: f(axisPt(L)[1]) }, defs);
  for (const [o, a] of [[0, 0], [0.08, 0.9], [0.4, 0.6], [0.65, 0.85], [1, 0.7]]) el('stop', { offset: o, 'stop-color': '#eaf3ff', 'stop-opacity': a }, hlGrad);
  // the silhouette's long edges (layout() sets where these and the streaks stop: at the tube's far end)
  const edgeTop = line(axisPt(0, R), axisPt(L, R), 'f-edge', front);
  const edgeBot = line(axisPt(0, -R), axisPt(L, -R), 'f-edge', front);
  // the near end: its rim and the wall's thickness
  el('path', { class: 'f-ring', d: ringPath(0) }, front);
  el('path', { class: 'f-rim', d: ellipsePath(0, 1) }, front);
  el('path', { class: 'f-rim f-rim-inner', d: ellipsePath(0, 0.9) }, front);
  // the far end, the same
  const farRing = el('path', { class: 'f-ring' }, front);
  const farRim = el('path', { class: 'f-rim f-rim-far' }, front);
  const farInner = el('path', { class: 'f-rim f-rim-inner' }, front);
  // thin bright streaks along the top
  const hl1 = line(axisPt(L * 0.04, 0.74 * R), axisPt(L, 0.74 * R), 'f-hl f-hl-1', front);
  const hl2 = line(axisPt(L * 0.12, 0.56 * R), axisPt(L * 0.75, 0.56 * R), 'f-hl f-hl-2', front);
  // the thermocouple outside the tube
  line(tcOut, tcIn, 'f-sheath f-sheath-out', front);
  line([tcOut[0], tcOut[1] - 0.18], [tcIn[0], tcIn[1] - 0.18], 'f-sheath-hl', front);

  /* ---------------- meters: boxes in the tube's space ---------------- */
  const meters = document.createElement('div');
  meters.className = 'furnace-layer furnace-meters';
  meters.setAttribute('aria-hidden', 'true');
  const div = (cls, parent) => { const e = document.createElement('div'); e.className = cls; parent.appendChild(e); return e; };
  const hit = layerSvg('furnace-hit');
  const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '' };
  function segPolys(w, h, t) {
    const g = t * 0.18, hh = h / 2;
    const hz = (x0, x1, y) => [[x0, y], [x0 + t / 2, y - t / 2], [x1 - t / 2, y - t / 2], [x1, y], [x1 - t / 2, y + t / 2], [x0 + t / 2, y + t / 2]];
    const vt = (x, y0, y1) => [[x, y0], [x + t / 2, y0 + t / 2], [x + t / 2, y1 - t / 2], [x, y1], [x - t / 2, y1 - t / 2], [x - t / 2, y0 + t / 2]];
    const x0 = t / 2, x1 = w - t / 2, y0 = t / 2, y1 = h - t / 2;
    return {
      a: hz(x0 + g, x1 - g, y0), g: hz(x0 + g, x1 - g, hh), d: hz(x0 + g, x1 - g, y1),
      f: vt(x0, y0 + g, hh - g), b: vt(x1, y0 + g, hh - g), e: vt(x0, hh + g, y1 - g), c: vt(x1, hh + g, y1 - g),
    };
  }
  // a meter's digits drawn upright around its centre, on the front of a box turned with the tube
  function meter(m, { digits, dp, unit, dh }) {
    const { a0, a1, c0, c1 } = m;
    const w = a1 - a0, h = c1 - c0, ctr = faceCtr(m);
    const anchor = div('f-m3d', meters);
    for (const [k, v] of [['--w', faceW(m)], ['--h', faceH(m)], ['--d', depth(m)], ['--persp', PERSP]]) anchor.style.setProperty(k, f(v));
    div('f-shadow', anchor);
    const box = div('f-box', anchor);
    const side = div('f-side', box), bottom = div('f-bottom', box);
    const face = div('f-front', box);
    div('f-bevel', face);
    const rx = h * 0.1, pad = h * 0.13;
    face.style.setProperty('--pad', f(pad));
    div('f-win', face);
    const g = el('svg', { class: 'f-dial', viewBox: `${f(-w / 2)} ${f(-h / 2)} ${f(w)} ${f(h)}`, preserveAspectRatio: 'none' }, face);
    div('f-cover', face);
    const dw = dh * 0.52, gap = dh * 0.17, t = dh * 0.13, uw = dh * 0.62;
    const total = digits * dw + (digits - 1) * gap + gap * 1.1 + uw;
    const ox = -total / 2, oy = -dh / 2;
    const polys = segPolys(dw, dh, t);
    const lit = el('g', { class: 'f-digits' }, g);
    const cells = [];
    for (let i = 0; i < digits; i++) {
      const cell = el('g', { transform: `translate(${f(ox + i * (dw + gap))} ${f(oy)}) skewX(-6)` }, lit);
      const segs = {};
      for (const k of 'abcdefg') segs[k] = el('polygon', { class: 'f-seg', points: polys[k].map(pt).join(' ') }, cell);
      cells.push(segs);
    }
    let dot = null;
    if (dp != null) {
      const cx = ox + (dp + 1) * dw + dp * gap + gap / 2 - dh * 0.05;
      dot = el('rect', { class: 'f-seg', x: f(cx - t / 2), y: f(oy + dh - t), width: f(t), height: f(t), rx: f(t * 0.2) }, lit);
    }
    el('text', { class: 'f-unit', x: f(ox + digits * dw + (digits - 1) * gap + gap * 1.1), y: f(oy + dh), 'font-size': f(dh * 0.42) }, g).textContent = unit;
    el('rect', { transform: `translate(${pt(ctr)}) rotate(-20)`, x: f(-w / 2), y: f(-h / 2), width: f(w), height: f(h), rx: f(rx) }, hit);
    let shown = null;
    return {
      anchor,
      ctr,
      rect() {                                     // the box on screen, all its faces
        const rs = [face, side, bottom].map((e) => e.getBoundingClientRect());
        return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)),
          right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
      },
      set(str) {                                   // str: exactly `digits` characters, digits or spaces
        if (str === shown) return;
        shown = str;
        for (let i = 0; i < digits; i++) {
          const on = SEGS[str[i]] || '';
          for (const k of 'abcdefg') cells[i][k].classList.toggle('on', on.includes(k));
        }
        if (dot) dot.classList.add('on');
      },
    };
  }
  const tempM = meter(TEMP, { digits: 4, unit: '°C', dh: 5.2 });
  const ampM = meter(AMP, { digits: 3, dp: 1, unit: 'A', dh: 3.8 });
  const voltM = meter(VOLT, { digits: 3, unit: 'V', dh: 3.8 });

  /* ---------------- leads (in the front SVG, so they pass behind the meters' cases) ---------------- */
  const wires = el('g', {}, front);
  const wire = (cls, name) => { const p = el('path', { class: `f-wire ${cls}`, 'data-wire': name }, wires); const h = el('path', { class: 'hit-wire' }, hit); return { p, h }; };
  const setWire = (w, pts) => { const d = bezD(pts); w.p.setAttribute('d', d); w.h.setAttribute('d', d); };
  // the thermocouple's lead stays put (sheath -> temperature display)
  const tl = P(TEMP.a0 + 0.6, TEMP.c0);           // the temperature display's lower-left corner
  const tcLead = [tcOut, add(tcOut, [-1.6, -1.8]), [tl[0] - 6, tl[1] + 4.5], tl];
  setWire(wire('f-wire-gray', 'thermocouple'), tcLead);
  // the Kanthal's two leads: the coil's own gauge and shading, in its cold gray; layout() sets them, as they reach the window's edges
  const kanthal = (name) => {
    const ps = ['f-k1', 'f-k2', 'f-k3'].map((c) => el('path', { class: `f-kanthal ${c}` }, wires));
    ps[0].dataset.wire = name;
    return { ps, h: el('path', { class: 'hit-wire' }, hit) };
  };
  const curvesD = (cs) => cs.map((c, i) => (i ? `C${pt(c[1])} ${pt(c[2])} ${pt(c[3])}` : bezD(c))).join(' ');
  const setKanthal = (k, cs) => { const d = curvesD(cs); for (const p of k.ps) p.setAttribute('d', d); k.h.setAttribute('d', d); };
  const leadL = kanthal('kanthal-left'), leadR = kanthal('kanthal-right');
  const voltRed = wire('f-wire-red', 'voltmeter-red');
  const voltBlue = wire('f-wire-blue', 'voltmeter-blue');
  const voltJoint = el('circle', { class: 'f-joint', r: 0.42 }, wires);
  const caseBottom = Math.max(...boxCorners(AMP).map((p) => p[1]));
  const voltTop = P(VOLT.a1, VOLT.c1);            // the voltmeter's top-right corner: the right lead passes over it
  let hotL = [], hotR = [];                       // the first stretch of each lead, still glowing
  function edgeWires(xL, xR, yB, listU) {
    // left: on from the ammeter's bottom face, turning under its corner, then one long sweep below the list
    const yL = Math.max(caseBottom + 1.6, listU + 1.8);
    const sweep = [ampOut, [ampOut[0], yL], [ampOut[0] - (ampOut[0] - xL) * 0.45, yL], [xL - 1, yL]];
    setKanthal(leadL, [leadDrop, sweep]);
    hotL = hotStretch([leadDrop, sweep]);
    // right: off the tube's front and bottom edge, through the gap over the voltmeter's corner, off the right edge
    const e = coil.end;
    const curve = [e, add(e, coil.endDir, 3.5), [xR - 2.5, voltTop[1] - 0.75], [xR + 1, voltTop[1] + 1]];
    setKanthal(leadR, [curve]);
    hotR = hotStretch([curve]);
    // the voltmeter's: each leaves the bottom face square to the case. Red hangs slack, drooping under the ammeter and up
    // into the Kanthal just past it, so the meter reads across the heater's supply; blue goes off the right edge
    const t3 = sideOut(VOLT, VOLT.a0 + 3), t4 = sideOut(VOLT, VOLT.a0 + 12);
    const joint = bez(sweep, 0.12);
    const belly = joint[1] + Math.min(6, yB - joint[1] - 0.9);       // its lowest point: a slack droop, inside the section
    const slack = (Y) => [t3, add(t3, down, (Y - t3[1]) / -n1[1]), [joint[0] + (t3[0] - joint[0]) * 0.3, Y], joint];
    let lo = joint[1], hi = joint[1] + 40;                           // how deep the handles go to droop just that far
    for (let i = 0; i < 12; i++) {
      const Y = (lo + hi) / 2, c = slack(Y);
      if (Math.max(...Array.from({ length: 41 }, (_, j) => bez(c, j / 40)[1])) > belly) hi = Y; else lo = Y;
    }
    setWire(voltRed, slack(lo));
    voltJoint.setAttribute('cx', f(joint[0]));
    voltJoint.setAttribute('cy', f(joint[1]));
    setWire(voltBlue, [t4, add(t4, down, 2.6), [xR - 1, t4[1] + 5], [xR + 1, t4[1] + 7]]);
  }
  // the part of a lead that glows: its first 6% (at least 2 units, so it's a fade and not a hard stop), as points
  function hotStretch(cs) {
    const pts = [];
    for (const c of cs) for (let i = pts.length ? 1 : 0; i <= 80; i++) pts.push(bez(c, i / 80));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const want = Math.max(0.06 * len, 2), out = [pts[0]];
    for (let i = 1, d = 0; i < pts.length && d < want; i++) { d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); out.push(pts[i]); }
    return out;
  }

  /* ---------------- collars where the leads join a case (static: those joints never move) ---------------- */
  const terms = layerSvg('furnace-terms');
  const collar = (p, d) => {
    const a = add(p, d, -0.5), b = add(p, d, 0.5);
    line(a, b, 'f-collar', terms);
    line(a, b, 'f-collar-hl', terms);
  };
  {
    const cAcross = (p) => (p[0] - C0[0]) * n1[0] + (p[1] - C0[1]) * n1[1];      // how far "up" the tube's frame a point is
    let tIn = 0;
    while (tIn < 1 && cAcross(bez(leadDrop, tIn)) > AMP.c1) tIn += 0.005;
    const pIn = bez(leadDrop, tIn), pIn2 = bez(leadDrop, tIn + 0.01), lIn = Math.hypot(pIn2[0] - pIn[0], pIn2[1] - pIn[1]);
    collar(pIn, [(pIn2[0] - pIn[0]) / lIn, (pIn2[1] - pIn[1]) / lIn]);
    collar(ampOut, [0, 1]);
    collar(sideOut(VOLT, VOLT.a0 + 3), down);
    collar(sideOut(VOLT, VOLT.a0 + 12), down);
  }

  /* ---------------- hit shapes: the only parts that take the pointer ---------------- */
  const tubeHit = el('path', {}, hit);

  link.append(back, backCv, glass, front, frontCv, glowCv, meters, terms, hit);

  // the setup that must be in view: the meters, the near end, the start of the coil, the thermocouple and its lead
  const keep = [...boxCorners(TEMP), ...boxCorners(AMP), ...boxCorners(VOLT), ...ellipsePts(0, 1), tcOut, coilStart,
    ...Array.from({ length: 21 }, (_, i) => bez(tcLead, i / 20))];
  const CB = { x0: Math.min(...keep.map((p) => p[0])), x1: Math.max(...keep.map((p) => p[0])),
    y0: Math.min(...keep.map((p) => p[1])), y1: Math.max(...keep.map((p) => p[1])) };

  const tempX0 = Math.min(...boxCorners(TEMP).map((p) => p[0]));

  /* ---------------- layout: fit the setup into the box ---------------- */
  let scale = 1, dpr = 1, kGlow = 1;               // scale: css px per unit
  let view = { x: 0, y: 0, w: 100, h: 50 };        // the box, in units
  let coilBox = { x: 43, y: 0, w: 57, h: 50 }, glowBox = coilBox;
  let maskBack, maskFront, glowTight, glowWide, glowSun;
  let coil = null;
  const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  const strokeLines = (ctx, lines) => {
    ctx.beginPath();
    for (const ln of lines) { ctx.moveTo(ln[0][0], ln[0][1]); for (let i = 1; i < ln.length; i++) ctx.lineTo(ln[i][0], ln[i][1]); }
    ctx.stroke();
  };
  const place = (elm, box) => Object.assign(elm.style, {
    left: `${((box.x - view.x) / view.w) * 100}%`, top: `${((box.y - view.y) / view.h) * 100}%`,
    width: `${(box.w / view.w) * 100}%`, height: `${(box.h / view.h) * 100}%`,
  });

  let laidOut = '';
  function layout() {
    const vw = document.documentElement.clientWidth;
    const phone = !wide.matches;
    // on wider screens the box starts right of the list; the temperature display, level with the intro, stays right of that too
    let clearTemp = 0;
    if (!phone && section) {
      const sr = section.getBoundingClientRect();
      const rightOf = (sel) => {
        let right = 0;
        const range = document.createRange();         // the text's own lines, not the (full-width) blocks holding it
        for (const e of section.querySelectorAll(sel)) {
          range.selectNodeContents(e);
          for (const r of range.getClientRects()) right = Math.max(right, r.right - sr.left);
        }
        return right;
      };
      const gap = 0.015 * vw;
      const left = Math.round(Math.max(list.getBoundingClientRect().right - sr.left, rightOf('.project-name')) + gap);
      clearTemp = Math.max(0, rightOf('.section-title, .projects-intro') + gap - left);
      if (section.style.getPropertyValue('--furnace-left') !== `${left}px`) section.style.setProperty('--furnace-left', `${left}px`);
    }
    const w = fig.clientWidth, h = fig.clientHeight;
    const d = Math.min(window.devicePixelRatio || 1, 3);
    const fr = fig.getBoundingClientRect();
    const listB = list ? list.getBoundingClientRect().bottom - fr.top : 0, secB = section ? section.getBoundingClientRect().bottom - fr.top : h;
    const key = `${w}|${h}|${d}|${phone}|${Math.round(listB)}|${Math.round(secB)}|${Math.round(clearTemp)}`;
    if (!w || !h || key === laidOut) return;
    laidOut = key;
    dpr = d;
    // margins: clear of the header's blurred edge at the top, room for the leads to sweep in at the bottom
    const fade = Math.min(56, Math.max(28, 0.035 * window.innerWidth));
    const pageX = Math.min(48, Math.max(20, 0.034 * window.innerWidth));
    const mt = fade + 0.012 * vw, mb = Math.max(18, 0.03 * vw);
    const mr = phone ? pageX : 0.07 * vw;          // wider screens: room for more of the tube to show past the voltmeter
    scale = Math.min((w - mr - (phone ? pageX : 0)) / (CB.x1 - CB.x0), (h - mt - mb) / (CB.y1 - CB.y0));
    if (!phone) scale = Math.min(scale, (w - mr - clearTemp) / (CB.x1 - tempX0));
    const vwU = w / scale, vhU = h / scale;
    // phones: right-aligned; wider: as far left as the text allows, any spare width going to the tube on the right
    const x = phone ? CB.x1 + mr / scale - vwU : Math.min(CB.x0, tempX0 - clearTemp / scale);
    const y = phone ? (CB.y0 + CB.y1) / 2 - vhU / 2 : CB.y0 - mt / scale;   // phones: centred; wider: level with the heading
    view = { x, y, w: vwU, h: vhU };
    const vb = `${f(x)} ${f(y)} ${f(vwU)} ${f(vhU)}`;
    for (const s of [back, front, terms, hit]) s.setAttribute('viewBox', vb);
    for (const m of [tempM, ampM, voltM]) Object.assign(m.anchor.style, { left: `${((m.ctr[0] - x) / vwU) * 100}%`, top: `${((m.ctr[1] - y) / vhU) * 100}%` });
    fig.style.setProperty('--fu', `${scale}px`);
    coilBox = { x: Math.max(x, 42), y, w: x + vwU + 1 - Math.max(x, 42), h: vhU };
    glowBox = { x: 30, y, w: x + vwU + 1 - 30, h: vhU };
    place(backCv, coilBox); place(frontCv, coilBox); place(glowCv, glowBox);
    coil = coilPolylines(x + ((phone ? 0.93 : 0.95) * vw - fr.left) / scale);   // phones: room left for the lead's sweep
    cutTube(coil.endS + PAST_COIL, x, y, vwU, vhU);
    edgeWires(x - fr.left / scale, x + vwU, y + secB / scale, y + listB / scale);
    buildMasks();
    render(true);
  }

  // the tube stops just after the coil: its far end, and everything that runs along it, follow the coil's end
  function cutTube(end, x, y, vwU, vhU) {
    const setEnd = (ln, p) => { ln.setAttribute('x2', f(p[0])); ln.setAttribute('y2', f(p[1])); };
    setEnd(edgeTop, axisPt(end, R));
    setEnd(edgeBot, axisPt(end, -R));
    setEnd(hl1, at(end, R, Math.acos(0.74)));          // the streak is on the tube's front: it stops at the rim's front
    setEnd(hl2, axisPt(end * 0.85, 0.56 * R));
    farRing.setAttribute('d', ringPath(end));
    farRim.setAttribute('d', ellipsePath(end, 1));
    farInner.setAttribute('d', ellipsePath(end, 0.9));
    const outline = [];
    for (let i = 0; i <= 24; i++) outline.push(at(end, R, (i / 24) * Math.PI));                // round the far end ...
    for (let i = 0; i <= 24; i++) outline.push(at(0, R, Math.PI + (i / 24) * Math.PI));        // ... and the near one
    tubeHit.setAttribute('d', 'M' + outline.map(pt).join(' L') + ' Z');
    const mid = axisPt(end / 2), gw = end * Math.cos(BE) + 2 * capRx;
    Object.assign(glass.style, { aspectRatio: `${f(gw)} / ${2 * R}`, borderRadius: `${(capRx / gw) * 100}% / 50%`,
      left: `${((mid[0] - x) / vwU) * 100}%`, top: `${((mid[1] - y) / vhU) * 100}%`, width: `${(gw / vwU) * 100}%` });
  }

  function buildMasks() {
    const k = scale * dpr;
    const w = Math.round(coilBox.w * k), h = Math.round(coilBox.h * k);
    const coilW = Math.max(0.45, 3 / scale);       // 0.45 units, at least 3 css px
    for (const cv of [backCv, frontCv]) { cv.width = w; cv.height = h; }
    const mk = (lines) => {
      const c = offscreen(w, h), x = c.getContext('2d');
      x.setTransform(k, 0, 0, k, -coilBox.x * k, -coilBox.y * k);
      // a round wire: dimmer at its edges, full at its core (the colour goes on later, the alpha stays)
      Object.assign(x, { lineJoin: 'round', lineCap: 'round' });
      for (const [wk, a] of [[1, 0.5], [0.62, 0.8], [0.3, 1]]) { x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = coilW * wk; strokeLines(x, lines); }
      return c;
    };
    // a lead's first stretch, its colour (or glow) fading out along it over the plain gray wire underneath
    const fading = (x, pts, draw) => {
      x.lineCap = 'butt';
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - i / pts.length;
        x.beginPath(); x.moveTo(pts[i - 1][0], pts[i - 1][1]); x.lineTo(pts[i][0], pts[i][1]);
        draw(a);
      }
      x.lineCap = 'round';
    };
    maskBack = mk(coil.back);
    maskFront = mk(coil.front);
    const fx = maskFront.getContext('2d');
    for (const pts of [hotL, hotR]) for (const [wk, a0] of [[1, 0.5], [0.62, 0.8], [0.3, 1]]) {
      fx.lineWidth = coilW * wk;
      fading(fx, pts, (a) => { fx.strokeStyle = `rgba(255,255,255,${a0 * a})`; fx.stroke(); });
    }
    // the glow, at half resolution: only the blurred shadow of the strokes lands on the canvas (the strokes themselves are
    // drawn far off to the left), so it has no hard core
    kGlow = scale * Math.min(dpr, 2) * 0.5;
    const cw = Math.round(glowBox.w * kGlow), ch = Math.round(glowBox.h * kGlow);
    glowCv.width = Math.max(1, cw); glowCv.height = Math.max(1, ch);
    const OFF = cw + 400;
    const glow = (lineW, blur, alpha) => {
      const c = offscreen(cw, ch), x = c.getContext('2d');
      x.setTransform(kGlow, 0, 0, kGlow, -glowBox.x * kGlow - OFF, -glowBox.y * kGlow);
      Object.assign(x, { strokeStyle: `rgba(255,255,255,${alpha})`, lineWidth: lineW, lineJoin: 'round', lineCap: 'round',
        shadowColor: '#fff', shadowBlur: blur * kGlow, shadowOffsetX: OFF });
      strokeLines(x, coil.front.concat(coil.back));
      for (const pts of [hotL, hotR]) fading(x, pts, (a) => { x.globalAlpha = a; x.stroke(); });
      return c;
    };
    glowTight = glow(coilW, 0.7, 0.7);
    glowWide = glow(1.2, 2.6, 0.5);
    glowSun = glow(5, 11, 0.35);
    if (feImg) {                                  // the displacement map, in the glass's own pixels
      const w2 = glass.offsetWidth, h2 = glass.offsetHeight;
      for (const e of [refract, feImg]) { e.setAttribute('x', 0); e.setAttribute('y', 0); e.setAttribute('width', w2); e.setAttribute('height', h2); }
      feMap.setAttribute('scale', f(h2 * 0.14));
    }
  }

  /* ---------------- colour: hot metal ---------------- */
  const RAMP = [[450, [125, 130, 140]], [600, [142, 31, 14]], [750, [200, 52, 26]], [900, [255, 122, 30]], [1000, [255, 168, 51]], [1100, [255, 228, 107]], [1104, [255, 232, 120]]];
  const hot = (T) => {
    if (T <= RAMP[0][0]) return RAMP[0][1];
    for (let i = 1; i < RAMP.length; i++) {
      if (T <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], q = (T - t0) / (t1 - t0);
        return c0.map((v, j) => v + (c1[j] - v) * q);
      }
    }
    return RAMP[RAMP.length - 1][1];
  };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---------------- the controller and the thermal model ---------------- */
  // Cooling is Newton's law toward 25 °C; heating is a first-order rise toward a level just above the band. Their
  // constants come from the wanted timings: 1104 -> 1098 °C in 4 s off, 1098 -> 1104 °C in 2 s on, 25 -> 1104 °C in 8 s.
  const ROOM = 25, HI = 1104, LO = 1098, T_COOL = 4, T_REHEAT = 2, T_FIRST = 8;
  const TAU_C = T_COOL / Math.log((HI - ROOM) / (LO - ROOM));
  // heating: (Teq - HI)/(Teq - LO) = e^(-T_REHEAT/tau) and (Teq - HI)/(Teq - ROOM) = e^(-T_FIRST/tau); solve for Teq
  const q = T_FIRST / T_REHEAT;
  const fu = (x) => Math.pow(x / (x + (HI - LO)), q) - x / (x + (HI - ROOM));
  let lo = 1e-6, hi = 100;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (fu(lo) * fu(m) <= 0) hi = m; else lo = m; }
  const T_EQ = HI + (lo + hi) / 2;
  const TAU_H = T_REHEAT / Math.log((T_EQ - LO) / (T_EQ - HI));

  const sim = { T: ROOM, state: 'IDLE', time: 0, startAt: null, lastOff: null, lastOn: null, log: [] };
  const note = (msg) => { sim.log.push({ t: +sim.time.toFixed(3), msg }); console.log(`furnace: ${msg}`); };
  function step(dt) {
    sim.time += dt;
    let left = dt;
    while (left > 0) {
      if (sim.state === 'HEATING') {
        const need = TAU_H * Math.log((T_EQ - sim.T) / (T_EQ - HI));     // time until 1104 °C
        if (left < need) { sim.T = T_EQ - (T_EQ - sim.T) * Math.exp(-left / TAU_H); left = 0; }
        else {
          left -= need; sim.T = HI; sim.state = 'OFF';
          const now = sim.time - left;
          if (sim.lastOff === null) note(`first heat-up 25 -> 1104 °C took ${(now - sim.startAt).toFixed(2)} s`);
          else note(`cycle took ${(now - sim.lastOff).toFixed(2)} s (reheat ${(now - sim.lastOn).toFixed(2)} s)`);
          sim.lastOff = now;
        }
      } else if (sim.state === 'OFF') {
        const need = TAU_C * Math.log((sim.T - ROOM) / (LO - ROOM));     // time until 1098 °C
        if (left < need) { sim.T = ROOM + (sim.T - ROOM) * Math.exp(-left / TAU_C); left = 0; }
        else {
          left -= need; sim.T = LO; sim.state = 'HEATING';
          const now = sim.time - left;
          note(`cooled 1104 -> 1098 °C in ${(now - sim.lastOff).toFixed(2)} s`);
          sim.lastOn = now;
        }
      } else left = 0;
    }
  }

  /* ---------------- drawing a frame ---------------- */
  let flickA = 0, flickV = 0, nextFlick = 0;
  let drawnKey = '';
  function render(force = false) {
    if (!maskBack) return;
    const heating = sim.state === 'HEATING';
    const T = reduceMotion ? 1100 : sim.T;
    const on = reduceMotion || heating;
    // meters
    tempM.set(String(Math.round(T)).padStart(4, ' '));
    const amps = on ? 13.4 + (reduceMotion ? 0 : flickA * 0.1) : 0;
    ampM.set(amps.toFixed(1).replace('.', '').padStart(3, ' '));
    voltM.set(String(220 + (reduceMotion ? 0 : flickV)));
    // coil and glow
    const shimmer = on && !reduceMotion && T > 500;
    const key = `${T.toFixed(1)}|${on}`;
    if (!force && !shimmer && key === drawnKey) return;
    drawnKey = key;
    const br = on ? 1.15 : 1;
    const c = hot(T).map((v) => Math.min(255, Math.round(v * (T > 450 ? br : 1))));
    const fill = `rgb(${c[0]},${c[1]},${c[2]})`;
    const k = scale * dpr;
    for (const [cv, mask] of [[backCv, maskBack], [frontCv, maskFront]]) {
      const x = cv.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.clearRect(0, 0, cv.width, cv.height);
      x.drawImage(mask, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = fill;
      x.fillRect(0, 0, cv.width, cv.height);
      if (shimmer) {                              // a faint bright band sliding along the wire, toward the far end
        x.globalCompositeOperation = 'source-atop';
        const period = 24, band = 4, p = ((sim.time * 14) % period) - band;
        x.setTransform(k, 0, 0, k, -coilBox.x * k, -coilBox.y * k);
        const al = 0.32 * smooth(500, 900, T);
        for (let s = p - period; s < L + period; s += period) {
          const a = axisPt(s), b = axisPt(s + 2 * band);
          if (a[0] > coilBox.x + coilBox.w + 10) break;
          const g = x.createLinearGradient(a[0], a[1], b[0], b[1]);
          g.addColorStop(0, 'rgba(255,255,240,0)'); g.addColorStop(0.5, `rgba(255,255,240,${al})`); g.addColorStop(1, 'rgba(255,255,240,0)');
          x.fillStyle = g;
          x.fillRect(coilBox.x, coilBox.y, coilBox.w, coilBox.h);
        }
      }
    }
    const gx = glowCv.getContext('2d');
    gx.setTransform(1, 0, 0, 1, 0, 0);
    gx.globalCompositeOperation = 'source-over';
    gx.clearRect(0, 0, glowCv.width, glowCv.height);
    const aT = smooth(480, 900, T) * 0.45, aW = smooth(700, 1100, T) * 0.35, aS = smooth(850, 1100, T) * 0.4;
    if (aT + aW + aS > 0.001) {
      gx.globalCompositeOperation = 'lighter';
      for (const [m, a] of [[glowSun, aS], [glowWide, aW], [glowTight, aT]]) if (a > 0.001) { gx.globalAlpha = Math.min(1, a * br); gx.drawImage(m, 0, 0); }
      gx.globalAlpha = 1;
      gx.globalCompositeOperation = 'source-in';
      const gc = hot(T - 60).map((v) => Math.min(255, Math.round(v * br)));   // the glow a little deeper than the wire
      gx.fillStyle = `rgb(${gc[0]},${gc[1]},${gc[2]})`;
      gx.fillRect(0, 0, glowCv.width, glowCv.height);
    }
  }

  /* ---------------- sizing: once now, then whenever the box or the text beside it can change ---------------- */
  let pending = 0;
  const relayout = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; layout(); }); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(relayout); ro.observe(fig); if (section) ro.observe(section); }
  window.addEventListener('resize', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { laidOut = ''; layout(); });
  layout();

  /* ---------------- the loop: starts heating the first time the drawing is in view, pauses off screen ---------------- */
  let visible = false, running = false, lastTs = null, frozen = false;
  let cost = 0;
  function frame(ts) {
    if (!visible || frozen) { running = false; lastTs = null; return; }
    const dt = lastTs === null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    step(dt);
    if (sim.time >= nextFlick) {                  // the meters' last digits wander about twice a second
      flickA = [-1, 0, 1][Math.floor(Math.random() * 3)];
      flickV = [-1, 0, 1][Math.floor(Math.random() * 3)];
      nextFlick = sim.time + 0.4 + Math.random() * 0.2;
    }
    const t0 = performance.now();
    render();
    cost = cost * 0.95 + (performance.now() - t0) * 0.05;          // the furnace's own time per frame (ms, smoothed)
    requestAnimationFrame(frame);
  }
  const wake = () => { if (visible && !running && !frozen && !reduceMotion) { running = true; requestAnimationFrame(frame); } };
  if (!reduceMotion && window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (e.intersectionRatio >= 0.3 && sim.state === 'IDLE') { sim.state = 'HEATING'; sim.startAt = sim.time; note('heater on'); }
      }
      wake();
    }, { threshold: [0, 0.3] }).observe(fig);
  }

  /* ---------------- hooks for tests ---------------- */
  fig.furnaceLog = () => sim.log.slice();
  fig.furnaceInfo = () => ({ T: sim.T, state: sim.state, time: sim.time, TAU_C, TAU_H, T_EQ, msPerFrame: cost, scale, view, content: CB, coilEnd: coil && coil.end });
  fig.furnaceSet = ({ T, state } = {}) => { if (T != null) sim.T = T; if (state) sim.state = state; render(true); };
  fig.furnaceFreeze = (on) => { frozen = !!on; if (!frozen) wake(); };
  fig.furnaceStep = (dt) => { for (let t = 0; t < dt; t += 1 / 60) step(Math.min(1 / 60, dt - t)); render(true); };
  fig.furnaceMeters = () => [tempM, ampM, voltM].map((m) => m.rect());
})();
