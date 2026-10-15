import { Link, useSearchParams } from 'react-router'
import { ProjectList } from '../components/ProjectList'
import { readFilters, selectProjects, writeFilters } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const projects = selectProjects(catalog.projects, filters)

  return <>
    <h1 tabIndex={-1}>作品一覧</h1>
    <p>個人制作のWebアプリ・ミニゲーム・ツールを紹介します。</p>
    <form className="catalog-filters" key={params.toString()} onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setParams(writeFilters({ query: String(data.get('q') ?? ''), category: String(data.get('category') ?? ''), status: String(data.get('status') ?? '') }))
    }}>
      <div><label htmlFor="query">タイトル・タグ</label><input id="query" name="q" type="search" defaultValue={filters.query} /></div>
      <div><label htmlFor="category">カテゴリー</label><select id="category" name="category" defaultValue={filters.category}>
        <option value="">すべて</option>
        {catalog.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
      </select></div>
      <div><label htmlFor="status">開発状況</label><select id="status" name="status" defaultValue={filters.status}>
        <option value="">すべて</option>
        {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></div>
      <button type="submit">絞り込む</button>
      <Link to="/">条件を解除</Link>
    </form>
    <p role="status" aria-live="polite" aria-atomic="true">{projects.length}件の作品</p>
    <ProjectList projects={projects} categories={catalog.categories} />
  </>
}
