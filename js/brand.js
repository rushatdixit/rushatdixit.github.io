// The hackerfab section's logo block: the blue hand-drawn arrow from "check it out!" up to the "our website" link beside
// the logo, redrawn whenever the text can move.
(() => {
  const section = document.querySelector('.hackerfab');
  const inner = document.querySelector('.hf-inner');
  const link = document.querySelector('.hf-brand-text a');
  const note = document.querySelector('.brand-note');
  const line = document.querySelector('.brand-line');
  const head = document.querySelector('.brand-head');
  if (!section || !inner || !link || !note || !line || !head) return;

  function drawArrow() {
    const t = inner.getBoundingClientRect(), l = link.getBoundingClientRect(), n = note.getBoundingClientRect();
    const k = section.clientWidth / 100;                                     // 1vw of the page
    const sx = n.left - t.left - 0.6 * k, sy = n.top - t.top + n.height * 0.5;   // just left of "check it out!"
    const ex = l.left - t.left + l.width * 0.18, ey = l.bottom - t.top + 0.5 * k; // just under the link
    // out to the left, then up into the link
    const c1x = sx - 2.2 * k, c1y = sy + 0.2 * k;
    const c2x = ex - 0.8 * k, c2y = ey + 1.6 * k;
    line.setAttribute('d', `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);

    // slightly uneven arrowhead aligned with the final tangent
    const a = Math.atan2(ey - c2y, ex - c2x), len = Math.max(8, Math.min(20, 1.2 * k));
    const barb = (l, off) => `M${ex},${ey} L${ex - Math.cos(a + off) * l},${ey - Math.sin(a + off) * l}`;
    head.setAttribute('d', barb(len, 0.5) + ' ' + barb(len * 0.82, -0.55));
  }

  drawArrow();
  window.addEventListener('resize', drawArrow);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawArrow);
})();
