// The pictures section's still photos: big, one after another down the section, each with its title beside it (below
// it on phones). They hang left and right in turn. Every visit picks which photos, their order, the side the first one
// hangs on and each one's width at random. A frame is always the photo's own shape, never taller than the window.
//
// To change one: make the web copy with
//   OUT=images/featured tools/make-pictures.sh photos-src/pictures/IMG_1234.heic some-name
// and put its path, the ratio the script prints, a description and its title here. A `swapIn` photo is always shown,
// in the place of one of the `swap` photos, picked at random.
const FEATURED = [
  { src: 'images/featured/mountain-valley.avif',  ratio: 1.33, title: 'out on a trek',                      alt: 'A sunny mountain valley with snow peaks on the horizon' },
  { src: 'images/featured/furnace-team.avif',     ratio: 1.78, title: 'me and abhineet with the furnace we built', alt: 'Abhineet and me posing beside the tube furnace in the workshop', swap: true },
  { src: 'images/featured/furnace-bench.avif',    ratio: 1.78, title: 'the tube furnace, holding 1100 °C',  alt: 'The tube furnace on its steel bench, glowing orange inside' },
  { src: 'images/featured/india-foss-talk.avif',  ratio: 1.83, title: 'speaking at India FOSS 2026',        alt: 'Giving a talk at India FOSS 2026, pointing at a slide titled Why?', swap: true },
  { src: 'images/featured/humidity-chamber.avif', ratio: 1.78, title: 'the humidity-controlled chamber',    alt: 'The humidity-controlled chamber on a lab bench, wired to a power supply and a laptop', swapIn: true },
];

(() => {
  const box = document.querySelector('.pictures-featured');
  if (!box) return;

  // this visit's photos: the swap-in one takes the place of one of the swap ones, then all in a random order
  const swaps = FEATURED.filter((p) => p.swap);
  const out = swaps[Math.floor(Math.random() * swaps.length)];
  const shown = FEATURED.filter((p) => !p.swapIn && p !== out).concat(FEATURED.filter((p) => p.swapIn));
  for (let i = shown.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shown[i], shown[j]] = [shown[j], shown[i]];
  }

  const firstRight = Math.random() < 0.5;
  shown.forEach((pic, i) => {
    const fig = document.createElement('figure');
    fig.className = `featured ${(i % 2 === 0) === firstRight ? 'featured--right' : 'featured--left'}`;
    fig.style.setProperty('--w', `${62 + Math.random() * 12}%`);   // share of the section's width
    fig.style.setProperty('--ratio', String(pic.ratio));
    const frame = document.createElement('div');
    frame.className = 'featured-frame';
    const img = document.createElement('img');
    img.src = pic.src;
    img.alt = pic.alt;
    img.width = 1600;                                              // reserves the right height before it loads
    img.height = Math.round(1600 / pic.ratio);
    img.decoding = 'async';
    if (i > 0) img.loading = 'lazy';
    frame.appendChild(img);
    const cap = document.createElement('figcaption');
    cap.textContent = pic.title;
    fig.append(frame, cap);
    box.appendChild(fig);
  });
})();
