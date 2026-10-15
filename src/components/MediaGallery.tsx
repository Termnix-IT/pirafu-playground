import { useState } from 'react'
import type { ProjectMedia } from '../features/catalog/types'

function MediaImage({ media }: { media: ProjectMedia }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p role="status" className="media-error">画像を表示できません：{media.alt}</p>
    : <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" onError={() => setFailed(true)} />
}

export function MediaGallery({ thumbnail, screenshots }: { thumbnail?: ProjectMedia; screenshots: ProjectMedia[] }) {
  if (!thumbnail && !screenshots.length) return null
  return <section aria-labelledby="media-title" className="media-gallery">
    <h2 id="media-title" className="section-title">紹介画像</h2>
    <div className="media-gallery__grid">
      {thumbnail && <figure className="media-figure media-figure--lead"><MediaImage key={thumbnail.src} media={thumbnail} /></figure>}
      {screenshots.map((media, index) => <figure key={media.src} className={!thumbnail && index === 0 ? 'media-figure media-figure--lead' : 'media-figure'}>
        <MediaImage media={media} />
        <figcaption>{media.alt}</figcaption>
      </figure>)}
    </div>
  </section>
}
