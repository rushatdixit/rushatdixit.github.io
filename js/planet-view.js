// The planet close-up shown when a planet is open: a larger procedural pixel-art sphere (about 96 px across, scaled up
// with image-rendering: pixelated), lit from the sun's direction with a dark side, rotating about an axis tilted by the
// planet's real axial tilt. Moons (and, for Earth, satellites) orbit it on tilted ellipses, passing in front of and
// behind it, each with a floating pixel name. Planet facts come from js/planets.js; per-body orbit settings are below.
(() => {
const layer = document.querySelector('.planet-layer');    // the full-window layer js/solar.js puts over the page
const solar = document.querySelector('.solar-canvas');
if (!layer || !solar) return;

const BUF = 448;                 // buffer size in art pixels (room for moons out to about 4.5 planet radii)
const PR = 48;                   // planet radius in art pixels (96 across)
const TAU = Math.PI * 2;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cv = document.createElement('canvas');
cv.className = 'planet-canvas';
cv.width = cv.height = BUF;
cv.setAttribute('aria-hidden', 'true');
layer.appendChild(cv);
const ctx = cv.getContext('2d');
const img = ctx.createImageData(BUF, BUF);
const buf = new Uint32Array(img.data.buffer);

/* ------------------------------------------------------------------ *
 *  Settings
 * ------------------------------------------------------------------ */
// seconds for one full turn of each planet (slow, for show); Venus is the slowest and, with its 177.4 degree tilt, turns backwards
const SPIN_S = { mercury: 150, venus: 240, earth: 80, mars: 84, sun: 70, 'asteroid-belt': 26,   // the Sun: at its equator; the belt: Ceres
  jupiter: 40, saturn: 44, uranus: 60, neptune: 56, pluto: 30, 'kuiper-belt': 70 };       // Pluto turns once per Charon orbit (locked)            // the Kuiper belt: Arrokoth's tumble
const SUN_PITCH = (22 * Math.PI) / 180;      // how far the north pole is tipped towards the viewer, so equators show as ellipses

// orbit = radius in planet radii; period in seconds; r = body radius in art pixels; incl / node in degrees.
// geo: the body stays over one spot (geostationary): its period is the planet's own spin period.
const ORBITS = {
  Moon:     { kind: 'moon', orbit: 2.55, period: 60,  r: 5,   incl: 5,    node: 30,  color: [205, 205, 212] },
  Phobos:   { kind: 'moon', orbit: 1.5,  period: 7,   r: 2.4, incl: 1,    node: 80,  color: [158, 146, 134] },
  Deimos:   { kind: 'moon', orbit: 2.0,  period: 18,  r: 2,   incl: 2,    node: 200, color: [182, 166, 146] },
  ISS:      { kind: 'sat',  orbit: 1.16, period: 6,   incl: 51.6, node: 40,  sprite: 'bar5' },
  Hubble:   { kind: 'sat',  orbit: 1.23, period: 7.2, incl: 28.5, node: 140, sprite: 'plus' },
  Tiangong: { kind: 'sat',  orbit: 1.2,  period: 6.6, incl: 41.5, node: 250, sprite: 'bar3' },
  GPS:      { kind: 'sat',  orbit: 1.75, period: 20,  incl: 55,   node: 320, sprite: 'block' },
  GOES:     { kind: 'sat',  orbit: 2.15, geo: true,    incl: 0,    node: 0,   sprite: 'plus' },
  // Jupiter: the four Galilean moons
  Io:        { kind: 'moon', orbit: 1.75, period: 10, r: 3.2, incl: 2,  node: 20,  color: [232, 206, 104] },
  Europa:    { kind: 'moon', orbit: 2.25, period: 16, r: 2.9, incl: 4,  node: 150, color: [222, 212, 192] },
  Ganymede:  { kind: 'moon', orbit: 2.85, period: 26, r: 4,   incl: 3,  node: 260, color: [170, 158, 146] },
  Callisto:  { kind: 'moon', orbit: 3.55, period: 44, r: 3.8, incl: 5,  node: 330, color: [118, 108, 98] },
  // Saturn: all outside the rings (which reach 2.27 radii)
  Mimas:     { kind: 'moon', orbit: 2.45, period: 9,  r: 1.8, incl: 2,  node: 10,  color: [190, 190, 192] },
  Enceladus: { kind: 'moon', orbit: 2.7,  period: 12, r: 2,   incl: 1,  node: 120, color: [240, 244, 250] },
  Tethys:    { kind: 'moon', orbit: 2.95, period: 16, r: 2.5, incl: 2,  node: 230, color: [206, 206, 210] },
  Dione:     { kind: 'moon', orbit: 3.2,  period: 21, r: 2.5, incl: 1,  node: 300, color: [196, 194, 196] },
  Rhea:      { kind: 'moon', orbit: 3.5,  period: 28, r: 3,   incl: 2,  node: 70,  color: [186, 184, 182] },
  Titan:     { kind: 'moon', orbit: 4.0,  period: 44, r: 4.4, incl: 1,  node: 190, color: [222, 170, 88] },
  Iapetus:   { kind: 'moon', orbit: 4.5,  period: 70, r: 3,   incl: 15, node: 340, color: [150, 136, 118] },
  // Uranus: in its equator plane, so (with the planet's 97.8 degree tilt) the orbits stand on their side
  Miranda:   { kind: 'moon', orbit: 1.75,  period: 9,  r: 2,   incl: 4,  node: 30,  color: [190, 190, 196] },
  Ariel:     { kind: 'moon', orbit: 2.1, period: 13, r: 2.6, incl: 0,  node: 100, color: [206, 204, 206] },
  Umbriel:   { kind: 'moon', orbit: 2.45,  period: 18, r: 2.6, incl: 0,  node: 170, color: [128, 126, 128] },
  Titania:   { kind: 'moon', orbit: 2.85, period: 28, r: 3.2, incl: 0,  node: 250, color: [196, 186, 180] },
  Oberon:    { kind: 'moon', orbit: 3.3,  period: 38, r: 3.2, incl: 0,  node: 320, color: [176, 164, 158] },
  // Neptune: Triton orbits backwards (an inclination over 90 degrees turns the orbit round)
  Proteus:   { kind: 'moon', orbit: 1.6,  period: 8,  r: 2.2, incl: 1,  node: 60,  color: [120, 116, 112] },
  Triton:    { kind: 'moon', orbit: 2.4,  period: 22, r: 3.6, incl: 157, node: 200, color: [222, 206, 200] },
  Nereid:    { kind: 'moon', orbit: 3.6,  period: 60, r: 2,   incl: 28, node: 300, color: [176, 176, 180] },
  // Pluto: everything circles the shared point between Pluto and Charon (the centre of the view; see PLUTO_WOBBLE)
  Charon:    { kind: 'moon', orbit: 2.0,  period: 30, r: 24,  incl: 0,  node: 0,   color: [172, 168, 166] },
  Styx:      { kind: 'moon', orbit: 3.0,  period: 40, r: 1.6, incl: 1,  node: 50,  color: [196, 196, 200] },
  Nix:       { kind: 'moon', orbit: 3.3,  period: 48, r: 2,   incl: 0,  node: 140, color: [210, 210, 214] },
  Kerberos:  { kind: 'moon', orbit: 3.6,  period: 56, r: 1.6, incl: 1,  node: 230, color: [150, 150, 154] },
  Hydra:     { kind: 'moon', orbit: 3.9,  period: 64, r: 2,   incl: 1,  node: 310, color: [212, 212, 216] },
};
// Pluto and Charon circle a shared point between them (their barycentre): Pluto on a circle this many Pluto radii across,
// opposite Charon, with Charon's period. (The real point is outside Pluto too; the distances here are squeezed to fit.)
const PLUTO_WOBBLE = 1.15;
// rings in a planet's equator plane, in planet radii: [inner, outer, colour, gaps [[from, to], ...]]
const RINGS = {
  saturn: { bands: [[1.24, 1.52, [150, 136, 108]], [1.52, 1.95, [230, 210, 162]], [2.02, 2.27, [206, 186, 140]]] },   // C, B (Cassini gap), A
  uranus: { bands: [[1.3, 1.33, [150, 170, 182]], [1.4, 1.43, [140, 160, 172]], [1.52, 1.56, [176, 196, 206]]] },    // thin and faint
};
const ringOuter = (id) => (RINGS[id] ? RINGS[id].bands[RINGS[id].bands.length - 1][1] : 1);
// when the space round a body is tight, orbits are squeezed only beyond this many radii (Saturn's and Uranus's rings, and
// Pluto's own circle round the shared point with Charon, keep their size)
const squeezeBase = (id) => (id === 'pluto' ? 2.0 : RINGS[id] ? ringOuter(id) : 1);
const SPRITES = {
  bar5: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, -1]],
  bar3: [[-1, 0], [0, 0], [1, 0], [0, 1]],
  plus: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
  block: [[0, 0], [1, 0], [0, 1], [1, 1]],
};

