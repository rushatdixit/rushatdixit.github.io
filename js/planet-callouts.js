// The open planet's facts, in the pixel font. On wide screens (1100 px and up) they float around the planet as callouts,
// each next to what it describes (the tilt by the angle arc, the day by the spin arrow, the moons by their orbit), laid
// out from the planet's real size, axis and orbits so nothing overlaps. Narrower screens get a plain list under the planet.
// Everything is built from the table in js/planets.js, so a new planet needs no changes here.
(() => {
const page = document.querySelector('.page4');
const canvas = document.querySelector('.solar-canvas');
const back = document.querySelector('.planet-back');
const bio = page && page.querySelector('.page4-text');
const scroller = page && page.querySelector('.page4-scroll');
if (!page || !canvas || !back || !bio || !scroller) return;

const MAX_MOONS_SHOWN = 5;
const EDGE = 48;            // clear space to the screen edges and the bio
const PAD = 12;             // between callouts, and around the planet
const GUIDE_PAD = 8;        // around the axis, the angle arc and the spin arrow
const STEP = 6;             // candidate grid, in css px
const SCALES = [1, 0.9, 0.8, 0.7, 0.6];
const NS = 'http://www.w3.org/2000/svg';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};
const fmt = (n) => String(n).replace('-', '−');          // a proper minus sign

const info = el('section', 'planet-info');
info.setAttribute('aria-live', 'polite');
info.setAttribute('aria-label', 'Planet facts');
info.inert = true;
scroller.insertBefore(info, bio);                    // on phones the facts come first, then the bio
const head = el('div', 'planet-head');
head.appendChild(back);                              // the back link sits above the name
const title = el('h2', 'planet-name');
head.appendChild(title);
info.appendChild(head);
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'planet-leaders');
svg.setAttribute('aria-hidden', 'true');
info.appendChild(svg);
const list = el('div', 'planet-callouts');
info.appendChild(list);

/* ------------------------------------------------------------------ *
 *  Content
 * ------------------------------------------------------------------ */
let planet = null;
let items = {};             // callout elements by key: 'f0', 'f1', ... (one per field, in order) and 'fact'
let anchors = {};           // each field callout's anchor, by key

// one callout from a field of js/bodies.js: { label, value (a string or a list of names), sub, anchor }
function callout(key, f) {
  const c = el('dl', 'planet-callout pc-a-' + f.anchor);
  c.dataset.key = key;
  const list = Array.isArray(f.value);
  if (list && !f.value.length) {                       // an empty list: "MOONS: NONE"
    c.classList.add('is-inline');
    c.appendChild(el('dt', null, f.label + ':'));
    c.appendChild(el('dd', 'pc-value', 'None'));
  } else {
    c.appendChild(el('dt', null, f.label));
    const values = list ? f.value : [f.value];
    for (const v of values.slice(0, MAX_MOONS_SHOWN)) c.appendChild(el('dd', 'pc-value', v));
    if (values.length > MAX_MOONS_SHOWN) c.appendChild(moreButton(key, values.slice(MAX_MOONS_SHOWN)));
  }
  if (f.sub) c.appendChild(el('dd', 'pc-note', f.sub));
  items[key] = c;
  anchors[key] = f.anchor;
  return c;
}

// a list longer than five: the first five, then a "+N more" button that drops the rest down over a dark pixel panel
function moreButton(key, rest) {
  const id = 'more-' + planet.id + '-' + key;
  const dd = el('dd', 'pc-more');
  const btn = el('button', 'moons-toggle', '+' + rest.length + ' more');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', id);
  const more = el('ul', 'moons-more');
  more.id = id;
  for (const m of rest) more.appendChild(el('li', null, m));
  more.inert = true;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'show fewer' : '+' + rest.length + ' more';
    more.classList.toggle('is-open', open);
    more.inert = !open;
  });
  dd.appendChild(btn);
  dd.appendChild(more);
  return dd;
}

