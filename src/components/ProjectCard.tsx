import { useState, ViewTransition } from 'react'
import { Link } from 'react-router'
import type { CatalogProject } from '../features/catalog/types'
import { statusLabels } from '../features/catalog/types'
import { CategoryArt, CategoryPill, StatusPill } from './Badges'
import { CategoryIcon, StarIcon, StatusIcon } from './Icons'
import { LaunchAction } from './LaunchAction'

// Card images repeat what the title says, so they are decorative here. The detail page shows them with their descriptions.
function CardMedia({ project, label }: { project: CatalogProject; label?: string }) {
  const [failed, setFailed] = useState(false)
  if (!project.thumbnail || failed) return <CategoryArt category={project.category} label={label} />
  const { src, width, height } = project.thumbnail
  return <img src={src} alt="" width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
}

const launchable = (project: CatalogProject) => project.launch.type === 'external' && project.launchEnabled && Boolean(project.launch.url)

// The pickup game inside the home stage. It carries no view-transition names, because the same
// project also appears in the work grid and names must stay unique on a page.
export function FeaturedTile({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  // The artwork sits on its own screen above the text, so its lettering never collides with the title.
  return <article className="featured-tile" aria-labelledby="featured-title">
    <div className="featured-tile__media"><CardMedia key={project.thumbnail?.src} project={project} label={categoryLabel} /></div>
    <div className="featured-tile__content">
      <div className="featured-tile__text">
        <ul className="pill-list" aria-label="作品の分類">
          <li><span className="pill pill--accent"><StarIcon size={13} />ピックアップ</span></li>
          <li><CategoryPill category={project.category} label={categoryLabel} /></li>
          <li><StatusPill status={project.status} /></li>
        </ul>
        <h2 id="featured-title" className="featured-tile__title"><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
        <p className="featured-tile__description">{project.description}</p>
      </div>
      <div className="featured-tile__actions">
        {launchable(project) && <LaunchAction project={project} />}
        <Link to={`/projects/${project.id}`} className="button button--glass" aria-label={`${project.title}の詳細`}>詳しく</Link>
      </div>
    </div>
  </article>
}

export function ProjectCard({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  const titleId = `title-${project.id}`
  // Named view transitions let the card slide to its new place when filters change,
  // and let its image and title morph into the detail page that uses the same names.
  return <ViewTransition name={`card-${project.id}`}><article className="work-card" aria-labelledby={titleId}>
    <ViewTransition name={`media-${project.id}`}><div className="work-card__media">
      <CardMedia key={project.thumbnail?.src} project={project} label={categoryLabel} />
    </div></ViewTransition>
    <div className="work-card__body">
      <p className="work-card__meta">
        <span className="with-icon"><CategoryIcon category={project.category} size={15} />{categoryLabel}</span>
        <span className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</span>
      </p>
      <ViewTransition name={`title-${project.id}`}><h3 id={titleId} className="work-card__title">
        <Link to={`/projects/${project.id}`} className="stretched-link">{project.title}</Link>
      </h3></ViewTransition>
      <p className="work-card__description">{project.description}</p>
    </div>
  </article></ViewTransition>
}

export function ProjectMiniCard({ project }: { project: CatalogProject }) {
  const titleId = `related-${project.id}`
  return <article className="mini-card" aria-labelledby={titleId}>
    <div className="mini-card__media"><CardMedia key={project.thumbnail?.src} project={project} /></div>
    <div className="mini-card__body">
      <h3 id={titleId} className="mini-card__title"><Link to={`/projects/${project.id}`} className="stretched-link">{project.title}</Link></h3>
      <p className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</p>
    </div>
  </article>
}
