// The flat "map of space" that steps 2, 3 and 4 share: you near the middle, satellites around you,
// about 20,000 km away. It's a flat picture, so three satellites do the work four do in real life.
import { View } from './draw.js';

export const SPAN = 74e6;  // metres from the top of the picture to the bottom

export const spaceView = (w, h) => new View(w, h, [0, 0], SPAN / h);

export const START_SATS = [[-8.5e6, 20.5e6], [21.5e6, 4.5e6], [-15e6, -16.5e6], [9e6, -20e6]];
export const NAMES = ['A', 'B', 'C', 'D'];

// The middle of the satellites. The phone uses it as its first guess, as good as any.
export const middleOf = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// Keep a dragged point inside the picture.
export function keepIn(p, w, h, edge = 0.44) {
  const lim = [SPAN * (w / h) * edge, SPAN * edge];
  return [Math.max(-lim[0], Math.min(lim[0], p[0])), Math.max(-lim[1], Math.min(lim[1], p[1]))];
}
