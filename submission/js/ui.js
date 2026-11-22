// The controls both sheets share: the two-way switch, the play button and inline choices.
export function bindSwitch(root, onPick) {
  const track = root.querySelector('.switch-track');
  const labels = root.querySelectorAll('.switch-label');
  const set = (which) => {
    track.setAttribute('aria-checked', String(which === 'b'));
    labels.forEach((l) => l.classList.toggle('on', l.dataset.side === which));
  };
  labels.forEach((l) => l.addEventListener('click', () => onPick(l.dataset.side)));
  track.addEventListener('click', () => onPick(track.getAttribute('aria-checked') === 'true' ? 'a' : 'b'));
  return set;
}

export const PLAY_ICON = 'M8 5l11 7-11 7z';
export const PAUSE_ICON = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
export function setPlayButton(btn, playing, what) {
  btn.querySelector('path').setAttribute('d', playing ? PAUSE_ICON : PLAY_ICON);
  btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Run'} ${what}`);
  btn.setAttribute('aria-pressed', String(playing));
}

export function bindChoices(root, key, onPick) {
  const btns = root.querySelectorAll(`button[data-${key}]`);
  const set = (val) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(val))));
  btns.forEach((b) => b.addEventListener('click', () => onPick(b.dataset[key])));
  return set;
}

export const fmtDist = (m) => {
  const a = Math.abs(m);
  if (a < 1) return `${Math.round(a * 100)} cm`;
  if (a < 1000) return `${a < 10 ? a.toFixed(1) : Math.round(a)} m`;
  return `${(a / 1000).toLocaleString(undefined, { maximumFractionDigits: a < 1e4 ? 1 : 0 })} km`;
};
export const fmtTime = (s) => {
  const a = Math.abs(s);
  if (a < 5e-10) return 'nothing';
  if (a < 0.9995e-6) return `${(a * 1e9).toFixed(0)} ns`;
  if (a < 0.9995e-3) return `${(a * 1e6).toLocaleString(undefined, { maximumFractionDigits: 3 })} µs`;
  return `${(a * 1e3).toLocaleString(undefined, { maximumFractionDigits: 3 })} ms`;
};
