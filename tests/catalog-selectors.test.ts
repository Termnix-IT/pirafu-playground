import { describe, expect, it } from 'vitest'
import { findProject, readFilters, selectProjects, writeFilters } from '../src/features/catalog/selectors'
import type { CatalogProject } from '../src/features/catalog/types'

const project = (id: string, properties: Partial<CatalogProject> = {}): CatalogProject => ({
  id, title: id, description: '説明だけの語は検索しない', category: 'apps', status: 'stable', tags: [], featured: false,
  visibility: 'public', launch: { type: 'showcase' }, launchEnabled: false, screenshots: [], ...properties,
})
const empty = { query: '', category: '', status: '' }

describe('catalog selectors', () => {
  it('normalizes Unicode and case and requires every search word across title and tags', () => {
    const data = [project('one', { title: 'ＮＯＴＥ アプリ', tags: ['Browser'] }), project('two', { title: 'Note only' })]
    expect(selectProjects(data, { ...empty, query: ' note　BROWSER ' }).map(({ id }) => id)).toEqual(['one'])
    expect(selectProjects(data, { ...empty, query: '説明だけ' })).toEqual([])
  })
  it('combines category and development status and never lists unlisted records', () => {
    const data = [project('match'), project('game', { category: 'games' }), project('old', { status: 'archived' }), project('unlisted', { visibility: 'unlisted' })]
    expect(selectProjects(data, { ...empty, category: 'apps', status: 'stable' }).map(({ id }) => id)).toEqual(['match'])
    expect(findProject(data, 'unlisted')?.id).toBe('unlisted')
    expect(findProject(data, 'missing')).toBeUndefined()
  })
  it('sorts featured first with a stable title and ID order without mutating input', () => {
    const data = [project('z', { title: 'same' }), project('a', { title: 'same' }), project('featured', { title: 'zzz', featured: true })]
    expect(selectProjects(data, empty).map(({ id }) => id)).toEqual(['featured', 'a', 'z'])
    expect(data[0].id).toBe('z')
  })
  it('serializes only known filters and restores bookmarked conditions', () => {
    const params = writeFilters({ query: ' note ', category: 'apps', status: 'planned' })
    expect(readFilters(params)).toEqual({ query: 'note', category: 'apps', status: 'planned' })
    expect(writeFilters(empty).toString()).toBe('')
    expect(readFilters(new URLSearchParams('unused=value'))).toEqual(empty)
  })
})
