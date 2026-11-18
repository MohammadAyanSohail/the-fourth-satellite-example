// The maths the codec is built on: FFT, linear prediction, tube areas, rounding, pitch.
export const FS = 8000;

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const windowCache = new Map();
export function hamming(n) {
  let w = windowCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    windowCache.set(n, w);
  }
  return w;
}

export const PRE = 0.9;
export function preEmphasis(x, a = PRE) {
  const y = new Float64Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) { y[i] = x[i] - a * prev; prev = x[i]; }
  return y;
}
export function deEmphasis(x, a = PRE) {
  const y = new Float32Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) { prev = x[i] + a * prev; y[i] = prev; }
  return y;
}

export function autocorr(frame, p) {
  const n = frame.length;
  const r = new Float64Array(p + 1);
  for (let lag = 0; lag <= p; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += frame[i] * frame[i - lag];
    r[lag] = s;
  }
  return r;
}

// Levinson–Durbin: turns p+1 autocorrelation values into p reflection coefficients.
export function levinson(r, p) {
  const a = new Float64Array(p + 1);
  const k = new Float64Array(p + 1);
  const tmp = new Float64Array(p + 1);
  a[0] = 1;
  let err = r[0];
  if (err <= 1e-12) return { a, k, err: 0 };
  for (let m = 1; m <= p; m++) {
    let acc = r[m];
    for (let i = 1; i < m; i++) acc += a[i] * r[m - i];
    let km = -acc / err;
    if (km > 0.9999) km = 0.9999;
    if (km < -0.9999) km = -0.9999;
    k[m] = km;
    for (let i = 1; i < m; i++) tmp[i] = a[i] + km * a[m - i];
    for (let i = 1; i < m; i++) a[i] = tmp[i];
    a[m] = km;
    err *= 1 - km * km;
  }
  return { a, k, err };
}

export function kToA(k, p) {
  const a = new Float64Array(p + 1);
  const tmp = new Float64Array(p + 1);
  a[0] = 1;
  for (let m = 1; m <= p; m++) {
    const km = k[m];
    for (let i = 1; i < m; i++) tmp[i] = a[i] + km * a[m - i];
    for (let i = 1; i < m; i++) a[i] = tmp[i];
    a[m] = km;
  }
  return a;
}

export function larRange(i) { return i <= 2 ? 5 : i <= 4 ? 3.5 : 2.5; }
export function quantizeK(km, i, bits) {
  if (!bits) return { k: km, index: null };
  const R = larRange(i);
  let g = Math.log((1 + km) / (1 - km));
  if (g > R) g = R; if (g < -R) g = -R;
  const levels = 1 << bits;
  const step = (2 * R) / levels;
  let index = Math.floor((g + R) / step);
  if (index >= levels) index = levels - 1;
  const gq = -R + (index + 0.5) * step;
  const e = Math.exp(gq);
  return { k: (e - 1) / (e + 1), index };
}

export const GAIN_BITS = 5;
export function quantizeGain(g) {
  if (g <= 1e-6) return { g: 0, index: 0 };
  const db = 20 * Math.log10(g);
  const lo = -70, hi = -8;
  const levels = (1 << GAIN_BITS) - 1;
  let idx = Math.round(((db - lo) / (hi - lo)) * levels);
  if (idx < 1) return { g: 0, index: 0 };
  if (idx > levels) idx = levels;
  return { g: Math.pow(10, (lo + (idx / levels) * (hi - lo)) / 20), index: idx };
}

// Reads the reflection coefficients as a tube of p sections, which is what Fig. 1 draws.
export function kToAreas(k, p) {
  const areas = new Float64Array(p);
  let A = 1;
  const fromLips = [A];
  for (let m = 1; m < p; m++) {
    let km = k[m];
    if (km > 0.97) km = 0.97; if (km < -0.97) km = -0.97;
    A = A * (1 - km) / (1 + km);
    fromLips.push(A);
  }
  let logSum = 0;
  for (let i = 0; i < p; i++) logSum += Math.log(fromLips[i]);
  const ref = Math.exp(logSum / p);
  for (let i = 0; i < p; i++) areas[i] = fromLips[p - 1 - i] / ref;
  return areas;
}

export function areasToK(areas, lipK = 0.72) {
  const p = areas.length;
  const k = new Float64Array(p + 1);
  for (let m = 1; m < p; m++) {
    const Ain = areas[p - 1 - m], Aout = areas[p - m];
    k[m] = (Aout - Ain) / (Aout + Ain);
  }
  k[p] = lipK;
  return k;
}

