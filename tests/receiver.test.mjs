// Checks the receiver against answers we know. Run from the top of the repository with:
//   node --test
// It uses only Node's built-in test runner, so there is still nothing to install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, dist, mulberry32, gaussian } from '../submission/js/geo.js';
import { fix, spread } from '../submission/js/receiver.js';
import { START_SATS } from '../submission/js/space.js';
import { signalPath, mapCheck } from '../submission/js/step5-city.js';

const YOU = [1.5e6, 1e6];
const CLOCK = 0.01;   // the phone's clock is 10 ms fast
const hear = (sats, you = YOU, clock = CLOCK) => sats.map((pos) => ({ pos, took: dist(pos, you) / C + clock }));

test('with no noise, finds the exact spot and the clock error', () => {
  const r = fix(hear(START_SATS));
  assert.ok(r.ok);
  assert.ok(dist(r.pos, YOU) < 1e-3, `off by ${dist(r.pos, YOU)} m`);
  assert.ok(Math.abs(r.clock - CLOCK) < 1e-9, `clock off by ${(r.clock - CLOCK) * 1e9} ns`);
});

test('three satellites are enough when the clock is unknown, in the flat picture', () => {
  const r = fix(hear(START_SATS.slice(0, 3)));
  assert.ok(r.ok);
  assert.ok(dist(r.pos, YOU) < 1e-3);
});

test('refuses when there are fewer satellites than unknowns', () => {
  assert.deepEqual(fix(hear(START_SATS.slice(0, 2))), { ok: false, need: 3, history: [] });
  assert.equal(fix(hear(START_SATS.slice(0, 1), YOU, 0), { solveClock: false }).ok, false);
});

test('gives the same answer from different first guesses', () => {
  const heard = hear(START_SATS);
  for (const start of [[0, 0], [5e6, -5e6], [-10e6, 8e6]]) {
    const r = fix(heard, { start });
    assert.ok(r.ok && dist(r.pos, YOU) < 1e-3, `start ${start} ended ${r.pos}`);
  }
});

test('only uses positions and times, never your true position', () => {
  // Each signal throws if the receiver reads anything but its position and time.
  const only = (m) => new Proxy(m, { get(t, k) { if (k !== 'pos' && k !== 'took') throw new Error(`read ${String(k)}`); return t[k]; } });
  const heard = hear(START_SATS).map((m) => only({ ...m, truth: YOU }));
  assert.ok(fix(heard).ok);
});

test('bunched satellites give a bigger pale circle than spread ones', () => {
  const size = (sats) => { const P = spread(hear(sats), YOU); return Math.sqrt(P[0][0] + P[1][1]); };
  const bunched = [[-6e6, 21e6], [1.5e6, 22e6], [8e6, 20e6], [-12e6, 18.5e6]];
  assert.ok(size(bunched) > 2 * size(START_SATS));
});

test('noisy answers scatter about as far as the pale circle says', () => {
  const NOISE = 100;
  const P = spread(hear(START_SATS), YOU, true, NOISE);
  const rng = mulberry32(1);
  let sq = 0;
  const N = 400;
  for (let k = 0; k < N; k++) {
    const heard = START_SATS.map((pos) => ({ pos, took: (dist(pos, YOU) + NOISE * gaussian(rng)) / C + CLOCK }));
    sq += dist(fix(heard).pos, YOU) ** 2;
  }
  const ratio = Math.sqrt(sq / N) / Math.sqrt(P[0][0] + P[1][1]);
  assert.ok(ratio > 0.85 && ratio < 1.15, `scatter / circle = ${ratio}`);
});

test('a bounced signal is longer by 2 × distance from the wall × cos(elevation)', () => {
  assert.equal(signalPath(Math.PI / 2, 6, 1.4, 1, 1).kind, 'direct');   // overhead, low buildings
  const theta = (60 * Math.PI) / 180, px = 6;                           // over the right-hand roof, off the left wall
  const p = signalPath(theta, px, 1.4, 40, 32);
  assert.equal(p.kind, 'bounce');
  assert.ok(Math.abs(p.extra - 2 * px * Math.cos(theta)) < 1e-9);
});

test('the 3D map check finds where you stand across the street', () => {
  const FAR = 20200e3, W = 22, HAND = 1.4, hL = 40, hR = 32;
  for (const px of [3, 6, 11, 18]) {
    const heard = [];
    for (let deg = 10; deg <= 170; deg += 8) {
      const theta = (deg * Math.PI) / 180;
      const p = signalPath(theta, px, HAND, hL, hR);
      if (p.kind === 'blocked') continue;
      const pos = [W / 2 + FAR * Math.cos(theta), FAR * Math.sin(theta)];
      heard.push({ theta, pos, took: (dist(pos, [px, HAND]) + p.extra) / C + 2.5e-6 });
    }
    assert.ok(heard.length >= 2);
    assert.ok(Math.abs(mapCheck(heard, hL, hR) - px) <= 0.25, `at ${px} m`);
  }
});
