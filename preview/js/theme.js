/*
 * Light / dark theme, shared by both pages.
 * Loaded in <head> so the page is drawn in the right colours straight away.
 * Default = the device's setting; the header button saves the student's own choice
 * in localStorage (scheduleSandbox.theme = 'light' | 'dark').
 */
(function () {
  const KEY = 'scheduleSandbox.theme';
  const root = document.documentElement;
  const system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const MOON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 1.2a6.8 6.8 0 1 0 8.6 8.6A5.6 5.6 0 0 1 6.2 1.2z"/></svg>';
  const SUN = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/>' +
    '<path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M8 .9v1.8M8 13.3v1.8M.9 8h1.8M13.3 8h1.8M3 3l1.3 1.3M11.7 11.7 13 13M3 13l1.3-1.3M11.7 4.3 13 3"/></svg>';

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function chosen() {
    const s = saved();
    if (s === 'light' || s === 'dark') return s;
    return system && system.matches ? 'dark' : 'light';
  }

  // The button names the theme it switches to.
  function updateButton() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const dark = root.dataset.theme === 'dark';
    btn.innerHTML = dark ? `${SUN}<span>Light</span>` : `${MOON}<span>Dark</span>`;
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }

  function apply(theme) {
    root.dataset.theme = theme;
    updateButton();
  }

  apply(chosen());

  // Follow the device while the student hasn't picked a theme.
  if (system && system.addEventListener) {
    system.addEventListener('change', () => { if (!saved()) apply(chosen()); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    updateButton();
    btn.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switches */ }
      apply(next);
    });
  });
})();