// build the callouts for one body of js/bodies.js (exposed so a test can feed it a body with many moons)
function render(p) {
  planet = p;
  items = {};
  anchors = {};
  list.textContent = '';
  title.textContent = p.title || p.name;
  (p.fields || []).forEach((f, i) => list.appendChild(callout('f' + i, f)));
  const fact = el('div', 'planet-callout pc-fact');
  fact.dataset.key = 'fact';
  fact.appendChild(el('p', 'pc-label', 'Fun fact'));
  fact.appendChild(el('p', 'pc-text', p.funFact));
  items.fact = fact;
  list.appendChild(fact);
  Object.values(items).forEach((c, i) => c.style.setProperty('--i', i));     // reveal order (80 ms apart)
}

/* ------------------------------------------------------------------ *
 *  Geometry helpers (css px, relative to the page)
 * ------------------------------------------------------------------ */
const overlap = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const nearestOnRect = (r, p) => ({ x: Math.max(r.x, Math.min(p.x, r.x + r.w)), y: Math.max(r.y, Math.min(p.y, r.y + r.h)) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hitsPoints = (r, pts, pad) => pts.some((p) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad);
const hitsDisc = (r, d, pad) => dist(nearestOnRect(r, d), d) < d.r + pad;
// a segment against a rectangle (sampled every 3 px) and against a circle
const segHitsRect = (a, b, r, pad) => {
  const n = Math.max(1, Math.ceil(dist(a, b) / 3));
  for (let i = 1; i < n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    if (p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad) return true;
  }
  return false;
};
const segHitsDisc = (a, b, d, pad) => {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((d.x - a.x) * vx + (d.y - a.y) * vy) / l2));
  return Math.hypot(a.x + vx * t - d.x, a.y + vy * t - d.y) < d.r + pad;
};
const pageRect = (node) => {
  const pr = page.getBoundingClientRect(), r = node.getBoundingClientRect();
  return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height };
};
// the right edge of the bio's text, line by line
function bioRight() {
  let right = 0;
  const pr = page.getBoundingClientRect();
  const walker = document.createTreeWalker(bio, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) right = Math.max(right, r.right - pr.left);
  }
  return right;
}

/* ------------------------------------------------------------------ *
 *  Layout
 * ------------------------------------------------------------------ */
let placedRects = [];       // for tests: every callout's final rect
let lastLayout = null;
let lastFail = null;        // the callout that did not fit, when the wide layout gives up (for tests)
let live = [];              // leaders whose far end moves (to the belt's named rocks): { ln, rect, member }
const setLine = (ln, a, b) => {
  ln.setAttribute('x1', Math.round(a.x) + 0.5); ln.setAttribute('y1', Math.round(a.y) + 0.5);
  ln.setAttribute('x2', Math.round(b.x) + 0.5); ln.setAttribute('y2', Math.round(b.y) + 0.5);
};
function followMembers() {
  if (!live.length || !info.classList.contains('is-active') || !window.planetView) return;
  const ms = window.planetView.members();
  for (const l of live) {
    const m = ms[l.member];
    if (!m) continue;
    const n = nearestOnRect(l.rect, m), d = dist(n, m) || 1;
    setLine(l.ln, n, { x: m.x + ((n.x - m.x) * (m.r + 3)) / d, y: m.y + ((n.y - m.y) * (m.r + 3)) / d });
  }
  requestAnimationFrame(followMembers);
}

function clearPositions() {
  live = [];
  for (const c of Object.values(items)) { c.style.left = c.style.top = c.style.maxWidth = ''; c.style.removeProperty('--fact-w'); }
  svg.textContent = '';
  list.style.removeProperty('top');
}

