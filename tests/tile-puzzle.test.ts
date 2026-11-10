import { describe, expect, it } from 'vitest'
import { isSolved, neighbor, shuffleOrder, solvedOrder, swapTiles } from '../src/features/playground/tilePuzzle'

const word = [...'PLAYGROUND']
// A fixed sequence stands in for Math.random so the shuffles are repeatable.
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length] }

describe('tile puzzle rules', () => {
  it('solves when every position shows its letter, including repeated letters in either order', () => {
    expect(isSolved(word, solvedOrder(10))).toBe(true)
    expect(isSolved(word, swapTiles(solvedOrder(10), 2, 7))).toBe(false)
    const home = [...'TOOT']
    expect(isSolved(home, [0, 2, 1, 3])).toBe(true)
  })
  it('swaps two positions without changing the input', () => {
    const order = solvedOrder(4)
    expect(swapTiles(order, 0, 3)).toEqual([3, 1, 2, 0])
    expect(order).toEqual([0, 1, 2, 3])
  })
  it('finds neighbors on the grid and stops at the edges and the short last row', () => {
    expect(neighbor(0, 'left', 5, 10)).toBeNull()
    expect(neighbor(4, 'right', 5, 10)).toBeNull()
    expect(neighbor(4, 'down', 5, 10)).toBe(9)
    expect(neighbor(6, 'up', 5, 10)).toBe(1)
    expect(neighbor(5, 'up', 4, 6)).toBe(1)
    expect(neighbor(3, 'down', 4, 6)).toBeNull()
  })
  it('never returns an already solved word from a shuffle', () => {
    // The first pass swaps the same pair twice and ends solved, so the shuffle has to try again.
    const random = sequence(0, 0.99, 0, 0.99, 0.1, 0.5, 0.3, 0.2)
    const order = shuffleOrder(word, random)
    expect(isSolved(word, order)).toBe(false)
    expect([...order].sort((a, b) => a - b)).toEqual(solvedOrder(10))
  })
})
