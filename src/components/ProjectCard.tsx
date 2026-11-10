import { useState, ViewTransition } from 'react'
import { Link } from 'react-router'
import type { CatalogProject } from '../features/catalog/types'
import { CategoryArt, WorkMeta } from './Badges'
import { isLaunchable } from '../features/catalog/selectors'
import { LaunchAction } from './LaunchAction'

// Card images repeat what the title says, so they are decorative here. The detail page shows them with their descriptions.
function CardMedia({ project, artSize }: { project: CatalogProject; artSize?: number }) {
  const [failed, setFailed] = useState(false)
  if (!project.thumbnail || failed) return <CategoryArt category={project.category} size={artSize} />
  const { src, width, height } = project.thumbnail
  return <img src={src} alt="" width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
}

// One work as a full-width row: a large screenshot, the description, and the launch button.
export function ProjectCard({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  const titleId = `title-${project.id}`
  const detail = `/projects/${project.id}`
  // Named view transitions let the row slide to its new place when the category changes,
  // and let its image and title morph into the detail page that uses the same names.
  return <ViewTransition name={`card-${project.id}`}><article className="work-row" aria-labelledby={titleId}>
    <ViewTransition name={`media-${project.id}`}><div className="work-row__media">
      <CardMedia key={project.thumbnail?.src} project={project} artSize={64} />
    </div></ViewTransition>
    <div className="work-row__body">
      <WorkMeta categoryLabel={categoryLabel} status={project.status} />
      <ViewTransition name={`title-${project.id}`}><h3 id={titleId} className="work-row__title">
        <Link to={detail}>{project.title}</Link>
      </h3></ViewTransition>
      <p className="work-row__description">{project.description}</p>
      {project.tags.length > 0 && <p className="work-row__tags">{project.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</p>}
      <div className="work-row__actions">
        {isLaunchable(project) && <LaunchAction project={project} />}
        <Link to={detail} className="button" aria-label={`${project.title}をくわしく見る`}>くわしく見る</Link>
      </div>
    </div>
  </article></ViewTransition>
}

export function ProjectMiniCard({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  const titleId = `related-${project.id}`
  return <article className="mini-card" aria-labelledby={titleId}>
    <div className="mini-card__media"><CardMedia key={project.thumbnail?.src} project={project} artSize={28} /></div>
    <div className="mini-card__body">
      <WorkMeta categoryLabel={categoryLabel} status={project.status} />
      <h3 id={titleId} className="mini-card__title"><Link to={`/projects/${project.id}`} className="stretched-link">{project.title}</Link></h3>
    </div>
  </article>
}
