import { ViewTransition } from 'react'
import { Link, useParams } from 'react-router'
import { findProject, selectRelatedProjects, writeFilters } from '../features/catalog/selectors'
import { launchTypeLabels, statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'
import { CategoryPill, StatusPill } from '../components/Badges'
import { CodeIcon, ExternalIcon, StatusIcon } from '../components/Icons'
import { LaunchAction } from '../components/LaunchAction'
import { MediaGallery } from '../components/MediaGallery'
import { ProjectMiniCard } from '../components/ProjectCard'
import { NotFoundPage } from './NotFoundPage'

export function ProjectPage({ catalog }: { catalog: Catalog }) {
  const { id } = useParams()
  const project = findProject(catalog.projects, id)
  if (!project) return <NotFoundPage />
  const category = catalog.categories.find(({ id: categoryId }) => categoryId === project.category)
  const categoryHref = `/?${writeFilters({ query: '', category: project.category, status: '' })}`
  const related = selectRelatedProjects(catalog.projects, project)
  const { repository, website } = project.links ?? {}

  return <>
    <nav aria-label="パンくずリスト" className="breadcrumb">
      <ol>
        <li><Link to="/">作品一覧</Link></li>
        {category && <li><Link to={categoryHref}>{category.label}</Link></li>}
        <li aria-current="page">{project.title}</li>
      </ol>
    </nav>
    <div className="project-hero">
      <div className="project-hero__text">
        <ul className="pill-list" aria-label="作品の分類">
          {category && <li><CategoryPill category={category.id} label={category.label} /></li>}
          <li><StatusPill status={project.status} /></li>
          <li><span className="pill">{launchTypeLabels[project.launch.type]}</span></li>
        </ul>
        <ViewTransition name={`title-${project.id}`}><h1 tabIndex={-1}>{project.title}</h1></ViewTransition>
      </div>
      <div className="project-hero__actions">
        <LaunchAction project={project} large />
        {(repository || website) && <ul className="link-buttons" aria-label="関連リンク">
          {repository && <li><a className="button button--outline" href={repository} target="_blank" rel="noopener noreferrer"><CodeIcon size={18} />GitHub（別タブ）</a></li>}
          {website && <li><a className="button button--outline" href={website} target="_blank" rel="noopener noreferrer"><ExternalIcon size={18} />関連サイト（別タブ）</a></li>}
        </ul>}
      </div>
    </div>
    <MediaGallery key={project.id} transitionName={`media-${project.id}`} thumbnail={project.thumbnail} screenshots={project.screenshots} />
    <div className="project-body">
      <section aria-labelledby="about-title" className="project-about">
        <h2 id="about-title" className="section-title">作品について</h2>
        <p className="project-description">{project.description}</p>
      </section>
      <section aria-labelledby="info-title" className="info-panel">
        <h2 id="info-title" className="section-title">作品情報</h2>
        <dl className="info-list">
          <dt>カテゴリー</dt><dd>{category?.label}</dd>
          <dt>開発状況</dt><dd><span className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</span></dd>
          <dt>公開方式</dt><dd>{launchTypeLabels[project.launch.type]}</dd>
          {project.tags.length > 0 && <><dt>タグ</dt><dd>{project.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</dd></>}
        </dl>
      </section>
    </div>
    {related.length > 0 && <section aria-labelledby="related-title" className="related">
      <div className="related__header">
        <h2 id="related-title" className="section-title">同じカテゴリーの作品</h2>
        {category && <Link to={categoryHref}>{category.label}をすべて見る</Link>}
      </div>
      <ul className="related-list">
        {related.map((item) => <li key={item.id}><ProjectMiniCard project={item} /></li>)}
      </ul>
    </section>}
  </>
}
