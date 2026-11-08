// The pictures section: a wall of my photos in mixed sizes drifting sideways, filling the room under the title.
//
// To add a photo: put the original in photos-src/ (git ignores it), run
//   tools/make-pictures.sh photos-src/IMG_1234.heic some-name
// and list images/pictures/some-name.avif here with the ratio (width / height) the script prints. The wall gives each
// photo a frame close to its own shape; a frame can still take `shape` (see SHAPES) to force one, and `last: true`
// puts a photo at the end of the wall.
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

  // SEMICON India 2026
  { src: 'images/pictures/mirror-selfie.avif',         ratio: 0.56, alt: 'A mirror selfie in a hotel corridor' },
  { src: 'images/pictures/hackerfab-booth.avif',       ratio: 1.78, alt: 'Three of us smiling in front of the HackerFab IITB screen' },
  { src: 'images/pictures/pcb-inspection.avif',        ratio: 1.78, alt: 'A circuit board magnified on monitors at an inspection booth' },
  { src: 'images/pictures/glass-ingot.avif',           ratio: 0.56, alt: 'A tall dark crystal ingot on display at a booth' },
  { src: 'images/pictures/semicon-sign.avif',          ratio: 0.56, alt: 'Three of us standing on the big SEMICON India letters' },
  { src: 'images/pictures/semicon-selfie.avif',        ratio: 1.78, alt: 'A selfie with friends in front of the SEMICON India 2026 backdrop' },
  { src: 'images/pictures/conference-swag.avif',       ratio: 1.78, alt: 'Conference bags, pens and brochures spread out on a bed' },
  { src: 'images/pictures/semicon-welcome.avif',       ratio: 1.78, alt: 'Standing at the Welcome to SEMICON India 2026 board' },
  { src: 'images/pictures/fab-tools.avif',             ratio: 1.78, alt: 'Giving a thumbs up between big white fab tools' },
  { src: 'images/pictures/hotel-room.avif',            ratio: 1.78, alt: 'A friend standing in a hotel room full of bags' },
  { src: 'images/pictures/dinner.avif',                ratio: 1.78, alt: 'Friends at dinner in a warmly lit restaurant' },
  { src: 'images/pictures/leather-jacket.avif',        ratio: 0.56, alt: 'Standing in a brown leather jacket against a patterned wall' },
  { src: 'images/pictures/airport-food.avif',          ratio: 1.78, alt: 'Two of us eating at an airport food court' },
  { src: 'images/pictures/bus-selfie.avif',            ratio: 1.78, alt: 'A cramped, grinning selfie with friends and backpacks' },
  { src: 'images/pictures/exhibition-halls.avif',      ratio: 1.33, alt: 'Our group sitting outside the SEMICON India exhibition halls' },
  { src: 'images/pictures/plush-bunny.avif',           ratio: 0.75, alt: 'Two of us holding a purple plush bunny', last: true },
  { src: 'images/pictures/cafe-table.avif',            ratio: 1.33, alt: 'Our group around a cafe table in the exhibition hall' },
  { src: 'images/pictures/semicon-group.avif',         ratio: 1.96, alt: 'Our group lined up beside the SEMICON India Transform Tomorrow sign' },
  { src: 'images/pictures/semicon-group-selfie.avif',  ratio: 1.81, alt: 'A group selfie with conference badges' },

  // wafers, the sputtering system and the tube furnace
  { src: 'images/pictures/wafer-black.avif',           ratio: 1.78, alt: 'A dark wafer piece on a wooden bench' },
  { src: 'images/pictures/wafer-box.avif',             ratio: 0.56, alt: 'A wafer in a clear plastic box' },
  { src: 'images/pictures/wafer-gold.avif',            ratio: 1.78, alt: 'A gold-coloured wafer piece on blue cloth' },
  { src: 'images/pictures/wafer-maroon.avif',          ratio: 0.56, alt: 'A maroon wafer piece held in tweezers' },
  { src: 'images/pictures/wafer-blue.avif',            ratio: 0.56, alt: 'A shimmering blue wafer triangle held in tweezers' },
  { src: 'images/pictures/wafer-violet.avif',          ratio: 0.56, alt: 'A violet wafer triangle held over a black wafer' },
  { src: 'images/pictures/plasma-sputter.avif',        ratio: 0.56, alt: 'Purple plasma glowing through a sputtering chamber window' },
  { src: 'images/pictures/sputter-chamber.avif',       ratio: 0.56, alt: 'The top of the sputtering system, plasma glowing in its viewport' },
  { src: 'images/pictures/furnace-bench.avif',         ratio: 1.78, alt: 'The furnace bench with its gas cylinder and controllers' },
  { src: 'images/pictures/furnace-glow.avif',          ratio: 1.78, alt: 'Looking into the glowing tube furnace with a friend' },

  // around the lab, sem 3
  { src: 'images/pictures/furnace-wiring.avif',        ratio: 0.56, alt: 'The tangle of wiring inside the furnace controller box' },
  { src: 'images/pictures/quartz-tube.avif',           ratio: 1.78, alt: 'Holding up the long quartz tube for the furnace' },
  { src: 'images/pictures/lab-bench.avif',             ratio: 1.78, alt: 'A power supply, function generator and two multimeters on a lab bench' },
  { src: 'images/pictures/scope-generator.avif',       ratio: 1.78, alt: 'An oscilloscope and a function generator wired up' },
  { src: 'images/pictures/purple-room.avif',           ratio: 1.78, alt: 'A room lit purple by LED strips, a laptop on the desk' },
  { src: 'images/pictures/towers.avif',                ratio: 0.56, alt: 'Two tall residential towers against a blue sky' },
  { src: 'images/pictures/scope-square.avif',          ratio: 1.78, alt: 'A square wave on an oscilloscope screen' },
  { src: 'images/pictures/breadboard-meter.avif',      ratio: 1.78, alt: 'A breadboard circuit with a multimeter reading' },
  { src: 'images/pictures/scope-sawtooth.avif',        ratio: 1.78, alt: 'Charging curves and a square wave on an oscilloscope' },
  { src: 'images/pictures/night-walk.avif',            ratio: 0.56, alt: 'Standing on a campus road at night under a streetlight' },
  { src: 'images/pictures/arduino-buzzer.avif',        ratio: 1.78, alt: 'An Arduino wired to a buzzer on a breadboard' },
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

  const EAGER = 14;   // the first photos on the wall load straight away; the rest as they drift towards the window

  function frame(pic, size, rand, eager) {
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
      if (!eager) img.loading = 'lazy';
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

    // the cell size that makes the rows fill the reel, the room under the title, exactly. The gap is read off the
    // laid-out wall: --gap itself is a clamp() expression, not a number
    const rows = parseFloat(getComputedStyle(reel).getPropertyValue('--rows')) || 8;
    const gap = parseFloat(getComputedStyle(wall).rowGap) || 12;
    const height = reel.clientHeight;
    if (height > 40) reel.style.setProperty('--cell', `${(height - (rows - 1) * gap) / rows}px`);
    const size = { cell: parseFloat(getComputedStyle(reel).getPropertyValue('--cell')) || 56, gap, rows };
    const rand = rng(7);
    const need = window.innerWidth;
    const rest = PICTURES.filter((p) => !p.last);
    for (let round = 0; round < 20 && (round === 0 || wall.scrollWidth < need); round++) {
      for (const pic of shuffled(rest, rand)) wall.appendChild(frame(pic, size, rand, wall.children.length < EAGER));
    }
    // `last: true` photos close the wall, whatever the shuffle says. Left to the dense packing they would drop into an
    // earlier hole, and a photo given a fixed spot makes the packing flow the others around and past it. So the packed
    // frames are frozen where they landed first, then the last ones go in the columns after them, centred on the height.
    const pitch = size.cell + gap;
    // (all read first, then all written: writing one would re-flow the rest before they are read)
    const spots = [...wall.children].map((el) => ({
      el,
      c0: Math.round((el.offsetLeft - wall.offsetLeft) / pitch) + 1,
      r0: Math.round((el.offsetTop - wall.offsetTop) / pitch) + 1,
      c: Math.round((el.offsetWidth + gap) / pitch),
      r: Math.round((el.offsetHeight + gap) / pitch),
    }));
    let col = 1;
    for (const { el, c0, r0, c, r } of spots) {
      el.style.gridColumn = `${c0} / span ${c}`;
      el.style.gridRow = `${r0} / span ${r}`;
      col = Math.max(col, c0 + c);
    }
    for (const pic of PICTURES.filter((p) => p.last)) {
      const el = frame(pic, size, rand, false);
      const c = parseInt(el.style.gridColumn.replace('span ', ''), 10);
      const r = parseInt(el.style.gridRow.replace('span ', ''), 10);
      el.style.gridColumn = `${col} / span ${c}`;
      el.style.gridRow = `${Math.floor((rows - r) / 2) + 1} / span ${r}`;
      wall.appendChild(el);
      col += c;
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
