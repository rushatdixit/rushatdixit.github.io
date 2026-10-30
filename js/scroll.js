// Scroll choreography: fade the hero out and the Hobbies scene in as you scroll between them,
// and animate in-page links.
(() => {
  const hero = document.querySelector('.hero');
  const hobbies = document.querySelector('.hobbies');
  const reveals = [...document.querySelectorAll('.hobbies-text, .hobbies-note, .hobbies-note-arrow')];
  const waferCanvas = document.querySelector('.wafer-canvas');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---- scroll-driven transition ----
  function onScroll() {
    // progress is measured over the hero's real height (taller than the screen when the layout is stacked)
    const span = hobbies.offsetTop || window.innerHeight;
    const e = easeInOut(clamp(window.scrollY / span));
    hero.style.opacity = String(1 - clamp(e * 2.4));
    const reveal = clamp((e - 0.35) / 0.65);
    for (const el of reveals) {
      el.style.opacity = String(reveal);
      el.style.transform = `translateY(${(1 - reveal) * 6}vh)`;
    }
    waferCanvas.style.opacity = String(clamp((e - 0.1) / 0.6));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // ---- animated scrolling for the "to learn more.." link ----
  // Scrolling itself is the browser's own CSS scroll-snap (see css/style.css). For this one glide we switch
  // snapping off so it doesn't fight the easing, then hand it back.
  const root = document.documentElement;
  let anim = null;

  function stopAnim() {
    if (anim !== null) cancelAnimationFrame(anim);
    anim = null;
    root.style.scrollSnapType = '';
  }

  function scrollToY(target, ms = 1200) {
    if (reduceMotion) return window.scrollTo(0, target);
    stopAnim();
    const from = window.scrollY;
    const t0 = performance.now();
    root.style.scrollSnapType = 'none';
    const step = (now) => {
      const t = clamp((now - t0) / ms);
      window.scrollTo(0, from + (target - from) * easeInOut(t));
      if (t < 1) anim = requestAnimationFrame(step);
      else stopAnim();
    };
    anim = requestAnimationFrame(step);
  }

  // the user taking over cancels the glide
  for (const type of ['wheel', 'touchstart', 'keydown']) window.addEventListener(type, stopAnim, { passive: true });

  document.querySelector('.scroll-cue').addEventListener('click', (ev) => {
    ev.preventDefault();
    scrollToY(hobbies.offsetTop);
  });
})();
