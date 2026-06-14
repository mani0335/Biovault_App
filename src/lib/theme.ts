/**
 * PINIT theme — light / dark mode.
 *
 * The app is built dark-first with hard-coded dark utility classes. Light mode
 * is delivered by toggling a `light` class on <html>; index.css remaps the dark
 * neutral surfaces to a soft light palette while keeping the vivid accent
 * gradients colourful. Preference is persisted in localStorage.
 */

export type Theme = 'light' | 'dark';

const KEY = 'pinit_theme';

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  try {
    const root = document.documentElement;
    root.classList.toggle('light', theme === 'light');
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch { /* ignore */ }
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
  try {
    window.dispatchEvent(new CustomEvent('pinit_theme_change', { detail: theme }));
  } catch { /* ignore */ }
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Apply the saved theme as early as possible (call before React renders). */
export function initTheme(): Theme {
  const t = getStoredTheme();
  applyTheme(t);
  return t;
}
