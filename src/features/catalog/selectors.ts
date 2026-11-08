import type { CatalogFilters, CatalogProject } from './types'

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja')

export function readFilters(params: URLSearchParams): CatalogFilters {
  return { query: params.get('q') ?? '', category: params.get('category') ?? '', status: params.get('status') ?? '' }
}

export function writeFilters(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  const query = filters.query.trim()
  if (query) params.set('q', query)
  if (filters.category) params.set('category', filters.category)
  if (filters.status) params.set('status', filters.status)
  return params
}

export function selectProjects(projects: CatalogProject[], filters: CatalogFilters): CatalogProject[] {
  const words = normalize(filters.query).trim().split(/\s+/u).filter(Boolean)
  return projects.filter((project) => {
    if (project.visibility !== 'public') return false
    if (filters.category && project.category !== filters.category) return false
    if (filters.status && project.status !== filters.status) return false
    const searchable = normalize([project.title, ...project.tags].join(' '))
    return words.every((word) => searchable.includes(word))
  }).sort((a, b) => Number(b.featured) - Number(a.featured)
    || a.title.localeCompare(b.title, 'ja') || a.id.localeCompare(b.id, 'en'))
}

// Works shown under a detail page: the same category first, then other listed works to fill the row.
export function selectRelatedProjects(projects: CatalogProject[], project: CatalogProject, limit = 3): CatalogProject[] {
  const others = selectProjects(projects, { query: '', category: '', status: '' }).filter(({ id }) => id !== project.id)
  const sameCategory = others.filter(({ category }) => category === project.category)
  return [...sameCategory, ...others.filter(({ category }) => category !== project.category)].slice(0, limit)
}

export function findProject(projects: CatalogProject[], id: string | undefined): CatalogProject | undefined {
  return projects.find((project) => project.id === id)
}

// Whether the work can be opened from a launch button: an external app with a URL that is switched on.
export function isLaunchable(project: CatalogProject): boolean {
  return project.launch.type === 'external' && project.launchEnabled && Boolean(project.launch.url)
}
