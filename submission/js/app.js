// Sheet 1: where the blue dot comes from.
import { C, ORBIT_S, ORBIT_R, dist, unit, mulberry32 } from './geo.js';
import { fix } from './receiver.js';
import { makeSats, satPos, personPos, elevation, listen, MASK } from './sky.js';
import { drawSky, drawClose, drawStrip, pickSpan, View } from './viz.js';
import { bindSwitch, setPlayButton, bindChoices, fmtDist, fmtTime } from './ui.js';
import { initStreet } from './canyon.js';

const $ = (id) => document.getElementById(id);
const SPEED = ORBIT_S / 240;  // one orbit in four minutes of page time

const sats = makeSats();
let personAng = Math.PI / 2 + 0.12;
let t = 0, playing = true, tick = 0, clockErr = 1e-3, solveClock = true;
let heard = [], result = null, cloud = [];
let stepping = null;   // { history, k } while the phone's guesses are being shown one at a time

function measure() {
  const person = personPos(personAng);
  heard = listen(sats, t, person, clockErr, mulberry32(tick * 7919 + 13));
  result = fix(heard, { solveClock });
  cloud = [];
  if (result.ok) {
    for (let j = 0; j < 160; j++) {
      const r = fix(listen(sats, t, person, clockErr, mulberry32(j * 104729 + 7)), { solveClock, start: result.pos, maxSteps: 4 });
      if (r.ok) cloud.push(r.pos);
    }
  }
}

function satStates(person) {
  return sats.map((s) => {
    const pos = satPos(s, t);
    const set = elevation(person, pos) < MASK;
    return { id: s.id, pos, state: s.muted ? 'muted' : set ? 'set' : 'heard' };
  });
}

function describe(person) {
  const n = heard.length, need = solveClock ? 3 : 2;
  if (!result.ok) {
    return `Your phone can hear only <b>${n} satellite${n === 1 ? '' : 's'}</b> right now. ${solveClock
      ? 'Because it also has to work out its own clock, it needs three in this flat slice of the world (four in the real, round one).'
      : `Even trusting its clock it needs ${need}.`} Drag a satellite above your horizon, or switch one back on.`;
  }
  const err = dist(result.pos, person);
  if (solveClock) {
    return `Your phone hears <b>${n} satellites</b>. It worked out that its own clock was ${clockErr ? `off by <b>${fmtTime(result.clock)}</b>` : 'right'}, and puts you <b>${fmtDist(err)}</b> from where you really stand.`;
  }
  if (!clockErr) return `Your phone is trusting its own clock, and this time the clock happens to be perfect, so it puts you <b>${fmtDist(err)}</b> away. No real phone clock is this good.`;
  return `Your phone is trusting its own clock, which is <b>${fmtTime(clockErr)}</b> fast. Every distance comes out <b>${fmtDist(clockErr * C)}</b> too long, the circles can't all meet, and its best guess is <b>${fmtDist(err)}</b> from you.`;
}

function heardTable() {
  if (!heard.length) return '<p class="quiet">Nothing above your horizon is being listened to.</p>';
  const rows = heard.map((m) => `<tr><td>${String(m.id).padStart(2, '0')}</td><td>${m.elev.toFixed(0)}°</td><td>${(m.took * 1000).toFixed(6)} ms</td><td>${(m.took * C / 1000).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km</td></tr>`).join('');
  const foot = result.ok && solveClock
    ? `Clock found: ${fmtTime(result.clock)} fast, so every distance above is ${fmtDist(result.bias)} too long`
    : 'Clock trusted: the distances are used as they are';
  return `<table><thead><tr><th>Satellite</th><th>Up in the sky</th><th>Signal took</th><th>So it is</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4">${foot}</td></tr></tfoot></table>`;
}

function stepsList(person) {
  if (!result.ok) return '';
  return result.history.map((hst, k) => {
    const e = fmtDist(dist(hst.pos, person));
    const txt = k === 0 ? `Starts at the centre of the Earth, ${e} from you.` : `${e} from you${solveClock ? `, clock guess ${fmtTime(hst.bias / C)}` : ''}.`;
    return `<li class="${stepping && stepping.k === k ? 'cur' : ''}">${txt}</li>`;
  }).join('');
}

function spreadText(person) {
  if (!result.ok || !result.cov || !solveClock) return '';
  const up = unit(person), al = [-up[1], up[0]];
  const q = (u) => 2 * Math.sqrt(Math.max(0, u[0] * (result.cov[0][0] * u[0] + result.cov[0][1] * u[1]) + u[1] * (result.cov[1][0] * u[0] + result.cov[1][1] * u[1])));
  return `The pale shape is the phone's own guess of how wrong it might be: about ±${fmtDist(q(al))} along the ground and ±${fmtDist(q(up))} up and down. It gets fatter when the satellites you hear are bunched together.`;
}

function chips(states) {
  const box = $('satChips');
  if (box.children.length !== states.length) {
    box.innerHTML = states.map((s) => `<button type="button" data-sat="${s.id}" class="chip">${String(s.id).padStart(2, '0')}</button>`).join('');
  }
  states.forEach((s, i) => {
    const b = box.children[i];
    b.className = `chip ${s.state}`;
    b.setAttribute('aria-pressed', String(s.state !== 'muted'));
    b.title = s.state === 'set' ? 'Below your horizon, so you can’t hear it' : s.state === 'muted' ? 'Not listening. Click to listen' : 'Listening. Click to stop';
  });
}
$('satChips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sat]');
  if (!b) return;
  const s = sats.find((x) => x.id === +b.dataset.sat);
  s.muted = !s.muted; refresh();
});

