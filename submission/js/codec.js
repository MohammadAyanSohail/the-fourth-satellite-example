// The vocoder. Every 20 ms it sends the throat as ten numbers, a pitch, a loudness,
// and one bit for buzz or hiss.
import {
  FS, hamming, preEmphasis, deEmphasis, autocorr, levinson, kToA, quantizeK, quantizeGain,
  lowpass, pitchAt, LatticeSynth, mulberry32, gaussian, GAIN_BITS,
} from './dsp.js';

// Bits for each of the ten throat numbers, more for the first few, as LPC-10 does.
export const THROAT_BITS = [5, 5, 5, 5, 4, 4, 4, 4, 3, 2];
export const PITCH_BITS = 7;
export const VOICING_BITS = 1;
const LAG_LO = 20;

export const PHONE = { order: 10, fps: 50, bits: THROAT_BITS };

const pitchCache = new WeakMap();
function pitchTrack(clip, hop) {
  let byHop = pitchCache.get(clip);
  if (!byHop) { byHop = new Map(); pitchCache.set(clip, byHop); }
  if (byHop.has(hop)) return byHop.get(hop);
  const x = clip.samples;
  const lp = clip.lp || (clip.lp = lowpass(x));
  if (clip.peakEnergy === undefined) {
    let pk = 0;
    for (let c = 128; c < x.length; c += 80) {
      let e = 0;
      for (let i = c - 128; i < c + 128 && i < x.length; i++) e += x[i] * x[i];
      if (e / 256 > pk) pk = e / 256;
    }
    clip.peakEnergy = pk;
  }
  const nF = Math.ceil(x.length / hop);
  const raw = [];
  for (let j = 0; j < nF; j++) raw.push(pitchAt(lp, x, j * hop + hop / 2, clip.peakEnergy));
  const out = raw.map((r) => ({ ...r }));
  for (let j = 1; j < nF - 1; j++) {
    const a = raw[j - 1], b = raw[j], c = raw[j + 1];
    if (a.voiced && c.voiced && !b.voiced && b.conf > 0.35) { out[j].voiced = true; out[j].f0 = (a.f0 + c.f0) / 2; }
    if (!a.voiced && !c.voiced && b.voiced && b.conf < 0.7) { out[j].voiced = false; out[j].f0 = 0; }
    if (a.voiced && b.voiced && c.voiced) {
      const s = [a.f0, b.f0, c.f0].sort((p, q) => p - q);
      out[j].f0 = s[1];
    }
  }
  byHop.set(hop, out);
  return out;
}

export function analyse(clip, settings) {
  const { order: p, fps, bits } = settings;
  const x = clip.samples;
  const pe = clip.pe || (clip.pe = preEmphasis(x));
  const hop = Math.round(FS / fps);
  const W = Math.min(512, Math.max(240, 2 * hop));
  const win = hamming(W);
  let wsum = 0;
  for (let i = 0; i < W; i++) wsum += win[i] * win[i];
  const pitch = pitchTrack(clip, hop);
  const nF = Math.ceil(x.length / hop);
  const frames = [];
  const buf = new Float64Array(W);
  for (let j = 0; j < nF; j++) {
    const center = j * hop + hop / 2;
    const start = Math.round(center - W / 2);
    for (let i = 0; i < W; i++) {
      const s = start + i;
      buf[i] = (s >= 0 && s < x.length ? pe[s] : 0) * win[i];
    }
    const r = autocorr(buf, p);
    const r0 = Float64Array.from(r);
    r[0] *= 1.0001;
    for (let l = 1; l <= p; l++) { const t = (2 * Math.PI * 60 * l) / FS; r[l] *= Math.exp(-0.5 * t * t); }
    const { k: kRaw, err } = levinson(r, p);
    const k = new Float64Array(p + 1);
    const kIdx = new Array(p + 1).fill(null);
    for (let m = 1; m <= p; m++) {
      const q = quantizeK(kRaw[m], m, Array.isArray(bits) ? bits[m - 1] : bits);
      k[m] = q.k; kIdx[m] = q.index;
    }
    const a = kToA(k, p);
    let hp = 0;
    {
      const hh = new Float64Array(256);
      for (let n = 0; n < 256; n++) {
        let v = n === 0 ? 1 : 0;
        for (let m = 1; m <= p && m <= n; m++) v -= a[m] * hh[n - m];
        hh[n] = v; hp += v * v;
      }
    }
    const gRaw = Math.sqrt(Math.max(r0[0], 0) / wsum / Math.max(hp, 1e-9));
    const gq = quantizeGain(gRaw);
    const pt = pitch[j];
    const lag = pt.voiced ? Math.max(LAG_LO, Math.min(LAG_LO + 127, Math.round(FS / pt.f0))) : 0;
    frames.push({
      center, k, kIdx, kRaw, a,
      gain: gq.g, gainIdx: gq.index, gainRaw: gRaw,
      voiced: pt.voiced, f0: lag ? FS / lag : 0, f0Raw: pt.f0,
      pitchIdx: lag ? lag - LAG_LO : 0,
      energy: r0[0] / wsum,
    });
  }
  let maxEnergy = 0;
  for (const f of frames) if (f.energy > maxEnergy) maxEnergy = f.energy;
  for (const f of frames) f.silent = f.energy < maxEnergy * 3e-4;
  return { frames, hop, order: p, fps, bits, length: x.length, maxEnergy };
}

