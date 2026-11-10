import { ViewTransition } from 'react'
import { Link, useParams } from 'react-router'
import { findProject, selectRelatedProjects, writeFilters } from '../features/catalog/selectors'
import { launchTypeLabels, statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'
import { WorkMeta } from '../components/Badges'
import { ArrowLeftIcon, CodeIcon, ExternalIcon, StatusIcon } from '../components/Icons'
import { LaunchAction } from '../components/LaunchAction'
import { MediaGallery } from '../components/MediaGallery'
import { ProjectMiniCard } from '../components/ProjectCard'
import { NotFoundPage } from './NotFoundPage'

export function ProjectPage({ catalog }: { catalog: Catalog }) {
  const { id } = useParams()
  const project = findProject(catalog.projects, id)
  if (!project) return <NotFoundPage />
  const category = catalog.categories.find(({ id: categoryId }) => categoryId === project.category)
  const labelOf = (categoryId: string) => catalog.categories.find((item) => item.id === categoryId)?.label ?? ''
  const categoryHref = `/?${writeFilters({ query: '', category: project.category, status: '' })}#works`
  const related = selectRelatedProjects(catalog.projects, project)
  const hasSameCategory = related.some((item) => item.category === project.category)
  const { repository, website } = project.links ?? {}

  return <div className="container detail">
    <section className="detail-head" aria-labelledby="detail-title">
      <div className="detail-head__text">
        <nav aria-label="パンくずリスト" className="breadcrumb">
          <ol>
            <li><Link to="/">作品</Link></li>
            {category && <li><Link to={categoryHref}>{category.label}</Link></li>}
          </ol>
        </nav>
        <WorkMeta categoryLabel={category?.label ?? ''} status={project.status} extra={[launchTypeLabels[project.launch.type]]} />
        <ViewTransition name={`title-${project.id}`}><h1 id="detail-title" className="detail-head__title" tabIndex={-1}>{project.title}</h1></ViewTransition>
        <p className="detail-head__lead">{project.description}</p>
        <div className="detail-head__actions">
          <LaunchAction project={project} size="large" />
          {repository && <a className="button button--large" href={repository} target="_blank" rel="noopener noreferrer"><CodeIcon size={18} />GitHub（別タブ）</a>}
          {website && <a className="button button--large" href={website} target="_blank" rel="noopener noreferrer"><ExternalIcon size={18} />関連サイト（別タブ）</a>}
        </div>
      </div>
      <section aria-labelledby="info-title" className="panel info-panel">
        <h2 id="info-title" className="section-title">作品情報</h2>
        <dl className="info-list">
          <div><dt>カテゴリー</dt><dd>{category?.label}</dd></div>
          <div><dt>開発状況</dt><dd><span className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</span></dd></div>
          <div><dt>公開方式</dt><dd>{launchTypeLabels[project.launch.type]}</dd></div>
          {project.tags.length > 0 && <div><dt>タグ</dt><dd>{project.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</dd></div>}
        </dl>
      </section>
    </section>

    <MediaGallery key={project.id} thumbnail={project.thumbnail} screenshots={project.screenshots} transitionName={`media-${project.id}`} />

    <section aria-labelledby="related-title" className="related">
      <div className="related__header">
        <h2 id="related-title" className="section-title">ほかの作品</h2>
        {category && hasSameCategory && <Link to={categoryHref}>{category.label}をすべて見る</Link>}
      </div>
      {related.length > 0
        ? <ul className="related-list">{related.map((item) => <li key={item.id}><ProjectMiniCard project={item} categoryLabel={labelOf(item.category)} /></li>)}</ul>
        : <p className="related__empty">次の作品を制作中です。</p>}
    </section>
    <Link to="/" className="back-link"><ArrowLeftIcon size={18} />作品一覧へ</Link>
  </div>
}
