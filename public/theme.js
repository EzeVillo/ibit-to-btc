(() => {
  const storageKey = 'ibit-to-btc-theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const validPreference = value => ['system', 'light', 'dark'].includes(value);

  function readPreference() {
    try {
      const saved = localStorage.getItem(storageKey);
      return validPreference(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  let preference = readPreference();

  function applyTheme() {
    const theme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="color-scheme"]').content = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0f1624' : '#173cd5';
    const select = document.querySelector('#theme-select');
    if (select) select.value = preference;
  }

  // Restore the theme before the application loads to avoid showing the wrong palette.
  applyTheme();
  document.addEventListener('DOMContentLoaded', applyTheme, { once: true });

  document.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'theme-select' || !validPreference(select.value)) return;
    preference = select.value;
    try {
      if (preference === 'system') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, preference);
    } catch {
      // The selected theme still works when the browser blocks storage.
    }
    applyTheme();
  });

  systemTheme.addEventListener('change', () => {
    if (preference === 'system') applyTheme();
  });

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      preference = readPreference();
      applyTheme();
    }
  });
})();