export function bitsPerFrame(an) {
  const throat = Array.isArray(an.bits) ? an.bits.reduce((a, b) => a + b, 0) : an.order * an.bits;
  return { throat, pitch: PITCH_BITS, voicing: VOICING_BITS, loudness: GAIN_BITS };
}

export function bitrate(an) {
  const b = bitsPerFrame(an);
  return (b.throat + b.pitch + b.voicing + b.loudness) * an.fps;
}

function makeInterpolator(an) {
  const { frames, order: p } = an;
  const k = new Float64Array(p + 1);
  return function at(n) {
    const pos = (n - frames[0].center) / an.hop;
    let j = Math.floor(pos);
    let t = pos - j;
    if (j < 0) { j = 0; t = 0; }
    if (j >= frames.length - 1) { j = frames.length - 1; t = 0; }
    const A = frames[j], B = frames[Math.min(j + 1, frames.length - 1)];
    for (let m = 1; m <= p; m++) k[m] = A.k[m] + t * (B.k[m] - A.k[m]);
    return { k, gain: A.gain + t * (B.gain - A.gain), A, B, t };
  };
}

// The receiver drives the tube with one click per pitch period when the packet says buzz,
// and with noise when it says hiss.
export function synthesise(an) {
  const N = an.length, p = an.order;
  const out = new Float64Array(N);
  const synth = new LatticeSynth(p);
  const at = makeInterpolator(an);
  const rand = mulberry32(12345);
  let next = 0;
  for (let n = 0; n < N; n++) {
    const { k, gain, A, B, t } = at(n);
    const near = t < 0.5 ? A : B;
    let e = 0;
    if (!near.voiced) {
      e = gaussian(rand) * gain;
      next = n;
    } else if (n >= next) {
      const f0 = A.voiced && B.voiced ? A.f0 + t * (B.f0 - A.f0) : near.f0;
      const T0 = FS / f0;
      e = gain * Math.sqrt(T0);
      next += T0;
      if (next <= n) next = n + T0;
    }
    out[n] = synth.step(e, k);
  }
  return deEmphasis(out);
}

export function predictFrame(clip, an, frameIndex, len = 240) {
  const f = an.frames[Math.max(0, Math.min(an.frames.length - 1, frameIndex))];
  const pe = clip.pe, p = an.order, a = f.a;
  const start = Math.max(p, Math.round(f.center - len / 2));
  const actual = new Float64Array(len), pred = new Float64Array(len), err = new Float64Array(len);
  let es = 0, xs = 0;
  for (let i = 0; i < len; i++) {
    const n = start + i;
    const xv = n < pe.length ? pe[n] : 0;
    let guess = 0;
    for (let m = 1; m <= p; m++) guess -= a[m] * (n - m < pe.length && n - m >= 0 ? pe[n - m] : 0);
    actual[i] = xv; pred[i] = guess; err[i] = xv - guess;
    es += err[i] * err[i]; xs += xv * xv;
  }
  return { actual, pred, err, start, gainDb: xs > 0 && es > 0 ? 10 * Math.log10(xs / es) : 0, frame: f };
}
