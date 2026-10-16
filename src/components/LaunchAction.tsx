import type { CatalogProject } from '../features/catalog/types'
import { BanIcon, DocIcon, PlayIcon } from './Icons'

export function LaunchAction({ project, large = false }: { project: CatalogProject; large?: boolean }) {
  if (project.launch.type === 'showcase') return <p className="launch-state launch-state--showcase"><DocIcon />この作品は紹介だけです。</p>
  if (!project.launchEnabled || !project.launch.url) return <p className="launch-state"><BanIcon />ただいま準備中です。</p>
  // Games are played and other works are used. The visible note keeps "opens in a new tab" in the accessible name.
  return <a className={`play-button${large ? ' play-button--large' : ''}`} href={project.launch.url} target="_blank" rel="noopener noreferrer">
    <PlayIcon size={large ? 24 : 20} />
    <span>{project.category === 'games' ? 'あそぶ' : 'つかう'}</span>
    <span className="play-button__note">（別タブ）</span>
  </a>
}
