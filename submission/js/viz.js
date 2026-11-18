// Every drawing on the page: the call diagram, Fig. 1, the spectrum and the spectrograms.
import { fft, hamming } from './dsp.js';

export const INK = { ink: '#161616', blue: '#1f3fd1', wash: '#e3e8fd', paper: '#ffffff', grey: '#7a7a7a' };
const SERIF = 'Alegreya, Georgia, serif';
const SC = '"Alegreya SC", Alegreya, Georgia, serif';
const font = (size, { italic = false, weight = 400, sc = false } = {}) =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${sc ? SC : SERIF}`;

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h, dpr };
}

function hatchLines(g, box, angle, gap) {
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  g.beginPath();
  for (let d = -R; d <= R; d += gap) {
    const px = cx - sa * d, py = cy + ca * d;
    g.moveTo(px - ca * R, py - sa * R); g.lineTo(px + ca * R, py + sa * R);
  }
  g.stroke();
}
function hatch(g, pathFn, box, angle, gap, width, color = INK.ink) {
  g.save(); pathFn(g); g.clip();
  g.strokeStyle = color; g.lineWidth = width; hatchLines(g, box, angle, gap);
  g.restore();
}
function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function stipple(g, pathFn, box, gap, r, keep = 0.8, color = INK.ink) {
  g.save(); pathFn(g); g.clip();
  g.fillStyle = color; g.beginPath();
  for (let i = Math.floor(box[0] / gap); i * gap < box[2]; i++) {
    for (let j = Math.floor(box[1] / gap); j * gap < box[3]; j++) {
      if (hash(i, j) > keep) continue;
      const x = (i + hash(j + 3, i)) * gap, y = (j + hash(i + 11, j)) * gap;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  g.fill(); g.restore();
}
function letter(g, txt, x, y, f, color = INK.ink, align = 'left') {
  g.font = f; g.textAlign = align;
  g.lineJoin = 'round'; g.strokeStyle = INK.paper; g.lineWidth = 4; g.strokeText(txt, x, y);
  g.fillStyle = color; g.fillText(txt, x, y);
}

function catmull(points, samplesPerSeg = 20) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function bez(p0, c1, c2, p1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]);
  }
  return out;
}
function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * d[d.length - 1];
    while (j < d.length - 2 && d[j + 1] < target) j++;
    const f = (target - d[j]) / (d[j + 1] - d[j] || 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return out;
}
const poly = (g, pts, close = true) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function headPath(g) {
  g.beginPath();
  g.moveTo(114, 410);
  g.bezierCurveTo(110, 352, 98, 306, 98, 262);
  g.bezierCurveTo(84, 204, 80, 104, 140, 62);
  g.bezierCurveTo(190, 26, 268, 34, 292, 84);
  g.bezierCurveTo(300, 100, 302, 112, 300, 124);
  g.bezierCurveTo(304, 132, 310, 140, 318, 150);
  g.bezierCurveTo(326, 160, 338, 166, 340, 174);
  g.bezierCurveTo(341, 181, 333, 184, 322, 183);
  g.bezierCurveTo(320, 187, 322, 190, 326, 193);
  g.bezierCurveTo(328, 197, 322, 200, 313, 200);
  g.bezierCurveTo(322, 203, 325, 209, 318, 214);
  g.bezierCurveTo(312, 218, 312, 226, 316, 236);
  g.bezierCurveTo(318, 248, 306, 258, 290, 262);
  g.bezierCurveTo(270, 268, 252, 270, 244, 276);
  g.bezierCurveTo(238, 300, 238, 350, 241, 410);
}
function headFill(g) { headPath(g); g.closePath(); }

const HAIR_OUT_PTS = [
  ...bez([296, 96], [286, 40], [206, 14], [142, 46]),
  ...bez([142, 46], [98, 70], [76, 128], [86, 186]),
  ...bez([86, 186], [88, 212], [94, 236], [100, 250]),
];
const HAIR_IN_PTS = [
  ...bez([296, 96], [286, 104], [276, 94], [266, 100]),
  ...bez([266, 100], [252, 108], [240, 96], [226, 104]),
  ...bez([226, 104], [214, 112], [198, 108], [186, 122]),
  ...bez([186, 122], [170, 128], [160, 134], [128, 156]),
  ...bez([128, 156], [120, 172], [120, 190], [116, 204]),
  ...bez([116, 204], [112, 220], [106, 236], [100, 250]),
];
function hairPath(g) { poly(g, [...HAIR_OUT_PTS, ...HAIR_IN_PTS.slice().reverse()]); }
const HAIR_N = 60;
const HAIR_OUT = resample(HAIR_OUT_PTS, HAIR_N);
const HAIR_IN = resample(HAIR_IN_PTS, HAIR_N);

function hair(g, px) {
  g.save(); g.fillStyle = INK.paper; hairPath(g); g.fill(); hairPath(g); g.clip();
  g.strokeStyle = INK.ink; g.lineCap = 'round';
  const K = Math.max(8, Math.ceil(84 / (2.3 * px)));
  for (let k = 1; k < K; k++) {
    const f = k / K;
    const lock = 0.5 + 0.5 * Math.sin(k * 0.9 + 1.3);
    const a = Math.floor(HAIR_N * (0.02 + 0.1 * hash(k, 1))), b = HAIR_N - 1 - Math.floor(HAIR_N * 0.12 * hash(k, 2));
    for (let i = a; i < b; i++) {
      const t = (i - a) / (b - a);
      const P = (j) => [HAIR_OUT[j][0] + (HAIR_IN[j][0] - HAIR_OUT[j][0]) * f, HAIR_OUT[j][1] + (HAIR_IN[j][1] - HAIR_OUT[j][1]) * f];
      const [x0, y0] = P(i), [x1, y1] = P(i + 1);
      g.lineWidth = (0.35 + 0.75 * Math.sin(Math.PI * t)) * (0.5 + 0.6 * lock) * px;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  g.restore();
  g.strokeStyle = INK.ink; g.lineWidth = 1.3 * px; hairPath(g); g.stroke();
}

function ear(g, px) {
  const outer = (q) => {
    q.beginPath();
    q.moveTo(172, 126);
    q.bezierCurveTo(166, 110, 144, 106, 136, 122);
    q.bezierCurveTo(128, 138, 130, 160, 136, 174);
    q.bezierCurveTo(140, 186, 146, 194, 155, 193);
    q.bezierCurveTo(162, 192, 164, 184, 166, 177);
    q.bezierCurveTo(172, 172, 176, 160, 174, 148);
    q.bezierCurveTo(174, 140, 174, 132, 172, 126);
    q.closePath();
  };
  const concha = (q) => {
    q.beginPath();
    q.moveTo(160, 147);
    q.bezierCurveTo(167, 148, 170, 157, 168, 166);
    q.bezierCurveTo(166, 174, 157, 176, 152, 170);
    q.bezierCurveTo(148, 163, 151, 151, 160, 147);
    q.closePath();
  };
  const scapha = (q) => {
    q.beginPath();
    q.moveTo(167, 127); q.bezierCurveTo(160, 117, 146, 116, 141, 126);
    q.bezierCurveTo(136, 138, 136, 156, 141, 170);
    q.bezierCurveTo(144, 160, 143, 142, 147, 132);
    q.bezierCurveTo(152, 124, 160, 124, 167, 127);
    q.closePath();
  };
  g.fillStyle = INK.paper; outer(g); g.fill();
  hatch(g, scapha, [130, 110, 175, 175], 0.9, 1.9 * px, 0.55 * px);
  hatch(g, concha, [145, 140, 175, 180], -0.6, 1.5 * px, 0.7 * px);
  hatch(g, concha, [145, 140, 175, 180], 0.6, 2.2 * px, 0.5 * px);
  g.strokeStyle = INK.ink;
  g.lineWidth = 1.3 * px; outer(g); g.stroke();
  g.lineWidth = 0.9 * px; g.beginPath();
  g.moveTo(167, 127); g.bezierCurveTo(160, 117, 146, 116, 141, 126); g.bezierCurveTo(136, 138, 136, 156, 141, 170);
  g.moveTo(148, 178); g.bezierCurveTo(146, 164, 148, 146, 154, 136); g.bezierCurveTo(158, 130, 164, 129, 168, 131);
  g.moveTo(154, 136); g.quadraticCurveTo(150, 128, 152, 122);
  g.stroke();
  g.fillStyle = INK.ink; g.beginPath(); g.ellipse(167, 162, 2.6, 3.4, 0.3, 0, Math.PI * 2); g.fill();
  g.lineWidth = 1 * px; g.beginPath(); g.moveTo(171, 156); g.quadraticCurveTo(177, 162, 171, 170); g.stroke();
  g.lineWidth = 0.55 * px; g.beginPath();
  for (let i = 0; i < 4; i++) { g.moveTo(146 + i * 2.6, 186 - i * 0.4); g.lineTo(149 + i * 2.6, 190 - i * 0.4); }
  g.stroke();
}

function face(g, px) {
  g.strokeStyle = INK.ink; g.fillStyle = INK.ink;
  g.lineWidth = 1.2 * px; g.beginPath(); g.moveTo(272, 132); g.quadraticCurveTo(282, 125, 292, 132); g.quadraticCurveTo(283, 137, 274, 134); g.stroke();
  g.beginPath(); g.arc(285, 131.5, 2.8, 0, Math.PI * 2); g.fill();
  g.lineWidth = 0.7 * px; g.beginPath(); g.moveTo(273, 128); g.quadraticCurveTo(282, 121, 291, 127); g.stroke();
  for (const [a, b] of [[276, 128.5], [280, 126.5], [284, 126], [288, 126.6]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(a - 1.5, b - 3.5); g.stroke(); }
  g.lineWidth = 0.9 * px; g.beginPath();
  for (let i = 0; i < 9; i++) { const x = 266 + i * 3.6, y = 116 - Math.sin((i / 8) * Math.PI) * 5; g.moveTo(x, y + 2.5); g.lineTo(x + 4, y - 1.5); }
  g.stroke();
  g.lineWidth = 0.55 * px; g.beginPath();
  for (let i = 0; i < 6; i++) { g.moveTo(262 + i * 2.2, 133 + i * 0.4); g.lineTo(265 + i * 2.2, 138 + i * 0.4); }
  for (let i = 0; i < 7; i++) { g.moveTo(232 + i * 3, 112 + i * 1.2); g.lineTo(236 + i * 3, 120 + i * 1.2); }
  g.stroke();
  ear(g, px);
}

function portrait(g, px) {
  g.save(); g.fillStyle = INK.paper; headFill(g); g.fill(); g.restore();
  g.save(); headFill(g); g.clip();
  g.strokeStyle = INK.ink; g.lineWidth = 0.7 * px;
  g.beginPath();
  for (let r = 0; r < 34; r += 3.2 * px) { g.moveTo(98 + r, 262); g.bezierCurveTo(98 + r, 306, 110 + r, 352, 114 + r, 410); }
  for (let i = 0; i < 10; i++) { const x = 250 + i * 6; g.moveTo(x, 268 - i * 0.8); g.lineTo(x - 7, 290); }
  g.stroke(); g.restore();
  hair(g, px);
  g.fillStyle = INK.paper; lipsPath(g); g.fill();
  hatch(g, lipsPath, [300, 180, 330, 220], -0.3, 1.8 * px, 0.6 * px);
  g.strokeStyle = INK.ink; g.lineWidth = 0.9 * px; lipsPath(g); g.stroke();
  g.lineWidth = 1.1 * px; g.beginPath(); g.moveTo(323, 176); g.quadraticCurveTo(331, 180, 322, 182); g.stroke();
  face(g, px);
  g.strokeStyle = INK.ink; g.lineWidth = 1.5 * px; headPath(g); g.stroke();
}

function lipsPath(g) {
  g.beginPath();
  g.moveTo(320, 185); g.bezierCurveTo(326, 190, 329, 196, 313, 200); g.lineTo(304, 196); g.bezierCurveTo(308, 192, 314, 188, 320, 185); g.closePath();
  g.moveTo(313, 201); g.bezierCurveTo(325, 204, 326, 211, 318, 216); g.bezierCurveTo(312, 214, 306, 210, 303, 206); g.closePath();
}

const Pf = (pts) => (g) => poly(g, pts);
const B = (...segs) => segs.flat();
function blob(pts, n = 10) {
  const out = [];
  const L = pts.length;
  for (let i = 0; i < L; i++) {
    const p0 = pts[(i - 1 + L) % L], p1 = pts[i], p2 = pts[(i + 1) % L], p3 = pts[(i + 2) % L];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  return out;
}
const TONE = { tissue: '#f2efea', tongue: '#e4ddd2', bone: '#d3ccc1' };

// Fig. 1 is drawn in the pixel space of a plate from Gray's Anatomy (1918), mirrored.
// TRACT is the centre line of the airway, from the vocal folds to the lips.
const TRACT = catmull([[380, 905], [372, 830], [330, 745], [292, 660], [290, 585], [326, 522], [420, 466], [540, 440], [640, 441], [740, 459]], 24);
const TRACT_LEN = (() => {
  const d = [0];
  for (let i = 1; i < TRACT.length; i++) d.push(d[i - 1] + Math.hypot(TRACT[i][0] - TRACT[i - 1][0], TRACT[i][1] - TRACT[i - 1][1]));
  return d;
})();
const VIEW_FULL = [-350, -480, 870, 1012];
const VIEW_CROP = [40, 60, 880, 1120];
const nose = (pts) => pts.map(([x, y]) => {
  const w = Math.max(0, Math.min(1, (358 - y) / 30)) * Math.max(0, Math.min(1, (x - 600) / 40));
  return [x - (x - 600) * 0.24 * w, y];
});
const HEAD_BACK = catmull([[-96, 1140], [-92, 900], [-84, 770], [-74, 660], [-82, 570], [-130, 490], [-210, 400], [-286, 260], [-322, 80],
  [-310, -100], [-252, -262], [-128, -392], [66, -460], [292, -450], [446, -372], [538, -260], [582, -140], [590, -40], [584, 40], [574, 70]], 12);

const SKIN = nose(B(
  bez([574, 70], [578, 88], [576, 96], [582, 104]),
  bez([582, 104], [640, 150], [742, 248], [790, 316]),
  bez([790, 316], [800, 332], [796, 350], [776, 356]),
  bez([776, 356], [762, 360], [748, 354], [736, 362]),
  bez([736, 362], [732, 392], [742, 420], [752, 442]),
  bez([752, 442], [750, 452], [742, 457], [732, 458]),
  bez([732, 458], [746, 464], [754, 476], [752, 490]),
  bez([752, 490], [750, 504], [738, 514], [724, 522]),
  bez([724, 522], [736, 546], [752, 584], [750, 624]),
  bez([750, 624], [748, 664], [722, 690], [684, 700]),
  bez([684, 700], [640, 712], [560, 724], [520, 740]),
  bez([520, 740], [508, 768], [514, 820], [524, 868]),
  bez([524, 868], [516, 930], [512, 1000], [512, 1140]),
));
const ix = (pt) => SKIN.findIndex(([x, y]) => x === pt[0] && y === pt[1]);
const SKIN_TOP = SKIN.slice(0, ix([736, 362]) + 1);
const SKIN_LOW = SKIN.slice(ix([724, 522]));
const LIP_UP = SKIN.slice(ix([736, 362]), ix([732, 458]) + 1);
const LIP_LOW = SKIN.slice(ix([732, 458]), ix([724, 522]) + 1);
const headR = Pf([...HEAD_BACK, ...SKIN_TOP, [714, 380], [706, 458], [712, 522], ...SKIN_LOW]);
const skinLine = (g) => { poly(g, [...HEAD_BACK, ...SKIN_TOP], false); g.stroke(); poly(g, SKIN_LOW, false); };

function band(center, thick) {
  const L = [], R = [], n = center.length;
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    const t = thick(i / (n - 1));
    L.push([center[i][0] + nx * t, center[i][1] + ny * t]); R.push([center[i][0] - nx * t, center[i][1] - ny * t]);
  }
  return [...L, ...R.reverse()];
}
const lerpPts = (pts, t) => { const x = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), f = x - i; return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; };
const SKULL_BASE = band(catmull([[566, 30], [582, 90], [564, 120], [500, 122], [440, 132], [412, 168], [404, 236], [392, 282], [340, 302], [292, 324], [266, 372], [250, 420], [232, 446]], 10),
  (t) => lerpPts([[0, 12], [0, 11], [0, 9], [0, 9], [0, 22], [0, 26], [0, 18], [0, 12]], t));
const NASAL_BONE = band(catmull([[584, 100], [604, 122], [628, 150]], 8), (t) => 6 - 2 * t);
const NASAL_AIR = nose(B(
  [[748, 353]], bez([748, 353], [774, 336], [772, 310], [756, 290]),
  bez([756, 290], [730, 250], [690, 196], [640, 160]),
  bez([640, 160], [600, 140], [540, 138], [480, 142]),
  bez([480, 142], [440, 146], [416, 166], [414, 200]),
  [[410, 262], [398, 296]], bez([398, 296], [360, 308], [312, 316], [286, 334]),
  bez([286, 334], [266, 356], [262, 420], [266, 470]),
  bez([266, 470], [270, 520], [278, 546], [294, 556]),
  bez([294, 520], [296, 470], [314, 422], [348, 390]),
  bez([348, 390], [380, 374], [430, 368], [470, 364]),
  [[610, 360], [700, 364]],
));
const TURBINATES = [
  blob([[700, 300], [670, 282], [560, 284], [450, 298], [372, 316], [366, 328], [410, 334], [530, 326], [650, 318], [704, 312]]),
  blob([[650, 222], [600, 208], [500, 220], [410, 248], [396, 260], [432, 266], [540, 252], [632, 236]]),
  blob([[556, 172], [500, 166], [436, 184], [420, 196], [456, 200], [522, 188]]),
];
const PALATE = blob([[376, 388], [440, 370], [560, 362], [660, 362], [708, 366], [704, 382], [694, 402], [684, 418], [668, 420], [650, 410], [600, 404], [470, 402], [390, 404]], 8);
const VELUM = blob([[378, 390], [334, 400], [306, 436], [296, 500], [296, 560], [304, 588], [316, 574], [320, 520], [334, 462], [362, 422], [394, 404]], 8);
const UPPER_TOOTH = blob([[668, 414], [684, 414], [692, 432], [698, 450], [694, 458], [684, 456], [672, 436]], 6);
const LOWER_TOOTH = blob([[676, 498], [690, 496], [692, 478], [690, 464], [684, 460], [678, 470], [675, 486]], 6);
const MANDIBLE = blob([[664, 494], [700, 490], [716, 524], [726, 576], [720, 628], [700, 672], [670, 682], [644, 664], [640, 630], [646, 600], [652, 540]], 8);
const HYOID = blob([[462, 754], [480, 746], [500, 752], [500, 764], [482, 770], [464, 766]], 6);
const THYROID = blob([[478, 800], [494, 830], [498, 880], [488, 922], [440, 930], [380, 928], [346, 920], [338, 880], [336, 830], [344, 800], [384, 812], [440, 814]], 8);
const CRICOID = blob([[340, 930], [420, 934], [430, 956], [420, 974], [352, 974], [338, 952]], 8);
const WINDPIPE = [[362, 970], [412, 970], [414, 1060], [418, 1140], [354, 1140], [358, 1060]];
const GULLET = blob([[300, 924], [334, 926], [338, 1000], [338, 1140], [300, 1140], [296, 1000]], 6);

const SPINE_FRONT = (y) => 246 - 12 * ((y - 500) / 500);
const BODIES = [[500, 646], [666, 738], [758, 836], [856, 930], [950, 1030], [1048, 1140]];
function bodyBlob([y0, y1], i) {
  const f0 = SPINE_FRONT(y0), f1 = SPINE_FRONT(y1), m = (y0 + y1) / 2, w = 70;
  const pts = [[f0 - w, y0 + 5], [f0 - 6, y0 + 1], [f0 + 2, m], [f1 - 6, y1 - 1], [f1 - w, y1 - 3], [f0 - w - 4, m]];
  if (i === 0) pts.splice(1, 0, [f0 - 54, y0 + 1], [f0 - 50, 446], [f0 - 38, 426], [f0 - 24, 440], [f0 - 20, y0 + 1]);
  return blob(pts, 8);
}
const SPINE = BODIES.map(bodyBlob);
const ATLAS = blob([[247, 444], [260, 456], [260, 478], [247, 488], [236, 476], [236, 454]], 6);

function letterPlate(g, px, L) {
  for (const [txt, tx, ty, lx, ly] of L) {
    g.strokeStyle = INK.ink; g.fillStyle = INK.ink; g.lineWidth = 0.6 * px;
    const right = tx > lx;
    g.beginPath(); g.moveTo(tx + (right ? -6 * px : 6 * px), ty - 5 * px); g.lineTo(lx, ly); g.stroke();
    g.beginPath(); g.arc(lx, ly, 1.8 * px, 0, Math.PI * 2); g.fill();
    letter(g, txt, tx, ty, font(15 * px, { italic: true }), INK.ink, right ? 'left' : 'right');
  }
}

const staticCache = new Map();

export class ThroatView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.key = !!opts.key;
    this.areas = null;
    this.t = 0;
  }

  staticLayer(W, H, dpr, s, ox, oy, crop) {
    const id = `${this.canvas.id}|${W}|${H}`;
    let c = staticCache.get(id);
    if (c) return c;
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const px = 1 / s;
    const shape = (pts, fill, w = 1.1) => { poly(g, pts); g.fillStyle = fill; g.fill(); g.strokeStyle = INK.ink; g.lineWidth = w * px; g.stroke(); };

    headR(g); g.fillStyle = TONE.tissue; g.fill();
    g.save(); headR(g); g.clip();
    shape(SKULL_BASE, TONE.bone);
    shape(NASAL_BONE, TONE.bone, 1);
    shape(NASAL_AIR, INK.paper);
    for (const T of TURBINATES) shape(T, TONE.bone, 1);
    g.strokeStyle = INK.ink; g.lineWidth = 0.8 * px;
    for (const c of [[[690, 306], [560, 312], [420, 324]], [[630, 230], [540, 242], [430, 258]], [[540, 180], [480, 184], [440, 192]]]) {
      g.beginPath(); g.moveTo(...c[0]); g.quadraticCurveTo(...c[1], ...c[2]); g.stroke();
    }
    shape(PALATE, TONE.bone);
    shape(MANDIBLE, TONE.bone);
    shape(HYOID, TONE.bone, 1);
    shape(GULLET, TONE.tissue, 1);
    shape(THYROID, TONE.bone, 1);
    shape(CRICOID, TONE.bone, 1);
    shape(WINDPIPE, INK.paper, 1);
    for (let y = 984; y < 1140; y += 24) shape(blob([[358, y], [414, y + 1], [416, y + 11], [356, y + 11]], 4), TONE.bone, 0.9);
    shape(ATLAS, TONE.bone, 1);
    for (const v of SPINE) shape(v, TONE.bone);
    g.restore();
    g.strokeStyle = INK.ink; g.lineWidth = 1.8 * px; skinLine(g); g.stroke();

    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out';
    const toDev = (x, y) => [(x * s + ox) * dpr, (y * s + oy) * dpr];
    const fade = (x0, y0, x1, y1) => {
      const [ax, ay] = toDev(x0, y0), [bx, by] = toDev(x1, y1);
      const gr = g.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    if (crop) { fade(40, 0, 150, 0); fade(0, 60, 0, 140); }
    fade(0, 1120, 0, 1050);
    g.restore();
    staticCache.set(id, c);
    return c;
  }

  draw(targetAreas, excitation = 'none', f0 = 0, label = '', srcLabel = '') {
    const p = targetAreas.length;
    if (!this.areas || this.areas.length !== p) this.areas = Float64Array.from(targetAreas);
    for (let i = 0; i < p; i++) this.areas[i] += 0.35 * (targetAreas[i] - this.areas[i]);
    this.t += 1;
    const { g, w, h, dpr } = fitCanvas(this.canvas);
    if (!w || !h) return;
    const small = h < 360, crop = true;
    const VIEW = VIEW_CROP;
    const VW = VIEW[2] - VIEW[0], VH = VIEW[3] - VIEW[1];
    const s = Math.min(w / VW, h / VH);
    const ox = (w - VW * s) / 2 - VIEW[0] * s, oy = (h - VH * s) / 2 - VIEW[1] * s;
    const px = 1 / s;
    const total = TRACT_LEN[TRACT_LEN.length - 1];
    const radiusAt = (u) => {
      const x = u * p - 0.5;
      const i0 = Math.max(0, Math.min(p - 1, Math.floor(x)));
      const i1 = Math.max(0, Math.min(p - 1, i0 + 1));
      let t = x - Math.floor(x);
      if (x < 0) t = 0;
      t = t * t * (3 - 2 * t);
      const a = this.areas[i0] + (this.areas[i1] - this.areas[i0]) * t;
      let r = Math.max(3, Math.min(36, 17 * Math.sqrt(a)));
      if (u < 0.17) r = Math.min(r, 20);
      return r;
    };
    const front = [], back = [];
    for (let i = 0; i < TRACT.length; i++) {
      const [x, y] = TRACT[i];
      const j0 = Math.max(0, i - 1), j1 = Math.min(TRACT.length - 1, i + 1);
      let dx = TRACT[j1][0] - TRACT[j0][0], dy = TRACT[j1][1] - TRACT[j0][1];
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const u = TRACT_LEN[i] / total;
      const r = radiusAt(u);
      let rb = Math.min(r, 16);
      rb += (r - rb) * (smooth(0.9, 0.98, u) + (1 - smooth(0.1, 0.2, u)));
      const rf = 2 * r - rb;
      front.push([x - dy * rf, y + dx * rf]);
      back.push([x + dy * rb, y - dx * rb]);
    }
    const at = (u) => Math.min(TRACT.length - 1, TRACT_LEN.findIndex((d) => d >= u * total));
    const tractPath = (q) => poly(q, [...front, ...back.slice().reverse()]);
    const t0 = at(0.34), t1 = at(0.9);
    const tonguePath = (q) => {
      q.beginPath();
      q.moveTo(front[t0][0], front[t0][1]);
      for (let i = t0; i <= t1; i++) q.lineTo(front[i][0], front[i][1]);
      const [tx, ty] = front[t1];
      q.bezierCurveTo(tx + 8, ty + 10, 668, Math.max(ty + 20, 486), 664, 510);
      q.bezierCurveTo(660, 540, 652, 580, 646, 616);
      q.bezierCurveTo(624, 690, 548, 730, 494, 728);
      q.bezierCurveTo(440, 726, front[t0][0] + 34, front[t0][1] + 60, front[t0][0], front[t0][1]);
      q.closePath();
    };
    const e0 = front[at(0.19)], e1 = front[at(0.33)], eb = back[at(0.33)];
    const epiglottis = (q) => {
      const tip = [e1[0] - Math.min(18, 0.4 * (e1[0] - eb[0])), e1[1] - 6];
      const my = (e0[1] + tip[1]) / 2;
      q.beginPath(); q.moveTo(e0[0] + 2, e0[1] + 6);
      q.bezierCurveTo(e0[0] - 18, my + 30, tip[0] - 6, my - 10, tip[0], tip[1]);
      q.quadraticCurveTo(tip[0] + 10, tip[1] - 6, tip[0] + 16, tip[1] + 8);
      q.bezierCurveTo(e1[0] - 2, my - 6, e0[0] + 6, my + 24, e0[0] + 12, e0[1] + 6);
      q.closePath();
    };

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.staticLayer(this.canvas.width, this.canvas.height, dpr, s, ox, oy, crop), 0, 0);
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    g.lineJoin = 'round'; g.lineCap = 'round';

    const shape = (path, fill, w = 1.1, color = INK.ink) => { path(g); g.fillStyle = fill; g.fill(); g.strokeStyle = color; g.lineWidth = w * px; path(g); g.stroke(); };
    g.save(); headR(g); g.clip();
    tonguePath(g); g.fillStyle = TONE.tongue; g.fill();
    g.strokeStyle = INK.ink; g.lineWidth = 1.1 * px; g.beginPath();
    for (let i = t0; i <= t1; i++) (i === t0 ? g.moveTo : g.lineTo).call(g, front[i][0], front[i][1]);
    { const [tx, ty] = front[t1]; g.bezierCurveTo(tx + 8, ty + 10, 668, Math.max(ty + 20, 486), 664, 510); }
    g.stroke();
    shape(Pf(MANDIBLE), TONE.bone);
    g.restore(); g.save(); g.beginPath(); g.rect(0, 0, 746, 1100); g.clip();
    shape(tractPath, INK.wash, 1.6, INK.blue);
    g.strokeStyle = INK.blue; g.lineWidth = 0.8 * px; g.beginPath();
    for (let sct = 1; sct < p; sct++) {
      const target = (sct / p) * total;
      let i = 0;
      while (i < TRACT_LEN.length - 1 && TRACT_LEN[i] < target) i++;
      g.moveTo(front[i][0], front[i][1]); g.lineTo(back[i][0], back[i][1]);
    }
    g.stroke();
    shape(epiglottis, TONE.bone, 1);
    shape(Pf(VELUM), TONE.tissue);
    for (const f of [[[356, 878], [368, 886], [356, 893]], [[404, 878], [392, 886], [404, 893]],
      [[354, 896], [374, 905], [354, 914]], [[406, 896], [386, 905], [406, 914]]]) shape(Pf(f), TONE.tissue, 1);
    g.restore();
    const n = front.length - 1;
    const dU = Math.max(0, Math.min(12, 452 - back[n][1])), dL = Math.max(0, Math.min(30, front[n][1] - 466));
    const upOuter = LIP_UP.map(([x, y]) => [x, y - dU * Math.max(0, (y - 400) / 58)]);
    const lowOuter = LIP_LOW.map(([x, y]) => [x, y + dL * Math.max(0, (522 - y) / 64)]);
    const upper = [...upOuter, [704, upOuter[upOuter.length - 1][1] - 2], [700, 420], [704, 372]];
    const lower = [[704, lowOuter[0][1] + 2], ...lowOuter, [700, 524]];
    for (const lip of [upper, lower]) { poly(g, lip); g.fillStyle = TONE.tissue; g.fill(); }
    g.save(); headR(g); g.clip();
    shape(Pf(PALATE), TONE.bone);
    shape(Pf(MANDIBLE), TONE.bone);
    g.restore();
    shape(Pf(UPPER_TOOTH), INK.paper, 1);
    shape(Pf(LOWER_TOOTH), INK.paper, 1);
    g.strokeStyle = INK.ink; g.lineWidth = 1.8 * px;
    poly(g, [...upOuter, [714, upOuter[upOuter.length - 1][1] - 1]], false); g.stroke();
    poly(g, [[714, lowOuter[0][1] + 1], ...lowOuter], false); g.stroke();

    g.strokeStyle = INK.blue; g.fillStyle = INK.blue; g.lineWidth = 1.5 * px;
    const x0 = 580, y0 = 806, wd = 90;
    g.save(); g.setLineDash([4 * px, 4 * px]); g.lineWidth = 0.8 * px;
    if (excitation !== 'none') { g.beginPath(); g.moveTo(x0 - 6, y0 + 2); g.lineTo(404, 902); g.stroke(); } g.restore();
    if (excitation === 'buzz') {
      const gap = f0 ? Math.max(8, Math.min(30, 3000 / f0)) : 18;
      g.beginPath();
      for (let x = x0 + ((this.t * 1) % gap); x < x0 + wd; x += gap) { g.moveTo(x, y0); g.lineTo(x, y0 - 22); }
      g.moveTo(x0, y0); g.lineTo(x0 + wd, y0); g.stroke();
    } else if (excitation === 'hiss') {
      g.beginPath();
      for (let i = 0; i < 40; i++) { const x = x0 + Math.random() * wd, y = y0 - 24 + Math.random() * 24; g.moveTo(x + 2, y); g.arc(x, y, 2, 0, Math.PI * 2); }
      g.fill();
    } else if (excitation === 'wave') {
      g.beginPath();
      for (let i = 0; i <= wd; i += 2) { const y = y0 - 12 + 10 * Math.sin(i * 0.36 + this.t * 0.3) * Math.sin(i * 0.09); i ? g.lineTo(x0 + i, y) : g.moveTo(x0, y); }
      g.stroke();
    }
    if (this.key && !small) {
      letterPlate(g, px, [
        ['a', 860, 196, 560, 250],
        ['b', 860, 392, 560, 380],
        ['c', 96, 600, 304, 520],
        ['d', 860, 600, 570, 560],
        ['e', 860, 968, 404, 908],
        ['f', 96, 790, 205, 720],
      ]);
    }
    const [l1, l2] = (srcLabel || '').split('\n');
    if (!small) {
      if (l1) letter(g, l1, x0 + wd + 12, y0 - 8, font(14 * px, { italic: true }), INK.blue);
      if (l2) letter(g, l2, x0 + wd + 12, y0 - 8 + 16 * px, font(14 * px, { italic: true }), INK.blue);
    } else {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const txt = [l1, l2].filter(Boolean).join(' ');
      if (txt) letter(g, txt, w - 4, h - 6, font(13, { italic: true }), INK.blue, 'right');
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

export function drawLine(canvas, opts) {
  const { g, w, h } = fitCanvas(canvas);
  if (!w || !h) return;
  g.clearRect(0, 0, w, h);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const narrow = w < 640;
  const hs = Math.min((h - 10) / 400, narrow ? 0.26 : 0.32);
  const ty = 2;
  const pw = 15, ph = 28;
  const ax = (345 - 70) * hs + 6, bx = w - ax - pw;
  const py = ty + 190 * hs - ph / 2;
  const x0 = ax + pw + 10, x1 = bx - 10, ly = py + ph / 2;
  const person = (tx, mirror) => {
    g.save(); g.translate(tx, ty); g.scale(mirror ? -hs : hs, hs); portrait(g, 1 / hs); g.restore();
  };
  person(-70 * hs, false);
  person(w + 70 * hs, true);
  for (const x of [ax, bx]) {
    g.fillStyle = INK.paper; g.strokeStyle = INK.ink; g.lineWidth = 1.2;
    g.beginPath(); g.roundRect ? g.roundRect(x, py, pw, ph, 3) : g.rect(x, py, pw, ph); g.fill(); g.stroke();
    hatch(g, (q) => { q.beginPath(); q.rect(x + 2.5, py + 5, pw - 5, ph - 10); }, [x, py, x + pw, py + ph], Math.PI / 4, 2.2, 0.6);
    g.lineWidth = 0.8; g.beginPath(); g.rect(x + 2.5, py + 5, pw - 5, ph - 10); g.moveTo(x + 5, py + 2.6); g.lineTo(x + pw - 5, py + 2.6); g.stroke();
  }
  const original = opts.which === 'original';
  g.strokeStyle = INK.ink; g.lineWidth = 0.8; g.setLineDash([1.5, 4]);
  g.beginPath(); g.moveTo(x0, ly); g.lineTo(x1, ly); g.stroke(); g.setLineDash([]);
  if (original) {
    g.strokeStyle = INK.ink; g.lineWidth = 1.2; g.beginPath();
    for (let x = x0; x <= x1; x += 1.5) {
      const t = (x - x0) / 9 - opts.pos * 40;
      const y = ly + 9 * Math.sin(t) * Math.sin(t * 0.37 + 1) * (0.6 + 0.4 * Math.sin(t * 0.11));
      x === x0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  } else {
    const n = Math.max(2, Math.min(Math.round(opts.fps * 1.4), Math.floor((x1 - x0) / 26)));
    const gap = (x1 - x0) / n;
    const off = ((opts.pos * opts.fps) % 1) * gap;
    const pwid = Math.max(5, Math.min(24, gap * 0.7));
    for (let i = -1; i < n; i++) {
      const x = x0 + i * gap + off;
      if (x < x0 - 1 || x + pwid > x1 + 1) continue;
      g.fillStyle = INK.paper; g.fillRect(x, ly - 6, pwid, 12);
      if (pwid > 9) hatch(g, (q) => { q.beginPath(); q.rect(x, ly - 6, pwid, 12); }, [x, ly - 6, x + pwid, ly + 6], Math.PI / 2, 2.4, 0.7, INK.blue);
      g.strokeStyle = INK.blue; g.lineWidth = 1.1; g.strokeRect(x, ly - 6, pwid, 12);
    }
  }
  letter(g, original ? 'the sound itself, the way a landline carries it' : opts.label, (x0 + x1) / 2, ly - 16,
    font(narrow ? 14 : 17, { italic: true }), original ? INK.ink : INK.blue, 'center');
  if (!narrow) {
    letter(g, 'their phone works out the shape of their throat', x0 + 2, ly + 30, font(15, { italic: true }), INK.grey, 'left');
    letter(g, 'yours builds one and blows through it', x1 - 2, ly + 30, font(15, { italic: true }), INK.grey, 'right');
  }
}

export function frameSpectrum(signal, center, nfft = 512) {
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const win = hamming(nfft);
  let wsum = 0;
  const start = Math.round(center - nfft / 2);
  for (let i = 0; i < nfft; i++) {
    const j = start + i;
    re[i] = (j >= 0 && j < signal.length ? signal[j] : 0) * win[i];
    wsum += win[i] * win[i];
  }
  fft(re, im);
  const out = new Float64Array(nfft / 2 + 1);
  for (let b = 0; b <= nfft / 2; b++) out[b] = 10 * Math.log10((re[b] * re[b] + im[b] * im[b]) / wsum + 1e-14);
  return out;
}

export function drawSpectrum(canvas, specDb, envDb, peaks) {
  const { g, w, h } = fitCanvas(canvas);
  if (!w || !h) return;
  g.clearRect(0, 0, w, h);
  const padL = 4, padR = 4, padT = 16, padB = 22;
  const W = w - padL - padR, H = h - padT - padB;
  let top = -Infinity;
  for (const v of envDb) top = Math.max(top, v);
  if (specDb) for (const v of specDb) top = Math.max(top, v);
  top = Math.ceil((top + 4) / 10) * 10;
  const bottom = top - 70;
  const yOf = (db) => padT + H * (1 - (Math.max(bottom, Math.min(top, db)) - bottom) / (top - bottom));
  const xOf = (b, n) => padL + (b / (n - 1)) * W;
  const envPath = (q, close) => {
    q.beginPath();
    for (let b = 0; b < envDb.length; b++) { const x = xOf(b, envDb.length), y = yOf(envDb[b]); b ? q.lineTo(x, y) : q.moveTo(x, y); }
    if (close) { q.lineTo(padL + W, padT + H); q.lineTo(padL, padT + H); q.closePath(); }
  };
  hatch(g, (q) => envPath(q, true), [padL, padT, padL + W, padT + H], Math.PI / 2, 3, 0.6, INK.blue);
  g.lineJoin = 'round';
  if (specDb) {
    g.beginPath();
    for (let b = 0; b < specDb.length; b++) { const x = xOf(b, specDb.length), y = yOf(specDb[b]); b ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = INK.ink; g.lineWidth = 0.9; g.stroke();
  }
  envPath(g, false); g.strokeStyle = INK.blue; g.lineWidth = 2.2; g.stroke();
  g.fillStyle = INK.ink; g.strokeStyle = INK.ink; g.lineWidth = 1;
  g.beginPath(); g.moveTo(padL, padT + H + 0.5); g.lineTo(padL + W, padT + H + 0.5); g.stroke();
  g.lineWidth = 0.6;
  for (let f = 0; f <= 4000; f += 250) {
    const x = padL + (f / 4000) * W, big = f % 1000 === 0;
    g.beginPath(); g.moveTo(x, padT + H); g.lineTo(x, padT + H + (big ? 5 : 2.5)); g.stroke();
    if (big) {
      g.font = font(12); g.textAlign = f === 0 ? 'left' : f === 4000 ? 'right' : 'center';
      g.fillText(f === 0 ? '0' : f === 4000 ? '4 kHz' : `${f / 1000}`, x, h - 4);
    }
  }
  (peaks || []).slice(0, 3).forEach((pk, i) => {
    const x = padL + (pk.hz / 4000) * W, y = yOf(pk.db);
    g.fillStyle = INK.blue; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    letter(g, `F${i + 1}`, x, Math.max(12, y - 7), font(13, { italic: true }), INK.blue, 'center');
  });
}

export function spectrogram(x, hop = 40, nfft = 256) {
  const cols = Math.ceil(x.length / hop);
  const bins = nfft / 2;
  const data = new Float32Array(cols * bins);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const win = hamming(nfft);
  for (let c = 0; c < cols; c++) {
    const start = c * hop - nfft / 2;
    for (let i = 0; i < nfft; i++) {
      const j = start + i;
      re[i] = (j >= 0 && j < x.length ? x[j] : 0) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) data[c * bins + b] = 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-12);
  }
  let max = -Infinity;
  for (const v of data) if (v > max) max = v;
  return { cols, bins, data, max, hop };
}

function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function spectroImage(spec, refMax, color) {
  const { cols, bins, data } = spec;
  const cv = document.createElement('canvas');
  cv.width = cols; cv.height = bins;
  const g = cv.getContext('2d');
  const img = g.createImageData(cols, bins);
  const range = 60;
  for (let c = 0; c < cols; c++) {
    for (let b = 0; b < bins; b++) {
      let t = (data[c * bins + b] - (refMax - range)) / range;
      t = Math.pow(Math.max(0, Math.min(1, t)), 1.25);
      const o = ((bins - 1 - b) * cols + c) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; img.data[o + 3] = 255 * t;
    }
  }
  g.putImageData(img, 0, 0);
  cv.ink = color;
  return cv;
}

const screenCache = new WeakMap();
function engraved(img, W, H, pitch) {
  const key = `${W}x${H}x${pitch}`;
  const hit = screenCache.get(img);
  if (hit && hit.key === key) return hit.c;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H), a = d.data;
  const [r, gg, b] = hexToRgb(img.ink || INK.ink);
  for (let y = 0; y < H; y++) {
    const fy = Math.abs((y % pitch) + 0.5 - pitch / 2);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const half = (a[o + 3] / 255) * pitch * 0.55;
      const cov = Math.max(0, Math.min(1, half - fy + 0.5)) * Math.min(1, half * 2);
      a[o] = r; a[o + 1] = gg; a[o + 2] = b; a[o + 3] = 255 * cov;
    }
  }
  g.putImageData(d, 0, 0);
  screenCache.set(img, { key, c });
  return c;
}

export function drawSpectrograms(canvas, imgA, imgB, pos, dur, labels) {
  const { g, w, h, dpr } = fitCanvas(canvas);
  g.clearRect(0, 0, w, h);
  const gap = 24, rowH = Math.floor((h - gap * 2) / 2);
  if (w < 1 || rowH < 1) return;
  const pitch = Math.max(3, Math.round(2.2 * dpr));
  [[imgA, labels[0], INK.ink], [imgB, labels[1], INK.blue]].forEach(([img, lab, col], i) => {
    const y = gap + i * (rowH + gap);
    if (img) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(engraved(img, Math.round(w * dpr), Math.round(rowH * dpr), pitch), 0, Math.round(y * dpr));
      g.restore();
    }
    g.strokeStyle = col; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, y - 0.5); g.lineTo(w, y - 0.5); g.moveTo(0, y + rowH + 0.5); g.lineTo(w, y + rowH + 0.5); g.stroke();
    letter(g, lab, 2, y - 7, font(15, { sc: true }), col, 'left');
  });
  if (!(pos > 0)) return;
  const x = Math.max(1, Math.min(w - 1, (pos / dur) * w));
  g.strokeStyle = INK.ink; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, gap - 3); g.lineTo(x, h); g.stroke();
  g.fillStyle = INK.ink;
  g.beginPath(); g.moveTo(x - 5, gap - 10); g.lineTo(x + 5, gap - 10); g.lineTo(x, gap - 3); g.fill();
}
