// Pixel-art inner solar system behind page 4, modelled in 3D and seen from a tilted camera.
// The orbits lie in a flat plane with the sun at its centre; the camera looks down at it from about 27 degrees
// above that plane with mild perspective, so the circular orbits become flattened ellipses. Everything is drawn
// with plain 2D-canvas maths into a small buffer that CSS scales up with `image-rendering: pixelated` (the same
// technique as the earth-moon animation on page 1, js/gravity.js). Tweak the constants and BODIES to change it.
(() => {
const canvas = document.querySelector('.solar-canvas');
if (!canvas) return;
// the canvas is the shared background of the hackerfab screen and page 4 ("more about me"): it lives in .space, behind both
const space = canvas.closest('.space') || canvas.parentElement;
const page = document.querySelector('.page4') || space;
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
const SCRIM_DIM = 0.45, SCRIM_FEATHER = 5;   // the hackerfab text's soft scrim: its darkest, and how far it fades out (vmin)

// ONE solar system: one sun, one plane, one list of orbits. The "outer scene" is only a second camera position: the same
// camera (same height, tilt and lens, no zoom) moved along the plane towards the screen's top-left until the asteroid belt
// reaches the bottom-right corner. Each outer orbit is solved to cross the screen diagonal, seen from there, at the given
// fraction of the way from the bottom-right corner to the top-left one, so they are evenly spaced at any aspect ratio.
const OUT_BELT = 0.06;             // from the outer camera, the asteroid belt just cuts the bottom-right corner
const KUIPER_BAND = [1.04, 1.35];  // the Kuiper belt: a ring from just outside Pluto's orbit to about 1.3x that (x Pluto's radius)
const KUIPER_DENSITY = 1.5;        // the Kuiper band looks this much denser on screen than the asteroid belt (it is the bigger belt)
const KUIPER_SEEN = [700, 900];    // ... within these many bodies on the screen that shows the most of it (outer view)
const SCENE_MS = reduceMotion ? 250 : 1400;   // the camera's move between the two positions (a crossfade with reduced motion)
const STAR_COUNT = 150, STAR_PARALLAX = 0.3;  // dim background stars; they slide at 30% of the scenery's speed

// every body's on-screen diameter, in vmin, in both scenes (planets keep this size wherever they are on their orbits).
// The Sun keeps its own rule (SUN_R of the diagonal: about 45 vmin at 1440x900) and must stay the biggest thing on screen;
// checkSizes() warns if the Sun is under 4x Jupiter, a giant under 2x Earth, or Pluto not the smallest.
const SIZES = { mercury: 2.2, venus: 3.5, earth: 3.5, mars: 2.6, jupiter: 10, saturn: 9, saturnRings: 20, uranus: 7, neptune: 7, pluto: 1.8 };

// orbit = radius relative to Mars (Mercury's is computed from the sun's size instead); incl = orbital-plane tilt; speed =
// how fast the planet moves across the screen while any of it is on screen, in css px/s (inner planets faster); the size
// comes from SIZES; start = where on its orbit it starts, in degrees. Motion is driven by the screen, not by a fixed
// timeline: a planet on screen moves at its speed; one that is wholly hidden jumps straight to just before the point where
// it would come back into view, waits a few seconds and then comes out (see stepPlanets)
const BODIES = [
  { id: 'mercury', name: 'MERCURY', orbit: 0, incl: MERCURY_INCLINATION, speed: 19.5, start: 258, spin: 25,
    colorAt: (lon, lat) => (Math.sin(5 * lon + 1) * Math.sin(6 * lat + 2) > 0.7 ? [206, 112, 40] : [240, 144, 54]), moons: [] },
  { id: 'venus', name: 'VENUS', orbit: 0.47, speed: 18, start: 178.9, spin: 40,
    colorAt: (lon, lat) => (Math.sin(3 * lat + lon) + 0.5 * Math.sin(7 * lat) > 0.2 ? [176, 90, 52] : [148, 68, 40]), moons: [] },
  { id: 'earth', name: 'EARTH', orbit: 0.66, speed: 16.5, start: 16.3, spin: 7,
    colorAt: (lon, lat) => {
      const v = Math.sin(2 * lon + 1.3) * Math.cos(3 * lat) + 0.6 * Math.sin(3 * lon - 2 * lat) + 0.3 * Math.sin(5 * lon + 2 * lat + 1);
      return v > 0.5 ? [62, 174, 74] : [32, 96, 214];
    },
    moons: [{ ra: 2.5, period: 4, phase: 1.0, r: 2.2, color: [244, 244, 248] }] },
  { id: 'mars', name: 'MARS', orbit: 1, speed: 15, start: 343.4, spin: 9,
    colorAt: (lon, lat) => (Math.sin(2 * lon + 1) * Math.cos(3 * lat) > 0.35 ? [150, 44, 36] : [212, 66, 50]),
    moons: [
      { ra: 2.3, period: 2.2, phase: 0.3, r: 1, color: [150, 150, 156] },   // Phobos
      { ra: 3.5, period: 5.5, phase: 2.5, r: 1, color: [176, 176, 182] },   // Deimos
    ] },
  // the outer scene. diag = where the orbit crosses the screen diagonal seen from the outer camera position
  { id: 'jupiter', name: 'JUPITER', scene: 'outer', diag: 0.2, speed: 13.5, start: 46, spin: 6,
    colorAt: (lon, lat) => { const v = Math.sin(lat * 9 + 0.6) + 0.35 * Math.sin(lat * 23); return v > 0.7 ? [234, 216, 182] : v > -0.3 ? [200, 154, 104] : [170, 100, 64]; },
    moons: [
      { ra: 1.6, period: 6, phase: 0.4, r: 1.2, color: [236, 214, 120] },     // Io
      { ra: 2.1, period: 9, phase: 2.2, r: 1.2, color: [222, 210, 190] },     // Europa
      { ra: 2.7, period: 15, phase: 4.1, r: 1.6, color: [176, 164, 150] },    // Ganymede
      { ra: 3.4, period: 26, phase: 5.3, r: 1.5, color: [130, 120, 110] },    // Callisto
    ] },
  { id: 'saturn', name: 'SATURN', scene: 'outer', diag: 0.34, speed: 12, start: 20, spin: 7,
    colorAt: (lon, lat) => (Math.sin(lat * 8) + 0.3 * Math.sin(lat * 19) > 0.2 ? [226, 200, 142] : [196, 166, 110]), rings: 26.7,
    moons: [
      { ra: 2.7, period: 14, phase: 1.1, r: 1.1, color: [196, 196, 200] },    // Rhea (beyond the rings)
      { ra: 3.5, period: 24, phase: 3.9, r: 1.6, color: [226, 176, 92] },     // Titan
    ] },
  { id: 'uranus', name: 'URANUS', scene: 'outer', diag: 0.48, speed: 11, start: 45, spin: 10,
    colorAt: (lon, lat) => (Math.sin(lat * 5 + 1) > 0.85 ? [170, 226, 230] : [148, 212, 222]),
    moons: [                                                                   // in Uranus's equator plane: on their side
      { ra: 2.2, period: 12, phase: 0.6, r: 1.2, color: [200, 196, 196], incl: 97.8 },    // Titania
      { ra: 2.8, period: 18, phase: 3.4, r: 1.2, color: [180, 172, 168], incl: 97.8 },    // Oberon
    ] },
  { id: 'neptune', name: 'NEPTUNE', scene: 'outer', diag: 0.62, speed: 10, start: 147, spin: 9,
    colorAt: (lon, lat) => (Math.sin(3 * lon + 4 * lat) * Math.cos(2 * lat) > 0.75 ? [222, 232, 250] : Math.sin(lat * 6) > 0.4 ? [44, 76, 196] : [58, 98, 220]),
    moons: [{ ra: 2.3, period: 11, phase: 2.0, r: 1.4, color: [214, 206, 200], incl: 157 }] },    // Triton: backwards
  // Pluto and Charon circle a shared point between them (bary: Charon's share of the distance is 1 - bary), so Pluto wobbles
  { id: 'pluto', name: 'PLUTO', scene: 'outer', diag: 0.76, speed: 9, start: 155, spin: 30,
    colorAt: (lon, lat) => (Math.sin(2 * lon + 0.5) * Math.cos(2 * lat) > 0.3 ? [238, 226, 206] : [176, 154, 132]),
    moons: [{ ra: 4.4, period: 16, phase: 0, r: 1.1, color: [176, 170, 166], bary: 0.3 }] },
];
const isOuter = (b) => b.scene === 'outer';

/* ------------------------------------------------------------------ *
 *  Buffer + drawing helpers
 * ------------------------------------------------------------------ */
// The world is laid out in one window-shaped frame, anchored to the bottom of the about section: W x H art pixels (the sun,
// the orbits, both cameras and the close-ups are solved in it). The canvas runs on past it: TOP rows above (hackerfab and
// the top of about) and BOT rows below (projects), where the same world simply continues, so frame row y is buffer row
// y + TOP, and rows -TOP .. H + BOT - 1 are all drawn. Drawing is limited each frame to the rows on screen, YMIN..YMAX.
let W = 1, H = 1, D = 1, PX = 4, TOP = 0, BOT = 0, BH = 1;
let YMIN = 0, YMAX = 1;
let img, buf;
let dimIdx = new Uint32Array(0), dimK = new Float32Array(0);   // pixels to darken behind the text, and by how much
let dimFull = new Float32Array(0);                          // per-pixel brightness left behind the text (1 = untouched)
let dimMask = new Uint8Array(0);                              // the dimmed zone around the text (includes a soft margin)
let bioBottom = 0;                                          // the bio's lowest text line (art px)
let textMask = new Uint8Array(0);
let textSum = new Int32Array(0);                              // prefix sums of textMask (the text lines plus a small margin, where labels must not go): is a rectangle free of text? in O(1)

const rgb = (r, g, b) => (0xff << 24) | (b << 16) | (g << 8) | r;
const scale = ([r, g, b], k) => rgb(Math.min(255, Math.round(r * k)), Math.min(255, Math.round(g * k)), Math.min(255, Math.round(b * k)));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function plot(x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= -TOP && y < H + BOT) buf[(y + TOP) * W + x] = c;
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
        if (xi >= 0 && xi < W && yi >= -TOP && yi < H + BOT) {
          const o = buf[(yi + TOP) * W + xi];
          buf[(yi + TOP) * W + xi] = rgb((o & 255) * (1 - alpha) + (col & 255) * alpha, ((o >> 8) & 255) * (1 - alpha) + ((col >> 8) & 255) * alpha, ((o >> 16) & 255) * (1 - alpha) + ((col >> 16) & 255) * alpha);
        }
      }
    }
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const HALO_COLORS = [[74, 36, 0], [140, 74, 4], [206, 120, 8], [250, 176, 20]];

