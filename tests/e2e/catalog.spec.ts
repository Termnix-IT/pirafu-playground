import { expect, test } from '@playwright/test'

// Runs against the real built catalog: DOPASWEEPER is the listed work, and sample-unlisted covers the showcase page.

// Links inside the work grid; the pickup tile above it links to the same projects.
const projectLink = (id: string) => `#works a[href="/projects/${id}"]`
const launchLinkName = /起動|アプリを開く|利用する|あそぶ|つかう/

test('一覧から詳細へ移動し、直接アクセスと再読込ができる', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto('/')
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  for (const id of ['sample-tool', 'sample-notebook', 'sample-unlisted', 'sample-hidden']) {
    await expect(page.locator(`main a[href="/projects/${id}"]`)).toHaveCount(0)
  }

  await page.locator(projectLink('dopasweeper')).click()
  await expect(page).toHaveURL(/\/projects\/dopasweeper$/)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('DOPASWEEPER')
  const launch = page.getByRole('main').getByRole('link', { name: launchLinkName })
  await expect(launch).toHaveAttribute('target', '_blank')
  await expect(launch).toHaveAttribute('rel', 'noopener noreferrer')
  await page.reload()
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/projects/sample-unlisted')
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(/構成サンプル/)
  await expect(page.getByRole('link', { name: launchLinkName })).toHaveCount(0)
  expect(failures).toEqual([])
})

test('検索条件をURLで復元し、戻る操作と条件解除を利用できる', async ({ page }) => {
  await page.goto('/')
  const search = page.getByLabel('タイトル・タグ', { exact: true })
  await search.fill('存在しない作品検索語')
  await expect(page).toHaveURL(/q=/)
  await expect(page.locator('#works a[href^="/projects/"]')).toHaveCount(0)
  await expect(page.getByRole('main')).toContainText(/0\s*件|見つかりません|ありません/)
  await page.reload()
  await expect(search).toHaveValue('存在しない作品検索語')
  await page.getByRole('link', { name: '条件を解除' }).click()
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  await page.goBack()
  await expect(search).toHaveValue('存在しない作品検索語')
  await expect(page.locator('#works a[href^="/projects/"]')).toHaveCount(0)
})

test('カテゴリーと開発状況を組み合わせて絞り込める', async ({ page }) => {
  await page.goto('/')
  const categories = page.getByRole('navigation', { name: 'カテゴリー', exact: true })
  await categories.getByRole('link', { name: 'Webアプリ' }).click()
  await expect(page).toHaveURL(/category=apps/)
  await expect(page.locator(projectLink('dopasweeper'))).toHaveCount(0)
  await categories.getByRole('link', { name: 'ミニゲーム' }).click()
  await expect(page).toHaveURL(/category=games/)
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  const status = page.getByRole('combobox', { name: '開発状況', exact: true })
  await status.selectOption('archived')
  await expect(page).toHaveURL(/status=archived/)
  await expect(page).toHaveURL(/category=games/)
  await expect(page.locator(projectLink('dopasweeper'))).toHaveCount(0)
  await page.reload()
  await expect(status).toHaveValue('archived')
})

test('非一覧作品は詳細のみ表示し、非掲載作品と未知URLは未検出にする', async ({ page }) => {
  await page.goto('/projects/sample-unlisted')
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(/構成サンプル/)
  for (const path of ['/projects/sample-hidden', '/projects/sample-tool', '/projects/does-not-exist', '/missing-page']) {
    await page.goto(path)
    await expect(page.getByRole('main')).toContainText(/見つかりません|見つかりませんでした|存在しません/)
    await expect(page.locator('main a[href="/"]')).toBeVisible()
  }
  await page.goto('/about')
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Pirafu2411')
})

test('狭い画面でキーボードから検索でき、横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  const skip = page.getByRole('link', { name: /本文|メイン/ })
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const search = page.getByLabel('タイトル・タグ', { exact: true })
  await search.focus()
  await search.fill('存在しない作品検索語')
  await search.press('Enter')
  await expect(page).toHaveURL(/q=/)
  await expect(page.locator('#works a[href^="/projects/"]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('動きを減らす設定では入場アニメーションを止め、遷移はそのまま使える', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const card = page.locator('.work-grid > li').first()
  await expect(card).toBeVisible()
  expect(await card.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await page.locator(projectLink('dopasweeper')).click()
  await expect(page).toHaveURL(/\/projects\/dopasweeper$/)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeFocused()
})

test('メニューは選択中の項目だけを示し、切り替えても文字の位置が変わらない', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'メインナビゲーション' })
  const labels = nav.locator('.nav-label')
  const before = await labels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left))
  await nav.getByRole('link', { name: 'このサイトについて' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(nav.getByRole('link', { name: 'このサイトについて' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.locator('.nav-indicator')).toHaveCount(1)
  expect(await labels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left))).toEqual(before)
  await expect(page.getByRole('heading', { name: '更新履歴' })).toBeVisible()
})

test('Ctrl+Kでどのページからでも作品検索へ移動できる', async ({ page }) => {
  await page.goto('/projects/dopasweeper')
  await page.keyboard.press('Control+k')
  await expect(page).toHaveURL(/\/#works$/)
  await expect(page.getByLabel('タイトル・タグ', { exact: true })).toBeFocused()
})
