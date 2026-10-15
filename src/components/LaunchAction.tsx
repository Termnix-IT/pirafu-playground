import type { CatalogProject } from '../features/catalog/types'

export function LaunchAction({ project }: { project: CatalogProject }) {
  if (project.launch.type === 'showcase') return <p>この作品は紹介のみです。</p>
  if (!project.launchEnabled || !project.launch.url) return <p>現在は起動できません。</p>
  return <p><a href={project.launch.url} target="_blank" rel="noopener noreferrer">アプリを開く（別タブ）</a></p>
}