/* ------------------------------------------------------------------ *
 *  Pixel font for the floating names (3x5 letters)
 * ------------------------------------------------------------------ */
const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '111'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'], O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'], Q: ['111', '101', '101', '111', '001'], R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'], ' ': ['00', '00', '00', '00', '00'],
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '.': ['0', '0', '0', '0', '1'], '°': ['11', '11', '00', '00', '00'],
};
const glyph = (ch) => FONT[ch] || FONT[' '];
const textW = (str) => [...str.toUpperCase()].reduce((w, ch) => w + glyph(ch)[0].length, 0) + str.length - 1;

/* ------------------------------------------------------------------ *
 *  Buffer helpers
 * ------------------------------------------------------------------ */
const rgb = (r, g, b) => (0xff << 24) | (Math.min(255, Math.max(0, b | 0)) << 16) | (Math.min(255, Math.max(0, g | 0)) << 8) | Math.min(255, Math.max(0, r | 0));
const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < BUF && y >= 0 && y < BUF) buf[y * BUF + x] = c; };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function drawText(str, x0, y0, c) {
  let x = Math.round(x0);
  for (const ch of str.toUpperCase()) {
    glyph(ch).forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') put(x + i, Math.round(y0) + j, c); });
    x += glyph(ch)[0].length + 1;
  }
}

/* ------------------------------------------------------------------ *
 *  Procedural surfaces: noise on the sphere, then a palette per planet
 * ------------------------------------------------------------------ */
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    r += hash3(ix + dx, iy + dy, iz + dz, seed) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
  }
  return r;
}
const fbm = (x, y, z, seed = 1) => (vnoise(x, y, z, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3, seed + 13) * 0.15);