function sun(sx, sy, R) {
  const Rh = R * HALO;
  const x0 = Math.max(0, Math.floor(sx - Rh)), y0 = Math.max(-TOP, Math.floor(sy - Rh));
  const x1 = Math.min(W - 1, Math.ceil(sx + Rh)), y1 = Math.min(H + BOT - 1, Math.ceil(sy + Rh));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d >= Rh) continue;
      const g = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5;
      if (d <= R) {                                       // the disc: flat bands with dithered granulation
        const t = d / R + g * 0.16;
        buf[(y + TOP) * W + x] = t < 0.45 ? rgb(255, 246, 150) : t < 0.8 ? rgb(255, 218, 52) : rgb(255, 176, 22);
      } else {                                            // stepped halo, ordered-dithered so its edges stay blocky
        const v = Math.pow(1 - (d - R) / (Rh - R), 1.6) * 4;
        const base = Math.floor(v);
        const idx = base + (v - base > g + 0.5 ? 1 : 0);
        if (idx > 0) buf[(y + TOP) * W + x] = rgb(...HALO_COLORS[Math.min(3, idx - 1)]);
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
  // the planets' diagonal runs to the top-left corner; on a tall screen, where the about text spans the whole top of the
  // frame, it stops just under the text instead so no orbit spends its time behind it (when the text sits lower down, as on
  // phones where the frame reaches up into hackerfab, the orbits simply run behind its dimmed lines). The Kuiper belt keeps
  // the real corner.
  const top = W < H && bioBottom > 0 && bioBottom < 0.5 * H ? Math.min(0.6 * H, bioBottom + 3 * vminPx()) : 0;
  const radiusAt = (f, toTop) => {
    // a spot above the horizon (a very tall screen) slides back down the diagonal until it reaches the ground
    let g = null;
    for (let k = f; !g && k > 0; k -= 0.01) g = groundRel(W * (1 - k), H - k * (H - toTop), F);
    return Math.hypot(camOut.px + g.X, camOut.pz + g.Z);
  };
  BODIES.forEach((b, i) => { if (isOuter(b)) orbitR[i] = radiusAt(b.diag, top); });
  const rPluto = orbitR[BODIES.findIndex((b) => b.id === 'pluto')];
  kuiperR = KUIPER_BAND.map((f) => f * rPluto);
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
  cy = H * SUN_POS[1];                      // (the orbits' near sides run on below the frame, into projects)
  solveCamera();
  solveOuter();
  assertOrbits();
  starAnchor = groundRel(W / 2, H / 2, F) || { X: 0, Z: 0 };   // the world point under the screen centre (inner camera)
  // the Kuiper ring as the outer camera sees it: its nearest and farthest depth on the canvas (for its specks' brightness),
  // and where the named ones go: spots on the band that are clear of the text, spread along it
  setCam(camOut);
  {
    let zn = Infinity, zf = 0;
    const textAt = (x, y, w, h) => {
      const S = W + 1, ax = Math.max(0, Math.floor(x)), ay = Math.max(0, Math.floor(y) + TOP), bx = Math.min(W, Math.ceil(x + w)), by = Math.min(BH, Math.ceil(y + h) + TOP);
      return bx > ax && by > ay && textSum.length === S * (BH + 1) && textSum[by * S + bx] - textSum[ay * S + bx] - textSum[by * S + ax] + textSum[ay * S + ax] > 0;
    };
    // [a, f, x, y] spots on the band on the canvas: clear of text and seen from both cameras, clear (the inner camera does not
    // see it), or behind text
    const both = [], clear = [], under = [];
    for (let f = 0.25; f <= 0.75; f += 0.1) {
      const r = kuiperR[0] + (kuiperR[1] - kuiperR[0]) * f;
      for (let d = 0; d < 1440; d++) {
        const a = (d / 1440) * TAU, [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a));
        if (zv <= NEAR_CLIP || sx < 0 || sx > W || sy < -TOP || sy > H + BOT) continue;
        zn = Math.min(zn, zv); zf = Math.max(zf, zv);
        if (!(sx > 24 && sx < W - 24 && sy > -TOP + 12 && sy < H + BOT - 12 && !behindWafer(sx, sy))) continue;
        // the ring shows in both views: a spot is clear only if the inner camera also sees it clear of the text (or not at all)
        setCam(CAM_IN);
        const [ix, iy, iz] = project(r * Math.cos(a), 0, -r * Math.sin(a));
        setCam(camOut);
        const inSeen = iz > NEAR_CLIP && ix > -4 && ix < W + 4 && iy > -TOP - 4 && iy < H + BOT + 4;
        const inOk = !inSeen || (ix > 24 && ix < W - 24 && iy > -TOP + 12 && iy < H + BOT - 12 && !behindWafer(ix, iy) && !textAt(ix - 22, iy - 10, 44, 14));
        (!inOk || textAt(sx - 22, sy - 10, 44, 14) ? under : inSeen ? both : clear).push([a, f, sx, sy]);
      }
    }
    kuiperZv = zn < zf ? [zn, zf] : [1, 2];
    for (const list of [both, clear, under]) list.sort((p, q) => p[2] - q[2]);      // left to right, then spread the three along it
    const taken = [];
    KUIPER_NAMED.forEach((m, k) => {
      // a clear spot if there is one left (spread along the clear stretch), otherwise one behind the text (its name then
      // finds the nearest clear spot and a leader joins them)
      for (const list of [both, clear, under]) {
        const want = Math.floor(((k + 0.5) / KUIPER_NAMED.length) * list.length);
        for (let d = 0; d < list.length; d++) {
          for (const j of [want + d, want - d]) {
            const c = list[j];
            if (!c || taken.some((q) => Math.hypot(q[2] - c[2], q[3] - c[3]) < Math.min(26, 0.14 * W))) continue;
            m.a = c[0]; m.f = c[1]; taken.push(c); d = list.length; break;
          }
        }
        if (taken.length > k) break;
      }
    });
  }
  buildKuiper();
  setCam(sceneCam());
  checkSizes();
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
 *  Planet state (a pure function of the planet's angle on its orbit, shared by drawing, hit-testing and isOnScreen)
 * ------------------------------------------------------------------ */
// the facts and detail-view settings for each planet live in js/planets.js, keyed by id
const PLANET_DATA = Object.fromEntries((window.BODY_DATA || []).map((p) => [p.id, p]));
// besides the planets, the Sun and the two belts open a close-up view too
const SUN_ID = 'sun', BELT_ID = 'asteroid-belt', KUIPER_ID = 'kuiper-belt';
const openable = (id) => BODIES.some((b) => b.id === id) || id === SUN_ID || id === BELT_ID || id === KUIPER_ID;
// which scene a body lives in (the two belts are in both: null)
const sceneOf = (id) => { const b = BODIES.find((q) => q.id === id); return b ? (isOuter(b) ? 'outer' : 'inner') : id === SUN_ID ? 'inner' : null; };
const vminPx = () => Math.min(W, H) / 100;                  // one vmin, in art pixels
const planetR0 = (b) => Math.max(1, (SIZES[b.id] * vminPx()) / 2);    // art-pixel radius, from SIZES (the same everywhere)

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
  return { i, b, x, h, z, sx, sy, zv, R, near, hidden, clipped, active: true };
}

/* ------------------------------------------------------------------ *
 *  Motion, driven by what is on screen
 * ------------------------------------------------------------------ */
// each planet: its angle on its orbit, and what it is doing: 'moving' (on screen, at its speed), 'waiting' (wholly hidden
// just before the point where it comes back into view, until `wait`), 'emerging' (moving at its speed towards that point)
// or 'parked' (no part of its orbit is on screen from here; looked at again every second). simT is the running time the
// waits are measured on.
const motion = BODIES.map((b) => ({ phi: (b.start * Math.PI) / 180, state: 'moving', wait: 0, since: 0, on: false, aimedAt: 0 }));
let simT = 0, labelOff = [];                 // labelOff[i]: planet i's name as drawn last frame, relative to it (art px)
let seedM = 7;
const randM = () => (seedM = (seedM * 1664525 + 1013904223) >>> 0) / 4294967296;
const REENTER_WAIT = [3, 6];                 // seconds a hidden planet waits before coming back out
const EMPTY_WAIT = 0.8;                      // ... or at most this long when no planet at all is on screen

