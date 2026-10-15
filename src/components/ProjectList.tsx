import { Link } from 'react-router'
import type { CatalogProject, Category } from '../features/catalog/types'
import { statusLabels } from '../features/catalog/types'

export function ProjectList({ projects, categories }: { projects: CatalogProject[]; categories: Category[] }) {
  if (!projects.length) return <p>条件に一致する作品はありません。検索語や絞り込み条件を変更してください。</p>
  return <ul className="project-list">
    {projects.map((project) => <li key={project.id}>
      <article aria-labelledby={`title-${project.id}`}>
        <h2 id={`title-${project.id}`}><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
        <p className="project-meta">
          {categories.find((category) => category.id === project.category)?.label}
          {' / '}{statusLabels[project.status]}{' / '}{project.launch.type === 'showcase' ? '紹介のみ' : 'ブラウザアプリ'}
          {project.featured && ' / ピックアップ'}
        </p>
        <p>{project.description}</p>
        {project.tags.length > 0 && <p>タグ：{project.tags.join('、')}</p>}
      </article>
    </li>)}
  </ul>
}
