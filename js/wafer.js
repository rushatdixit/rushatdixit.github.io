/* Silicon wafer for the hackerfab section: a WebGL2 ray-cast wafer with a cursor-following
 * iridescent sheen. The camera frames a box at the top of the section whose height follows the page width
 * (FRAME_ASPECT), so the wafer sits top-right at the same size relative to the width on any screen; the canvas
 * covers the whole section, however tall its text makes it. (wafer.html is an older, single-screen standalone preview of the same idea; it is not
 * kept in sync with this file.) Tune the look with the constants below. */
(() => {
/* ------------------------------------------------------------------ *
 *  Tuning
 * ------------------------------------------------------------------ */
const FRAME_ASPECT  = 1.6;       // the framed box at the top of the section: width / height (the canvas runs on below it)
const GLOW_RADIUS   = 0.65;      // core-to-halo radius in wafer radii; the fringe fades out by ~1.9x this
const EASE          = 0.10;      // glow lerp per frame toward the cursor (0.08-0.12 feels floaty)
const FADE          = 0.07;      // glow in/out speed when entering or leaving the wafer
const WAFER_TILT    = 50;        // degrees the far edge is tipped away from the viewer
const WAFER_ROLL    = -17;       // degrees the wafer is turned around its normal (the outline)
const GRID_ROTATION = 38;        // degrees the die lattice is rotated in wafer space (35-40 = diamond lattice)
const ATTRACT_SHIFT = 0.05;      // how far the wafer drifts toward the cursor (fraction of the half-viewport)
const ATTRACT_TILT  = 3;         // degrees the wafer leans toward the cursor vertically
const ATTRACT_YAW   = 3;         // degrees the wafer leans toward the cursor horizontally
const ATTRACT_EASE  = 0.045;     // how softly the wafer follows (lower = lazier)
const FOV           = 34;        // vertical field of view, degrees (lower = flatter perspective)
const WAFER_CENTER  = [1.016, 0.669]; // wafer centre as a fraction of the framed box's half-size (x right, y up): top-right, its
                                     // left edge about 57% across and its lowest point about 0.42 widths below the top
const WAFER_RADIUS  = 1.4;       // wafer radius in half-box heights at the wafer's distance
const DIE_SIZE      = [0.046, 0.040]; // die pitch (x, y) in wafer radii, a 1.15:1 die (~43 across)

const COLOR_CORE    = '#a6e4ea'; // tiny pale-aqua core
const COLOR_RING    = '#b9b5f3'; // lavender / periwinkle ring
const COLOR_HALO    = '#f19bd8'; // wide magenta / pink halo (the dominant hue)
const COLOR_FRINGE  = '#dcec9e'; // faint yellow-green fringe
const COLOR_FRINGE2 = '#ffd9bd'; // pale peach, the last fringe before the resting pearl

const COLOR_DIE     = '#d2e0f5'; // resting die: pale blue
const COLOR_SCRIBE  = '#e4eefa'; // resting scribe lines: near-white blue-grey

/* ------------------------------------------------------------------ *
 *  Shader
 * ------------------------------------------------------------------ */
const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uSpan;               // the canvas height in framed boxes
uniform float uAspect;             // width / height of the framed box
uniform float uTan;
uniform vec3  uC, uU, uV, uN;      // wafer centre and plane basis (camera space)
uniform float uR;                  // wafer radius (camera-space units)
uniform vec2  uLight;              // glow centre in wafer coordinates
uniform float uEnergy;             // 0..1 glow strength
uniform float uGlowR;
uniform vec2  uDie;
uniform vec3  uCore, uRing, uHalo, uFringe, uFringe2;
uniform vec3  uDieCol, uScribeCol;
uniform float uGrid;               // lattice rotation, radians

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdBox(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float cover(float sd, float fw) { return 1.0 - smoothstep(-fw, fw, sd); }

// thin-film colour ramp: pale aqua core -> lavender -> pink halo -> yellow-green -> peach
vec3 iri(float x) {
  vec3 c = uCore;
  c = mix(c, uRing,    smoothstep(0.06, 0.30, x));
  c = mix(c, uHalo,    smoothstep(0.26, 0.60, x));
  c = mix(c, uFringe,  smoothstep(0.85, 1.25, x));
  c = mix(c, uFringe2, smoothstep(1.15, 1.55, x));
  return c;
}
// how strongly the surface takes the colour at distance x (fully gone by x = 1.9)
float weight(float x) {
  return 0.9 * pow(1.0 - smoothstep(0.35, 1.9, x), 1.5);
}

// recolour a resting element: the hue comes from the ramp, the structure from the element
vec3 lit(vec3 rest, float x, float sat, float k) {
  float a = clamp(weight(x) * k * uEnergy, 0.0, 1.0);
  vec3 tint = iri(x);
  tint = mix(vec3(dot(tint, vec3(0.299, 0.587, 0.114))), tint, sat);
  return mix(rest, tint, a);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  ndc.y = uSpan * (ndc.y - 1.0) + 1.0;     // the camera frames the box at the top of the canvas
  ndc.x *= uAspect;
  vec3 d = normalize(vec3(ndc * uTan, -1.0));

  float dn = dot(d, uN);
  float t  = dot(uC, uN) / min(dn, -1e-4);
  bool valid = t > 0.0;
  vec3 P = d * (valid ? t : 1.0) - uC;
  vec2 uv = vec2(dot(P, uU), dot(P, uV)) / uR;

  float fw  = max(length(fwidth(uv)), 1e-5);
  float len = length(uv);

  // ---- die lattice, rotated in wafer space -------------------------------------
  float cg = cos(uGrid), sg = sin(uGrid);
  mat2 R = mat2(cg, -sg, sg, cg);
  vec2 pitch = uDie;
  vec2 cell = (R * uv) / pitch;
  vec2 id = floor(cell);
  vec2 p = (fract(cell) - 0.5) * pitch;
  float h = hash12(id);

  float scribe = 0.0028;                                // half the gap between dies
  float dieSd = sdBox(p, vec2(0.0), pitch * 0.5 - scribe, 0.006);
  float secSd = sdBox(p, vec2(0.20, -0.10) * pitch, vec2(0.18, 0.20) * pitch, 0.0025);
  float mDie = cover(dieSd, fw), mSec = cover(secSd, fw);

  // ---- glow: one flat colour per die, evaluated at the die centre ---------------
  vec2 cuv = ((id + 0.5) * pitch) * R;                  // die centre back in wafer coordinates
  vec2 toC = cuv - uLight;
  float xc = length(toC) / uGlowR;
  float ang = atan(toC.y, toC.x);
  float shimmer = 0.05 * sin(6.2832 * (1.1 * xc + ang / 6.2832) + h * 6.2832) + (h - 0.5) * 0.04;
  float xe = xc + shimmer;
  float near = 1.0 - smoothstep(0.0, 0.6, xc);
  float sat = 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.4, xc));

  float xg = length(uv - uLight) / uGlowR;              // smooth distance for scribes and rim
  vec3 cScribe = lit(uScribeCol, xg + 0.12, 0.45, 0.35);
  vec3 cDie = lit(uDieCol, xe, sat, 1.0) + 0.05 * near * uEnergy;   // dies a touch brighter than the gaps
  vec3 cSec = cDie + 0.025;                             // secondary rectangle: a slightly lighter tint

  vec3 col = cScribe;
  col = mix(col, cDie, mDie);
  col = mix(col, cSec, mSec * mDie);

  // distant, sub-pixel cells collapse to their average colour (no moire at the horizon)
  float fp = fw / min(pitch.x, pitch.y);
  vec3 avg = mix(cDie, cScribe, 0.22);
  col = mix(col, avg, smoothstep(0.16, 0.48, fp));

  // ---- rim / bevel ----------------------------------------------------------
  vec2 dir = uv / max(len, 1e-4);
  float facing = dot(dir, normalize(vec2(-0.55, 0.85))) * 0.5 + 0.5;
  vec3 rim = mix(vec3(0.715, 0.765, 0.850), vec3(0.905, 0.930, 0.972), facing);
  rim += 0.10 * (1.0 - smoothstep(0.0, fw * 1.6, abs(len - 0.9925)));  // thin highlight line
  rim *= 1.0 - 0.08 * smoothstep(0.9975, 1.0, len);                    // darker outer lip
  rim = mix(rim, iri(xg) * 0.95, weight(xg) * uEnergy * 0.22);
  col = mix(col, rim, smoothstep(0.989, 0.992, len));            // thin edge, like a real wafer

  // ---- cut out: the wafer only, transparent outside its edge (the solar system behind shows up to the rim) ----
  float inside = valid ? cover(len - 1.0, fw * 1.2) : 0.0;
  vec3 outc = col + (hash12(gl_FragCoord.xy) - 0.5) / 255.0;   // dither against banding
  outColor = vec4(outc * inside, inside);                       // premultiplied alpha
}`;

/* ------------------------------------------------------------------ *
 *  Setup
 * ------------------------------------------------------------------ */
const canvas = document.querySelector('.wafer-canvas');
if (!canvas) return;
const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
const rad = (d) => (d * Math.PI) / 180;
const TAN = Math.tan(rad(FOV) / 2);

let W = 1, H = 1, aspect = FRAME_ASPECT, span = 1;   // span: the canvas height in framed boxes (fractional)
const pos = { left: 0, top: 0, width: 1, height: 1 };   // the canvas in document px (set on resize)
const att = { x: 0, y: 0 };            // eased lean of the wafer toward the cursor
let edgePts = [];                      // resting outline in canvas px, for things that point at the wafer
let dropY = 0, dropX = 0;              // how far the wafer is lowered / pushed right so it never runs into the text
const plane = { C: [0, 0, -1], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1], R: 1 };

// ax, ay in -1..1: the wafer's eased lean toward the cursor (0 = resting pose)
function buildPlane(ax = 0, ay = 0) {
  const th = rad(WAFER_TILT - ay * ATTRACT_TILT), ph = rad(WAFER_ROLL), yw = rad(-ax * ATTRACT_YAW);
  const mixv = (a, b, ca, cb) => a.map((v, i) => v * ca + b[i] * cb);
  const yaw = (v) => [v[0] * Math.cos(yw) + v[2] * Math.sin(yw), v[1], -v[0] * Math.sin(yw) + v[2] * Math.cos(yw)];
  const N = [0, Math.sin(th), Math.cos(th)];
  const U0 = [1, 0, 0], V0 = [0, Math.cos(th), -Math.sin(th)];
  plane.U = yaw(mixv(U0, V0, Math.cos(ph), Math.sin(ph)));
  plane.V = yaw(mixv(U0, V0, -Math.sin(ph), Math.cos(ph)));
  plane.N = yaw(N);
  plane.C = [(WAFER_CENTER[0] + ax * ATTRACT_SHIFT + dropX) * aspect * TAN, (WAFER_CENTER[1] + ay * ATTRACT_SHIFT + dropY) * TAN, -1];
  plane.R = WAFER_RADIUS * TAN;
}

// pointer (aspect-scaled NDC) -> wafer coordinates, or null above the horizon
function toWafer(nx, ny) {
  const dl = Math.hypot(nx * TAN, ny * TAN, 1);
  const d = [(nx * TAN) / dl, (ny * TAN) / dl, -1 / dl];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const dn = dot(d, plane.N);
  if (dn > -1e-4) return null;
  const t = dot(plane.C, plane.N) / dn;
  if (t <= 0) return null;
  const P = [d[0] * t - plane.C[0], d[1] * t - plane.C[1], d[2] * t - plane.C[2]];
  return [dot(P, plane.U) / plane.R, dot(P, plane.V) / plane.R];
}

let prog, loc = {};
if (gl) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  for (const n of ['uRes', 'uSpan', 'uAspect', 'uTan', 'uC', 'uU', 'uV', 'uN', 'uR', 'uLight', 'uEnergy', 'uGlowR', 'uDie',
    'uCore', 'uRing', 'uHalo', 'uFringe', 'uFringe2', 'uDieCol', 'uScribeCol', 'uGrid']) {
    loc[n] = gl.getUniformLocation(prog, n);
  }
  gl.uniform1f(loc.uTan, TAN);
  gl.uniform1f(loc.uGlowR, GLOW_RADIUS);
  gl.uniform2f(loc.uDie, DIE_SIZE[0], DIE_SIZE[1]);
  gl.uniform3fv(loc.uCore, hex(COLOR_CORE));
  gl.uniform3fv(loc.uRing, hex(COLOR_RING));
  gl.uniform3fv(loc.uHalo, hex(COLOR_HALO));
  gl.uniform3fv(loc.uFringe, hex(COLOR_FRINGE));
  gl.uniform3fv(loc.uFringe2, hex(COLOR_FRINGE2));
  gl.uniform3fv(loc.uDieCol, hex(COLOR_DIE));
  gl.uniform1f(loc.uGrid, rad(GRID_ROTATION));
  gl.uniform3fv(loc.uScribeCol, hex(COLOR_SCRIBE));
}

function resize() {
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  dpr = Math.min(dpr, Math.sqrt(7e6 / Math.max(1, canvas.clientWidth * canvas.clientHeight)));   // keep a tall canvas affordable
  W = Math.max(1, Math.round(canvas.clientWidth * dpr));
  H = Math.max(1, Math.round(canvas.clientHeight * dpr));
  canvas.width = W;
  canvas.height = H;
  span = Math.max(1e-3, canvas.clientHeight / frameH());
  fitAroundText();
  buildPlane(0, 0);
  edgePts = outlinePx();
  buildPlane(att.x, att.y);
  // where the canvas sits in the document, for mapping the cursor every frame without reading layout
  pos.left = 0; pos.top = 0;
  for (let e = canvas; e; e = e.offsetParent) { pos.left += e.offsetLeft; pos.top += e.offsetTop; }
  pos.width = canvas.clientWidth; pos.height = canvas.clientHeight;
  if (gl) {
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(loc.uRes, W, H);
    gl.uniform1f(loc.uSpan, span);
    gl.uniform1f(loc.uAspect, aspect);
    uploadPlane();
  }
  canvas.dispatchEvent(new CustomEvent('wafer-fit'));
}

// the wafer outline in canvas pixels (current plane pose)
function outlinePx() {
  const pts = [];
  for (let i = 0; i < 720; i++) {
    const a = i * Math.PI / 360, u = Math.cos(a), v = Math.sin(a);
    const P = [0, 1, 2].map((k) => plane.C[k] + plane.R * (u * plane.U[k] + v * plane.V[k]));
    if (P[2] >= 0) continue;
    const nx = P[0] / -P[2] / TAN, ny = P[1] / -P[2] / TAN;
    pts.push({ x: ((nx / aspect + 1) / 2) * canvas.clientWidth, y: ((1 - ny) / 2) * frameH() });
  }
  return pts;
}

// left edge of the resting wafer at (or nearest to) a screen height, in canvas pixels
canvas.waferEdgeAt = (yPx) => {
  let best = null;
  for (const p of edgePts) if (Math.abs(p.y - yPx) < 3 && (!best || p.x < best.x)) best = p;
  if (best) return best;
  for (const p of edgePts) if (!best || Math.abs(p.y - yPx) < Math.abs(best.y - yPx)) best = p;
  return best;
};
// the resting outline in canvas px (the solar system behind uses it: planets behind the disc are hidden, not clickable)
canvas.waferOutline = () => edgePts.map((p) => ({ x: p.x, y: p.y }));
// x (canvas px) of the wafer's left end: the leftmost point of the resting outline
canvas.waferLeft = () => (edgePts.length ? Math.min(...edgePts.map((p) => p.x)) : null);

// the framed box's height in css px: it follows the width, so the wafer keeps its place and size relative to the page width
const frameH = () => Math.max(1, canvas.clientWidth / FRAME_ASPECT);

// Keep the wafer clear of the logo block (logo, "our website", "check it out!" and its arrow) at the top-left, at any
// width: measured on the resting pose, the wafer is pushed right until its left edge, over the block's height, sits right
// of the block plus a gap. Only as much as needed, so on a roomy window nothing moves. (The headline below is kept clear
// of the wafer the other way round: js/brand.js moves it down.)
function fitAroundText() {
  dropY = 0;
  dropX = 0;
  const cw = canvas.clientWidth, ch = frameH();
  if (!cw) return;
  const block = document.querySelector('.hf-brand');
  const box = block && block.offsetParent !== null ? {
    top: (block.offsetTop - 0.02 * cw) / ch,
    bottom: (block.offsetTop + block.offsetHeight + 0.02 * cw) / ch,
    need: (block.offsetLeft + block.offsetWidth + 0.03 * cw) / cw,
  } : null;
  if (!box) return;

  // outline points as fractions of the framed box
  const outline = () => {
    const pts = [];
    for (let i = 0; i < 1440; i++) {
      const a = i * Math.PI / 720, u = Math.cos(a), v = Math.sin(a);
      const P = [0, 1, 2].map((k) => plane.C[k] + plane.R * (u * plane.U[k] + v * plane.V[k]));
      if (P[2] >= 0) continue;
      pts.push([(P[0] / -P[2] / TAN / aspect + 1) / 2, (1 - P[1] / -P[2] / TAN) / 2]);
    }
    return pts;
  };

  for (let iter = 0; iter < 8; iter++) {
    buildPlane(0, 0);
    let x = Infinity;
    for (const [px, py] of outline()) if (py >= box.top && py <= box.bottom) x = Math.min(x, px);
    if (!(x < box.need)) break;
    dropX += (box.need - x) * 2;             // centre x is a fraction of the half-width
  }
  buildPlane(0, 0);
}
function uploadPlane() {
  gl.uniform3fv(loc.uC, plane.C);
  gl.uniform3fv(loc.uU, plane.U);
  gl.uniform3fv(loc.uV, plane.V);
  gl.uniform3fv(loc.uN, plane.N);
  gl.uniform1f(loc.uR, plane.R);
}
addEventListener('resize', resize);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

/* ------------------------------------------------------------------ *
 *  Interaction
 * ------------------------------------------------------------------ */
const light = { x: 0, y: 0 };        // eased glow centre, wafer coordinates
const target = { x: 0, y: 0 };       // where the cursor currently points, wafer coordinates
let energy = 0, energyTarget = 0;
let pointerSeen = false, pointerInside = false;

const ptr = { cx: 0, cy: 0, nx: 0, ny: 0, ax: 0, ay: 0 };   // cursor: client px, aspect-scaled NDC, and -1..1 inside the canvas
let firstAim = true;
let hovering = false;                        // cursor currently over the wafer disc

function aim(clientX, clientY) {
  ptr.cx = clientX;                       // kept in client pixels; mapped into the canvas every frame
  ptr.cy = clientY;                       // so it stays correct while the page scrolls
  pointerSeen = true;
  pointerInside = true;
}
function leave() { pointerInside = false; energyTarget = 0; }

addEventListener('pointermove', (e) => aim(e.clientX, e.clientY), { passive: true });
addEventListener('pointerdown', (e) => aim(e.clientX, e.clientY), { passive: true });
addEventListener('touchstart', (e) => aim(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
addEventListener('touchmove', (e) => aim(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
addEventListener('touchend', leave, { passive: true });
addEventListener('pointercancel', leave, { passive: true });
document.documentElement.addEventListener('mouseleave', leave);
addEventListener('blur', leave);

// idle: a slow Lissajous path over the visible part of the wafer
function idle(t) {
  const nx = (0.62 + 0.26 * Math.sin(t * 0.37)) * aspect;
  const ny = 0.42 + 0.28 * Math.sin(t * 0.29 + 1.1);
  const w = toWafer(nx, ny);
  if (w) { target.x = w[0]; target.y = w[1]; }
  energyTarget = 1;
}

/* ------------------------------------------------------------------ *
 *  Loop
 * ------------------------------------------------------------------ */
let visible = false, running = false;
function frame(now) {
  if (!visible) { running = false; return; }   // nothing to draw while the section is off screen
  const t = now / 1000;

  // map the cursor into the canvas; outside it (e.g. over the hero) counts as "left"
  let live = pointerSeen && pointerInside;
  if (live) {
    const left = pos.left - window.scrollX, top = pos.top - window.scrollY;   // cached on resize: no layout read per frame
    ptr.ax = (ptr.cx - left) / pos.width * 2 - 1;
    const cay = -((ptr.cy - top) / pos.height * 2 - 1);            // -1..1 over the whole tall canvas
    ptr.nx = ptr.ax * aspect;
    ptr.ny = span * (cay - 1) + 1;                                  // same mapping the shader uses
    ptr.ay = Math.max(-1, Math.min(1, ptr.ny));                     // for the wafer's lean
    if (Math.abs(ptr.ax) > 1 || Math.abs(cay) > 1) live = false;
  }

  // is the cursor over the wafer? (a little hysteresis so it doesn't flicker at the rim)
  let w = null;
  if (live) {
    w = toWafer(ptr.nx, ptr.ny);
    const r = w ? Math.hypot(w[0], w[1]) : Infinity;
    hovering = r < (hovering ? 1.03 : 1.0);
  } else {
    hovering = false;
  }

  // the wafer leans and drifts a little toward the cursor only while it hovers over the disc,
  // then settles back to its resting pose
  if (!reduceMotion) {
    const tx = hovering ? ptr.ax : 0, ty = hovering ? ptr.ay : 0;
    att.x += (tx - att.x) * ATTRACT_EASE;
    att.y += (ty - att.y) * ATTRACT_EASE;
    buildPlane(att.x, att.y);
  }

  if (pointerSeen) {
    // re-aim every frame: the wafer moves under a stationary cursor, so the glow must keep up
    if (live) {
      w = toWafer(ptr.nx, ptr.ny);
      if (w) {
        target.x = w[0];
        target.y = w[1];
        if (firstAim) { light.x = w[0]; light.y = w[1]; firstAim = false; }
        energyTarget = Math.hypot(w[0], w[1]) < 1.0 ? 1 : 0;   // glow only lives on the wafer
      } else {
        energyTarget = 0;
      }
    } else {
      energyTarget = 0;
    }
  } else if (reduceMotion) {                  // no drift: rest the light at a fixed spot
    const w = toWafer(0.62 * aspect, 0.42);
    if (w) { target.x = light.x = w[0]; target.y = light.y = w[1]; }
    energyTarget = 1;
  } else {
    idle(t);
  }

  const k = reduceMotion ? 1 : EASE;
  light.x += (target.x - light.x) * k;
  light.y += (target.y - light.y) * k;
  energy += (energyTarget - energy) * (reduceMotion ? 1 : FADE);

  if (gl) {
    uploadPlane();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.uLight, light.x, light.y);
    gl.uniform1f(loc.uEnergy, energy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
}

// draw only while the section is on screen
new IntersectionObserver((entries) => {
  visible = entries[0].isIntersecting;
  if (visible && !running) { running = true; requestAnimationFrame(frame); }
}).observe(canvas);

})();
