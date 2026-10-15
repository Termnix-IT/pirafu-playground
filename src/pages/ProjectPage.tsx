import { Link, useParams } from 'react-router'
import { findProject } from '../features/catalog/selectors'
import { statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'
import { LaunchAction } from '../components/LaunchAction'
import { MediaGallery } from '../components/MediaGallery'
import { NotFoundPage } from './NotFoundPage'

export function ProjectPage({ catalog }: { catalog: Catalog }) {
  const { id } = useParams()
  const project = findProject(catalog.projects, id)
  if (!project) return <NotFoundPage />
  return <>
    <p><Link to="/">作品一覧へ</Link></p>
    <h1 tabIndex={-1}>{project.title}</h1>
    <dl>
      <dt>カテゴリー</dt><dd>{catalog.categories.find((category) => category.id === project.category)?.label}</dd>
      <dt>開発状況</dt><dd>{statusLabels[project.status]}</dd>
      <dt>公開方式</dt><dd>{project.launch.type === 'external' ? 'ブラウザアプリ' : '紹介のみ'}</dd>
    </dl>
    <p className="project-description">{project.description}</p>
    {project.tags.length > 0 && <p>タグ：{project.tags.join('、')}</p>}
    <LaunchAction project={project} />
    {project.links && (project.links.repository || project.links.website) && <section aria-labelledby="links-title">
      <h2 id="links-title">関連リンク</h2>
      <ul>
        {project.links.repository && <li><a href={project.links.repository} target="_blank" rel="noopener noreferrer">GitHub（別タブ）</a></li>}
        {project.links.website && <li><a href={project.links.website} target="_blank" rel="noopener noreferrer">関連サイト（別タブ）</a></li>}
      </ul>
    </section>}
    <MediaGallery key={project.id} thumbnail={project.thumbnail} screenshots={project.screenshots} />
  </>
}
