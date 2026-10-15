export type DevelopmentStatus = 'planned' | 'in-development' | 'stable' | 'maintenance' | 'archived'
export type Visibility = 'public' | 'unlisted'

export interface Category { id: string; label: string }
export interface ProjectMedia { src: string; alt: string; width: number; height: number }
export interface CatalogProject {
  id: string
  title: string
  description: string
  category: string
  status: DevelopmentStatus
  tags: string[]
  featured: boolean
  visibility: Visibility
  launch: { type: 'external'; url?: string } | { type: 'showcase' }
  launchEnabled: boolean
  links?: { repository?: string; website?: string }
  thumbnail?: ProjectMedia
  screenshots: ProjectMedia[]
}
export interface Catalog { schemaVersion: 1; categories: Category[]; projects: CatalogProject[] }
export interface CatalogFilters { query: string; category: string; status: string }

export const statusLabels: Record<DevelopmentStatus, string> = {
  planned: '構想中',
  'in-development': '開発中',
  stable: '安定版',
  maintenance: '保守中',
  archived: '開発終了',
}

export const launchTypeLabels: Record<CatalogProject['launch']['type'], string> = {
  external: 'ブラウザアプリ',
  showcase: '紹介のみ',
}
