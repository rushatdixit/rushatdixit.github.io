// The pictures section: a wall of my photos in mixed sizes drifting sideways, filling the room under the title.
//
// To add a photo: put the original in photos-src/ (git ignores it), run
//   tools/make-pictures.sh photos-src/IMG_1234.heic some-name
// and list images/pictures/some-name.avif here with the ratio (width / height) the script prints. The wall gives each
// photo a frame close to its own shape; a frame can still take `shape` (see SHAPES) to force one.
const PICTURES = [
  { src: 'images/pictures/valley-stupa-pano.avif',     ratio: 3.02, alt: 'A wide valley with a white stupa, under big clouds' },
  { src: 'images/pictures/horse-snow-peaks.avif',      ratio: 0.56, alt: 'A horse grazing below snow peaks and a blue sky' },
  { src: 'images/pictures/jagged-peaks.avif',          ratio: 1.78, alt: 'Jagged grey peaks behind brown hills' },
  { src: 'images/pictures/gorge-black-white.avif',     ratio: 0.46, alt: 'A gorge and a river in black and white' },
  { src: 'images/pictures/trail-two-hikers.avif',      ratio: 0.56, alt: 'Two hikers on a dirt road winding into the mountains' },
  { src: 'images/pictures/hiker-below-ridge.avif',     ratio: 0.48, alt: 'A hiker walking up a stream bed below a huge rock face' },
  { src: 'images/pictures/gorge-road.avif',            ratio: 1.93, alt: 'A dirt road cut into the side of a gorge' },
  { src: 'images/pictures/pinnacle-gorge.avif',        ratio: 2.30, alt: 'A rock spire rising between the walls of a gorge' },
  { src: 'images/pictures/pinnacle-tall.avif',         ratio: 0.42, alt: 'A tall rock pinnacle against stormy clouds' },
  { src: 'images/pictures/hermitage-cliff.avif',       ratio: 0.79, alt: 'A tiny hermitage on the face of a jagged cliff' },
  { src: 'images/pictures/hermitage-valley-pano.avif', ratio: 2.14, alt: 'The hermitage cliff and the valley around it' },
  { src: 'images/pictures/spires-gorge-pano.avif',     ratio: 2.55, alt: 'Rock spires at the end of a dry river bed' },
  { src: 'images/pictures/cloudy-gorge-pano.avif',     ratio: 2.81, alt: 'A gorge opening up under grey clouds' },
  { src: 'images/pictures/needle-peak.avif',           ratio: 0.56, alt: 'A needle of rock on top of a grey mountain' },
  { src: 'images/pictures/needle-peak-ridge.avif',     ratio: 0.56, alt: 'The needle peak above a dark rock ridge' },
  { src: 'images/pictures/snow-peak.avif',             ratio: 0.56, alt: 'A snow-covered peak above brown hills and a stream' },
  { src: 'images/pictures/blue-sky-ridge.avif',        ratio: 0.57, alt: 'A furrowed mountainside under a blue sky, a village at its foot' },
  { src: 'images/pictures/ruins-on-cliff.avif',        ratio: 1.78, alt: 'Ruined walls on top of a fluted cliff' },
  { src: 'images/pictures/tent-at-night.avif',         ratio: 1.78, alt: 'A tent glowing blue under a starry sky' },
  { src: 'images/pictures/snowy-range-pano.avif',      ratio: 2.14, alt: 'A snowy mountain range above a boulder field' },
  { src: 'images/pictures/ram-skull.avif',             ratio: 1.78, alt: 'A ram skull with curled horns on a rock' },
  { src: 'images/pictures/plains-pano.avif',           ratio: 3.25, alt: 'A wide high plain with mountains on the horizon' },
];

(() => {
  const reel = document.querySelector('.pictures-reel');
  const track = document.querySelector('.pictures-track');
  if (!reel || !track) return;

  // [columns, rows] in grid cells, for a frame that forces a shape; the wall is --rows cells tall (css: .pictures)
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

  // A frame for a photo of this ratio: the spans whose shape is within ~15% of it (the photo is cropped to fill the
  // rest), at a random one of the sizes that fit, so the same shape comes out big in one place and small in another
  function spans(ratio, cell, gap, rows, rand) {
    const fits = [];
    for (let r = 2; r <= Math.min(6, rows); r++) {
      const h = r * cell + (r - 1) * gap;
      const c = Math.max(2, Math.round((ratio * h + gap) / (cell + gap)));
      const err = Math.abs(Math.log((c * cell + (c - 1) * gap) / h / ratio));
      if (err < 0.15 && c <= 10) fits.push([c, r]);
    }
    if (!fits.length) return SHAPES.square;
    return fits[Math.floor(rand() * fits.length)];
  }

  function frame(pic, size, rand) {
    const el = document.createElement('div');
    el.className = 'picture';
    const [c, r] = pic.shape ? SHAPES[pic.shape] : spans(pic.ratio || 1, size.cell, size.gap, size.rows, rand);
    el.style.gridColumn = `span ${c}`;
    el.style.gridRow = `span ${r}`;
    if (pic.src) {
      const img = document.createElement('img');
      img.src = pic.src;
      img.alt = pic.alt || '';
      img.decoding = 'async';
      el.appendChild(img);
    }
    return el;
  }

  // One wall at least as wide as the window (the photo list repeats, reshuffled, until it is), then a copy of it right
  // after: the track slides left by exactly one wall and starts over, so the loop has no seam.
  function build() {
    track.textContent = '';
    // the cell size that makes the rows fill the reel, the room under the title, exactly
    const cs = getComputedStyle(reel);
    const rows = parseFloat(cs.getPropertyValue('--rows')) || 8;
    const gap = parseFloat(cs.getPropertyValue('--gap')) || 12;
    const height = reel.clientHeight;
    if (height > 40) reel.style.setProperty('--cell', `${(height - (rows - 1) * gap) / rows}px`);
    const size = { cell: parseFloat(getComputedStyle(reel).getPropertyValue('--cell')) || 56, gap, rows };

    const wall = document.createElement('div');
    wall.className = 'pictures-wall';
    track.appendChild(wall);
    const rand = rng(7);
    const need = window.innerWidth;
    for (let round = 0; round < 20 && (round === 0 || wall.scrollWidth < need); round++) {
      for (const pic of shuffled(PICTURES, rand)) wall.appendChild(frame(pic, size, rand));
    }
    // the copy is only there for the loop: screen readers and the keyboard get each photo once
    const copy = wall.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    for (const img of copy.querySelectorAll('img')) img.alt = '';
    track.appendChild(copy);
    const step = wall.getBoundingClientRect().width + parseFloat(getComputedStyle(wall).marginRight || 0);
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
