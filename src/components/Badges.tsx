import type { DevelopmentStatus } from '../features/catalog/types'
import { statusLabels } from '../features/catalog/types'
import { CategoryIcon, StatusIcon } from './Icons'

const tonedCategories = new Set(['games', 'apps', 'tools'])
const toneClass = (category: string) => `tone-${tonedCategories.has(category) ? category : 'other'}`

// Stands in for a missing or broken image. The category is also written as text elsewhere, so the tile is decorative.
export function CategoryArt({ category, label }: { category: string; label?: string }) {
  return <div className={`category-art ${toneClass(category)}`} aria-hidden="true">
    <CategoryIcon category={category} size={label ? 48 : 28} />
    {label && <span>{label}</span>}
  </div>
}

export function CategoryPill({ category, label }: { category: string; label: string }) {
  return <span className={`pill pill--tone ${toneClass(category)}`}><CategoryIcon category={category} size={15} />{label}</span>
}

// Each status has its own icon shape, so the badge never relies on color alone.
export function StatusPill({ status }: { status: DevelopmentStatus }) {
  return <span className="pill pill--status"><StatusIcon status={status} />{statusLabels[status]}</span>
}
