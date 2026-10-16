import { Link } from 'react-router'
import { ArrowLeftIcon } from '../components/Icons'

export function NotFoundPage() {
  return <div className="not-found">
    <h1 tabIndex={-1}>ページが見つかりません</h1>
    <p>このページは見つかりませんでした。</p>
    <Link to="/" className="button button--dark"><ArrowLeftIcon size={18} />作品一覧へ</Link>
  </div>
}