const RULER = { lo: -10, hi: -1 };
const MARKS = [[1e-9, '1 ns → 30 cm', '30 cm'], [1e-6, '1 µs → 300 m', '300 m'], [1e-3, '1 ms → 300 km', '300 km']];
const rulerX = (s) => (100 * (Math.log10(Math.max(1e-10, s)) - RULER.lo)) / (RULER.hi - RULER.lo);
function buildRuler() {
  let html = '<div class="axis"></div>';
  MARKS.forEach(([s, lab, short], i) => {
    html += `<div class="tick" style="left:${rulerX(s)}%"></div><div class="tlab${i % 2 ? ' low' : ''}" style="left:${rulerX(s)}%"><span class="long">${lab}</span><span class="short">${short}</span></div>`;
  });
  $('ruler').innerHTML = `${html}<div class="you" id="rulerYou"></div>`;
}
function updateRuler() {
  $('rulerYou').style.left = `${rulerX(clockErr)}%`;
  $('rulerYou').textContent = clockErr ? `this phone, ${fmtTime(clockErr)} out` : 'this phone, perfect';
}

let dirty = true;
function refresh() { dirty = true; measure(); render(); }

function render() {
  const person = personPos(personAng);
  const states = satStates(person);
  const g = stepping ? stepping.history[stepping.k] : null;
  const bias = g ? g.bias : result.ok && solveClock ? result.bias : 0;
  const shown = g ? g.pos : result.ok ? result.pos : null;
  drawSky($('sky'), { sats: states, person, heard, bias, fix: result.ok ? result.pos : null, guess: g && { pos: g.pos, k: stepping.k }, pulse: playing ? performance.now() / 1000 : null });
  const span = pickSpan(shown ? dist(shown, person) : 0);
  drawClose($('close'), { person, heard, bias, fix: result.ok ? result.pos : null, cloud: g ? null : cloud, cov: solveClock && result.ok ? result.cov : null, guess: g && { pos: g.pos, k: stepping.k }, span });
  $('closeCap').textContent = `Close up, ${fmtDist(span)} across.`;
  if (dirty) {
    $('now').innerHTML = describe(person);
    $('heard').innerHTML = heardTable();
    $('spread').textContent = spreadText(person);
    chips(states);
    updateRuler();
    $('steps').innerHTML = stepsList(person);
    dirty = false;
  }
}

let last = performance.now(), lastTick = 0, lastChips = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && !stepping) {
    t += dt * SPEED;
    if (now - lastTick > 1000) { tick++; lastTick = now; dirty = true; }
    if (now - lastChips > 250) { lastChips = now; dirty = true; }
    measure();
  }
  render();
  drawStrip($('strip'), Date.now());
  requestAnimationFrame(loop);
}

const setPlay = () => setPlayButton($('play'), playing, 'the sky');
$('play').addEventListener('click', () => { playing = !playing; stepping = null; setPlay(); $('play').classList.remove('nudge'); });

const setSwitch = bindSwitch($('clockSwitch'), (side) => { solveClock = side === 'b'; setSwitch(side); stepping = null; refresh(); });
const setErr = bindChoices($('clockChoices'), 'err', (v) => { clockErr = +v; setErr(v); stepping = null; refresh(); });

$('stepBtn').addEventListener('click', async () => {
  if (!result.ok) return;
  playing = false; setPlay();
  stepping = { history: result.history, k: 0 };
  dirty = true;
  for (let k = 1; k < stepping.history.length; k++) {
    await new Promise((r) => setTimeout(r, 1100));
    if (!stepping) return;
    stepping.k = k; dirty = true;
  }
  await new Promise((r) => setTimeout(r, 1400));
  stepping = null; dirty = true;
});

// Dragging on Fig. 1: grab a satellite to move it along its orbit, or yourself to move around the Earth.
// A click without a drag switches a satellite off or on.
const skyCv = $('sky');
let grab = null;
function skyView() { const r = skyCv.getBoundingClientRect(); return new View(r.width, r.height, [0, 0], (ORBIT_R * 1.13) / (Math.min(r.width, r.height) / 2)); }
skyCv.addEventListener('pointerdown', (e) => {
  const r = skyCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, v = skyView();
  const near = (p, rad) => Math.hypot(v.px(p)[0] - x, v.px(p)[1] - y) < rad;
  const s = sats.find((q) => near(satPos(q, t), 18));
  if (s) grab = { sat: s, x, y, moved: false };
  else if (near(personPos(personAng), 22)) grab = { me: true, x, y, moved: false };
  if (grab) { skyCv.setPointerCapture(e.pointerId); stepping = null; }
});
skyCv.addEventListener('pointermove', (e) => {
  if (!grab) return;
  const r = skyCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (Math.hypot(x - grab.x, y - grab.y) > 4) grab.moved = true;
  if (!grab.moved) return;
  const p = skyView().world(x, y), ang = Math.atan2(p[1], p[0]);
  if (grab.sat) grab.sat.phase = ang - (2 * Math.PI * t) / ORBIT_S; else personAng = ang;
  refresh();
});
skyCv.addEventListener('pointerup', () => {
  if (grab && grab.sat && !grab.moved) { grab.sat.muted = !grab.sat.muted; refresh(); }
  grab = null;
});
skyCv.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault(); personAng += e.key === 'ArrowLeft' ? 0.03 : -0.03; refresh();
});

(function boot() {
  buildRuler();
  setPlay(); setSwitch('b'); setErr(clockErr);
  $('play').classList.add('nudge');
  measure();
  requestAnimationFrame(loop);
  initStreet();
  window.addEventListener('resize', () => { dirty = true; });
})();
