// Small things the steps share: an on/off switch and friendly number formats.
export function bindToggle(button, onChange) {
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
}

export const fmtKm = (m) => `${Math.round(m / 1000).toLocaleString()} km`;

export const fmtDist = (m) => {
  const a = Math.abs(m);
  if (a < 1) return `${Math.round(a * 100)} cm`;
  if (a < 1000) return `${a < 10 ? a.toFixed(1) : Math.round(a)} m`;
  return fmtKm(a);
};

// Changes an element's HTML only when it's different. The steps redraw every frame, and
// rewriting a live caption 60 times a second would keep screen readers talking.
const shown = new WeakMap();
export function setHTML(el, html) {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  el.innerHTML = html;
}
