import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'
import { catalog } from './data/catalog'
// Self-hosted fonts (OFL-1.1): the CSP allows same-origin files only. The Japanese font loads from its own
// stylesheet after the entry CSS (see fonts-ja.ts), and browsers download just the unicode-range subsets a page uses.
import '@fontsource/sora/500.css'
import '@fontsource/sora/700.css'
import '@fontsource/sora/800.css'
import './styles/base.css'

void import('./styles/fonts-ja')

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App catalog={catalog} /></BrowserRouter></StrictMode>,
)
