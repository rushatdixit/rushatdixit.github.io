// Pixel-art inner solar system behind page 4, modelled in 3D and seen from a tilted camera.
// The orbits lie in a flat plane with the sun at its centre; the camera looks down at it from about 27 degrees
// above that plane with mild perspective, so the circular orbits become flattened ellipses. Everything is drawn
// with plain 2D-canvas maths into a small buffer that CSS scales up with `image-rendering: pixelated` (the same
// technique as the earth-moon animation on page 1, js/gravity.js). Tweak the constants and BODIES to change it.
(() => {
const canvas = document.querySelector('.solar-canvas');
if (!canvas) return;
const page = canvas.closest('.page4') || canvas.parentElement;
const ctx = canvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 *  Tuning
 * ------------------------------------------------------------------ */
const ELEV = (27 * Math.PI) / 180; // camera elevation above the orbital plane
const SUN_POS = [0.88, 0.85];      // sun centre as a fraction of the viewport (mostly cut off by the corner)
const SUN_R = 0.12;                // sun radius, as a fraction of the viewport diagonal (0.15 / 1.25)
const HALO = 1.35;                 // halo radius, as a multiple of the sun radius
const MARS_PT_X = 0.06;            // Mars's orbit is solved to pass through a point this far across (its height depends on the aspect ratio)
const BELT_PT = [0.05, 0.07];      // ... and the asteroid belt's centre ring (so it peeks in at the top-left)
const MERCURY_INCLINATION = (7 * Math.PI) / 180;   // Mercury's orbital plane is tilted this far from the others (near side up)
const MERCURY_RADIUS_FACTOR = 0.8; // Mercury's orbit radius: this x the sun disc's radius / sin(camera tilt - inclination)
const MARS_RADIUS = 0.28;          // Mars's orbit radius as a fraction of the camera distance: sets the perspective
const BELT_WIDTH = 0.06;           // belt band: plus or minus this fraction of its radius
const BELT_COUNT = 8000;
const TEXT_DIM = 0.3;              // brightness left behind the text (1 = no dimming)

// ONE solar system: one sun, one plane, one list of orbits. The "outer scene" is only a second camera position: the same
// camera (same height, tilt and lens, no zoom) moved along the plane towards the screen's top-left until the asteroid belt
// reaches the bottom-right corner. Each outer orbit is solved to cross the screen diagonal, seen from there, at the given
// fraction of the way from the bottom-right corner to the top-left one, so they are evenly spaced at any aspect ratio.
const OUT_BELT = 0.06;             // from the outer camera, the asteroid belt just cuts the bottom-right corner
const KUIPER_BAND = [0.8, 1.05];   // the Kuiper belt: a dense band through the top-left corner
const KUIPER_COUNT = 1000;         // icy specks, all spread along the band's on-screen arc
const SCENE_MS = reduceMotion ? 250 : 1400;   // the camera's move between the two positions (a crossfade with reduced motion)
const STAR_COUNT = 150, STAR_PARALLAX = 0.3;  // dim background stars; they slide at 30% of the scenery's speed
const ARRIVE_MIN_S = 3;            // arriving in the outer scene lands on a moment when all five bodies stay in view this long

// every body's on-screen diameter, in vmin, in both scenes (planets keep this size wherever they are on their orbits).
// The Sun keeps its own rule (SUN_R of the diagonal: about 45 vmin at 1440x900) and must stay the biggest thing on screen;
// checkSizes() warns if the Sun is under 4x Jupiter, a giant under 2x Earth, or Pluto not the smallest.
const SIZES = { mercury: 2.2, venus: 3.5, earth: 3.5, mars: 2.6, jupiter: 10, saturn: 9, saturnRings: 20, uranus: 7, neptune: 7, pluto: 1.8 };

// orbit = radius relative to Mars (Mercury's is computed from the sun's size instead); incl = orbital-plane tilt; period in seconds per lap (counter-clockwise on screen); the size
// comes from SIZES; start = starting phase in degrees (chosen by the timeline search so a planet is always in
// view); lull = how much the planet slows down while it crosses the part of its orbit that is on screen (0 = steady
// speed, 0.46 = a twelfth of its average speed there). The lap time is unchanged; the planet just lingers on
// screen, like a planet near aphelion, which is what lets at least one planet always be in view.
const BODIES = [
  { id: 'mercury', name: 'MERCURY', orbit: 0, incl: MERCURY_INCLINATION, period: 20, start: 258, lull: 0.46, spin: 25,
    colorAt: (lon, lat) => (Math.sin(5 * lon + 1) * Math.sin(6 * lat + 2) > 0.7 ? [206, 112, 40] : [240, 144, 54]), moons: [] },
  { id: 'venus', name: 'VENUS', orbit: 0.47, period: 40, start: 178.9, lull: 0.46, spin: 40,
    colorAt: (lon, lat) => (Math.sin(3 * lat + lon) + 0.5 * Math.sin(7 * lat) > 0.2 ? [176, 90, 52] : [148, 68, 40]), moons: [] },
  { id: 'earth', name: 'EARTH', orbit: 0.66, period: 80, start: 16.3, lull: 0.448, spin: 7,
    colorAt: (lon, lat) => {
      const v = Math.sin(2 * lon + 1.3) * Math.cos(3 * lat) + 0.6 * Math.sin(3 * lon - 2 * lat) + 0.3 * Math.sin(5 * lon + 2 * lat + 1);
      return v > 0.5 ? [62, 174, 74] : [32, 96, 214];
    },
    moons: [{ ra: 2.5, period: 4, phase: 1.0, r: 2.2, color: [244, 244, 248] }] },
  { id: 'mars', name: 'MARS', orbit: 1, period: 160, start: 343.4, lull: 0.277, spin: 9,
    colorAt: (lon, lat) => (Math.sin(2 * lon + 1) * Math.cos(3 * lat) > 0.35 ? [150, 44, 36] : [212, 66, 50]),
    moons: [
      { ra: 2.3, period: 2.2, phase: 0.3, r: 1, color: [150, 150, 156] },   // Phobos
      { ra: 3.5, period: 5.5, phase: 2.5, r: 1, color: [176, 176, 182] },   // Deimos
    ] },
  // the outer scene. diag = where the orbit crosses the screen diagonal seen from the outer camera position; periods 200 to 600 s, so the
  // whole pattern repeats every 6000 s. linger = the share of each lap spent crossing the on-screen part of the orbit:
  // these orbits are so much bigger than the screen (on phones above all) that the lull above cannot slow them enough.
  // Jupiter's and Uranus's windows interlock (their periods are 1:2), so they get longer ones. The start phases come from
  // the timeline search: at 1440x900 and 390x844, one of Jupiter..Neptune is wholly on screen (not behind the sun, clear of
  // the bio) at every 0.1 s of the cycle, two or more about 90% of the time, and all five together for about 7-8 minutes
  // of each cycle (where arrivals land). Changing a size, diag or linger needs a new search.
  { id: 'jupiter', name: 'JUPITER', scene: 'outer', diag: 0.2, period: 200, start: 46, linger: 0.8, spin: 6,
    colorAt: (lon, lat) => { const v = Math.sin(lat * 9 + 0.6) + 0.35 * Math.sin(lat * 23); return v > 0.7 ? [234, 216, 182] : v > -0.3 ? [200, 154, 104] : [170, 100, 64]; },
    moons: [
      { ra: 1.6, period: 6, phase: 0.4, r: 1.2, color: [236, 214, 120] },     // Io
      { ra: 2.1, period: 9, phase: 2.2, r: 1.2, color: [222, 210, 190] },     // Europa
      { ra: 2.7, period: 15, phase: 4.1, r: 1.6, color: [176, 164, 150] },    // Ganymede
      { ra: 3.4, period: 26, phase: 5.3, r: 1.5, color: [130, 120, 110] },    // Callisto
    ] },
  { id: 'saturn', name: 'SATURN', scene: 'outer', diag: 0.34, period: 300, start: 20, linger: 0.5, spin: 7,
    colorAt: (lon, lat) => (Math.sin(lat * 8) + 0.3 * Math.sin(lat * 19) > 0.2 ? [226, 200, 142] : [196, 166, 110]), rings: 26.7,
    moons: [
      { ra: 2.7, period: 14, phase: 1.1, r: 1.1, color: [196, 196, 200] },    // Rhea (beyond the rings)
      { ra: 3.5, period: 24, phase: 3.9, r: 1.6, color: [226, 176, 92] },     // Titan
    ] },
  { id: 'uranus', name: 'URANUS', scene: 'outer', diag: 0.48, period: 400, start: 45, linger: 0.75, spin: 10,
    colorAt: (lon, lat) => (Math.sin(lat * 5 + 1) > 0.85 ? [170, 226, 230] : [148, 212, 222]),
    moons: [                                                                   // in Uranus's equator plane: on their side
      { ra: 2.2, period: 12, phase: 0.6, r: 1.2, color: [200, 196, 196], incl: 97.8 },    // Titania
      { ra: 2.8, period: 18, phase: 3.4, r: 1.2, color: [180, 172, 168], incl: 97.8 },    // Oberon
    ] },
  { id: 'neptune', name: 'NEPTUNE', scene: 'outer', diag: 0.62, period: 500, start: 147, linger: 0.5, spin: 9,
    colorAt: (lon, lat) => (Math.sin(3 * lon + 4 * lat) * Math.cos(2 * lat) > 0.75 ? [222, 232, 250] : Math.sin(lat * 6) > 0.4 ? [44, 76, 196] : [58, 98, 220]),
    moons: [{ ra: 2.3, period: 11, phase: 2.0, r: 1.4, color: [214, 206, 200], incl: 157 }] },    // Triton: backwards
  // Pluto and Charon circle a shared point between them (bary: Charon's share of the distance is 1 - bary), so Pluto wobbles
  { id: 'pluto', name: 'PLUTO', scene: 'outer', diag: 0.76, period: 600, start: 155, linger: 0.5, spin: 30,
    colorAt: (lon, lat) => (Math.sin(2 * lon + 0.5) * Math.cos(2 * lat) > 0.3 ? [238, 226, 206] : [176, 154, 132]),
    moons: [{ ra: 4.4, period: 16, phase: 0, r: 1.1, color: [176, 170, 166], bary: 0.3 }] },
];
const isOuter = (b) => b.scene === 'outer';

/* ------------------------------------------------------------------ *
 *  Buffer + drawing helpers
 * ------------------------------------------------------------------ */
let W = 1, H = 1, D = 1, PX = 4;
let img, buf;
let dimIdx = new Uint32Array(0), dimK = new Float32Array(0);   // pixels to darken behind the text, and by how much
let dimFull = new Float32Array(0);                          // per-pixel brightness left behind the text (1 = untouched)
let dimMask = new Uint8Array(0);                              // the dimmed zone around the text (includes a soft margin)
let bioSum = new Int32Array(0);                             // prefix sums of the bio's own text boxes (the outer planets keep off them)
let bioBottom = 0;                                          // the bio's lowest text line (art px)
let textMask = new Uint8Array(0);
let textSum = new Int32Array(0);                              // prefix sums of textMask (the text lines plus a small margin, where labels must not go): is a rectangle free of text? in O(1)

const rgb = (r, g, b) => (0xff << 24) | (b << 16) | (g << 8) | r;
const scale = ([r, g, b], k) => rgb(Math.min(255, Math.round(r * k)), Math.min(255, Math.round(g * k)), Math.min(255, Math.round(b * k)));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function plot(x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = c;
}

// a tiny body: one pixel, a 2x2 block, or (the larger Moon) a 3x3 block whose four corner pixels are dimmed so it reads round
function speck(x, y, r, c) {
  if (r < 1.2) { plot(x, y, c); return; }
  const fx = Math.round(x), fy = Math.round(y);
  if (r < 1.7) { plot(fx, fy, c); plot(fx + 1, fy, c); plot(fx, fy + 1, c); plot(fx + 1, fy + 1, c); return; }
  const r0 = c & 255, g0 = (c >> 8) & 255, b0 = (c >> 16) & 255, dim = rgb(r0 * 0.5, g0 * 0.5, b0 * 0.5);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) plot(fx + dx, fy + dy, dx !== 0 && dy !== 0 ? dim : c);
}

// shaded sphere sampled per pixel. (lx, ly, lz) points from the sphere towards the sun in screen space
// (x right, y down, z towards the viewer); three shade steps: lit, terminator, dark side
function sphere(cx0, cy0, R, rot, colorAt, lx, ly, lz, bright, alpha = 1) {
  const len = Math.hypot(lx, ly, lz) || 1;
  lx /= len; ly /= len; lz /= len;
  for (let y = Math.floor(cy0 - R); y <= Math.ceil(cy0 + R); y++) {
    for (let x = Math.floor(cx0 - R); x <= Math.ceil(cx0 + R); x++) {
      const dx = (x + 0.5 - cx0) / R;
      const dy = (y + 0.5 - cy0) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const light = dx * lx + dy * ly + nz * lz;
      const k = (light > 0.22 ? 1 : light > -0.12 ? 0.58 : 0.28) * bright;
      const col = scale(colorAt(Math.atan2(dx, nz) + rot, Math.asin(-dy)), k);
      if (alpha >= 1) plot(x, y, col);
      else {                                                // blend over whatever is already there
        const xi = Math.round(x), yi = Math.round(y);
        if (xi >= 0 && xi < W && yi >= 0 && yi < H) {
          const o = buf[yi * W + xi];
          buf[yi * W + xi] = rgb((o & 255) * (1 - alpha) + (col & 255) * alpha, ((o >> 8) & 255) * (1 - alpha) + ((col >> 8) & 255) * alpha, ((o >> 16) & 255) * (1 - alpha) + ((col >> 16) & 255) * alpha);
        }
      }
    }
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const HALO_COLORS = [[74, 36, 0], [140, 74, 4], [206, 120, 8], [250, 176, 20]];

function sun(sx, sy, R) {
  const Rh = R * HALO;
  const x0 = Math.max(0, Math.floor(sx - Rh)), y0 = Math.max(0, Math.floor(sy - Rh));
  const x1 = Math.min(W - 1, Math.ceil(sx + Rh)), y1 = Math.min(H - 1, Math.ceil(sy + Rh));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d >= Rh) continue;
      const g = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5;
      if (d <= R) {                                       // the disc: flat bands with dithered granulation
        const t = d / R + g * 0.16;
        buf[y * W + x] = t < 0.45 ? rgb(255, 246, 150) : t < 0.8 ? rgb(255, 218, 52) : rgb(255, 176, 22);
      } else {                                            // stepped halo, ordered-dithered so its edges stay blocky
        const v = Math.pow(1 - (d - R) / (Rh - R), 1.6) * 4;
        const base = Math.floor(v);
        const idx = base + (v - base > g + 0.5 ? 1 : 0);
        if (idx > 0) buf[y * W + x] = rgb(...HALO_COLORS[Math.min(3, idx - 1)]);
      }
    }
  }
}

