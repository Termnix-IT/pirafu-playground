import { describe, expect, it } from 'vitest'
import { changelog, changelogText } from '../src/data/changelog'
import type { ChangelogEntry } from '../src/data/changelog'
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
    const projectEntries = changelog.filter((entry): entry is Extract<ChangelogEntry, { kind: 'project' }> => entry.kind === 'project')
    for (const entry of projectEntries) {
      expect(catalog.projects.some(({ id }) => id === entry.projectId)).toBe(true)
    }
  })
  it('writes every line in the shared form and never repeats one on the same day', () => {
    const lines = changelog.map((entry) => `${entry.date} ${changelogText(entry, catalog.projects)}`)
    expect(new Set(lines).size).toBe(lines.length)
    expect(changelogText({ date: '2026-01-01', kind: 'site', area: '画像' }, catalog.projects)).toBe('サイトの画像改善')
    expect(changelogText({ date: '2026-01-01', kind: 'project', projectId: 'dopasweeper', action: '更新' }, catalog.projects)).toBe('DOPASWEEPERを更新')
    expect(changelogText({ date: '2026-01-01', kind: 'launch' }, catalog.projects)).toBe('サイトを公開')
  })
})
