// The handwritten SiO2 note by the wafer's lower-left edge, with a navy hand-drawn arrow up to the wafer.
// Placed from the wafer's resting outline (js/wafer.js), below the logo block; js/brand.js then keeps the headline
// below both.
(() => {
  const canvas = document.querySelector('.wafer-canvas');
  const section = document.querySelector('.hackerfab');
  const brand = document.querySelector('.hf-brand');
  const note = document.querySelector('.hobbies-note');
  const line = document.querySelector('.note-line');
  const head = document.querySelector('.note-head');
  if (!canvas || !section || !brand || !note || !line || !head) return;

  function draw() {
    const pts = canvas.waferOutline ? canvas.waferOutline() : [];
    if (!pts.length) return;
    const W = section.clientWidth;
    const s = section.getBoundingClientRect(), b = brand.getBoundingClientRect();
    const pageX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-x')) || 20;

    // the wafer's lower-left: the outline point furthest down and to the left
    let p = pts[0];
    for (const q of pts) if (q.y - q.x > p.y - p.x) p = q;

    // the note ends just left of that point (room for the arrow), and sits a little below it, never over the logo block
    // (it ends left of the wafer over its whole height, rotation included: the edge leans further left above that point)
    const w = note.offsetWidth, h = note.offsetHeight, gap = Math.max(28, 0.035 * W);
    const top = Math.max(b.bottom - s.top + 0.03 * W, p.y - 0.35 * h);
    let edgeX = p.x;
    for (const q of pts) if (q.y >= top - 0.06 * w && q.y <= top + h) edgeX = Math.min(edgeX, q.x);
    const left = Math.max(pageX, edgeX - gap - w);
    note.style.left = `${left}px`;
    note.style.top = `${top}px`;

    // a short curve from the note's top-right corner, up and to the right, to the wafer's edge
    const sx = left + w + 6, sy = top + Math.min(h * 0.2, 14);
    const edge = canvas.waferEdgeAt(sy - Math.max(24, 0.04 * W));
    if (!edge) { line.setAttribute('d', ''); head.setAttribute('d', ''); return; }
    const ex = edge.x - 8, ey = edge.y;
    const c1x = sx + (ex - sx) * 0.15, c1y = sy - (sy - ey) * 0.55;
    const c2x = ex - (ex - sx) * 0.45, c2y = ey + (sy - ey) * 0.1;
    line.setAttribute('d', `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);

    // slightly uneven arrowhead aligned with the final tangent
    const a = Math.atan2(ey - c2y, ex - c2x), len = Math.max(10, Math.min(18, 0.012 * W));
    const barb = (l, off) => `M${ex},${ey} L${ex - Math.cos(a + off) * l},${ey - Math.sin(a + off) * l}`;
    head.setAttribute('d', barb(len, 0.5) + ' ' + barb(len * 0.82, -0.55));
    canvas.dispatchEvent(new CustomEvent('note-placed'));
  }

  draw();
  canvas.addEventListener('wafer-fit', draw);
  window.addEventListener('resize', draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