// nearest feature point distance (for craters)
function cells(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const px = cx + hash3(cx, cy, cz, seed), py = cy + hash3(cx, cy, cz, seed + 1), pz = cz + hash3(cx, cy, cz, seed + 2);
    const d = Math.hypot(x - px, y - py, z - pz);
    if (d < best) best = d;
  }
  return best;
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// (X, Y, Z) is a point on the unit sphere in the planet's own frame (Y is the spin axis)
const SURFACES = {
  mercury(X, Y, Z) {
    const f = fbm(X * 2.4, Y * 2.4, Z * 2.4, 3);
    let c = mix3([128, 118, 108], [176, 164, 150], f);
    const d = cells(X * 5.5, Y * 5.5, Z * 5.5, 11);
    if (d < 0.3) c = mix3(c, [86, 80, 76], 0.75 - d);                                   // crater floor
    else if (d < 0.38) c = mix3(c, [212, 200, 184], 0.45);                              // crater rim
    const d2 = cells(X * 11, Y * 11, Z * 11, 29);
    if (d2 < 0.22) c = mix3(c, [96, 90, 84], 0.5);
    return c;
  },
  venus(X, Y, Z) {
    const warp = fbm(X * 2.6, Y * 2.6, Z * 2.6, 5) * 4.2;
    const v = Math.sin(Y * 9 + warp) * 0.5 + 0.5;
    let c = mix3([208, 160, 82], [244, 222, 150], v);
    const streak = fbm(X * 6, Y * 12, Z * 6, 9);
    return mix3(c, [255, 240, 190], clamp01((streak - 0.5) * 2) * 0.5);
  },
  earth(X, Y, Z) {
    const land = fbm(X * 2.1 + 3, Y * 2.1, Z * 2.1, 17);
    let c;
    if (land > 0.52) {
      const hot = 1 - Math.abs(Y);
      c = mix3([92, 120, 66], [48, 148, 62], clamp01(hot * 1.2));
      if (land > 0.64) c = mix3(c, [150, 128, 80], clamp01((land - 0.64) * 6));        // highlands
    } else c = mix3([18, 56, 150], [30, 100, 196], clamp01((land - 0.3) * 4));
    if (Math.abs(Y) > 0.86) c = mix3(c, [238, 242, 250], clamp01((Math.abs(Y) - 0.86) * 12));      // ice caps
    const cloud = fbm(X * 3.6 + 9, Y * 5, Z * 3.6, 23);
    return mix3(c, [250, 250, 252], clamp01((cloud - 0.55) * 4) * 0.85);
  },
  mars(X, Y, Z) {
    const f = fbm(X * 2.3, Y * 2.3, Z * 2.3, 31);
    let c = mix3([176, 84, 48], [214, 112, 64], f);
    const dark = fbm(X * 3 + 5, Y * 3, Z * 3, 37);
    if (dark > 0.55) c = mix3(c, [110, 50, 36], clamp01((dark - 0.55) * 5) * 0.8);
    if (Math.abs(Y) > 0.9) c = mix3(c, [240, 236, 232], clamp01((Math.abs(Y) - 0.9) * 14));
    return c;
  },
};
// Ceres (the belt's close-up): grey, cratered, with a couple of bright salt spots
SURFACES['asteroid-belt'] = (X, Y, Z) => {
  let c = mix3([104, 102, 100], [150, 148, 144], fbm(X * 2.6, Y * 2.6, Z * 2.6, 51));
  const d = cells(X * 6, Y * 6, Z * 6, 53);
  if (d < 0.28) c = mix3(c, [78, 76, 74], 0.7 - d);
  else if (d < 0.35) c = mix3(c, [182, 180, 176], 0.4);
  const spot = Math.hypot(X - 0.62, Y - 0.34, Z - 0.7);
  if (spot < 0.09) c = mix3(c, [236, 236, 232], 1 - spot / 0.09);
  return c;
};
// the outer planets. t is the time in seconds (for clouds that drift relative to the planet's own spin)
const lonOf = (X, Z) => Math.atan2(Z, X);
const turn = (X, Z, a) => [X * Math.cos(a) - Z * Math.sin(a), X * Math.sin(a) + Z * Math.cos(a)];
// Jupiter: cream, tan and rust bands, each drifting at its own speed, and the Great Red Spot riding its band
SURFACES.jupiter = (X, Y, Z, t = 0) => {
  const lat = Math.asin(Math.max(-1, Math.min(1, Y)));
  const band = Math.floor((lat + 1.6) * 5.2);                         // which band (roughly ten across the disc)
  const [x2, z2] = turn(X, Z, t * 0.02 * ((band % 3) - 1) + band * 0.7);   // this band's own drift
  const wob = fbm(x2 * 3, Y * 9, z2 * 3, 41) * 0.9;
  const v = Math.sin(lat * 15 + wob * 2.4);
  let c = v > 0.45 ? [238, 224, 194] : v > -0.25 ? [208, 164, 116] : [178, 102, 66];
  c = mix3(c, [250, 240, 216], clamp01((fbm(x2 * 6, Y * 14, z2 * 6, 43) - 0.62) * 3) * 0.5);
  // the Great Red Spot: an oval about 22 degrees south, carried round by its band
  const lon = lonOf(...turn(X, Z, t * 0.02 * 0.6));
  const dl = Math.atan2(Math.sin(lon - 1.1), Math.cos(lon - 1.1)), dp = lat + 0.38;
  const e = (dl / 0.34) ** 2 + (dp / 0.14) ** 2;
  if (e < 1) c = mix3(c, e < 0.45 ? [196, 74, 50] : [214, 120, 84], 0.9);
  return c;
};
// Saturn: soft gold bands
SURFACES.saturn = (X, Y, Z, t = 0) => {
  const lat = Math.asin(Math.max(-1, Math.min(1, Y)));
  const [x2, z2] = turn(X, Z, t * 0.01);
  const v = Math.sin(lat * 11 + fbm(x2 * 2, Y * 7, z2 * 2, 47) * 1.2);
  const c = v > 0.35 ? [236, 214, 160] : v > -0.35 ? [220, 192, 136] : [198, 166, 112];
  return Math.abs(Y) > 0.88 ? mix3(c, [176, 168, 140], 0.6) : c;      // greyer poles
};
// Uranus: pale cyan, almost featureless (a faint brighter polar cap)
SURFACES.uranus = (X, Y, Z) => mix3([150, 214, 222], [190, 236, 238], clamp01((Y - 0.55) * 2.2) * 0.6 + fbm(X * 2, Y * 6, Z * 2, 53) * 0.12);
// Neptune: deep blue, a dark spot with a white cloud beside it, and white streaks drifting faster than the planet turns
SURFACES.neptune = (X, Y, Z, t = 0) => {
  const lat = Math.asin(Math.max(-1, Math.min(1, Y)));
  let c = mix3([34, 64, 180], [52, 98, 222], 0.5 + 0.5 * Math.sin(lat * 7 + fbm(X * 2, Y * 6, Z * 2, 59) * 2));
  const lon = lonOf(X, Z);
  const dl = Math.atan2(Math.sin(lon + 0.6), Math.cos(lon + 0.6)), dp = lat + 0.36;
  const e = (dl / 0.3) ** 2 + (dp / 0.13) ** 2;
  if (e < 1) c = mix3(c, [16, 28, 92], 0.85);                         // the dark spot
  else if (((dl - 0.05) / 0.16) ** 2 + ((dp + 0.17) / 0.05) ** 2 < 1) c = [236, 242, 255];   // its white companion
  const [x2, z2] = turn(X, Z, t * 0.06);
  const streak = fbm(x2 * 5, Y * 26, z2 * 5, 61);
  return mix3(c, [236, 242, 255], clamp01((streak - 0.64) * 5) * 0.9);
};
// Pluto: beige and grey, a dark equatorial patch, and the bright heart-shaped plain (Tombaugh Regio)
SURFACES.pluto = (X, Y, Z) => {
  let c = mix3([150, 138, 126], [218, 194, 164], fbm(X * 2.5, Y * 2.5, Z * 2.5, 67));
  const lon = lonOf(X, Z), lat = Math.asin(Math.max(-1, Math.min(1, Y)));
  // the heart faces away from Charon (Pluto keeps one face to Charon, at longitude 0 here), so it shows when Charon is behind
  const dl = Math.atan2(Math.sin(lon - Math.PI), Math.cos(lon - Math.PI));
  // the dark equatorial region to its west, with a ragged edge
  const dark = ((dl + 1.5) / 0.95) ** 2 + ((lat + 0.05) / 0.3) ** 2 + (fbm(X * 4, Y * 4, Z * 4, 69) - 0.5) * 1.6;
  if (dark < 1) c = mix3(c, [96, 66, 52], 0.8);
  // the heart: (x^2 + y^2 - 1)^3 - x^2 y^3 < 0, centred on the plain, about 60 degrees across
  const hx = dl / 0.5, hy = (lat - 0.32) / 0.42 + 0.15;
  if ((hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 < 0) c = mix3(c, [246, 238, 222], 0.9);
  return c;
};
// Charon: grey, with a dark red polar cap
SURFACES.charon = (X, Y, Z) => (Y > 0.75 ? mix3([120, 72, 56], [150, 140, 136], (1 - Y) * 3) : mix3([132, 128, 126], [176, 172, 170], fbm(X * 3, Y * 3, Z * 3, 71)));
const generic = (X, Y, Z) => mix3([120, 120, 130], [190, 190, 200], fbm(X * 3, Y * 3, Z * 3, 2));

/* ------------------------------------------------------------------ *
 *  Drawing
 * ------------------------------------------------------------------ */
let planet = null;                 // the planet object from js/planets.js
let orbitScale = 1;                // shrinks the orbits when the space around the planet is narrow
let stats = { labels: 0, placed: 0, skipped: 0, rects: [] };
let mode = 'wide';                 // 'wide' (callouts around the planet), 'list' or 'phone' (from solar.solarView())
let box = { left: 0, top: 0, k: 1 }; // where the buffer sits in the window: css px = left + buffer px * k
let obstacles = [];                // callout rects (css px): the floating names keep clear of them
let screen = { w: 1e9, h: 1e9 };   // the viewport (css px): names must stay on screen

// rotation-axis guides, in planet radii: the axis runs this far from the centre (25% of the diameter past each pole),
// the angle arc and the spin arrow sit around its upper end
const AXIS_EXT = 1.5, ARC_R = 1.3, ARROW_S = 1.25, ARROW_R = 0.35;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// the planet's frame in screen space: x right, y down, z towards the viewer
function frameFor(p) {
  const tau = (p.axialTilt * Math.PI) / 180;
  const a = [Math.sin(tau) * Math.cos(SUN_PITCH), -Math.cos(tau) * Math.cos(SUN_PITCH), Math.sin(SUN_PITCH)];   // spin axis
  const b = norm(cross(a, [0, 0, 1]));
  const c = cross(a, b);
  return { a, b, c };
}

function bodiesFor(p) {
  const list = [];
  (p.moons || []).forEach((name, i) => list.push(Object.assign({ name, kind: 'moon', orbit: 2.4 + i * 0.4, period: 20 + i * 9, r: 3, incl: 3 * i, node: 40 * i, color: [190, 190, 196] }, ORBITS[name] || {})));
  (p.satellites || []).forEach((name, i) => list.push(Object.assign({ name, kind: 'sat', orbit: 1.2 + i * 0.12, period: 8 + i * 2, incl: 20 * i, node: 70 * i, sprite: 'plus' }, ORBITS[name] || {})));
  return list;
}

function shade(n, L) {
  const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  return d > 0.28 ? 1 : d > 0.02 ? 0.74 : d > -0.2 ? 0.46 : 0.22;     // lit, soft terminator, terminator, dark side
}

// a planet's sphere, centred at (ox, oy) in the buffer, turning about its axis (surface from SURFACES)
function drawSphere(id, ox, oy, fr, L, t) {
  const surf = SURFACES[id] || generic;
  const spin = -(TAU * t) / (SPIN_S[id] || 90);                        // negative so the surface moves left to right (west to east)
  const cs = Math.cos(spin), sn = Math.sin(spin);
  for (let y = -PR; y <= PR; y++) {
    for (let x = -PR; x <= PR; x++) {
      const dx = (x + 0.5) / PR, dy = (y + 0.5) / PR, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const n = [dx, dy, Math.sqrt(1 - d2)];
      const nb = n[0] * fr.b[0] + n[1] * fr.b[1] + n[2] * fr.b[2];
      const na = n[0] * fr.a[0] + n[1] * fr.a[1] + n[2] * fr.a[2];
      const nc = n[0] * fr.c[0] + n[1] * fr.c[1] + n[2] * fr.c[2];
      const col = surf(nb * cs - nc * sn, na, nb * sn + nc * cs, t);
      const k = shade(n, L);
      put(ox + x, oy + y, rgb(col[0] * k, col[1] * k, col[2] * k));
    }
  }
}

function drawBody(b, sx, sy, scale, L, t) {
  if (b.kind === 'moon') {
    const R = b.r * scale, surf = SURFACES[b.name.toLowerCase()];     // a big moon (Charon) gets its own surface
    for (let y = -Math.ceil(R); y <= Math.ceil(R); y++) for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) {
      const dx = (x + 0.5) / R, dy = (y + 0.5) / R, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2), k = shade([dx, dy, nz], L), col = surf ? surf(dx, -dy, nz) : b.color;
      put(sx + x, sy + y, rgb(col[0] * k, col[1] * k, col[2] * k));
    }
    return R;
  }
  const px = SPRITES[b.sprite] || SPRITES.plus;
  const glint = 0.8 + 0.2 * Math.sin(t * 5 + b.orbit * 9);
  for (const [dx, dy] of px) put(sx + dx, sy + dy, rgb(240 * glint, 240 * glint, 246 * glint));
  return 2;
}

