import { fireEvent, render, screen, within } from '@testing-library/react'
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
    expect(screen.getByRole('status')).toHaveTextContent('0件')
    expect(screen.getByText(/該当する作品がありません/)).toBeVisible()
  })
  it('moves focus and changes the title after internal navigation', async () => {
    open()
    const works = screen.getByRole('region', { name: 'すべての作品' })
    await userEvent.click(within(works).getByRole('link', { name: 'ノート' }))
    expect(screen.getByRole('heading', { level: 1, name: 'ノート' })).toHaveFocus()
    expect(document.title).toBe('ノート | Pirafu2411 Playground')
    const link = screen.getByRole('link', { name: 'つかう（別タブ）' })
    expect(link).toHaveAttribute('href', 'https://example.com/app/')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('filters while typing and keeps spaces between words', async () => {
    open('/', { ...base, tags: ['note', 'browser'] })
    await userEvent.type(screen.getByLabelText('タイトル・タグ'), 'note browser')
    expect(screen.getByLabelText('タイトル・タグ')).toHaveValue('note browser')
    expect(screen.getByRole('status')).toHaveTextContent('1件')
  })
  it('shows the featured project as the pickup tile on the home page', () => {
    open()
    const pickup = screen.getByText('ピックアップ').closest('article')
    expect(pickup).not.toBeNull()
    expect(within(pickup as HTMLElement).getByRole('heading', { level: 2, name: 'ノート' })).toBeVisible()
    expect(within(pickup as HTMLElement).getByRole('link', { name: 'つかう（別タブ）' })).toHaveAttribute('href', 'https://example.com/app/')
  })
  it('unlocks another work when the PLAYGROUND tiles are put in order', async () => {
    const catalog: Catalog = {
      schemaVersion: 1, categories: [{ id: 'apps', label: 'Webアプリ' }, { id: 'games', label: 'ミニゲーム' }],
      projects: [base, { ...base, id: 'game', title: 'ゲーム', category: 'games', featured: false }],
    }
    render(<MemoryRouter><App catalog={catalog} /></MemoryRouter>)
    const puzzle = screen.getByRole('group', { name: 'PLAYGROUNDのタイルパズル' })
    // The first scramble swaps A (3rd) and U (8th); swapping them back solves the word.
    await userEvent.click(within(puzzle).getByRole('button', { name: 'U（3番目）' }))
    expect(within(puzzle).getByRole('button', { name: 'U（3番目）' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(puzzle).getByRole('button', { name: 'A（8番目）' }))
    expect(within(puzzle).getByRole('button', { name: 'A（3番目）' })).toHaveAttribute('aria-pressed', 'false')
    const card = screen.getByText('アンロック！').closest('article') as HTMLElement
    expect(within(card).getByRole('heading', { level: 2, name: 'ゲーム' })).toBeVisible()
    expect(screen.getByText(/PLAYGROUNDがそろいました。ゲームが出てきました。/)).toBeInTheDocument()
  })
  it('moves a chosen tile with the arrow keys and moves focus without one', async () => {
    open('/missing-page')
    const puzzle = screen.getByRole('group', { name: 'HOMEのタイルパズル' })
    const first = within(puzzle).getByRole('button', { name: 'M（1番目）' })
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(puzzle).getByRole('button', { name: 'E（2番目）' })).toHaveFocus()
    await userEvent.keyboard('{Enter}{ArrowLeft}')
    expect(within(puzzle).getByRole('button', { name: 'E（1番目）' })).toHaveFocus()
    expect(within(puzzle).getByRole('button', { name: 'M（2番目）' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '作品一覧へ' })).toHaveAttribute('href', '/')
  })
  it('keeps the single tab stop on the clicked tile after a click swap', async () => {
    open('/missing-page')
    const puzzle = screen.getByRole('group', { name: 'HOMEのタイルパズル' })
    await userEvent.click(within(puzzle).getByRole('button', { name: 'M（1番目）' }))
    await userEvent.click(within(puzzle).getByRole('button', { name: 'E（2番目）' }))
    const moved = within(puzzle).getByRole('button', { name: 'E（1番目）' })
    expect(moved).toHaveFocus()
    expect(within(puzzle).getAllByRole('button').filter((button) => button.tabIndex === 0)).toEqual([moved])
  })
  it('labels the launch link for games as playing', () => {
    open('/projects/demo', { ...base, category: 'games' })
    expect(screen.getByRole('link', { name: 'あそぶ（別タブ）' })).toHaveAttribute('href', 'https://example.com/app/')
  })
  it('never displays a launch link for disabled or showcase projects', () => {
    const view = open('/projects/demo', { ...base, launchEnabled: false })
    expect(screen.getByText('ただいま準備中です。')).toBeVisible()
    expect(screen.queryByRole('link', { name: /あそぶ|つかう/ })).not.toBeInTheDocument()
    view.unmount()
    open('/projects/demo', { ...base, launch: { type: 'showcase' }, launchEnabled: false })
    expect(screen.getByText('この作品は紹介だけです。')).toBeVisible()
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
  it('switches between light and dark themes and remembers the choice', async () => {
    try {
      open()
      expect(document.documentElement.dataset.theme).toBe('light')
      await userEvent.click(screen.getByRole('button', { name: 'ダークテーマに切り替え' }))
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(window.localStorage.getItem('pirafu-theme')).toBe('dark')
      expect(screen.getByRole('button', { name: 'ライトテーマに切り替え' })).toBeVisible()
    } finally {
      delete document.documentElement.dataset.theme
      window.localStorage.removeItem('pirafu-theme')
    }
  })
  it('shows the update history on the About page', () => {
    open('/about')
    expect(screen.getByRole('heading', { level: 2, name: '更新履歴' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'このサイトについて', current: 'page' })).toBeVisible()
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
