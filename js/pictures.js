// The pictures section: a wall of frames in mixed sizes drifting sideways, like photos hung on a wall.
//
// To add a photo, give an entry a `src` (e.g. 'images/pictures/trek.jpg') and an `alt`. An entry without a `src` is
// drawn as an empty outline. `shape` sets the frame's size and proportions (see SHAPES), and the photo is cropped to
// fill it. Keep photos to ~1600px on the long side and a few hundred KB each.
const PICTURES = [
  { shape: 'big',       src: null, alt: '' },
  { shape: 'portrait',  src: null, alt: '' },
  { shape: 'small',     src: null, alt: '' },
  { shape: 'landscape', src: null, alt: '' },
  { shape: 'square',    src: null, alt: '' },
  { shape: 'landscape', src: null, alt: '' },
  { shape: 'portrait',  src: null, alt: '' },
  { shape: 'small',     src: null, alt: '' },
  { shape: 'square',    src: null, alt: '' },
  { shape: 'big',       src: null, alt: '' },
  { shape: 'landscape', src: null, alt: '' },
  { shape: 'square',    src: null, alt: '' },
  { shape: 'portrait',  src: null, alt: '' },
  { shape: 'small',     src: null, alt: '' },
];

(() => {
  const track = document.querySelector('.pictures-track');
  if (!track) return;

  // [columns, rows] in grid cells; the wall is ROWS cells tall (css: .pictures-wall)
  const SHAPES = {
    big:       [5, 4],
    portrait:  [3, 5],
    landscape: [4, 3],
    square:    [3, 3],
    small:     [2, 2],
  };
  const SPEED = 36;   // css px per second

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

  function frame(pic) {
    const el = document.createElement('div');
    el.className = 'picture';
    const [c, r] = SHAPES[pic.shape] || SHAPES.square;
    el.style.gridColumn = `span ${c}`;
    el.style.gridRow = `span ${r}`;
    if (pic.src) {
      const img = document.createElement('img');
      img.src = pic.src;
      img.alt = pic.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
    }
    return el;
  }

  // One wall at least as wide as the window (the photo list repeats, reshuffled, until it is), then a copy of it right
  // after: the track slides left by exactly one wall and starts over, so the loop has no seam.
  function build() {
    track.textContent = '';
    const wall = document.createElement('div');
    wall.className = 'pictures-wall';
    track.appendChild(wall);
    const rand = rng(7);
    const need = window.innerWidth;
    for (let round = 0; round < 20 && (round === 0 || wall.scrollWidth < need); round++) {
      for (const pic of shuffled(PICTURES, rand)) wall.appendChild(frame(pic));
    }
    track.appendChild(wall.cloneNode(true));
    const step = wall.getBoundingClientRect().width + parseFloat(getComputedStyle(wall).marginRight || 0);
    track.style.setProperty('--drift', `${-step}px`);
    track.style.setProperty('--drift-time', `${(step / SPEED).toFixed(1)}s`);
  }

  let lastW = 0;
  const rebuild = () => {
    if (window.innerWidth === lastW) return;   // phones fire resize when the address bar slides; only width matters
    lastW = window.innerWidth;
    build();
  };
  window.addEventListener('resize', rebuild);
  rebuild();
})();
