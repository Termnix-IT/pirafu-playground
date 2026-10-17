// Color theme helpers. public/theme.js applies the same rule before the first paint.
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'pirafu-theme'
const themeColors: Record<Theme, string> = { light: '#f6f5f1', dark: '#0a0a0f' }

export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme
  return applied === 'light' || applied === 'dark' ? applied : readStoredTheme() ?? systemTheme()
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme])
}

export function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private windows or blocked storage: the theme still applies for this visit.
  }
}
