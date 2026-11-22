// Step 1: a satellite sends the time, and the delay tells your phone how far away it is.
import { C, EARTH_R, ORBIT_R } from './geo.js';
import { fitCanvas, ring, label, satellite, person, loop } from './draw.js';
import { palette as P } from './theme.js';
import { fmtKm, setHTML } from './ui.js';

const SLOW = 30;    // the message is shown 30 times slower than real life, or it would be a blur
const PAUSE = 1.6;  // seconds to keep the result on screen before the next message

// How far a satellite is when it's `elev` degrees above your horizon (it is further when low).
export function rangeAt(elev) {
  const e = (elev * Math.PI) / 180;
  return Math.sqrt(ORBIT_R ** 2 - (EARTH_R * Math.cos(e)) ** 2) - EARTH_R * Math.sin(e);
}

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const cv = $('timingCanvas'), slider = $('elevation');
  let elev = +slider.value, sentAt = performance.now();

  // The result line. It's filled in from the start, so the box is already its full height.
  const result = () => {
    const d = rangeAt(elev);
    setHTML($('sumDone'), `<b>${((d / C) * 1000).toFixed(1)} ms</b> × 300,000 km a second = <b>${fmtKm(d)}</b> away`);
  };
  result();
  slider.addEventListener('input', () => { elev = +slider.value; sentAt = performance.now(); result(); });

  function draw(now) {
    const { g, w, h } = fitCanvas(cv);
    const d = rangeAt(elev), took = d / C;                // took: seconds, in real life
    const elapsed = (now - sentAt) / 1000 / SLOW;         // real seconds that have passed in the story
    if (elapsed > took + PAUSE / SLOW) sentAt = now;      // send the next message
    const f = Math.min(1, elapsed / took);                // how far along its trip the message is

    // The ground and you, near the bottom middle. The satellite sits on an arc above you.
    const you = [w / 2, h - 46];
    g.fillStyle = P.ground; g.beginPath(); g.ellipse(w / 2, h + 260, w * 0.9, 300, 0, Math.PI, 2 * Math.PI); g.fill();
    const R = Math.min(w * 0.42, h - 90), a = (elev * Math.PI) / 180;
    g.setLineDash([3, 6]); g.strokeStyle = P.line; g.lineWidth = 1.5;
    g.beginPath(); g.arc(you[0], you[1], R, Math.PI, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    const sat = [you[0] - R * Math.cos(a), you[1] - R * Math.sin(a)];

    g.strokeStyle = P.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(...sat); g.lineTo(...you); g.stroke();
    satellite(g, sat[0], sat[1], 'Satellite A');
    person(g, you[0], you[1], 1.3);

    // The message itself, a small card with the time written on it, travelling to you.
    if (f < 1) {
      const m = [sat[0] + (you[0] - sat[0]) * f, sat[1] + (you[1] - sat[1]) * f];
      ring(g, m[0], m[1], 9); g.fillStyle = P.violet; g.fill();
      ring(g, m[0], m[1], 16); g.strokeStyle = P.violet; g.lineWidth = 1.5; g.stroke();
      label(g, '“A here. It’s 12:00:00.000”', m[0] + 20, m[1] - 18, { size: 13, align: 'left', color: P.violet });
    } else {
      ring(g, you[0], you[1] - 22, 26); g.strokeStyle = P.accent; g.lineWidth = 2; g.stroke();
    }
    label(g, `slowed down ${SLOW}×`, w - 12, 16, { size: 12, align: 'right', color: P.muted, weight: 500 });

    // The stopwatch under the picture.
    const ms = Math.min(elapsed, took) * 1000;
    $('watch').textContent = `${ms.toFixed(1)} ms`;
    $('watch').classList.toggle('done', f >= 1);
    // Both captions are always in the page, one hidden, so the box keeps its height when they swap.
    $('sum').classList.toggle('done', f >= 1);
    $('elevOut').textContent = elev > 75 ? 'right overhead' : elev < 15 ? 'near the horizon' : `${elev}° up`;
  }
  return loop(draw);
}
