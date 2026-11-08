import { Link } from 'react-router'
import { changelog } from '../data/changelog'
import { findProject, selectProjects } from '../features/catalog/selectors'
import type { Catalog } from '../features/catalog/types'

const kindLabels = { site: 'サイト', project: '作品' } as const
const decorTones = ['paper', 'lime', 'cobalt', 'lime', 'cobalt']

export function AboutPage({ catalog }: { catalog: Catalog }) {
  const listed = selectProjects(catalog.projects, { query: '', category: '', status: '' })
  // Counts per category. "Other" appears only once it has something in it.
  const counts = catalog.categories
    .map((category) => ({ ...category, count: listed.filter((project) => project.category === category.id).length }))
    .filter((category) => category.id !== 'other' || category.count > 0)

  return <div className="container page">
    <div className="page-header">
      <div>
        <p className="eyebrow">02 / ABOUT</p>
        <h1 tabIndex={-1}><span className="marker">このサイトについて</span></h1>
      </div>
      <p className="decor-tiles" aria-hidden="true">
        {Array.from('ABOUT').map((letter, index) => <span key={letter} className={`title-tile tone-tile-${decorTones[index]}`}>{letter}</span>)}
      </p>
    </div>
    <div className="bento">
      <section className="tile about-tile" aria-labelledby="about-title">
        <h2 id="about-title" className="visually-hidden">置いているもの</h2>
        <p className="about-tile__lead">Pirafu2411が作ったゲームやWebアプリ、ツールを置いています。気になったものから触ってみてください。</p>
        <p>ブラウザで動くものは「あそぶ」「つかう」から別タブで開けます。動かせないものは、説明と画像だけ載せています。</p>
      </section>
      <section className="stats" aria-labelledby="stats-title">
        <h2 id="stats-title" className="visually-hidden">作品の数</h2>
        <dl>
          <div className="stat stat--total"><dt>作品</dt><dd>{listed.length}</dd></div>
          {counts.map((category) => <div key={category.id} className="stat"><dt>{category.label}</dt><dd>{category.count}</dd></div>)}
        </dl>
      </section>
      <section id="changelog" className="tile changelog-tile" aria-labelledby="changelog-title">
        <h2 id="changelog-title" className="tile__title"><span className="marker">更新履歴</span></h2>
        <ol className="changelog">
          {changelog.map((entry) => {
            const project = entry.projectId ? findProject(catalog.projects, entry.projectId) : undefined
            return <li key={`${entry.date}-${entry.text}`}>
              <time dateTime={entry.date}>{entry.date.replaceAll('-', '.')}</time>
              <span className={`changelog__kind changelog__kind--${entry.kind}`}>{kindLabels[entry.kind]}</span>
              <p>
                {entry.text}
                {project?.visibility === 'public' && <> <Link to={`/projects/${project.id}`}>作品ページへ</Link></>}
              </p>
            </li>
          })}
        </ol>
      </section>
    </div>
  </div>
}
