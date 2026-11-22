// Every drawing on the page: the strip at the top, the sky and the close-up on Sheet 1,
// and the street and the map on Sheet 2.
import { C, EARTH_R, ORBIT_R, add, sub, mul, dot, len, unit } from './geo.js';

export const INK = {
  ink: '#1d2430', grey: '#6a6458', rule: '#bdb39c', paper: '#f4efe3', sea: '#dde6e1', land: '#e9e1cc',
  dot: '#1a73e8', soft: 'rgba(26,115,232,.16)', line: 'rgba(26,115,232,.55)', bounce: '#d9541e', block: '#a39a86',
};
const SERIF = '"Source Serif 4", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const font = (size, { mono = false, italic = false, weight = 400 } = {}) =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${mono ? MONO : SERIF}`;

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// Turns metres in the world into pixels. `up` is the world direction drawn as straight up the screen.
export class View {
  constructor(w, h, center, mpp, up = [0, 1]) {
    this.w = w; this.h = h; this.c = center; this.mpp = mpp;
    this.uy = up; this.ux = [up[1], -up[0]];
  }
  px(p) {
    const d = sub(p, this.c);
    return [this.w / 2 + dot(d, this.ux) / this.mpp, this.h / 2 - dot(d, this.uy) / this.mpp];
  }
  world(x, y) {
    const a = (x - this.w / 2) * this.mpp, b = (this.h / 2 - y) * this.mpp;
    return add(this.c, add(mul(this.ux, a), mul(this.uy, b)));
  }
}

