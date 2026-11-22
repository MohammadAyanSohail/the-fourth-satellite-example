// Step 3: the phone's clock is wrong, so every ring is too big by the same amount.
// The phone finds that amount by shrinking all the rings together until they meet.
import { C, dist } from './geo.js';
import { fix } from './receiver.js';
import { fitCanvas, ring, label, satellite, blueDot, grabRing, draggable, loop } from './draw.js';
import { palette as P } from './theme.js';
import { spaceView, NAMES, middleOf, keepIn } from './space.js';
import { fmtKm } from './ui.js';

const SHRINK_TIME = 1.8;  // seconds the shrinking takes on screen

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const cv = $('clockCanvas'), slider = $('clockError'), btn = $('fixClock');
  // All three satellites on one side of the sky, as real ones are: all above you, none below.
  const sats = [[-14e6, 17e6], [4e6, 21e6], [19e6, 10e6]];
  let you = [1.5e6, 1e6], clockErr = +slider.value / 1000;
  let shrinkStart = null, fixed = false;   // fixed: the phone has worked out its clock

  const reset = () => { shrinkStart = null; fixed = false; btn.disabled = false; };
  slider.addEventListener('input', () => { clockErr = +slider.value / 1000; reset(); });
  btn.addEventListener('click', () => { shrinkStart = performance.now(); btn.disabled = true; });
  draggable(cv, () => spaceView(cv.clientWidth, cv.clientHeight), () => [you], (_, p) => { you = keepIn(p, cv.clientWidth, cv.clientHeight, 0.3); reset(); });

  function draw(now) {
    const { g, w, h } = fitCanvas(cv);
    const v = spaceView(w, h);

    // What the phone measures: the real travel time plus however fast its clock is.
    const heard = sats.map((pos) => ({ pos, took: dist(pos, you) / C + clockErr }));
    const guess = fix(heard, { solveClock: false, start: middleOf(sats) });  // trusting its clock
    const solved = fix(heard, { solveClock: true, start: middleOf(sats) });  // working the clock out

    // How much of the extra the rings have shed so far: none, then sliding to all of it.
    let t = 0;
    if (shrinkStart !== null) {
      t = Math.min(1, (now - shrinkStart) / 1000 / SHRINK_TIME);
      t = t * t * (3 - 2 * t);
      if (t >= 1) fixed = true;
    }
    const shed = solved.ok ? solved.bias * t : 0;

    heard.forEach((m, i) => {
      const [x, y] = v.px(m.pos);
      ring(g, x, y, (m.took * C - shed) / v.mpp); g.strokeStyle = P.violet; g.lineWidth = 2.5; g.stroke();
      satellite(g, x, y, NAMES[i]);
    });

    const Y = v.px(you);
    if (fixed) blueDot(g, Y[0], Y[1], 9);
    else {
      ring(g, Y[0], Y[1], 5); g.fillStyle = P.muted; g.fill();
      label(g, 'really here', Y[0], Y[1] - 30, { size: 12, color: P.muted, weight: 500 });
      if (clockErr > 0 && guess.ok && t === 0) {
        const [gx, gy] = v.px(guess.pos);
        g.strokeStyle = P.accent; g.lineWidth = 3;
        g.beginPath(); g.moveTo(gx - 8, gy - 8); g.lineTo(gx + 8, gy + 8); g.moveTo(gx + 8, gy - 8); g.lineTo(gx - 8, gy + 8); g.stroke();
        label(g, 'phone’s guess', gx, gy + 20, { color: P.accent });
      }
    }
    grabRing(g, Y[0], Y[1], 22);

    const extra = fmtKm(clockErr * C);
    $('clockOut').textContent = `${(clockErr * 1000).toFixed(0)} ms fast`;
    $('clockLive').innerHTML = clockErr === 0
      ? 'A perfect clock: the rings meet exactly where you are. Real phone clocks are never this good.'
      : fixed
        ? `Every ring shrank by the same <b>${extra}</b> and they met. The phone now knows its clock was <b>${(solved.clock * 1000).toFixed(0)} ms fast</b>.`
        : t > 0
          ? 'Shrinking every ring by the same amount, until they meet…'
          : `The clock is ${(clockErr * 1000).toFixed(0)} ms fast, so every ring is <b>${extra} too big</b>. They don’t meet, and trusting the clock puts you <b>${fmtKm(dist(guess.pos, you))}</b> away.`;
  }
  return loop(draw);
}
