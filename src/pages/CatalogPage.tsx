import { useEffect, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ProjectList } from '../components/ProjectList'
import { changelog, changelogText } from '../data/changelog'
import { readFilters, selectProjects, writeFilters } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog, CatalogFilters } from '../features/catalog/types'

const noFilters: CatalogFilters = { query: '', category: '', status: '' }
const toSearch = (filters: CatalogFilters) => {
  const search = writeFilters(filters).toString()
  return search ? `?${search}` : '/'
}

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const filters = readFilters(params)
  const projects = selectProjects(catalog.projects, filters)
  const listed = selectProjects(catalog.projects, noFilters)
  const worksRef = useRef<HTMLElement>(null)

  // The page offers the category chips only. A search word or a development status can still arrive in the URL
  // (an old bookmark, a hand-written link); the note under the chips says so and offers the way out.
  const statusLabel = filters.status in statusLabels ? statusLabels[filters.status as keyof typeof statusLabels] : filters.status
  const extraConditions = [filters.query && `「${filters.query}」`, filters.status && `開発状況「${statusLabel}」`].filter(Boolean)
  // Categories with no listed work stay out of the chips, except the one the URL has selected.
  const chips = catalog.categories
    .map((category) => ({ ...category, count: listed.filter((project) => project.category === category.id).length }))
    .filter((category) => category.count > 0 || category.id === filters.category)

  useEffect(() => {
    if (location.hash === '#works') worksRef.current?.scrollIntoView({ block: 'start' })
  }, [location.key, location.hash])

  return <div className="container home">
    <section className="intro" aria-labelledby="home-title">
      <h1 id="home-title" tabIndex={-1}>作ったゲームとツール</h1>
      <p>Pirafu2411が個人で作ったものを置いています。ブラウザでそのまま開けるものもあります。</p>
    </section>

    <section id="works" ref={worksRef} className="works" aria-labelledby="works-title">
      <h2 id="works-title" className="visually-hidden">すべての作品</h2>
      <nav aria-label="カテゴリー" className="category-nav">
        <ul>
          <li><Link to={toSearch({ ...filters, category: '' })} className="chip" aria-current={filters.category ? undefined : 'true'}>
            すべて<span className="chip__count" aria-hidden="true">{listed.length}</span>
          </Link></li>
          {chips.map((category) => <li key={category.id}>
            <Link to={toSearch({ ...filters, category: category.id })} className="chip" aria-current={filters.category === category.id ? 'true' : undefined}>
              {category.label}<span className="chip__count" aria-hidden="true">{category.count}</span>
            </Link>
          </li>)}
        </ul>
      </nav>
      {extraConditions.length > 0 && <p className="filter-note">
        <span>{extraConditions.join('・')}で絞り込んでいます。</span>
        <Link to={toSearch({ ...noFilters, category: filters.category })}>条件を解除</Link>
      </p>}
      <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">{projects.length}件の作品</p>
      <ProjectList projects={projects} categories={catalog.categories} />
    </section>

    <section className="updates-strip" aria-labelledby="updates-title">
      <h2 id="updates-title">更新履歴</h2>
      <ol>
        {changelog.slice(0, 3).map((entry) => {
          const text = changelogText(entry, catalog.projects)
          return <li key={`${entry.date}-${text}`}>
            <time dateTime={entry.date}>{entry.date.slice(5).replace('-', '.')}</time>
            <span>{text}</span>
          </li>
        })}
      </ol>
      <Link to="/about#changelog">すべて見る</Link>
    </section>
  </div>
}
