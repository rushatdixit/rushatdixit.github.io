// The pictures section: a wall of framed photos in mixed sizes drifting sideways, filling the section's height.
//
// To add a photo, list it in PICTURES with its `src`, an `alt`, and its `ratio` (width / height: 4/3, 16/9, 3/4 …).
// Keep photos to ~1600px on the long side and a few hundred KB each. Until there are PLACEHOLDERS photos, empty
// outlines of standard shapes fill in after them.
const PICTURES = [
  // { src: 'images/pictures/trek.jpg', alt: 'the campsite at dawn', ratio: 3 / 2 },
];
const PLACEHOLDERS = 24;

(() => {
  const reel = document.querySelector('.pictures-reel');
  const track = document.querySelector('.pictures-track');
  if (!reel || !track) return;

  const SPEED = 36;            // css px per second
  const VERTICAL = 0.4;        // share of placeholder frames that are portrait (the rest are landscape)
  const ODD = 0.25;            // share of placeholder frames with a random ratio instead of a standard one
  const LANDSCAPE = [16 / 9, 4 / 3, 3 / 2];
  const PORTRAIT = [9 / 16, 3 / 4, 2 / 3];

  // a small seeded generator, so the wall looks random but is the same on every visit
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // exactly VERTICAL of the n placeholders are portrait and exactly ODD of them have a random ratio, in a shuffled order
  function placeholderRatios(n, rand) {
    const vertical = shuffled(Array.from({ length: n }, (_, i) => i < Math.round(n * VERTICAL)), rand);
    const odd = shuffled(Array.from({ length: n }, (_, i) => i < Math.round(n * ODD)), rand);
    return vertical.map((v, i) => {
      if (odd[i]) return v ? 0.45 + rand() * 0.4 : 1.15 + rand() * 1.0;   // 0.45–0.85 or 1.15–2.15
      const list = v ? PORTRAIT : LANDSCAPE;
      return list[Math.floor(rand() * list.length)];
    });
  }

  // Frames go into columns. Every column is exactly as tall as the wall: its frames share one width, so their heights
  // (width / ratio) plus the gaps add up to the wall's height. A column takes 1–4 frames, as many as it needs to come
  // down to a randomly picked width, which is what makes the wall irregular without leaving holes.
  function columns(frames, height, gap, rand) {
    const cols = [];
    let i = 0;
    while (i < frames.length) {
      const target = height * (0.28 + rand() * 0.32);
      const col = [frames[i++]];
      const width = () => (height - (col.length - 1) * gap) / col.reduce((s, f) => s + 1 / f.ratio, 0);
      while (col.length < 4 && i < frames.length && width() > target) col.push(frames[i++]);
      cols.push({ frames: col, width: width() });
    }
    return cols;
  }

  function frameEl(f, w) {
    const el = document.createElement('div');
    el.className = 'picture';
    el.style.width = `${w}px`;
    el.style.height = `${w / f.ratio}px`;
    if (f.src) {
      const img = document.createElement('img');
      img.src = f.src;
      img.alt = f.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
    }
    return el;
  }

  // One wall at least as wide as the window (the frames repeat until it is), then a copy of it right after: the track
  // slides left by exactly one wall and starts over, so the loop has no seam.
  function build() {
    track.textContent = '';
    const height = reel.clientHeight;
    const gap = parseFloat(getComputedStyle(reel).getPropertyValue('--gap')) || 12;
    if (height < 40) return;
    const rand = rng(7);
    const base = PICTURES.map((p) => ({ ...p, ratio: p.ratio || 4 / 3 }));
    for (const ratio of placeholderRatios(Math.max(0, PLACEHOLDERS - base.length), rand)) base.push({ src: null, ratio });

    const frames = [];
    let wallW = 0;
    for (let round = 0; round < 20 && (round === 0 || wallW < window.innerWidth); round++) {
      frames.push(...base);
      wallW = columns(frames, height, gap, rng(11)).reduce((s, c) => s + c.width + gap, 0);
    }

    const wall = document.createElement('div');
    wall.className = 'pictures-wall';
    for (const c of columns(frames, height, gap, rng(11))) {
      const col = document.createElement('div');
      col.className = 'pictures-col';
      for (const f of c.frames) col.appendChild(frameEl(f, c.width));
      wall.appendChild(col);
    }
    track.appendChild(wall);
    track.appendChild(wall.cloneNode(true));
    const step = wall.getBoundingClientRect().width + gap;   // the wall plus its margin before the copy
    track.style.setProperty('--drift', `${-step}px`);
    track.style.setProperty('--drift-time', `${(step / SPEED).toFixed(1)}s`);
  }

  // rebuild when the width changes, or the height by more than an address bar sliding on a phone
  let lastW = 0;
  let lastH = 0;
  const rebuild = () => {
    const w = window.innerWidth;
    const h = reel.clientHeight;
    if (w === lastW && Math.abs(h - lastH) < 60) return;
    lastW = w;
    lastH = h;
    build();
  };
  window.addEventListener('resize', rebuild);
  if (window.ResizeObserver) new ResizeObserver(rebuild).observe(reel);
  rebuild();
})();
