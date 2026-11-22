// The receiver. It is handed only what a real phone has: where each satellite says it is,
// and how long each signal seemed to take by the phone's own clock. From that alone it works
// out where it is and, if it's allowed to, how wrong its own clock is.
import { C, sub, len, solve, inverse } from './geo.js';

export const RANGE_NOISE = 1.5;  // metres; how far one measured distance is typically off
export const START = [0, 0];   // the first guess: the centre of the Earth

// One satellite's line in the sums. h says how the predicted distance changes
// if the guess moves a metre in x, a metre in y, or the clock guess grows by a metre.
function row(sat, pos, solveClock) {
  const d = sub(pos, sat.pos);
  const r = len(d) || 1;
  return { r, h: solveClock ? [d[0] / r, d[1] / r, 1] : [d[0] / r, d[1] / r] };
}

// Guess, compare, improve: Gauss–Newton least squares.
// Each step asks "if I stood here with this clock, how long would each signal have taken?",
// compares that with what was measured, and moves the guess to shrink the difference.
export function fix(heard, { solveClock = true, start = START, maxSteps = 12 } = {}) {
  const n = solveClock ? 3 : 2;
  if (heard.length < n) return { ok: false, need: n, history: [] };
  const x = [start[0], start[1], 0];  // x and y in metres, and the clock error times c, also in metres
  const history = [{ pos: [x[0], x[1]], bias: 0 }];
  for (let step = 0; step < maxSteps; step++) {
    const HtH = Array.from({ length: n }, () => new Array(n).fill(0));
    const Htr = new Array(n).fill(0);
    for (const s of heard) {
      const { r, h } = row(s, x, solveClock);
      const miss = s.took * C - (r + (solveClock ? x[2] : 0));
      for (let i = 0; i < n; i++) {
        Htr[i] += h[i] * miss;
        for (let j = 0; j < n; j++) HtH[i][j] += h[i] * h[j];
      }
    }
    const dx = solve(HtH, Htr);
    if (!dx) return { ok: false, singular: true, need: n, history };
    x[0] += dx[0]; x[1] += dx[1];
    if (solveClock) x[2] += dx[2];
    history.push({ pos: [x[0], x[1]], bias: x[2] });
    if (Math.hypot(...dx) < 1e-3) break;
  }
  const pos = [x[0], x[1]];
  return { ok: true, pos, bias: x[2], clock: x[2] / C, history, cov: spread(heard, pos, solveClock) };
}

// How far the answer would wander, in metres, if every distance were off by RANGE_NOISE.
// It depends only on where the satellites are in the sky. It is where the pale circle comes from.
export function spread(heard, pos, solveClock = true, noise = RANGE_NOISE) {
  const n = solveClock ? 3 : 2;
  const HtH = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const s of heard) {
    const { h } = row(s, pos, solveClock);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) HtH[i][j] += h[i] * h[j];
  }
  const P = inverse(HtH);
  if (!P) return null;
  const v = noise * noise;
  return [[P[0][0] * v, P[0][1] * v], [P[1][0] * v, P[1][1] * v]];
}
