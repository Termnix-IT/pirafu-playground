import { useState } from 'react'
import type { ProjectMedia } from '../features/catalog/types'

function MediaImage({ media }: { media: ProjectMedia }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p role="status">画像を表示できません：{media.alt}</p>
    : <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" onError={() => setFailed(true)} />
}

export function MediaGallery({ thumbnail, screenshots }: { thumbnail?: ProjectMedia; screenshots: ProjectMedia[] }) {
  if (!thumbnail && !screenshots.length) return null
  return <section aria-labelledby="media-title">
    <h2 id="media-title">紹介画像</h2>
    {thumbnail && <MediaImage key={thumbnail.src} media={thumbnail} />}
    {screenshots.map((media) => <figure key={media.src}>
      <MediaImage media={media} />
      <figcaption>{media.alt}</figcaption>
    </figure>)}
  </section>
}