// rings in the planet's equator plane (RINGS), drawn per pixel: for each pixel, the point of the ring plane under it. Its
// depth decides whether it is behind the planet (front = false, drawn first, so the sphere hides it) or in front of it.
// A ring pixel whose line towards the sun passes through the planet is in the planet's shadow.
let ringMask = new Uint8Array(BUF * BUF);       // ring pixels: floating names keep off them
function drawRings(id, ox, oy, fr, L, front) {
  const spec = RINGS[id];
  if (!spec) return;
  const a = fr.a, rOut = ringOuter(id), ext = Math.ceil(rOut * PR) + 1;
  for (let y = -ext; y <= ext; y++) {
    for (let x = -ext; x <= ext; x++) {
      const dx = (x + 0.5) / PR, dy = (y + 0.5) / PR;
      const z = -(a[0] * dx + a[1] * dy) / a[2];                      // on the ring plane (a . P = 0)
      if ((z >= 0) !== front) continue;
      const rho = Math.hypot(dx, dy, z);
      const band = spec.bands.find(([r0, r1]) => rho >= r0 && rho < r1);
      if (!band) continue;
      const bd = dx * L[0] + dy * L[1] + z * L[2], cc = rho * rho - 1, disc = bd * bd - cc;
      const inShadow = disc > 0 && -bd + Math.sqrt(disc) > 0 && -bd - Math.sqrt(disc) > 0;
      const grain = 0.88 + 0.12 * Math.sin(rho * 90);                 // fine ringlets
      const k = (inShadow ? 0.32 : 1) * grain;
      put(ox + x, oy + y, rgb(band[2][0] * k, band[2][1] * k, band[2][2] * k));
      const xi = Math.round(ox + x), yi = Math.round(oy + y);
      if (xi >= 0 && yi >= 0 && xi < BUF && yi < BUF) ringMask[yi * BUF + xi] = 1;
    }
  }
}

// Arrokoth (the Kuiper belt's close-up): two flattened lobes joined at a narrow neck, reddish, tumbling slowly
const ARROKOTH_LOBES = [{ o: -0.42, r: 0.64 }, { o: 0.62, r: 0.46 }];
function drawArrokoth(L, t) {
  const c0 = BUF / 2, ang = (TAU * t) / SPIN_S['kuiper-belt'] + 0.4, ca = Math.cos(ang), sa = Math.sin(ang);
  const ext = Math.ceil(1.15 * PR);
  for (let y = -ext; y <= ext; y++) {
    for (let x = -ext; x <= ext; x++) {
      const u = ((x + 0.5) * ca + (y + 0.5) * sa) / PR, v = (-(x + 0.5) * sa + (y + 0.5) * ca) / PR;
      let best = null;
      ARROKOTH_LOBES.forEach((lb, li) => {
        const du = u - lb.o, q = (du * du + v * v) / (lb.r * lb.r);
        if (q > 1) return;
        const flat = 0.6 * lb.r, z = flat * Math.sqrt(1 - q);
        if (!best || z > best.z) best = { z, du, v, r: lb.r, flat, li };
      });
      if (!best) continue;
      // the ellipsoid's normal, turned back into the picture
      const nu = best.du / (best.r * best.r), nv = best.v / (best.r * best.r), nz = best.z / (best.flat * best.flat);
      const n = norm([nu * ca - nv * sa, nu * sa + nv * ca, nz]);
      const k = shade(n, L);
      const mott = fbm(u * 3 + best.li * 7, v * 3, best.z * 3, 73);
      const col = mix3([150, 78, 62], [196, 118, 92], mott);
      put(c0 + x, c0 + y, rgb(col[0] * k, col[1] * k, col[2] * k));
    }
  }
}

// the rotation axis and its guides, in buffer px (x right, y down, z towards the viewer). Points behind the disc are left out.
// The axis is tilted from vertical by the real axial tilt (the orbital plane's normal is vertical on screen); its north end
// is tipped towards the viewer, so for Venus (177.4 degrees) the north pole is at the bottom.
function guidesFor(fr, ox = BUF / 2, oy = BUF / 2) {
  const c0 = ox, a = fr.a;
  const at = (s) => [ox + s * a[0], oy + s * a[1], s * a[2]];
  const hidden = (x, y, z) => z < 0 && Math.hypot(x - ox, y - oy) < PR + 0.5;
  const axis = [];
  for (let s = -AXIS_EXT * PR; s <= AXIS_EXT * PR; s += 0.5) {
    if (Math.abs(s) < PR) continue;                                   // inside the planet
    const [x, y, z] = at(s);
    if (!hidden(x, y, z) && Math.floor((s + 200) / 2) % 2 === 0) axis.push([x, y]);   // dashed
  }
  const L = AXIS_EXT * PR * Math.hypot(a[0], a[1]);                   // the axis's length on screen, centre to end
  const vref = [];
  for (let s = PR + 2; s <= L; s += 2) vref.push([ox, oy - s]);       // faint vertical reference (dotted)
  const ang = Math.atan2(a[0], -a[1]);                                // north end, clockwise from straight up
  const arc = [];
  const steps = Math.max(1, Math.ceil(Math.abs(ang) * ARC_R * PR / 2));
  for (let i = 0; i <= steps; i++) {
    const th = (ang * i) / steps;
    arc.push([ox + ARC_R * PR * Math.sin(th), oy - ARC_R * PR * Math.cos(th)]);
  }
  // the spin arrow: about 270 degrees of a small circle around the upper end of the axis, open at the back. It turns the
  // same way as the surface (counter-clockwise seen from the north pole), so on Venus it points the other way.
  const C = at((a[1] < 0 ? 1 : -1) * ARROW_S * PR), rho = ARROW_R * PR;
  const ring = [], ph0 = Math.atan2(fr.c[2], fr.b[2]);                // ph0: the point nearest the viewer
  const P = (ph) => [0, 1, 2].map((k) => C[k] + rho * (Math.cos(ph) * fr.b[k] + Math.sin(ph) * fr.c[k]));
  for (let ph = ph0 - 2.36; ph <= ph0 + 2.36; ph += 0.03) {
    const p = P(ph);
    if (!hidden(p[0], p[1], p[2])) ring.push([p[0], p[1]]);
  }
  const phE = ph0 + 2.36, tip = P(phE);
  let tx = -Math.sin(phE) * fr.b[0] + Math.cos(phE) * fr.c[0], ty = -Math.sin(phE) * fr.b[1] + Math.cos(phE) * fr.c[1];
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const head = [];
  for (let k = 1; k <= 3; k++) head.push([tip[0] - tx * k - ty * k, tip[1] - ty * k + tx * k], [tip[0] - tx * k + ty * k, tip[1] - ty * k - tx * k]);
  const north = at(AXIS_EXT * PR + 5);
  return { c0, ox, oy, a, axis, vref, arc, ang, ring, head, tip, north, ends: [at(AXIS_EXT * PR), at(-AXIS_EXT * PR)] };
}

