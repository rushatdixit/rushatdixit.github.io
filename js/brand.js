// The HackerFab logo block: centre it between the page's left edge and the wafer's left end, and draw a
// hand-drawn arrow from "hackerfab iitb" (closing line) up to the "our website" link, with a note on it.
(() => {
  const canvas = document.querySelector('.wafer-canvas');
  const tail = document.querySelector('.hobbies-tail');
  const brand = document.querySelector('.hobbies-brand');
  const link = document.querySelector('.hobbies-brand a');
  const word = document.querySelector('.hobbies-closing .blue');
  const line = document.querySelector('.brand-line');
  const head = document.querySelector('.brand-head');
  const note = document.querySelector('.brand-note');
  if (!canvas || !tail || !brand || !link || !word || !line || !head || !note) return;

  function layout() {
    // ---- centre the logo block in the gap left of the wafer ----
    const left = canvas.waferLeft && canvas.waferLeft();
    if (left) {
      const gap = parseFloat(getComputedStyle(tail).getPropertyValue('--edge-gap')) || 0;
      brand.style.setProperty('--brand-cx', `${left / 2}px`);
      brand.style.setProperty('--brand-max', `${Math.max(80, 0.9 * left - 2 * gap)}px`);
    }

    // ---- arrow from the words up to the link ----
    const t = tail.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    const r = word.getClientRects()[0] || word.getBoundingClientRect();
    const sx = r.left - t.left + r.width * 0.4, sy = r.top - t.top - 12;     // just above the words
    const ex = l.left - t.left + l.width / 2, ey = l.bottom - t.top + 16;    // just below the link
    const dx = ex - sx, dy = ey - sy;                                          // pointing up and to the left (dy < 0)

    if (!(dy < -60)) {                                                         // no room for a sensible arrow
      line.setAttribute('d', '');
      head.setAttribute('d', '');
      note.style.visibility = 'hidden';
      return;
    }
    note.style.visibility = '';

    const c1x = sx - 30, c1y = sy + dy * 0.45;
    const c2x = ex + Math.min(110, Math.abs(dx) * 0.35), c2y = ey - dy * 0.3;  // end control: below-right of the end
    line.setAttribute('d', `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);

    // slightly uneven arrowhead aligned with the final tangent
    const a = Math.atan2(ey - c2y, ex - c2x);
    const barb = (len, off) =>
      `M${ex},${ey} L${ex - Math.cos(a + off) * len},${ey - Math.sin(a + off) * len}`;
    head.setAttribute('d', barb(24, 0.5) + ' ' + barb(20, -0.55));

    // "check it out!" to the lower-left of the curve's midpoint, on empty black
    const mt = 0.5, u = 1 - mt;
    const mx = u * u * u * sx + 3 * u * u * mt * c1x + 3 * u * mt * mt * c2x + mt * mt * mt * ex;
    const my = u * u * u * sy + 3 * u * u * mt * c1y + 3 * u * mt * mt * c2y + mt * mt * mt * ey;
    note.style.left = `${mx - note.offsetWidth * 0.5 - 24}px`;
    note.style.top = `${my + 8}px`;
  }

  layout();
  canvas.addEventListener('wafer-fit', layout);
  window.addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
