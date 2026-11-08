import { startTransition, useId, useRef, useState, ViewTransition } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { isSolved, neighbor, shuffleOrder, swapTiles } from '../features/playground/tilePuzzle'
import type { Direction } from '../features/playground/tilePuzzle'
import { ShuffleIcon } from './Icons'

export type TileTone = 'paper' | 'lime' | 'cobalt' | 'ink'

const arrowDirections: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

interface TilePuzzleProps {
  word: string
  tones: TileTone[]
  columns: number
  initialOrder: number[]
  label: string
  hint: string
  // Called when a swap completes the word; the returned text is announced to screen readers.
  onSolve?: () => string | void
  // Unique per page, because each tile carries a view-transition name.
  name: string
}

// A letter-tile puzzle made of real buttons. Choose one tile and then another to swap them; a chosen tile also moves
// with the arrow keys. Without a chosen tile the arrow keys move focus between tiles (one tab stop for the grid).
// Swaps run inside a transition so the named tiles slide to their new places where view transitions are supported.
export function TilePuzzle({ word, tones, columns, initialOrder, label, hint, onSolve, name }: TilePuzzleProps) {
  const letters = Array.from(word)
  const [order, setOrder] = useState(initialOrder)
  const [selected, setSelected] = useState<number | null>(null)
  const [focusPosition, setFocusPosition] = useState(0)
  const [message, setMessage] = useState('')
  // The order renders through a transition so the tiles can slide, which leaves `order` behind for a moment.
  // Handlers read these refs instead, so quick key presses during a slide still act on the latest layout.
  const orderRef = useRef(initialOrder)
  const selectedRef = useRef<number | null>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hintId = useId()
  const solved = isSolved(letters, order)

  const select = (position: number | null) => {
    selectedRef.current = position
    setSelected(position)
  }
  const place = (next: number[]) => {
    orderRef.current = next
    startTransition(() => setOrder(next))
  }

  // `from` is the chosen tile. Focus stays on the button that was used, which moves with its tile: the chosen tile
  // when it moves by arrow key, or the clicked tile, which goes to where the chosen tile was.
  const swap = (from: number, to: number, byKey: boolean) => {
    const current = orderRef.current
    const next = swapTiles(current, from, to)
    place(next)
    select(byKey ? to : null)
    setFocusPosition(byKey ? to : from)
    if (!isSolved(letters, current) && isSolved(letters, next)) setMessage(`${word}がそろいました。${onSolve?.() ?? ''}`)
    else setMessage(`${letters[current[from]]}と${letters[current[to]]}を入れ替えました。`)
  }

  const activate = (position: number) => {
    const chosen = selectedRef.current
    if (chosen === null) {
      select(position)
      setMessage(`${letters[orderRef.current[position]]}を選びました。入れ替えるタイルを選んでください。`)
    } else if (chosen === position) {
      select(null)
      setMessage('選択を取り消しました。')
    } else swap(chosen, position, false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tile: number) => {
    if (event.key === 'Escape' && selectedRef.current !== null) {
      event.preventDefault()
      select(null)
      setMessage('選択を取り消しました。')
      return
    }
    const direction = arrowDirections[event.key]
    if (!direction) return
    event.preventDefault()
    const position = orderRef.current.indexOf(tile)
    const target = neighbor(position, direction, columns, letters.length)
    if (target === null) return
    // The swapped tile keeps its button element (tiles are keyed by tile, not position), so focus stays on it.
    if (selectedRef.current === position) swap(position, target, true)
    else tileRefs.current[orderRef.current[target]]?.focus()
  }

  const shuffle = () => {
    place(shuffleOrder(letters, Math.random))
    select(null)
    setMessage('タイルをまぜました。')
  }

  return <div className={`puzzle${solved ? ' is-solved' : ''}`}>
    <div role="group" aria-label={label} aria-describedby={hintId} className="puzzle__grid"
      style={{ '--columns': columns } as CSSProperties}>
      {order.map((tile, position) => <ViewTransition key={tile} name={`${name}-tile-${tile}`}>
        <button type="button" ref={(element) => { tileRefs.current[tile] = element }}
          className={`puzzle-tile tone-tile-${tones[tile % tones.length]}`} style={{ '--i': position } as CSSProperties}
          tabIndex={position === focusPosition ? 0 : -1} aria-pressed={selected === position}
          aria-label={`${letters[tile]}（${position + 1}番目）`}
          onFocus={() => setFocusPosition(orderRef.current.indexOf(tile))} onClick={() => activate(orderRef.current.indexOf(tile))}
          onKeyDown={(event) => onKeyDown(event, tile)}>
          {letters[tile]}
        </button>
      </ViewTransition>)}
    </div>
    <div className="puzzle__controls">
      <p id={hintId} className="puzzle__hint">{hint}</p>
      <button type="button" className="button button--outline button--small" onClick={shuffle}><ShuffleIcon size={18} />まぜる</button>
    </div>
    <p className="visually-hidden" aria-live="polite">{message}</p>
  </div>
}
