export function bindSlide(root, onPick) {
  const track = root.querySelector('.slide-track');
  const labels = root.querySelectorAll('.slide-label');
  const names = {};
  labels.forEach((l) => { names[l.dataset.which] = l.textContent.trim(); });
  const set = (which) => {
    track.setAttribute('aria-checked', String(which === 'rebuilt'));
    track.setAttribute('aria-label', `Playing ${names[which]}. Switch to ${names[which === 'rebuilt' ? 'original' : 'rebuilt']}`);
    labels.forEach((l) => l.classList.toggle('on', l.dataset.which === which));
  };
  labels.forEach((l) => l.addEventListener('click', () => onPick(l.dataset.which)));
  track.addEventListener('click', () => onPick(track.getAttribute('aria-checked') === 'true' ? 'original' : 'rebuilt'));
  return set;
}

export const PLAY_ICON = 'M8 5l11 7-11 7z';
export const PAUSE_ICON = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';

export function setPlayButton(btn, path, playing, what) {
  path.setAttribute('d', playing ? PAUSE_ICON : PLAY_ICON);
  btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${what}`.trim());
  btn.setAttribute('aria-pressed', String(playing));
}

export const exclusive = {
  items: new Set(),
  register(x) { this.items.add(x); },
  claim(x) { this.items.forEach((o) => { if (o !== x) o.stop(); }); },
};
