import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { SEARCH_INPUT_ID, searchFocusState, wantsSearchFocus } from '../app/searchFocus'
import { CategoryIcon, SearchIcon } from '../components/Icons'
import { FeaturedTile } from '../components/ProjectCard'
import { ProjectList } from '../components/ProjectList'
import { changelog } from '../data/changelog'
import { readFilters, selectProjects, writeFilters } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog, CatalogFilters } from '../features/catalog/types'

const noFilters: CatalogFilters = { query: '', category: '', status: '' }
const toSearch = (filters: CatalogFilters) => {
  const search = writeFilters(filters).toString()
  return search ? `?${search}` : ''
}

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = readFilters(params)
  const projects = selectProjects(catalog.projects, filters)
  const listed = selectProjects(catalog.projects, noFilters)
  const featured = listed.find((project) => project.featured)
  const filtered = Boolean(filters.query || filters.category || filters.status)
  const labelOf = (id: string) => catalog.categories.find((category) => category.id === id)?.label ?? ''
  const worksRef = useRef<HTMLElement>(null)

  // The field filters as you type. It keeps its own text (spaces included) and follows the URL only when the
  // query changes elsewhere, such as the back button or the reset link.
  const [query, setQuery] = useState(filters.query)
  const [syncedQuery, setSyncedQuery] = useState(filters.query)
  if (filters.query !== syncedQuery) {
    setSyncedQuery(filters.query)
    if (filters.query !== query.trim()) setQuery(filters.query)
  }

  useEffect(() => {
    if (wantsSearchFocus(location.state)) document.getElementById(SEARCH_INPUT_ID)?.focus()
    else if (location.hash === '#works') worksRef.current?.scrollIntoView({ block: 'start' })
  }, [location.key, location.state, location.hash])

  return <>
    <div className="container home-top">
      <div className="bento">
        <section className="tile intro-tile" aria-labelledby="home-title">
          <p className="eyebrow eyebrow--accent">PIRAFU2411 PLAYGROUND</p>
          <h1 id="home-title" tabIndex={-1}>作ったゲームと<br />ツールの置き場</h1>
          <p className="intro-tile__lead">個人で作ったものを置いています。ブラウザでそのまま遊べるものもあります。</p>
        </section>
        {featured && <FeaturedTile project={featured} categoryLabel={labelOf(featured.category)} />}
        <section className="tile updates-tile" aria-labelledby="updates-title">
          <div className="tile__header">
            <h2 id="updates-title">更新履歴</h2>
            <Link to="/about#changelog">すべて見る</Link>
          </div>
          <ol>
            {changelog.slice(0, 3).map((entry) => <li key={`${entry.date}-${entry.text}`}>
              <time dateTime={entry.date}>{entry.date.slice(5).replace('-', '.')}</time>
              <span>{entry.text}</span>
            </li>)}
          </ol>
        </section>
        <nav className="shortcut-row" aria-label="カテゴリー別に見る">
          {catalog.categories.map((category) => {
            const count = listed.filter((project) => project.category === category.id).length
            // "Other" appears only once it has something in it; the main three always show where they stand.
            if (category.id === 'other' && count === 0) return null
            return <Link key={category.id} to={{ search: toSearch({ ...noFilters, category: category.id }), hash: '#works' }}
              className={`tile shortcut-tile tone-${category.id}`} aria-label={`${category.label}（${count ? `${count}作品` : '準備中'}）`}>
              <CategoryIcon category={category.id} size={26} />
              <span className="shortcut-tile__row">
                <span className="shortcut-tile__label">{category.label}</span>
                {count ? <span className="shortcut-tile__count">{count}</span> : <span className="shortcut-tile__note">準備中</span>}
              </span>
            </Link>
          })}
          <Link to={{ search: location.search, hash: '#works' }} state={searchFocusState} className="tile shortcut-tile shortcut-tile--search">
            <SearchIcon size={26} />
            <span className="shortcut-tile__row"><span className="shortcut-tile__label">作品を探す</span></span>
          </Link>
        </nav>
      </div>
    </div>

    <section id="works" ref={worksRef} className="container works" aria-labelledby="works-title">
      <div className="works__header">
        <div>
          <p className="eyebrow">ALL WORKS</p>
          <h2 id="works-title">すべての作品</h2>
        </div>
        <nav aria-label="カテゴリー" className="category-nav">
          <ul>
            <li><Link to={toSearch({ ...filters, category: '' }) || '/'} className="chip" aria-current={filters.category ? undefined : 'true'}>すべて</Link></li>
            {catalog.categories.map((category) => <li key={category.id}>
              <Link to={toSearch({ ...filters, category: category.id })} className="chip" aria-current={filters.category === category.id ? 'true' : undefined}>
                {category.label}
              </Link>
            </li>)}
          </ul>
        </nav>
      </div>
      <form role="search" className="works__toolbar" onSubmit={(event) => event.preventDefault()}>
        <div className="field field--grow">
          <label htmlFor={SEARCH_INPUT_ID}>タイトル・タグ</label>
          <div className="search-input">
            <SearchIcon size={18} />
            <input id={SEARCH_INPUT_ID} type="search" value={query} autoComplete="off" onChange={(event) => {
              setQuery(event.target.value)
              setParams(writeFilters({ ...filters, query: event.target.value }), { replace: true })
            }} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="status">開発状況</label>
          <select id="status" value={filters.status} onChange={(event) => setParams(writeFilters({ ...filters, status: event.target.value }))}>
            <option value="">すべて</option>
            {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="result-count">{projects.length}件の作品</p>
        {filtered && <Link to={{ pathname: '/', hash: '#works' }} className="reset-link">条件を解除</Link>}
      </form>
      <ProjectList projects={projects} categories={catalog.categories} showUpcoming={!filtered} />
    </section>
  </>
}