// how far round a planet its moons (or Saturn's rings) reach, in art px
function bodyReach(i, R) {
  const b = BODIES[i];
  let reach = b.rings ? (SIZES.saturnRings / SIZES.saturn) * R : R;
  for (const m of b.moons) reach = Math.max(reach, R * m.ra + 2 + m.r);
  return reach;
}
// planet i at angle phi as a box in css viewport px: its disc, its moons' reach and (when it is drawn) its name. The canvas
// is low-resolution and scaled up, so art pixels become css pixels by scaling, plus the canvas's offset in the page, minus
// the scroll. All from cached sizes and the scroll position: no layout reads.
function bodyBox(i, phi = motion[i].phi, withLabel = true) {
  const p = planetState(i, phi), reach = bodyReach(i, p.R);
  const qx = lay.w / W, qy = lay.h / BH, ox = lay.left - window.scrollX, oy = lay.top - window.scrollY;
  const lo = (withLabel && labelOff[i]) || [0, 0, 0, 0];
  const x0 = Math.min(p.sx - reach, p.sx + lo[0]), x1 = Math.max(p.sx + reach, p.sx + lo[0] + lo[2]);
  const y0 = Math.min(p.sy - reach, p.sy + lo[1]), y1 = Math.max(p.sy + reach, p.sy + lo[1] + lo[3]);
  return { p, left: x0 * qx + ox, right: x1 * qx + ox, top: (y0 + TOP) * qy + oy, bottom: (y1 + TOP) * qy + oy };
}
// is any part of planet i (its disc, moons and name) inside the browser window, and not wholly hidden behind the wafer or
// the sun's disc? (Without its name: whether the body itself shows, which decides if it gets a name at all.)
function isOnScreen(i, phi = motion[i].phi, withLabel = true) {
  const bx = bodyBox(i, phi, withLabel), p = bx.p;
  if (p.clipped || bx.right < 0 || bx.left > window.innerWidth || bx.bottom < 0 || bx.top > window.innerHeight) return false;
  if (p.zv > sunZv && Math.hypot(p.sx - sunX, p.sy - sunY) + p.R < sunR) return false;          // wholly behind the sun
  let covered = behindWafer(p.sx, p.sy);                                                     // wholly behind the wafer
  for (let k = 0; covered && k < 8; k++) covered = behindWafer(p.sx + p.R * Math.cos((k * TAU) / 8), p.sy + p.R * Math.sin((k * TAU) / 8));
  return !covered;
}
// the angle that moves planet i about `px` css px along its orbit on screen from angle phi (perspective included)
function angleFor(i, phi, px) {
  const a = planetState(i, phi), b = planetState(i, phi + 1e-3);
  const perRad = Math.hypot((b.sx - a.sx) * (lay.w / W), (b.sy - a.sy) * (lay.h / BH)) / 1e-3;
  return Math.min(0.05, px / Math.max(perRad, 1e-6));
}
// the next point ahead on planet i's orbit where it comes into view: the last angle before it does (still hidden), or null
// when no part of its orbit is on screen. A half-degree scan, then a bisection down to the edge.
function entryAhead(i, phi) {
  const step = TAU / 720;
  for (let k = 1; k <= 720; k++) {
    if (!isOnScreen(i, phi + k * step, false)) continue;
    let lo = phi + (k - 1) * step, hi = phi + k * step;
    for (let j = 0; j < 14; j++) { const mid = (lo + hi) / 2; if (isOnScreen(i, mid, false)) hi = mid; else lo = mid; }
    return lo;
  }
  return null;
}
const reenterWait = () => REENTER_WAIT[0] + (REENTER_WAIT[1] - REENTER_WAIT[0]) * randM();
// one step of the motion rules (the camera at rest, no close-up open):
//  - a planet that is even partly on screen always moves at its own speed: nothing visible is ever sped up
//  - one that has gone wholly out of view jumps at once (unseen) to just before its next entry point, waits REENTER_WAIT,
//    then moves out at its speed, from behind the wafer or a screen edge, wherever its orbit comes back into view
//  - when no planet is on screen at all, the one due soonest comes out within EMPTY_WAIT
function stepPlanets(dt) {
  simT += dt;
  let anyOn = false;
  BODIES.forEach((b, i) => { motion[i].on = isOnScreen(i); if (motion[i].on) anyOn = true; });
  BODIES.forEach((b, i) => {
    const m = motion[i];
    // a planet on its way back in, aimed at the screen as it was: if the page has scrolled since, aim again (unseen)
    if ((m.state === 'waiting' || m.state === 'emerging') && !m.on && Math.abs(window.scrollY - m.aimedAt) > 1) {
      const e = entryAhead(i, m.phi);
      if (e === null) { m.state = 'parked'; m.wait = simT + 1; return; }
      m.phi = e; m.aimedAt = window.scrollY;
      if (m.state === 'emerging') m.since = simT;
    }
    if (m.state === 'parked') {
      if (m.on) m.state = 'moving';
      else {
        if (simT < m.wait) return;
        const e = entryAhead(i, m.phi);
        if (e === null) { m.wait = simT + 1; return; }
        m.phi = e; m.state = 'waiting'; m.wait = simT + reenterWait(); m.aimedAt = window.scrollY; labelOff[i] = null;
        return;
      }
    }
    if (m.state === 'waiting') {
      if (m.on) m.state = 'moving';                          // in view (the screen moved under it): never stand still
      else if (simT < m.wait) return;
      else { m.state = 'emerging'; m.since = simT; }
    }
    if (m.state === 'emerging' && m.on) m.state = 'moving';
    if (m.state === 'moving' && !m.on) {                     // just went wholly out of view: jump ahead (unseen) and wait
      const e = entryAhead(i, m.phi);
      if (e === null) { m.state = 'parked'; m.wait = simT + 1; return; }
      m.phi = e; m.state = 'waiting'; m.wait = simT + reenterWait(); m.aimedAt = window.scrollY; labelOff[i] = null;   // (its old name spot no longer applies)
      return;
    }
    if (m.state === 'emerging' && simT - m.since > 3) { m.state = 'moving'; return; }   // the view changed under it: look again
    m.phi += angleFor(i, m.phi, b.speed * dt);
  });
  if (!anyOn) {                                              // nothing on screen: bring the next one out within a second
    let next = null;
    for (const m of motion) if (m.state === 'waiting' && (!next || m.wait < next.wait)) next = m;
    if (next && next.wait > simT + EMPTY_WAIT) next.wait = simT + EMPTY_WAIT;
  }
}
// reduced motion: nothing moves, so a planet that is hidden is placed in the middle of the longest stretch of its orbit
// where its whole disc is in the window and clear of the wafer and the sun (failing that, where any of it is on screen)
function placeStill() {
  const step = TAU / 720;
  const whole = (i, phi) => {
    const bx = bodyBox(i, phi, false), p = bx.p, qx = lay.w / W, r = p.R * qx, x = (bx.left + bx.right) / 2, y = (bx.top + bx.bottom) / 2;
    return !p.clipped && !p.hidden && x - r >= 0 && x + r <= window.innerWidth && y - r >= 0 && y + r <= window.innerHeight && !behindWafer(p.sx, p.sy) && isOnScreen(i, phi, false);
  };
  BODIES.forEach((b, i) => {
    if (isOnScreen(i, motion[i].phi, false) && whole(i, motion[i].phi)) return;
    let best = null, run = null;
    for (let k = 0; k <= 720; k++) {
      const ok = k < 720 && whole(i, k * step);
      if (ok && !run) run = [k, k];
      else if (ok) run[1] = k;
      else if (run) { if (!best || run[1] - run[0] > best[1] - best[0]) best = run; run = null; }
    }
    if (best) { motion[i].phi = ((best[0] + best[1]) / 2) * step; return; }
    if (isOnScreen(i)) return;
    const e = entryAhead(i, motion[i].phi);
    if (e !== null) motion[i].phi = e + step;
  });
}

