import { useState, ViewTransition } from 'react'
import type { ProjectMedia } from '../features/catalog/types'

function MediaImage({ media, eager = false }: { media: ProjectMedia; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p role="status" className="media-error">画像を表示できません：{media.alt}</p>
    : <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
}

// Every image of a work with its description. The first image carries `transitionName`, so the screenshot of the
// row on the home page morphs into it.
export function MediaGallery({ thumbnail, screenshots, transitionName }: { thumbnail?: ProjectMedia; screenshots: ProjectMedia[]; transitionName: string }) {
  const images = thumbnail ? [thumbnail, ...screenshots] : screenshots
  if (!images.length) return null
  return <section aria-labelledby="media-title" className="media-section">
    <h2 id="media-title" className="section-title">紹介画像</h2>
    <div className="media-gallery">
      {images.map((media, index) => <figure key={media.src} className="media-figure">
        {index === 0 ? <ViewTransition name={transitionName}><div><MediaImage media={media} eager /></div></ViewTransition> : <MediaImage media={media} />}
        <figcaption>{media.alt}</figcaption>
      </figure>)}
    </div>
  </section>
}
