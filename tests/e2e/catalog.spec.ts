import { expect, test } from '@playwright/test'

// Runs against the real built catalog: DOPASWEEPER is the listed work, and sample-unlisted covers the showcase page.

// The title link of a work's row. Each row also has a "くわしく見る" link to the same page.
const projectLink = (id: string) => `#works h3 a[href="/projects/${id}"]`
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

test('URLに残った検索語を表示し、条件解除と戻る操作を利用できる', async ({ page }) => {
  await page.goto('/?q=存在しない作品検索語')
  await expect(page.locator('#works a[href^="/projects/"]')).toHaveCount(0)
  await expect(page.getByRole('main')).toContainText('「存在しない作品検索語」で絞り込んでいます。')
  await expect(page.getByRole('main')).toContainText('該当する作品がありません')
  await page.getByRole('link', { name: '条件を解除' }).click()
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  await page.goBack()
  await expect(page.locator('#works a[href^="/projects/"]')).toHaveCount(0)
})

test('カテゴリーで絞り込み、再読み込みしても選択が残る', async ({ page }) => {
  await page.goto('/')
  const categories = page.getByRole('navigation', { name: 'カテゴリー', exact: true })
  await categories.getByRole('link', { name: 'Webアプリ' }).click()
  await expect(page).toHaveURL(/category=apps/)
  await expect(page.locator(projectLink('dopasweeper'))).toHaveCount(0)
  await categories.getByRole('link', { name: 'ミニゲーム' }).click()
  await expect(page).toHaveURL(/category=games/)
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  await page.reload()
  await expect(categories.getByRole('link', { name: 'ミニゲーム' })).toHaveAttribute('aria-current', 'true')
  await categories.getByRole('link', { name: 'すべて' }).click()
  await expect(page).toHaveURL(/\/$/)
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

test('狭い画面でキーボードから本文へ移動でき、横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  const skip = page.getByRole('link', { name: /本文|メイン/ })
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page.locator(projectLink('dopasweeper'))).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const path of ['/projects/dopasweeper', '/about', '/missing-page']) {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('動きを減らす設定では入場アニメーションを止め、遷移はそのまま使える', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const card = page.locator('.work-list > li').first()
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
  // Measure after the web fonts swap in; the font swap itself changes label widths once on first load.
  await page.evaluate(() => document.fonts.ready)
  const before = await labels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left))
  await nav.getByRole('link', { name: 'このサイトについて' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(nav.getByRole('link', { name: 'このサイトについて' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.locator('[aria-current]')).toHaveCount(1)
  expect(await labels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left))).toEqual(before)
  await expect(page.getByRole('heading', { name: '更新履歴' })).toBeVisible()
})

test('テーマは未選択ならOSの設定に従い、切り替えた選択は再読み込み後も保たれる', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'ライトテーマに切り替え' }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'ダークテーマに切り替え' })).toBeVisible()
})

test('一覧の行から作品を別タブで開ける', async ({ page }) => {
  await page.goto('/')
  const row = page.getByRole('article', { name: 'DOPASWEEPER' })
  const launch = row.getByRole('link', { name: launchLinkName })
  await expect(launch).toHaveAttribute('href', /^https:\/\//)
  await expect(launch).toHaveAttribute('target', '_blank')
  await row.getByRole('link', { name: 'DOPASWEEPERをくわしく見る' }).click()
  await expect(page).toHaveURL(/\/projects\/dopasweeper$/)
})

test('404のタイルパズルをキーボードでそろえられる', async ({ page }) => {
  await page.goto('/missing-page')
  const puzzle = page.getByRole('group', { name: 'HOMEのタイルパズル' })
  // The first order is M E H O. Swap M with H, move focus to E with the arrow key, then swap E with O.
  await puzzle.getByRole('button', { name: 'M（1番目）' }).focus()
  await page.keyboard.press('Enter')
  await expect(puzzle.getByRole('button', { name: 'M（1番目）' })).toHaveAttribute('aria-pressed', 'true')
  await puzzle.getByRole('button', { name: 'H（3番目）' }).focus()
  await page.keyboard.press('Enter')
  await expect(puzzle.getByRole('button', { name: 'H（1番目）' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(puzzle.getByRole('button', { name: 'E（2番目）' })).toBeFocused()
  await page.keyboard.press('Enter')
  await puzzle.getByRole('button', { name: 'O（4番目）' }).focus()
  await page.keyboard.press('Enter')
  await expect(puzzle.getByRole('button')).toHaveText(['H', 'O', 'M', 'E'])
})
