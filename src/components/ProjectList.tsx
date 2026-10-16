import type { CatalogProject, Category } from '../features/catalog/types'
import { PlusIcon } from './Icons'
import { ProjectCard } from './ProjectCard'

export function ProjectList({ projects, categories, showUpcoming = false }: { projects: CatalogProject[]; categories: Category[]; showUpcoming?: boolean }) {
  if (!projects.length) return <p className="empty-state">該当する作品がありません。条件を変えて探してみてください。</p>
  return <ul className="work-grid">
    {projects.map((project) => <li key={project.id}>
      <ProjectCard project={project} categoryLabel={categories.find((category) => category.id === project.category)?.label ?? ''} />
    </li>)}
    {/* An honest placeholder instead of empty space while there are few works. */}
    {showUpcoming && <li className="upcoming-tile">
      <PlusIcon size={24} />
      <p className="upcoming-tile__title">次の作品を制作中</p>
      <p>できたらここに並びます</p>
    </li>}
  </ul>
}