/* ---- tiny bitmap letters for the hover labels ---- */
const GLYPHS = {
  S: ['111', '100', '111', '001', '111'], U: ['101', '101', '101', '101', '111'],
  N: ['1001', '1101', '1011', '1001', '1001'], M: ['10001', '11011', '10101', '10001', '10001'],
  E: ['111', '100', '111', '100', '111'], R: ['110', '101', '110', '101', '101'],
  C: ['111', '100', '100', '100', '111'], Y: ['101', '101', '010', '010', '010'],
  V: ['101', '101', '101', '101', '010'], A: ['010', '101', '111', '101', '101'],
  T: ['111', '010', '010', '010', '010'], H: ['101', '101', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'], I: ['111', '010', '010', '010', '111'],
  D: ['110', '101', '101', '101', '110'], B: ['110', '101', '110', '101', '110'], L: ['100', '100', '100', '100', '111'],
  J: ['001', '001', '001', '101', '111'], P: ['110', '101', '110', '100', '100'], K: ['101', '101', '110', '101', '101'],
  G: ['111', '100', '101', '101', '111'],
  ' ': ['0', '0', '0', '0', '0'],
};
const textWidth = (str) => [...str].reduce((w, ch) => w + GLYPHS[ch][0].length, 0) + str.length - 1;

function drawText(str, x, y, c) {
  [...str].forEach((ch) => {
    GLYPHS[ch].forEach((row, j) => {
      for (let k = 0; k < row.length; k++) if (row[k] === '1') plot(x + k, y + j, c);
    });
    x += GLYPHS[ch][0].length + 1;
  });
}

/* ------------------------------------------------------------------ *
 *  The 3D camera
 *
 *  World: the orbital plane is y = 0, the sun at the origin, +x to the right, +z towards the camera. The camera
 *  sits at distance 1 above the plane at elevation ELEV and looks at the sun. For a world point (x, h, z):
 *    depth  zv = 1 - z cos(e) - h sin(e)          (smaller = nearer)
 *    scale  s  = F / zv                           (F = focal length in buffer pixels)
 *    screen sx = cx + x s,   sy = cy - (h cos(e) - z sin(e)) s
 *  A planet at angle phi is at (r cos phi, 0, -r sin phi), so increasing phi turns counter-clockwise on screen.
 *
 *  The camera can move along the plane: it looks at a point (px, 0, pz) instead of the sun, so everything above is
 *  computed from (x - px, h, z - pz). The inner position is { px: 0, pz: 0 } (the plain formula above); the outer position
 *  is camOut; the switch between them only slides (px, pz) from one to the other. (d and f stay 1 and F: no zoom.)
 * ------------------------------------------------------------------ */
const SE = Math.sin(ELEV), CE = Math.cos(ELEV);
let cx = 0, cy = 0, F = 1;                  // where the camera's target lands on screen (the inner scene's sun), and the focal length
let orbitR = [], beltR = 1, rSun = 1;       // world orbit radii, belt radius, sun's screen radius (inner camera)
let kuiperR = [1, 1];                       // the Kuiper belt's inner and outer world radius
let dwell = BODIES.map(() => 0);            // per planet: the angle at the middle of its on-screen arc (where it lingers)
const CAM_IN = { px: 0, pz: 0, d: 1, f: 1 };  // (f is set by layout())
let camOut = { px: 0, pz: 0, d: 1, f: 1 };
let cam = CAM_IN;
let sunX = 0, sunY = 0, sunZv = 1, sunR = 1;  // the sun as the current camera sees it
const camFor = (b) => (isOuter(b) ? camOut : CAM_IN);

// the camera part-way through the switch (e = 0 inner position, 1 outer): it only slides along the plane
const camAt = (e) => (e <= 0 ? CAM_IN : e >= 1 ? camOut : { px: camOut.px * e, pz: camOut.pz * e, d: 1, f: F });
function setCam(c) {
  cam = c;
  [sunX, sunY, sunZv] = project(0, 0, 0);
  sunR = (rSun * (c.f / F)) / (c.d * sunZv);
}

// the point on the orbital plane under screen point (sx, sy), relative to the camera's target in camera units
function groundRel(sx, sy, focal = cam.f) {
  const q = (sy - cy) / focal, den = SE + q * CE;
  if (den <= 0.03) return null;             // above the horizon: no ground point there
  const Z = q / den, zv = 1 - Z * CE;
  return { X: ((sx - cx) * zv) / focal, Z };
}
// world radius of the orbit that passes through screen point (sx, sy): the closed-form inverse of the projection
function radiusThrough(sx, sy, focal, c = cam) {
  const g = groundRel(sx, sy, focal);
  return g ? Math.hypot(c.px + g.X * c.d, c.pz + g.Z * c.d) : Infinity;
}

// camera focal length and every orbit radius for the current sun position (cy)
function solveCamera() {
  rSun = SUN_R * D;
  // "top-left area" scales with the aspect ratio: the point sits as high above the sun, relative to how far left
  // of it, as it does on a landscape screen (about 0.42), so tall screens get proportionally smaller orbits
  const my = Math.min(0.8, Math.max(0.3, SUN_POS[1] - (0.42 * (SUN_POS[0] - MARS_PT_X) * W) / H));
  const tm = [W * MARS_PT_X, H * my], tb = [W * BELT_PT[0], H * BELT_PT[1]];
  // bisect the focal length so Mars's orbit (through its screen point) has the wanted perspective strength
  let lo = H * 0.6, hi = H * 120;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (radiusThrough(tm[0], tm[1], mid) > MARS_RADIUS) lo = mid; else hi = mid;
  }
  F = hi;
  CAM_IN.f = F;
  const rMars = radiusThrough(tm[0], tm[1], F);
  orbitR = BODIES.map((b) => (isOuter(b) ? 0 : rMars * b.orbit));      // the outer orbits are solved by solveOuter()
  beltR = radiusThrough(tb[0], tb[1], F);
  if (!(beltR >= rMars * 1.2)) beltR = rMars * 1.3;      // the belt always lies beyond Mars
  // on a tall screen the top-left point sits near the horizon, which would put the belt far beyond Mars (and every outer
  // orbit even further, too far to read as arcs): keep it close outside Mars instead
  if (W < H) beltR = Math.min(beltR, rMars * 1.5);
  // Mercury: as large as it can be while still crossing the sun's bright disc. Its tilted orbit looks like a flat one
  // seen from (camera tilt - inclination) above, so its near/far offset on screen is r * sin(tilt - inclination)
  orbitR[0] = (MERCURY_RADIUS_FACTOR * (rSun / F)) / Math.sin(ELEV - MERCURY_INCLINATION);
  // keep the spacing even: if Mercury now crowds Venus, push Venus, Earth, Mars and the belt out by the shortfall
  const shortfall = 0.8 * (orbitR[2] - orbitR[1]) - (orbitR[1] - orbitR[0]);
  if (shortfall > 0) {
    for (let i = 1; i < orbitR.length; i++) if (!isOuter(BODIES[i])) orbitR[i] += shortfall;
    beltR += shortfall;
  }
}

// the outer camera position and the outer orbits, in the same world as the inner ones (the inner camera looks at the sun
// from distance 1, so its ground points are world points). The camera slides from the ground point under the bottom-right
// corner towards the one under the top-left corner, just far enough that the belt's middle ring passes under the corner:
// |corner + t v| = beltR, a quadratic in t. Each outer orbit then goes through the ground point under its spot on the
// diagonal as seen from there.
function solveOuter() {
  const below = (sx, sy) => { let g = groundRel(sx, sy, F); for (let y = sy; !g && y < H; y += 1) g = groundRel(sx, y, F); return g; };
  const gc = below(W * (1 - OUT_BELT), H * (1 - OUT_BELT)), gt = below(W * 0.02, H * 0.02);
  let vx = gt.X - gc.X, vz = gt.Z - gc.Z;
  const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
  const bq = gc.X * vx + gc.Z * vz, cq = gc.X * gc.X + gc.Z * gc.Z - beltR * beltR;
  const t = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
  camOut = { px: t * vx, pz: t * vz, d: 1, f: F };
  // the planets' diagonal runs to the top-left corner; on a tall screen, where the bio spans the whole top, it stops just
  // under the bio instead so no orbit spends its time behind the text. The Kuiper belt keeps the real corner.
  const top = W < H ? Math.min(0.6 * H, bioBottom + 3 * vminPx()) : 0;
  const radiusAt = (f, toTop) => {
    // a spot above the horizon (a very tall screen) slides back down the diagonal until it reaches the ground
    let g = null;
    for (let k = f; !g && k > 0; k -= 0.01) g = groundRel(W * (1 - k), H - k * (H - toTop), F);
    return Math.hypot(camOut.px + g.X, camOut.pz + g.Z);
  };
  BODIES.forEach((b, i) => { if (isOuter(b)) orbitR[i] = radiusAt(b.diag, top); });
  kuiperR = KUIPER_BAND.map((f) => radiusAt(f, 0));
}

// one solar system: every orbit is centred on the sun and lies in the shared plane (Mercury's 7 degrees aside), and the
// radii strictly increase outwards, belts included. Logs an error if not.
let orbitProblems = [];
function assertOrbits() {
  const problems = [];
  BODIES.forEach((b, i) => {
    const [x1, h1, z1] = orbitPoint(i, 0.3), [x2, h2, z2] = orbitPoint(i, 0.3 + Math.PI);
    if (Math.hypot(x1 + x2, h1 + h2, z1 + z2) > 1e-9 * (1 + orbitR[i])) problems.push(b.name + ' is not centred on the sun');
    if ((b.incl || 0) !== (b.id === 'mercury' ? MERCURY_INCLINATION : 0)) problems.push(b.name + ' is off the shared plane');
  });
  const R = (id) => orbitR[BODIES.findIndex((b) => b.id === id)];
  const seq = [['MERCURY', R('mercury')], ['VENUS', R('venus')], ['EARTH', R('earth')], ['MARS', R('mars')],
    ['MAIN BELT (inner edge)', beltR * (1 - BELT_WIDTH)], ['MAIN BELT (outer edge)', beltR * (1 + BELT_WIDTH)],
    ['JUPITER', R('jupiter')], ['SATURN', R('saturn')], ['URANUS', R('uranus')], ['NEPTUNE', R('neptune')], ['PLUTO', R('pluto')],
    ['KUIPER BELT (inner edge)', kuiperR[0]], ['KUIPER BELT (outer edge)', kuiperR[1]]];
  for (let k = 1; k < seq.length; k++) if (!(seq[k][1] > seq[k - 1][1])) problems.push(seq[k][0] + ' is not outside ' + seq[k - 1][0]);
  orbitProblems = problems;
  if (problems.length) console.error('solar: the orbits are not one solar system: ' + problems.join('; '));
}

// the lowest screen row Mercury reaches on its orbit (near side, including its own radius)
function mercuryLowest() {
  let low = 0;
  for (let d = 0; d < 360; d++) {
    const [x, h, z] = orbitPoint(0, (d * Math.PI) / 180);
    const [, sy, zv] = project(x, h, z);
    low = Math.max(low, sy + planetR0(BODIES[0]));
  }
  return low;
}

