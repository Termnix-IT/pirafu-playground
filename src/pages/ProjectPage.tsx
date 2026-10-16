import { ViewTransition } from 'react'
import { Link, useParams } from 'react-router'
import { findProject, selectRelatedProjects, writeFilters } from '../features/catalog/selectors'
import { launchTypeLabels, statusLabels } from '../features/catalog/types'
import type { Catalog } from '../features/catalog/types'
import { CategoryPill, StatusPill } from '../components/Badges'
import { ArrowLeftIcon, CodeIcon, ExternalIcon, PlusIcon, StatusIcon } from '../components/Icons'
import { LaunchAction } from '../components/LaunchAction'
import { MediaGallery } from '../components/MediaGallery'
import { ProjectMiniCard } from '../components/ProjectCard'
import { NotFoundPage } from './NotFoundPage'

export function ProjectPage({ catalog }: { catalog: Catalog }) {
  const { id } = useParams()
  const project = findProject(catalog.projects, id)
  if (!project) return <NotFoundPage />
  const category = catalog.categories.find(({ id: categoryId }) => categoryId === project.category)
  const categoryHref = `/?${writeFilters({ query: '', category: project.category, status: '' })}#works`
  const related = selectRelatedProjects(catalog.projects, project)
  const { repository, website } = project.links ?? {}
  // The hero shows a screenshot in a device frame and blurs the thumbnail behind it. Both are decorative:
  // the gallery below repeats every image with its description.
  const deviceImage = project.screenshots[0] ?? project.thumbnail
  const backdropImage = project.thumbnail ?? project.screenshots[0]

  return <>
    <section className="detail-hero" aria-labelledby="detail-title">
      {backdropImage && <img className="detail-hero__backdrop" src={backdropImage.src} alt="" />}
      <div className="detail-hero__inner container">
        <div className="detail-hero__text">
          <nav aria-label="パンくずリスト" className="breadcrumb">
            <ol>
              <li><Link to="/">作品</Link></li>
              {category && <li><Link to={categoryHref}>{category.label}</Link></li>}
            </ol>
          </nav>
          <ViewTransition name={`title-${project.id}`}><h1 id="detail-title" className="detail-hero__title" tabIndex={-1}>{project.title}</h1></ViewTransition>
          <ul className="pill-list" aria-label="作品の分類">
            {category && <li><CategoryPill category={category.id} label={category.label} /></li>}
            <li><StatusPill status={project.status} /></li>
            <li><span className="pill">{launchTypeLabels[project.launch.type]}</span></li>
          </ul>
          <p className="detail-hero__lead">{project.description}</p>
          <div className="detail-hero__actions">
            <LaunchAction project={project} large />
            <Link to="/" className="button button--glass"><ArrowLeftIcon size={18} />作品一覧へ</Link>
          </div>
          {(repository || website) && <ul className="link-buttons" aria-label="関連リンク">
            {repository && <li><a href={repository} target="_blank" rel="noopener noreferrer"><CodeIcon size={16} />GitHub（別タブ）</a></li>}
            {website && <li><a href={website} target="_blank" rel="noopener noreferrer"><ExternalIcon size={16} />関連サイト（別タブ）</a></li>}
          </ul>}
        </div>
        {deviceImage && <ViewTransition name={`media-${project.id}`}><div className="device-frame">
          <img src={deviceImage.src} alt="" width={deviceImage.width} height={deviceImage.height} />
        </div></ViewTransition>}
      </div>
    </section>

    <div className="container bento detail-body">
      <MediaGallery key={project.id} thumbnail={project.thumbnail} screenshots={project.screenshots} />
      <section aria-labelledby="info-title" className="tile info-tile">
        <h2 id="info-title" className="tile__title">作品情報</h2>
        <dl className="info-list">
          <div><dt>カテゴリー</dt><dd>{category?.label}</dd></div>
          <div><dt>開発状況</dt><dd><span className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</span></dd></div>
          <div><dt>公開方式</dt><dd>{launchTypeLabels[project.launch.type]}</dd></div>
          {project.tags.length > 0 && <div><dt>タグ</dt><dd>{project.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</dd></div>}
        </dl>
      </section>
      <section aria-labelledby="related-title" className="related">
        <div className="related__header">
          <h2 id="related-title">ほかの{category?.label ?? '作品'}</h2>
          {category && related.length > 0 && <Link to={categoryHref}>{category.label}をすべて見る</Link>}
        </div>
        {related.length > 0
          ? <ul className="related-list">{related.map((item) => <li key={item.id}><ProjectMiniCard project={item} /></li>)}</ul>
          : <p className="upcoming-tile upcoming-tile--wide"><PlusIcon size={22} />次の{category?.label ?? '作品'}を制作中です</p>}
      </section>
    </div>
  </>
}
