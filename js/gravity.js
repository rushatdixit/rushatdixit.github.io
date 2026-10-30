// Pixelated 2.5D earth–moon system with gravitational force vectors.
// Everything is drawn into a tiny 160x90 buffer that CSS scales up with
// `image-rendering: pixelated`.
(() => {
const W = 160;
const H = 90;
const CX = W / 2;
const CY = H / 2;

const EARTH_R = 20;
const MOON_R = 6;
const ORBIT_R = 62;
const TILT = (14 * Math.PI) / 180;  // orbit plane tilt, gives the 2.5D look
const ORBIT_PERIOD = 10;             // seconds
const SPIN_PERIOD = 7;               // seconds
const ARROW_LEN = 11;

const canvas = document.getElementById('gravity-canvas');
const ctx = canvas.getContext('2d');
const img = ctx.createImageData(W, H);
const buf = new Uint32Array(img.data.buffer);

const rgb = (r, g, b) => (0xff << 24) | (b << 16) | (g << 8) | r;
const scale = ([r, g, b], k) => rgb(Math.round(r * k), Math.round(g * k), Math.round(b * k));

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(255, 255, 255);
const DASH = rgb(110, 110, 110);
const MOON_COLOR = rgb(255, 216, 74);    // force on the moon
const EARTH_COLOR = rgb(255, 138, 61);   // force on the earth

const OCEAN = [32, 96, 214];
const LAND = [62, 174, 74];
const SILVER = [205, 205, 212];
const CRATER = [140, 140, 150];

function plot(x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = c;
}

function plot2(x, y, c) {
  plot(x, y, c);
  plot(x + 1, y, c);
  plot(x, y + 1, c);
  plot(x + 1, y + 1, c);
}

function line(x0, y0, x1, y1, c, { thick = false, dashed = false } = {}) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  for (;;) {
    if (!dashed || i % 4 < 2) (thick ? plot2 : plot)(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    i++;
  }
}

// deterministic stars
let seed = 7;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const stars = Array.from({ length: 28 }, () => ({
  x: Math.floor(rand() * W),
  y: Math.floor(rand() * H),
  c: rand() < 0.3 ? rgb(200, 200, 200) : rgb(90, 90, 90),
}));

// shaded sphere sampled per pixel; colorAt(lon, lat) picks the surface colour
function sphere(cx, cy, R, rot, colorAt) {
  const L = [-0.5, -0.5, 0.7];
  const len = Math.hypot(...L);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = (x + 0.5 - cx) / R;
      const dy = (y + 0.5 - cy) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const light = (dx * L[0] + dy * L[1] + nz * L[2]) / len;
      const k = light > 0.55 ? 1 : light > 0.2 ? 0.78 : light > -0.1 ? 0.56 : 0.38;
      const lon = Math.atan2(dx, nz) + rot;
      const lat = Math.asin(-dy);
      plot(x, y, scale(colorAt(lon, lat), k));
    }
  }
}

const earthColor = (lon, lat) => {
  const v =
    Math.sin(2 * lon + 1.3) * Math.cos(3 * lat) +
    0.6 * Math.sin(3 * lon - 2 * lat) +
    0.3 * Math.sin(5 * lon + 2 * lat + 1);
  return v > 0.5 ? LAND : OCEAN;
};

const moonColor = (lon, lat) =>
  Math.sin(5 * lon + 1) * Math.sin(6 * lat + 2) > 0.7 ? CRATER : SILVER;

// tiny bitmap glyphs for the labels
const GLYPHS = {
  M: ['10001', '11011', '10101', '10001', '10001'],
  m: ['11010', '10101', '10101', '10101'],
  r: ['011', '100', '100', '100'],
  F: ['111', '100', '110', '100', '100'],
};

function glyph(ch, x, y, c) {
  GLYPHS[ch].forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '1') plot(x + i, y + j, c);
  });
}