let guideMask = new Uint8Array(BUF * BUF);       // pixels covered by the guides: floating names keep off them
function drawGuides(g, onStar = false) {
  guideMask = new Uint8Array(BUF * BUF);
  const mark = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= BUF || y >= BUF) return;
    buf[y * BUF + x] = c; guideMask[y * BUF + x] = 1;
  };
  g.vref.forEach(([x, y]) => mark(x, y, rgb(96, 98, 116)));
  g.arc.forEach(([x, y], i) => { if (i % 2 === 0) mark(x, y, rgb(200, 200, 214)); });
  g.axis.forEach(([x, y]) => mark(x, y, rgb(236, 236, 244)));
  const arrowC = onStar ? rgb(110, 40, 10) : rgb(255, 206, 110);      // on the Sun's bright face the arrow goes dark
  g.ring.forEach(([x, y]) => mark(x, y, arrowC));
  g.head.forEach(([x, y]) => mark(x, y, arrowC));
  mark(g.tip[0], g.tip[1], arrowC);
  const nx = Math.round(g.north[0] - 2), ny = Math.round(g.north[1] - 2);
  for (let y = ny - 1; y <= ny + 5; y++) for (let x = nx - 1; x <= nx + 4; x++) mark(x, y, 0xff000000);
  drawText('N', nx, ny, rgb(255, 255, 255));
}

/* ------------------------------------------------------------------ *
 *  The Sun: emissive, boiling granulation, sunspots, differential rotation, prominences
 * ------------------------------------------------------------------ */
// sunspots in the Sun's own frame (degrees); they are carried round at the rotation rate of their latitude
const SUNSPOTS = [[14, 20, 0.12], [-17, 95, 0.09], [11, 140, 0.07], [22, 190, 0.08], [-9, 262, 0.11], [27, 318, 0.07]].map(([lat, lon, r]) => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return { v: [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)], r, sinLat: Math.sin(la) };
});
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SUN_LEVELS = [[255, 244, 186], [255, 214, 80], [255, 168, 38], [226, 108, 20]];
function drawStar(p, fr, t) {
  const c0 = BUF / 2, w0 = -(TAU * t) / SPIN_S.sun;
  for (let y = -PR; y <= PR; y++) {
    for (let x = -PR; x <= PR; x++) {
      const dx = (x + 0.5) / PR, dy = (y + 0.5) / PR, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const nb = dx * fr.b[0] + dy * fr.b[1] + nz * fr.b[2], na = dx * fr.a[0] + dy * fr.a[1] + nz * fr.a[2], nc = dx * fr.c[0] + dy * fr.c[1] + nz * fr.c[2];
      // differential rotation: the equator turns about 35% faster than the poles
      const sp = w0 * (1 - 0.35 * na * na), cs = Math.cos(sp), sn = Math.sin(sp);
      const X = nb * cs - nc * sn, Y = na, Z = nb * sn + nc * cs;
      // granulation: bright cells with darker lanes, the cells drifting slowly so the surface boils
      const cell = cells(X * 13 + t * 0.05, Y * 13 - t * 0.04, Z * 13 + t * 0.03, 61);
      let b = (1 - Math.min(1, cell * 1.1)) * 0.35 + 0.65;
      b *= 0.5 + 0.5 * Math.pow(nz, 0.7);                            // limb darkening
      const dither = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5;
      let col = SUN_LEVELS[Math.max(0, Math.min(3, Math.floor((1 - b) * 4.4 + 0.55 + dither)))];
      for (const s of SUNSPOTS) {
        const ang = Math.acos(Math.max(-1, Math.min(1, X * s.v[0] + Y * s.v[1] + Z * s.v[2])));
        if (ang < s.r * 0.5) { col = [70, 26, 8]; break; }
        if (ang < s.r) { col = [168, 72, 16]; break; }
      }
      put(c0 + x, c0 + y, rgb(col[0], col[1], col[2]));
    }
  }
  // prominences: every so often a 1 to 2 pixel loop arcs off the edge, rises and fades (two staggered cycles)
  for (const [period, off, seed] of [[5.2, 0, 7], [6.8, 2.9, 19]]) {
    const k = Math.floor((t + off) / period), f = ((t + off) % period) / period;
    if (f > 0.75) continue;
    const life = Math.sin((Math.PI * f) / 0.75), th = hash3(k, seed, 3, 5) * TAU, span = 0.1 + hash3(k, seed, 4, 5) * 0.08;
    const h = PR * (0.1 + 0.1 * hash3(k, seed, 5, 5)) * life;
    const c = rgb(255, 120 + 60 * life, 40);
    for (let u = 0; u <= 1; u += 0.01) {
      const a = th - span + 2 * span * u, rad = PR + h * Math.sin(Math.PI * u);
      if (rad < PR + 1) continue;
      put(c0 + Math.cos(a) * rad, c0 + Math.sin(a) * rad, c);
      if (h > 4) put(c0 + Math.cos(a) * (rad - 1), c0 + Math.sin(a) * (rad - 1), c);   // 2 px thick once it has risen
    }
  }
}

/* ------------------------------------------------------------------ *
 *  The asteroid belt: Ceres in the middle of a slice of tumbling rocks; Vesta, Pallas and Hygiea named
 * ------------------------------------------------------------------ */
