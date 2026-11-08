import { ViewTransition } from 'react'
import type { CSSProperties } from 'react'
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

const titleTones = ['paper', 'lime', 'cobalt', 'paper', 'lime', 'paper', 'cobalt']

// The title set in letter tiles. The tiles only lean when pointed at; the heading text stays the plain title.
function TileTitle({ title }: { title: string }) {
  let tile = 0
  return Array.from(title).map((character, index) => {
    if (/\s/u.test(character)) return <span key={index} className="title-tile title-tile--space"> </span>
    const tone = titleTones[tile % titleTones.length]
    tile += 1
    return <span key={index} className={`title-tile tone-tile-${tone}`} style={{ '--i': index } as CSSProperties}>{character}</span>
  })
}

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
  // The device frame repeats an image from the gallery below, which shows every image with its description.
  const deviceImage = project.screenshots[0] ?? project.thumbnail

  return <>
    <section className="detail-hero container" aria-labelledby="detail-title">
      <div className="detail-hero__text">
        <nav aria-label="パンくずリスト" className="breadcrumb">
          <ol>
            <li><Link to="/">作品</Link></li>
            {category && <li><Link to={categoryHref}>{category.label}</Link></li>}
          </ol>
        </nav>
        <ul className="pill-list" aria-label="作品の分類">
          {category && <li><CategoryPill category={category.id} label={category.label} /></li>}
          <li><StatusPill status={project.status} /></li>
          <li><span className="pill pill--status">{launchTypeLabels[project.launch.type]}</span></li>
        </ul>
        <ViewTransition name={`title-${project.id}`}><h1 id="detail-title" className="detail-hero__title" tabIndex={-1}
          style={{ '--length': Array.from(project.title).length } as CSSProperties}>
          <TileTitle title={project.title} />
        </h1></ViewTransition>
        <p className="detail-hero__lead">{project.description}</p>
        <div className="detail-hero__actions">
          <LaunchAction project={project} size="large" />
          {repository && <a className="button button--outline" href={repository} target="_blank" rel="noopener noreferrer"><CodeIcon size={18} />GitHub（別タブ）</a>}
          {website && <a className="button button--outline" href={website} target="_blank" rel="noopener noreferrer"><ExternalIcon size={18} />関連サイト（別タブ）</a>}
        </div>
        <Link to="/" className="back-link"><ArrowLeftIcon size={18} />作品一覧へ</Link>
      </div>
      {deviceImage && <ViewTransition name={`media-${project.id}`}><div className="device-frame">
        <img src={deviceImage.src} alt="" width={deviceImage.width} height={deviceImage.height} />
      </div></ViewTransition>}
    </section>

    <div className="container bento detail-body">
      <MediaGallery key={project.id} thumbnail={project.thumbnail} screenshots={project.screenshots} />
      <section aria-labelledby="info-title" className="tile info-tile">
        <h2 id="info-title" className="tile__title"><span className="marker">作品情報</span></h2>
        <dl className="info-list">
          <div><dt>カテゴリー</dt><dd>{category?.label}</dd></div>
          <div><dt>開発状況</dt><dd><span className="with-icon"><StatusIcon status={project.status} />{statusLabels[project.status]}</span></dd></div>
          <div><dt>公開方式</dt><dd>{launchTypeLabels[project.launch.type]}</dd></div>
          {project.tags.length > 0 && <div><dt>タグ</dt><dd>{project.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</dd></div>}
        </dl>
      </section>
      <section aria-labelledby="related-title" className="related">
        <div className="related__header">
          <h2 id="related-title"><span className="marker">ほかの作品</span></h2>
          {category && hasSameCategory && <Link to={categoryHref}>{category.label}をすべて見る</Link>}
        </div>
        {related.length > 0
          ? <ul className="related-list">{related.map((item) => <li key={item.id}><ProjectMiniCard project={item} categoryLabel={labelOf(item.category)} /></li>)}</ul>
          : <p className="upcoming-tile upcoming-tile--wide"><PlusIcon size={22} />次の作品を制作中です</p>}
      </section>
    </div>
  </>
}