export function envelopeDb(a, p, gain, nBins = 256) {
  const out = new Float64Array(nBins);
  for (let b = 0; b < nBins; b++) {
    const w = (Math.PI * b) / (nBins - 1);
    let re = 1, im = 0;
    for (let i = 1; i <= p; i++) { re += a[i] * Math.cos(w * i); im -= a[i] * Math.sin(w * i); }
    const mag = gain / Math.sqrt(re * re + im * im + 1e-20);
    out[b] = 20 * Math.log10(mag + 1e-12);
  }
  return out;
}

export function findPeaks(envDb, fsHalf = FS / 2, maxPeaks = 4) {
  const n = envDb.length;
  const peaks = [];
  for (let i = 2; i < n - 2; i++) {
    if (envDb[i] > envDb[i - 1] && envDb[i] >= envDb[i + 1]) {
      const y0 = envDb[i - 1], y1 = envDb[i], y2 = envDb[i + 1];
      const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
      peaks.push({ hz: ((i + d) / (n - 1)) * fsHalf, db: y1 });
    }
  }
  return peaks.filter((pk) => pk.hz > 150).slice(0, maxPeaks);
}

export function lowpass(x, fc = 900) {
  const a = Math.exp((-2 * Math.PI * fc) / FS);
  const y = new Float64Array(x.length);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) {
    s1 = (1 - a) * x[i] + a * s1;
    s2 = (1 - a) * s1 + a * s2;
    y[i] = s2;
  }
  return y;
}

export const MIN_LAG = 20;
export const MAX_LAG = 160;

export function pitchAt(lp, raw, center, globalPeakEnergy) {
  const W = 256;
  const start = Math.round(center - W / 2);
  const n = lp.length;
  let e = 0, zc = 0, prev = 0;
  for (let i = 0; i < W; i++) {
    const j = start + i;
    const v = j >= 0 && j < n ? raw[j] : 0;
    e += v * v;
    if (i > 0 && (v >= 0) !== (prev >= 0)) zc++;
    prev = v;
  }
  e /= W;
  const zcr = zc / W;
  if (e < globalPeakEnergy * 2e-4) return { voiced: false, f0: 0, conf: 0, energy: e, zcr };
  const get = (j) => (j >= 0 && j < n ? lp[j] : 0);
  const nac = new Float64Array(MAX_LAG + 2);
  let best = 0, bestLag = 0;
  for (let lag = MIN_LAG; lag <= MAX_LAG + 1; lag++) {
    let num = 0, e0 = 0, e1 = 0;
    for (let i = 0; i < W; i++) {
      const u = get(start + i), v = get(start + i + lag);
      num += u * v; e0 += u * u; e1 += v * v;
    }
    const c = num / Math.sqrt(e0 * e1 + 1e-12);
    nac[lag] = c;
    if (lag <= MAX_LAG && c > best) { best = c; bestLag = lag; }
  }
  // A voice also repeats at two, three or more periods, so take the shortest delay whose
  // peak comes within 85% of the strongest.
  for (let l = MIN_LAG; l < bestLag; l++) {
    if (nac[l] >= 0.85 * best && (l === MIN_LAG || nac[l] >= nac[l - 1]) && nac[l] >= nac[l + 1]) { bestLag = l; best = nac[l]; break; }
  }
  let lag = bestLag;
  if (bestLag > MIN_LAG && bestLag < MAX_LAG) {
    const y0 = nac[bestLag - 1], y1 = nac[bestLag], y2 = nac[bestLag + 1];
    const den = y0 - 2 * y1 + y2;
    if (den < 0) lag = bestLag + (0.5 * (y0 - y2)) / den;
  }
  const voiced = best > 0.5 && zcr < 0.32;
  return { voiced, f0: voiced ? FS / lag : 0, conf: best, energy: e, zcr };
}

export class LatticeSynth {
  constructor(p) { this.p = p; this.g = new Float64Array(p + 1); }
  reset() { this.g.fill(0); }
  step(x, k) {
    const p = this.p, g = this.g;
    let f = x;
    for (let m = p; m >= 1; m--) {
      f -= k[m] * g[m - 1];
      g[m] = k[m] * f + g[m - 1];
    }
    g[0] = f;
    return f;
  }
  copyState() { return Float64Array.from(this.g); }
  setState(s) { this.g.set(s); }
}

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
