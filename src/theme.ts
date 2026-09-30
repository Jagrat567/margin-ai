export type Theme = 'light' | 'dark';
const key = 'margin.theme.v1';
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Theme remains usable when browser storage is unavailable. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(theme: Theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) { try { localStorage.setItem(key, theme); } catch { /* Keep the in-memory preference. */ } }
}
applyTheme(initialTheme());
