// Sets the color theme before the first paint so a saved choice never flashes the other theme.
// It runs as a same-origin file because the CSP blocks inline scripts. Keep THEME_KEY in sync with src/app/theme.ts.
(function () {
  var THEME_KEY = 'pirafu-theme'
  function readStored() {
    try { return window.localStorage.getItem(THEME_KEY) } catch { return null }
  }
  var stored = readStored()
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light'
})()
