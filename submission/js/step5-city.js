// Step 5: between tall buildings, signals get blocked or bounce, and the dot wanders.
// The street is seen end on. x runs across it from the left wall (0) to the right wall (W), y is height.
import { C, dist, mulberry32, gaussian } from './geo.js';
import { fix, RANGE_NOISE } from './receiver.js';
import { fitCanvas, View, ring, label, blueDot, person, loop } from './draw.js';
import { palette as P } from './theme.js';
import { bindToggle, fmtDist } from './ui.js';

const W = 22;           // metres from wall to wall
const HAND = 1.4;       // how high the phone is held
const FAR = 20200e3;    // satellites are so far away that their signals arrive as parallel lines
const DRIFT = 0.02;     // how fast the sky turns on screen, about 140 times real life
const CLOCK = 2.5e-6;   // the phone's clock is off; it works this out, as in step 3
const MASK = (5 * Math.PI) / 180;
// Phones listen to GPS, Galileo, GLONASS and BeiDou together, so a real sky has plenty of satellites.
const SKY = Array.from({ length: 16 }, (_, i) => [i + 1, (2 * Math.PI * i) / 16 + 0.13 * Math.sin(i * 3.1)]);

// How a signal from a satellite `theta` above the right-hand horizon reaches you, if it does.
// Straight, if it clears the roof on its side. Otherwise it may bounce off the glass opposite,
// which makes the trip longer by `extra` metres. Otherwise it's blocked.
export function signalPath(theta, px, py, hL, hR) {
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const clearsRoof = ux > 1e-9 ? py + (uy * (W - px)) / ux >= hR : ux < -1e-9 ? py + (uy * px) / -ux >= hL : true;
  if (clearsRoof) return { kind: 'direct', extra: 0 };
  if (ux > 0) {
    const hitY = py + (uy * px) / ux;                // where it strikes the left wall
    if (hitY <= hL && hitY + (uy * W) / ux >= hR) return { kind: 'bounce', wall: 0, hitY, extra: 2 * px * ux };
  } else {
    const hitY = py + (uy * (W - px)) / -ux;         // where it strikes the right wall
    if (hitY <= hR && hitY + (uy * W) / -ux >= hL) return { kind: 'bounce', wall: W, hitY, extra: 2 * (W - px) * -ux };
  }
  return { kind: 'blocked' };
}