let seedA = 23;
const randA = () => (seedA = (seedA * 1664525 + 1013904223) >>> 0) / 4294967296;
const FIELD = Array.from({ length: 72 }, () => {
  const z = randA() * 2 - 1;                                          // depth: -1 far, +1 near
  return { x0: randA(), y: (randA() * 2 - 1) * 1.6 * PR * (0.55 + 0.45 * randA()), z, r: (1.2 + randA() * 2.6) * (0.75 + 0.35 * z),
    vx: (0.5 + randA() * 1.4) * (1.1 + 0.6 * z), spin: (randA() * 2 - 1) * 1.6, seed: Math.floor(randA() * 1000), tone: 0.8 + randA() * 0.35 };
});
// the named rocks: home direction (radians, from the right, clockwise) and distance in planet radii, size in art pixels;
// stretch makes a rock long (Haumea), color overrides the belt's rock colour
const MEMBERS = {
  Vesta: { a: -0.55, d: 1.95, r: 6, spin: 0.5, seed: 3 }, Pallas: { a: 0.35, d: 1.9, r: 5.2, spin: -0.7, seed: 8 }, Hygiea: { a: 0.75, d: 1.85, r: 4.4, spin: 0.9, seed: 13 },
  Haumea: { a: -0.6, d: 1.9, r: 5.5, spin: 0.9, seed: 17, stretch: 1.9, color: [226, 232, 242] },
  Makemake: { a: 0.55, d: 1.95, r: 5, spin: -0.4, seed: 19, color: [214, 170, 140] },
};
const ICY = [176, 196, 222];        // the Kuiper belt's field: icy rocks
let fieldRange = [0, BUF];          // where rocks may drift (buffer x): inside the right half, never behind the bio
let lastMembers = [];               // the named rocks as drawn last (css px), for the leader lines

// an irregular, tumbling pixel rock, lit from the sun's side
function rock(cx, cy, r, ang, seed, L, tone, bright, col = [138, 128, 116], stretch = 1) {
  const R = Math.ceil(r * 1.35 * stretch);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    // a long rock: squash the x axis of its own (turning) frame
    const ca = Math.cos(ang), sa = Math.sin(ang), lx = (x * ca + y * sa) / stretch, ly = -x * sa + y * ca;
    const d = Math.hypot(lx, ly);
    if (d > r * 1.35) continue;
    const phi = Math.atan2(ly, lx);
    const edge = r * (0.72 + 0.5 * vnoise(Math.cos(phi) * 1.4 + 5, Math.sin(phi) * 1.4 + 5, seed, 71));
    if (d > edge) continue;
    const lit = (x * L[0] + y * L[1]) / (Math.hypot(x, y) || 1) * Math.min(1, d / (edge * 0.6)) + L[2] * 0.6;
    const k = (lit > 0.45 ? 1 : lit > 0 ? 0.7 : 0.42) * bright;
    put(cx + x, cy + y, rgb(col[0] * tone * k, col[1] * tone * k, col[2] * tone * k));
  }
}
function memberPos(name, t, i) {
  const m = MEMBERS[name], c0 = BUF / 2, dd = PR * (1 + (m.d - 1) * orbitScale);
  const bob = 2.2 * Math.sin((TAU * t) / (8 + i * 1.7) + i);
  return { x: c0 + Math.cos(m.a) * dd + bob * 0.6, y: c0 + Math.sin(m.a) * dd + bob, m };
}
// the field of rocks drifting past (front = the near half): grey rocks for the asteroid belt, icy ones for the Kuiper belt,
// nearer ones bigger and brighter
function drawField(front, t, L) {
  const span = fieldRange[1] - fieldRange[0], icy = planet.id === 'kuiper-belt';
  for (const a of FIELD) {
    if ((a.z >= 0) !== front) continue;
    const x = fieldRange[0] + ((((a.x0 * span + a.vx * t) % span) + span) % span);
    rock(x, BUF / 2 + a.y, icy ? a.r * 0.8 : a.r, a.spin * t, a.seed, L, a.tone, 0.55 + 0.35 * (a.z + 1) / 2 + 0.1, icy ? ICY : undefined);
  }
}

// Pluto's offset from the shared point (buffer px, with depth): opposite Charon, PLUTO_WOBBLE radii out
function plutoOffset(items) {
  const ch = items.find((it) => it.b.name === 'Charon');
  if (!ch) return [0, 0, 0];
  const l = Math.hypot(ch.P[0], ch.P[1], ch.P[2]) || 1, k = -(PLUTO_WOBBLE * PR) / l;
  return [ch.P[0] * k, ch.P[1] * k, ch.P[2] * k];
}