// ?debug in the address: a box round every planet as isOnScreen sees it (green on screen, red hidden), with its state
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugCanvas = null;
function drawDebug() {
  if (!debugCanvas) {
    debugCanvas = document.createElement('canvas');
    debugCanvas.setAttribute('aria-hidden', 'true');
    debugCanvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647';
    document.body.appendChild(debugCanvas);
  }
  const dpr = window.devicePixelRatio || 1, w = window.innerWidth, h = window.innerHeight;
  if (debugCanvas.width !== Math.round(w * dpr) || debugCanvas.height !== Math.round(h * dpr)) { debugCanvas.width = Math.round(w * dpr); debugCanvas.height = Math.round(h * dpr); }
  const g = debugCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = '11px monospace';
  BODIES.forEach((b, i) => {
    const bx = bodyBox(i), on = isOnScreen(i), m = motion[i];
    g.strokeStyle = g.fillStyle = on ? '#2bff6a' : '#ff3b3b';
    g.lineWidth = 2;
    g.strokeRect(bx.left, bx.top, bx.right - bx.left, bx.bottom - bx.top);
    const st = m.state === 'waiting' ? 'waiting ' + Math.max(0, m.wait - simT).toFixed(1) + 's' : m.state;
    const tx = Math.min(Math.max(bx.left, 4), w - 150), ty = Math.min(Math.max(bx.top - 4, 12), h - 4);
    g.fillText(b.name + ' ' + st, tx, ty);
  });
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
// the Kuiper belt: a real ring of icy bodies round the same sun, on the same plane, each slowly orbiting it (slower
// further out, as Kepler has it). Across the band they thin out softly towards both edges, so it has no hard edge
// anywhere. Only the stretch of the ring that can ever be on the canvas (kuiperArc, from either camera position or on the
// way between them, plus a margin) is filled, at a density set by how the asteroid belt looks (buildKuiper); a body that
// drifts out of one end of that stretch comes back in at the other, off screen
let seedK = 29;
const randK = () => (seedK = (seedK * 1664525 + 1013904223) >>> 0) / 4294967296;
const ICE = [[150, 178, 214], [190, 210, 236], [232, 238, 250]];        // pale blue to white
let kuiperRocks = [], kuiperArc = [0, TAU];
let kuiperStats = null;                         // how the count was chosen (for tests)
const kuiperRock = (lo, span) => {
  const f = (randK() + randK() + randK()) / 3;  // where across the band (0 inner edge, 1 outer edge): densest in the middle
  return {
    a0: lo + randK() * span,
    f,
    w: (TAU / (6000 + randK() * 1500)) * Math.pow((KUIPER_BAND[0] + (KUIPER_BAND[1] - KUIPER_BAND[0]) * f) / KUIPER_BAND[0], -1.5),
    hk: (randK() + randK() + randK() - 1.5) * 0.03,     // height above or below the plane, relative to the radius
    edge: Math.min(1, Math.min(f, 1 - f) / 0.15),       // dimmer near the band's edges
    shade: ICE[Math.floor(randK() * 3)],
  };
};
// where a body is at time t: its angle wraps round within the arc
const kuiperAngle = (s, t) => { const span = kuiperArc[1] - kuiperArc[0]; return kuiperArc[0] + ((((s.a0 + s.w * t - kuiperArc[0]) % span) + span) % span); };

// fill the arc: first find it, then measure how dense the asteroid belt looks (specks per pixel of its band, from the
// inner camera) and how dense a trial Kuiper fill looks (from the outer camera), and scale the fill to KUIPER_DENSITY x the
// belt, kept within KUIPER_SEEN bodies on the screen that shows the most of it
function buildKuiper() {
  const keep = cam, onCanvas = (sx, sy, zv) => zv > NEAR_CLIP && sx > -8 && sx < W + 8 && sy > -TOP - 8 && sy < H + BOT + 8;
  const rs = [kuiperR[0], (kuiperR[0] + kuiperR[1]) / 2, kuiperR[1]], on = [];
  for (let d = 0; d < 2880; d++) {
    const a = (d / 2880) * TAU;
    let seen = false;
    for (let e = 0; e <= 1 && !seen; e += 0.1) {
      setCam(camAt(e));
      for (const r of rs) { const [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a)); if (onCanvas(sx, sy, zv)) { seen = true; break; } }
    }
    if (seen) on.push(a);
  }
  // the angles seen form one run (possibly across 0): its ends, plus a margin so bodies wrap round off screen
  let lo = 0, hi = TAU;
  if (on.length && on.length < 2880) {
    let gap = 0, at = 0;
    for (let k = 0; k < on.length; k++) { const nx = k + 1 < on.length ? on[k + 1] : on[0] + TAU; if (nx - on[k] > gap) { gap = nx - on[k]; at = k; } }
    lo = on[(at + 1) % on.length] - 0.04; hi = on[at] + 0.04; if (hi <= lo) hi += TAU;
  }
  kuiperArc = [lo, Math.min(hi, lo + TAU)];
  const span = kuiperArc[1] - kuiperArc[0];
  // the asteroid belt's look: specks on the canvas per pixel of its band, from the inner camera
  setCam(CAM_IN);
  let beltIn = 0, beltArea = 0;
  for (const a of asteroids) {
    const r = beltR * a.rk, [sx, sy, zv] = project(r * Math.cos(a.a0), r * a.hk, -r * Math.sin(a.a0));
    if (zv > NEAR_CLIP && sx >= 0 && sx < W && sy >= 0 && sy < H && Math.hypot(sx - sunX, sy - sunY) > sunR) beltIn++;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x - sunX, y - sunY) <= sunR) continue;
    if (Math.abs(radiusThrough(x + 0.5, y + 0.5, F, CAM_IN) - beltR) <= beltR * BELT_WIDTH) beltArea++;
  }
  // a trial fill, seen from the outer camera: how dense it looks, and how many land on each section's screen
  setCam(camOut);
  const trialN = Math.max(200, Math.round(span * 800));
  seedK = 29;
  const trial = Array.from({ length: trialN }, () => kuiperRock(kuiperArc[0], span));
  let kIn = 0, kTop = 0, kPage = 0, kArea = 0;
  for (const s of trial) {
    const r = kuiperR[0] + (kuiperR[1] - kuiperR[0]) * s.f, [sx, sy, zv] = project(r * Math.cos(s.a0), r * s.hk, -r * Math.sin(s.a0));
    if (!(zv > NEAR_CLIP && sx >= 0 && sx < W && sy >= -TOP && sy < H + BOT)) continue;
    kIn++;
    if (sy >= -H && sy < 0) kTop++; else if (sy >= 0 && sy < H) kPage++;   // the window just above the frame, and the frame
  }
  for (let y = -TOP; y < H + BOT; y++) for (let x = 0; x < W; x++) {
    const rho = radiusThrough(x + 0.5, y + 0.5, F, camOut);
    if (rho >= kuiperR[0] && rho <= kuiperR[1]) kArea++;
  }
  const beltDensity = beltArea ? beltIn / beltArea : 0, trialDensity = kArea ? kIn / kArea : 0;
  let scaleBy = trialDensity > 0 ? (KUIPER_DENSITY * beltDensity) / trialDensity : 1;
  const best = Math.max(kTop, kPage) * scaleBy;                      // bodies on the screen that shows most of the band
  const wantSeen = best;
  if (best > 0 && best < KUIPER_SEEN[0]) scaleBy *= KUIPER_SEEN[0] / best;
  else if (best > KUIPER_SEEN[1]) scaleBy *= KUIPER_SEEN[1] / best;
  const n = Math.max(0, Math.min(40000, Math.round(trialN * scaleBy)));
  seedK = 29;
  kuiperRocks = Array.from({ length: n }, () => kuiperRock(kuiperArc[0], span));
  kuiperStats = { arc: kuiperArc.slice(), count: n, beltDensity, densityTarget: KUIPER_DENSITY * beltDensity, seenAtTarget: Math.round(wantSeen), seenTop: Math.round(kTop * (n / trialN)), seenPage: Math.round(kPage * (n / trialN)) };
  setCam(keep);
}
// the named ones in the overview: slightly larger bodies inside the band, always labelled
const KUIPER_NAMED = [
  { name: 'HAUMEA', a: 0, f: 0.55, color: [236, 240, 248], shape: 'long' },
  { name: 'MAKEMAKE', a: 0, f: 0.3, color: [226, 196, 170], shape: 'dot' },
  { name: 'ARROKOTH', a: 0, f: 0.7, color: [196, 120, 96], shape: 'pair' },
];   // (layout() parks each on a stretch of the band that is clear of the page text, so its name has room)
let kuiperZv = [1, 2];                          // the ring's nearest and farthest depth on the canvas (outer camera)

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
// the close-up is a full-window layer over the page (position: fixed): its own pixel canvas for the zoom and the body's
// background, then the detailed close-up (js/planet-view.js) and the facts (js/planet-callouts.js) on top. The page under
// it keeps its place and does not scroll while it is open.
const layer = document.createElement('div');
layer.className = 'planet-layer';
layer.hidden = true;
const lcv = document.createElement('canvas');
lcv.className = 'planet-layer-canvas';
lcv.setAttribute('aria-hidden', 'true');
layer.appendChild(lcv);
document.body.appendChild(layer);
const lctx = lcv.getContext('2d');
let LH = 1, limg = null, lbuf = null, pbuf = null;   // the layer's rows, its image, and the travelling body drawn on its own
const winW = () => document.documentElement.clientWidth, winH = () => window.innerHeight;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
let cssW = 1, cssH = 1, colRight = 0, frameCss = 0;       // canvas size and the right edge of the text column, in css px
let labelInfo = { visible: 0, labelled: 0, missed: [] };   // per frame: planets in view vs planets that got a name
let lastLabels = [];                        // the labels drawn in the latest frame: [x, y, w, h, text] in art pixels
let lastKuiper = { kRocks: [], kNamed: [] };  // the Kuiper bodies drawn in the latest frame (for tests)
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
let discs = [];                              // the planets (and Charon) as drawn this frame: [x, y, r]; no name may sit on one
function scenery(t, tOut) {
  const far = [], near = [];
  const sunOn = sunZv > NEAR_CLIP, sr2 = (sunR + 0.5) * (sunR + 0.5);
  const onSun = (sx, sy) => sunOn && (sx - sunX) * (sx - sunX) + (sy - sunY) * (sy - sunY) < sr2;
  sunSkips = 0;                // depth-sorted bodies, drawn around the sun
  discs = [];

  // orbit lines: one dotted ellipse per planet, far half before the sun, near half after it
  const farLines = [], nearLines = [];
  BODIES.forEach((b, i) => {
    const r = orbitR[i];
    // the outer orbits are sampled for how big they look from their camera's distance
    const n = isOuter(b) ? Math.min(8000, Math.max(48, Math.ceil((TAU * r * cam.f * 1.5) / cam.d))) : Math.max(48, Math.ceil(TAU * r * F * 1.5));
    for (let k = 0; k < n; k++) {
      const [x, h, z, z0] = orbitPoint(i, (k / n) * TAU);
      const [sx, sy, zv] = project(x, h, z);
      if (zv < NEAR_CLIP || sx < -1 || sy < YMIN - 1 || sx > W || sy > YMAX) continue;
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
  const farRocks = [], nearRocks = [], tb = t + tOut;
  for (const s of asteroids) {
    const a = s.a0 + s.w * tb, r = beltR * s.rk;
    const x = r * Math.cos(a), z = -r * Math.sin(a), h = r * s.hk;
    const [sx, sy, zv] = project(x, h, z);
    if (zv < NEAR_CLIP || sx < -2 || sy < YMIN - 2 || sx > W || sy > YMAX || onSun(sx, sy)) continue;
    (z < 0 ? farRocks : nearRocks).push([sx, sy, s, 0.5 + 0.5 * clamp01(0.5 + z / (2 * r))]);
  }
  const plotRocks = (arr, on) => {
    for (const [sx, sy, s, k] of arr) {
      const c = scale(s.shade, on ? k * 1.3 : k);
      plot(sx, sy, c);
      if (s.dash) plot(sx + 1, sy, c);
    }
  };

  // the Kuiper belt: the ring seen by the same camera as the orbits; nearer bodies are bigger and brighter
  const kuiperOn = (hovered === 'KUIPER' || focusedBody === 'KUIPER') && !view.id;
  const kRocks = [], kNamed = [];
  {
    const zn = kuiperZv[0], zf = kuiperZv[1], tk = t + tOut;      // in both scenes, like the asteroid belt
    const at = (a, f, hk) => {
      const r = kuiperR[0] + (kuiperR[1] - kuiperR[0]) * f;
      return project(r * Math.cos(a), r * hk, -r * Math.sin(a));
    };
    for (const s of kuiperRocks) {
      const [sx, sy, zv] = at(kuiperAngle(s, tk), s.f, s.hk);
      if (zv < NEAR_CLIP || sx < -2 || sy < YMIN - 2 || sx > W || sy > YMAX || onSun(sx, sy)) continue;
      kRocks.push([sx, sy, s, clamp01((zf - zv) / (zf - zn || 1))]);
    }
    for (const m of KUIPER_NAMED) {
      const [sx, sy, zv] = at(m.a, m.f, 0);
      if (zv >= NEAR_CLIP && sx > -4 && sy > YMIN - 4 && sx < W + 4 && sy < YMAX + 4) kNamed.push({ m, sx, sy, R: 2 });
    }
  }
  const plotIce = (on) => {
    for (const [sx, sy, s, nr] of kRocks) {               // nr: 0 farthest, 1 nearest
      const c = scale(s.shade, (0.3 + 0.7 * nr) * (0.35 + 0.65 * s.edge) * (on ? 1.25 : 1));
      plot(sx, sy, c);
      if (nr > 0.6) { plot(sx + 1, sy, c); plot(sx, sy + 1, c); plot(sx + 1, sy + 1, c); }     // near ones: 2 px
    }
    for (const k of kNamed) {
      const c = scale(k.m.color, on ? 1.15 : 1), d = scale(k.m.color, 0.75), x = Math.round(k.sx), y = Math.round(k.sy);
      if (k.m.shape === 'long') { for (let i = -2; i <= 1; i++) { plot(x + i, y, c); if (i > -2 && i < 1) plot(x + i, y + 1, d); } }   // Haumea: elongated
      else if (k.m.shape === 'pair') { plot(x, y, c); plot(x, y + 1, c); plot(x + 1, y + 1, d); plot(x + 2, y + 1, d); plot(x + 2, y + 2, d); }   // Arrokoth: two lobes
      else { plot(x, y, c); plot(x + 1, y, c); plot(x, y + 1, c); plot(x + 1, y + 1, c); }
    }
  };

  // planets and their moons become depth-sorted bodies
  BODIES.forEach((b, i) => {
    const p = planetState(i, motion[i].phi);
    placed[i] = p;
    const m = Math.max(16, p.R * 2.5);
    if (p.clipped || p.sx < -m || p.sy < YMIN - m || p.sx > W + m || p.sy > YMAX + m) return;
    const tp = isOuter(b) ? tOut : t;                         // the body's own spin and its moons
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
    // Pluto is drawn off its orbit point (it circles the shared point with Charon): its name and hit test follow the body
    p.sx = bx; p.sy = by;
    discs.push([bx, by, p.R]);
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
      if (view.id === b.id && view.t > 0) break;             // (the open planet's moons go with it, onto the close-up layer)
      const r = k.m.bary ? p.R / 2 : k.m.r;                  // Charon: half Pluto's size
      if (k.m.bary) discs.push([k.sx, k.sy, r / k.zv]);
      const mb = { zv: k.zv, draw: () => speck(k.sx, k.sy, r / k.zv, scale(k.m.color, brightFor(k.near))) };
      (isOuter(b) || k.zv > sunZv ? far : near).push(mb);
    }
  });

  // painter's order: far side first, then the sun, then the near side
  plotLines(farLines, ORBIT_BASE);
  plotIce(kuiperOn);
  plotRocks(farRocks, beltOn);
  far.sort((a, b) => b.zv - a.zv).forEach((o) => o.draw());
  if (sunOn) { sun(sunX, sunY, sunR); if (sunX + sunR > 0 && sunY + sunR > YMIN && sunX - sunR < W && sunY - sunR < YMAX) sunSeen = { x: sunX, y: sunY, r: sunR }; }
  plotLines(nearLines, ORBIT_BASE);
  plotRocks(nearRocks, beltOn);
  near.sort((a, b) => b.zv - a.zv).forEach((o) => o.draw());
  return { farRocks, nearRocks, kRocks, kNamed, beltOn, kuiperOn };
}

// a body that is not drawn this frame (its scene is off screen)
const idle = (i) => ({ i, b: BODIES[i], sx: -1e4, sy: -1e4, R: 0, zv: 1, active: false, hidden: true, clipped: true });

// the stars slide at STAR_PARALLAX of the scenery's speed: 30% of how far the ground under the screen centre has moved
// on screen since the inner position, wrapping round the screen
let starAnchor = { X: 0, Z: 0 };
function stars() {
  const [ax, ay] = project(starAnchor.X, 0, starAnchor.Z);
  const ox = (ax - W / 2) * STAR_PARALLAX, oy = (ay - H / 2) * STAR_PARALLAX;
  for (const s of STARS) {                 // one field over both screens, the same density everywhere
    const x = Math.round((((s.x * W + ox) % W) + W) % W), y = Math.round((((s.y * BH + oy) % BH) + BH) % BH);
    if (x >= 0 && x < W && y >= 0 && y < BH && buf[y * W + x] === (0xff000000 | 0)) buf[y * W + x] = s.c;
  }
}

function draw(t, tOut = clockOut) {
  placed = BODIES.map((b, i) => idle(i));
  sunSeen = null;
  let sc;
  // the rows on screen (from the cached canvas position and the scroll offset: no layout read), plus half a screen each
  // way so a fast scroll never uncovers rows from an older frame. A one-off redraw (no loop running) draws everything.
  const vt = window.scrollY - lay.top, qy = lay.h / BH, pad = Math.ceil((0.5 * window.innerHeight) / qy);
  let r0 = Math.max(0, Math.min(BH, Math.floor(vt / qy) - pad)), r1 = Math.max(r0, Math.min(BH, Math.ceil((vt + window.innerHeight) / qy) + pad));
  if (!running) { r0 = 0; r1 = BH; }
  YMIN = r0 - TOP; YMAX = r1 - TOP;
  buf.fill(0xff000000, r0 * W, r1 * W);
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
  lastKuiper = { kRocks, kNamed };
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
    if (x0 - 2 < 0 || y0 - 1 < -TOP || x0 + w + 2 > W || y0 + h + 1 > H + BOT) return false;      // inside the screen, never cut off
    if (behindWafer(x0 + w / 2, y0 + h / 2)) return false;
    if (!onSunOk && sunSeen) {                             // names keep off the sun's disc (only its own name sits on it)
      const nx = Math.max(x0 - 1, Math.min(sunSeen.x, x0 + w + 1)), ny = Math.max(y0 - 1, Math.min(sunSeen.y, y0 + h + 1));
      if (Math.hypot(nx - sunSeen.x, ny - sunSeen.y) < sunSeen.r + 1) return false;
    }
    const S = W + 1, ax = x0 - 1, ay = y0 - 1 + TOP, bx = x0 + w + 1, by = y0 + h + 1 + TOP;       // rectangle [ax, bx) x [ay, by), buffer rows
    if (textSum[by * S + bx] - textSum[ay * S + bx] - textSum[by * S + ax] + textSum[ay * S + ax] > 0) return false;
    if (waferSum.length && waferSum[by * S + bx] - waferSum[ay * S + bx] - waferSum[by * S + ax] + waferSum[ay * S + ax] > 0) return false;   // nor under the wafer
    for (const r of labelRects) if (x0 - 1 < r[0] + r[2] && x0 + w + 1 > r[0] && y0 - 1 < r[1] + r[3] && y0 + h + 1 > r[1]) return false;
    for (const [dx, dy, dr] of discs) {                     // names sit beside a body, never on one
      const nx = Math.max(x0 - 1, Math.min(dx, x0 + w + 1)), ny = Math.max(y0 - 1, Math.min(dy, y0 + h + 1));
      if ((nx - dx) * (nx - dx) + (ny - dy) * (ny - dy) < (dr + 0.5) * (dr + 0.5)) return false;
    }
    return true;
  };
  const putLabel = (str, x0, y0, color, backing = true) => {
    x0 = Math.round(x0); y0 = Math.round(y0);
    const w = textWidth(str), h = 5;
    if (backing) for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) plot(x, y, 0xff000000);
    drawText(str, x0, y0, color);
    labelRects.push([x0, y0, w, h, str]);
  };
  // a leader line from a body to a name placed away from it must not cross any text or the sun's disc either
  const leaderClear = (p, x0, y0, w, h) => {
    const tx = Math.max(x0, Math.min(p.sx, x0 + w)), ty = Math.max(y0, Math.min(p.sy, y0 + h));
    const len = Math.hypot(tx - p.sx, ty - p.sy);
    let out = false;                                        // (a body over text or the sun: the leader may start inside it)
    for (let i = Math.ceil(p.R) + 2; i < len - 1; i += 1) {
      const x = Math.round(p.sx + ((tx - p.sx) * i) / len), y = Math.round(p.sy + ((ty - p.sy) * i) / len) + TOP;
      const onText = (x >= 0 && x < W && y >= 0 && y < BH && textMask[y * W + x] === 1) || (sunSeen !== null && Math.hypot(x - sunSeen.x, y - TOP - sunSeen.y) < sunSeen.r + 1);
      if (onText && out) return false;
      if (!onText) out = true;
    }
    return true;
  };
  const LABEL_C = rgb(206, 206, 216), LABEL_HI = rgb(255, 255, 255), LEADER_C = rgb(120, 124, 140);

  labelInfo = { visible: 0, labelled: 0, moved: 0, missed: [] };
  labelOff = [];
  // (a planet behind the wafer has no name: the wafer covers it)
  const named = placed.filter((p) => p.b.id !== view.id && p.active && !p.clipped && p.sx >= 0 && p.sx <= W && p.sy >= YMIN && p.sy <= YMAX && !p.hidden && !behindWafer(p.sx, p.sy) && (!running || isOnScreen(p.i, undefined, false)))
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
      [p.sx - w / 2, p.sy - g - h], [p.sx - w / 2, p.sy - g - h - 4], [p.sx - w / 2, p.sy - g - h - 8],
      // at a screen edge: still above, slid inwards while it stays over the body, then over on the body's other side
      [Math.min(Math.max(p.sx - w / 2, 2), W - w - 2), p.sy - g - h], p.sx - w / 2 < 2 ? [p.sx + g * 0.7, p.sy - g * 0.7 - h] : [p.sx - g * 0.7 - w, p.sy - g * 0.7 - h],
      [p.sx - w / 2, p.sy + g], [p.sx + g, p.sy - 2], [p.sx - g - w, p.sy - 2],
      [p.sx + g * 0.7, p.sy - g * 0.7 - h], [p.sx - g * 0.7 - w, p.sy - g * 0.7 - h], [p.sx + g * 0.7, p.sy + g * 0.7], [p.sx - g * 0.7 - w, p.sy + g * 0.7],
    ];
    spot = near.find(([x0, y0]) => clearRect(x0, y0, w, h)) || null;
    for (let dist = g + 5; !spot && dist <= g + 90; dist += 5) {
      for (const deg of RING_ANGLES) {
        const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
        const x0 = p.sx + c * (dist + (w / 2) * Math.abs(c)) - w / 2, y0 = p.sy + sn * (dist + (h / 2) * Math.abs(sn)) - h / 2;
        if (clearRect(x0, y0, w, h) && leaderClear(p, x0, y0, w, h)) { spot = [x0, y0]; far = true; break; }
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
      for (let i = Math.ceil(p.R) + 2; i < steps - 1; i += 2) {
        const lx = p.sx + ((tx - p.sx) * i) / len, ly = p.sy + ((ty - p.sy) * i) / len;
        if (sunSeen && Math.hypot(lx - sunSeen.x, ly - sunSeen.y) < sunSeen.r + 0.5) continue;     // like the orbit lines, never on the sun
        plot(lx, ly, LEADER_C);
      }
    }
    putLabel(p.b.name, spot[0], spot[1], on ? LABEL_HI : LABEL_C);
    if (p.i !== undefined) labelOff[p.i] = [Math.round(spot[0]) - p.sx, Math.round(spot[1]) - p.sy, textWidth(p.b.name), 5];
    labelInfo.labelled++;
  }

  // the sun: its name sits at its centre (drawn into the canvas, so it never blocks a click), and a ring marks it while hovered
  if (sunSeen) {
    const { x, y, r } = sunSeen;
    if ((hovered === 'SUN' || focusedBody === 'SUN') && !view.id) ring(x, y, r + 4, RING_C);
    const w = textWidth('SUN');
    if (x - w / 2 >= 1 && x + w / 2 <= W - 1 && y >= -TOP + 3 && y <= H + BOT - 3 && clearRect(x - w / 2, y - 2, w, 5, true)) {
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
    for (let y0 = Math.max(-TOP + 2, Math.floor(my) - 50); y0 < Math.min(H + BOT - h - 2, my + 50); y0 += 2) {
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

  // zoom: on the layer over the page, the body's background fades in over everything while the body travels from where it
  // is on the page to (and grows into) its close-up position. With reduced motion there is no travel: it crossfades in.
  if (tgt && zoom > 0) drawZoom(t, tgt, zoom);
  else if (!layer.hidden && lbuf) lctx.clearRect(0, 0, lcv.width, lcv.height);

  updateButtons();
  if (r1 > r0) ctx.putImageData(img, 0, 0, 0, r0, W, r1 - r0);       // upload just the rows on screen
  if (DEBUG) drawDebug();
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
  cssW = cr.width; cssH = frameCss || cssH;        // the frame's height (the canvas itself runs on above and below it)
  colRight = 0;                                    // right edge of the widest line of the bio text (set below)
  const qx = cr.width / W, qy = cr.height / BH;    // css px per art pixel; rows below are buffer rows (page-4 row + TOP)
  const k = new Float32Array(W * BH).fill(1);
  const rects = [], bioRects = [], solid = [];     // text lines; the bio's lines; non-text things labels keep off
  const blocks = new Map();                        // the hackerfab screen's text, per block (one soft scrim each, no boxes)
  const walk = (root, perBlock = false) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || n.parentElement.closest('canvas, script, style')) continue;
      if (n.parentElement.closest('.planet-info')) continue;              // the callouts carry their own pixel outline: no dimming
      if (n.parentElement.closest('[hidden]') || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const blk = perBlock && (n.parentElement.closest('.hf-headline, .hf-brand-text a, .brand-note, .hf-body p, .hobbies-note') || n.parentElement);
      for (const r of range.getClientRects()) {
        rects.push(r);
        if (blk) { if (!blocks.has(blk)) blocks.set(blk, []); blocks.get(blk).push(r); continue; }
        if (n.parentElement.closest('.page4-text')) { colRight = Math.max(colRight, r.right - cr.left); bioRects.push(r); }
      }
    }
  };
  walk(page);
  walk(space.querySelector('.projects'));          // the project rows: dark boxes behind their lines, like the bio
  // the hackerfab section's text sits over this canvas too: the headline, the sentence under it, "our website", "check it
  // out!" and the SiO2 note each get one soft scrim (below), so planets passing behind dim gently instead of being cut off
  // by boxes; the logo and the hand-drawn arrows only keep the planet names off them
  const tail = space.querySelector('.hackerfab');
  walk(tail, true);
  if (tail) for (const el of tail.querySelectorAll('img, .brand-arrow path, .hobbies-note-arrow path')) { const r = el.getBoundingClientRect(); if (r.width || r.height) solid.push(r); }
  const box = (r, m) => [Math.max(0, Math.floor((r.left - cr.left) / qx) - m), Math.min(W - 1, Math.ceil((r.right - cr.left) / qx) + m),
    Math.max(0, Math.floor((r.top - cr.top) / qy) - m), Math.min(BH - 1, Math.ceil((r.bottom - cr.top) / qy) + m)];
  const apply = (r, m, f) => {
    const [x0, x1, y0, y1] = box(r, m);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (f < k[y * W + x]) k[y * W + x] = f;
  };
  const tailRects = new Set([...blocks.values()].flat());
  for (const r of rects) if (!tailRects.has(r)) apply(r, 4, Math.min(1, TEXT_DIM + 0.4));   // feathered margin
  for (const r of rects) if (!tailRects.has(r)) apply(r, 1, TEXT_DIM);                       // the text itself
  // the scrims: darkest (SCRIM_DIM) over the block's lines, easing to untouched over SCRIM_FEATHER vmin beyond its edge
  const fe = Math.max(2, (SCRIM_FEATHER * Math.min(cssW, cssH)) / 100 / qx);
  for (const list of blocks.values()) {
    const u = { left: Math.min(...list.map((r) => r.left)), right: Math.max(...list.map((r) => r.right)), top: Math.min(...list.map((r) => r.top)), bottom: Math.max(...list.map((r) => r.bottom)) };
    const [x0, x1, y0, y1] = box(u, 0), m = Math.ceil(fe);
    for (let y = Math.max(0, y0 - m); y <= Math.min(BH - 1, y1 + m); y++) {
      for (let x = Math.max(0, x0 - m); x <= Math.min(W - 1, x1 + m); x++) {
        const d = Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, y0 - y, y - y1)) / fe;    // 0 inside, 1 at the feather's end
        const f = SCRIM_DIM + (1 - SCRIM_DIM) * (d >= 1 ? 1 : d * d * (3 - 2 * d));
        if (f < k[y * W + x]) k[y * W + x] = f;
      }
    }
  }
  // where labels must not go: the text lines plus a small margin (and the bio's own lines, for the outer planets' arcs)
  const mask = (list, m, rows) => {
    const out = new Uint8Array(W * rows), off = rows === H ? TOP : 0;     // the bio's mask is in page-4 rows
    for (const r of list) {
      const [x0, x1, y0, y1] = box(r, m);
      for (let y = Math.max(0, y0 - off); y <= Math.min(rows - 1, y1 - off); y++) for (let x = x0; x <= x1; x++) out[y * W + x] = 1;
    }
    return out;
  };
  const sums = (m, rows) => {
    const out = new Int32Array((W + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += m[y * W + x]; out[(y + 1) * (W + 1) + x + 1] = out[y * (W + 1) + x + 1] + row; }
    }
    return out;
  };
  textMask = mask(rects.concat(solid), 2, BH);
  textSum = sums(textMask, BH);
  if (!view.id) {                                       // the overview's bio (the outer orbits on phones keep under it)
    bioBottom = bioRects.length ? (Math.max(...bioRects.map((r) => r.bottom)) - cr.top) / qy - TOP : 0;
  }
  const idx = [];
  dimMask = new Uint8Array(W * BH);
  for (let i = 0; i < k.length; i++) if (k[i] < 1) { idx.push(i); dimMask[i] = 1; }
  dimIdx = Uint32Array.from(idx);
  dimK = Float32Array.from(idx, (i) => k[i]);
  dimFull = k;
}

