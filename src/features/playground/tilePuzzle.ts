// Rules of the letter-tile puzzle on the home and Not Found pages, kept free of DOM and React so they can be tested.
// A puzzle is the target word plus `order`: order[position] is the index of the letter tile placed at that position.

export type Direction = 'left' | 'right' | 'up' | 'down'

export const solvedOrder = (length: number): number[] => Array.from({ length }, (_, index) => index)

export function isSolved(word: readonly string[], order: readonly number[]): boolean {
  // Compare letters, not tile indices: a word with repeated letters is solved by either copy.
  return order.every((tile, position) => word[tile] === word[position])
}

export function swapTiles(order: readonly number[], a: number, b: number): number[] {
  const next = [...order]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

// The position next to `position` on a grid of `columns`, or null at the edge. Rows may be shorter at the end.
export function neighbor(position: number, direction: Direction, columns: number, length: number): number | null {
  const column = position % columns
  const target = direction === 'left' ? (column > 0 ? position - 1 : -1)
    : direction === 'right' ? (column < columns - 1 ? position + 1 : -1)
      : direction === 'up' ? position - columns
        : position + columns
  return target >= 0 && target < length ? target : null
}

// A few random swaps that never leave the word already solved. `random` returns numbers in [0, 1).
export function shuffleOrder(word: readonly string[], random: () => number, swaps = 2): number[] {
  const length = word.length
  for (;;) {
    let order = solvedOrder(length)
    for (let count = 0; count < swaps; count += 1) {
      const a = Math.floor(random() * length)
      const b = (a + 1 + Math.floor(random() * (length - 1))) % length
      order = swapTiles(order, a, b)
    }
    if (!isSolved(word, order)) return order
  }
}

// The next work to reveal after solving: a random one other than the current, when there is another.
export function pickNext<T extends { id: string }>(items: readonly T[], currentId: string | undefined, random: () => number): T | undefined {
  const others = items.filter((item) => item.id !== currentId)
  const pool = others.length ? others : items
  return pool[Math.floor(random() * pool.length)]
}
