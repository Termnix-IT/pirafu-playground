import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { applyTheme, currentTheme, readStoredTheme, storeTheme } from '../app/theme'
import type { Theme } from '../app/theme'
import { MoonIcon, SunIcon } from './Icons'

const themeNames: Record<Theme, string> = { light: 'ライト', dark: 'ダーク' }

// Switches between the light and dark themes and remembers the choice. Until a choice is saved,
// the theme follows the OS setting, including changes made while the page is open.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (!readStoredTheme()) setTheme(query.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = `${themeNames[next]}テーマに切り替え`
  const toggle = () => {
    storeTheme(next)
    const update = () => flushSync(() => {
      applyTheme(next)
      setTheme(next)
    })
    // A cross-fade between the two themes where the browser supports it; reduced motion skips it in CSS.
    if (typeof document.startViewTransition === 'function') document.startViewTransition(update)
    else update()
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
  </button>
}