function layout() {
  cam = CAM_IN;                             // the inner scene is solved first, with the camera on the sun
  cx = W * SUN_POS[0];
  let sunY = H * SUN_POS[1];
  // if Mercury's near-side arc would run off the bottom, move the sun up (never the camera) until it just fits;
  // the camera and radii depend on the sun's height, so settle it in a few passes
  for (let pass = 0; pass < 10; pass++) {
    cy = sunY;
    solveCamera();
    const excess = mercuryLowest() - (H - 2);
    if (excess <= 0.01) break;
    sunY -= excess;
  }
  solveOuter();
  assertOrbits();
  starAnchor = groundRel(W / 2, H / 2, F) || { X: 0, Z: 0 };   // the world point under the screen centre (inner camera)
  // each planet lingers at the middle of the largest stretch of its orbit that is on screen (seen from its own scene)
  dwell = BODIES.map((b, i) => {
    setCam(camFor(b));
    let best = [0, 0], from = null;
    for (let d = 0; d <= 720; d++) {
      const v = planetState(i, ((d % 360) * Math.PI) / 180).visible;
      if (v && from === null) from = d;
      if ((!v || d === 720) && from !== null) { if (d - from > best[1]) best = [from, d - from]; from = null; }
    }
    if (b.linger) lingerTab[i] = lingerTable(b.linger, ((best[1] / 2) * Math.PI) / 180);
    return (((best[0] + best[1] / 2) % 360) * Math.PI) / 180;
  });
  // the Kuiper band's stretch on screen (seen from the outer camera), with a margin so specks drift in from off screen
  setCam(camOut);
  {
    const rm = (kuiperR[0] + kuiperR[1]) / 2, on = [];
    let zn = Infinity, zf = 0;
    for (let d = 0; d < 1440; d++) {
      const a = (d / 1440) * TAU;
      for (const r of [kuiperR[0], rm, kuiperR[1]]) {
        const [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a));
        if (zv > NEAR_CLIP && sx > -8 && sy > -8 && sx < W + 8 && sy < H + 8) { on.push(a); zn = Math.min(zn, zv); zf = Math.max(zf, zv); break; }
      }
    }
    // the on-screen angles form one run (possibly across 0): find its ends
    let lo = 0, hi = 0;
    if (on.length) {
      const sorted = on.slice().sort((p, q) => p - q);
      let gap = 0, at = 0;
      for (let k = 0; k < sorted.length; k++) { const nx = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TAU; if (nx - sorted[k] > gap) { gap = nx - sorted[k]; at = k; } }
      lo = sorted[(at + 1) % sorted.length]; hi = sorted[at]; if (hi < lo) hi += TAU;
    }
    kuiperSpan = [lo - 0.02, hi + 0.02];
    kuiperZv = [zn, zf];
    // the named ones go where they and their names are clear of the text, spread along that clear stretch
    const textAt = (x, y, w, h) => {
      const S = W + 1, ax = Math.max(0, Math.floor(x)), ay = Math.max(0, Math.floor(y)), bx = Math.min(W, Math.ceil(x + w)), by = Math.min(H, Math.ceil(y + h));
      return bx > ax && by > ay && textSum.length === S * (H + 1) && textSum[by * S + bx] - textSum[ay * S + bx] - textSum[by * S + ax] + textSum[ay * S + ax] > 0;
    };
    const clear = [], under = [];                           // [u, f, x, y] spots on the band on screen: clear of text, or behind it
    const span = kuiperSpan[1] - kuiperSpan[0];
    for (let f = 0.05; f <= 0.95; f += 0.1) {
      const r = kuiperR[0] + (kuiperR[1] - kuiperR[0]) * f;
      for (let u = 0.02; u < 0.98; u += 0.01) {
        const a = kuiperSpan[0] + u * span, [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a));
        if (zv > NEAR_CLIP && sx > 24 && sx < W - 24 && sy > 12 && sy < H - 12) (textAt(sx - 22, sy - 10, 44, 14) ? under : clear).push([u, f, sx, sy]);
      }
    }
    clear.sort((p, q) => p[2] - q[2]);                      // left to right, then spread the three along it
    const taken = [];
    under.sort((p, q) => p[2] - q[2]);
    KUIPER_NAMED.forEach((m, k) => {
      // a clear spot if there is one left (spread along the clear stretch), otherwise one behind the text (its name then
      // finds the nearest clear spot and a leader joins them)
      for (const list of [clear, under]) {
        const want = Math.floor(((k + 0.5) / KUIPER_NAMED.length) * list.length);
        for (let d = 0; d < list.length; d++) {
          for (const j of [want + d, want - d]) {
            const c = list[j];
            if (!c || taken.some((q) => Math.hypot(q[2] - c[2], q[3] - c[3]) < Math.min(26, 0.14 * W))) continue;
            m.u = c[0]; m.f = c[1]; taken.push(c); d = list.length; break;
          }
        }
        if (taken.length > k) break;
      }
    });
  }
  arrivals = arrivalMoments();
  setCam(sceneCam());
  checkSizes();
}

// moments in the outer scene's cycle when all five of its bodies are on screen (clear of the bio) for ARRIVE_MIN_S or
// longer: [start, end] in seconds. Arriving in the outer scene jumps its clock (unseen, off screen) to one of these.
const OUTER_CYCLE = 6000;
let arrivals = [];
function arrivalMoments() {
  const out = [], idx = BODIES.map((b, i) => (isOuter(b) ? i : -1)).filter((i) => i >= 0), step = 0.5;
  let from = null;
  for (let t = 0; t <= OUTER_CYCLE; t += step) {
    const all = t < OUTER_CYCLE && idx.every((i) => planetState(i, angleAt(i, t, startRad[i])).visible);
    if (all && from === null) from = t;
    if (!all && from !== null) { if (t - from >= ARRIVE_MIN_S) out.push([from, t - step]); from = null; }
  }
  if (!out.length) console.warn('solar: no moment in the outer cycle has all five bodies in view');
  return out;
}
// how far to jump the outer clock when a switch to the outer position starts (lead = the switch's length), so that all
// five outer bodies are in view on arrival. Bodies already on screen must not move: the jump is then a whole number of
// their orbital periods (Jupiter alone: 200 s), so they end up exactly where they were. Returns 0 when no jump works.
let jumpOut = 0;                              // all the jumps so far (spins, moons and belt specks run on clockOut - jumpOut)
function arrivalJump(now, lead, lockedPeriods) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const step = lockedPeriods.reduce((a, p) => (a * p) / gcd(a, p), 1);
  const idx = BODIES.map((b, i) => (isOuter(b) ? i : -1)).filter((i) => i >= 0), keep = cam;
  const allUp = (T) => idx.every((i) => planetState(i, angleAt(i, T, startRad[i])).visible);
  setCam(camOut);
  let best = 0;
  if (step > 1) {
    for (let k = 0; k * step < OUTER_CYCLE; k++) {
      const T = now + k * step + lead;
      if (allUp(T) && allUp(T + ARRIVE_MIN_S / 2)) { best = k * step; break; }
    }
  } else {
    const base = Math.floor(now / OUTER_CYCLE) * OUTER_CYCLE;
    outer: for (const cyc of [base, base + OUTER_CYCLE]) {
      for (const [a, b] of arrivals) {
        const land = cyc + a + Math.min(1, (b - a) / 3);      // a moment in, so all five stay up a while after arriving
        if (land - lead >= now) { best = land - lead - now; break outer; }
      }
    }
  }
  setCam(keep);
  return best;
}

// the size rules (SIZES): warn if one is broken at this screen size
let sizeReport = null;
function checkSizes() {
  const R = (id) => planetR0({ id }), sunD = 2 * rSun, problems = [];
  if (sunD < 4 * 2 * R('jupiter')) problems.push('the Sun is under 4x Jupiter');
  for (const g of ['jupiter', 'saturn', 'uranus', 'neptune']) if (R(g) < 2 * R('earth') - 1e-9) problems.push(g + ' is under 2x Earth');
  for (const o of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) if (R(o) <= R('pluto')) problems.push('Pluto is not smaller than ' + o);
  sizeReport = { sunVmin: +((sunD / vminPx())).toFixed(1), jupiterVmin: SIZES.jupiter, sunOverJupiter: +(sunD / (2 * R('jupiter'))).toFixed(2), problems };
  if (problems.length) console.warn('solar: size rules broken: ' + problems.join('; '));
}

// screen position and depth of a world point (depth 1 = the camera's target; at or below 0 it is behind the camera)
const project = (x, h, z) => {
  const X = (x - cam.px) / cam.d, Z = (z - cam.pz) / cam.d, Y = h / cam.d;
  const zv = 1 - Z * CE - Y * SE, s = cam.f / zv;
  return [cx + X * s, cy - (Y * CE - Z * SE) * s, zv];
};
const NEAR_CLIP = 0.05;                     // closer than this (or behind the camera) is not drawn

/* ------------------------------------------------------------------ *
 *  Planet state (a pure function of time, shared by drawing, hit-testing and the visibility checks)
 * ------------------------------------------------------------------ */
// the facts and detail-view settings for each planet live in js/planets.js, keyed by id
const PLANET_DATA = Object.fromEntries((window.BODY_DATA || []).map((p) => [p.id, p]));
// besides the planets, the Sun and the two belts open a close-up view too
const SUN_ID = 'sun', BELT_ID = 'asteroid-belt', KUIPER_ID = 'kuiper-belt';
const openable = (id) => BODIES.some((b) => b.id === id) || id === SUN_ID || id === BELT_ID || id === KUIPER_ID;
// which scene a body lives in (the asteroid belt is in both: null)
const sceneOf = (id) => { const b = BODIES.find((q) => q.id === id); return b ? (isOuter(b) ? 'outer' : 'inner') : id === KUIPER_ID ? 'outer' : id === SUN_ID ? 'inner' : null; };
const startRad = BODIES.map((b) => (b.start * Math.PI) / 180);
const vminPx = () => Math.min(W, H) / 100;                  // one vmin, in art pixels
const planetR0 = (b) => Math.max(1, (SIZES[b.id] * vminPx()) / 2);    // art-pixel radius, from SIZES (the same everywhere)

// the planet's angle at time t, given its starting phase m0 (radians): uniform motion, slowed near its dwell angle
function angleAt(i, t, m0) {
  const b = BODIES[i], M = m0 + (TAU * t) / b.period;
  if (b.linger && lingerTab[i]) {                         // the outer planets: look the angle up in their linger table
    const tab = lingerTab[i], n = tab.length - 1;
    let x = (M - dwell[i]) / TAU + 0.5;
    const lap = Math.floor(x);
    x = (x - lap) * n;
    const k = Math.min(n - 1, Math.floor(x));
    return dwell[i] + lap * TAU + tab[k] + (tab[k + 1] - tab[k]) * (x - k);
  }
  return M - 2 * b.lull * Math.sin(M - dwell[i]);
}

// a planet that spends `share` of each lap on an arc of half-width h (radians) around its dwell angle. The time spent per
// unit angle is 1 + K inside the arc, easing back to 1 over a short ramp outside it, with K solved so the arc gets exactly
// its share. Returns u (the offset from the dwell angle, -pi..pi) at evenly spaced moments of the lap.
let lingerTab = [];
function lingerTable(share, h) {
  h = Math.max(0.02, Math.min(Math.PI - 0.1, h));
  const RAMP = Math.min(0.1, 0.25 * h), N = 2048;             // a short arc gets a short ramp, so it can still get its share
  const K = Math.max(0, (2 * h - TAU * share) / (share * (2 * h + RAMP) - 2 * h));
  const rho = (u) => { const a = Math.abs(u); return 1 + K * (a <= h ? 1 : a < h + RAMP ? 0.5 + 0.5 * Math.cos((Math.PI * (a - h)) / RAMP) : 0); };
  const us = [], cum = [0];                                  // cumulative time across the lap
  for (let j = 0; j <= N; j++) us.push(-Math.PI + (TAU * j) / N);
  for (let j = 1; j <= N; j++) cum.push(cum[j - 1] + (rho(us[j - 1]) + rho(us[j])) / 2);
  const total = cum[N], tab = new Float32Array(N + 1);
  for (let j = 0, k = 0; j <= N; j++) {                      // invert: the angle reached at each moment
    const want = (total * j) / N;
    while (k < N - 1 && cum[k + 1] < want) k++;
    tab[j] = us[k] + (us[k + 1] - us[k]) * ((want - cum[k]) / (cum[k + 1] - cum[k] || 1));
  }
  return tab;
}

// a planet's real 3D position at angle phi: [x, height, z, z0]. z0 is its position in its own orbital plane (positive =
// near side); a tilted plane (incl) rotates about the screen's horizontal axis so the near side rises
function orbitPoint(i, phi) {
  const r = orbitR[i], incl = BODIES[i].incl || 0;
  const x = r * Math.cos(phi), z0 = -r * Math.sin(phi);
  return [x, z0 * Math.sin(incl), z0 * Math.cos(incl), z0];
}

function planetState(i, phi) {
  const b = BODIES[i], r = orbitR[i];
  const [x, h, z, z0] = orbitPoint(i, phi);
  const [sx, sy, zv] = project(x, h, z);                    // depth comes from the real 3D position
  const R = planetR0(b);                                    // one size everywhere (SIZES); only the position has perspective
  const near = clamp01(0.5 + z0 / (2 * r));                 // 0 = far side of its orbit, 1 = near side
  const hidden = zv > sunZv && Math.hypot(sx - sunX, sy - sunY) < sunR;     // behind the sun's disc
  const clipped = zv < 0.25;                                // (nearly) behind the camera: not drawn
  const inView = !clipped && sx >= R && sx <= W - R && sy >= R && sy <= H - R;     // the whole planet is inside the viewport
  // the outer planets only count as in view when they are clear of the bio, so they never linger behind the text
  const underBio = isOuter(b) && inView && boxHitsBio(sx - R, sy - R, 2 * R, 2 * R);
  return { i, b, x, h, z, sx, sy, zv, R, near, hidden, clipped, inView, underBio, visible: inView && !hidden && !underBio, active: true };
}

/* ------------------------------------------------------------------ *
 *  Asteroid belt: a ring of points with a little random thickness above and below the plane
 * ------------------------------------------------------------------ */
