// Loading files, resampling, recording and the A/B player.
import { FS } from './dsp.js';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}
export async function unlock() {
  const c = audioCtx();
  if (c.state !== 'running') await c.resume();
  return c;
}

export function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return Float64Array.from(input);
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float64Array(outLen);
  const cutoff = Math.min(1, 1 / ratio) * 0.9;
  const half = Math.ceil(12 * Math.max(1, ratio));
  for (let n = 0; n < outLen; n++) {
    const t = n * ratio;
    const c = Math.floor(t);
    let acc = 0, wsum = 0;
    for (let j = c - half + 1; j <= c + half; j++) {
      if (j < 0 || j >= input.length) continue;
      const d = t - j;
      const x = Math.PI * d * cutoff;
      const sinc = d === 0 ? 1 : Math.sin(x) / x;
      const win = 0.5 + 0.5 * Math.cos((Math.PI * d) / (half + 1));
      const w = sinc * win;
      acc += input[j] * w; wsum += w;
    }
    out[n] = wsum ? acc / wsum : 0;
  }
  return out;
}

export function tidy(x, maxSeconds = 7) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-4) return null;
  const thr = peak * 0.04;
  let s = 0, e = x.length - 1;
  while (s < x.length && Math.abs(x[s]) < thr) s++;
  while (e > s && Math.abs(x[e]) < thr) e--;
  s = Math.max(0, s - 800); e = Math.min(x.length, e + 1600);
  const len = Math.min(e - s, maxSeconds * FS);
  const y = new Float64Array(len);
  let mean = 0;
  for (let i = 0; i < len; i++) mean += x[s + i];
  mean /= len || 1;
  let pk = 0;
  for (let i = 0; i < len; i++) { y[i] = x[s + i] - mean; pk = Math.max(pk, Math.abs(y[i])); }
  for (let i = 0; i < len; i++) y[i] *= 0.9 / pk;
  const f = Math.min(200, len >> 2);
  for (let i = 0; i < f; i++) { y[i] *= i / f; y[len - 1 - i] *= i / f; }
  return y;
}

let decoder = null;
async function decodeToMono(arrayBuffer) {
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = C ? (decoder || (decoder = new C(1, 1, 44100))) : audioCtx();
  const buf = await new Promise((res, rej) => {
    const p = c.decodeAudioData(arrayBuffer, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  const ch = buf.numberOfChannels;
  const mono = new Float64Array(buf.length);
  for (let k = 0; k < ch; k++) {
    const d = buf.getChannelData(k);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / ch;
  }
  return { mono, rate: buf.sampleRate };
}

export async function loadUrl(url, maxSeconds = 7) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const ab = await res.arrayBuffer();
  const { mono, rate } = await decodeToMono(ab);
  const x = resample(mono, rate, FS);
  return tidy(x, maxSeconds);
}

export async function openMic() {
  const c = await unlock();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  return { c, stream };
}

export async function recordVoice(mic, seconds, onLevel, signal) {
  const { c, stream } = mic;
  const chunks = [];
  let got = 0, src, proc, sink;
  try {
    if (c.state !== 'running') await c.resume();
    src = c.createMediaStreamSource(stream);
    proc = c.createScriptProcessor(2048, 1, 1);
    sink = c.createGain();
    sink.gain.value = 0;
    src.connect(proc); proc.connect(sink); sink.connect(c.destination);
    const total = Math.round(seconds * c.sampleRate);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error('The microphone sent no sound.');
        err.name = 'TimeoutError';
        reject(err);
      }, (seconds + 4) * 1000);
      if (signal) signal.onabort = () => { clearTimeout(timer); resolve(); };
      proc.onaudioprocess = (ev) => {
        const d = ev.inputBuffer.getChannelData(0);
        chunks.push(Float32Array.from(d));
        got += d.length;
        let pk = 0;
        for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        onLevel && onLevel(pk, got / total);
        if (got >= total) { clearTimeout(timer); resolve(); }
      };
    });
  } finally {
    try { proc && (proc.onaudioprocess = null, proc.disconnect()); src && src.disconnect(); sink && sink.disconnect(); } catch (e) {}
    stream.getTracks().forEach((t) => t.stop());
  }
  if (signal && signal.aborted) return null;
  const all = new Float64Array(got);
  let o = 0;
  for (const ch of chunks) { all.set(ch, o); o += ch.length; }
  return tidy(resample(all, c.sampleRate, FS), seconds);
}