// where things are in the document, measured on resize only: the animation loop and the pointer handlers never read layout
const lay = { left: 0, top: 0, w: 1, h: 1, inSpace: 0, page: 0 };   // the canvas (document px, size, offset in .space), page 4's top
const docPos = (el) => { let x = 0, y = 0; for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return [x, y]; };
function cacheOffsets() {
  [lay.left, lay.top] = docPos(canvas);
  lay.w = canvas.clientWidth; lay.h = canvas.clientHeight;
  lay.inSpace = canvas.offsetTop;
  lay.page = lay.top + Math.round(TOP * (lay.h / BH));   // the frame's top: where the page sits when the frame fills the window
}
// a client point to page-4 art coordinates (y < 0 is up in the hackerfab screen)
const toArt = (clientX, clientY) => [((clientX - (lay.left - window.scrollX)) / lay.w) * W, ((clientY - (lay.top - window.scrollY)) / lay.h) * BH - TOP];

// the silicon wafer (in the screen above) covers part of this canvas: its outline, filled into a mask in buffer rows.
// A planet behind it is not named, not hoverable and not clickable (it is still drawn: the wafer simply covers it)
let waferMask = new Uint8Array(0), waferSum = new Int32Array(0);   // ... and its running sums (names keep out from under it)
function buildWaferMask() {
  const wc = document.querySelector('.wafer-canvas');
  waferMask = new Uint8Array(W * BH);
  waferSum = new Int32Array(0);
  if (!wc || !wc.waferOutline) return;
  const [wl, wt] = docPos(wc), pts = wc.waferOutline().map((p) => [((wl + p.x - lay.left) / lay.w) * W, ((wt + p.y - lay.top) / lay.h) * BH]);
  if (pts.length < 3) return;
  for (let y = 0; y < BH; y++) {
    const yc = y + 0.5, xs = [];
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length];
      if ((y1 <= yc) !== (y2 <= yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) waferMask[y * W + x] = 1;
  }
  waferSum = new Int32Array((W + 1) * (BH + 1));
  for (let y = 0; y < BH; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += waferMask[y * W + x]; waferSum[(y + 1) * (W + 1) + x + 1] = waferSum[y * (W + 1) + x + 1] + row; }
  }
}
const behindWafer = (x, y) => {
  const xi = Math.round(x), yi = Math.round(y) + TOP;
  return xi >= 0 && xi < W && yi >= 0 && yi < BH && waferMask[yi * W + xi] === 1;
};
/* ------------------------------------------------------------------ *
 *  Sizing, pointer and loop
 * ------------------------------------------------------------------ */