// A circle of any size. One 20,000 km across won't draw as an arc when a pixel is 10 cm,
// so big ones are drawn as the short stretch that passes through the view.
function ringPoints(v, c, r, n = 96) {
  const mid = v.world(v.w / 2, v.h / 2);
  const a0 = Math.atan2(mid[1] - c[1], mid[0] - c[0]);
  const half = Math.min(Math.PI, (2 * Math.hypot(v.w, v.h) * v.mpp) / r);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 - half + (2 * half * i) / n;
    out.push(v.px([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]));
  }
  return out;
}
function ring(g, v, c, r) {
  g.beginPath();
  if (r <= 0) return;
  if (r / v.mpp < 4000) { const [x, y] = v.px(c); g.arc(x, y, r / v.mpp, 0, 2 * Math.PI); return; }
  ringPoints(v, c, r).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
}
function disc(g, v, c, r) {
  if (r / v.mpp < 4000) { ring(g, v, c, r); return; }
  const depth = 3 * Math.hypot(v.w, v.h) * v.mpp;
  const outer = ringPoints(v, c, r), inner = ringPoints(v, c, r - depth).reverse();
  g.beginPath();
  [...outer, ...inner].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function label(g, txt, x, y, { f = font(13), color = INK.ink, align = 'left', halo = INK.paper } = {}) {
  g.font = f; g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = halo; g.lineWidth = 4; g.strokeText(txt, x, y);
  g.fillStyle = color; g.fillText(txt, x, y);
}

export function blueDot(g, x, y, r = 7) {
  g.beginPath(); g.arc(x, y, r + 2.5, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fillStyle = INK.dot; g.fill();
  g.shadowBlur = 0;
}

function satIcon(g, x, y, ang, state, id) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const on = state === 'heard';
  g.fillStyle = on ? INK.dot : state === 'muted' ? INK.paper : '#e4ddcb';
  g.strokeStyle = state === 'set' ? INK.block : INK.ink; g.lineWidth = 1.2;
  g.fillRect(-14, -4, 8, 8); g.strokeRect(-14, -4, 8, 8);
  g.fillRect(6, -4, 8, 8); g.strokeRect(6, -4, 8, 8);
  g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
  g.fillStyle = on ? INK.ink : INK.paper;
  g.fillRect(-4, -5, 8, 10); g.strokeRect(-4, -5, 8, 10);
  if (state === 'muted') { g.strokeStyle = INK.bounce; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.stroke(); }
  g.restore();
  label(g, String(id).padStart(2, '0'), x, y - 17, { f: font(12, { mono: true, weight: 600 }), color: state === 'set' ? INK.block : INK.ink, align: 'center' });
}

function person(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = INK.ink; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.arc(0, -19, 3.6, 0, 2 * Math.PI); g.fillStyle = INK.ink; g.fill();
  g.beginPath(); g.moveTo(0, -15); g.lineTo(0, -6); g.moveTo(0, -6); g.lineTo(-4, 0); g.moveTo(0, -6); g.lineTo(4, 0);
  g.moveTo(0, -12); g.lineTo(-5, -8); g.moveTo(0, -12); g.lineTo(5, -14); g.stroke();
  g.fillStyle = INK.dot; g.fillRect(4, -17, 3, 5);
  g.restore();
}

function guessMark(g, x, y, k) {
  g.strokeStyle = INK.bounce; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.moveTo(x, y - 14); g.lineTo(x, y + 14); g.stroke();
  label(g, k ? `guess ${k}` : 'first guess', x + 16, y - 12, { f: font(14, { italic: true }), color: INK.bounce });
}

// Fig. 1: the Earth, the orbit and the satellites, to scale.
export function drawSky(cv, s) {
  const { g, w, h } = fitCanvas(cv);
  const v = new View(w, h, [0, 0], (ORBIT_R * 1.13) / (Math.min(w, h) / 2));
  const P = v.px(s.person);

  g.lineWidth = 1.1; g.strokeStyle = INK.line;
  for (const m of s.heard) { ring(g, v, m.pos, m.took * C - s.bias); g.stroke(); }

  g.setLineDash([2, 5]); g.strokeStyle = INK.rule; g.lineWidth = 1;
  ring(g, v, [0, 0], ORBIT_R); g.stroke(); g.setLineDash([]);

  disc(g, v, [0, 0], EARTH_R); g.fillStyle = INK.sea; g.fill();
  g.strokeStyle = INK.rule; g.lineWidth = 0.8;
  for (let k = 1; k <= 4; k++) { ring(g, v, [0, 0], EARTH_R * (1 - k * 0.18)); g.stroke(); }
  disc(g, v, [0, 0], EARTH_R); g.strokeStyle = INK.ink; g.lineWidth = 1.3; g.stroke();
  label(g, 'the Earth', ...v.px([0, -EARTH_R * 0.45]), { f: font(14, { italic: true }), color: INK.grey, align: 'center', halo: INK.sea });

  const up = unit(s.person), along = [-up[1], up[0]];
  const a = v.px(add(s.person, mul(along, ORBIT_R * 1.4))), b = v.px(add(s.person, mul(along, -ORBIT_R * 1.4)));
  g.setLineDash([6, 4]); g.strokeStyle = INK.grey; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.setLineDash([]);
  const hl = v.px(add(s.person, add(mul(along, -EARTH_R * 1.7), mul(up, ORBIT_R * 0.03))));
  label(g, 'your horizon', hl[0], hl[1], { f: font(13, { italic: true }), color: INK.grey, align: 'center' });

  for (const m of s.heard) {
    const S = v.px(m.pos);
    g.strokeStyle = INK.line; g.lineWidth = 1; g.beginPath(); g.moveTo(...S); g.lineTo(...P); g.stroke();
    if (s.pulse !== null) {
      g.fillStyle = INK.dot;
      for (let q = 0; q < 3; q++) {
        const f = (s.pulse * 0.5 + q / 3 + m.id * 0.137) % 1;
        g.beginPath(); g.arc(S[0] + (P[0] - S[0]) * f, S[1] + (P[1] - S[1]) * f, 2.2, 0, 2 * Math.PI); g.fill();
      }
    }
  }
  for (const sat of s.sats) {
    const [x, y] = v.px(sat.pos);
    satIcon(g, x, y, Math.atan2(sat.pos[0], sat.pos[1]), sat.state, sat.id);
  }
  g.fillStyle = INK.ink; g.beginPath(); g.arc(P[0], P[1], 4, 0, 2 * Math.PI); g.fill();
  label(g, 'you', P[0] + up[0] * 0 + 10, P[1] + 12, { f: font(14, { weight: 600 }) });
  if (s.guess) guessMark(g, ...v.px(s.guess.pos), s.guess.k);
  else if (s.fix) blueDot(g, ...v.px(s.fix), 5);
}

const SPANS = [60, 600, 6e3, 6e4, 6e5, 6e6, 4e7];
export function pickSpan(err) { return SPANS.find((sp) => err < 0.32 * sp) || SPANS[SPANS.length - 1]; }
const BARS = [10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const fmtBar = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString()} km` : `${m} m`);

// Fig. 2: the same thing close up, centred on you, at whatever zoom fits the error.
export function drawClose(cv, s) {
  const { g, w, h } = fitCanvas(cv);
  const up = unit(s.person);
  const mpp = s.span / w;
  const v = new View(w, h, add(s.person, mul(up, h * 0.22 * mpp)), mpp, up);
  const P = v.px(s.person);

  const bar = BARS.filter((b) => b / mpp < w * 0.3).pop() || BARS[0];
  g.strokeStyle = 'rgba(29,36,48,.07)'; g.lineWidth = 1;
  const step = bar / mpp;
  for (let x = P[0] % step; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = P[1] % step; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

  disc(g, v, [0, 0], EARTH_R); g.fillStyle = INK.land; g.fill();
  ring(g, v, [0, 0], EARTH_R); g.strokeStyle = INK.ink; g.lineWidth = 1.4; g.stroke();

  g.lineWidth = 1.4; g.strokeStyle = INK.line;
  for (const m of s.heard) { ring(g, v, m.pos, m.took * C - s.bias); g.stroke(); }

  if (s.cloud) {
    g.fillStyle = 'rgba(26,115,232,.35)';
    for (const p of s.cloud) { const [x, y] = v.px(p); g.fillRect(x - 1, y - 1, 2, 2); }
  }
  person(g, P[0], P[1], 1.1);

  const target = s.guess ? s.guess.pos : s.fix;
  if (target) {
    const [x, y] = v.px(target);
    const inside = x > 8 && x < w - 8 && y > 8 && y < h - 8;
    if (inside) {
      if (!s.guess && s.cov) ellipse(g, v, target, s.cov);
      if (s.guess) guessMark(g, x, y, s.guess.k); else blueDot(g, x, y);
    } else {
      const d = sub([x, y], P), k = Math.min((w / 2 - 30) / Math.abs(d[0] || 1e-9), (h / 2 - 30) / Math.abs(d[1] || 1e-9));
      const ex = w / 2 + d[0] * Math.min(1, k) * 0.9, ey = h / 2 + d[1] * Math.min(1, k) * 0.9;
      const ang = Math.atan2(d[1], d[0]);
      g.save(); g.translate(ex, ey); g.rotate(ang); g.fillStyle = s.guess ? INK.bounce : INK.dot;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill(); g.restore();
      label(g, `${s.guess ? 'the guess' : 'the dot'} is out this way`, Math.min(w - 10, Math.max(10, ex)), ey + (ey > h / 2 ? -18 : 18),
        { f: font(14, { italic: true }), align: ex > w / 2 ? 'right' : 'left', color: s.guess ? INK.bounce : INK.dot });
    }
  }

  g.strokeStyle = INK.ink; g.lineWidth = 2;
  g.beginPath(); g.moveTo(14, h - 14); g.lineTo(14 + bar / mpp, h - 14); g.moveTo(14, h - 19); g.lineTo(14, h - 9); g.moveTo(14 + bar / mpp, h - 19); g.lineTo(14 + bar / mpp, h - 9); g.stroke();
  label(g, fmtBar(bar), 18 + bar / mpp, h - 14, { f: font(13, { mono: true }), halo: INK.land });
}

function ellipse(g, v, c, cov) {
  const [[a, b], [, d]] = cov;
  const m = (a + d) / 2, q = Math.sqrt(((a - d) / 2) ** 2 + b * b);
  const th = 0.5 * Math.atan2(2 * b, a - d);
  const e1 = [Math.cos(th), Math.sin(th)];
  const [x, y] = v.px(c);
  const rot = Math.atan2(-dot(e1, v.uy), dot(e1, v.ux));
  g.beginPath();
  g.ellipse(x, y, Math.max(1, (2 * Math.sqrt(m + q)) / v.mpp), Math.max(1, (2 * Math.sqrt(Math.max(0, m - q))) / v.mpp), rot, 0, 2 * Math.PI);
  g.fillStyle = INK.soft; g.fill(); g.strokeStyle = 'rgba(26,115,232,.45)'; g.lineWidth = 1; g.stroke();
}

// The strip at the top. It is decoration: the rings are not to scale and the clock is your computer's.
export function drawStrip(cv, now) {
  const { g, w, h } = fitCanvas(cv);
  const sx = 70, sy = h / 2, px = w - 80;
  g.strokeStyle = INK.line; g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    const r = (((now / 1000) * 0.25 + k / 6) % 1) * (px - sx);
    g.globalAlpha = 1 - r / (px - sx);
    g.beginPath(); g.arc(sx, sy, r, -0.32, 0.32); g.stroke();
  }
  g.globalAlpha = 1;
  satIcon(g, sx, sy, Math.PI / 2, 'heard', 7);
  const d = new Date(now);
  const t = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
  label(g, `“This is 07. I am here. My clock says ${t}.”`, sx + 30, sy - 28, { f: font(15, { italic: true }) });
  g.strokeStyle = INK.ink; g.lineWidth = 1.4; g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(px - 16, sy - 30, 32, 60, 6); g.fill(); g.stroke();
  g.fillStyle = INK.land; g.fillRect(px - 12, sy - 24, 24, 46);
  blueDot(g, px, sy - 2, 4);
  label(g, 'your phone listens, and never answers', px - 26, sy + 30, { f: font(15, { italic: true }), align: 'right' });
}

// Sheet 2, side view: the street, the buildings and the path of each signal.
export function drawStreet(cv, s) {
  const { g, w, h } = fitCanvas(cv);
  const top = Math.max(s.hL, s.hR) * 1.18 + 8;
  const mpp = Math.max((s.W + 34) / w, top / (h - 26));
  const v = new View(w, h, [s.W / 2, (h / 2 - 22) * mpp], mpp);
  const [gx0, gy] = v.px([-60, 0]), [gx1] = v.px([s.W + 60, 0]);

  g.fillStyle = INK.land; g.fillRect(0, gy, w, h - gy);
  for (const [x0, x1, bh, name] of [[-60, 0, s.hL, 'left'], [s.W, s.W + 60, s.hR, 'right']]) {
    const [ax, ay] = v.px([x0, bh]), [bx] = v.px([x1, 0]);
    g.fillStyle = '#d8dee0'; g.fillRect(ax, ay, bx - ax, gy - ay);
    g.strokeStyle = 'rgba(29,36,48,.16)'; g.lineWidth = 1;
    for (let fy = 3.5; fy < bh; fy += 3.5) { const [, yy] = v.px([0, fy]); g.beginPath(); g.moveTo(ax, yy); g.lineTo(bx, yy); g.stroke(); }
    g.strokeStyle = INK.ink; g.lineWidth = 1.4; g.strokeRect(ax, ay, bx - ax, gy - ay);
    label(g, `${Math.round(bh)} m of glass`, name === 'left' ? bx - 6 : ax + 6, ay + 12, { f: font(13, { italic: true }), align: name === 'left' ? 'right' : 'left', halo: '#d8dee0' });
  }
  g.strokeStyle = INK.ink; g.lineWidth = 1.4; g.beginPath(); g.moveTo(gx0, gy); g.lineTo(gx1, gy); g.stroke();

  const P = v.px(s.phone);
  for (const m of s.sats) {
    const u = [Math.cos(m.theta), -Math.sin(m.theta)];
    const from = m.kind === 'bounce' ? v.px([m.wall === 'L' ? 0 : s.W, m.hitY]) : P;
    const tEdge = Math.min(u[0] > 0 ? (w - from[0]) / u[0] : u[0] < 0 ? -from[0] / u[0] : 1e9, u[1] < 0 ? -from[1] / u[1] : 1e9);
    const E = [from[0] + u[0] * tEdge, from[1] + u[1] * tEdge];
    if (m.kind === 'direct') {
      g.strokeStyle = INK.dot; g.lineWidth = 2; g.setLineDash([]);
      g.beginPath(); g.moveTo(...P); g.lineTo(...E); g.stroke();
    } else if (m.kind === 'bounce') {
      g.strokeStyle = INK.bounce; g.lineWidth = 2; g.setLineDash([7, 4]);
      g.beginPath(); g.moveTo(...E); g.lineTo(...from); g.lineTo(...P); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK.bounce; g.beginPath(); g.arc(from[0], from[1], 3.5, 0, 2 * Math.PI); g.fill();
    } else {
      const roofH = u[0] > 0 ? s.hR : s.hL;
      const stop = v.px([s.phone[0] + (Math.cos(m.theta) * (roofH - s.phone[1])) / Math.sin(m.theta), roofH]);
      if (stop[0] < 0 || stop[0] > w) continue;  // it hits the building somewhere off the picture
      g.strokeStyle = INK.block; g.lineWidth = 1.4; g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(...E); g.lineTo(...stop); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(stop[0] - 5, stop[1] - 5); g.lineTo(stop[0] + 5, stop[1] + 5); g.moveTo(stop[0] + 5, stop[1] - 5); g.lineTo(stop[0] - 5, stop[1] + 5); g.stroke();
    }
    const lx = Math.min(w - 14, Math.max(14, E[0] - u[0] * 14)), ly = Math.max(10, E[1] - u[1] * 14);
    label(g, String(m.id).padStart(2, '0'), lx, ly, { f: font(12, { mono: true, weight: 600 }), color: m.kind === 'blocked' ? INK.block : m.kind === 'bounce' ? INK.bounce : INK.dot, align: 'center' });
  }
  person(g, P[0], gy, 1.2);
  if (s.fix) {
    const [fx, fy] = v.px(s.fix);
    g.globalAlpha = 0.75; blueDot(g, Math.max(6, Math.min(w - 6, fx)), Math.max(6, Math.min(gy + 30, fy)), 5); g.globalAlpha = 1;
  }
}

// Sheet 2, from above: the map your phone would show, with where the dot has been.
export function drawMap(cv, s) {
  const { g, w, h } = fitCanvas(cv);
  const mpp = (s.W + 30) / w;
  const v = new View(w, h, [s.W / 2, 0], mpp);
  const [x0] = v.px([0, 0]), [x1] = v.px([s.W, 0]);
  const walk = 3 / mpp;
  g.fillStyle = '#ece6d6'; g.fillRect(0, 0, x0, h); g.fillRect(x1, 0, w - x1, h);
  g.strokeStyle = 'rgba(29,36,48,.18)'; g.lineWidth = 1;
  for (const [a, b] of [[0, x0], [x1, w]]) for (let y = 18; y < h; y += 70) g.strokeRect(a + 8, y, b - a - 16, 52);
  g.fillStyle = '#ffffff'; g.fillRect(x0, 0, x1 - x0, h);
  g.fillStyle = '#f1f1ef'; g.fillRect(x0, 0, walk, h); g.fillRect(x1 - walk, 0, walk, h);
  g.strokeStyle = '#d9b44a'; g.lineWidth = 1.5; g.setLineDash([10, 9]);
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);
  g.strokeStyle = INK.ink; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, h); g.moveTo(x1, 0); g.lineTo(x1, h); g.stroke();
  label(g, 'Glass St', w / 2 + 8, 16, { f: font(12, { italic: true }), color: INK.grey, halo: '#fff' });

  const yNow = h * 0.62;
  s.trail.forEach((x, i) => {
    const age = s.trail.length - 1 - i;
    g.fillStyle = `rgba(26,115,232,${0.5 * (1 - age / s.trail.length)})`;
    g.beginPath(); g.arc(v.px([x, 0])[0], yNow - age * 7, 3, 0, 2 * Math.PI); g.fill();
  });
  const [ux] = v.px([s.px, 0]);
  g.strokeStyle = INK.ink; g.lineWidth = 1.5; g.beginPath(); g.arc(ux, yNow + 26, 6, 0, 2 * Math.PI); g.stroke();
  label(g, 'you', ux, yNow + 42, { f: font(12, { weight: 600 }), align: 'center', halo: '#fff' });
  if (s.fix) {
    const fx = Math.max(10, Math.min(w - 10, v.px([s.fix[0], 0])[0]));
    if (s.halo) { g.beginPath(); g.arc(fx, yNow, Math.max(9, s.halo / mpp), 0, 2 * Math.PI); g.fillStyle = INK.soft; g.fill(); }
    blueDot(g, fx, yNow);
  }
}
