// Step 2: one distance gives a circle, two give two points, three give one.
import { dist, circleMeet } from './geo.js';
import { fitCanvas, ring, label, satellite, blueDot, person, grabRing, draggable, loop } from './draw.js';
import { palette as P } from './theme.js';
import { spaceView, START_SATS, NAMES, keepIn } from './space.js';
import { fmtKm } from './ui.js';

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const cv = $('circlesCanvas');
  const sats = START_SATS.slice(0, 3);
  const on = [true, false, false];
  let you = [1.5e6, 1e6];

  root.querySelectorAll('[data-sat]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.sat;
    on[i] = !on[i];
    b.setAttribute('aria-pressed', String(on[i]));
  }));
  draggable(cv, () => spaceView(cv.clientWidth, cv.clientHeight), () => [you], (_, p) => { you = keepIn(p, cv.clientWidth, cv.clientHeight, 0.3); });

  const SAYS = [
    'Turn on a satellite to hear it.',
    'One satellite: you are <b>somewhere on that ring</b>. That’s all it can tell you.',
    'Two satellites: the rings cross in <b>two places</b>. You’re at one of them.',
    'Three satellites: only <b>one spot</b> is on all three rings. That’s your blue dot.',
  ];

  function draw() {
    const { g, w, h } = fitCanvas(cv);
    const v = spaceView(w, h);
    const heard = sats.map((s, i) => ({ s, i, r: dist(s, you) })).filter((m) => on[m.i]);

    for (const m of heard) {
      const [x, y] = v.px(m.s);
      ring(g, x, y, m.r / v.mpp); g.strokeStyle = P.violet; g.lineWidth = 2.5; g.stroke();
    }
    sats.forEach((s, i) => satellite(g, ...v.px(s), `${NAMES[i]}${on[i] ? ` · ${fmtKm(dist(s, you))}` : ''}`, { faded: !on[i] }));

    const Y = v.px(you);
    if (heard.length === 2) {
      for (const p of circleMeet(heard[0].s, heard[0].r, heard[1].s, heard[1].r)) {
        const [x, y] = v.px(p);
        ring(g, x, y, 13); g.fillStyle = P.accent; g.fill();
        label(g, '?', x, y + 1, { size: 15, color: '#111' });
      }
    }
    if (heard.length >= 3) blueDot(g, Y[0], Y[1], 9);
    else { g.globalAlpha = 0.6; person(g, Y[0], Y[1] + 12, 1.1); g.globalAlpha = 1; }
    grabRing(g, Y[0], Y[1], 22);
    $('circlesLive').innerHTML = SAYS[heard.length];
  }
  return loop(draw);
}