let clock = 0, lastTs = null;               // the orbit clock (seconds): it stops while a planet view is open
let clockOut = 0;                           // the outer scene's own clock: each scene only moves while it is on screen
let visible = false, running = false, frozen = false;
const now = () => clock;

function redraw() { if (buf && !running) draw(now()); }

// the window's height for the frame: the small viewport (100svh), so a phone's address bar showing or hiding does not move
// the world under you
const svhProbe = document.createElement('div');
svhProbe.setAttribute('aria-hidden', 'true');
svhProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
document.body.appendChild(svhProbe);
const windowH = () => svhProbe.offsetHeight || window.innerHeight;
let frameKey = '';

function resize() {
  const box = canvas.getBoundingClientRect();           // the real (possibly fractional) size, so the buffer always covers it
  const cw = box.width, ch = box.height;
  // the frame: one window, its bottom on the bottom of the about section (the canvas spans hackerfab, about and projects,
  // and gets its height from them, not from the window)
  const fb = Math.min(ch, page.getBoundingClientRect().bottom - box.top), ph = Math.min(windowH(), fb);
  if (!cw || !ch || !ph) return;
  frameKey = [cw, ch, ph, fb].join('|');
  frameCss = ph;
  PX = cw <= 700 ? 3 : 4;                              // CSS pixels per art pixel
  W = Math.max(8, Math.ceil(cw / PX));
  H = Math.max(8, Math.ceil(ph / PX));                 // the frame the whole world is laid out in
  const q = ph / H;                                    // css px per row
  TOP = Math.max(0, Math.round((fb - ph) / q));        // the rows above it (hackerfab, the top of about)
  BOT = Math.max(0, Math.ceil((ch - fb) / q));         // and below it (projects)
  BH = TOP + H + BOT;

  D = Math.hypot(W, H);
  canvas.width = W;
  canvas.height = BH;
  img = ctx.createImageData(W, BH);
  buf = new Uint32Array(img.data.buffer);
  YMIN = -TOP; YMAX = H + BOT;
  cacheOffsets();
  measureText();                                       // first, so the outer planets' arcs can keep off the bio
  buildWaferMask();                                    // (and the Kuiper belt's named bodies off the wafer)
  layout();
  if (view.id) measureInfo();
  measureText();
  draw(now());
}

// the layer's pixel canvas: the window, at the overview's pixel size
function sizeLayer() {
  const lh = Math.max(8, Math.ceil(winH() / PX));
  if (lbuf && lcv.width === W && lcv.height === lh) return;
  LH = lh;
  lcv.width = W; lcv.height = LH;
  lcv.style.width = W * PX + 'px'; lcv.style.height = LH * PX + 'px';
  limg = lctx.createImageData(W, LH);
  lbuf = new Uint32Array(limg.data.buffer);
  pbuf = new Uint32Array(W * LH);
}

// one frame of the zoom on the layer: the body's background (or black) at `zoom` opacity over the page, and the body itself
// over that, travelling from its place on the page (where it is no longer drawn) to its close-up place
function drawZoom(t, tgt, zoom) {
  sizeLayer();
  const e = endState(), m = reduceMotion ? 1 : zoom;
  const lx = -tgt.x, ly = tgt.h * CE - tgt.z * SE, lz = -(tgt.h * SE + tgt.z * CE);      // towards the sun
  if (!view.light) { const n = Math.hypot(lx, ly, lz) || 1; view.light = [lx / n, ly / n, lz / n]; }
  ensureBackground(tgt, e);
  // where the body is on the page right now, in the layer's pixels (the layer is the window; PX css px to a pixel)
  const qx = lay.w / W, qy = lay.h / BH;
  const sx0 = (tgt.sx * qx + lay.left - window.scrollX) / PX, sy0 = ((tgt.sy + TOP) * qy + lay.top - window.scrollY) / PX;
  // the travelling body, drawn on its own; the detailed close-up (js/planet-view.js) takes over over the last quarter
  const alpha = (reduceMotion ? zoom : 1) * (1 - clamp01((zoom - 0.75) / 0.25));
  pbuf.fill(0);
  if (alpha > 0) {
    const tx = lerp(sx0, e.x, m), ty = lerp(sy0, e.y, m), tr = lerp((tgt.R * qx) / PX, e.R, m);
    const keep = [buf, H, TOP, BOT];
    [buf, H, TOP, BOT] = [pbuf, LH, 0, 0];             // the drawing helpers write to `buf` in frame rows: point them here
    try {
      if (tgt.kind === 'sun') sunDisc(tx, ty, tr, 1);
      else sphere(tx, ty, tr, (TAU * t) / tgt.b.spin, tgt.b.colorAt, lx, ly, lz, lerp(brightFor(tgt.near), 1, m), 1);
    } finally { [buf, H, TOP, BOT] = keep; }
  }
  // composite (straight alpha, as ImageData wants): the background at `zoom`, the body at `alpha` over it
  const za = zoom, aBg = Math.round(za * 255) << 24;
  for (let i = 0, n = W * LH; i < n; i++) {
    const b = bgBuf ? bgBuf[i] : 0xff000000, p = pbuf[i];
    if (alpha <= 0 || !(p >>> 24)) { lbuf[i] = (aBg | (b & 0xffffff)) >>> 0; continue; }
    const A = alpha + za * (1 - alpha), wp = alpha / A, wb = 1 - wp;
    lbuf[i] = ((Math.round(A * 255) << 24) | (Math.round(((p >> 16) & 255) * wp + ((b >> 16) & 255) * wb) << 16)
      | (Math.round(((p >> 8) & 255) * wp + ((b >> 8) & 255) * wb) << 8) | Math.round((p & 255) * wp + (b & 255) * wb)) >>> 0;
  }
  lctx.putImageData(limg, 0, 0);
}

