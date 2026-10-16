import type { ReactNode } from 'react'
import type { DevelopmentStatus } from '../features/catalog/types'

// Decorative inline icons. Text next to each icon carries the meaning, so every icon is hidden from assistive technology.
function Icon({ size = 20, filled = false, children }: { size?: number; filled?: boolean; children: ReactNode }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

type IconProps = { size?: number }

export const PlayIcon = ({ size }: IconProps) => <Icon size={size} filled><path d="M8 5.5v13l10.5-6.5z" /></Icon>
export const StarIcon = ({ size }: IconProps) => <Icon size={size}><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></Icon>
export const SearchIcon = ({ size }: IconProps) => <Icon size={size}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>
export const ChevronRightIcon = ({ size }: IconProps) => <Icon size={size}><path d="M9 6l6 6-6 6" /></Icon>
export const ArrowLeftIcon = ({ size }: IconProps) => <Icon size={size}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
export const ExternalIcon = ({ size }: IconProps) => <Icon size={size}><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>
export const CodeIcon = ({ size }: IconProps) => <Icon size={size}><path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5" /></Icon>
export const BanIcon = ({ size }: IconProps) => <Icon size={size}><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" /></Icon>
export const PlusIcon = ({ size }: IconProps) => <Icon size={size}><path d="M12 5v14M5 12h14" /></Icon>
export const DocIcon =({ size }: IconProps) => <Icon size={size}><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6" /></Icon>

export function CategoryIcon({ category, size }: { category: string } & IconProps) {
  switch (category) {
    case 'games': return <Icon size={size}><rect x="2.5" y="7" width="19" height="10" rx="5" /><path d="M7.5 10v4M5.5 12h4" /><circle cx="15.5" cy="11" r=".9" /><circle cx="18" cy="13" r=".9" /></Icon>
    case 'apps': return <Icon size={size}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M3 9h18M6 6.8h.01M8.5 6.8h.01" /></Icon>
    case 'tools': return <Icon size={size}><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></Icon>
    default: return <Icon size={size}><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4" /></Icon>
  }
}

// Each development status has its own shape so the badge never relies on color alone.
export function StatusIcon({ status, size = 14 }: { status: DevelopmentStatus } & IconProps) {
  switch (status) {
    case 'planned': return <Icon size={size}><circle cx="12" cy="12" r="7" strokeDasharray="3 3" /></Icon>
    case 'in-development': return <Icon size={size}><circle cx="12" cy="12" r="7" /><path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor" /></Icon>
    case 'stable': return <Icon size={size} filled><circle cx="12" cy="12" r="7.5" /></Icon>
    case 'maintenance': return <Icon size={size}><path d="M12 4.5l7.5 7.5-7.5 7.5L4.5 12z" /></Icon>
    case 'archived': return <Icon size={size}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Icon>
  }
}

export function LogoMark() {
  return <span className="logo-mark" aria-hidden="true">
    <svg width="14" height="18" viewBox="0 0 7 9" fill="currentColor" shapeRendering="crispEdges" focusable="false">
      <rect x="1" y="1" width="1" height="7" /><rect x="2" y="1" width="3" height="1" />
      <rect x="5" y="2" width="1" height="2" /><rect x="2" y="4" width="3" height="1" />
    </svg>
  </span>
}
