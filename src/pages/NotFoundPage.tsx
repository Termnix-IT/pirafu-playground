import { Link } from 'react-router'
import { ArrowLeftIcon } from '../components/Icons'
import { TilePuzzle } from '../components/TilePuzzle'

// The link back to the works comes first. A small HOME puzzle sits below it for anyone who wants to play.
export function NotFoundPage() {
  return <div className="container page not-found">
    <div className="not-found__text">
      <h1 tabIndex={-1}>ページが見つかりません</h1>
      <p>URLが変わったか、ページがなくなったようです。作品一覧から探してみてください。</p>
      <Link to="/" className="play-button"><ArrowLeftIcon size={18} />作品一覧へ</Link>
    </div>
    <div className="panel puzzle-panel">
      <TilePuzzle name="home-404" word="HOME" columns={4} initialOrder={[2, 3, 0, 1]} label="HOMEのタイルパズル"
        hint="おまけのパズルです。HOME の順に並べてみてください。タイルは2枚選ぶと入れ替わり、選んだタイルは矢印キーでも動かせます。" />
    </div>
  </div>
}
