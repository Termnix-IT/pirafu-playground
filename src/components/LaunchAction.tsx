import type { CatalogProject } from '../features/catalog/types'
import { ArrowUpRightIcon, BanIcon, DocIcon } from './Icons'

export function LaunchAction({ project, size = 'medium' }: { project: CatalogProject; size?: 'small' | 'medium' | 'large' }) {
  if (project.launch.type === 'showcase') return <p className="launch-state launch-state--showcase"><DocIcon />この作品は紹介だけです。</p>
  if (!project.launchEnabled || !project.launch.url) return <p className="launch-state"><BanIcon />ただいま準備中です。</p>
  // Games are played and other works are used. The visible note keeps "opens in a new tab" in the accessible name.
  return <a className={`play-button play-button--${size}`} href={project.launch.url} target="_blank" rel="noopener noreferrer">
    <span>{project.category === 'games' ? 'あそぶ' : 'つかう'}</span>
    <span className="play-button__note">（別タブ）</span>
    <ArrowUpRightIcon size={size === 'large' ? 24 : 20} />
  </a>
}
