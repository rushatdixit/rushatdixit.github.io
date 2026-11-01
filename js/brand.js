// The hackerfab section's text around the wafer:
//  - the blue hand-drawn arrow from "check it out!" up to the "our website" link beside the logo;
//  - the headline kept clear of the wafer (and of the SiO2 note) at every width: its top margin grows (--hf-clear)
//    until no line of it reaches up into the wafer's outline, measured on the wafer's resting pose.
(() => {
  const canvas = document.querySelector('.wafer-canvas');
  const section = document.querySelector('.hackerfab');
  const inner = document.querySelector('.hf-inner');
  const link = document.querySelector('.hf-brand-text a');
  const note = document.querySelector('.brand-note');
  const line = document.querySelector('.brand-line');
  const head = document.querySelector('.brand-head');
  const headline = document.querySelector('.hf-headline');
  const sio2 = document.querySelector('.hobbies-note');
  if (!canvas || !section || !inner || !link || !note || !line || !head || !headline) return;

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

  // move the headline down until it clears the wafer and the note (never up past its own 24vw margin: see the CSS)
  function clearHeadline() {
    const pts = canvas.waferOutline ? canvas.waferOutline() : [];
    const s = section.getBoundingClientRect();
    const gap = Math.max(16, 0.02 * section.clientWidth);
    let need = -Infinity;
    const range = document.createRange();
    range.selectNodeContents(headline);
    for (const r of range.getClientRects()) {
      const top = r.top - s.top, x0 = r.left - s.left - gap, x1 = r.right - s.left + gap;
      let low = -Infinity;                                               // the wafer's lowest point over this line
      for (const p of pts) if (p.x >= x0 && p.x <= x1) low = Math.max(low, p.y);
      if (low > -Infinity) need = Math.max(need, low + gap - top);
      if (sio2 && sio2.offsetParent !== null) {
        const q = sio2.getBoundingClientRect();
        if (q.right > r.left - gap && q.left < r.right + gap) need = Math.max(need, q.bottom + gap - r.top);
      }
    }
    if (need === -Infinity) return;
    const margin = parseFloat(getComputedStyle(headline).marginTop) || 0;
    const want = Math.max(0, Math.round(margin + need));
    if (Math.abs(want - (parseFloat(headline.style.getPropertyValue('--hf-clear')) || 0)) >= 1) headline.style.setProperty('--hf-clear', want + 'px');
  }

  function layout() {
    clearHeadline();
    drawArrow();
  }

  layout();
  canvas.addEventListener('wafer-fit', layout);
  canvas.addEventListener('note-placed', layout);
  window.addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