let seed = 11;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const SHADES = [[78, 78, 82], [112, 112, 118], [150, 150, 156]];
const asteroids = Array.from({ length: BELT_COUNT }, () => ({
  a0: rand() * TAU,
  w: TAU / (260 + rand() * 240),                // very slow counter-clockwise drift (rad/s)
  rk: 1 + (rand() * 2 - 1) * BELT_WIDTH,        // radius factor within the band
  hk: (rand() + rand() + rand() - 1.5) * 0.045, // height above or below the plane, relative to the radius
  shade: SHADES[Math.floor(rand() * 3)],
  dash: rand() < 0.25,
}));
// the Kuiper belt: a dense band of icy specks, spread only along the stretch of the band that is on screen (kuiperSpan,
// set by layout()), drifting slowly and wrapping round within it (its own random stream, so the belt above is unchanged)
let seedK = 29;
const randK = () => (seedK = (seedK * 1664525 + 1013904223) >>> 0) / 4294967296;
const ICE = [[150, 178, 214], [190, 210, 236], [232, 238, 250]];        // pale blue to white
const kuiperRocks = Array.from({ length: KUIPER_COUNT }, () => ({
  u: randK(),                                   // where along the on-screen arc (0..1)
  du: 1 / (420 + randK() * 380),                // drift, in arcs per second
  f: randK(),                                   // where across the band (0 inner edge, 1 outer edge)
  hk: (randK() + randK() + randK() - 1.5) * 0.05,
  shade: ICE[Math.floor(randK() * 3)],
  big: randK() < 0.35,                          // may be drawn 2x2 when near
}));
// the named ones in the overview: slightly larger dots, always labelled
const KUIPER_NAMED = [
  { name: 'HAUMEA', u: 0.3, f: 0.55, color: [236, 240, 248], shape: 'long' },
  { name: 'MAKEMAKE', u: 0.55, f: 0.3, color: [226, 196, 170], shape: 'dot' },
  { name: 'ARROKOTH', u: 0.78, f: 0.7, color: [196, 120, 96], shape: 'pair' },
];   // (layout() moves each to a stretch of the band that is clear of the page text, so its name has room)
let kuiperSpan = [0, 0], kuiperZv = [1, 1];     // the band's on-screen angles, and its nearest / farthest depth

// dim background stars (they slide at STAR_PARALLAX of the scenery's speed, wrapping round the screen)
let seedS = 5;
const randS = () => (seedS = (seedS * 1664525 + 1013904223) >>> 0) / 4294967296;
const STARS = Array.from({ length: STAR_COUNT }, () => {
  const v = 34 + Math.floor(randS() * 46), tint = randS() < 0.3 ? 14 : 0;
  return { x: randS(), y: randS(), c: rgb(v, v, v + tint) };
});

// directions tried when a name has to be moved away from its planet: straight up first, then outwards from there
const RING_ANGLES = Array.from({ length: 24 }, (_, i) => -90 + i * 15).sort((a, b) => Math.abs(((a + 90 + 540) % 360) - 180 + 0) - Math.abs(((b + 90 + 540) % 360) - 180 + 0));
const ORBIT_BASE = [88, 94, 116], MOON_ORBIT_BASE = [96, 100, 116], RING_C = rgb(230, 230, 236);
const brightFor = (near) => 0.72 + 0.28 * near;             // planets and moons: dimmer far, brighter near
const lineFor = (near) => 0.45 + 0.55 * near;               // orbit lines and asteroids

/* ------------------------------------------------------------------ *
 *  Hover / selection
 * ------------------------------------------------------------------ */
let placed = [];                            // planets as drawn in the latest frame (for hit-testing)
let hovered = null;                         // a planet (from BODIES), 'SUN', 'BELT' or 'KUIPER'
// the overview's scene: scene.t runs 0 (inner) to 1 (outer), scene.dir is the way it is flying (0 at rest)
const scene = { t: 0, dir: 0 };
const sceneMoving = () => scene.dir !== 0 || (scene.t > 0 && scene.t < 1);
const sceneName = () => (scene.t >= 0.5 ? 'outer' : 'inner');
const sceneCam = () => (scene.t >= 0.5 ? camOut : CAM_IN);     // the camera of the scene at rest (or mostly shown)
let focusedBody = null;                     // the planet whose invisible button has keyboard focus
// the detail view: view.id is the open planet (null = overview), view.t runs 0 (overview) to 1 (planet view), view.dir is the
// direction it is animating in (+1 opening, -1 closing, 0 at rest). The orbit clock is paused whenever a view is open.
const view = { id: null, t: 0, dir: 0, light: null };
const VIEW_MS = reduceMotion ? 200 : 1200;
const FADE_MS = reduceMotion ? 0 : 220;     // the callouts fade out for this long before the zoom-out starts
let closing = false, closeTimer = 0;
let headH = 80, listH = 0;                  // heights of the planet's name block and its list of facts (the list layout fits the planet between them)
const bio = page.querySelector('.page4-text');
let bioFrom = 0, bioTo = 0, bioScale = 1, bioZoom = -1;   // the bio's width (css px) closed and open, its open font scale
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
let cssW = 1, cssH = 1, colRight = 0;       // canvas size and the right edge of the text column, in css px
let labelInfo = { visible: 0, labelled: 0, missed: [] };   // per frame: planets in view vs planets that got a name
let lastLabels = [];                        // the labels drawn in the latest frame: [x, y, w, h, text] in art pixels
const nameOf = (t) => (t === 'SUN' ? 'SUN' : t === 'BELT' ? 'ASTEROID BELT' : t === 'KUIPER' ? 'KUIPER BELT' : t ? t.name : null);

/* ------------------------------------------------------------------ *
 *  Frame
 * ------------------------------------------------------------------ */
// the whole solar system seen by the current camera: orbit lines, the belts, the sun, the planets and their moons,
// depth-sorted, skipping whatever is off screen. Draws over what is already in the buffer and fills `placed`.
// Around the sun: no orbit line or belt speck is ever drawn inside its disc (the far side is hidden behind it, and the near
// side stops at its edge), and the outer bodies are always drawn before it, so nothing from out there covers the sun.
let fadeBuf = null;
let sunSeen = null;                         // the sun as drawn this frame (for its label), or null
const SATURN_RING = [214, 194, 148];
let sunSkips = 0;                            // line pixels kept off the sun's disc this frame (for tests)
function scenery(t, tOut) {
  const far = [], near = [];
  const sunOn = sunZv > NEAR_CLIP, sr2 = (sunR + 0.5) * (sunR + 0.5);
  const onSun = (sx, sy) => sunOn && (sx - sunX) * (sx - sunX) + (sy - sunY) * (sy - sunY) < sr2;
  sunSkips = 0;                // depth-sorted bodies, drawn around the sun

  // orbit lines: one dotted ellipse per planet, far half before the sun, near half after it
  const farLines = [], nearLines = [];
  BODIES.forEach((b, i) => {
    const r = orbitR[i];
    // the outer orbits are sampled for how big they look from their camera's distance
    const n = isOuter(b) ? Math.min(8000, Math.max(48, Math.ceil((TAU * r * cam.f * 1.5) / cam.d))) : Math.max(48, Math.ceil(TAU * r * F * 1.5));
    for (let k = 0; k < n; k++) {
      const [x, h, z, z0] = orbitPoint(i, (k / n) * TAU);
      const [sx, sy, zv] = project(x, h, z);
      if (zv < NEAR_CLIP || sx < -1 || sy < -1 || sx > W || sy > H) continue;
      if (onSun(sx, sy)) { sunSkips++; continue; }
      (zv > sunZv ? farLines : nearLines).push(sx, sy, lineFor(clamp01(0.5 + z0 / (2 * r))));
    }
  });
  const plotLines = (arr, base) => {
    for (let i = 0; i < arr.length; i += 3) plot(arr[i], arr[i + 1], scale(base, arr[i + 2]));
  };

  // asteroid belt (a little brighter while it is hovered or its button has keyboard focus). It is in both scenes, so it
  // drifts whenever either one is shown
  const beltOn = (hovered === 'BELT' || focusedBody === 'BELT') && !view.id;
  const farRocks = [], nearRocks = [], tb = t + tOut - jumpOut;      // (arrival jumps never move the specks)
  for (const s of asteroids) {
    const a = s.a0 + s.w * tb, r = beltR * s.rk;
    const x = r * Math.cos(a), z = -r * Math.sin(a), h = r * s.hk;
    const [sx, sy, zv] = project(x, h, z);
    if (zv < NEAR_CLIP || sx < -2 || sy < -2 || sx > W || sy > H || onSun(sx, sy)) continue;
    (z < 0 ? farRocks : nearRocks).push([sx, sy, s, 0.5 + 0.5 * clamp01(0.5 + z / (2 * r))]);
  }
  const plotRocks = (arr, on) => {
    for (const [sx, sy, s, k] of arr) {
      const c = scale(s.shade, on ? k * 1.3 : k);
      plot(sx, sy, c);
      if (s.dash) plot(sx + 1, sy, c);
    }
  };

  // the Kuiper belt: icy specks along the arc the outer camera sees; nearer ones are bigger and brighter
  const kuiperOn = (hovered === 'KUIPER' || focusedBody === 'KUIPER') && !view.id;
  const kRocks = [], kNamed = [];
  {
    const span = kuiperSpan[1] - kuiperSpan[0], zn = kuiperZv[0], zf = kuiperZv[1];
    const at = (u, f, hk) => {
      const a = kuiperSpan[0] + (((u % 1) + 1) % 1) * span, r = kuiperR[0] + (kuiperR[1] - kuiperR[0]) * f;
      const x = r * Math.cos(a), z = -r * Math.sin(a);
      return project(x, r * hk, z);
    };
    for (const s of kuiperRocks) {
      const [sx, sy, zv] = at(s.u + s.du * (tOut - jumpOut), s.f, s.hk);
      if (zv < NEAR_CLIP || sx < -2 || sy < -2 || sx > W || sy > H || onSun(sx, sy)) continue;
      kRocks.push([sx, sy, s, clamp01((zf - zv) / (zf - zn || 1))]);
    }
    for (const m of KUIPER_NAMED) {
      const [sx, sy, zv] = at(m.u, m.f, 0);
      if (zv >= NEAR_CLIP && sx > -4 && sy > -4 && sx < W + 4 && sy < H + 4) kNamed.push({ m, sx, sy, R: 2 });
    }
  }
  const plotIce = (on) => {
    for (const [sx, sy, s, nr] of kRocks) {
      const c = scale(s.shade, (0.45 + 0.55 * nr) * (on ? 1.25 : 1));
      plot(sx, sy, c);
      if (s.big && nr > 0.55) { plot(sx + 1, sy, c); plot(sx, sy + 1, c); plot(sx + 1, sy + 1, c); }
    }
    for (const k of kNamed) {
      const c = scale(k.m.color, on ? 1.15 : 1), x = Math.round(k.sx), y = Math.round(k.sy);
      if (k.m.shape === 'long') { for (let d = -1; d <= 1; d++) plot(x + d, y, c); }                       // Haumea: elongated
      else if (k.m.shape === 'pair') { plot(x, y, c); plot(x + 1, y, scale(k.m.color, 0.8)); }        // Arrokoth: two lobes
      else { plot(x, y, c); plot(x + 1, y, c); plot(x, y + 1, c); plot(x + 1, y + 1, c); }
    }
  };

  // planets and their moons become depth-sorted bodies
  BODIES.forEach((b, i) => {
    const p = planetState(i, angleAt(i, isOuter(b) ? tOut : t, startRad[i]));
    placed[i] = p;
    const m = Math.max(16, p.R * 2.5);
    if (p.clipped || p.sx < -m || p.sy < -m || p.sx > W + m || p.sy > H + m) return;
    // tp: the body's own spin and its moons. An arrival jump moves the outer bodies along their orbits only (and only the
    // ones off screen, see arrivalJump), so these run on the jump-free clock
    const tp = isOuter(b) ? tOut - jumpOut : t;
    const Rw = (planetR0(b) / cam.f) * cam.d;               // planet radius in world units
    const kpx = p.R / Rw;                                   // screen pixels per world unit at the planet
    let px = p.x, pz = p.z;
    // moons, each on its own orbit plane (incl: tilted about the line of sight's horizontal, degrees)
    const moonAt = (m, th, ra) => {
      const inc = ((m.incl || 0) * Math.PI) / 180;
      return [ra * Math.cos(th), ra * Math.sin(th) * Math.sin(inc), -ra * Math.sin(th) * Math.cos(inc)];
    };
    let wob = [0, 0, 0];                                    // Pluto's own circle round the shared point
    const moons = b.moons.map((m) => {
      const th = m.phase + (TAU * tp) / m.period;
      let ra = Rw * m.ra + (2 / cam.f) * cam.d;
      if (m.bary) {                                        // Charon and Pluto on opposite sides of the shared point
        const o = moonAt(m, th, ra * m.bary);
        wob = [-o[0], -o[1], -o[2]];
        ra *= 1 - m.bary;
      }
      const [ox, oh, oz] = moonAt(m, th, ra);
      const [sx, sy, zv] = project(p.x + ox, p.h + oh, p.z + oz);
      return { m, th, ra, sx, sy, zv, near: clamp01(0.5 + oz / (2 * ra)) };
    });
    const [bx, by, bz] = project(p.x + wob[0], p.h + wob[1], p.z + wob[2]);
    // light from the sun (at the origin), in screen space: (towards the sun, y down, towards the viewer)
    const lx = -px, ly = p.h * CE - pz * SE, lz = -(p.h * SE + pz * CE);
    // moon orbits: dotted ellipses round the planet (or the shared point), far half behind it and near half in front
    const dashes = (nearHalf) => {
      for (const k of moons) {
        const n = Math.max(24, Math.ceil((TAU * k.ra * cam.f * 1.3) / cam.d));
        for (let j = 0; j < n; j++) {
          if (j % 4 >= 2) continue;
          const [ox, oh, oz] = moonAt(k.m, (j / n) * TAU, k.ra), dz = oz * CE + oh * SE;
          if ((dz > 0) !== nearHalf) continue;
          const [sx, sy] = project(p.x + ox, p.h + oh, p.z + oz);
          if (onSun(sx, sy)) { sunSkips++; continue; }                 // moon orbits keep off the sun's disc too
          plot(sx, sy, scale(MOON_ORBIT_BASE, lineFor(clamp01(0.5 + dz / (2 * k.ra)))));
        }
      }
    };
    // Saturn's rings: a tilted band round the planet in screen space at the planet's own scale, back half first
    const rings = (nearHalf) => {
      if (!b.rings) return;
      const tilt = (b.rings * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
      const Rout = (SIZES.saturnRings / SIZES.saturn) * p.R, Rin = 1.25 * p.R;
      for (let rr = Rin; rr <= Rout; rr += 0.55) {
        const f = (rr - Rin) / (Rout - Rin);
        if (f > 0.7 && f < 0.78) continue;                  // the Cassini division
        const n = Math.ceil(TAU * rr * 1.4);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU, x0 = rr * Math.cos(a), z0 = -rr * Math.sin(a);
          if ((z0 > 0) !== nearHalf) continue;
          // the ring plane, seen from the camera's tilt, then turned on screen by Saturn's axial tilt
          const sx0 = x0, sy0 = z0 * SE;
          const sx = p.sx + sx0 * ct - sy0 * st, sy = p.sy + sx0 * st + sy0 * ct;
          const shade = (f < 0.35 ? 0.78 : f < 0.7 ? 1 : 0.86) * lineFor(clamp01(0.5 + z0 / (2 * rr)));
          plot(sx, sy, scale(SATURN_RING, shade * brightFor(p.near)));
        }
      }
    };
    if (!(view.id === b.id && view.t > 0)) {                // the open planet is drawn on its own, last
      const body = {
        zv: p.zv,
        draw: () => {
          dashes(false);
          rings(false);
          sphere(bx, by, p.R, (TAU * tp) / b.spin, b.colorAt, lx, ly, lz, brightFor(p.near));
          rings(true);
          dashes(true);
        },
      };
      (isOuter(b) || p.zv > sunZv ? far : near).push(body);        // the outer bodies never go in front of the sun
    }
    for (const k of moons) {
      const r = k.m.bary ? p.R / 2 : k.m.r;                  // Charon: half Pluto's size
      const mb = { zv: k.zv, draw: () => speck(k.sx, k.sy, r / k.zv, scale(k.m.color, brightFor(k.near))) };
      (isOuter(b) || k.zv > sunZv ? far : near).push(mb);
    }
  });

  // painter's order: far side first, then the sun, then the near side
  plotLines(farLines, ORBIT_BASE);
  plotIce(kuiperOn);
  plotRocks(farRocks, beltOn);
  far.sort((a, b) => b.zv - a.zv).forEach((o) => o.draw());
  if (sunOn) { sun(sunX, sunY, sunR); if (sunX + sunR > 0 && sunY + sunR > 0 && sunX - sunR < W && sunY - sunR < H) sunSeen = { x: sunX, y: sunY, r: sunR }; }
  plotLines(nearLines, ORBIT_BASE);
  plotRocks(nearRocks, beltOn);
  near.sort((a, b) => b.zv - a.zv).forEach((o) => o.draw());
  return { farRocks, nearRocks, kRocks, kNamed, beltOn, kuiperOn };
}

