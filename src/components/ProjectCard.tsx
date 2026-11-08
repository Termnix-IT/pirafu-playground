import { useState, ViewTransition } from 'react'
import { Link } from 'react-router'
import type { CatalogProject } from '../features/catalog/types'
import { CategoryArt, CategoryPill, StatusPill } from './Badges'
import { ShuffleIcon, StarIcon } from './Icons'
import { isLaunchable } from '../features/catalog/selectors'
import { LaunchAction } from './LaunchAction'

// Card images repeat what the title says, so they are decorative here. The detail page shows them with their descriptions.
function CardMedia({ project, label }: { project: CatalogProject; label?: string }) {
  const [failed, setFailed] = useState(false)
  if (!project.thumbnail || failed) return <CategoryArt category={project.category} label={label} />
  const { src, width, height } = project.thumbnail
  return <img src={src} alt="" width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
}

// The card beside the home puzzle. It starts with the featured work and shows a random work each time the puzzle is
// solved. It carries no view-transition names, because the same project also appears in the work grid.
export function UnlockCard({ project, categoryLabel, unlocked }: { project: CatalogProject; categoryLabel: string; unlocked: boolean }) {
  return <article className={`unlock-card${unlocked ? ' is-unlocked' : ''}`} aria-labelledby="unlock-title">
    <p className="unlock-card__band">
      {unlocked ? <><ShuffleIcon size={20} />パズルで選んだ作品</> : <><StarIcon size={20} />おすすめ</>}
    </p>
    {/* Keyed by project so a newly revealed work pops in instead of morphing from the previous one. */}
    <div key={project.id} className="unlock-card__body">
      <div className="unlock-card__media"><CardMedia project={project} label={categoryLabel} /></div>
      <ul className="pill-list" aria-label="作品の分類">
        <li><CategoryPill category={project.category} label={categoryLabel} /></li>
        <li><StatusPill status={project.status} /></li>
      </ul>
      <h2 id="unlock-title" className="unlock-card__title"><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
      <p className="unlock-card__description">{project.description}</p>
      <div className="unlock-card__actions">
        {isLaunchable(project) && <LaunchAction project={project} />}
        <Link to={`/projects/${project.id}`} className="button button--outline" aria-label={`${project.title}の詳細`}>詳しく</Link>
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
      <ul className="pill-list" aria-label="作品の分類">
        <li><CategoryPill category={project.category} label={categoryLabel} /></li>
        <li><StatusPill status={project.status} /></li>
      </ul>
      <ViewTransition name={`title-${project.id}`}><h3 id={titleId} className="work-card__title">
        <Link to={`/projects/${project.id}`} className="stretched-link">{project.title}</Link>
      </h3></ViewTransition>
      <p className="work-card__description">{project.description}</p>
      {isLaunchable(project) && <div className="work-card__actions"><LaunchAction project={project} size="small" /></div>}
    </div>
  </article></ViewTransition>
}

export function ProjectMiniCard({ project, categoryLabel }: { project: CatalogProject; categoryLabel: string }) {
  const titleId = `related-${project.id}`
  return <article className="mini-card" aria-labelledby={titleId}>
    <div className="mini-card__media"><CardMedia key={project.thumbnail?.src} project={project} /></div>
    <div className="mini-card__body">
      <ul className="pill-list" aria-label="作品の分類">
        <li><CategoryPill category={project.category} label={categoryLabel} /></li>
        <li><StatusPill status={project.status} /></li>
      </ul>
      <h3 id={titleId} className="mini-card__title"><Link to={`/projects/${project.id}`} className="stretched-link">{project.title}</Link></h3>
    </div>
  </article>
}
