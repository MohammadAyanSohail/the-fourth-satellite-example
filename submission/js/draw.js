// Small drawing helpers every step shares: sizing a canvas, turning kilometres into pixels,
// the blue dot, a satellite, dragging things, and an animation loop that can pause.
import { palette as P } from './theme.js';

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

// Turns metres into pixels. `mpp` is metres per pixel; y goes up in the world but down on screen.
export class View {
  constructor(w, h, center, mpp) { this.w = w; this.h = h; this.c = center; this.mpp = mpp; }
  px(p) { return [this.w / 2 + (p[0] - this.c[0]) / this.mpp, this.h / 2 - (p[1] - this.c[1]) / this.mpp]; }
  world(x, y) { return [this.c[0] + (x - this.w / 2) * this.mpp, this.c[1] - (y - this.h / 2) * this.mpp]; }
}

export function ring(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 2 * Math.PI); }

export function label(g, txt, x, y, { size = 13, color = P.text, align = 'center', weight = 600, mono = false } = {}) {
  g.font = `${weight} ${size}px ${mono ? '"JetBrains Mono", monospace' : '"Space Grotesk", system-ui, sans-serif'}`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = P.card; g.strokeText(txt, x, y);
  g.fillStyle = color; g.fillText(txt, x, y);
}

// The blue dot, as a map app draws it: a soft halo, a white edge, a blue middle.
export function blueDot(g, x, y, r = 8) {
  ring(g, x, y, r * 2.4); g.fillStyle = P.blueSoft; g.fill();
  ring(g, x, y, r + 2.5); g.fillStyle = '#ffffff'; g.fill();
  ring(g, x, y, r); g.fillStyle = P.blue; g.fill();
}

export function satellite(g, x, y, name, { color = P.violet, faded = false } = {}) {
  g.save(); g.globalAlpha = faded ? 0.35 : 1; g.translate(x, y);
  g.fillStyle = color;
  g.fillRect(-15, -4, 9, 8); g.fillRect(6, -4, 9, 8);   // solar panels
  g.fillRect(-5, -6, 10, 12);                           // body
  g.restore();
  if (name) label(g, name, x, y - 24, { color: faded ? P.muted : P.text });
}

// A person holding a phone, standing on (x, y).
export function person(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = P.text; g.fillStyle = P.text; g.lineWidth = 2; g.lineCap = 'round';
  ring(g, 0, -20, 4); g.fill();
  g.beginPath(); g.moveTo(0, -15); g.lineTo(0, -6); g.lineTo(-4, 0); g.moveTo(0, -6); g.lineTo(4, 0);
  g.moveTo(0, -12); g.lineTo(5, -15); g.stroke();
  g.fillStyle = P.blue; g.fillRect(4, -19, 4, 6);
  g.restore();
}

// A dashed ring in the accent colour that says "you can drag this".
export function grabRing(g, x, y, r = 16) {
  g.setLineDash([4, 4]); g.strokeStyle = P.accent; g.lineWidth = 2;
  ring(g, x, y, r); g.stroke(); g.setLineDash([]);
}

// Lets the visitor drag points on a canvas. points() lists them in world metres,
// view() gives the current View, and onMove(i, worldPos) is told where point i went.
export function draggable(canvas, view, points, onMove) {
  let grabbed = -1;
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = at(e), v = view();
    grabbed = points().findIndex((p) => { const [px, py] = v.px(p); return Math.hypot(px - x, py - y) < 24; });
    if (grabbed >= 0) { canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); }
  });
  canvas.addEventListener('pointermove', (e) => { if (grabbed >= 0) onMove(grabbed, view().world(...at(e))); });
  const drop = () => { grabbed = -1; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
}

// Runs draw(now) every frame, but only while start() is in force, so hidden steps cost nothing.
export function loop(draw) {
  let id = 0, running = false;
  const tick = (now) => { draw(now); if (running) id = requestAnimationFrame(tick); };
  return {
    start() { if (!running) { running = true; id = requestAnimationFrame(tick); } },
    stop() { running = false; cancelAnimationFrame(id); },
  };
}