// a body that is not drawn this frame (its scene is off screen)
const idle = (i) => ({ i, b: BODIES[i], sx: -1e4, sy: -1e4, R: 0, zv: 1, active: false, hidden: true, clipped: true, inView: false, visible: false });

// the stars slide at STAR_PARALLAX of the scenery's speed: 30% of how far the ground under the screen centre has moved
// on screen since the inner position, wrapping round the screen
let starAnchor = { X: 0, Z: 0 };
function stars() {
  const [ax, ay] = project(starAnchor.X, 0, starAnchor.Z);
  const ox = (ax - W / 2) * STAR_PARALLAX, oy = (ay - H / 2) * STAR_PARALLAX;
  for (const s of STARS) {
    const x = Math.round((((s.x * W + ox) % W) + W) % W), y = Math.round((((s.y * H + oy) % H) + H) % H);
    if (x >= 0 && x < W && y >= 0 && y < H && buf[y * W + x] === (0xff000000 | 0)) buf[y * W + x] = s.c;
  }
}

function draw(t, tOut = clockOut) {
  // the bio narrows to the left half in step with the camera, so its text (and the dimming behind it) moves every frame
  if (syncBio(view.id ? easeInOut(view.t) : 0)) measureText();
  placed = BODIES.map((b, i) => idle(i));
  sunSeen = null;
  let sc;
  buf.fill(0xff000000);
  if (reduceMotion && sceneMoving()) {
    // reduced motion: no camera move; the same world seen from the two positions crossfades
    setCam(CAM_IN); stars(); scenery(t, tOut);
    if (!fadeBuf || fadeBuf.length !== buf.length) fadeBuf = new Uint32Array(buf.length);
    fadeBuf.set(buf);
    buf.fill(0xff000000);
    setCam(camOut); stars(); sc = scenery(t, tOut);
    const k = scene.t, j = 1 - k;
    for (let i = 0; i < buf.length; i++) {
      const a = fadeBuf[i], b = buf[i];
      buf[i] = rgb((a & 255) * j + (b & 255) * k, ((a >> 8) & 255) * j + ((b >> 8) & 255) * k, ((a >> 16) & 255) * j + ((b >> 16) & 255) * k);
    }
  } else {
    // one camera: during the switch it slides along the plane between the two positions
    setCam(camAt(easeInOut(scene.t)));
    stars();
    sc = scenery(t, tOut);
  }
  setCam(sceneCam());                       // hit tests, buttons and the zoom use the camera at rest
  const { farRocks, nearRocks, kRocks, kNamed, beltOn, kuiperOn } = sc;
  const tgt = view.id ? targetState() : null, zoom = tgt ? easeInOut(view.t) : 0;

  // keep the background quiet behind the text
  for (let i = 0; i < dimIdx.length; i++) {
    const c = buf[dimIdx[i]], k = dimK[i];
    buf[dimIdx[i]] = rgb((c & 255) * k, ((c >> 8) & 255) * k, ((c >> 16) & 255) * k);
  }

  // names: every planet's name floats above it (brighter while hovered or focused); labels never go over the page text
  // or over each other
  const labelRects = [];
  const clearRect = (x0, y0, w, h, onSunOk = false) => {
    x0 = Math.round(x0); y0 = Math.round(y0);
    if (x0 - 1 < 0 || y0 - 1 < 0 || x0 + w + 1 > W || y0 + h + 1 > H) return false;
    if (!onSunOk && sunSeen) {                             // names keep off the sun's disc (only its own name sits on it)
      const nx = Math.max(x0 - 1, Math.min(sunSeen.x, x0 + w + 1)), ny = Math.max(y0 - 1, Math.min(sunSeen.y, y0 + h + 1));
      if (Math.hypot(nx - sunSeen.x, ny - sunSeen.y) < sunSeen.r + 1) return false;
    }
    const S = W + 1, ax = x0 - 1, ay = y0 - 1, bx = x0 + w + 1, by = y0 + h + 1;       // rectangle [ax, bx) x [ay, by)
    if (textSum[by * S + bx] - textSum[ay * S + bx] - textSum[by * S + ax] + textSum[ay * S + ax] > 0) return false;
    for (const r of labelRects) if (x0 - 1 < r[0] + r[2] && x0 + w + 1 > r[0] && y0 - 1 < r[1] + r[3] && y0 + h + 1 > r[1]) return false;
    return true;
  };
  const putLabel = (str, x0, y0, color, backing = true) => {
    x0 = Math.round(x0); y0 = Math.round(y0);
    const w = textWidth(str), h = 5;
    if (backing) for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) plot(x, y, 0xff000000);
    drawText(str, x0, y0, color);
    labelRects.push([x0, y0, w, h, str]);
  };
  const LABEL_C = rgb(206, 206, 216), LABEL_HI = rgb(255, 255, 255), LEADER_C = rgb(120, 124, 140);

  labelInfo = { visible: 0, labelled: 0, moved: 0, missed: [] };
  const named = placed.filter((p) => p.active && !p.clipped && p.sx >= 0 && p.sx <= W && p.sy >= 0 && p.sy <= H && !p.hidden)
    .concat((kNamed || []).map((k) => ({ sx: k.sx, sy: k.sy, R: k.R, b: { name: k.m.name } })));
  for (const p of named) {
    labelInfo.visible++;
    const on = p.b === hovered || p.b === focusedBody;
    if (on && !view.id) ring(p.sx, p.sy, p.R + 3, RING_C);
    const w = textWidth(p.b.name), h = 5, g = p.R + 3;
    // first choice: right next to the planet (above, below, right, left, then the diagonals); otherwise the nearest
    // clear spot on rings around it, joined to the planet by a dotted leader line (when it sits on top of the text)
    let spot = null, far = false;
    const near = [
      [p.sx - w / 2, p.sy - g - h], [p.sx - w / 2, p.sy + g], [p.sx + g, p.sy - 2], [p.sx - g - w, p.sy - 2],
      [p.sx + g * 0.7, p.sy - g * 0.7 - h], [p.sx - g * 0.7 - w, p.sy - g * 0.7 - h], [p.sx + g * 0.7, p.sy + g * 0.7], [p.sx - g * 0.7 - w, p.sy + g * 0.7],
    ];
    spot = near.find(([x0, y0]) => clearRect(x0, y0, w, h)) || null;
    for (let dist = g + 5; !spot && dist <= g + 90; dist += 5) {
      for (const deg of RING_ANGLES) {
        const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
        const x0 = p.sx + c * (dist + (w / 2) * Math.abs(c)) - w / 2, y0 = p.sy + sn * (dist + (h / 2) * Math.abs(sn)) - h / 2;
        if (clearRect(x0, y0, w, h)) { spot = [x0, y0]; far = true; break; }
      }
    }
    if (!spot) {
      labelInfo.missed.push({ name: p.b.name, x: Math.round(p.sx), y: Math.round(p.sy) });
      continue;
    }
    if (far) {                                                // dotted leader from the planet's edge to the label
      labelInfo.moved++;
      const tx = Math.max(spot[0], Math.min(p.sx, spot[0] + w)), ty = Math.max(spot[1], Math.min(p.sy, spot[1] + h));
      const len = Math.hypot(tx - p.sx, ty - p.sy), steps = Math.floor(len);
      for (let i = Math.ceil(p.R) + 2; i < steps - 1; i += 2) plot(p.sx + ((tx - p.sx) * i) / len, p.sy + ((ty - p.sy) * i) / len, LEADER_C);
    }
    putLabel(p.b.name, spot[0], spot[1], on ? LABEL_HI : LABEL_C);
    labelInfo.labelled++;
  }

  // the sun: its name sits at its centre (drawn into the canvas, so it never blocks a click), and a ring marks it while hovered
  if (sunSeen) {
    const { x, y, r } = sunSeen;
    if ((hovered === 'SUN' || focusedBody === 'SUN') && !view.id) ring(x, y, r + 4, RING_C);
    const w = textWidth('SUN');
    if (x - w / 2 >= 1 && x + w / 2 <= W - 1 && y >= 3 && y <= H - 3 && clearRect(x - w / 2, y - 2, w, 5, true)) {
      putLabel('SUN', x - w / 2, y - 2, rgb(122, 52, 0), false);
    }
  }

  // the belts: the name appears while hovered or focused, at the nearest spot to the visible specks that is clear of text
  const beltLabel = (pts, str) => {
    if (!pts.length) return;
    let mx = 0, my = 0;
    for (const q of pts) { mx += q[0]; my += q[1]; }
    mx /= pts.length; my /= pts.length;
    const w = textWidth(str), h = 5;
    let best = null, bd = Infinity;
    for (let y0 = Math.max(2, Math.floor(my) - 50); y0 < Math.min(H - h - 2, my + 50); y0 += 2) {
      for (let x0 = Math.max(2, Math.floor(mx) - 90); x0 < Math.min(W - w - 2, mx + 90); x0 += 2) {
        const d = Math.hypot(x0 + w / 2 - mx, y0 + h / 2 - my);
        if (d < bd && clearRect(x0, y0, w, h)) { bd = d; best = [x0, y0]; }
      }
    }
    if (best) putLabel(str, best[0], best[1], LABEL_HI);
  };
  if (beltOn && !sceneMoving()) beltLabel(farRocks.concat(nearRocks), 'ASTEROID BELT');
  if (kuiperOn && !sceneMoving()) beltLabel(kRocks, 'KUIPER BELT');
  lastLabels = labelRects;

  // zoom: everything but the open planet fades out, and the planet travels to (and grows into) its close-up position.
  // With reduced motion there is no travel: the overview just crossfades to the planet at its final place.
  if (tgt && zoom > 0) {
    const e = endState(), m = reduceMotion ? 1 : zoom;
    const lx = -tgt.x, ly = tgt.h * CE - tgt.z * SE, lz = -(tgt.h * SE + tgt.z * CE);      // towards the sun
    if (!view.light) { const n = Math.hypot(lx, ly, lz) || 1; view.light = [lx / n, ly / n, lz / n]; }
    // the overview (sun, orbits, belt, other planets) fades into the planet's background, which is dithered to match the pixel style
    ensureBackground(tgt, e);
    if (bgBuf) {
      const keep = 1 - zoom;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i], b = bgBuf[i], k = zoom * (1 - 0.4 * (1 - dimFull[i]));      // only a gentle dim behind text: the gradient is already dark there
        buf[i] = rgb(Math.min(255, (c & 255) * keep + (b & 255) * k), Math.min(255, ((c >> 8) & 255) * keep + ((b >> 8) & 255) * k), Math.min(255, ((c >> 16) & 255) * keep + ((b >> 16) & 255) * k));
      }
    }
    // the travelling planet; the detailed close-up (js/planet-view.js) takes over over the last quarter of the zoom
    const closeUp = clamp01((zoom - 0.75) / 0.25);
    const alpha = (reduceMotion ? zoom : 1) * (1 - closeUp);
    const tx = lerp(tgt.sx, e.x, m), ty = lerp(tgt.sy, e.y, m), tr = lerp(tgt.R, e.R, m);
    if (alpha > 0 && tgt.kind === 'sun') sunDisc(tx, ty, tr, alpha);       // the camera pans from the corner as it zooms
    else if (alpha > 0) sphere(tx, ty, tr, (TAU * t) / tgt.b.spin, tgt.b.colorAt, lx, ly, lz, lerp(brightFor(tgt.near), 1, m), alpha);
  }

  updateButtons();
  ctx.putImageData(img, 0, 0);
}

