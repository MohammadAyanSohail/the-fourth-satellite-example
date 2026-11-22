// Sheet 2: why the dot wanders between tall buildings.
// The street is seen end on. x runs across it from the left wall (0) to the right wall (W), y is height.
import { C, dist, mulberry32, gaussian } from './geo.js';
import { fix, RANGE_NOISE } from './receiver.js';
import { drawStreet, drawMap } from './viz.js';
import { bindSwitch, setPlayButton, fmtDist } from './ui.js';

const W = 22;           // metres from wall to wall
const HAND = 1.4;       // how high the phone is held
const FAR = 20200e3;    // satellites are this far away, so their signals arrive as parallel straight lines
const DRIFT = 0.01;     // radians the sky turns per second of page time (sped up about 70 times)
const CLOCK = 2.5e-6;   // the phone's clock is wrong by this much; it solves for it, as on Sheet 1
const MASK = (5 * Math.PI) / 180;
// Eighteen satellites around the street's slice of sky. Phones hear GPS, Galileo, GLONASS and BeiDou
// together, so a real sky has far more than the ten of Sheet 1.
const SKY = Array.from({ length: 18 }, (_, i) => [i + 1, (2 * Math.PI * i) / 18 + 0.13 * Math.sin(i * 3.1)]);

// Which way a signal reaches the phone, if it does. `theta` is the satellite's angle above the
// right-hand horizon. A building on the satellite's side may block the straight path; then the
// signal may still arrive by bouncing off the glass wall opposite, having travelled further.
export function signalPath(theta, px, py, hL, hR) {
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const clearsRoof = ux > 1e-9 ? py + (uy * (W - px)) / ux >= hR : ux < -1e-9 ? py + (uy * px) / -ux >= hL : true;
  if (clearsRoof) return { kind: 'direct', extra: 0 };
  if (ux > 0) {
    const hitY = py + (uy * px) / ux;               // where it strikes the left wall
    if (hitY <= hL && hitY + (uy * W) / ux >= hR) return { kind: 'bounce', wall: 'L', hitY, extra: 2 * px * ux };
  } else {
    const hitY = py + (uy * (W - px)) / -ux;        // where it strikes the right wall
    if (hitY <= hR && hitY + (uy * W) / -ux >= hL) return { kind: 'bounce', wall: 'R', hitY, extra: 2 * (W - px) * -ux };
  }
  return { kind: 'blocked' };
}

const satAt = (theta) => [W / 2 + FAR * Math.cos(theta), FAR * Math.sin(theta)];

function sky(t, px, hL, hR, rng) {
  const out = [];
  for (const [id, a0] of SKY) {
    const theta = (((a0 + DRIFT * t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (theta < MASK || theta > Math.PI - MASK) continue;
    const p = signalPath(theta, px, HAND, hL, hR);
    const m = { id, theta, ...p, pos: satAt(theta) };
    if (p.kind !== 'blocked') m.took = (dist(m.pos, [px, HAND]) + p.extra + RANGE_NOISE * gaussian(rng)) / C + CLOCK;
    out.push(m);
  }
  return out;
}

// The city-map check, which is how 3D-map-aided phones work. The phone knows how tall the buildings
// are and that it is at street level. It tries standing at each spot across the street, uses the map
// to predict how long every signal should have taken from there, bounces included, and keeps the spot
// where prediction and measurement agree best. Its unknown clock adds the same to every signal, so
// only the differences between signals count.
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
    const score = miss.reduce((a, v) => a + (v - mean) ** 2, 0) + 400 * blocked;  // a signal from a satellite the map says is hidden counts heavily against a spot
    if (!best || score < best.score) best = { x, score };
  }
  return best;
}

export function initStreet() {
  const $ = (id) => document.getElementById(id);
  let px = 6, height = 40, t = 0, playing = true, useMap = false, tick = 0;
  let trail = [], last = performance.now(), lastTick = 0, shown = null;

  function solve() {
    const hL = height, hR = height * 0.8;
    const sats = sky(t, px, hL, hR, mulberry32(tick * 31337 + 5));
    const heard = sats.filter((m) => m.kind !== 'blocked');
    let r = fix(heard, { start: [W / 2, 0] });
    if (useMap && heard.length) {
      const best = mapCheck(heard, hL, hR);
      r = { ok: true, pos: [best.x, HAND], cov: null };
    }
    return { sats, r, hL, hR };
  }

  function describe(s) {
    const n = (k) => s.sats.filter((m) => m.kind === k).length;
    const head = `Reaching you now: <b>${n('direct')}</b> signal${n('direct') === 1 ? '' : 's'} straight from the satellite, <b>${n('bounce')}</b> bounced off glass, <b>${n('blocked')}</b> blocked.`;
    if (!s.r.ok) return `${head} That's too few for a fix, so the phone keeps showing its last answer.`;
    const dx = s.r.pos[0] - px;
    const where = s.r.pos[0] < 0 ? ', inside the building on the left' : s.r.pos[0] > W ? ', inside the building on the right' : '';
    const map = useMap ? ' The phone tried every spot across the street against its map, bounces included, and picked the one that fits best.' : '';
    if (Math.abs(dx) < 0.5) return `${head}${map} The dot is <b>right where you are</b>.`;
    return `${head}${map} The dot is <b>${fmtDist(dx)} ${dx < 0 ? 'left' : 'right'}</b> of you${where}.`;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) t += dt;
    if (playing && now - lastTick > 500) { tick++; lastTick = now; step(); }
    requestAnimationFrame(frame);
  }
  function step(keepTrail = true) {
    const s = solve();
    if (s.r.ok) shown = s.r.pos;
    if (keepTrail && shown) { trail.push(shown[0]); if (trail.length > 40) trail.shift(); }
    const halo = s.r.ok && s.r.cov ? 2 * Math.sqrt(Math.max(0, s.r.cov[0][0])) : null;
    drawStreet($('street'), { W, hL: s.hL, hR: s.hR, phone: [px, HAND], sats: s.sats, fix: shown });
    drawMap($('streetMap'), { W, px, fix: shown, trail, halo });
    $('streetNow').innerHTML = describe(s);
  }

  const setPlay = () => setPlayButton($('streetPlay'), playing, 'the sky over the street');
  $('streetPlay').addEventListener('click', () => { playing = !playing; setPlay(); });
  const setSwitch = bindSwitch($('mapSwitch'), (side) => { useMap = side === 'b'; setSwitch(side); trail = []; step(); });
  $('height').addEventListener('input', (e) => { height = +e.target.value; $('heightOut').textContent = `${height} m`; trail = []; step(); });
  $('where').addEventListener('input', (e) => { px = +e.target.value; trail = []; step(); });

  const cv = $('street');
  let dragging = false;
  const moveTo = (e) => {
    const r = cv.getBoundingClientRect();
    const top = Math.max(height, height * 0.8) * 1.18 + 8;
    const mpp = Math.max((W + 34) / r.width, top / (r.height - 26));
    px = Math.max(1, Math.min(W - 1, W / 2 + (e.clientX - r.left - r.width / 2) * mpp));
    $('where').value = px; trail = []; step(false);
  };
  cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); moveTo(e); });
  cv.addEventListener('pointermove', (e) => { if (dragging) moveTo(e); });
  cv.addEventListener('pointerup', () => { dragging = false; });

  setPlay(); setSwitch('a');
  $('heightOut').textContent = `${height} m`;
  step();
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => step(false));
}
