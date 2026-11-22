// Step 3: the phone's clock is wrong, so every ring is too big by the same amount.
// The visitor shrinks all the rings together to find that amount. With two satellites any
// amount gives a crossing, so the phone can't tell; a third satellite leaves only one amount.
import { C, dist, circleMeet } from './geo.js';
import { fix } from './receiver.js';
import { fitCanvas, ring, satellite, blueDot, grabRing, draggable, magnifier, loop } from './draw.js';
import { palette as P } from './theme.js';
import { spaceView, NAMES, middleOf, keepIn } from './space.js';
import { fmtKm, setHTML } from './ui.js';

const FIND_TIME = 1.6;  // seconds the "let the phone find it" glide takes

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const cv = $('clockCanvas'), clockSlider = $('clockError'), shrinkSlider = $('shrink'), findBtn = $('findClock'), thirdBtn = $('useThird');
  // All three satellites on one side of the sky, as real ones are: all above you, none below.
  const sats = [[-14e6, 17e6], [4e6, 21e6], [19e6, 10e6]];
  let you = [1.5e6, 1e6], clockErr = +clockSlider.value / 1000, shrink = 0, useThird = true;
  let glide = null;   // { from, to, start } while the phone is finding the amount itself

  clockSlider.addEventListener('input', () => { clockErr = +clockSlider.value / 1000; shrink = 0; glide = null; });
  shrinkSlider.addEventListener('input', () => { shrink = +shrinkSlider.value * 1000; glide = null; });
  thirdBtn.addEventListener('click', () => {
    useThird = !useThird;
    thirdBtn.setAttribute('aria-pressed', String(useThird));
  });
  draggable(cv, () => spaceView(cv.clientWidth, cv.clientHeight), () => [you], (_, p) => { you = keepIn(p, cv.clientWidth, cv.clientHeight, 0.3); });

  function draw(now) {
    const { g, w, h } = fitCanvas(cv);
    const v = spaceView(w, h);
    const used = useThird ? sats : sats.slice(0, 2);

    // What the phone measures: the real travel time plus however fast its clock is.
    const heard = used.map((pos) => ({ pos, took: dist(pos, you) / C + clockErr }));
    const solved = fix(heard, { solveClock: true, start: middleOf(used) });   // fails with only two
    findBtn.disabled = !solved.ok;
    findBtn.textContent = solved.ok ? 'Let the phone find it' : 'Needs a third satellite';
    if (glide) {
      let t = Math.min(1, (now - glide.start) / 1000 / FIND_TIME);
      t = t * t * (3 - 2 * t);
      shrink = glide.from + (glide.to - glide.from) * t;
      if (t >= 1) glide = null;
    }
    shrinkSlider.value = Math.round(shrink / 1000);

    // How close the rings are to meeting: the best single spot, and how far it still is from the worst ring.
    const best = fix(heard.map((m) => ({ pos: m.pos, took: m.took - shrink / C })), { solveClock: false, start: middleOf(used) });
    const gap = best.ok ? Math.max(...heard.map((m) => Math.abs(dist(best.pos, m.pos) - (m.took * C - shrink)))) : Infinity;
    const met = useThird && gap < 40e3;

    // Everything near you, drawn with whichever View it's given: the whole picture or the magnifier.
    function scene(view, dotSize) {
      if (!useThird) {   // with two satellites, where the rings cross for every shrink amount: a trail of answers
        g.fillStyle = P.accent; g.globalAlpha = 0.55;
        for (let s = 0; s <= 8000e3; s += 20e3) {
          for (const p of circleMeet(heard[0].pos, heard[0].took * C - s, heard[1].pos, heard[1].took * C - s)) {
            const [x, y] = view.px(p); g.fillRect(x - 1.5, y - 1.5, 3, 3);
          }
        }
        g.globalAlpha = 1;
      }
      for (const m of heard) {
        const [x, y] = view.px(m.pos);
        ring(g, x, y, (m.took * C - shrink) / view.mpp); g.strokeStyle = P.violet; g.lineWidth = 2.5; g.stroke();
      }
      const Y = view.px(you);
      if (met) { blueDot(g, ...view.px(best.pos), dotSize); return; }   // the phone's best spot, not where you really are
      ring(g, Y[0], Y[1], 4); g.fillStyle = P.muted; g.fill();
      if (!useThird) return;
      for (let i = 0; i < 3; i++) {    // where each pair of rings crosses, nearest the middle
        const a = heard[i], b = heard[(i + 1) % 3];
        const pts = circleMeet(a.pos, a.took * C - shrink, b.pos, b.took * C - shrink);
        if (!pts.length) continue;
        const p = pts.sort((p1, p2) => dist(p1, best.pos) - dist(p2, best.pos))[0];
        const [x, y] = view.px(p); ring(g, x, y, 5); g.fillStyle = P.accent; g.fill();
      }
    }

    scene(v, 9);
    heard.forEach((m, i) => satellite(g, ...v.px(m.pos), NAMES[i]));
    if (!useThird) satellite(g, ...v.px(sats[2]), NAMES[2], { faded: true });
    const Y = v.px(you);
    grabRing(g, Y[0], Y[1], 22);

    const R = Math.min(95, h * 0.24);
    magnifier(g, v, best.ok ? best.pos : you, 12, w - R - 14, h - R - 26, R, (zv) => scene(zv, 7));

    $('clockOut').textContent = `${(clockErr * 1000).toFixed(0)} ms fast`;
    $('shrinkOut').textContent = fmtKm(shrink);
    setHTML($('clockLive'), !useThird
      ? 'With only A and B, <b>every</b> shrink amount gives a place where the rings cross. That’s the dotted trail. The phone has no way to choose, so it needs one more satellite.'
      : met
        ? `All three rings meet at a shrink of <b>${fmtKm(shrink)}</b>. That amount <b>is</b> the clock error: ${fmtKm(shrink)} ÷ 300,000 km/s = <b>${((shrink / C) * 1000).toFixed(0)} ms fast</b>.`
        : `The three crossings (lime) don’t line up yet: they’re about <b>${fmtKm(gap)}</b> from meeting. Only one shrink amount makes them meet.`);
  }

  findBtn.addEventListener('click', () => {
    const used = useThird ? sats : sats.slice(0, 2);
    const heard = used.map((pos) => ({ pos, took: dist(pos, you) / C + clockErr }));
    const solved = fix(heard, { solveClock: true, start: middleOf(used) });
    if (solved.ok) glide = { from: shrink, to: solved.bias, start: performance.now() };
  });
  return loop(draw);
}