// ---- backgrounds: a radial gradient that starts at the side of the planet facing the sun and fades to black ----
let bgBuf = null, bgKey = '';
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ensureBackground(tgt, e) {
  const data = PLANET_DATA[view.id], bg = data && data.background;
  const L = view.light || [0.6, 0.5, 0.6];
  const key = [view.id, W, LH, Math.round(e.x), Math.round(e.y), L[0].toFixed(2), L[1].toFixed(2)].join('|');
  if (key === bgKey && bg && bg.type !== 'animation') return;
  bgKey = key;
  if (!bg) { bgBuf = null; return; }
  if (bg.type === 'animation') {                       // an animated pixel background (js/backgrounds.js), drawn every frame
    if (typeof bg.render !== 'function') { bgBuf = null; return; }
    if (!bgBuf || bgBuf.length !== W * LH) bgBuf = new Uint32Array(W * LH);
    // a wall clock, not the orbit clock (that one stops while a view is open); one still frame with reduced motion
    const t = reduceMotion ? 20 : performance.now() / 1000;
    bg.render(bgBuf, t, W, LH, { cx: e.x, cy: e.y, R: e.R, light: L });
    return;
  }
  const stops = bg.stops.map(([p, hex]) => [p, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  // centre: the sun-facing limb, or the body itself (the Sun's own glow)
  const n = Math.hypot(L[0], L[1]) || 1, onBody = bg.center === 'body';
  const gx = onBody ? e.x : e.x + (L[0] / n) * e.R * 0.85, gy = onBody ? e.y : e.y + (L[1] / n) * e.R * 0.85;
  const Rg = Math.hypot(W, LH) * 0.7, BANDS = 14;
  bgBuf = new Uint32Array(W * LH);
  for (let y = 0; y < LH; y++) {
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
// as a list under the planet) or 'phone' (the planet, then the facts in a scrolling column)
const viewMode = () => { const w = winW(); return w >= 1100 ? 'wide' : w >= 768 ? 'list' : 'phone'; };
const AXIS_UP = 1.5;                        // the rotation axis and its "N" reach this many radii above the centre

// the open planet's final centre and radius, in the layer's pixels (the window). Wide: 38vmin across, in the middle of the
// window (smaller only if that leaves under 48 px of clear space around it), with the facts on both sides. List: about
// 30vmin, centred under the name. Phones: about 60vw across at the top.
function endState() {
  const mode = viewMode(), gap = 48, vw = winW(), vh = winH(), half = vw / 2;
  let r, x, y;
  if (mode === 'phone') { r = 0.3 * vw; x = vw / 2; y = gap + AXIS_UP * r; }
  else if (mode === 'list') {
    // about 30vmin, smaller if the facts underneath would not fit: name, planet with its axis (3 radii tall) and orbits
    // (moons and satellites stay within 1.6 radii in this layout), list
    const data = PLANET_DATA[view.id] || {};
    const below = (data.moons || []).length || (data.satellites || []).length || (data.members || []).length ? 1.6 : AXIS_UP;
    const room = (vh - 2 * gap - headH - 32 - listH) / (AXIS_UP + below);
    r = Math.max(24, Math.min(0.15 * Math.min(vw, vh), (half - 2 * gap) / 2, room));
    x = half; y = gap + headH + 16 + AXIS_UP * r;
  } else {
    r = Math.max(24, Math.min(0.19 * Math.min(vw, vh), (half - 2 * gap) / 2, (vh - 2 * gap) / 2));
    x = half; y = vh / 2;
  }
  // a body whose close-up is wider than its disc (Saturn's rings, Pluto circling with Charon) is drawn smaller
  const k = (PLANET_DATA[view.id] || {}).closeupScale || 1;
  return { x: x / PX, y: y / PX, R: (r * k) / PX };
}

// the name block's and the fact list's heights (filled in by js/planet-callouts.js on planet-open)
function measureInfo() {
  const head = layer.querySelector('.planet-head'), list = layer.querySelector('.planet-callouts');
  if (head) headH = head.offsetHeight || headH;
  listH = list && viewMode() === 'list' ? list.offsetHeight : 0;
}


function frame(ts) {
  if (!visible) { running = false; lastTs = null; return; }   // nothing to draw while page 4 is off screen
  if (frozen) { lastTs = null; requestAnimationFrame(frame); return; }   // a test is inspecting one frame
  if (lastTs !== null && !view.id) {                        // paused while a view is open
    // the clocks run the spins, moons and belts; the planets themselves move by the screen-driven rules (stepPlanets),
    // which wait while the camera slides between the two views
    const dt = Math.min(0.25, (ts - lastTs) / 1000);           // (a long stall still never jumps a planet far)
    clock += dt;
    clockOut += dt;
    if (!sceneMoving()) stepPlanets(dt);
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
space.appendChild(btnBox);                           // over both screens (under their content), so planets up in the hackerfab screen have one too
const buttons = BODIES.map((b) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'planet-btn';
  el.setAttribute('aria-label', 'Open ' + b.name);
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openFromOverview(b.id); });
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
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openFromOverview(id); });
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
layer.appendChild(backLink);

// keep every button centred on its planet (at least 44 px so it is easy to hit); hidden while a view is open, during the
// flight between the scenes, and for the scene that is not shown
function updateButtons() {
  const open = view.id !== null, still = !sceneMoving();
  const qx = lay.w / W, qy = lay.h / BH, cssX = (x) => x * qx, cssY = (y) => lay.inSpace + (y + TOP) * qy;   // art px -> .space px
  btnBox.hidden = open && view.t >= 1;
  placed.forEach((p, i) => {
    const el = buttons[i];
    const show = !open && still && p.active && !p.clipped && !p.hidden && !behindWafer(p.sx, p.sy) && isOnScreen(i);
    if (el.hidden === show) el.hidden = !show;
    if (!show) return;
    const d = Math.max(44, (2 * p.R + 12) * PX);
    el.style.width = el.style.height = d + 'px';
    el.style.transform = 'translate(' + (cssX(p.sx) - d / 2) + 'px,' + (cssY(p.sy) - d / 2) + 'px)';
  });
  // the Sun's button sits on its label; each belt's on the middle of its arc on screen
  const spotOf = (pt) => { const [sx, sy] = project(pt[0], pt[1], pt[2]); return [sx, sy, 44]; };
  const spots = { SUN: [sunX, sunY, 48], BELT: spotOf(defaultBeltPoint()), KUIPER: spotOf(defaultKuiperPoint()) };
  const shown = { SUN: scene.t <= 0, BELT: true, KUIPER: true };
  for (const sp of specials) {
    const [sx, sy, d] = spots[sp.tag];
    const top = sp.tag === 'KUIPER' ? -TOP : 0;           // the Kuiper ring runs up into the hackerfab screen too
    const x = Math.min(Math.max(cssX(sx), d / 2), W * qx - d / 2), y = Math.min(Math.max(cssY(sy), cssY(top) + d / 2), cssY(H + BOT) - d / 2);
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
// the middle of the longest stretch of a ring on screen (rows from `top` down: the Kuiper ring may be on screen only in the
// hackerfab screen, and never counts where it is behind the wafer)
function defaultRingPoint(r, top = 4) {
  let run = [], best = [];
  for (let d = 0; d <= 720; d++) {
    const a = ((d % 360) * Math.PI) / 180, [sx, sy, zv] = project(r * Math.cos(a), 0, -r * Math.sin(a));
    if (zv > NEAR_CLIP && sx > 4 && sy > top && sx < W - 4 && sy < H + BOT - 4 && d < 720 && !behindWafer(sx, sy)) run.push(a);
    else { if (run.length > best.length) best = run; run = []; }
  }
  const a = best.length ? best[Math.floor(best.length / 2)] : (3 * Math.PI) / 4;
  return [r * Math.cos(a), 0, -r * Math.sin(a)];
}
const defaultBeltPoint = () => defaultRingPoint(beltR);
const defaultKuiperPoint = () => defaultRingPoint(kuiperMid(), -TOP + 4);

// the Sun's disc on its own (no halo), blended over what is there: the traveller while the camera pans to the Sun
function sunDisc(sx, sy, R, alpha) {
  for (let y = Math.max(-TOP, Math.floor(sy - R)); y <= Math.min(H + BOT - 1, Math.ceil(sy + R)); y++) {
    for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(W - 1, Math.ceil(sx + R)); x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d > R) continue;
      const g = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5, t = d / R + g * 0.16;
      const c = t < 0.45 ? [255, 246, 150] : t < 0.8 ? [255, 218, 52] : [255, 176, 22], o = buf[(y + TOP) * W + x];
      buf[(y + TOP) * W + x] = rgb((o & 255) * (1 - alpha) + c[0] * alpha, ((o >> 8) & 255) * (1 - alpha) + c[1] * alpha, ((o >> 16) & 255) * (1 - alpha) + c[2] * alpha);
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
  // a link straight to a body that is not in view here (in the other scene): jump to its own scene first. A body clicked
  // where it is opens from there, and closing comes back to the same view
  const home = sceneOf(id), here = placed.find((q) => q.b.id === id);
  const inView = here && here.active && !here.clipped && !here.hidden && isOnScreen(here.i);
  if (home && home !== sceneName() && !inView) goScene(home, true);
  clearTimeout(closeTimer); closing = false;
  hovered = null; space.style.cursor = '';
  if (!view.id) lockPage(true);                     // the layer goes over the page, which stays where it is
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

// while a body is open the page under the layer is still: it cannot scroll (the layer covers it and the root does not
// scroll), its content is inert so focus stays on the layer, and closing puts it back exactly where it was
let savedY = 0;
const mainEl = document.querySelector('main');
function lockPage(on) {
  if (on) {
    savedY = window.scrollY;
    layer.hidden = false;
    sizeLayer();
    lctx.clearRect(0, 0, lcv.width, lcv.height);
    document.documentElement.classList.add('planet-locked');
    if (mainEl) mainEl.inert = true;
    return;
  }
  layer.hidden = true;
  document.documentElement.classList.remove('planet-locked');
  if (mainEl) mainEl.inert = false;
  if (Math.abs(window.scrollY - savedY) > 0.5) window.scrollTo({ top: savedY, behavior: 'instant' });
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
  lockPage(false);
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
  if (reduceMotion) placeStill();
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
  if (instant) { scene.t = target; scene.dir = 0; setCam(sceneCam()); sceneSettled(); return; }
  if (scene.t === target && scene.dir === 0) return;
  captionFocus = document.activeElement === toPluto || document.activeElement === toSun;
  scene.dir = target ? 1 : -1;
  hovered = null; focusedBody = null; space.style.cursor = '';
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
  } else closeView();                                // another anchor on the page (#about): leave the scene as it is
});

// what is under the pointer: a planet (a BODIES entry), 'SUN', 'BELT', or null
function targetAt(ev) {
  if (view.id || sceneMoving()) return null;
  const [x, y] = toArt(ev.clientX, ev.clientY);
  if (behindWafer(x, y)) return null;                        // the wafer is in front: it covers whatever is behind it
  let best = null, bd = Infinity;
  for (const p of placed) {                                  // planets first: they are the smallest targets
    if (p.hidden || !p.active || p.clipped || behindWafer(p.sx, p.sy)) continue;
    const d = Math.hypot(p.sx - x, p.sy - y);
    if (d <= Math.max(p.R + 3, 5) && d < bd) { best = p.b; bd = d; }
  }
  if (best) return best;
  if (scene.t <= 0 && Math.hypot(x - sunX, y - sunY) <= sunR) return 'SUN';     // the bright disc, its label included
  // the belt: anywhere in its band on screen (the pointer's position on the orbital plane lies within the band's distance
  // from the sun), except where page text sits on top of it: the text wins
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi >= 0 && yi >= -TOP && xi < W && yi < H + BOT && textMask[(yi + TOP) * W + xi]) return null;
  const rho = radiusThrough(x, y, cam.f);
  if (Math.abs(rho - beltR) <= beltR * (BELT_WIDTH + 0.02)) return 'BELT';
  if (rho >= kuiperR[0] && rho <= kuiperR[1]) return 'KUIPER';
  return null;
}
// links, buttons and form controls always take the click (and the hover) before anything drawn behind them
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

// read-only hooks for tests and future click features
canvas.planetPositions = () => placed.map((p, i) => ({
  name: p.b.name, x: p.sx * PX, y: p.sy * PX, r: p.R * PX, depth: p.zv, hidden: p.hidden, onScreen: p.active && isOnScreen(i),
}));
// every planet's motion state and its isOnScreen box in css viewport px (for tests and the debug overlay)
canvas.solarBodies = () => BODIES.map((b, i) => {
  const bx = bodyBox(i), m = motion[i];
  return { name: b.name, speed: b.speed, state: m.state, waitLeft: m.state === 'waiting' ? m.wait - simT : 0, phi: m.phi, onScreen: isOnScreen(i),
    box: { left: bx.left, right: bx.right, top: bx.top, bottom: bx.bottom }, x: bx.p.sx * (lay.w / W), y: (bx.p.sy + TOP) * (lay.h / BH) + lay.top - window.scrollY };
});
// run the motion rules for dt seconds (in small steps) and draw, without waiting for real time (tests)
// which planets have any part of their orbit on screen from here (the rest are parked until the view changes) (tests)
canvas.solarOrbitsSeen = () => BODIES.map((b, i) => (isOnScreen(i) || entryAhead(i, motion[i].phi) !== null ? b.name : null)).filter(Boolean);
canvas.solarStep = (dt, step = 1 / 60) => { for (let k = 0; k < dt; k += step) stepPlanets(Math.min(step, dt - k)); draw(clock); };
canvas.solarState = (i) => { const p = planetState(i, motion[i].phi); return [p.sx, p.sy, p.R, p.hidden ? 1 : 0, p.zv]; };
canvas.solarRenderAt = () => draw(clock);
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
      if (zv < NEAR_CLIP || sx < -40 || sy < -40 || sx > W + 40 || sy > H + BOT + 40) pts.push(NaN, NaN); else pts.push(sx * PX, sy * PX);
    }
    return { name: b.name, pts };
  });
  const bodies = BODIES.map((b, i) => { const p = planetState(i, motion[i].phi); return { name: b.name, x: p.sx * PX, y: p.sy * PX, r: p.R * PX, clipped: p.clipped }; });
  const sunG = { x: sunX * PX, y: sunY * PX, r: sunR * PX, inFront: sunZv > NEAR_CLIP };
  setCam(keep);
  return { orbits, bodies, sun: sunG, W: W * PX, H: H * PX };
};
canvas.solarSunSkips = () => sunSkips;
// how much of each orbit (share of its angles) is drawn in the hackerfab screen (rows above page 4), clear of the wafer, seen
// from the inner or outer camera position, and the same for the main belt's ring (tests)
canvas.solarTailPass = (where) => {
  const keep = cam;
  setCam(where === 'outer' ? camOut : CAM_IN);
  const out = {}, n = 3600;
  BODIES.forEach((b, i) => {
    let k = 0;
    for (let d = 0; d < n; d++) { const p = planetState(i, (d / n) * TAU); if (!p.clipped && p.sx >= 0 && p.sx <= W && p.sy >= -TOP && p.sy < 0 && !behindWafer(p.sx, p.sy)) k++; }
    out[b.name] = +(k / n).toFixed(3);
  });
  let belt = 0;
  for (let d = 0; d < n; d++) {
    const a = (d / n) * TAU, [sx, sy, zv] = project(beltR * Math.cos(a), 0, -beltR * Math.sin(a));
    if (zv > NEAR_CLIP && sx >= 0 && sx <= W && sy >= -TOP && sy < 0 && !behindWafer(sx, sy)) belt++;
  }
  out['MAIN BELT'] = +(belt / n).toFixed(3);
  setCam(keep);
  return out;
};
// where the world's page-4 frame starts on the page vs where page 4 actually starts (css px; 0 = perfectly aligned)
canvas.solarAlignment = () => ({ worldTop: lay.top + TOP * (lay.h / BH), pageTop: lay.page, TOP, BH, H });       // draw one frame at time t (used with reduced motion, to inspect moments)
// the camera numbers for a viewport of w x h css px, without touching what is drawn (used by the timeline search)
canvas.solarGeometryFor = (w, h) => {
  const keep = [W, H, D];
  W = Math.ceil(w / (w <= 700 ? 3 : 4)); H = Math.ceil(h / (w <= 700 ? 3 : 4)); D = Math.hypot(W, H);
  layout();
  const g = { W, H, D, cx, cy, F, orbitR: orbitR.slice(), rSun, r0: BODIES.map(planetR0), incl: BODIES.map((b) => b.incl || 0) };
  [W, H, D] = keep;
  layout();
  return g;
};
// where the clickable things are, in css px relative to the canvas (for tests and future click features)
canvas.solarTargets = () => {
  const belt = [];
  for (let d = 91; d < 180; d += 3) {
    const a = (d * Math.PI) / 180, [sx, sy] = project(beltR * Math.cos(a), 0, -beltR * Math.sin(a));
    if (sx > 1 && sy > 1 && sx < W - 1 && sy < H + BOT - 1) belt.push({ x: sx * PX, y: sy * PX });
  }
  return { sun: { x: cx * PX, y: cy * PX, r: rSun * PX }, belt, label: labelInfo };
};
canvas.solarView = () => ({ id: view.id, t: view.t, dir: view.dir, zoom: easeInOut(view.t), clock, endState: endState(), colRight, cssW: winW(), cssH: winH(), PX, light: view.light, reduceMotion, mode: viewMode(), closing });
// the overview's hover labels this frame, in css px (for tests)
// the Kuiper bodies and the planet discs as drawn last frame, in page-4 art px (rows above page 4 are negative), for tests
canvas.solarKuiperSeen = () => ({ rocks: lastKuiper.kRocks.map(([sx, sy, s, nr]) => [sx, sy, s.f, nr, radiusThrough(sx, sy, cam.f)]), named: lastKuiper.kNamed.map((k) => [k.m.name, k.sx, k.sy]), kuiperR, plutoR: orbitR[BODIES.findIndex((b) => b.id === 'pluto')], neptuneR: orbitR[BODIES.findIndex((b) => b.id === 'neptune')], TOP, H, W, PX });
canvas.solarKuiperStats = () => kuiperStats;
canvas.solarDiscs = () => discs.map((d) => d.slice());
canvas.solarLabels = () => lastLabels.map(([x, y, w, h, name]) => ({ name, x: (x - 1) * PX, y: (y - 1) * PX, w: (w + 2) * PX, h: (h + 2) * PX }));
canvas.solarHover = (id) => { hovered = id === SUN_ID ? 'SUN' : id === BELT_ID ? 'BELT' : id === KUIPER_ID ? 'KUIPER' : BODIES.find((b) => b.id === id) || null; redraw(); };
// what a click at this point would hit, ignoring the page's own elements (for tests): a planet id, 'sun', 'asteroid-belt' or null
canvas.solarHitAt = (clientX, clientY) => { const h = targetAt({ clientX, clientY }); return h === 'SUN' ? SUN_ID : h === 'BELT' ? BELT_ID : h === 'KUIPER' ? KUIPER_ID : h ? h.id : null; };
canvas.solarBandAt = (clientX, clientY) => {        // is this point inside the belt's band at all (text or not)? (for tests)
  const [x, y] = toArt(clientX, clientY);
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
canvas.solarInfo = () => ({ W, H, D, F, cx, cy, orbitR, beltR, rSun, kuiperR, kuiperZv, camOut, mercuryLowest: mercuryLowest(), ids: BODIES.map((b) => b.id),
  speeds: BODIES.map((b) => b.speed), start: BODIES.map((b) => b.start), r0: BODIES.map(planetR0) });

space.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'touch') return;
  const hit = ev.target.closest(INTERACTIVE) ? null : targetAt(ev);
  if (hit !== hovered) {
    hovered = hit;
    space.style.cursor = hit ? 'pointer' : '';
    redraw();
  }
}, { passive: true });
space.addEventListener('pointerleave', () => { if (hovered) { hovered = null; space.style.cursor = ''; redraw(); } }, { passive: true });

