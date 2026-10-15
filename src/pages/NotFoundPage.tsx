import { Link } from 'react-router'
import { ArrowLeftIcon } from '../components/Icons'

export function NotFoundPage() {
  return <div className="not-found">
    <h1 tabIndex={-1}>ページが見つかりません</h1>
    <p>指定されたページや作品は掲載されていません。</p>
    <Link to="/" className="button button--dark"><ArrowLeftIcon size={18} />作品一覧へ</Link>
  </div>
}
