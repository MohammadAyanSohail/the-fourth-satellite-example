// Plate II: hold music.
import { preEmphasis } from './dsp.js';
import { analyse, synthesise, bitrate, PHONE } from './codec.js';
import { loadUrl, matchLoudness, ABPlayer } from './audio.js';
import { spectrogram, spectroImage, drawSpectrograms, INK } from './viz.js';
import { bindSlide, setPlayButton } from './ui.js';

export function initHold({ exclusive }) {
  const $ = (id) => document.getElementById(id);
  const cv = $('musSpectro'), playBtn = $('musPlay');
  const player = new ABPlayer();
  exclusive.register(player);
  let clip = null, imgs = [null, null], rafId = 0, settle = 0;

  function draw() {
    rafId = 0;
    drawSpectrograms(cv, imgs[0], imgs[1], player.position(), player.dur, ['The music', 'Through the phone']);
    if (player.playing || --settle > 0) rafId = requestAnimationFrame(draw);
  }
  function kick() { settle = 3; if (!rafId) rafId = requestAnimationFrame(draw); }

  function build() {
    const an = analyse(clip, PHONE);
    const y = matchLoudness(synthesise(an), clip.samples);
    imgs = [clip.img, spectroImage(spectrogram(y), clip.spec.max, INK.blue)];
    player.setClip(clip.samples, y);
    let voiced = 0;
    for (const f of an.frames) if (f.voiced) voiced++;
    const v = Math.round((100 * voiced) / an.frames.length);
    $('musStat').textContent = `Through the phone at ${(bitrate(PHONE) / 1000).toFixed(1)} kbit/s: ${v}% of the packets went as clicks at one pitch, and ${100 - v}% as hiss.`;
    kick();
  }
  playBtn.addEventListener('click', async () => {
    if (!clip) return;
    if (player.playing) { player.stop(); return; }
    exclusive.claim(player);
    await player.play(player.pausedAt || 0);
  });
  player.onChange(() => { setPlayButton(playBtn, playBtn.querySelector('path'), player.playing, 'the hold music'); kick(); });
  const setSlide = bindSlide($('musAB'), (which) => { player.setWhich(which); setSlide(which); });
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    player.seek(Math.max(0, Math.min(player.dur - 0.01, ((e.clientX - r.left) / r.width) * player.dur)));
    kick();
  });

  async function load() {
    let x;
    try {
      x = await loadUrl('audio/hold-music.wav', 15);
    } catch (e) {
      $('musStat').textContent = 'The hold music would not load. Reload the page to try again.';
      playBtn.disabled = true;
      return;
    }
    clip = { samples: x, pe: preEmphasis(x) };
    clip.spec = spectrogram(x);
    clip.img = spectroImage(clip.spec, clip.spec.max, INK.ink);
    build();
  }
  const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '500px' });
  io.observe($('music'));
  window.addEventListener('resize', kick);
}
