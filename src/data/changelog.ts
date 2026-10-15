// Visitor-facing update history shown on the About page. Add new entries at the top.
// kind "project" entries name a catalog project; the page links to it while it is publicly listed.
export interface ChangelogEntry {
  date: string
  kind: 'site' | 'project'
  text: string
  projectId?: string
}

export const changelog: ChangelogEntry[] = [
  { date: '2026-10-16', kind: 'site', text: 'ブラウザのタブやSNSで共有したときに表示されるアイコンと画像を追加しました。' },
  { date: '2026-10-16', kind: 'site', text: 'メニューの切り替えボタンを作り直し、このページに更新履歴を追加しました。' },
  { date: '2026-10-16', kind: 'site', text: 'ページの切り替えやカードに動きを加えました。' },
  { date: '2026-10-16', kind: 'site', text: 'サイトのデザインを一新しました。' },
  { date: '2026-10-16', kind: 'project', text: 'DOPASWEEPERを掲載しました。', projectId: 'dopasweeper' },
  { date: '2026-10-15', kind: 'site', text: 'Pirafu2411 Playgroundを公開しました。' },
]
