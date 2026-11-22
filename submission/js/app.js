// Starts the page: the light/dark switch, the five steps, and the navigation bar.
// Each step only animates while it's on screen.
import { initTheme } from './theme.js';
import * as timing from './step1-timing.js';
import * as circles from './step2-circles.js';
import * as clock from './step3-clock.js';
import * as wobble from './step4-wobble.js';
import * as city from './step5-city.js';

const $ = (id) => document.getElementById(id);
initTheme($('themeToggle'));

const steps = [
  ['step1', timing], ['step2', circles], ['step3', clock], ['step4', wobble], ['step5', city],
].map(([id, mod]) => ({ el: $(id), anim: mod.init($(id)) }));

const onScreen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const step = steps.find((s) => s.el === e.target);
    if (e.isIntersecting) step.anim.start(); else step.anim.stop();
  }
}, { rootMargin: '120px' });
steps.forEach((s) => onScreen.observe(s.el));

// Light up the step you're reading in the navigation bar, and fill the progress line.
// "Reading" means the last step whose top has passed the middle of the screen.
const links = [...document.querySelectorAll('.nav-steps a')];
function onScroll() {
  const current = steps.filter((s) => s.el.getBoundingClientRect().top < innerHeight / 2).pop();
  links.forEach((a) => a.classList.toggle('here', !!current && a.hash === `#${current.el.id}`));
  const max = document.documentElement.scrollHeight - innerHeight;
  $('progress').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
