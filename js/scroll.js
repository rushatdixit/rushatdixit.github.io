// Scroll choreography: fade the first screen out as you scroll away from it, and glide the "to learn more.." link down
// to the rest of the page. Nothing else animates on scroll: the sections after the first screen are simply there.
(() => {
  const hero = document.querySelector('.hero');
  const next = document.querySelector('.site-header');      // where the page after the first screen begins
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!hero || !next) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // the top of the page after the first screen, measured on resize only (the scroll handler never reads layout)
  let nextTop = 0;
  const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
  const measure = () => { nextTop = docTop(next); };

  // ---- the first screen fades out over its own height (taller than the window when the layout is stacked) ----
  function onScroll() {
    const e = easeInOut(clamp(window.scrollY / (nextTop || window.innerHeight)));
    hero.style.opacity = String(1 - clamp(e * 2.4));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); onScroll(); });
  if (window.ResizeObserver) new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
  measure();
  onScroll();

  // ---- animated scrolling for the "to learn more.." link ----
  // Each step is an instant jump, so the page's `scroll-behavior: smooth` does not smooth every step on top of the easing.
  let anim = null;

  function stopAnim() {
    if (anim !== null) cancelAnimationFrame(anim);
    anim = null;
  }

  function scrollToY(target, ms = 1200) {
    if (reduceMotion) return window.scrollTo({ top: target, behavior: 'instant' });
    stopAnim();
    const from = window.scrollY;
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / ms);
      window.scrollTo({ top: from + (target - from) * easeInOut(t), behavior: 'instant' });
      if (t < 1) anim = requestAnimationFrame(step);
      else stopAnim();
    };
    anim = requestAnimationFrame(step);
  }

  // the user taking over cancels the glide
  for (const type of ['wheel', 'touchstart', 'keydown']) window.addEventListener(type, stopAnim, { passive: true });

  document.querySelector('.scroll-cue').addEventListener('click', (ev) => {
    ev.preventDefault();
    scrollToY(nextTop);
  });
})();
