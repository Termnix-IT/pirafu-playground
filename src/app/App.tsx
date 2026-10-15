import { useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import type { Catalog } from '../features/catalog/types'
import { findProject } from '../features/catalog/selectors'
import { CatalogPage } from '../pages/CatalogPage'
import { ProjectPage } from '../pages/ProjectPage'
import { AboutPage } from '../pages/AboutPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { LogoMark } from '../components/Icons'

function RouteAccessibility({ catalog }: { catalog: Catalog }) {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    const match = /^\/projects\/([^/]+)\/?$/u.exec(pathname)
    const project = match ? findProject(catalog.projects, match[1]) : undefined
    const title = pathname === '/' ? '作品一覧' : pathname === '/about' ? 'このサイトについて' : project?.title ?? 'ページが見つかりません'
    document.title = `${title} | Pirafu2411 Playground`
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots) }
    robots.content = project?.visibility === 'unlisted' ? 'noindex, nofollow' : 'index, follow'
    if (previousPath.current !== pathname) document.querySelector<HTMLElement>('main h1')?.focus()
    previousPath.current = pathname
  }, [pathname, catalog])
  return null
}

export function App({ catalog }: { catalog: Catalog }) {
  return <>
    <a className="skip-link" href="#main">本文へ移動</a>
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-logo"><LogoMark /><span>Pirafu2411 Playground</span></Link>
        <nav aria-label="メインナビゲーション" className="site-nav">
          <NavLink to="/" end>作品一覧</NavLink>
          <NavLink to="/about">このサイトについて</NavLink>
        </nav>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="site-main">
      <Routes>
        <Route path="/" element={<CatalogPage catalog={catalog} />} />
        <Route path="/projects/:id" element={<ProjectPage catalog={catalog} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>Pirafu2411 Playground</p>
        <Link to="/about">このサイトについて</Link>
      </div>
    </footer>
    <RouteAccessibility catalog={catalog} />
  </>
}
