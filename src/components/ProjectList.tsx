import type { CatalogProject, Category } from '../features/catalog/types'
import { ProjectCard } from './ProjectCard'

export function ProjectList({ projects, categories }: { projects: CatalogProject[]; categories: Category[] }) {
  if (!projects.length) return <p className="empty-state">条件に一致する作品はありません。検索語や絞り込み条件を変更してください。</p>
  // Featured projects are already sorted first and span the full row, so they double as the pickup area.
  return <ul className="project-grid">
    {projects.map((project) => <li key={project.id} className={project.featured ? 'is-featured' : undefined}>
      <ProjectCard project={project} categoryLabel={categories.find((category) => category.id === project.category)?.label ?? ''} />
    </li>)}
  </ul>
}