function render(t, view) {
  buf.fill(0);                                           // transparent: the gradient behind shows through
  ringMask.fill(0);
  const L = norm(view.light || [0.6, 0.45, 0.65]);
  const fr = frameFor(planet);
  const c0 = BUF / 2;
  const items = orbitItems(fr, t);
  const kuiper = planet.id === 'kuiper-belt';
  // Pluto circles the shared point with Charon (the middle of the view), so its centre moves
  const wob = planet.id === 'pluto' ? plutoOffset(items) : [0, 0, 0];
  const ox = c0 + wob[0], oy = c0 + wob[1];
  const g = kuiper ? null : guidesFor(fr, ox, oy);
  const toBuf = (r) => [(r.x - box.left) / box.k, (r.y - box.top) / box.k, r.w / box.k, r.h / box.k];
  const blocked = obstacles.map(toBuf);

  // orbit lines (dotted, round the middle of the view): the part behind the planet first, the part in front of it after
  const lines = (front) => {
    for (const it of items) {
      for (let k = 0; k < 140; k += 2) {
        const P = it.at((k / 140) * TAU);
        if ((P[2] >= wob[2]) !== front) continue;
        const d = clamp01(0.45 + 0.55 * (P[2] / it.r * 0.5 + 0.5));
        put(c0 + P[0], c0 + P[1], rgb(86 * d, 92 * d, 112 * d));
      }
    }
  };
  const drawn = [];
  const bodiesPass = (front) => {
    items.filter((it) => (it.P[2] >= wob[2]) === front).sort((p, q) => p.P[2] - q.P[2]).forEach((it) => {
      const scale = 1 + 0.18 * (it.P[2] / (it.r || 1));
      const sx = c0 + it.P[0], sy = c0 + it.P[1];
      const rad = drawBody(it.b, sx, sy, scale, L, t);
      const over = Math.hypot(sx - ox, sy - oy) < PR + rad, behind = it.P[2] < wob[2] && over;   // hidden behind the planet: no name
      if (!behind) drawn.push({ name: it.b.name, x: sx, y: sy, r: rad, onFace: over });     // crossing its face: the name may sit on it
    });
  };
  lines(false); bodiesPass(false);
  if (planet.kind === 'belt') drawField(false, t, L);
  drawRings(planet.id, ox, oy, fr, L, false);
  if (planet.kind === 'star') drawStar(planet, fr, t);
  else if (kuiper) drawArrokoth(L, t);
  else drawSphere(planet.id, ox, oy, fr, L, t);
  drawRings(planet.id, ox, oy, fr, L, true);
  if (g) drawGuides(g, planet.kind === 'star'); else guideMask = new Uint8Array(BUF * BUF);
  if (wob[0] || wob[1]) {                                // the shared point Pluto and Charon circle: a faint "+"
    for (let d = -2; d <= 2; d++) { put(c0 + d, c0, rgb(150, 150, 170)); put(c0, c0 + d, rgb(150, 150, 170)); }
  }
  lines(true); bodiesPass(true);
  if (planet.kind === 'belt') {
    drawField(true, t, L);
    lastMembers = (planet.members || []).map((name, i) => {
      const p = memberPos(name, t, i);
      rock(p.x, p.y, p.m.r, p.m.spin * t, p.m.seed, L, 1.05, 1, p.m.color, p.m.stretch);
      drawn.push({ name, x: p.x, y: p.y, r: p.m.r * (p.m.stretch || 1) });             // named like the moons
      return { name, x: box.left + p.x * box.k, y: box.top + p.y * box.k, r: p.m.r * (p.m.stretch || 1) * box.k };
    });
  }

  // names float just above each body and move with it; they never overlap each other, the planet, its rings, the axis
  // guides or the callouts around the planet (the callouts keep their places: the names move out of their way)
  const rects = [], LABEL = rgb(232, 232, 240);
  stats = { labels: drawn.length, placed: 0, skipped: 0, rects: [], angle: null, skippedNames: [] };
  const hitsPlanet = (x0, y0, w, h) => {
    const nx = Math.max(x0, Math.min(ox, x0 + w)), ny = Math.max(y0, Math.min(oy, y0 + h));
    return Math.hypot(nx - ox, ny - oy) < PR * (kuiper ? 1.1 : 1) + 1;
  };
  const hitsGuides = (x0, y0, w, h) => {
    for (let y = Math.max(0, y0); y < Math.min(BUF, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(BUF, x0 + w); x++) if (guideMask[y * BUF + x] || ringMask[y * BUF + x]) return true;
    return false;
  };
  // on screen (8 css px in from the edges), off the planet and the guides, and 2 px clear of other names and the callouts
  const sx0 = (8 - box.left) / box.k, sx1 = (screen.w - 8 - box.left) / box.k, sy0 = (8 - box.top) / box.k, sy1 = (screen.h - 8 - box.top) / box.k;
  const free = (x0, y0, w, h, onFace = false) => x0 - 1 >= sx0 && x0 + w + 1 <= sx1 && y0 - 1 >= sy0 && y0 + h + 1 <= sy1
    && (onFace || !hitsPlanet(x0 - 1, y0 - 1, w + 2, h + 2)) && !hitsGuides(x0 - 1, y0 - 1, w + 2, h + 2)
    && !rects.concat(blocked).some((r) => x0 - 2 < r[0] + r[2] && x0 + w + 2 > r[0] && y0 - 2 < r[1] + r[3] && y0 + h + 2 > r[1]);

  // without callouts around the planet (narrow screens), the angle arc gets its own small label
  if (mode !== 'wide' && g) {
    const str = String(planet.axialTilt) + '°', w = textW(str), h = 5;
    // beside the middle of the arc if there is room, otherwise further along it (Venus's arc runs down the whole side)
    const spots = [];
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
      for (const r of [ARC_R * PR + 4, ARC_R * PR - 3]) {
        const ax = ox + r * Math.sin(g.ang * f), ay = oy - r * Math.cos(g.ang * f);
        spots.push([ax + 2, ay - h / 2], [ax - w / 2, ay - h - 2], [ax - w - 2, ay - h / 2], [ax + 2, ay - h - 2], [ax - w / 2, ay + 3]);
      }
    }
    const spot = spots.map(([x, y]) => [Math.round(x), Math.round(y)]).find(([x, y]) => x >= 1 && y >= 1 && x + w < BUF - 1 && y + h < BUF - 1 && free(x, y, w, h));
    if (spot) {
      for (let y = spot[1] - 1; y <= spot[1] + h; y++) for (let x = spot[0] - 1; x <= spot[0] + w; x++) put(x, y, 0xff000000);
      drawText(str, spot[0], spot[1], rgb(255, 255, 255));
      rects.push([spot[0], spot[1], w, h]);
      stats.angle = str;
    }
  }

  for (const d of drawn) {
    const w = textW(d.name), h = 5, gap = d.r + 4;
    const spots = [[d.x - w / 2, d.y - gap - h], [d.x - w / 2, d.y + gap], [d.x + gap, d.y - 2], [d.x - gap - w, d.y - 2], [d.x + gap * 0.7, d.y - gap * 0.7 - h], [d.x - gap * 0.7 - w, d.y - gap * 0.7 - h],
      [d.x + gap * 0.7, d.y + gap * 0.7], [d.x - gap * 0.7 - w, d.y + gap * 0.7],
      [d.x - w + 3, d.y - gap - h], [d.x - w + 3, d.y + gap], [d.x - 3, d.y - gap - h], [d.x - 3, d.y + gap]];        // above or below, shifted sideways
    for (const k of [2, 3, 4]) spots.push([d.x - w / 2, d.y - gap * k - h], [d.x - w / 2, d.y + gap * k], [d.x + gap * k, d.y - 2], [d.x - gap * k - w, d.y - 2]);   // then farther out
    const ok = ([x0, y0]) => {
      x0 = Math.round(x0); y0 = Math.round(y0);
      if (x0 < 1 || y0 < 1 || x0 + w > BUF - 1 || y0 + h > BUF - 1) return false;
      return free(x0, y0, w, h, d.onFace);
    };
    let spot = spots.find(ok), far = false;
    // still nowhere: the nearest clear spot further out, joined to the body by a dotted leader
    for (let dist = gap * 2; !spot && dist <= gap + 70; dist += 3) {
      for (let k = 0; k < 24 && !spot; k++) {
        const th = (k / 24) * TAU - Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
        const cand = [d.x + c * (dist + (w / 2) * Math.abs(c)) - w / 2, d.y + sn * (dist + (h / 2) * Math.abs(sn)) - h / 2];
        if (ok(cand)) { spot = cand; far = true; }
      }
    }
    if (!spot) { stats.skipped++; stats.skippedNames.push(d.name); continue; }
    const x0 = Math.round(spot[0]), y0 = Math.round(spot[1]);
    if (far) {
      const tx = Math.max(x0, Math.min(d.x, x0 + w)), ty = Math.max(y0, Math.min(d.y, y0 + h)), len = Math.hypot(tx - d.x, ty - d.y);
      for (let i = Math.ceil(d.r) + 2; i < len - 1; i += 2) put(d.x + ((tx - d.x) * i) / len, d.y + ((ty - d.y) * i) / len, rgb(150, 154, 170));
    }
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) put(x, y, 0xff000000);
    drawText(d.name, x0, y0, LABEL);
    rects.push([x0, y0, w, h]);
    stats.rects.push({ name: d.name, x: box.left + (x0 - 1) * box.k, y: box.top + (y0 - 1) * box.k, w: (w + 2) * box.k, h: (h + 2) * box.k });
    stats.placed++;
  }
  lastWobble = wob;
  ctx.putImageData(img, 0, 0);
}
let lastWobble = [0, 0, 0];

// moons and satellites on tilted ellipses in the planet's equatorial frame, at time t
function orbitItems(fr, t) {
  const base = squeezeBase(planet.id);
  return bodiesFor(planet).map((b, i) => {
    const node = (b.node * Math.PI) / 180, inc = (b.incl * Math.PI) / 180;
    const u = [0, 1, 2].map((k) => Math.cos(node) * fr.b[k] + Math.sin(node) * fr.c[k]);
    const w = [0, 1, 2].map((k) => Math.cos(inc) * (-Math.sin(node) * fr.b[k] + Math.cos(node) * fr.c[k]) + Math.sin(inc) * fr.a[k]);
    // the squeeze only shrinks the gap beyond `base` (the surface, the rings, or Pluto's own circle), never into it
    const r = PR * (b.orbit > base ? base + (b.orbit - base) * orbitScale : b.orbit);
    const spinT = (TAU * t) / (SPIN_S[planet.id] || 90);
    const theta = b.geo ? Math.PI / 2 + spinT : (b.phase0 || i * 2.1) + (TAU * t) / b.period;
    const at = (th) => [0, 1, 2].map((k) => r * (Math.cos(th) * u[k] + Math.sin(th) * w[k]));
    return { b, at, P: at(theta), r };
  });
}