function ring(sx, sy, r, c) {
  const n = Math.max(16, Math.round(TAU * r));
  for (let i = 0; i < n; i += 2) plot(sx + Math.cos((i / n) * TAU) * r, sy - Math.sin((i / n) * TAU) * r, c);
}

/* ------------------------------------------------------------------ *
 *  Text readability mask
 * ------------------------------------------------------------------ */
// darken the pixels under every line of text on page 4 (with a feathered margin)
function measureText() {
  const cr = canvas.getBoundingClientRect();
  if (!cr.width) return;
  cssW = cr.width; cssH = cr.height;
  colRight = 0;                                    // right edge of the widest line of the bio text (set below)
  const k = new Float32Array(W * H).fill(1);
  const rects = [], bioRects = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || n.parentElement.closest('canvas, script, style')) continue;
    if (n.parentElement.closest('.planet-info')) continue;              // the callouts carry their own pixel outline: no dimming
    if (n.parentElement.closest('[hidden]') || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
    // on phones the bio is faded out while the view opens or closes (it moves under the facts once the zoom is done)
    if (stackHidden() && n.parentElement.closest('.page4-text')) continue;
    if (page.classList.contains('planet-open') && n.parentElement.closest('.page4-hint')) continue;          // faded out
    if (viewMode() === 'phone' && page.classList.contains('planet-shown') && n.parentElement.closest('.page4-pluto, .page4-sun')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      rects.push(r);
      if (n.parentElement.closest('.page4-text')) { colRight = Math.max(colRight, r.right - cr.left); bioRects.push(r); }
    }
  }
  const apply = (r, m, f) => {
    const x0 = Math.max(0, Math.floor((r.left - cr.left) / PX) - m), x1 = Math.min(W - 1, Math.ceil((r.right - cr.left) / PX) + m);
    const y0 = Math.max(0, Math.floor((r.top - cr.top) / PX) - m), y1 = Math.min(H - 1, Math.ceil((r.bottom - cr.top) / PX) + m);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (f < k[y * W + x]) k[y * W + x] = f;
  };
  for (const r of rects) apply(r, 4, Math.min(1, TEXT_DIM + 0.4));   // feathered margin
  for (const r of rects) apply(r, 1, TEXT_DIM);                       // the text itself
  // where labels must not go: the text lines plus a small margin (and the bio's own lines, for the outer planets' arcs)
  const mask = (list, m) => {
    const out = new Uint8Array(W * H);
    for (const r of list) {
      const x0 = Math.max(0, Math.floor((r.left - cr.left) / PX) - m), x1 = Math.min(W - 1, Math.ceil((r.right - cr.left) / PX) + m);
      const y0 = Math.max(0, Math.floor((r.top - cr.top) / PX) - m), y1 = Math.min(H - 1, Math.ceil((r.bottom - cr.top) / PX) + m);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[y * W + x] = 1;
    }
    return out;
  };
  const sums = (m) => {
    const out = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += m[y * W + x]; out[(y + 1) * (W + 1) + x + 1] = out[y * (W + 1) + x + 1] + row; }
    }
    return out;
  };
  textMask = mask(rects, 2);
  textSum = sums(textMask);
  if (!view.id) {                                       // the overview's bio (the outer planets' lingering arcs avoid it)
    bioSum = sums(mask(bioRects, 1));
    bioBottom = bioRects.length ? (Math.max(...bioRects.map((r) => r.bottom)) - cr.top) / PX : 0;
  }
  const idx = [];
  dimMask = new Uint8Array(W * H);
  for (let i = 0; i < k.length; i++) if (k[i] < 1) { idx.push(i); dimMask[i] = 1; }
  dimIdx = Uint32Array.from(idx);
  dimK = Float32Array.from(idx, (i) => k[i]);
  dimFull = k;
}
// does an art-pixel box overlap the bio's text?
function boxHitsBio(x, y, w, h) {
  if (bioSum.length !== (W + 1) * (H + 1)) return false;
  const S = W + 1, ax = Math.max(0, Math.floor(x)), ay = Math.max(0, Math.floor(y)), bx = Math.min(W, Math.ceil(x + w)), by = Math.min(H, Math.ceil(y + h));
  if (bx <= ax || by <= ay) return false;
  return bioSum[by * S + bx] - bioSum[ay * S + bx] - bioSum[by * S + ax] + bioSum[ay * S + ax] > 0;
}

/* ------------------------------------------------------------------ *
 *  Sizing, pointer and loop
 * ------------------------------------------------------------------ */
let clock = 0, lastTs = null;               // the orbit clock (seconds): it stops while a planet view is open
let clockOut = 0;                           // the outer scene's own clock: each scene only moves while it is on screen
let visible = false, running = false, frozen = false;
const now = () => clock;

function redraw() { if (buf && !running) draw(now()); }

function resize() {
  const box = canvas.getBoundingClientRect();           // the real (possibly fractional) size, so the buffer always covers it
  const cw = box.width, ch = box.height;
  if (!cw || !ch) return;
  PX = cw <= 700 ? 3 : 4;                              // CSS pixels per art pixel
  W = Math.max(8, Math.ceil(cw / PX));
  H = Math.max(8, Math.ceil(ch / PX));
  D = Math.hypot(W, H);
  canvas.width = W;
  canvas.height = H;
  img = ctx.createImageData(W, H);
  buf = new Uint32Array(img.data.buffer);
  measureText();                                       // first, so the outer planets' arcs can keep off the bio
  layout();
  if (view.id) { measureBio(); measureInfo(); }
  measureText();
  draw(now());
}

// ---- backgrounds: a radial gradient that starts at the side of the planet facing the sun and fades to black ----
let bgBuf = null, bgKey = '';
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ensureBackground(tgt, e) {
  const data = PLANET_DATA[view.id], bg = data && data.background;
  const L = view.light || [0.6, 0.5, 0.6];
  const key = [view.id, W, H, Math.round(e.x), Math.round(e.y), L[0].toFixed(2), L[1].toFixed(2)].join('|');
  if (key === bgKey && bg && bg.type !== 'animation') return;
  bgKey = key;
  if (!bg) { bgBuf = null; return; }
  if (bg.type === 'animation') {                       // an animated pixel background (js/backgrounds.js), drawn every frame
    if (typeof bg.render !== 'function') { bgBuf = null; return; }
    if (!bgBuf || bgBuf.length !== W * H) bgBuf = new Uint32Array(W * H);
    // a wall clock, not the orbit clock (that one stops while a view is open); one still frame with reduced motion
    const t = reduceMotion ? 20 : performance.now() / 1000;
    bg.render(bgBuf, t, W, H, { cx: e.x, cy: e.y, R: e.R, light: L });
    return;
  }
  const stops = bg.stops.map(([p, hex]) => [p, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  // centre: the sun-facing limb, or the body itself (the Sun's own glow)
  const n = Math.hypot(L[0], L[1]) || 1, onBody = bg.center === 'body';
  const gx = onBody ? e.x : e.x + (L[0] / n) * e.R * 0.85, gy = onBody ? e.y : e.y + (L[1] / n) * e.R * 0.85;
  const Rg = Math.hypot(W, H) * 0.7, BANDS = 14;
  bgBuf = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.hypot(x - gx, y - gy) / Rg);
      const dither = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5;           // ordered dither, then quantised into bands
      const q = Math.min(BANDS, Math.max(0, Math.floor(t * BANDS + 0.5 + dither * 0.9))) / BANDS;
      let i = 0;
      while (i < stops.length - 2 && q > stops[i + 1][0]) i++;
      const a = stops[i], b = stops[i + 1], f = Math.min(1, Math.max(0, (q - a[0]) / (b[0] - a[0] || 1)));
      bgBuf[y * W + x] = rgb(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
    }
  }
}

// which layout the open view uses: 'wide' (1100 px and up: callouts around the planet), 'list' (768 to 1099 px: the facts
// as a list under the planet) or 'phone' (planet, facts, then the bio, stacked)
const viewMode = () => (cssW >= 1100 ? 'wide' : cssW >= 768 ? 'list' : 'phone');
const stackHidden = () => viewMode() === 'phone' && page.classList.contains('planet-open') && !page.classList.contains('planet-shown');
const AXIS_UP = 1.5;                        // the rotation axis and its "N" reach this many radii above the centre

// the open planet's final centre and radius (art pixels). Wide: 38vmin across, centred in the right half (shrunk only if
// that half is too small for 48 px of clear space). List: about 30vmin, at the top of the right half under the name.
// Phones: about 60vw across at the top.
function endState() {
  const mode = viewMode(), gap = 48, half = cssW / 2;
  let r, x, y;
  if (mode === 'phone') { r = 0.3 * cssW; x = cssW / 2; y = gap + AXIS_UP * r; }
  else if (mode === 'list') {
    // about 30vmin, smaller if the facts underneath would not fit: name, planet with its axis (3 radii tall) and orbits
    // (moons and satellites stay within 1.6 radii in this layout), list
    const data = PLANET_DATA[view.id] || {};
    const below = (data.moons || []).length || (data.satellites || []).length || (data.members || []).length ? 1.6 : AXIS_UP;
    const room = (cssH - 2 * gap - headH - 32 - listH) / (AXIS_UP + below);
    r = Math.max(24, Math.min(0.15 * Math.min(cssW, cssH), (half - 2 * gap) / 2, room));
    x = half * 1.5; y = gap + headH + 16 + AXIS_UP * r;
  } else {
    r = Math.max(24, Math.min(0.19 * Math.min(cssW, cssH), (half - 2 * gap) / 2, (cssH - 2 * gap) / 2));
    x = half * 1.5; y = cssH / 2;
  }
  // a body whose close-up is wider than its disc (Saturn's rings, Pluto circling with Charon) is drawn smaller
  const k = (PLANET_DATA[view.id] || {}).closeupScale || 1;
  return { x: x / PX, y: y / PX, R: (r * k) / PX };
}

// the name block's and the fact list's heights (filled in by js/planet-callouts.js on planet-open)
function measureInfo() {
  const head = page.querySelector('.planet-head'), list = page.querySelector('.planet-callouts');
  if (head) headH = head.offsetHeight || headH;
  listH = list && viewMode() === 'list' ? list.offsetHeight : 0;
}

// the bio's width and type size for the open layouts: it keeps the left half, and its type shrinks a little (to 0.7 at
// most) when the narrower column would otherwise run into the caption at the bottom
function measureBio() {
  if (!bio) return;
  const keepW = bio.style.width, keepS = bio.style.getPropertyValue('--bio-scale');
  bio.style.width = ''; bio.style.removeProperty('--bio-scale');
  bioFrom = bio.getBoundingClientRect().width;
  bioTo = bioFrom; bioScale = 1;
  if (viewMode() !== 'phone') {
    const pluto = page.querySelector('.page4-pluto:not([hidden]), .page4-sun:not([hidden])');
    const avail = (pluto ? pluto.offsetTop - 16 : cssH - 48) - bio.offsetTop;
    bioTo = Math.min(bioFrom, cssW / 2 - bio.offsetLeft - 24);
    bio.style.width = bioTo + 'px';
    for (let s = 1; s >= 0.7 - 1e-9; s -= 0.05) {
      bioScale = s;
      bio.style.setProperty('--bio-scale', s.toFixed(2));
      if (bio.offsetHeight <= avail) break;
    }
  }
  bio.style.width = keepW;
  if (keepS) bio.style.setProperty('--bio-scale', keepS); else bio.style.removeProperty('--bio-scale');
  bioZoom = -1;
}

// apply the bio's in-between state for this much zoom (0 = overview, 1 = planet view); true when something changed
function syncBio(z) {
  if (!bio || z === bioZoom) return false;
  bioZoom = z;
  page.style.setProperty('--zoom', z.toFixed(4));
  if (z <= 0 || viewMode() === 'phone') { bio.style.width = ''; bio.style.removeProperty('--bio-scale'); return true; }
  bio.style.width = lerp(bioFrom, bioTo, z) + 'px';
  bio.style.setProperty('--bio-scale', lerp(1, bioScale, z).toFixed(4));
  return true;
}

