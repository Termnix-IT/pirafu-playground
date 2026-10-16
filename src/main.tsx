import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'
import { catalog } from './data/catalog'
// Self-hosted fonts (OFL-1.1): the CSP allows same-origin files only. Japanese glyphs are split by unicode-range,
// so browsers download just the subsets a page uses.
import '@fontsource/sora/500.css'
import '@fontsource/sora/700.css'
import '@fontsource/sora/800.css'
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/700.css'
import '@fontsource/zen-kaku-gothic-new/900.css'
import './styles/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App catalog={catalog} /></BrowserRouter></StrictMode>,
)
