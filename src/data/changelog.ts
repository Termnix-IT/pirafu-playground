// Visitor-facing update history shown on the About page. Add new entries at the top.
// kind "project" entries name a catalog project; the page links to it while it is publicly listed.
export interface ChangelogEntry {
  date: string
  kind: 'site' | 'project'
  text: string
  projectId?: string
}

export const changelog: ChangelogEntry[] = [
  { date: '2026-10-16', kind: 'site', text: 'デザインをダークテーマにリニューアル' },
  { date: '2026-10-16', kind: 'site', text: 'サイト内の文章を見直し' },
  { date: '2026-10-16', kind: 'site', text: 'タブとSNS共有用のアイコン・画像を追加' },
  { date: '2026-10-16', kind: 'site', text: 'メニューのボタンを改善、更新履歴を追加' },
  { date: '2026-10-16', kind: 'site', text: 'ページ切り替えのアニメーションを追加' },
  { date: '2026-10-16', kind: 'site', text: 'デザインをリニューアル' },
  { date: '2026-10-16', kind: 'project', text: 'DOPASWEEPERを追加', projectId: 'dopasweeper' },
  { date: '2026-10-15', kind: 'site', text: 'サイト公開' },
]
