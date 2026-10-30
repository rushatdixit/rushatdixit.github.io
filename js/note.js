// Navy hand-drawn arrow from the bottom-left note to the wafer's left edge.
(() => {
  const canvas = document.querySelector('.wafer-canvas');
  const note = document.querySelector('.hobbies-note');
  const line = document.querySelector('.note-line');
  const head = document.querySelector('.note-head');
  if (!canvas || !note || !line || !head) return;

  function draw() {
    if (!canvas.waferEdgeAt || note.offsetParent === null) return;   // hidden on narrow screens

    // note box relative to the section (offsets ignore the reveal transform and the tilt)
    const left = note.offsetLeft, top = note.offsetTop, w = note.offsetWidth;
    const sx = left + w * 0.5, sy = top - 12;                        // start just above the note
    const screenH = note.offsetParent.clientHeight;                  // one screen (the canvas is taller)
    const edge = canvas.waferEdgeAt(top - Math.max(40, 0.13 * screenH));                      // where on the wafer to point
    if (!edge) return;
    const ex = edge.x - 14, ey = edge.y;                             // stop just short of the edge

    // rise from the note, then lean into the wafer; the end control point sets the arrival angle
    const dy = sy - ey;
    const c1x = sx - 16, c1y = sy - dy * 0.55;
    const c2x = ex - 70, c2y = ey + 36;
    line.setAttribute('d', `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`);

    // slightly uneven arrowhead aligned with the final tangent
    const a = Math.atan2(ey - c2y, ex - c2x);
    const barb = (len, off) =>
      `M${ex},${ey} L${ex - Math.cos(a + off) * len},${ey - Math.sin(a + off) * len}`;
    head.setAttribute('d', barb(22, 0.5) + ' ' + barb(18, -0.55));
  }

  draw();
  canvas.addEventListener('wafer-fit', draw);
  window.addEventListener('resize', draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
