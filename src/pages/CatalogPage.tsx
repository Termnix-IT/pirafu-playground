import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { SEARCH_INPUT_ID, wantsSearchFocus } from '../app/searchFocus'
import { SearchIcon } from '../components/Icons'
import { UnlockCard } from '../components/ProjectCard'
import { ProjectList } from '../components/ProjectList'
import { TilePuzzle } from '../components/TilePuzzle'
import type { TileTone } from '../components/TilePuzzle'
import { changelog, changelogText } from '../data/changelog'
import { readFilters, selectProjects, writeFilters } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog, CatalogFilters } from '../features/catalog/types'
import { pickNext, solvedOrder, swapTiles } from '../features/playground/tilePuzzle'

const noFilters: CatalogFilters = { query: '', category: '', status: '' }
const toSearch = (filters: CatalogFilters) => {
  const search = writeFilters(filters).toString()
  return search ? `?${search}` : ''
}

const PUZZLE_WORD = 'PLAYGROUND'
const puzzleTones: TileTone[] = ['paper', 'lime', 'paper', 'paper', 'cobalt', 'cobalt', 'paper', 'lime', 'paper', 'ink']
// A fixed first scramble (A and U swapped) keeps the first paint stable; "まぜる" makes random ones.
const firstOrder = swapTiles(solvedOrder(PUZZLE_WORD.length), 2, 7)

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = readFilters(params)
  const projects = selectProjects(catalog.projects, filters)
  const listed = selectProjects(catalog.projects, noFilters)
  const filtered = Boolean(filters.query || filters.category || filters.status)
  const labelOf = (id: string) => catalog.categories.find((category) => category.id === id)?.label ?? ''
  const worksRef = useRef<HTMLElement>(null)

  // The card beside the puzzle: the featured work first, then a random listed work for every solve.
  const [reveal, setReveal] = useState<{ id?: string; unlocked: boolean }>(() => ({ id: (listed.find((project) => project.featured) ?? listed[0])?.id, unlocked: false }))
  const revealed = listed.find((project) => project.id === reveal.id) ?? listed[0]
  const unlockNext = () => {
    const next = pickNext(listed, revealed?.id, Math.random)
    setReveal({ id: next?.id, unlocked: true })
    return next ? `${next.title}を表示しました。` : ''
  }

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
      {/* The stage: the headline and a PLAYGROUND tile puzzle on the left, and on the right the card that a solved
          puzzle fills with a random work. */}
      <section className="home-stage" aria-labelledby="home-title">
        <div className="home-stage__play">
          <h1 id="home-title" tabIndex={-1}><span className="marker">作ったゲームとツール</span></h1>
          <p className="home-stage__lead">Pirafu2411が個人で作ったものを置いています。ブラウザでそのまま開けるものもあります。</p>
          <TilePuzzle name="home" word={PUZZLE_WORD} tones={puzzleTones} columns={5} initialOrder={firstOrder}
            label="PLAYGROUNDのタイルパズル" onSolve={unlockNext}
            hint="PLAYGROUND の順に並べると、作品をひとつ選んで表示します。タイルは2枚選ぶと入れ替わり、選んだタイルは矢印キーでも動かせます。" />
        </div>
        {revealed && <UnlockCard project={revealed} categoryLabel={labelOf(revealed.category)} unlocked={reveal.unlocked} />}
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

    <section id="works" ref={worksRef} className="container works" aria-labelledby="works-title">
      <div className="works__header">
        <h2 id="works-title"><span className="marker">すべての作品</span><span className="works__count" aria-hidden="true">{String(listed.length).padStart(2, '0')}</span></h2>
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
      {/* Not a <form>: the fields filter as they change, so there is nothing to submit, and Enter in a form could
          fall through to a native submission that reloads the page without the query. */}
      <div role="search" aria-label="作品の検索" className="works__toolbar">
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
      </div>
      <ProjectList projects={projects} categories={catalog.categories} showUpcoming={!filtered} />
    </section>
  </>
}