// where the planet, its axis guides and its moon orbits are, in css px relative to the window (the callouts are laid out from
// this). For Pluto, which circles the shared point with Charon, the guides are where they are now (`sweep` holds every
// place they pass through, so callouts keep clear of all of them) and `moving` asks for leaders that follow.
function geometry(t = 0) {
  if (!planet) return null;
  const fr = frameFor(planet), c0 = BUF / 2, kuiper = planet.id === 'kuiper-belt';
  const items = orbitItems(fr, t), wob = planet.id === 'pluto' ? plutoOffset(items) : [0, 0, 0];
  const css = ([x, y]) => ({ x: box.left + x * box.k, y: box.top + y * box.k });
  const bbox = (pts) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + box.k, h: Math.max(...ys) - Math.min(...ys) + box.k };
  };
  const centre = css([c0, c0]);
  // the Kuiper belt's Arrokoth has no axis drawn: its guides collapse onto the middle
  const g = kuiper ? null : guidesFor(fr, c0 + wob[0], c0 + wob[1]);
  const arc = g ? g.arc.map(css) : [centre], ring = g ? g.ring.concat(g.head, [g.tip]).map(css) : [centre];
  const orbits = items.filter((it) => it.b.kind === 'moon').map((it) => ({
    name: it.b.name, r: it.r * box.k,
    points: Array.from({ length: 96 }, (_, k) => it.at((k / 96) * TAU)).map((P) => css([c0 + P[0], c0 + P[1]])),
  }));
  const ends = g ? g.ends.map(css) : [centre, centre], north = g ? css(g.north) : centre;
  const swept = PR * (planet.id === 'pluto' ? 1 + PLUTO_WOBBLE : kuiper ? 1.15 : 1);
  const guides = [...ends, north, ...ring, ...arc, { x: centre.x, y: centre.y - swept * box.k }, { x: centre.x, y: centre.y + swept * box.k }];
  if (g) guides.push(css([g.ox, g.oy - AXIS_EXT * PR * Math.hypot(g.a[0], g.a[1])]));
  // everything the guides pass through while Pluto circles (12 places round its circle)
  const sweep = [];
  if (planet.id === 'pluto') {
    for (let k = 0; k < 12; k++) {
      const th = (k / 12) * TAU, o = [0, 1, 2].map((q) => PLUTO_WOBBLE * PR * (Math.cos(th) * fr.b[q] + Math.sin(th) * fr.c[q]));
      const gk = guidesFor(fr, c0 + o[0], c0 + o[1]);
      for (const p of gk.arc.concat(gk.ring, gk.head, [gk.north], gk.ends.map((e) => [e[0], e[1]]))) sweep.push(css(p));
    }
  }
  // the rings' outline (callouts keep off it)
  const ringPts = [];
  if (RINGS[planet.id]) {
    const R = ringOuter(planet.id) * PR;
    for (let k = 0; k < 72; k++) { const th = (k / 72) * TAU; ringPts.push(css([c0 + R * (Math.cos(th) * fr.b[0] + Math.sin(th) * fr.c[0]), c0 + R * (Math.cos(th) * fr.b[1] + Math.sin(th) * fr.c[1])])); }
  }
  const all = guides.concat(sweep, ringPts);
  return {
    disc: { x: centre.x, y: centre.y, r: swept * box.k },
    body: { x: box.left + (c0 + wob[0]) * box.k, y: box.top + (c0 + wob[1]) * box.k, r: PR * box.k },   // the disc itself, where it is now
    axis: { x1: ends[0].x, y1: ends[0].y, x2: ends[1].x, y2: ends[1].y },
    north, arc, arcBox: bbox(arc), arcMid: arc[Math.floor(arc.length / 2)], angle: g ? g.ang : 0,
    arrow: ring, arrowBox: bbox(ring), sweep, ringPts, moving: planet.id === 'pluto', noAxis: !g,
    top: Math.min(...all.map((p) => p.y)), bottom: Math.max(...all.map((p) => p.y)),
    orbits, outer: Math.max(0, ...items.map((it) => it.r), ringOuter(planet.id) * PR, ...(planet.members || []).map((n, i) => { const p = memberPos(n, 0, i); return Math.hypot(p.x - c0, p.y - c0) + p.m.r * (p.m.stretch || 1) + 3; })) * box.k,   // the outermost orbit (moons, satellites, rings, named rocks)
    members: lastMembers.length ? lastMembers.map((m) => Object.assign({}, m)) : (planet.members || []).map((n, i) => { const p = memberPos(n, 0, i); return { name: n, x: box.left + p.x * box.k, y: box.top + p.y * box.k, r: p.m.r * box.k }; }),
  };
}

/* ------------------------------------------------------------------ *
 *  Placement and loop
 * ------------------------------------------------------------------ */
let running = false, t0 = performance.now(), lastT = 12;

function place(view) {
  const px = view.PX, e = view.endState;
  const Rcss = e.R * px, cx = e.x * px, cy = e.y * px;
  const size = (BUF * Rcss) / PR;                                      // css size of the whole buffer (planet = 96 buffer px = 2 * Rcss)
  cv.style.width = cv.style.height = size + 'px';
  cv.style.left = cx - size / 2 + 'px';
  cv.style.top = cy - size / 2 + 'px';
  mode = view.mode;
  box = { left: cx - size / 2, top: cy - size / 2, k: size / BUF };
  screen = { w: view.cssW, h: view.cssH };
  // keep the orbits inside the screen; on the narrower layouts they also stay within the planet's own band, so they do not
  // run through the list of facts underneath
  let avail = Math.min(cx - 8, view.cssW - cx - 8, cy - 8, view.cssH - cy - 8);
  if (mode !== 'wide') avail = Math.min(avail, 1.6 * Rcss);
  const base = squeezeBase(planet.id);
  const maxOrbit = Math.max(base, ringOuter(planet.id), ...bodiesFor(planet).map((b) => b.orbit + (b.r || 2) / PR), ...(planet.members || []).map((n) => (MEMBERS[n] ? MEMBERS[n].d + (MEMBERS[n].r * (MEMBERS[n].stretch || 1)) / PR : 1)));
  // rocks drift across the whole window
  fieldRange = [Math.max(0, -box.left / box.k), Math.min(BUF, (view.cssW - box.left) / box.k)];
  // the outermost orbit must fit in `avail`: Rcss * (base + (maxOrbit - base) * scale) <= avail
  orbitScale = Math.min(1, Math.max(0.15, (avail / (Rcss * 1.06) - base) / Math.max(0.01, maxOrbit - base)));
}

function loop() {
  const view = solar.solarView();
  if (!view.id || !planet || view.id !== planet.id) { cv.style.opacity = '0'; running = false; return; }
  const op = Math.min(1, Math.max(0, (view.zoom - 0.75) / 0.25));
  cv.style.opacity = String(op);
  if (op > 0) {
    place(view);
    lastT = reduceMotion ? 12 : 12 + (performance.now() - t0) / 1000;
    render(lastT, view);
  }
  requestAnimationFrame(loop);
}

solar.addEventListener('planet-open', (ev) => {
  planet = (window.BODY_DATA || []).find((p) => p.id === ev.detail.id) || null;
  lastMembers = [];
  t0 = performance.now();
  if (planet && !running) { running = true; requestAnimationFrame(loop); }
});
solar.addEventListener('planet-close', () => { cv.style.opacity = '0'; });

window.planetView = {
  stats: () => stats,                                                   // floating names this frame (for tests)
  orbitScale: () => orbitScale,
  geometry: () => { if (!planet) return null; place(solar.solarView()); return geometry(lastT); },
  geometryNow: () => (planet ? geometry(lastT) : null),                // the guides where they are this frame (Pluto moves)
  setObstacles: (rects) => { obstacles = rects || []; },
  members: () => lastMembers.map((m) => Object.assign({}, m)),        // the belt's named rocks right now (css px)
};
})();
