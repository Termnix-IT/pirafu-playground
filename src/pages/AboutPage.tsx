import { Link } from 'react-router'
import { changelog } from '../data/changelog'
import { findProject } from '../features/catalog/selectors'
import type { Catalog } from '../features/catalog/types'

const kindLabels = { site: 'サイト', project: '作品' } as const

export function AboutPage({ catalog }: { catalog: Catalog }) {
  return <div className="prose">
    <h1 tabIndex={-1}>このサイトについて</h1>
    <p>Pirafu2411が個人で作ったゲームやWebアプリ、ツールの置き場です。</p>
    <section aria-labelledby="about-works-title" className="prose">
      <h2 id="about-works-title" className="section-title">置いているもの</h2>
      <p>ブラウザで動くものは、作品ページの「あそぶ」「つかう」から別タブで開けます。動かせないものは、説明と画像だけ載せています。</p>
    </section>
    <section aria-labelledby="changelog-title">
      <h2 id="changelog-title" className="section-title">更新履歴</h2>
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
}
