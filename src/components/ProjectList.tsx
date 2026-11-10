import type { CatalogProject, Category } from '../features/catalog/types'
import { ProjectCard } from './ProjectCard'

export function ProjectList({ projects, categories }: { projects: CatalogProject[]; categories: Category[] }) {
  if (!projects.length) return <p className="empty-state">該当する作品がありません。</p>
  return <ul className="work-list">
    {projects.map((project) => <li key={project.id}>
      <ProjectCard project={project} categoryLabel={categories.find((category) => category.id === project.category)?.label ?? ''} />
    </li>)}
  </ul>
}