let nativeRateOk = null;
export function makeBuffer(samples) {
  const c = audioCtx();
  if (nativeRateOk !== false) {
    try {
      const b = c.createBuffer(1, samples.length, FS);
      b.copyToChannel ? b.copyToChannel(Float32Array.from(samples), 0) : b.getChannelData(0).set(samples);
      nativeRateOk = true;
      return b;
    } catch (e) { nativeRateOk = false; }
  }
  const up = resample(samples, FS, c.sampleRate);
  const b = c.createBuffer(1, up.length, c.sampleRate);
  b.getChannelData(0).set(Float32Array.from(up));
  return b;
}

export function matchLoudness(y, ref) {
  let ey = 0, er = 0;
  for (let i = 0; i < y.length; i++) { ey += y[i] * y[i]; er += ref[i] * ref[i]; }
  let s = ey > 0 ? Math.sqrt(er / ey) : 1;
  let pk = 0;
  for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i] * s));
  if (pk > 0.98) s *= 0.98 / pk;
  const out = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = y[i] * s;
  return out;
}

export class ABPlayer {
  constructor() {
    this.playing = false;
    this.which = 'rebuilt';
    this.origBuf = null; this.rebBuf = null;
    this.t0 = 0; this.dur = 1;
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  setClip(orig, rebuilt) {
    const wasPlaying = this.playing;
    const pos = this.position();
    this.stop(true);
    this.origBuf = makeBuffer(orig);
    this.rebBuf = makeBuffer(rebuilt);
    this.dur = orig.length / FS;
    if (wasPlaying) this.play(Math.min(pos, this.dur - 0.01));
  }

  _source(buf, offset, when, level, fadeIn = 0.005) {
    const c = audioCtx();
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.setTargetAtTime(level, when, fadeIn);
    src.connect(gain); gain.connect(c.destination);
    src.start(when, offset);
    return { src, gain };
  }
  async play(from = 0) {
    if (!this.origBuf) return;
    const token = (this.token = (this.token || 0) + 1);
    const c = await unlock();
    if (token !== this.token) return;
    this.stop(true);
    this.token = token;
    if (from >= this.dur - 0.05) from = 0;
    const when = c.currentTime + 0.03;
    this.t0 = when - from;
    this.from = from;
    const o = this._source(this.origBuf, from, when, this.which === 'original' ? 1 : 0);
    const r = this._source(this.rebBuf, from, when, this.which === 'rebuilt' ? 1 : 0);
    this.origSrc = o.src; this.origGain = o.gain;
    this.rebSrc = r.src; this.rebGain = r.gain;
    this.playing = true;
    this.origSrc.onended = () => { if (this.origSrc === o.src) { this.playing = false; this.pausedAt = 0; this.emit(); } };
    this.emit();
  }
  stop(silent = false) {
    this.token = (this.token || 0) + 1;
    for (const s of [this.origSrc, this.rebSrc]) if (s) { try { s.stop(); } catch (e) {} s.disconnect(); }
    this.origSrc = this.rebSrc = null;
    if (this.playing) this.pausedAt = this.position();
    this.playing = false;
    if (!silent) this.emit();
  }
  toggle() { this.playing ? this.stop() : this.play(this.pausedAt || 0); }
  setWhich(which) {
    this.which = which;
    if (this.playing && ctx) {
      const at = Math.max(ctx.currentTime, this.t0 + (this.from || 0));
      for (const [g, on] of [[this.origGain, which === 'original'], [this.rebGain, which === 'rebuilt']]) {
        g.gain.cancelScheduledValues(0);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.setTargetAtTime(on ? 1 : 0, at, 0.01);
      }
    }
    this.emit();
  }
  seek(t) {
    this.pausedAt = t;
    if (this.playing) this.play(t);
    else this.emit();
  }
  position() {
    if (!this.playing || !ctx) return this.pausedAt || 0;
    const t = ctx.currentTime - this.t0;
    if (t < 0) return 0;
    return Math.min(t, this.dur);
  }
}
