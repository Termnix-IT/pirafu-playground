import type { DevelopmentStatus } from '../features/catalog/types'
import { statusLabels } from '../features/catalog/types'
import { CategoryIcon, StatusIcon } from './Icons'

// Stands in for a missing or broken image. The category is also written as text beside it, so this is decorative.
export function CategoryArt({ category, size = 40 }: { category: string; size?: number }) {
  return <div className="category-art" aria-hidden="true"><CategoryIcon category={category} size={size} /></div>
}

// Category, status and any extra facts as one line of text. Each status has its own icon shape, so the status
// never relies on color alone.
export function WorkMeta({ categoryLabel, status, extra = [] }: { categoryLabel: string; status: DevelopmentStatus; extra?: string[] }) {
  return <ul className="work-meta" aria-label="作品の分類">
    {categoryLabel && <li>{categoryLabel}</li>}
    <li><span className="with-icon"><StatusIcon status={status} />{statusLabels[status]}</span></li>
    {extra.map((text) => <li key={text}>{text}</li>)}
  </ul>
}
