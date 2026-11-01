// The electric field of point charges in the first screen: the page's bottom-most layer (everything else draws over it).
// It comes from Poisson's equation, del^2 V = -rho / eps0. The charges are points, so rho is a sum of delta functions and
// the solution is the sum of their Coulomb potentials, V = sum q / (4 pi eps0 r), with E = -grad V = sum q r^ / (4 pi
// eps0 r^2), evaluated in the plane of the screen. Drawn at the device's full resolution: muted log-scale colours for |E|
// (a WebGL shader at half resolution, scaled up smoothly), and smooth field lines with arrowheads from + to -. It starts
// with +q and -q (a dipole) along a random tilt, each charge labelled in KaTeX; visitors add charges by clicking an empty spot in the first screen, drag them
// to move them, and click one to remove it. Nothing runs between changes: the canvas keeps its last image.
(() => {
  const canvas = document.querySelector('.field-canvas');
  const eq = document.querySelector('.field-eq');
  const controls = document.querySelector('.field-controls');
  const layer = document.querySelector('.charges');
  const hero = document.querySelector('.hero');
  const slot = document.querySelector('.field-slot');
  if (!canvas || !eq || !controls || !layer || !hero) return;
  const hint = controls.querySelector('.field-hint');
  const toggles = [...controls.querySelectorAll('[data-sign]')];
  const resetBtn = controls.querySelector('.field-reset');

  const MAX_CHARGES = 10;
  const LINES_PER_CHARGE = 16;           // field lines per unit of charge, evenly round each + charge
  const COLOR_END = 1.5, LINE_END = 2;   // the colours and the lines fade to nothing by these many screen heights down
  const RED = [115, 26, 28], BLUE = [26, 43, 115];   // the strong and the slight field (about 45% at most: text stays readable)
  // where a lone unit charge's |E| is red, blue and black, in field units from it (the colour scale is log |E|): a field
  // unit is a twentieth of the starting charges' spacing, i.e. 1vw, but larger on phones, where the spacing has a floor
  const RED_AT = 2.5, BLUE_AT = 7, BLACK_AT = 20;
  const LINE_ALPHA = 0.7, LINE_W = 1.25;
  const HINT_KEY = 'field-hint-done';

  // the tilt of the two starting charges: random each load, 20-70 degrees either way (?field=<degrees> fixes it, for tests)
  const forced = parseFloat(new URLSearchParams(location.search).get('field'));
  const tilt = Number.isFinite(forced) ? forced : (Math.random() < 0.5 ? -1 : 1) * (20 + 50 * Math.random());

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const vwPx = () => document.documentElement.clientWidth;
  const discR = () => Math.max(0.012 * vwPx(), 13);   // charge disc radius: 2.4vw across, at least 26px
  const spacing = () => (vwPx() <= 700 ? Math.max(0.2 * vwPx(), 130) : 0.2 * vwPx());   // the starting charges, apart
  const fieldUnit = () => spacing() / 20;

  /* ---- Poisson's equation under the starting charges (KaTeX when it has loaded, plain text otherwise) ---- */
  function typeset() {
    const main = eq.querySelector('.field-eq-main');
    if (window.katex) katex.render('\\nabla^2 V = -\\frac{\\rho}{\\varepsilon_0}', main, { throwOnError: false });
    else main.textContent = '∇²V = −ρ/ε₀';
  }

  /* ---- what the charges, the equations and the control keep clear of: the name, "this is him!" and its arrow, "to learn
     more..", the subtitle and the photo (page px) ---- */
  const pageRect = (el) => {
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY };
  };
  function obstacles() {
    const out = ['.name', '.callout-text', '.hero-tagline', '.scroll-cue', '.portrait'].map((s) => pageRect(document.querySelector(s))).filter(Boolean);
    for (const path of document.querySelectorAll('.callout-line, .callout-head')) {     // the hand-drawn arrow, as small boxes
      if (!path.getClientRects().length || !path.getAttribute('d')) continue;
      const svg = path.ownerSVGElement.getBoundingClientRect(), len = path.getTotalLength();
      for (let s = 0; s <= len; s += 6) {
        const p = path.getPointAtLength(s), x = svg.left + scrollX + p.x, y = svg.top + scrollY + p.y;
        out.push({ l: x - 3, t: y - 3, r: x + 3, b: y + 3 });
      }
    }
    return out;
  }
  const hit = (a, q, m = 0) => a.l < q.r + m && q.l < a.r + m && a.t < q.b + m && q.t < a.b + m;
  const discBox = (x, y, r) => ({ l: x - r, t: y - r, r: x + r, b: y + r });

  /* ---- each charge's label, +q or -q in KaTeX, beside its disc's top right ---- */
  function typesetLabel(el, q) {
    if (window.katex) katex.render(q > 0 ? '+q' : '-q', el, { throwOnError: false });
    else el.textContent = q > 0 ? '+q' : '−q';
  }
  let labelSizes = {};                   // measured once per sign (and again when the layout changes: the size follows vw)
  function labelSize(q) {
    if (!labelSizes[q]) {
      const el = document.createElement('span');
      el.className = 'charge-label';
      el.style.visibility = 'hidden';
      typesetLabel(el, q);
      layer.appendChild(el);
      labelSizes[q] = [el.offsetWidth, el.offsetHeight];
      el.remove();
    }
    return labelSizes[q];
  }
  // where the label goes for a charge at (x, y), and the box the charge and its label take up together
  function labelBox(x, y, q) {
    const r = discR(), [w, h] = labelSize(q), l = x + 0.75 * r + 4, b = y - 0.6 * r;
    return { l, t: b - h, r: l + w, b };
  }
  function chargeBox(x, y, q) {
    const d = discBox(x, y, discR()), lb = labelBox(x, y, q);
    return { l: Math.min(d.l, lb.l), t: Math.min(d.t, lb.t), r: Math.max(d.r, lb.r), b: Math.max(d.b, lb.b) };
  }

  /* ---- the starting layout: +q and -q along the tilt; Poisson's equation right above the control, just left of the photo
     above the subtitle (on phones, the equation and then the control under the charges) ---- */
  const START_Q = [1, -1];
  let lay = null;    // { starts: [[x, y], [x, y]], eqBox, ctrlBox, right: both hang from their right edges, obs }
  function place() {
    const vw = vwPx(), r = discR(), a = (tilt * Math.PI) / 180;
    const D = spacing();
    const dx = (Math.cos(a) * D) / 2, dy = (Math.sin(a) * D) / 2;
    const eqW = eq.offsetWidth, eqH = eq.offsetHeight, cW = controls.offsetWidth, cH = controls.offsetHeight;
    const gap = Math.max(10, 0.008 * vw), gap2 = Math.max(8, 0.006 * vw);
    const obs = obstacles(), heroR = pageRect(hero);
    const edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-gap')) || 16;
    const grow = (q) => ({ l: q.l - 4, t: q.t - 4, r: q.r + 4, b: q.b + 4 });
    const group = (cx, cy, withCtrl) => {
      const starts = [[cx - dx, cy - dy], [cx + dx, cy + dy]], low = cy + Math.abs(dy) + r;
      const eqBox = { l: cx - eqW / 2, t: low + gap, r: cx + eqW / 2, b: low + gap + eqH };
      const ctrlBox = withCtrl ? { l: cx - cW / 2, t: eqBox.b + gap2, r: cx + cW / 2, b: eqBox.b + gap2 + cH } : null;
      return { starts, eqBox, ctrlBox, boxes: [...starts.map(([x, y], i) => grow(chargeBox(x, y, START_Q[i]))), eqBox] };
    };
    const sl = pageRect(slot);
    if (sl) {                                       // phones: centred in the room between the name and the photo, control under it all
      const h = 2 * Math.abs(dy) + 2 * r + gap + eqH + gap2 + cH;
      return { ...group((sl.l + sl.r) / 2, (sl.t + sl.b) / 2 - h / 2 + Math.abs(dy) + r, true), right: false, obs };
    }
    // the control on the subtitle's right edge (just left of the photo), a little above it, and the equation right above the
    // control, flush right with it; the charges keep clear of both
    const photo = pageRect(document.querySelector('.portrait')), name = pageRect(document.querySelector('.name'));
    const tag = pageRect(document.querySelector('.hero-tagline'));
    const right = tag ? tag.r : (photo ? photo.l : heroR.r) - edge, base = tag ? tag.t : heroR.b - edge;
    const ctrlBox = { l: right - cW, t: base - gap2 - cH, r: right, b: base - gap2 };
    const eqBox = { l: right - eqW, t: ctrlBox.t - gap2 - eqH, r: right, b: ctrlBox.t - gap2 };
    obs.push(grow(ctrlBox), grow(eqBox));
    const charges2 = (cx, cy) => { const g = group(cx, cy); return { starts: g.starts, boxes: g.boxes.slice(0, 2) }; };
    // the charges: the spot closest to the middle of the gap between the text and the photo, with room
    const free = { l: heroR.l + edge, t: heroR.t + edge, r: (photo ? photo.l : heroR.r) - edge * 0.5, b: heroR.b - edge };
    const want = [(free.l + free.r) / 2, ((name ? name.b : free.t) + (tag ? tag.t : free.b)) / 2];
    for (const m of [0.03, 0.02, 0.01, 0.005].map((k) => k * vw)) {
      let best = null, bd = Infinity;
      for (let cy = free.t; cy <= free.b; cy += 8) {
        for (let cx = free.l; cx <= free.r; cx += 8) {
          const d = Math.hypot(cx - want[0], cy - want[1]);
          if (d >= bd) continue;
          const g = charges2(cx, cy);
          if (g.boxes.some((q) => q.l < free.l || q.r > free.r || q.t < free.t || q.b > free.b)) continue;
          if (obs.some((o) => g.boxes.some((q) => hit(q, o, m)))) continue;
          best = g; bd = d;
        }
      }
      if (best) return { starts: best.starts, eqBox, ctrlBox, right: true, obs };
    }
    return { starts: charges2(want[0], want[1]).starts, eqBox, ctrlBox, right: true, obs };   // nothing fits cleanly: the middle anyway
  }

  /* ---- the charges: real buttons (crisp, focusable, draggable on touch), positioned in page px ---- */
  let charges = [];   // { x, y, q, el, start: the starting spot it still sits on (or -1), fx, fy: its place as a share of the hero }
  const keepFrac = (c) => { const h = pageRect(hero); c.fx = (c.x - h.l) / (h.r - h.l); c.fy = (c.y - h.t) / (h.b - h.t); };
  function makeCharge(x, y, q, start = -1) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'charge ' + (q > 0 ? 'is-pos' : 'is-neg');
    el.textContent = q > 0 ? '+' : '−';
    el.setAttribute('aria-label', (q > 0 ? 'positive' : 'negative') + ' charge: drag to move, click to remove');
    const label = document.createElement('span');
    label.className = 'charge-label';
    label.setAttribute('aria-hidden', 'true');
    typesetLabel(label, q);
    layer.appendChild(label);
    const c = { x, y, q, el, label, start };
    keepFrac(c);
    wire(c);
    layer.appendChild(el);
    charges.push(c);
    position(c);
    return c;
  }
  function position(c) {
    const r = discR();
    Object.assign(c.el.style, { left: c.x - r + 'px', top: c.y - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', fontSize: 1.3 * r + 'px' });
    const lb = labelBox(c.x, c.y, c.q);
    Object.assign(c.label.style, { left: lb.l + 'px', top: lb.t + 'px' });
  }
  function removeCharge(c) {
    const focused = document.activeElement === c.el;
    c.el.remove();
    c.label.remove();
    charges = charges.filter((o) => o !== c);
    if (focused) (toggles.find((t) => t.getAttribute('aria-pressed') === 'true') || toggles[0]).focus();
    render();
  }
  // can a charge of sign q sit at (x, y)? it and its label inside the first screen, clear of the text, the photo, the
  // equations, the control, and the other charges and their labels
  function free(x, y, q, except = null) {
    if (!lay) return false;
    const box = chargeBox(x, y, q), b = pageRect(hero);
    if (box.l < b.l + 2 || box.r > b.r - 2 || box.t < b.t + 2 || box.b > b.b - 2) return false;
    if (lay.obs.some((o) => hit(box, o, 4)) || hit(box, pageRect(eq), 4) || hit(box, pageRect(controls), 4)) return false;
    return !charges.some((o) => o !== except && hit(box, chargeBox(o.x, o.y, o.q), 4));
  }
  function addCharge(x, y, q) {
    if (charges.length >= MAX_CHARGES || !free(x, y, q)) return false;
    makeCharge(x, y, q);
    dismissHint();
    render();
    return true;
  }
  function addRandom(q) {
    if (charges.length >= MAX_CHARGES) return false;
    const b = pageRect(hero), r = discR();
    for (let k = 0; k < 300; k++) {
      const x = b.l + r + Math.random() * (b.r - b.l - 2 * r), y = b.t + r + Math.random() * (b.b - b.t - 2 * r);
      if (free(x, y, q)) return addCharge(x, y, q);
    }
    return false;
  }
  function reset() {
    for (const c of charges) { c.el.remove(); c.label.remove(); }
    charges = [];
    if (lay) lay.starts.forEach(([x, y], i) => makeCharge(x, y, START_Q[i], i));
    render();
  }

  // drag to move; a press without a drag removes it (Enter/Space on a focused charge too)
  function wire(c) {
    let down = null, dragging = false;
    c.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      c.el.setPointerCapture(e.pointerId);
      down = { px: e.pageX, py: e.pageY, x: c.x, y: c.y };
      dragging = false;
    });
    c.el.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!dragging && Math.hypot(e.pageX - down.px, e.pageY - down.py) < 4) return;
      if (!dragging) { dragging = true; c.el.classList.add('is-dragging'); }
      const x = down.x + e.pageX - down.px, y = down.y + e.pageY - down.py;
      if (!free(x, y, c.q, c)) return;              // blocked: it stays at its last good spot
      c.x = x; c.y = y; c.start = -1;
      position(c);
      schedule();
    });
    c.el.addEventListener('pointerup', () => {
      if (!down) return;
      down = null;
      if (dragging) { c.el.classList.remove('is-dragging'); keepFrac(c); dragging = false; render(); }
      else removeCharge(c);
    });
    c.el.addEventListener('pointercancel', () => {
      if (!down) return;
      down = null; dragging = false;
      c.el.classList.remove('is-dragging'); keepFrac(c); render();
    });
    c.el.addEventListener('click', (e) => { if (e.detail === 0) removeCharge(c); });   // keyboard: Enter / Space
  }

  // live redraws while dragging: at most one per frame, with quicker lines; a full one when the drag ends
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(true); });
  }

  /* ---- the control: + / - toggle, reset, and the one-time hint ---- */
  let sign = 1;
  const choose = (q) => { sign = q; for (const t of toggles) t.setAttribute('aria-pressed', String(+t.dataset.sign === q)); };
  for (const t of toggles) {
    t.addEventListener('click', () => choose(+t.dataset.sign));
    t.addEventListener('keydown', (e) => {           // Enter on a toggle: that sign, placed at a random free spot
      if (e.key !== 'Enter') return;
      e.preventDefault();
      choose(+t.dataset.sign);
      addRandom(sign);
    });
  }
  resetBtn.addEventListener('click', reset);
  let hintDone = false;
  try { hintDone = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* storage blocked: show it this time */ }
  if (hint) hint.hidden = hintDone;
  function dismissHint() {
    if (hintDone) return;
    hintDone = true;
    if (hint) hint.hidden = true;
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* not remembered: fine */ }
  }

  // a click on an empty spot of the first screen adds a charge there (text, links, the photo and the control keep their clicks)
  hero.addEventListener('click', (e) => {
    if (e.target !== hero && e.target !== slot) return;
    addCharge(e.pageX, e.pageY, sign);
  });

  /* ---- the colours: |E| on a log scale, a WebGL shader at half resolution (or the CPU on a grid without WebGL) ---- */
  const FRAG = `
precision highp float;
uniform vec2 uRes;          // the half-resolution canvas, in its pixels
uniform vec2 uCss;          // the page area it covers, in css px
uniform float uVw;          // the field unit in css px (distances in the field are in these units)
uniform vec3 uQ[${MAX_CHARGES}];       // the charges: x, y (css px), q
uniform int uN;
uniform float uRmin;        // |E| stops growing this close to a charge (field units)
uniform vec3 uU;            // log |E| where it is black, blue, red
uniform vec2 uFade;         // the colours fade out between these css rows
uniform vec3 uRed, uBlue;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uCss;
  vec2 e = vec2(0.0);
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uN) break;
    vec2 d = (p - uQ[i].xy) / uVw;
    float r2 = max(dot(d, d), uRmin * uRmin);
    e += uQ[i].z * d / (r2 * sqrt(r2));
  }
  float u = log(max(length(e), 1e-12));
  float tb = smoothstep(uU.x, uU.y, u), tr = smoothstep(uU.y, uU.z, u);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, p.y);
  gl_FragColor = vec4(fade * (uBlue * tb * (1.0 - tr) + uRed * tr), 1.0);
}`;
  let gl = null, glc = null, loc = {};
  function setupGL() {
    glc = document.createElement('canvas');
    gl = glc.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) { console.warn('field.js: no shader, colours on the CPU', err); gl = null; return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over it all
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uCss', 'uVw', 'uQ', 'uN', 'uRmin', 'uU', 'uFade', 'uRed', 'uBlue']) loc[n] = gl.getUniformLocation(prog, n);
    gl.uniform3f(loc.uRed, RED[0] / 255, RED[1] / 255, RED[2] / 255);
    gl.uniform3f(loc.uBlue, BLUE[0] / 255, BLUE[1] / 255, BLUE[2] / 255);
  }
  setupGL();
  const thresholds = () => [BLACK_AT, BLUE_AT, RED_AT].map((d) => Math.log(1 / (d * d)));

  // the colour map into g (device px, no transform): w x h device px covering vw x cssH css px
  function colours(g, w, h, dpr, vw, cssH, H) {
    const u = thresholds(), unit = fieldUnit(), rmin = discR() / 2 / unit;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (gl) {
      const gw = Math.ceil(w / 2), gh = Math.ceil(h / 2);
      if (glc.width !== gw || glc.height !== gh) { glc.width = gw; glc.height = gh; }
      gl.viewport(0, 0, gw, gh);
      gl.uniform2f(loc.uRes, gw, gh);
      gl.uniform2f(loc.uCss, (2 * gw) / dpr, (2 * gh) / dpr);
      gl.uniform1f(loc.uVw, unit);
      const q = new Float32Array(3 * MAX_CHARGES);
      charges.forEach((c, i) => { q[3 * i] = c.x; q[3 * i + 1] = c.y; q[3 * i + 2] = c.q; });
      gl.uniform3fv(loc.uQ, q);
      gl.uniform1i(loc.uN, charges.length);
      gl.uniform1f(loc.uRmin, rmin);
      gl.uniform3f(loc.uU, u[0], u[1], u[2]);
      gl.uniform2f(loc.uFade, 0.9 * H, COLOR_END * H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      g.drawImage(glc, 0, 0, 2 * gw, 2 * gh);
      return;
    }
    // no WebGL: the same map on a grid every few css px, scaled up smoothly
    const step = Math.max(2, Math.ceil(Math.sqrt((vw * cssH) / 300000)));
    const cw = Math.ceil(vw / step) + 1, ch = Math.ceil(cssH / step) + 1;
    const small = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const sg = small.getContext('2d'), im = sg.createImageData(cw, ch), d = im.data;
    for (let j = 0; j < ch; j++) {
      const y = j * step, fade = 1 - smooth(0.9 * H, COLOR_END * H, y);
      for (let i = 0; i < cw; i++) {
        const o = (j * cw + i) * 4;
        d[o + 3] = 255;
        if (fade <= 0) continue;
        let ex = 0, ey = 0;
        for (const c of charges) {
          const dx = (i * step - c.x) / unit, dy = (y - c.y) / unit, r2 = Math.max(dx * dx + dy * dy, rmin * rmin), k = c.q / (r2 * Math.sqrt(r2));
          ex += dx * k; ey += dy * k;
        }
        const v = Math.log(Math.max(Math.hypot(ex, ey), 1e-12)), tb = smooth(u[0], u[1], v), tr = smooth(u[1], u[2], v);
        for (let c = 0; c < 3; c++) d[o + c] = Math.round(fade * (BLUE[c] * tb * (1 - tr) + RED[c] * tr));
      }
    }
    sg.putImageData(im, 0, 0);
    g.drawImage(small, 0, 0, cw, ch, 0, 0, cw * step * dpr, ch * step * dpr);
  }

  /* ---- field lines: RK4 along E from round each + charge until they reach a - charge or leave (or, with no + charges,
     backwards from the - charges, so they still run into them) ---- */
  function lines(g, H, fast) {
    const r = discR(), pos = charges.filter((c) => c.q > 0), neg = charges.filter((c) => c.q < 0);
    const from = pos.length ? pos : neg, sgn = pos.length ? 1 : -1, sinks = pos.length ? neg : [];
    const dir = (x, y) => {
      let ex = 0, ey = 0, dmin = Infinity;
      for (const c of charges) {
        const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy, r2 = Math.max(d2, r * r * 0.25), k = c.q / (r2 * Math.sqrt(r2));
        ex += dx * k; ey += dy * k;
        if (d2 < dmin) dmin = d2;
      }
      const n = Math.hypot(ex, ey) || 1;
      return [(sgn * ex) / n, (sgn * ey) / n, Math.sqrt(dmin)];
    };
    const paths = [];
    let ends = 0;
    for (const c of from) {
      for (let k = 0; k < LINES_PER_CHARGE; k++) {
        const a = (k / LINES_PER_CHARGE) * Math.PI * 2 + 0.11;
        let x = c.x + (r + 1) * Math.cos(a), y = c.y + (r + 1) * Math.sin(a);
        const pts = [[x, y]];
        let end = false;
        for (let s = 0; s < 30000; s++) {
          const k1 = dir(x, y), h = clamp(0.06 * k1[2], 0.5, 6) * (fast ? 2 : 1);
          const k2 = dir(x + (h / 2) * k1[0], y + (h / 2) * k1[1]);
          const k3 = dir(x + (h / 2) * k2[0], y + (h / 2) * k2[1]), k4 = dir(x + h * k3[0], y + h * k3[1]);
          x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
          y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
          const sink = sinks.find((o) => Math.hypot(x - o.x, y - o.y) < r);
          if (sink) {                                // ends on the - charge's rim
            const d = Math.hypot(x - sink.x, y - sink.y) || 1;
            pts.push([sink.x + ((x - sink.x) * r) / d, sink.y + ((y - sink.y) * r) / d]);
            end = true;
            break;
          }
          pts.push([x, y]);
          if (Math.hypot(x - c.x, y - c.y) > 2.5 * H) break;
        }
        if (end) ends++;
        paths.push(sgn > 0 ? pts : pts.reverse());   // always running along E: away from +, into -
      }
    }
    // white, fading with depth down the page (smoothly, to nothing at LINE_END screen heights)
    const grad = g.createLinearGradient(0, 0, 0, LINE_END * H);
    for (let k = 0; k <= 16; k++) {
      const y = (k / 16) * LINE_END * H;
      grad.addColorStop(k / 16, `rgba(255,255,255,${(LINE_ALPHA * (1 - smooth(1.1 * H, LINE_END * H, y))).toFixed(4)})`);
    }
    g.strokeStyle = grad;
    g.fillStyle = grad;
    g.lineWidth = LINE_W;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    const heads = [];
    for (const pts of paths) {
      g.moveTo(pts[0][0], pts[0][1]);
      // arrowheads by distance from the + end (or, for lines into a - from far away, from the - end backwards)
      const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      const marks = [];
      for (let m = 2 * r + 34; m < total - r && marks.length < (fast ? 1 : 3); m += 170) marks.push(sgn > 0 ? m : total - m);
      marks.sort((p, q) => p - q);
      let len = 0, mi = 0;
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = pts[i], [px, py] = pts[i - 1];
        g.lineTo(x, y);
        len += Math.hypot(x - px, y - py);
        while (mi < marks.length && len >= marks[mi]) { if (y < LINE_END * H * 0.9) heads.push([x, y, Math.atan2(y - py, x - px)]); mi++; }
      }
    }
    g.stroke();
    g.beginPath();
    for (const [x, y, an] of heads) {             // small arrowheads pointing along E
      const l = 7, wd = 3.5, c = Math.cos(an), s = Math.sin(an);
      g.moveTo(x + c * l * 0.5, y + s * l * 0.5);
      g.lineTo(x - c * l * 0.5 - s * wd, y - s * l * 0.5 + c * wd);
      g.lineTo(x - c * l * 0.5 + s * wd, y - s * l * 0.5 - c * wd);
      g.closePath();
    }
    g.fill();
    return { count: paths.length, ends };
  }

  /* ---- one full redraw, after a change only (nothing runs in between) ---- */
  const ctx = canvas.getContext('2d');
  let info = { tilt }, size = '', renders = 0;
  function render(fast = false) {
    if (!lay) return;
    const t0 = performance.now();
    const vw = vwPx(), H = window.innerHeight, cssH = 2 * H;
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(16e6 / (vw * cssH)));   // stay under 16M canvas pixels
    const w = Math.round(vw * dpr), h = Math.round(cssH * dpr);
    if (size !== w + 'x' + h) { canvas.width = w; canvas.height = h; canvas.style.height = cssH + 'px'; size = w + 'x' + h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    colours(ctx, w, h, dpr, vw, cssH, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ln = charges.length ? lines(ctx, H, fast) : { count: 0, ends: 0 };
    info = { tilt, charges: charges.map((c) => ({ x: c.x, y: c.y, q: c.q })), starts: lay.starts, eqBox: pageRect(eq), ctrlBox: pageRect(controls),
      lines: ln.count, linesIntoNegative: ln.ends, ms: +(performance.now() - t0).toFixed(1), fast, gl: !!gl, dpr, size: [w, h], H,
      hint: !!hint && !hint.hidden, renders: ++renders, at: performance.now() };
  }
  canvas.fieldInfo = () => info;

  // lay out the equations and the control, then (re)place the charges: the starting ones on their spots, any others where
  // they were in the first screen (dropped if that spot is no longer free)
  function layout(first) {
    labelSizes = {};
    lay = place();
    for (const [el, box] of [[eq, lay.eqBox], [controls, lay.ctrlBox]]) {
      Object.assign(el.style, lay.right
        ? { left: box.r + 'px', top: box.t + 'px', translate: '-100% 0' }    // right edges fixed (the hint going doesn't move it)
        : { left: (box.l + box.r) / 2 + 'px', top: box.t + 'px', translate: '-50% 0' });
    }
    if (first) { reset(); return; }
    const h = pageRect(hero), keep = charges;
    charges = [];
    for (const c of keep) {
      const [x, y] = c.start >= 0 ? lay.starts[c.start] : [h.l + c.fx * (h.r - h.l), h.t + c.fy * (h.b - h.t)];
      c.el.remove();
      c.label.remove();
      if (free(x, y, c.q)) makeCharge(x, y, c.q, c.start);
    }
    render();
  }

  // once the fonts (the site's and KaTeX's) are in; again after a resize that changes the width, or the height by >15%
  let lastW = 0, lastH = 0, timer = 0, started = false;
  const go = () => { lastW = vwPx(); lastH = window.innerHeight; layout(!started); started = true; };
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (vwPx() !== lastW || Math.abs(window.innerHeight - lastH) > 0.15 * lastH) go();
    }, 200);
  });
  typeset();
  void eq.offsetWidth;                               // lay the equations out now, so their fonts are requested before we wait
  let eqSize = '';
  const settle = () => { const s = eq.offsetWidth + 'x' + eq.offsetHeight; if (s !== eqSize) { eqSize = s; go(); } };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(settle);
  window.addEventListener('load', () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(settle));
})();
