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
