import { useCallback, useEffect, useRef } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { Catalog } from '../features/catalog/types'
import { findProject } from '../features/catalog/selectors'
import { CatalogPage } from '../pages/CatalogPage'
import { ProjectPage } from '../pages/ProjectPage'
import { AboutPage } from '../pages/AboutPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { LogoMark, SearchIcon } from '../components/Icons'
import { SEARCH_INPUT_ID, searchFocusState, wantsSearchFocus } from './searchFocus'

function RouteAccessibility({ catalog }: { catalog: Catalog }) {
  const { pathname, hash, state } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    const match = /^\/projects\/([^/]+)\/?$/u.exec(pathname)
    const project = match ? findProject(catalog.projects, match[1]) : undefined
    const title = pathname === '/' ? '作品一覧' : pathname === '/about' ? 'このサイトについて' : project?.title ?? 'ページが見つかりません'
    document.title = `${title} | Pirafu2411 Playground`
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots) }
    robots.content = project?.visibility === 'unlisted' ? 'noindex, nofollow' : 'index, follow'
    if (previousPath.current !== pathname) {
      // The catalog page focuses its own search field when asked; a hash scrolls to its section; otherwise
      // the new page heading takes focus, which also brings the top of the page into view.
      const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
      if (!wantsSearchFocus(state)) {
        if (target) target.scrollIntoView()
        else document.querySelector<HTMLElement>('main h1')?.focus()
      }
      // The staggered entrance is for the first page load only; later page changes use view transitions.
      document.documentElement.dataset.navigated = ''
    }
    previousPath.current = pathname
  }, [pathname, hash, state, catalog])
  return null
}

const navItems = [
  { to: '/', label: '作品', matches: (pathname: string) => pathname === '/' || pathname.startsWith('/projects/') },
  { to: '/about', label: 'このサイトについて', matches: (pathname: string) => pathname === '/about' },
]

// A segmented switch. Every item keeps the same font weight so labels never shift, and only the
// selected item holds the indicator, which the view transition slides from the old item to the new one.
function SiteNav() {
  const { pathname } = useLocation()
  return <nav aria-label="メインナビゲーション" className="site-nav">
    {navItems.map((item) => {
      const selected = item.matches(pathname)
      return <Link key={item.to} to={item.to} className={selected ? 'is-selected' : undefined}
        aria-current={pathname === item.to ? 'page' : selected ? 'true' : undefined}>
        {selected && <span className="nav-indicator" aria-hidden="true" />}
        <span className="nav-label">{item.label}</span>
      </Link>
    })}
  </nav>
}

// Opens the catalog search from anywhere: the header button and Ctrl/⌘+K share this.
function useOpenSearch() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return useCallback(() => {
    if (pathname === '/') document.getElementById(SEARCH_INPUT_ID)?.focus()
    else navigate({ pathname: '/', hash: '#works' }, { state: searchFocusState })
  }, [pathname, navigate])
}

function SearchButton() {
  const openSearch = useOpenSearch()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearch])
  return <button type="button" className="search-button" onClick={openSearch} aria-keyshortcuts="Control+K Meta+K">
    <SearchIcon size={16} />
    <span className="search-button__label">作品を探す</span>
    <kbd className="search-button__kbd" aria-hidden="true">Ctrl K</kbd>
  </button>
}

export function App({ catalog }: { catalog: Catalog }) {
  return <>
    <a className="skip-link" href="#main">本文へ移動</a>
    <header className="site-header">
      <div className="site-header__inner container">
        <Link to="/" className="site-logo"><LogoMark /><span>Pirafu2411 <span className="site-logo__sub">Playground</span></span></Link>
        <SiteNav />
        <SearchButton />
      </div>
    </header>
    <main id="main" tabIndex={-1} className="site-main">
      <Routes>
        <Route path="/" element={<CatalogPage catalog={catalog} />} />
        <Route path="/projects/:id" element={<ProjectPage catalog={catalog} />} />
        <Route path="/about" element={<AboutPage catalog={catalog} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <p>Pirafu2411 Playground</p>
        <Link to="/about">このサイトについて</Link>
      </div>
    </footer>
    <RouteAccessibility catalog={catalog} />
  </>
}
