// Plate I: what the other end hears of you.
import { FS, kToAreas, envelopeDb, findPeaks, preEmphasis } from './dsp.js';
import { analyse, synthesise, bitrate, bitsPerFrame, PHONE } from './codec.js';
import { loadUrl, openMic, recordVoice, matchLoudness, ABPlayer } from './audio.js';
import { ThroatView, frameSpectrum, drawSpectrum, spectrogram, spectroImage, drawSpectrograms, drawLine, INK } from './viz.js';
import { bindSlide, setPlayButton, exclusive } from './ui.js';
import { initHold } from './hold.js';

const $ = (id) => document.getElementById(id);

const BPS = bitrate(PHONE);
const PER_PACKET = BPS / PHONE.fps;
export const fmtK = (b) => `${b >= 10000 ? (b / 1000).toFixed(0) : (b / 1000).toFixed(1)} kbit/s`;

let clip = null, an = null, rebuilt = null, origImg = null, rebImg = null, origSpec = null, version = 0;
const player = new ABPlayer();
exclusive.register(player);
const throat = new ThroatView($('throat'), { key: true });
const clipCache = {};

const CLIP_URLS = { a: 'audio/caller-a.wav', b: 'audio/caller-b.wav', c: 'audio/caller-c.wav' };
async function getClip(kind) {
  if (clipCache[kind]) return clipCache[kind];
  const samples = await loadUrl(CLIP_URLS[kind], 12);
  return (clipCache[kind] = { samples, name: kind });
}
function setClip(c) {
  clip = c;
  clip.pe = clip.pe || preEmphasis(clip.samples);
  origSpec = spectrogram(clip.samples);
  origImg = spectroImage(origSpec, origSpec.max, INK.ink);
  player.pausedAt = 0;
  if (player.which !== 'rebuilt') { player.setWhich('rebuilt'); setSlide('rebuilt'); }
  render();
}
function markCaller(kind) {
  document.querySelectorAll('#callers button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === kind)));
}
let loadToken = 0;
async function chooseClip(kind) {
  const token = ++loadToken;
  markCaller(kind);
  const c = await getClip(kind);
  if (token !== loadToken) return;
  setClip(c);
}
document.querySelectorAll('#callers button').forEach((b) => b.addEventListener('click', async () => {
  await chooseClip(b.dataset.clip);
  startPlay();
}));

function render() {
  if (!clip) return;
  an = analyse(clip, PHONE);
  rebuilt = matchLoudness(synthesise(an), clip.samples);
  player.setClip(clip.samples, rebuilt);
  rebImg = spectroImage(spectrogram(rebuilt), origSpec.max, INK.blue);
  version++;
  updateRates();
  showState();
  kick();
}

const RULER = { lo: Math.log10(1000), hi: Math.log10(2e6) };
const RULER_MARKS = [
  [2400, 'LPC-10, 1984', '1984'],
  [12200, 'mobile call', 'mobile'],
  [64000, 'landline', 'landline'],
  [1411200, 'CD', 'CD'],
];
const rulerX = (b) => (100 * (Math.log10(Math.max(1000, b)) - RULER.lo)) / (RULER.hi - RULER.lo);
function buildRuler() {
  let html = '<div class="axis"></div>';
  RULER_MARKS.forEach(([b, lab, short], i) => {
    const x = rulerX(b);
    html += `<div class="tick" style="left:${x}%"></div><div class="tlab${x > 92 ? ' r' : ''}${i % 2 ? ' low' : ''}" style="left:${x}%"><span class="long">${lab}</span><span class="short">${short}</span></div>`;
  });
  html += '<div class="you" id="rulerYou">this phone</div>';
  $('ruler').innerHTML = html;
}
function updateRates() {
  $('rulerYou').style.left = `${rulerX(BPS)}%`;
  $('rulerYou').textContent = `this phone, ${fmtK(BPS)}`;
  const cd = 1411200 / BPS;
  $('rates').textContent = `${PHONE.fps} packets a second of ${PER_PACKET} bits comes to ${fmtK(BPS)}. A CD would need ${Math.round(cd).toLocaleString()} times as much for the same second.`;
}

function describe() {
  const mine = clip && clip.name === 'mine';
  const who = mine ? 'you' : 'the caller';
  if (player.which === 'original') {
    return mine
      ? 'This is your own recording, as your microphone heard it (cut to phone quality). Flip the switch to hear what reaches the other end.'
      : 'This is the recording itself, at phone quality. Flip the switch to hear what the phone rebuilt from the packets.';
  }
  return `This is ${who} as the other phone rebuilt it from ${PER_PACKET}-bit packets. Nothing else of the voice was sent. It sounds robotic because every buzz is built from the same simple tick.`;
}
function showState() { $('now').innerHTML = describe(); }

async function startPlay() {
  exclusive.claim(player);
  await player.play(player.pausedAt || 0);
  $('play').classList.remove('nudge');
}
$('play').addEventListener('click', async () => { if (player.playing) player.stop(); else await startPlay(); });
player.onChange(() => { setPlayButton($('play'), $('playIcon'), player.playing, 'the recording'); kick(); });
const setSlide = bindSlide(document.querySelector('.slide[data-for="main"]'), async (which) => {
  if (!player.playing) { player.setWhich(which); setSlide(which); await startPlay(); showState(); }
  else setWhich(which);
});
function setWhich(which) {
  player.setWhich(which);
  setSlide(which);
  showState();
}

let recAbort = null;
const recorder = { stop() { if (recAbort) recAbort.abort(); } };
exclusive.register(recorder);
$('recCancel').addEventListener('click', () => recorder.stop());
$('recBtn').addEventListener('click', () => (recAbort ? recorder.stop() : doRecord()));

async function doRecord() {
  if (recAbort) return;
  exclusive.claim(recorder);
  const overlay = $('rec');
  overlay.hidden = false;
  overlay.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('recBtn').classList.add('on');
  $('recLevel').style.width = '0'; $('recProg').style.width = '0';
  $('recTitle').textContent = 'Allow the microphone when your browser asks.';
  recAbort = new AbortController();
  const { signal } = recAbort;
  try {
    const mic = await openMic();
    if (signal.aborted) { mic.stream.getTracks().forEach((t) => t.stop()); throw new DOMException('', 'AbortError'); }
    for (const n of [3, 2, 1]) {
      $('recTitle').textContent = `Get ready to talk: ${n}`;
      await new Promise((r) => setTimeout(r, 600));
      if (signal.aborted) {
        mic.stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('', 'AbortError');
      }
    }
    $('recTitle').textContent = 'Talk now. Say anything at all.';
    const samples = await recordVoice(mic, 5, (lvl, prog) => {
      $('recLevel').style.width = `${Math.min(100, lvl * 140)}%`;
      $('recProg').style.width = `${Math.min(100, prog * 100)}%`;
    }, signal);
    overlay.hidden = true;
    if (signal.aborted) return;
    if (!samples) { $('now').textContent = 'Nothing came through the microphone. Check that the right one is selected and try again.'; return; }
    clipCache.mine = { samples, name: 'mine' };
    loadToken++;
    markCaller('mine');
    setClip(clipCache.mine);
    await startPlay();
  } catch (err) {
    overlay.hidden = true;
    if (err && err.name === 'AbortError') return;
    const name = err && err.name;
    $('now').textContent = name === 'NotAllowedError'
      ? 'The browser said no to the microphone. You can allow it in the address bar, or borrow one of the voices above.'
      : name === 'TimeoutError'
        ? 'The microphone stopped sending sound before the five seconds were up. Check that it isn\'t muted or in use by another app, then try again.'
        : 'This browser would not give us a microphone. You can borrow one of the voices above instead.';
  } finally {
    recAbort = null;
    $('recBtn').classList.remove('on');
  }
}

const spectroCv = $('spectro');
spectroCv.tabIndex = 0;
function seek(t) { player.seek(Math.max(0, Math.min(player.dur - 0.01, t))); lastFrame = -1; kick(); }
spectroCv.addEventListener('click', (e) => { const r = spectroCv.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * player.dur); });
spectroCv.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault(); seek(player.position() + (e.key === 'ArrowRight' ? 0.1 : -0.1));
});

