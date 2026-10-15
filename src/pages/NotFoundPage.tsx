import { Link } from 'react-router'

export function NotFoundPage() {
  return <><h1 tabIndex={-1}>ページが見つかりません</h1><p>指定されたページや作品は掲載されていません。</p><Link to="/">作品一覧へ</Link></>
}
