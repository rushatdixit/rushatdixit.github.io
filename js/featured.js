// The pictures section's still photos, each with its title underneath, laid out as a collage that is different on
// every visit: which photos, the pattern, and where each frame hangs in its spot are all random. A frame is always the
// photo's own shape, and the collage is picked to fill as much of the room under the title as it can.
//
// To change one: make the web copy with
//   OUT=images/featured tools/make-pictures.sh photos-src/pictures/IMG_1234.heic some-name
// and put its path, the ratio the script prints, a description and its title here. A `swapIn` photo is always shown,
// in the place of one of the `swap` photos, picked at random.
const FEATURED = [
  { src: 'images/featured/mountain-valley.avif',  ratio: 1.33, title: 'title one',   alt: 'A sunny mountain valley with snow peaks on the horizon' },
  { src: 'images/featured/furnace-team.avif',     ratio: 1.78, title: 'title two',   alt: 'Two of us posing beside the tube furnace in the workshop', swap: true },
  { src: 'images/featured/furnace-bench.avif',    ratio: 1.78, title: 'title three', alt: 'The tube furnace on its steel bench, glowing orange inside' },
  { src: 'images/featured/india-foss-talk.avif',  ratio: 1.83, title: 'title four',  alt: 'Giving a talk at India FOSS 2026, pointing at a slide titled Why?', swap: true },
  { src: 'images/featured/humidity-chamber.avif', ratio: 1.78, title: 'title five',  alt: 'The humidity-controlled chamber on a lab bench, wired to a power supply and a laptop', swapIn: true },
];

(() => {
  const box = document.querySelector('.pictures-featured');
  if (!box) return;

  // a small seeded generator: one random seed per visit, so a resize re-fits the same collage and a reload makes a new one
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seed = Math.floor(Math.random() * 4294967296);

  // this visit's photos: the swap-in one takes the place of one of the swap ones
  const swaps = FEATURED.filter((p) => p.swap);
  const out = swaps[Math.floor(Math.random() * swaps.length)];
  const shown = FEATURED.filter((p) => !p.swapIn && p !== out).concat(FEATURED.filter((p) => p.swapIn));

  const figures = shown.map((pic) => {
    const fig = document.createElement('figure');
    fig.className = 'featured';
    const frame = document.createElement('div');
    frame.className = 'featured-frame';
    const img = document.createElement('img');
    img.src = pic.src;
    img.alt = pic.alt;
    img.decoding = 'async';
    frame.appendChild(img);
    const cap = document.createElement('figcaption');
    cap.textContent = pic.title;
    fig.append(frame, cap);
    box.appendChild(fig);
    return { pic, fig, frame, cap };
  });

  // ---- the collage: a slicing layout. The photos split into two groups, side by side or one above the other, and
  // each group splits again, down to single photos. Side by side (same height) the shapes add up; stacked (same width)
  // their inverses do. So every random layout has an exact shape, and can be scored by how much of the room it fills.
  function randomTree(items, rand) {
    if (items.length === 1) return { leaf: items[0] };
    const k = 1 + Math.floor(rand() * (items.length - 1));
    return { dir: rand() < 0.5 ? 'h' : 'v', a: randomTree(items.slice(0, k), rand), b: randomTree(items.slice(k), rand) };
  }
  function ratioOf(node, leafRatio) {
    if (node.leaf !== undefined) return leafRatio[node.leaf];
    const a = ratioOf(node.a, leafRatio);
    const b = ratioOf(node.b, leafRatio);
    return node.dir === 'h' ? a + b : 1 / (1 / a + 1 / b);
  }
  function cells(node, leafRatio, x, y, w, h, outList) {
    if (node.leaf !== undefined) { outList[node.leaf] = { x, y, w, h }; return; }
    const a = ratioOf(node.a, leafRatio);
    const b = ratioOf(node.b, leafRatio);
    if (node.dir === 'h') {
      const wa = (w * a) / (a + b);
      cells(node.a, leafRatio, x, y, wa, h, outList);
      cells(node.b, leafRatio, x + wa, y, w - wa, h, outList);
    } else {
      const ha = (h * (1 / a)) / (1 / a + 1 / b);
      cells(node.a, leafRatio, x, y, w, ha, outList);
      cells(node.b, leafRatio, x, y + ha, w, h - ha, outList);
    }
  }

  function layout() {
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (W < 40 || H < 40) return;
    const cs = getComputedStyle(figures[0].cap);
    const capH = parseFloat(cs.marginTop) + (parseFloat(cs.lineHeight) || 20) * 2;   // two lines for a long title
    const gap = Math.min(32, Math.max(14, W * 0.02));

    // a cell holds its frame and its title, so it is a little taller than the photo: allow for that at about the size
    // the frames will come out
    const hEst = H / 2;
    const leafRatio = figures.map(({ pic }) => (pic.ratio * hEst) / (hEst + capH));

    // many random collages; keep one at random from those that fill nearly as much as the best
    const rand = rng(seed);
    const tries = [];
    const idx = figures.map((_, i) => i);
    for (let t = 0; t < 400; t++) {
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const tree = randomTree(idx.slice(), rand);
      const R = ratioOf(tree, leafRatio);
      const w = R > W / H ? W : H * R;
      const h = R > W / H ? W / R : H;
      tries.push({ tree, w, h, area: w * h });
    }
    // Many orders give the same pattern (a plain 2×2 comes up again and again), so the good ones are grouped by pattern
    // and a pattern is picked first: a big photo beside a stack of three is as likely as the grid
    const best = Math.max(...tries.map((t) => t.area));
    const shape = (n) => (n.leaf !== undefined ? 'o' : `${n.dir}(${shape(n.a)},${shape(n.b)})`);
    const patterns = new Map();
    for (const t of tries.filter((tr) => tr.area >= best * 0.9)) {
      const key = shape(t.tree);
      if (!patterns.has(key)) patterns.set(key, []);
      patterns.get(key).push(t);
    }
    const pick = rng(seed ^ 0x9e3779b9);
    const groups = [...patterns.values()];
    const group = groups[Math.floor(pick() * groups.length)];
    const { tree, w, h } = group[Math.floor(pick() * group.length)];

    const spots = [];
    cells(tree, leafRatio, (W - w) * pick(), (H - h) * pick(), w, h, spots);

    // each frame hangs in its cell: 90–100% of the room, at a random spot, its title right under it
    spots.forEach((c, i) => {
      const { pic, fig, frame, cap } = figures[i];
      const cw = c.w - gap;
      const roomH = c.h - gap - capH;
      let fw = Math.min(cw, roomH * pic.ratio);
      fw *= 0.9 + pick() * 0.1;
      const fh = fw / pic.ratio;
      fig.style.left = `${c.x + gap / 2 + pick() * (cw - fw)}px`;
      fig.style.top = `${c.y + gap / 2 + pick() * (roomH - fh)}px`;
      frame.style.width = `${fw}px`;
      frame.style.height = `${fh}px`;
      cap.style.width = `${fw}px`;
    });
  }

  if (window.ResizeObserver) new ResizeObserver(layout).observe(box);
  window.addEventListener('resize', layout);
  layout();
})();
