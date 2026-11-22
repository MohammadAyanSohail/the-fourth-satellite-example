// Light and dark mode. The page starts in dark "space" mode and remembers the choice.
// The canvases read their colours from the same CSS variables as the page, so they switch too.
const KEY = 'blue-dot-theme';

export let palette = {};

function readColours() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  palette = {
    text: v('--text'), muted: v('--muted'), line: v('--line'), card: v('--card'),
    blue: v('--blue'), blueSoft: v('--blue-soft'), violet: v('--violet'), accent: v('--accent'),
    ground: v('--ground'), building: v('--building'), street: v('--street'),
  };
}

export function initTheme(button) {
  const set = (mode) => {
    document.documentElement.dataset.theme = mode;
    button.setAttribute('aria-pressed', String(mode === 'light'));
    button.setAttribute('aria-label', mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    localStorage.setItem(KEY, mode);
    readColours();
  };
  set(localStorage.getItem(KEY) || 'dark');
  button.addEventListener('click', () => set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}
