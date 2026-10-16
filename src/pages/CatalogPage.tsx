import { Link, useSearchParams } from 'react-router'
import { CategoryIcon, SearchIcon } from '../components/Icons'
import { ProjectList } from '../components/ProjectList'
import { readFilters, selectProjects, writeFilters } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const projects = selectProjects(catalog.projects, filters)
  const filtered = Boolean(filters.query || filters.category || filters.status)
  // Category links keep the current keyword and status, so switching categories never drops the other conditions.
  const categoryHref = (category: string) => {
    const search = writeFilters({ ...filters, category }).toString()
    return search ? `/?${search}` : '/'
  }

  return <>
    <div className="page-intro">
      <h1 tabIndex={-1}>作品一覧</h1>
      <p>個人で作ったゲームやツールを置いています。</p>
    </div>
    <div className="catalog-controls">
      <nav aria-label="カテゴリー" className="category-nav">
        <ul>
          <li><Link to={categoryHref('')} className="chip" aria-current={filters.category ? undefined : 'true'}>すべて</Link></li>
          {catalog.categories.map((category) => <li key={category.id}>
            <Link to={categoryHref(category.id)} className="chip" aria-current={filters.category === category.id ? 'true' : undefined}>
              <CategoryIcon category={category.id} size={18} />{category.label}
            </Link>
          </li>)}
        </ul>
      </nav>
      <form role="search" className="catalog-search" key={params.toString()} onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setParams(writeFilters({ query: String(data.get('q') ?? ''), category: String(data.get('category') ?? ''), status: String(data.get('status') ?? '') }))
      }}>
        <input type="hidden" name="category" defaultValue={filters.category} />
        <div className="field field--grow">
          <label htmlFor="query">タイトル・タグ</label>
          <div className="search-input"><SearchIcon /><input id="query" name="q" type="search" defaultValue={filters.query} /></div>
        </div>
        <div className="field">
          <label htmlFor="status">開発状況</label>
          <select id="status" name="status" defaultValue={filters.status}>
            <option value="">すべて</option>
            {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <button type="submit" className="button button--dark">絞り込む</button>
        {filtered && <Link to="/" className="reset-link">条件を解除</Link>}
      </form>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="result-count">{projects.length}件の作品</p>
    <ProjectList projects={projects} categories={catalog.categories} />
  </>
}
