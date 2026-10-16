import { useState } from 'react'
import type { ProjectMedia } from '../features/catalog/types'

function MediaImage({ media }: { media: ProjectMedia }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p role="status" className="media-error">画像を表示できません：{media.alt}</p>
    : <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" onError={() => setFailed(true)} />
}

export function MediaGallery({ thumbnail, screenshots }: { thumbnail?: ProjectMedia; screenshots: ProjectMedia[] }) {
  const images = thumbnail ? [thumbnail, ...screenshots] : screenshots
  if (!images.length) return null
  return <section aria-labelledby="media-title" className="tile media-tile">
    <h2 id="media-title" className="tile__title">紹介画像</h2>
    <div className="media-gallery">
      {images.map((media) => <figure key={media.src} className="media-figure">
        <MediaImage media={media} />
        <figcaption>{media.alt}</figcaption>
      </figure>)}
    </div>
  </section>
}
