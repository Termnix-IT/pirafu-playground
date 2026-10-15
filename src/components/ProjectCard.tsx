import { useState } from 'react'
import { Link } from 'react-router'
import type { CatalogProject } from '../features/catalog/types'
import { launchTypeLabels, statusLabels } from '../features/catalog/types'
import { CategoryArt } from './Badges'
import { CategoryIcon, StarIcon, StatusIcon } from './Icons'
import { LaunchAction } from './LaunchAction'

// Card images repeat what the title says, so they are decorative here. The detail page shows them with their descriptions.
function CardMedia({ project, label }: { project: CatalogProject; label?: string }) {
  const [failed, setFailed] = useState(false)
  if (!project.thumbnail || failed) return <CategoryArt category={project.category} label={label} />
  const { src, width, height } = project.thumbnail
  return <img src={src} alt="" width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
}

export function ProjectCard({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  const titleId = `title-${project.id}`
  const launchable = project.launch.type === 'external' && project.launchEnabled && Boolean(project.launch.url)
  return <article className={`project-card${project.featured ? ' project-card--featured' : ''}`} aria-labelledby={titleId}>
    <div className="project-card__media">
      <CardMedia key={project.thumbnail?.src} project={project} label={categoryLabel} />
      <span className="status-sticker" aria-hidden="true"><StatusIcon status={project.status} />{statusLabels[project.status]}</span>
    </div>
    <div className="project-card__body">
      {project.featured && <p className="pickup-label"><StarIcon size={15} />ピックアップ</p>}
      <h2 id={titleId} className="project-card__title">
        <Link to={`/projects/${project.id}`} className="project-card__link">{project.title}</Link>
      </h2>
      <p className="project-meta">
        <span><CategoryIcon category={project.category} size={16} />{categoryLabel}</span>
        <span className="visually-hidden">開発状況：{statusLabels[project.status]}</span>
        <span>{launchTypeLabels[project.launch.type]}</span>
      </p>
      <p className="project-card__description">{project.description}</p>
      {project.tags.length > 0 && <ul className="tag-list" aria-label="タグ">{project.tags.map((tag) => <li key={tag}>#{tag}</li>)}</ul>}
      {project.featured && launchable && <div className="project-card__actions"><LaunchAction project={project} /></div>}
    </div>
  </article>
}

export function ProjectMiniCard({ project }: { project: CatalogProject }) {
  const titleId = `related-${project.id}`
  return <article className="mini-card" aria-labelledby={titleId}>
    <div className="mini-card__media"><CardMedia key={project.thumbnail?.src} project={project} /></div>
    <div className="mini-card__body">
      <h3 id={titleId} className="mini-card__title"><Link to={`/projects/${project.id}`} className="project-card__link">{project.title}</Link></h3>
      <p><StatusIcon status={project.status} />{statusLabels[project.status]}</p>
    </div>
  </article>
}
