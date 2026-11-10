import { Link } from 'react-router'
import { changelog, changelogText } from '../data/changelog'
import { findProject, selectProjects } from '../features/catalog/selectors'
import type { Catalog } from '../features/catalog/types'

const kindLabels = { site: 'サイト', launch: 'サイト', project: '作品' } as const

export function AboutPage({ catalog }: { catalog: Catalog }) {
  const listed = selectProjects(catalog.projects, { query: '', category: '', status: '' })
  // Counts per category. "Other" appears only once it has something in it.
  const counts = catalog.categories
    .map((category) => ({ ...category, count: listed.filter((project) => project.category === category.id).length }))
    .filter((category) => category.id !== 'other' || category.count > 0)

  return <div className="container page">
    <h1 tabIndex={-1}>このサイトについて</h1>
    <section className="about-text" aria-labelledby="about-title">
      <h2 id="about-title" className="visually-hidden">置いているもの</h2>
      <p>Pirafu2411が作ったゲームやWebアプリ、ツールを置いています。気になったものから触ってみてください。</p>
      <p>ブラウザで動くものは「あそぶ」「つかう」から別タブで開けます。動かせないものは、説明と画像だけ載せています。</p>
    </section>
    <section className="stats" aria-labelledby="stats-title">
      <h2 id="stats-title" className="visually-hidden">作品の数</h2>
      <dl>
        <div className="stat"><dt>作品</dt><dd>{listed.length}</dd></div>
        {counts.map((category) => <div key={category.id} className="stat"><dt>{category.label}</dt><dd>{category.count}</dd></div>)}
      </dl>
    </section>
    <section id="changelog" className="changelog-section" aria-labelledby="changelog-title">
      <h2 id="changelog-title" className="section-title">更新履歴</h2>
      <ol className="changelog">
        {changelog.map((entry) => {
          const project = entry.kind === 'project' ? findProject(catalog.projects, entry.projectId) : undefined
          const text = changelogText(entry, catalog.projects)
          return <li key={`${entry.date}-${text}`}>
            <time dateTime={entry.date}>{entry.date.replaceAll('-', '.')}</time>
            <span className={`changelog__kind changelog__kind--${entry.kind}`}>{kindLabels[entry.kind]}</span>
            <p>
              {text}
              {project?.visibility === 'public' && <> <Link to={`/projects/${project.id}`}>作品ページへ</Link></>}
            </p>
          </li>
        })}
      </ol>
    </section>
  </div>
}