function arrow(x0, y0, dx, dy, c, len) {
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  line(x0, y0, x1, y1, c, { thick: true });
  const a = Math.atan2(dy, dx);
  for (const s of [-1, 1]) {
    const ha = a + Math.PI + s * 0.5;
    line(x1, y1, x1 + Math.cos(ha) * 6, y1 + Math.sin(ha) * 6, c, { thick: true });
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function draw(t) {
  buf.fill(BLACK);
  for (const s of stars) buf[s.y * W + s.x] = s.c;

  const theta = (2 * Math.PI * t) / ORBIT_PERIOD;
  const spin = (2 * Math.PI * t) / SPIN_PERIOD;

  // moon position on screen; sin(theta) > 0 means in front of the earth
  const mx = CX + ORBIT_R * Math.cos(theta);
  const my = CY + ORBIT_R * Math.sin(theta) * Math.sin(TILT);
  const front = Math.sin(theta) > 0;

  // line of action r between the two centres
  line(CX, CY, mx, my, DASH, { dashed: true });

  // painter's order: whichever body is behind is drawn first
  const drawEarth = () => sphere(CX, CY, EARTH_R, spin, earthColor);
  const drawMoon = () => sphere(mx, my, MOON_R, theta, moonColor);
  if (front) { drawEarth(); drawMoon(); } else { drawMoon(); drawEarth(); }

  // gravity vectors, each pointing at the other body (equal and opposite)
  const dist = Math.hypot(CX - mx, CY - my);
  const ux = (CX - mx) / dist; // unit vector moon -> earth
  const uy = (CY - my) / dist;
  // shorten the arrows when the bodies are close so they never run into each other
  const gap = dist - EARTH_R - MOON_R - 4;
  const len = Math.min(ARROW_LEN, Math.max(6, gap / 2 - 1));
  const [fmx, fmy] = arrow(mx + ux * (MOON_R + 2), my + uy * (MOON_R + 2), ux, uy, MOON_COLOR, len);
  const [fex, fey] = arrow(CX - ux * (EARTH_R + 2), CY - uy * (EARTH_R + 2), -ux, -uy, EARTH_COLOR, len);

  // labels, using the same symbols as the equations
  glyph('M', CX - 2, CY + EARTH_R + 4, WHITE);
  glyph('m', Math.round(mx) - 2, Math.round(my - MOON_R - 7), WHITE);
  glyph('r', Math.round((CX + mx) / 2 - uy * 6), Math.round((CY + my) / 2 + ux * 6) - 2, rgb(170, 170, 170));
  glyph('F', Math.round(fmx + uy * 6) - 1, Math.round(fmy - ux * 6) - 2, MOON_COLOR);
  glyph('F', Math.round(fex + uy * 6) - 1, Math.round(fey - ux * 6) - 2, EARTH_COLOR);

  ctx.putImageData(img, 0, 0);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const t0 = performance.now();
let visible = true, running = false;

function frame(now) {
  if (!visible) { running = false; return; }   // nothing to draw while the hero is off screen
  draw((now - t0) / 1000);
  requestAnimationFrame(frame);
}

draw(1);
if (!reduceMotion) {
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
  }).observe(canvas);
}

// equation, typeset with KaTeX (not pixelated). KaTeX comes from a CDN, so render once everything has
// loaded, and fall back to plain text if it never arrived.
function renderEquation() {
  const box = document.getElementById('gravity-equation');
  if (!box || box.firstChild) return;
  const el = document.createElement('div');
  box.appendChild(el);
  if (window.katex) {
    katex.render(String.raw`\vec F = -\dfrac{G\,M\,m}{r^{2}}\,\hat r`, el, { displayMode: true, throwOnError: false });
  } else {
    el.textContent = 'F = \u2212GMm / r\u00b2 r\u0302';
  }
}
if (document.readyState === 'complete') renderEquation();
else window.addEventListener('load', renderEquation);
})();
