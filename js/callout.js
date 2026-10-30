// Hand-drawn arrow from the name to the portrait, recomputed from the layout.
(() => {
  const hero = document.querySelector('.hero');
  const name = document.querySelector('.name');
  const portrait = document.querySelector('.portrait');
  const line = document.querySelector('.callout-line');
  const head = document.querySelector('.callout-head');
  const text = document.querySelector('.callout-text');

  function draw() {
    // coordinates relative to the hero, so the arrow scrolls with the page
    const h = hero.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    const p = portrait.getBoundingClientRect();

    const sx = n.right - h.left + 24;
    const sy = n.top - h.top + n.height / 2;
    const ex = p.left - h.left - 14;
    const ey = p.top - h.top + p.height * 0.45;
    const gx = ex - 120;               // where the arrow turns down, in the gutter
    const dx = gx - sx;

    // wobbly run along the top, then a curve that arrives heading slightly downward
    const c2x = ex - 50;
    const c2y = ey - 60;
    line.setAttribute(
      'd',
      `M${sx},${sy} ` +
        `C${sx + dx * 0.3},${sy - 16} ${sx + dx * 0.6},${sy + 14} ${gx},${sy + 2} ` +
        `C${gx + 70},${sy - 8} ${c2x},${c2y} ${ex},${ey}`
    );

    // slightly uneven arrowhead, aligned with the curve's final tangent
    const a = Math.atan2(ey - c2y, ex - c2x);
    const barb = (len, off) =>
      `M${ex},${ey} L${ex - Math.cos(a + off) * len},${ey - Math.sin(a + off) * len}`;
    head.setAttribute('d', barb(32, 0.5) + ' ' + barb(27, -0.55));

    text.style.left = `${sx + dx * 0.5}px`;
    text.style.top = `${sy - 6}px`;
  }

  draw();
  window.addEventListener('resize', draw);
  document.fonts.ready.then(draw);
})();
