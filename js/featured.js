// The pictures section's four still photos, each with its title underneath. Every visit lays them out anew: their
// order, sizes, heights and the gaps between them are random. A frame is always the photo's own shape.
//
// To change one: make the web copy with
//   OUT=images/featured tools/make-pictures.sh photos-src/pictures/IMG_1234.heic some-name
// and put its path, the ratio the script prints, a description and its title here.
const FEATURED = [
  { src: 'images/featured/mountain-valley.avif', ratio: 1.33, title: 'title one',   alt: 'A sunny mountain valley with snow peaks on the horizon' },
  { src: 'images/featured/furnace-team.avif',    ratio: 1.78, title: 'title two',   alt: 'Two of us posing beside the tube furnace in the workshop' },
  { src: 'images/featured/furnace-bench.avif',   ratio: 1.78, title: 'title three', alt: 'The tube furnace on its steel bench, glowing orange inside' },
  { src: 'images/featured/furnace-glow.avif',    ratio: 1.78, title: 'title four',  alt: 'Looking into the glowing tube furnace with a friend' },
];

(() => {
  const box = document.querySelector('.pictures-featured');
  if (!box) return;

  // the random choices, made once per visit; a resize only fits the same arrangement to the new size
  const order = FEATURED.map((pic) => ({
    pic,
    size: 0.7 + Math.random() * 0.3,     // share of its row's height
    drop: Math.random(),                 // how far down the spare height it sits
    gap: 1 + Math.random() * 3,          // the gap before it, in base gaps
  }));
  const shifts = FEATURED.map(() => Math.random());   // where each row sits in its spare width, 0 = flush left
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const figures = order.map(({ pic }) => {
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
    return { fig, frame, cap };
  });

  // Lays the photos out in `rows` rows (split evenly, in the shuffled order) and returns where each goes and the total
  // frame area, so the caller can keep whichever row count shows the photos biggest
  function plan(rows, W, H, capH, base) {
    const rowGap = rows > 1 ? base * 1.5 : 0;
    const rowH = (H - rowGap * (rows - 1)) / rows;
    const frameH = rowH - capH;                     // room left in a row once the titles have theirs
    const per = Math.ceil(order.length / rows);
    const spots = [];
    let area = 0;
    for (let r = 0; r < rows; r++) {
      const row = order.slice(r * per, (r + 1) * per);
      const items = row.map((o, i) => {
        const h = frameH * o.size;
        return { h, w: h * o.pic.ratio, top: o.drop * (frameH - h), gap: i ? base * o.gap : 0 };
      });
      const width = items.reduce((s, it) => s + it.w + it.gap, 0);
      const s = Math.min(1, W / width);             // shrink the whole row evenly if it does not fit
      let x = (W - width * s) * (rows > 1 ? shifts[r] : 0.5);
      const y = r * (rowH + rowGap) + (frameH * (1 - s)) / 2;
      for (const it of items) {
        x += it.gap * s;
        spots.push({ left: x, top: y + it.top * s, w: it.w * s, h: it.h * s });
        area += it.w * s * it.h * s;
        x += it.w * s;
      }
    }
    return { spots, area };
  }

  function layout() {
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (W < 40 || H < 40) return;
    const line = parseFloat(getComputedStyle(figures[0].cap).lineHeight) || 20;
    const capH = parseFloat(getComputedStyle(figures[0].cap).marginTop) + line * 2;   // two lines for a long title
    const base = Math.min(32, Math.max(14, W * 0.02));
    // one row, two rows of two, or one photo per row (tall phone screens): whichever shows them biggest
    const { spots } = [1, 2, order.length]
      .map((rows) => plan(rows, W, H, capH, base))
      .reduce((best, p) => (p.area > best.area ? p : best));
    spots.forEach((p, i) => {
      const { fig, frame, cap } = figures[i];
      fig.style.left = `${p.left}px`;
      fig.style.top = `${p.top}px`;
      frame.style.width = `${p.w}px`;
      frame.style.height = `${p.h}px`;
      cap.style.width = `${p.w}px`;
    });
  }

  if (window.ResizeObserver) new ResizeObserver(layout).observe(box);
  window.addEventListener('resize', layout);
  layout();
})();
