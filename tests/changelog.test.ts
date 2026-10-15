import { describe, expect, it } from 'vitest'
import { changelog } from '../src/data/changelog'
import { catalog } from '../src/data/catalog'

describe('changelog', () => {
  it('lists valid dates from newest to oldest', () => {
    for (const { date } of changelog) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date)
    }
    const dates = changelog.map(({ date }) => date)
    expect(dates).toEqual([...dates].sort().reverse())
  })
  it('names only projects that exist in the delivered catalog', () => {
    for (const entry of changelog.filter(({ kind }) => kind === 'project')) {
      expect(catalog.projects.some(({ id }) => id === entry.projectId)).toBe(true)
    }
  })
})
