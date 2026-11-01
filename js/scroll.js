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

  // the Hobbies section's top and every snap stop in the document, measured on resize only (the scroll handler never
  // reads layout). A screen taller than the window loosens the snapping to proximity, so none of it is unreachable.
  const root = document.documentElement;
  const screens = [...document.querySelectorAll('.hero, .hobbies-slide, .hobbies-tail, .page4')];
  let hobbiesTop = 0, stops = [], fits = [];
  const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
  const measure = () => {
    hobbiesTop = docTop(hobbies);
    stops = screens.map(docTop);
    fits = screens.map((el) => el.offsetHeight <= window.innerHeight + 1);
    root.classList.toggle('snap-loose', fits.includes(false));
  };

  // ---- scroll-driven transition ----
  function onScroll() {
    // progress is measured over the hero's real height (taller than the screen when the layout is stacked)
    const span = hobbiesTop || window.innerHeight;
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
  window.addEventListener('resize', () => { measure(); onScroll(); });
  if (window.ResizeObserver) new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
  measure();
  onScroll();

  // ---- animated scrolling for the "to learn more.." link ----
  // Scrolling itself is the browser's own CSS scroll-snap (see css/style.css). For this one glide we switch snapping off
  // so it doesn't fight the easing, then hand it back. Each step is an instant jump, so the page's
  // `scroll-behavior: smooth` does not smooth every step on top of the easing.
  let anim = null;

  function stopAnim() {
    if (anim !== null) cancelAnimationFrame(anim);
    anim = null;
    root.style.scrollSnapType = '';
  }

  function scrollToY(target, ms = 1200) {
    if (reduceMotion) return window.scrollTo({ top: target, behavior: 'instant' });
    stopAnim();
    const from = window.scrollY;
    const t0 = performance.now();
    root.style.scrollSnapType = 'none';
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

  // the keys that page through the site land on a stop. The browser does this itself under mandatory snapping; this steps
  // in where it can't: with reduced motion (an instant jump instead of the animated snap), and where the snapping is only
  // proximity (phones, where the stacked hero is taller than the screen) while on a screen that fits the window
  const KEYS = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };
  window.addEventListener('keydown', (ev) => {
    let dir = KEYS[ev.key];
    const loose = root.classList.contains('snap-loose');
    if (!dir || !(reduceMotion || loose) || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable], .page4-scroll')) return;
    if (ev.key === ' ' && ev.shiftKey) dir = -1;
    const y = window.scrollY, i = stops.findLastIndex((s) => s <= y + 1);
    if (loose && !(i >= 0 && fits[i])) return;               // inside the tall hero: the browser's own scrolling
    let to = dir > 0 ? stops.find((s) => s > y + 1) : [...stops].reverse().find((s) => s < y - 1);
    if (to === undefined) return;
    const j = stops.indexOf(to);
    if (dir < 0 && !fits[j]) to = Math.max(to, stops[j + 1] - window.innerHeight);     // up into a tall screen: its bottom
    ev.preventDefault();
    window.scrollTo({ top: to, behavior: reduceMotion ? 'instant' : 'smooth' });
  });

  document.querySelector('.scroll-cue').addEventListener('click', (ev) => {
    ev.preventDefault();
    scrollToY(hobbiesTop);
  });
})();
