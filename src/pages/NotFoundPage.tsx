import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeftIcon } from '../components/Icons'
import { TilePuzzle } from '../components/TilePuzzle'
import type { TileTone } from '../components/TilePuzzle'

const homeTones: TileTone[] = ['cobalt', 'paper', 'lime', 'paper']

// A small HOME puzzle to play while lost. The link back to the works is always there, solved or not.
export function NotFoundPage() {
  const [solved, setSolved] = useState(false)
  return <div className="container page not-found">
    <div className="not-found__text">
      <p className="eyebrow eyebrow--badge">404 / NOT FOUND</p>
      <h1 tabIndex={-1}>ページが見つかりません</h1>
      <p>このページは見つかりませんでした。タイルを並べて HOME にしても、すぐ戻ってもかまいません。</p>
    </div>
    <TilePuzzle name="home-404" word="HOME" tones={homeTones} columns={4} initialOrder={[2, 3, 0, 1]}
      label="HOMEのタイルパズル" onSolve={() => { setSolved(true); return '作品一覧へ戻れます。' }}
      hint="タイルを2枚選ぶと入れ替わります。選んだタイルは矢印キーでも動かせます。" />
    <Link to="/" className={`play-button play-button--large not-found__home${solved ? ' is-ready' : ''}`}>
      <ArrowLeftIcon size={22} />作品一覧へ
    </Link>
  </div>
}