function sky(t, px, hL, hR, rng) {
  const out = [];
  for (const [id, a0] of SKY) {
    const theta = (((a0 + DRIFT * t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (theta < MASK || theta > Math.PI - MASK) continue;
    const path = signalPath(theta, px, HAND, hL, hR);
    const pos = [W / 2 + FAR * Math.cos(theta), FAR * Math.sin(theta)];
    const m = { id, theta, pos, ...path };
    if (path.kind !== 'blocked') m.took = (dist(pos, [px, HAND]) + path.extra + RANGE_NOISE * gaussian(rng)) / C + CLOCK;
    out.push(m);
  }
  return out;
}

// The 3D-map trick. The phone knows how tall the buildings are and that it's at street level.
// It tries each spot across the street, predicts how late every signal should be from there
// (bounces included), and keeps the spot where the predictions fit best. The unknown clock adds
// the same to every signal, so only the differences between signals count.
export function mapCheck(heard, hL, hR) {
  let best = null;
  for (let x = 0.25; x <= W - 0.25; x += 0.25) {
    let blocked = 0;
    const miss = heard.map((m) => {
      const p = signalPath(m.theta, x, HAND, hL, hR);
      if (p.kind === 'blocked') blocked++;
      return m.took * C - dist(m.pos, [x, HAND]) - (p.extra || 0);
    });
    const mean = miss.reduce((a, v) => a + v, 0) / miss.length;
    const score = miss.reduce((a, v) => a + (v - mean) ** 2, 0) + 400 * blocked;
    if (!best || score < best.score) best = { x, score };
  }
  return best.x;
}

export function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const side = $('streetCanvas'), map = $('mapCanvas');
  let px = 6, height = +$('height').value, useMap = false, playing = true;
  let t = 0, last = 0, lastReading = 0, reading = 0, dotX = null, trail = [];

  $('height').addEventListener('input', (e) => { height = +e.target.value; trail = []; });
  $('where').addEventListener('input', (e) => { px = +e.target.value; trail = []; });
  bindToggle($('useMap'), (on) => { useMap = on; trail = []; });
  bindToggle($('cityPlay'), (on) => { playing = !on; $('cityPlay').textContent = on ? 'Play the sky' : 'Pause the sky'; });

  function draw(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (playing) t += dt;
    const hL = height, hR = height * 0.8;
    const sats = sky(t, px, hL, hR, mulberry32(reading * 31337 + 5));

    if (now - lastReading > 500) {   // a new answer twice a second
      reading++; lastReading = now;
      const heard = sats.filter((m) => m.kind !== 'blocked');
      if (useMap && heard.length) dotX = mapCheck(heard, hL, hR);
      else { const r = fix(heard, { start: [W / 2, 0] }); if (r.ok) dotX = r.pos[0]; }
      if (dotX !== null) { trail.push(dotX); if (trail.length > 30) trail.shift(); }
      describe(sats);
    }
    drawStreet(sats, hL, hR);
    drawMap();
  }

  function describe(sats) {
    const n = (k) => sats.filter((m) => m.kind === k).length;
    $('nDirect').textContent = n('direct');
    $('nBounce').textContent = n('bounce');
    $('nBlocked').textContent = n('blocked');
    if (dotX === null) { $('cityLive').innerHTML = 'Too few signals to work anything out yet.'; return; }
    const off = dotX - px;
    const inside = dotX < 0 || dotX > W;
    $('cityLive').innerHTML = Math.abs(off) < 1
      ? 'The blue dot is <b>right where you are</b>.'
      : `The blue dot is <b>${fmtDist(off)} to your ${off < 0 ? 'left' : 'right'}</b>${inside ? ', <b>inside a building</b>' : ''}.`;
  }

  // Side view: buildings, you, and each satellite's signal.
  function drawStreet(sats, hL, hR) {
    const { g, w, h } = fitCanvas(side);
    const top = Math.max(hL, hR) * 1.25 + 10;
    const mpp = Math.max((W + 30) / w, top / (h - 30));
    const v = new View(w, h, [W / 2, (h / 2 - 24) * mpp], mpp);
    const ground = v.px([0, 0])[1];

    g.fillStyle = P.ground; g.fillRect(0, ground, w, h - ground);
    // Each building runs from its street-facing wall out past the edge of the picture.
    // `out` is the direction away from the street: -1 for the left building, +1 for the right.
    for (const [wall, out, bh] of [[0, -1, hL], [W, 1, hR]]) {
      const [wx] = v.px([wall, 0]), [, roofY] = v.px([0, bh]);
      const farX = out < 0 ? 0 : w;
      g.fillStyle = P.building;
      g.fillRect(Math.min(wx, farX), roofY, Math.abs(farX - wx), ground - roofY);

      // Windows: one row per 4 m floor, only for floors that fit under the roof,
      // in columns every 3 m going away from the street.
      g.fillStyle = P.line;
      for (let floor = 0; floor + 4 <= bh; floor += 4) {
        for (let col = 1; col < 80; col += 3) {
          const [x1, y1] = v.px([wall + out * col, floor + 3]);
          const [x2, y2] = v.px([wall + out * (col + 1.6), floor + 1]);
          if (Math.min(x1, x2) > w || Math.max(x1, x2) < 0) break;
          g.fillRect(Math.min(x1, x2), y1, Math.abs(x2 - x1), y2 - y1);
        }
      }

      // The height, written just above the roof at the street end, where it always fits.
      g.strokeStyle = P.text; g.lineWidth = 2;
      g.beginPath(); g.moveTo(wx, roofY); g.lineTo(wx + out * 40, roofY); g.stroke();
      label(g, `${Math.round(bh)} m tall`, wx + out * 6, roofY - 12, { size: 13, align: out < 0 ? 'right' : 'left' });
    }

    const you = v.px([px, HAND]);
    for (const m of sats) {
      const dir = [Math.cos(m.theta), -Math.sin(m.theta)];   // towards the satellite, on screen
      const from = m.kind === 'bounce' ? v.px([m.wall, m.hitY]) : you;
      const reach = Math.min(dir[0] > 0 ? (w - from[0]) / dir[0] : dir[0] < 0 ? -from[0] / dir[0] : 1e9, -from[1] / dir[1]);
      const sky = [from[0] + dir[0] * reach, from[1] + dir[1] * reach];
      if (m.kind === 'blocked') {
        // Draw it down to the roof that's in the way, and cross it out there.
        const roof = Math.cos(m.theta) > 0 ? hR : hL;
        const hit = v.px([px + (Math.cos(m.theta) * (roof - HAND)) / Math.sin(m.theta), roof]);
        g.setLineDash([2, 5]); g.strokeStyle = P.muted; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(...sky); g.lineTo(...hit); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.moveTo(hit[0] - 5, hit[1] - 5); g.lineTo(hit[0] + 5, hit[1] + 5); g.moveTo(hit[0] + 5, hit[1] - 5); g.lineTo(hit[0] - 5, hit[1] + 5); g.stroke();
        continue;
      }
      const colour = m.kind === 'direct' ? P.blue : P.accent;
      g.strokeStyle = colour; g.lineWidth = 2.5; g.setLineDash(m.kind === 'bounce' ? [8, 5] : []);
      g.beginPath(); g.moveTo(...sky); g.lineTo(...from); if (m.kind === 'bounce') g.lineTo(...you); g.stroke();
      g.setLineDash([]);
      if (m.kind === 'bounce') { ring(g, from[0], from[1], 4); g.fillStyle = colour; g.fill(); }
      ring(g, sky[0] - dir[0] * 10, sky[1] - dir[1] * 10, 6); g.fillStyle = P.violet; g.fill();
    }
    person(g, you[0], ground, 1.4);
  }

  // Top-down map, the view your phone shows, with where the dot has been.
  function drawMap() {
    const { g, w, h } = fitCanvas(map);
    const v = new View(w, h, [W / 2, 0], (W + 26) / w);
    const [x0] = v.px([0, 0]), [x1] = v.px([W, 0]);
    g.fillStyle = P.building; g.fillRect(0, 0, x0, h); g.fillRect(x1, 0, w - x1, h);
    g.fillStyle = P.street; g.fillRect(x0, 0, x1 - x0, h);
    g.setLineDash([12, 10]); g.strokeStyle = P.muted; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);

    const row = h * 0.68;
    trail.forEach((x, i) => {
      const age = trail.length - 1 - i;
      g.globalAlpha = 0.6 * (1 - age / trail.length);
      ring(g, v.px([x, 0])[0], row - age * 9, 3.5); g.fillStyle = P.blue; g.fill();
    });
    g.globalAlpha = 1;
    const [yx] = v.px([px, 0]);
    ring(g, yx, row, 12); g.strokeStyle = P.text; g.lineWidth = 2; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    label(g, 'you', yx, row + 26, { size: 12 });
    if (dotX !== null) blueDot(g, Math.max(10, Math.min(w - 10, v.px([dotX, 0])[0])), row, 8);
  }

  return loop(draw);
}
