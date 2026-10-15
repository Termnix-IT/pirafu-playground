import { Link } from 'react-router'
import { changelog } from '../data/changelog'
import { findProject } from '../features/catalog/selectors'
import type { Catalog } from '../features/catalog/types'

const kindLabels = { site: 'サイト', project: '作品' } as const

export function AboutPage({ catalog }: { catalog: Catalog }) {
  return <div className="prose">
    <h1 tabIndex={-1}>このサイトについて</h1>
    <p>Pirafu2411 Playgroundは、Pirafu2411が個人制作したWebアプリ・ミニゲーム・ツールを紹介する制作拠点です。</p>
    <section aria-labelledby="about-works-title" className="prose">
      <h2 id="about-works-title" className="section-title">掲載している作品</h2>
      <p>ブラウザで遊べる・使える作品と、説明や画像だけを掲載する作品があります。作品本体はそれぞれ独立したサイトで公開しており、作品ページの「あそぶ」「つかう」ボタンから別タブで開きます。</p>
      <p>一部の作品は表示を確認するための構成サンプルです。同じ種類の作品を掲載した時点で、順次削除します。</p>
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
              {project?.visibility === 'public' && <> <Link to={`/projects/${project.id}`}>作品ページを見る</Link></>}
            </p>
          </li>
        })}
      </ol>
    </section>
  </div>
}