function frame(ts) {
  if (!visible) { running = false; lastTs = null; return; }   // nothing to draw while page 4 is off screen
  if (frozen) { lastTs = null; requestAnimationFrame(frame); return; }   // a test is inspecting one frame
  if (lastTs !== null && !view.id) {                        // paused while a view is open
    // each part of the system moves while its camera position is in use or any of its bodies is on screen
    const dt = Math.min(0.1, (ts - lastTs) / 1000), shown = (outer) => placed.some((p) => p.inView && isOuter(p.b) === outer);
    if (scene.t < 1 || shown(false)) clock += dt;
    if (scene.t > 0 || shown(true)) clockOut += dt;
  }
  lastTs = ts;
  draw(clock);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ *
 *  Invisible buttons over the planets (mouse, touch and keyboard), and the open / close logic
 * ------------------------------------------------------------------ */
const btnBox = document.createElement('div');
btnBox.className = 'planet-buttons';
page.appendChild(btnBox);
const buttons = BODIES.map((b) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'planet-btn';
  el.setAttribute('aria-label', 'Open ' + b.name);
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openView(b.id); });
  el.addEventListener('focus', () => { focusedBody = b; redraw(); });
  el.addEventListener('blur', () => { if (focusedBody === b) { focusedBody = null; redraw(); } });
  el.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') { hovered = b; redraw(); } });
  el.addEventListener('pointerleave', () => { if (hovered === b) { hovered = null; redraw(); } });
  btnBox.appendChild(el);
  return el;
});
// the Sun and the belts get buttons too, for the keyboard: the mouse uses the hit test below (the belts are curved bands and
// most of the Sun is off screen), so these ignore the pointer and only show a focus ring
const specials = [['SUN', SUN_ID, 'Open the Sun'], ['BELT', BELT_ID, 'Open the asteroid belt'], ['KUIPER', KUIPER_ID, 'Open the Kuiper belt']].map(([tag, id, label]) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'planet-btn is-keyboard';
  el.setAttribute('aria-label', label);
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openView(id); });
  el.addEventListener('focus', () => { focusedBody = tag; redraw(); });
  el.addEventListener('blur', () => { if (focusedBody === tag) { focusedBody = null; redraw(); } });
  btnBox.appendChild(el);
  return { el, id, tag };
});
const buttonFor = (id) => { const i = BODIES.findIndex((b) => b.id === id); return i >= 0 ? buttons[i] : (specials.find((s) => s.id === id) || {}).el; };

const backLink = document.createElement('a');
backLink.className = 'planet-back';
backLink.href = '#';
backLink.textContent = '<- BACK';                  // the pixel font has no arrow glyph: the same "<-" as the pluto caption
backLink.setAttribute('aria-label', 'Back to the solar system');
backLink.hidden = true;
backLink.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); requestClose(); });
page.appendChild(backLink);

// keep every button centred on its planet (at least 44 px so it is easy to hit); hidden while a view is open, during the
// flight between the scenes, and for the scene that is not shown
function updateButtons() {
  const open = view.id !== null, still = !sceneMoving();
  btnBox.hidden = open && view.t >= 1;
  placed.forEach((p, i) => {
    const el = buttons[i];
    const show = !open && still && p.active && !p.clipped && p.sx >= 0 && p.sx <= W && p.sy >= 0 && p.sy <= H && !p.hidden;
    if (el.hidden === show) el.hidden = !show;
    if (!show) return;
    const d = Math.max(44, (2 * p.R + 12) * PX);
    el.style.width = el.style.height = d + 'px';
    el.style.transform = 'translate(' + (p.sx * PX - d / 2) + 'px,' + (p.sy * PX - d / 2) + 'px)';
  });
  // the Sun's button sits on its label; each belt's on the middle of its arc on screen
  const at = (pt) => { const [sx, sy] = project(pt[0], pt[1], pt[2]); return [sx, sy, 44]; };
  const spots = { SUN: [sunX, sunY, 48], BELT: at(defaultBeltPoint()), KUIPER: scene.t >= 1 ? at(defaultKuiperPoint()) : [0, 0, 44] };
  const shown = { SUN: scene.t <= 0, BELT: true, KUIPER: scene.t >= 1 };
  for (const sp of specials) {
    const [sx, sy, d] = spots[sp.tag];
    const x = Math.min(Math.max(sx * PX, d / 2), W * PX - d / 2), y = Math.min(Math.max(sy * PX, d / 2), H * PX - d / 2);
    sp.el.hidden = open || !still || !shown[sp.tag];
    sp.el.style.width = sp.el.style.height = d + 'px';
    sp.el.style.transform = 'translate(' + (x - d / 2) + 'px,' + (y - d / 2) + 'px)';
  }
}

// the open body's place in the overview, where the zoom starts: a planet, the Sun (mostly off screen in the corner, so
// the camera pans as well as zooms) or the spot on the belt that was clicked
const CERES = { spin: 6, colorAt: (lon, lat) => (Math.sin(4 * lon + 1) * Math.sin(5 * lat + 2) > 0.6 ? [112, 110, 106] : [152, 150, 146]) };
const ARROKOTH = { spin: 9, colorAt: (lon, lat) => (Math.sin(3 * lon) * Math.cos(2 * lat) > 0.4 ? [150, 96, 80] : [178, 120, 98]) };
function targetState() {
  if (view.id === SUN_ID) return { kind: 'sun', sx: sunX, sy: sunY, R: sunR, x: 0, h: 0, z: 0, near: 1 };
  if (view.id === BELT_ID || view.id === KUIPER_ID) {
    const kuiper = view.id === KUIPER_ID;
    const [x, h, z] = view.beltPoint || (kuiper ? defaultKuiperPoint() : defaultBeltPoint());
    const [sx, sy, zv] = project(x, h, z);
    return { kind: 'belt', sx, sy, R: Math.max(1.5, 2 / zv), x, h, z, near: 1, b: kuiper ? ARROKOTH : CERES };
  }
  return placed.find((q) => q.b.id === view.id) || null;
}

// a point on a belt's middle ring (world coordinates) under a screen point, and the middle of the ring's arc on screen
function ringPointUnder(sx, sy, r) {
  const g = groundRel(sx, sy);
  if (!g) return null;
  const a = Math.atan2(-(cam.pz + g.Z * cam.d), cam.px + g.X * cam.d);
  return [r * Math.cos(a), 0, -r * Math.sin(a)];
}
const beltPointUnder = (sx, sy) => ringPointUnder(sx, sy, beltR);
const kuiperMid = () => (kuiperR[0] + kuiperR[1]) / 2;
function defaultRingPoint(r) {
  let run = [], best = [];
  for (let d = 0; d <= 720; d++) {
    const a = ((d % 360) * Math.PI) / 180, [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a));
    if (zv > NEAR_CLIP && sx > 4 && sy > 4 && sx < W - 4 && sy < H - 4 && d < 720) run.push(a);
    else { if (run.length > best.length) best = run; run = []; }
  }
  const a = best.length ? best[Math.floor(best.length / 2)] : (3 * Math.PI) / 4;
  return [r * Math.cos(a), 0, -r * Math.sin(a)];
}
const defaultBeltPoint = () => defaultRingPoint(beltR);
const defaultKuiperPoint = () => defaultRingPoint(kuiperMid());

// the Sun's disc on its own (no halo), blended over what is there: the traveller while the camera pans to the Sun
function sunDisc(sx, sy, R, alpha) {
  for (let y = Math.max(0, Math.floor(sy - R)); y <= Math.min(H - 1, Math.ceil(sy + R)); y++) {
    for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(W - 1, Math.ceil(sx + R)); x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d > R) continue;
      const g = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5, t = d / R + g * 0.16;
      const c = t < 0.45 ? [255, 246, 150] : t < 0.8 ? [255, 218, 52] : [255, 176, 22], o = buf[y * W + x];
      buf[y * W + x] = rgb((o & 255) * (1 - alpha) + c[0] * alpha, ((o >> 8) & 255) * (1 - alpha) + c[1] * alpha, ((o >> 16) & 255) * (1 - alpha) + c[2] * alpha);
    }
  }
}

let tickTs = null, ticking = false;
function viewTick(ts) {
  const dt = tickTs === null ? 0 : ts - tickTs;
  tickTs = ts;
  view.t = Math.min(1, Math.max(0, view.t + (view.dir * dt) / VIEW_MS));
  if ((view.dir > 0 && view.t >= 1) || (view.dir < 0 && view.t <= 0)) {
    const closed = view.dir < 0;
    view.dir = 0; tickTs = null;
    if (closed) finishClose(); else if (!closing) ready();
  }
  if (!running) draw(clock);
  if (view.dir !== 0) requestAnimationFrame(viewTick); else ticking = false;
}
const startTick = () => { if (ticking) return; ticking = true; tickTs = null; requestAnimationFrame(viewTick); };

// the zoom has finished: the callouts lay themselves out around the planet and fade in (js/planet-callouts.js)
function ready() {
  if (!running) draw(clock);
  page.classList.add('planet-shown');
  canvas.dispatchEvent(new CustomEvent('planet-ready', { detail: { id: view.id } }));
}

const beltPointFor = (id, pt) => (id === BELT_ID ? pt || defaultBeltPoint() : id === KUIPER_ID ? pt || defaultKuiperPoint() : null);
function openView(id, push = true, beltPoint = null) {
  if (!openable(id) || (view.id === id && view.dir >= 0 && !closing) || (sceneMoving() && !view.id)) return;
  const home = sceneOf(id);                         // a link straight to a body in the other scene: jump there first
  if (home && home !== sceneName()) goScene(home, true);
  clearTimeout(closeTimer); closing = false;
  hovered = null; page.style.cursor = '';
  if (!view.id) measureBio();                       // the bio's closed width, before anything moves
  view.id = id; view.dir = 1; view.light = id === SUN_ID ? [0, 0, 1] : null;    // the Sun shines by itself
  view.scene = sceneName();                         // closing returns to the scene the body was opened from
  view.beltPoint = beltPointFor(id, beltPoint);
  if (push) history.pushState({ planet: id }, '', '#' + id);
  page.classList.add('planet-open');
  backLink.hidden = false;
  canvas.dispatchEvent(new CustomEvent('planet-open', { detail: { id } }));
  measureInfo();
  if (view.t >= 1) { view.dir = 0; ready(); } else startTick();
  setTimeout(() => backLink.focus({ preventScroll: true }), 50);
}

// closing from the UI goes through history, so the hash and the browser's Back button always agree
function requestClose() {
  if (!view.id) return;
  if (history.state && history.state.planet) history.back();
  else {
    const home = view.scene === 'outer' ? '#outer' : location.pathname + location.search;
    if (location.hash) history.replaceState(view.scene === 'outer' ? { scene: 'outer' } : null, '', home);
    closeView();
  }
}
// the callouts fade out together first, then the camera zooms back out
function closeView() {
  if (!view.id || view.dir < 0 || closing) return;
  closing = true;
  page.classList.remove('planet-shown');
  canvas.dispatchEvent(new CustomEvent('planet-closing', { detail: { id: view.id } }));
  closeTimer = setTimeout(() => { closing = false; view.dir = -1; startTick(); }, FADE_MS);
}
function finishClose() {
  const id = view.id;
  view.id = null;
  page.classList.remove('planet-open');
  backLink.hidden = true;
  syncBio(0);
  measureText();
  updateButtons();
  const btn = buttonFor(id);
  if (btn && !btn.hidden) btn.focus({ preventScroll: true });
  canvas.dispatchEvent(new CustomEvent('planet-close', { detail: { id } }));
  redraw();
  if (pendingScene && pendingScene !== sceneName()) goScene(pendingScene);     // history went past the body's scene
  pendingScene = null;
}

/* ------------------------------------------------------------------ *
 *  The two scenes: the fly-through, the captions and #outer
 * ------------------------------------------------------------------ */
const toPluto = page.querySelector('.page4-pluto'), toSun = page.querySelector('.page4-sun');
let sceneTs = null, sceneTicking = false, pendingScene = null, captionFocus = false;
function sceneTick(ts) {
  const dt = sceneTs === null ? 0 : ts - sceneTs;
  sceneTs = ts;
  scene.t = clamp01(scene.t + (scene.dir * dt) / SCENE_MS);
  if ((scene.dir > 0 && scene.t >= 1) || (scene.dir < 0 && scene.t <= 0)) { scene.dir = 0; sceneTs = null; sceneSettled(); }
  if (!running) draw(clock);
  if (scene.dir !== 0) requestAnimationFrame(sceneTick); else sceneTicking = false;
}
// each caption shows in its own scene, once the camera has arrived
function showCaptions() {
  const still = !sceneMoving();
  if (toPluto) toPluto.hidden = !(still && scene.t <= 0);
  if (toSun) toSun.hidden = !(still && scene.t >= 1);
}
function sceneSettled() {
  showCaptions();
  measureText();
  updateButtons();
  redraw();
  const cap = scene.t >= 1 ? toSun : toPluto;       // keyboard users keep their place: focus moves to the new caption
  if (captionFocus && cap) cap.focus({ preventScroll: true });
  captionFocus = false;
}
// fly to a scene ('inner' or 'outer'); instant jumps straight there (a link to #outer, or to a body in the other scene)
function goScene(name, instant = false) {
  const target = name === 'outer' ? 1 : 0;
  // arriving at the outer position: the outer bodies' clock jumps so all five are in view on arrival, without moving any
  // that is already on screen (see arrivalJump)
  if (target && scene.t < 1) {
    const locked = instant ? [] : placed.filter((p) => isOuter(p.b) && !p.clipped && p.sx > -p.R && p.sy > -p.R && p.sx < W + p.R && p.sy < H + p.R).map((p) => p.b.period);
    const dj = arrivalJump(clockOut, instant ? 0 : SCENE_MS / 1000, locked);
    clockOut += dj; jumpOut += dj;
  }
  if (instant) { scene.t = target; scene.dir = 0; setCam(sceneCam()); sceneSettled(); return; }
  if (scene.t === target && scene.dir === 0) return;
  captionFocus = document.activeElement === toPluto || document.activeElement === toSun;
  scene.dir = target ? 1 : -1;
  hovered = null; focusedBody = null; page.style.cursor = '';
  showCaptions();
  measureText();
  updateButtons();
  if (!sceneTicking) { sceneTicking = true; sceneTs = null; requestAnimationFrame(sceneTick); }
}
// the captions are links (#outer and back), so they work with the keyboard and can be opened in a new tab
if (toPluto) toPluto.addEventListener('click', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  if (view.id || sceneMoving()) return;
  history.pushState({ scene: 'outer' }, '', '#outer');
  goScene('outer');
});
if (toSun) toSun.addEventListener('click', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  if (view.id || sceneMoving()) return;
  if (history.state && history.state.scene === 'outer') history.back();       // the way we came: Back and this agree
  else { history.replaceState(null, '', location.pathname + location.search); goScene('inner'); }
});

