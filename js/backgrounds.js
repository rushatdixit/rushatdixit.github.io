// Animated pixel backgrounds for the outer bodies' close-ups, read by js/bodies.js (loaded before it). Each renderer
// writes a w x h frame into `out` (a Uint32Array of 0xAABBGGRR pixels) for time t in seconds; opts gives the body's centre
// and radius in the same pixels and the direction of the light. Every frame fades to black towards the screen edges and
// stays dim (DIM), so the callouts over it stay readable; brightness is quantised with an ordered dither, like the rest.
(() => {
const DIM = 0.36;                  // the brightest a background gets, as a share of its colours
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgb = (r, g, b) => (0xff << 24) | (Math.min(255, b | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, r | 0);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the edge fade, cached per size: 1 in the middle, easing to 0 at the screen edges
let vig = null, vigKey = '';
function vignette(w, h) {
  const key = w + 'x' + h;
  if (key === vigKey) return vig;
  vig = new Float32Array(w * h);
  const m = 0.24 * Math.min(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) vig[y * w + x] = smooth(Math.min(x, w - 1 - x, y, h - 1 - y) / m);
  vigKey = key;
  return vig;
}
// write one pixel: colour c (0..255 each) at brightness k (0..1), dimmed, edge-faded and dithered into 8 steps
function put(out, x, y, i, c, k) {
  const q = Math.floor(k * vig[i] * 8 + (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16) / 8;
  out[i] = q <= 0 ? 0xff000000 : rgb(c[0] * q * DIM, c[1] * q * DIM, c[2] * q * DIM);
}

const CREAM = [244, 228, 196], TAN = [214, 166, 116], RUST = [184, 104, 66];
const B = {
  // Jupiter: huge, slow cloud bands in cream, tan and rust, drifting in alternating directions
  jupiter(out, t, w, h) {
    vignette(w, h);
    const bandH = Math.max(6, h / 7), cols = [CREAM, TAN, RUST];
    for (let y = 0; y < h; y++) {
      const wave = 4 * Math.sin(y * 0.05 + t * 0.05);
      const band = (y + wave) / bandH, bi = Math.floor(band), dir = bi & 1 ? 1 : -1, speed = 2 + ((bi * 7) % 5);
      for (let x = 0, i = y * w; x < w; x++, i++) {
        const u = x + dir * speed * t;
        const swirl = Math.sin(u * 0.045 + bi * 1.7) + 0.5 * Math.sin(u * 0.11 + y * 0.21 + bi);
        const c = cols[(((bi + (swirl > 0.7 ? 1 : 0)) % 3) + 3) % 3];
        put(out, x, y, i, c, 0.62 + 0.25 * Math.sin(u * 0.03 + bi));
      }
    }
  },
  // Saturn: the ring plane as a giant diagonal band of glittering pale-gold particles
  saturn(out, t, w, h) {
    vignette(w, h);
    const a = (-22 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), half = 0.2 * h, GOLD = [236, 212, 156];
    for (let y = 0; y < h; y++) {
      for (let x = 0, i = y * w; x < w; x++, i++) {
        const s = (x - w / 2) * ca + (y - h / 2) * sa, d = -(x - w / 2) * sa + (y - h / 2) * ca;     // along / across the band
        const across = Math.abs(d) / half;
        if (across > 1.3) { out[i] = 0xff000000; continue; }
        let k = 0.18 * (1 - smooth(across)) * (0.7 + 0.3 * Math.sin(d * 0.9));                         // the band's faint glow, with ringlets
        // glitter: at most one particle per 3 x 3 cell (at its own spot in the cell), each twinkling at its own pace
        const sm = s + t * 4, cx = Math.floor(sm / 3), cy = Math.floor(d / 3), hh = hash(cx, cy);
        if (hh < 0.45 * (1 - smooth(across - 0.2)) && Math.floor(sm - cx * 3) === Math.floor(hash(cx, cy + 7) * 3) && Math.floor(d - cy * 3) === Math.floor(hash(cx + 5, cy) * 3)) {
          k = Math.max(k, 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 + hh * 60)));
        }
        put(out, x, y, i, GOLD, k);
      }
    }
  },
  // Uranus: pale cyan haze with slow aurora shimmers
  uranus(out, t, w, h) {
    vignette(w, h);
    const HAZE = [150, 222, 230], AUR = [140, 250, 214];
    for (let y = 0; y < h; y++) {
      const top = 1 - smooth(y / (0.55 * h));
      for (let x = 0, i = y * w; x < w; x++, i++) {
        const curtain = 0.5 + 0.5 * Math.sin(x * 0.06 + 2 * Math.sin(t * 0.25 + x * 0.013));
        const aur = top * curtain * (0.55 + 0.45 * Math.sin(t * 0.7 + x * 0.02 + y * 0.03));
        const haze = 0.55 + 0.15 * Math.sin(y * 0.02 + t * 0.1);
        if (aur > haze) put(out, x, y, i, AUR, aur);
        else put(out, x, y, i, HAZE, haze);
      }
    }
  },
  // Neptune: deep blue with fast white wind streaks (the fastest winds in the solar system)
  neptune(out, t, w, h) {
    vignette(w, h);
    const DEEP = [40, 80, 220], WHITE = [226, 236, 255];
    for (let y = 0; y < h; y++) {
      const lane = Math.floor(y / 3), on = hash(lane, 7) < 0.55;
      const speed = 60 + 110 * hash(lane, 11), len = 10 + 30 * hash(lane, 13), period = 90 + 160 * hash(lane, 17), off = 999 * hash(lane, 19);
      for (let x = 0, i = y * w; x < w; x++, i++) {
        let k = 0.42 + 0.14 * Math.sin(y * 0.03 + x * 0.004), c = DEEP;
        if (on) {
          const p = (((x + speed * t + off) % period) + period) % period;
          if (p < len) { k = 0.35 + 0.65 * (p / len); c = WHITE; }                              // a streak, brightest at its head
        }
        put(out, x, y, i, c, k);
      }
    }
  },
  // Pluto and the Kuiper belt: icy pale blue round the body, fading to black, and the Sun as one tiny bright star
  icy(out, t, w, h, o) {
    vignette(w, h);
    const ICE = [168, 200, 236], cx = o ? o.cx : w / 2, cy = o ? o.cy : h / 2, far = 0.8 * Math.hypot(w, h);
    for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) put(out, x, y, i, ICE, 0.75 * (1 - smooth(Math.hypot(x - cx, y - cy) / far)));
    // the Sun, far away in the direction the light comes from
    const L = (o && o.light) || [0.6, -0.4, 0.6], n = Math.hypot(L[0], L[1]) || 1, m = 0.42 * Math.min(w, h);
    const sx = Math.round(Math.min(w - 4, Math.max(3, cx + (L[0] / n) * m * 1.6))), sy = Math.round(Math.min(h - 4, Math.max(3, cy + (L[1] / n) * m)));
    const tw = 0.85 + 0.15 * Math.sin(t * 2);
    out[sy * w + sx] = rgb(255 * tw, 252 * tw, 236 * tw);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out[(sy + dy) * w + sx + dx] = rgb(120, 116, 96);
  },
};
window.PIXEL_BACKGROUNDS = B;
})();
