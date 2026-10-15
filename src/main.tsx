import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'
import { catalog } from './data/catalog'
import './styles/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App catalog={catalog} /></BrowserRouter></StrictMode>,
)