window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && view.id) requestClose(); });
window.addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if (openable(id)) {
    if (view.id === id) return;
    if (view.id) {                                     // straight from one body to another (history): swap in place
      clearTimeout(closeTimer); closing = false;
      const home = sceneOf(id);
      if (home && home !== sceneName()) goScene(home, true);
      view.id = id; view.light = id === SUN_ID ? [0, 0, 1] : null;
      view.scene = sceneName();
      view.beltPoint = beltPointFor(id, null);
      canvas.dispatchEvent(new CustomEvent('planet-open', { detail: { id } }));
      if (view.t >= 1) { view.dir = 0; ready(); } else { view.dir = 1; startTick(); }
      redraw();
    } else openView(id, false);
  } else if (id === 'outer' || id === '') {          // a scene: close any open body first, then fly if needed
    const want = id === 'outer' ? 'outer' : 'inner';
    if (view.id) { pendingScene = want; closeView(); } else goScene(want);
  } else closeView();                                // another page's anchor (#hobbies): leave the scene as it is
});

// what is under the pointer: a planet (a BODIES entry), 'SUN', 'BELT', or null
function targetAt(ev) {
  if (view.id || sceneMoving()) return null;
  const r = canvas.getBoundingClientRect();
  if (!r.width) return null;
  const x = ((ev.clientX - r.left) / r.width) * W, y = ((ev.clientY - r.top) / r.height) * H;
  let best = null, bd = Infinity;
  for (const p of placed) {                                  // planets first: they are the smallest targets
    if (p.hidden || !p.active || p.clipped) continue;
    const d = Math.hypot(p.sx - x, p.sy - y);
    if (d <= Math.max(p.R + 3, 5) && d < bd) { best = p.b; bd = d; }
  }
  if (best) return best;
  if (scene.t <= 0 && Math.hypot(x - sunX, y - sunY) <= sunR) return 'SUN';     // the bright disc, its label included
  // the belt: anywhere in its band on screen (the pointer's position on the orbital plane lies within the band's distance
  // from the sun), except where page text sits on top of it: the text wins
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi >= 0 && yi >= 0 && xi < W && yi < H && textMask[yi * W + xi]) return null;
  const rho = radiusThrough(x, y, cam.f);
  if (Math.abs(rho - beltR) <= beltR * (BELT_WIDTH + 0.02)) return 'BELT';
  if (scene.t >= 1 && rho >= kuiperR[0] * 0.98 && rho <= kuiperR[1] * 1.02) return 'KUIPER';
  return null;
}
// links, buttons and form controls always take the click (and the hover) before anything drawn behind them
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

// read-only hooks for tests and future click features
canvas.planetPositions = () => placed.map((p) => ({
  name: p.b.name, x: p.sx * PX, y: p.sy * PX, r: p.R * PX, depth: p.zv, hidden: p.hidden, inView: p.inView,
}));
canvas.solarVisible = (i, t, m0) => planetState(i, angleAt(i, t, m0 === undefined ? startRad[i] : m0)).visible;
canvas.solarVisibleAngle = (i, phi) => planetState(i, phi).visible;
canvas.solarState = (i, t) => { const p = planetState(i, angleAt(i, t, startRad[i])); return [p.sx, p.sy, p.R, p.hidden ? 1 : 0, p.zv]; };
canvas.solarRenderAt = (t) => { if (scene.t >= 1) draw(clock, t); else draw(t); };   // (t is the clock of the scene shown)
// visibility of planet i at time t, seen from its own scene's camera (used by the timeline search)
canvas.solarSceneVisible = (i, t, m0) => {
  const keep = cam;
  setCam(camFor(BODIES[i]));
  const p = planetState(i, angleAt(i, t, m0 === undefined ? startRad[i] : m0));
  setCam(keep);
  return p.visible;
};
canvas.solarScene = () => ({ t: scene.t, dir: scene.dir, name: sceneName(), moving: sceneMoving(), camOut, kuiperR, clockOut,
  sun: { x: sunX * PX, y: sunY * PX, r: sunR * PX } });
canvas.solarGo = (name, instant) => goScene(name, instant);
// draw one frame part-way through the flight (0 inner .. 1 outer) without starting it (for tests); returns to rest after
canvas.solarSlideFrame = (t) => { const keep = scene.t; scene.t = t; draw(clock); scene.t = keep; setCam(sceneCam()); };
canvas.solarFreeze = (on) => { frozen = !!on; };          // stop the live loop drawing over a frame a test is looking at
canvas.solarOrbitProblems = () => orbitProblems.slice();
// the geometry of one moment of the switch (t = 0 inner .. 1 outer), in css px: each orbit's on-screen polyline (points in
// front of the camera, NaN-separated where it leaves the screen or goes behind), the sun, and every planet's position
canvas.solarSwitchGeometry = (t) => {
  const keep = cam;
  setCam(camAt(easeInOut(t)));
  const orbits = BODIES.map((b, i) => {
    const pts = [], n = 2400;
    for (let k = 0; k <= n; k++) {
      const [x, h, z] = orbitPoint(i, (k / n) * TAU), [sx, sy, zv] = project(x, h, z);
      if (zv < NEAR_CLIP || sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) pts.push(NaN, NaN); else pts.push(sx * PX, sy * PX);
    }
    return { name: b.name, pts };
  });
  const bodies = BODIES.map((b, i) => { const p = planetState(i, angleAt(i, isOuter(b) ? clockOut : clock, startRad[i])); return { name: b.name, x: p.sx * PX, y: p.sy * PX, r: p.R * PX, clipped: p.clipped }; });
  const sunG = { x: sunX * PX, y: sunY * PX, r: sunR * PX, inFront: sunZv > NEAR_CLIP };
  setCam(keep);
  return { orbits, bodies, sun: sunG, W: W * PX, H: H * PX };
};
canvas.solarSunSkips = () => sunSkips;       // draw one frame at time t (used with reduced motion, to inspect moments)
// the camera numbers for a viewport of w x h css px, without touching what is drawn (used by the timeline search)
canvas.solarGeometryFor = (w, h) => {
  const keep = [W, H, D];
  W = Math.ceil(w / (w <= 700 ? 3 : 4)); H = Math.ceil(h / (w <= 700 ? 3 : 4)); D = Math.hypot(W, H);
  layout();
  const g = { W, H, D, cx, cy, F, orbitR: orbitR.slice(), rSun, r0: BODIES.map(planetR0), dwell: dwell.slice(), incl: BODIES.map((b) => b.incl || 0) };
  [W, H, D] = keep;
  layout();
  return g;
};
// where the clickable things are, in css px relative to the canvas (for tests and future click features)
canvas.solarTargets = () => {
  const belt = [];
  for (let d = 91; d < 180; d += 3) {
    const a = (d * Math.PI) / 180, [sx, sy] = project(beltR * Math.cos(a), 0, -beltR * Math.sin(a));
    if (sx > 1 && sy > 1 && sx < W - 1 && sy < H - 1) belt.push({ x: sx * PX, y: sy * PX });
  }
  return { sun: { x: cx * PX, y: cy * PX, r: rSun * PX }, belt, label: labelInfo };
};
canvas.solarView = () => ({ id: view.id, t: view.t, dir: view.dir, zoom: easeInOut(view.t), clock, endState: endState(), colRight, cssW, cssH, PX, light: view.light, reduceMotion, mode: viewMode(), closing });
// the overview's hover labels this frame, in css px (for tests)
canvas.solarLabels = () => lastLabels.map(([x, y, w, h, name]) => ({ name, x: (x - 1) * PX, y: (y - 1) * PX, w: (w + 2) * PX, h: (h + 2) * PX }));
canvas.solarHover = (id) => { hovered = id === SUN_ID ? 'SUN' : id === BELT_ID ? 'BELT' : id === KUIPER_ID ? 'KUIPER' : BODIES.find((b) => b.id === id) || null; redraw(); };
// what a click at this point would hit, ignoring the page's own elements (for tests): a planet id, 'sun', 'asteroid-belt' or null
canvas.solarHitAt = (clientX, clientY) => { const h = targetAt({ clientX, clientY }); return h === 'SUN' ? SUN_ID : h === 'BELT' ? BELT_ID : h === 'KUIPER' ? KUIPER_ID : h ? h.id : null; };
canvas.solarBandAt = (clientX, clientY) => {        // is this point inside the belt's band at all (text or not)? (for tests)
  const r = canvas.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * W, y = ((clientY - r.top) / r.height) * H;
  return Math.abs(radiusThrough(x, y, cam.f) - beltR) <= beltR * (BELT_WIDTH + 0.02);
};
canvas.solarBeltPoint = () => { const [x, h, z] = view.beltPoint || defaultBeltPoint(), [sx, sy] = project(x, h, z); return { x: sx * PX, y: sy * PX }; };
canvas.solarOpen = (id) => openView(id);
canvas.solarClose = () => requestClose();
canvas.planetButtons = () => buttons.map((el, i) => ({ id: BODIES[i].id, hidden: el.hidden, rect: el.getBoundingClientRect().toJSON() }))
  .concat(specials.map((s) => ({ id: s.id, hidden: s.el.hidden, rect: s.el.getBoundingClientRect().toJSON() })));
canvas.planetData = (id) => PLANET_DATA[id] || null;      // read-only access to the planet table (used by the detail view)
canvas.solarSizes = () => sizeReport;
canvas.solarSunSeen = () => (sunSeen ? { x: sunSeen.x * PX, y: sunSeen.y * PX, r: sunSeen.r * PX } : null);   // the sun as drawn last frame (css px)
canvas.solarArrivals = () => arrivals.slice();
canvas.solarInfo = () => ({ W, H, D, F, cx, cy, orbitR, beltR, rSun, kuiperR, kuiperSpan, camOut, dwell, mercuryLowest: mercuryLowest(), ids: BODIES.map((b) => b.id),
  periods: BODIES.map((b) => b.period), start: BODIES.map((b) => b.start), lull: BODIES.map((b) => b.lull), r0: BODIES.map(planetR0) });

page.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'touch') return;
  const hit = ev.target.closest(INTERACTIVE) ? null : targetAt(ev);
  if (hit !== hovered) {
    hovered = hit;
    page.style.cursor = hit ? 'pointer' : '';
    redraw();
  }
});
page.addEventListener('pointerleave', () => { if (hovered) { hovered = null; page.style.cursor = ''; redraw(); } });
page.addEventListener('click', (ev) => {
  if (view.id) {                                       // empty space closes; the text, the back link and the body itself do not
    const e = endState(), box = canvas.getBoundingClientRect();
    const onPlanet = Math.hypot(ev.clientX - box.left - e.x * PX, ev.clientY - box.top - e.y * PX) <= e.R * PX;
    if (!onPlanet && !ev.target.closest('.page4-text, .planet-info')) requestClose();
    return;
  }
  if (ev.target.closest(INTERACTIVE)) return;          // a link (or any control) over the canvas keeps its click
  const hit = targetAt(ev);
  canvas.dispatchEvent(new CustomEvent('solar-click', { detail: { name: nameOf(hit) } }));   // hook for what comes next
  if (hit && hit.id) openView(hit.id);                 // a planet, the Sun or the belt opens its view
  else if (hit === 'SUN') openView(SUN_ID);
  else if (hit === 'BELT' || hit === 'KUIPER') {
    const r = canvas.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * W, sy = ((ev.clientY - r.top) / r.height) * H;
    if (hit === 'BELT') openView(BELT_ID, true, beltPointUnder(sx, sy));
    else openView(KUIPER_ID, true, ringPointUnder(sx, sy, kuiperMid()));
  }
});

resize();
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
else window.addEventListener('resize', resize);
// the hover labels must stay off the text, so the text mask is re-measured whenever the text can move: web fonts arriving
// (they change line widths), the page finishing loading, and the bio changing size outside the planet view
const remeasure = () => { if (!view.id) { measureText(); redraw(); } };
if (document.fonts) {
  if (document.fonts.ready) document.fonts.ready.then(remeasure);
  document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', remeasure);
}
window.addEventListener('load', remeasure);
canvas.addEventListener('text-moved', () => { measureText(); redraw(); });     // the phone layout scrolls the bio under the facts
if (window.ResizeObserver && bio) new ResizeObserver(remeasure).observe(bio);

// a link like /#mars opens that planet (after a normal zoom, or the short crossfade with reduced motion). It waits until
// every script has run: the close-up (js/planet-view.js) and its callouts load after this file and listen for planet-open.
function openFromHash() {
  const id = location.hash.slice(1);
  if (id === 'outer') {
    page.scrollIntoView({ behavior: 'instant' });
    goScene('outer', true);
  } else if (openable(id)) {
    page.scrollIntoView({ behavior: 'instant' });
    openView(id, false);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openFromHash, { once: true });
else setTimeout(openFromHash, 0);

if (!reduceMotion) {
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
  }).observe(canvas);
}
})();