// wide screens: each callout takes the clear spot nearest to what it describes. Returns false if one does not fit.
function layoutWide(v, g, scale) {
  info.style.setProperty('--co-scale', scale);
  clearPositions();
  const W = v.cssW, H = v.cssH, disc = g.disc;
  const xMin = Math.ceil(Math.max(W / 2 + 24, bioRight() + EDGE)), xMax = Math.floor(W - EDGE), yMin = EDGE, yMax = Math.floor(H - EDGE);
  const headR = pageRect(head);
  const axisPts = [];
  const axLen = Math.hypot(g.axis.x2 - g.axis.x1, g.axis.y2 - g.axis.y1);
  for (let s = 0; s <= axLen; s += 3) axisPts.push({ x: g.axis.x1 + ((g.axis.x2 - g.axis.x1) * s) / axLen, y: g.axis.y1 + ((g.axis.y2 - g.axis.y1) * s) / axLen });
  const guidePts = axisPts.concat(g.arc, g.arrow, [g.north, { x: g.north.x - 6, y: g.north.y - 8 }, { x: g.north.x + 6, y: g.north.y + 8 }]);
  const sun = v.light && v.light[0] < 0 ? -1 : 1;            // which side the sun lights
  const outer = g.orbits.length ? g.orbits.reduce((a, b) => (b.r > a.r ? b : a)) : null;
  const orbitPts = outer ? outer.points.filter((p) => dist(p, disc) > disc.r + 4) : [];
  const arrowLeft = g.arrow.reduce((a, b) => (b.x < a.x ? b : a), g.arrow[0]);
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
  const arcOut = unit(g.arcMid.x - disc.x, g.arcMid.y - disc.y);
  const R = disc.r;

  // where each callout wants to be: next to `target`, on the side `side` points to; `leader` gives the point(s) its leader
  // lines run to. The anchor in js/bodies.js decides; callouts with no anchor take the free corners in turn.
  const corner = (dx, dy) => ({ target: { x: disc.x + dx * R * (dx && dy ? 0.72 : 1), y: disc.y + dy * R * (dx && dy ? 0.72 : 1) }, side: unit(dx, dy) });
  const zones = { 'lower-left': corner(-1, 1), 'lower-right': corner(1, 1), 'upper-left': corner(-1, -1), right: corner(1, 0), left: corner(-1, 0), 'upper-right': corner(1, -1) };
  const used = new Set();
  const members = g.members || [];
  const nearestZone = (dir) => Object.keys(zones).filter((z) => !used.has(z)).sort((p, q) => (zones[q].side.x * dir.x + zones[q].side.y * dir.y) - (zones[p].side.x * dir.x + zones[p].side.y * dir.y))[0];
  const anchored = (key) => {
    switch (anchors[key]) {
      case 'axis': return { key, target: g.arcMid, side: arcOut };
      case 'spin': used.add('upper-left'); return { key, target: arrowLeft, side: { x: -1, y: 0.2 }, leader: () => [arrowLeft] };
      case 'moons': used.add('right'); return { key, target: outer ? { x: disc.x + outer.r, y: disc.y } : { x: disc.x + R, y: disc.y }, side: { x: 1, y: 0 },
        leader: outer ? (r) => [orbitPts.reduce((a, p) => (dist(nearestOnRect(r, p), p) < dist(nearestOnRect(r, a), a) ? p : a), orbitPts[0])] : null };
      case 'sunlit': { const z = sun > 0 ? 'lower-right' : 'lower-left'; used.add(z); return Object.assign({ key }, zones[z]); }
      case 'members': {
        if (!members.length) return null;
        const c = { x: members.reduce((t, m) => t + m.x, 0) / members.length, y: members.reduce((t, m) => t + m.y, 0) / members.length };
        const dir = unit(c.x - disc.x, c.y - disc.y);
        used.add(nearestZone(dir));
        return { key, target: c, side: dir, leader: (r) => members.map((m) => edgeOf(m, r)), members: true };
      }
      default: return null;
    }
  };
  // a leader to a round thing stops at its edge
  const edgeOf = (m, r) => { const n = nearestOnRect(r, m), d = dist(n, m) || 1; return { x: m.x + ((n.x - m.x) * (m.r + 3)) / d, y: m.y + ((n.y - m.y) * (m.r + 3)) / d }; };
  const keys = Object.keys(items).filter((k) => k !== 'fact');
  // the fun fact first: it needs the widest free band (under the body); then the anchored callouts, then the free ones
  const slots = [{ key: 'fact', target: { x: disc.x, y: g.bottom + PAD }, side: { x: 0, y: 1 }, centre: true }].concat(keys.map(anchored).filter(Boolean));
  for (const key of keys) {
    if (slots.some((sl) => sl.key === key)) continue;
    const z = Object.keys(zones).find((n) => !used.has(n)) || 'lower-left';
    used.add(z);
    slots.push(Object.assign({ key }, zones[z]));
  }

  const taken = [headR];
  const leaders = [];
  placedRects = [];
  for (const s of slots) {
    const c = items[s.key];
    if (s.key === 'fact') c.style.setProperty('--fact-w', Math.floor(Math.min(xMax - xMin - 1, 45 * 16 * scale)) + 'px');
    // a callout may also wrap onto more, narrower lines to fit a tight corner (a small cost, so the full width wins when it fits)
    const base = s.key === 'fact' ? Math.floor(Math.min(xMax - xMin - 1, 45 * 16 * scale)) : 272 * scale;
    const variants = [null, 0.72].map((m, vi) => {
      c.style.maxWidth = m ? Math.round(base * m) + 'px' : '';
      const box = c.getBoundingClientRect();
      return { m, vi, w: Math.ceil(box.width), h: Math.ceil(box.height) };
    });
    const cands = [];
    for (const vr of variants) {
      const { w, h } = vr;
      for (let y = yMin; y + h <= yMax; y += STEP) {
        for (let x = xMin; x + w <= xMax; x += STEP) {
          const r = { x, y, w, h };
          const n = nearestOnRect(r, s.target);
          const ctr = { x: x + w / 2 - s.target.x, y: y + h / 2 - s.target.y };
          let score = dist(n, s.target) + vr.vi * 90;              // wrapping narrower costs more than moving a little further
          if (ctr.x * s.side.x + ctr.y * s.side.y < 0) score += 400;          // on the wrong side of what it describes
          if (s.centre) score += Math.abs(x + w / 2 - disc.x) * 0.6;
          cands.push([score, x, y, vr]);
        }
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    let found = null;
    for (const [, x, y, vr] of cands) {
      const r = { x, y, w: vr.w, h: vr.h };
      if (hitsDisc(r, disc, PAD)) continue;
      if (taken.some((t) => overlap(r, t, PAD))) continue;
      if (hitsPoints(r, guidePts, GUIDE_PAD)) continue;
      if (members.some((m) => hitsDisc(r, { x: m.x, y: m.y, r: m.r + 12 }, 0))) continue;   // the named rocks keep room for their names
      const lines = [];
      let blockedLine = false;
      for (const end of (s.leader && s.leader(r)) || []) {
        const start = nearestOnRect(r, end);
        if (dist(start, end) <= 6) continue;
        if (segHitsDisc(start, end, disc, 2) || taken.some((t) => segHitsRect(start, end, t, 4))) { blockedLine = true; break; }
        lines.push([start, end, s.members ? lines.length : -1]);
      }
      if (blockedLine) continue;
      found = { r, lines, vr };
      break;
    }
    if (!found) { lastFail = s.key + '@' + scale; return false; }
    c.style.maxWidth = found.vr.m ? Math.round(base * found.vr.m) + 'px' : '';
    c.style.left = found.r.x + 'px';
    c.style.top = found.r.y + 'px';
    taken.push(found.r);
    placedRects.push(Object.assign({ key: s.key }, found.r));
    for (const ln of found.lines) leaders.push(ln.concat([found.r]));
  }
  // a leader must not run under a callout placed after it
  for (const [a, b] of leaders) if (taken.some((t) => segHitsRect(a, b, t, 2))) return false;
  live = [];
  for (const [a, b, member, rect] of leaders) {
    const ln = document.createElementNS(NS, 'line');
    setLine(ln, a, b);
    ln.setAttribute('pathLength', '1');
    svg.appendChild(ln);
    if (member >= 0) live.push({ ln, rect, member });            // the named rocks drift: these leaders follow them
  }
  return true;
}

// list (768 to 1099 px, or a wide screen too short for callouts): the facts in two columns under the planet
const LIST_SCALE = 0.85;    // list type: 10 px names, 14 px values. js/solar.js sizes the planet so the list fits under it
function layoutList(v, g) {
  clearPositions();
  let top = Math.max(g.bottom, g.disc.y + g.outer) + 16;
  list.style.top = top + 'px';
  for (const scale of SCALES.filter((s) => s <= LIST_SCALE)) {
    info.style.setProperty('--co-scale', scale);
    if (top + list.offsetHeight <= v.cssH - EDGE) break;
  }
  // never off screen: a list that still does not fit under the body moves up (over the field around it, never over the bio)
  if (top + list.offsetHeight > v.cssH - EDGE) { top = Math.max(EDGE + head.offsetHeight + 16, v.cssH - EDGE - list.offsetHeight); list.style.top = top + 'px'; }
  placedRects = Object.entries(items).map(([key, c]) => Object.assign({ key }, pageRect(c)));
}

function layout() {
  const v = canvas.solarView();
  if (!v.id || !planet || !window.planetView) return;
  const g = window.planetView.geometry();
  if (!g) return;
  let mode = v.mode;
  info.dataset.mode = mode;
  if (mode === 'phone') {
    clearPositions();
    info.style.setProperty('--co-scale', 1);
    page.style.setProperty('--info-top', Math.round(Math.max(g.bottom, g.disc.y + g.outer) + 12) + 'px');
    placedRects = [];
  } else if (mode === 'wide') {
    if (!SCALES.some((s) => layoutWide(v, g, s))) { mode = 'list'; info.dataset.mode = 'list'; layoutList(v, g); }
  } else layoutList(v, g);
  lastLayout = mode;
  // the floating moon names keep clear of the callouts and the name
  const rects = mode === 'phone' ? [] : placedRects.concat([Object.assign({ key: 'head' }, pageRect(head))]);
  for (const ln of svg.querySelectorAll('line')) {               // and off the leader lines (as a row of small boxes)
    if (live.some((l) => l.ln === ln)) continue;                  // (a rock's own leader may run into its name: it points at it)
    const a = { x: +ln.getAttribute('x1'), y: +ln.getAttribute('y1') }, b = { x: +ln.getAttribute('x2'), y: +ln.getAttribute('y2') };
    const n = Math.max(1, Math.ceil(dist(a, b) / 4));
    for (let i = 0; i <= n; i++) rects.push({ key: 'leader', x: a.x + ((b.x - a.x) * i) / n - 2, y: a.y + ((b.y - a.y) * i) / n - 2, w: 4, h: 4 });
  }
  window.planetView.setObstacles(rects);
}

/* ------------------------------------------------------------------ *
 *  Open, reveal, close
 * ------------------------------------------------------------------ */
canvas.addEventListener('planet-open', (ev) => {
  const p = (window.BODY_DATA || []).find((q) => q.id === ev.detail.id);
  if (!p) return;
  info.classList.remove('is-revealed');
  render(p);
  clearPositions();
  info.dataset.mode = canvas.solarView().mode;
  info.style.setProperty('--co-scale', info.dataset.mode === 'list' ? LIST_SCALE : 1);   // so the list's height can be read now
  info.inert = false;
  info.classList.add('is-active');
  if (window.planetView) window.planetView.setObstacles([]);
});
// after the zoom: lay out, then draw the leaders and fade the callouts in one after another
canvas.addEventListener('planet-ready', () => {
  layout();
  if (live.length) requestAnimationFrame(followMembers);
  requestAnimationFrame(() => requestAnimationFrame(() => info.classList.add('is-revealed')));
});
canvas.addEventListener('planet-closing', () => {
  info.classList.remove('is-revealed', 'is-active');
});
canvas.addEventListener('planet-close', () => {
  info.inert = true;
  info.classList.remove('is-revealed', 'is-active');
  if (window.planetView) window.planetView.setObstacles([]);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (info.classList.contains('is-revealed')) layout(); }, 120);
});

// on phones the bio scrolls with the facts: keep the dimming behind it in step
scroller.addEventListener('scroll', () => canvas.dispatchEvent(new CustomEvent('text-moved')), { passive: true });

window.renderPlanetInfo = (p) => { render(p); if (info.classList.contains('is-active')) { layout(); info.classList.add('is-revealed'); } };
window.planetCallouts = { rects: () => placedRects.map((r) => Object.assign({}, r)), mode: () => lastLayout, fail: () => lastFail, layout };   // for tests
})();
