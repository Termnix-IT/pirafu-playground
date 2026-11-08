// Visitor-facing update history shown on the home and About pages. Add new entries at the top.
// Entries hold only what changed, and changelogText() writes every line the same way:
// site changes read "サイトの{area}改善", works read "{title}を追加/更新", and the opening reads "サイトを公開".
// Record one site entry per area and date; several changes to the same area on one day share it.
import type { CatalogProject } from '../features/catalog/types'

export type SiteArea = 'ページ' | '文章' | '画像' | 'システム'

export type ChangelogEntry =
  | { date: string; kind: 'site'; area: SiteArea }
  | { date: string; kind: 'project'; projectId: string; action: '追加' | '更新' }
  | { date: string; kind: 'launch' }

export const changelog: ChangelogEntry[] = [
  { date: '2026-11-08', kind: 'site', area: 'ページ' },
  { date: '2026-11-08', kind: 'site', area: '文章' },
  { date: '2026-10-27', kind: 'site', area: 'ページ' },
  { date: '2026-10-26', kind: 'project', projectId: 'poseref', action: '追加' },
  { date: '2026-10-18', kind: 'project', projectId: 'blue-archive-db', action: '追加' },
  { date: '2026-10-18', kind: 'project', projectId: 'dopasweeper', action: '更新' },
  { date: '2026-10-17', kind: 'site', area: 'ページ' },
  { date: '2026-10-17', kind: 'site', area: 'システム' },
  { date: '2026-10-16', kind: 'site', area: 'ページ' },
  { date: '2026-10-16', kind: 'site', area: '文章' },
  { date: '2026-10-16', kind: 'site', area: '画像' },
  { date: '2026-10-16', kind: 'project', projectId: 'dopasweeper', action: '追加' },
  { date: '2026-10-15', kind: 'launch' },
]

export function changelogText(entry: ChangelogEntry, projects: CatalogProject[]): string {
  switch (entry.kind) {
    case 'site': return `サイトの${entry.area}改善`
    case 'launch': return 'サイトを公開'
    case 'project': return `${projects.find(({ id }) => id === entry.projectId)?.title ?? entry.projectId}を${entry.action}`
  }
}
