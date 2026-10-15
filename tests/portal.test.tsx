import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App } from '../src/app/App'
import type { Catalog, CatalogProject } from '../src/features/catalog/types'

const base: CatalogProject = {
  id: 'demo', title: 'ノート', description: '紹介文', category: 'apps', status: 'stable', tags: ['note'],
  featured: true, visibility: 'public', launch: { type: 'external', url: 'https://example.com/app/' },
  launchEnabled: true, screenshots: [],
}
function open(path = '/', project: CatalogProject = base) {
  const catalog: Catalog = { schemaVersion: 1, categories: [{ id: 'apps', label: 'Webアプリ' }], projects: [project] }
  return render(<MemoryRouter initialEntries={[path]}><App catalog={catalog} /></MemoryRouter>)
}

describe('Portal user flows', () => {
  it('restores bookmarked filters and displays the matching count', async () => {
    open('/?q=note&category=apps')
    expect(screen.getByLabelText('タイトル・タグ')).toHaveValue('note')
    expect(screen.getByRole('link', { name: 'Webアプリ' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'すべて' })).toHaveAttribute('href', '/?q=note')
    expect(screen.getByRole('status')).toHaveTextContent('1件')
    await userEvent.clear(screen.getByLabelText('タイトル・タグ'))
    await userEvent.type(screen.getByLabelText('タイトル・タグ'), 'ない作品')
    await userEvent.click(screen.getByRole('button', { name: '絞り込む' }))
    expect(screen.getByRole('status')).toHaveTextContent('0件')
    expect(screen.getByText(/条件に一致する作品はありません/)).toBeVisible()
  })
  it('moves focus and changes the title after internal navigation', async () => {
    open()
    await userEvent.click(screen.getByRole('link', { name: 'ノート' }))
    expect(screen.getByRole('heading', { level: 1, name: 'ノート' })).toHaveFocus()
    expect(document.title).toBe('ノート | Pirafu2411 Playground')
    const link = screen.getByRole('link', { name: 'つかう（別タブ）' })
    expect(link).toHaveAttribute('href', 'https://example.com/app/')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('labels the launch link for games as playing', () => {
    open('/projects/demo', { ...base, category: 'games' })
    expect(screen.getByRole('link', { name: 'あそぶ（別タブ）' })).toHaveAttribute('href', 'https://example.com/app/')
  })
  it('never displays a launch link for disabled or showcase projects', () => {
    const view = open('/projects/demo', { ...base, launchEnabled: false })
    expect(screen.getByText('現在は起動できません。')).toBeVisible()
    expect(screen.queryByRole('link', { name: /あそぶ|つかう/ })).not.toBeInTheDocument()
    view.unmount()
    open('/projects/demo', { ...base, launch: { type: 'showcase' }, launchEnabled: false })
    expect(screen.getByText('この作品は紹介のみです。')).toBeVisible()
    expect(screen.queryByRole('link', { name: /あそぶ|つかう/ })).not.toBeInTheDocument()
  })
  it('omits unlisted projects from the list but permits their detail with a noindex hint', () => {
    const view = open('/', { ...base, visibility: 'unlisted' })
    expect(screen.queryByRole('link', { name: 'ノート' })).not.toBeInTheDocument()
    view.unmount()
    open('/projects/demo', { ...base, visibility: 'unlisted' })
    expect(screen.getByRole('heading', { name: 'ノート' })).toBeVisible()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  })
  it('uses Not Found for missing projects and preserves text instead of rendering HTML', () => {
    const view = open('/projects/missing')
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()
    view.unmount()
    open('/projects/demo', { ...base, description: '<script>unsafe()</script>' })
    expect(screen.getByText('<script>unsafe()</script>')).toBeVisible()
    expect(document.querySelector('main script')).toBeNull()
  })
  it('replaces broken images with their description', () => {
    open('/projects/demo', { ...base, thumbnail: { src: '/generated/media/demo/image.png', alt: '画面の説明', width: 100, height: 60 } })
    fireEvent.error(screen.getByRole('img', { name: '画面の説明' }))
    expect(screen.getByRole('status')).toHaveTextContent('画像を表示できません：画面の説明')
  })
})