function packetHTML(f) {
  const b = bitsPerFrame(an);
  const rows = [
    ['Throat', 'ten numbers', b.throat],
    ['Pitch', f.voiced && f.gainIdx ? `${Math.round(f.f0)} Hz` : 'not used', b.pitch],
    ['Buzz or hiss', !f.gainIdx ? 'silence' : f.voiced ? 'buzz' : 'hiss', b.voicing],
    ['Loudness', `level ${f.gainIdx} of 31`, b.loudness],
  ];
  const total = rows.reduce((t, r) => t + r[2], 0);
  return `<table><thead><tr><th>Part</th><th>In this packet</th><th>Bits</th></tr></thead><tbody>${
    rows.map(([part, val, bits]) => `<tr><td>${part}</td><td>${val}</td><td>${bits}</td></tr>`).join('')
  }</tbody><tfoot><tr><td>Total</td><td></td><td>${total}</td></tr></tfoot></table>`;
}

function sourceGlyph(f) {
  if (player.which === 'original') return ['wave', 'the real\nvoice'];
  if (f.silent) return ['none', 'silence'];
  if (!f.voiced) return ['hiss', 'hiss'];
  return ['buzz', `clicks at\n${Math.round(f.f0)} Hz`];
}

let lastFrame = -1, lastVersion = -1, settle = 0, rafId = 0;
function kick() { settle = 20; if (!rafId) rafId = requestAnimationFrame(loop); }
function loop() {
  rafId = 0;
  if (!an) return;
  const pos = player.position();
  const j = Math.max(0, Math.min(an.frames.length - 1, Math.floor((pos * FS) / an.hop)));
  const f = an.frames[j];
  const [exc, label] = sourceGlyph(f);
  throat.draw(kToAreas(f.k, an.order), exc, f.f0, `packet ${j + 1} of ${an.frames.length}`, label);
  if (j !== lastFrame || version !== lastVersion) {
    const spec = frameSpectrum(clip.pe, f.center);
    const env = envelopeDb(f.a, an.order, f.gain, 257);
    const pk = !f.silent ? findPeaks(env) : [];
    for (const id of ['spectrum', 'spectrumM']) if ($(id).offsetParent) drawSpectrum($(id), spec, env, pk);
    $('packet').innerHTML = packetHTML(f);
    lastFrame = j; lastVersion = version;
  }
  drawSpectrograms(spectroCv, origImg, rebImg, pos, player.dur, ['What was said', 'What the phone rebuilt']);
  drawLine($('wire'), { pos, fps: PHONE.fps, which: player.which, label: `${PHONE.fps} packets a second, ${PER_PACKET} bits each` });
  if (player.playing || --settle > 0) rafId = requestAnimationFrame(loop);
}

(async function boot() {
  buildRuler();
  $('play').classList.add('nudge');
  if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
  try {
    setClip(await getClip('a'));
  } catch (e) {
    $('now').textContent = 'The sample voices would not load. You can still record yourself.';
  }
  initHold({ exclusive });
  window.addEventListener('resize', () => { lastFrame = -1; kick(); });
})();
