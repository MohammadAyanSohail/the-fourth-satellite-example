// The world the page simulates for Sheet 1: ten satellites on one orbit, you on the ground,
// and how long each signal took to reach you by your phone's clock.
import { C, EARTH_R, ORBIT_R, ORBIT_S, sub, dot, dist, unit, polar, gaussian } from './geo.js';
import { RANGE_NOISE } from './receiver.js';

export const MASK = 5;  // degrees; phones ignore satellites lower than this, where the signal skims the ground

const IDS = [2, 5, 7, 11, 13, 17, 20, 24, 28, 31];
export function makeSats() {
  return IDS.map((id, i) => ({ id, phase: (2 * Math.PI * i) / IDS.length + 0.21 * Math.sin(i * 2.7), muted: false }));
}

export const satPos = (sat, t) => polar(ORBIT_R, sat.phase + (2 * Math.PI * t) / ORBIT_S);
export const personPos = (ang) => polar(EARTH_R, ang);

// Degrees above your horizon. Below zero the Earth is in the way.
export function elevation(person, sat) {
  return (Math.asin(Math.max(-1, Math.min(1, dot(unit(person), unit(sub(sat, person)))))) * 180) / Math.PI;
}

// What the phone measures. took = the real travel time, plus a little noise, plus however wrong its clock is.
export function listen(sats, t, person, clockErr, rng) {
  const heard = [];
  for (const s of sats) {
    const pos = satPos(s, t);
    const elev = elevation(person, pos);
    if (s.muted || elev < MASK) continue;
    const took = (dist(pos, person) + RANGE_NOISE * gaussian(rng)) / C + clockErr;
    heard.push({ id: s.id, pos, took, elev });
  }
  return heard;
}