// open a body from the overview, wherever the page is: the close-up is a layer over it
const openFromOverview = (id, beltPoint = null) => openView(id, true, beltPoint);

// on the layer, a click on empty space closes; the name, the back link, the facts and the body itself do not
layer.addEventListener('click', (ev) => {
  if (!view.id || ev.target.closest('.planet-head, .planet-callout, .planet-info[data-mode="phone"]')) return;
  const e = endState();
  if (Math.hypot(ev.clientX / PX - e.x, ev.clientY / PX - e.y) <= e.R) return;
  requestClose();
});

space.addEventListener('click', (ev) => {
  if (view.id) return;
  if (ev.target.closest(INTERACTIVE)) return;          // a link (or any control) over the canvas keeps its click
  const hit = targetAt(ev);
  canvas.dispatchEvent(new CustomEvent('solar-click', { detail: { name: nameOf(hit) } }));   // hook for what comes next
  if (hit && hit.id) openFromOverview(hit.id);         // a planet, the Sun or a belt opens its view
  else if (hit === 'SUN') openFromOverview(SUN_ID);
  else if (hit === 'BELT' || hit === 'KUIPER') {
    const [sx, sy] = toArt(ev.clientX, ev.clientY);
    if (hit === 'BELT') openFromOverview(BELT_ID, beltPointUnder(sx, sy));
    else openFromOverview(KUIPER_ID, ringPointUnder(sx, sy, kuiperMid()));
  }
});

resize();
if (reduceMotion) { placeStill(); redraw(); }
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
// the frame is one window tall, so a change in the window's height alone (the canvas keeps its size) lays it out again too
window.addEventListener('resize', () => {
  const box = canvas.getBoundingClientRect(), fb = Math.min(box.height, page.getBoundingClientRect().bottom - box.top);
  if ([box.width, box.height, Math.min(windowH(), fb), fb].join('|') !== frameKey) resize();
});
// the hover labels must stay off the text, so the text mask is re-measured whenever the text can move: web fonts arriving
// (they change line widths), the page finishing loading, and the bio changing size outside the planet view
const remeasure = () => { if (!view.id) { measureText(); redraw(); } };
// the wafer's outline (and the hackerfab text around it) settles when the wafer fits itself to the page; anything above can
// also move the canvas down the document (the hero's height on phones): re-cache positions then, never while scrolling
const reposition = () => { cacheOffsets(); buildWaferMask(); remeasure(); };
const waferCanvas = document.querySelector('.wafer-canvas');
if (waferCanvas) waferCanvas.addEventListener('wafer-fit', reposition);
if (window.ResizeObserver) new ResizeObserver(reposition).observe(document.body);
if (document.fonts) {
  // once the web fonts are in, the text boxes have their final size: lay out again (on phones the outer orbits keep under
  // the bio, and the Kuiper belt's named bodies keep clear of the text)
  if (document.fonts.ready) document.fonts.ready.then(() => { if (view.id) remeasure(); else resize(); });
  document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', remeasure);
}
window.addEventListener('load', remeasure);
if (window.ResizeObserver && bio) new ResizeObserver(remeasure).observe(bio);

// a link like /#mars opens that planet (after a normal zoom, or the short crossfade with reduced motion). It waits until
// every script has run: the close-up (js/planet-view.js) and its callouts load after this file and listen for planet-open.
function openFromHash() {
  const id = location.hash.slice(1);
  if (id === 'outer') {
    window.scrollTo({ top: lay.page, behavior: 'instant' });
    goScene('outer', true);
  } else if (openable(id)) {
    window.scrollTo({ top: lay.page, behavior: 'instant' });
    openView(id, false);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openFromHash, { once: true });
else setTimeout(openFromHash, 0);

if (reduceMotion) window.addEventListener('scrollend', () => { placeStill(); redraw(); }, { passive: true });
if (!reduceMotion) {
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
  }).observe(canvas);
}
})();
