// Step 4: every measurement wobbles a little, and where the satellites sit decides how much
// that wobble moves the dot. That's the pale circle round the blue dot on your map.
import { C, dist, mulberry32, gaussian } from './geo.js';
import { fix, spread } from './receiver.js';
import { fitCanvas, ring, satellite, blueDot, grabRing, draggable, loop } from './draw.js';
import { palette as P } from './theme.js';
import { spaceView, START_SATS, NAMES, middleOf, keepIn } from './space.js';
import { fmtKm } from './ui.js';

const WOBBLE = 750e3;  // metres. Real measurements wobble by a metre or two; this is ~500,000× more, so you can see it.
const GUESSES = 120;   // how many past answers to show as faint dots

const LAYOUTS = {
  spread: START_SATS,
  bunched: [[-6e6, 21e6], [1.5e6, 22e6], [8e6, 20e6], [-12e6, 18.5e6]],
};

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const cv = $('wobbleCanvas');
  const sats = LAYOUTS.spread.map((p) => [...p]);
  let target = null, you = [1.5e6, 1e6], reading = 0, lastReading = 0;

  root.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => { target = LAYOUTS[b.dataset.layout]; }));
  draggable(cv, () => spaceView(cv.clientWidth, cv.clientHeight), () => sats, (i, p) => { target = null; sats[i] = keepIn(p, cv.clientWidth, cv.clientHeight); });

  // One reading: each distance a little off, in a different way every time.
  function measure(seed) {
    const rng = mulberry32(seed);
    return sats.map((pos) => ({ pos, took: (dist(pos, you) + WOBBLE * gaussian(rng)) / C }));
  }

  function draw(now) {
    // Glide the satellites towards a chosen layout.
    if (target) sats.forEach((s, i) => { s[0] += (target[i][0] - s[0]) * 0.08; s[1] += (target[i][1] - s[1]) * 0.08; });
    if (now - lastReading > 900) { reading++; lastReading = now; }  // a new answer about once a second, like a phone

    const { g, w, h } = fitCanvas(cv);
    const v = spaceView(w, h);
    const start = middleOf(sats);

    g.fillStyle = P.blue; g.globalAlpha = 0.45;
    for (let k = 0; k < GUESSES; k++) {
      const r = fix(measure(k * 7919 + 3), { start, maxSteps: 6 });
      if (r.ok) { const [x, y] = v.px(r.pos); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
    }
    g.globalAlpha = 1;

    const now1 = fix(measure(reading * 104729 + 11), { start });
    const cov = spread(measure(0), you, true, WOBBLE);
    const size = cov ? Math.sqrt(cov[0][0] + cov[1][1]) : Infinity;   // the radius phones draw

    sats.forEach((s, i) => { const [x, y] = v.px(s); satellite(g, x, y, NAMES[i]); grabRing(g, x, y, 18); });
    if (now1.ok) {
      const [x, y] = v.px(now1.pos);
      ring(g, x, y, Math.min(2000, size / v.mpp)); g.fillStyle = P.blueSoft; g.fill();
      g.strokeStyle = P.blue; g.lineWidth = 1; g.stroke();
      blueDot(g, x, y, 8);
    }

    $('wobbleSize').textContent = Number.isFinite(size) ? `±${fmtKm(size)}` : 'can’t tell';
    $('wobbleMeter').style.width = `${Math.min(100, (size / 6e6) * 100)}%`;
    $('wobbleLive').innerHTML = size < 1.8e6
      ? 'The satellites are <b>spread around you</b>, so their rings cross at wide angles. Small errors only nudge the dot.'
      : 'The satellites are <b>bunched together</b>, so their rings cross at shallow angles. The same small errors now slide the dot a long way.';
  }
  return loop(draw);
}
