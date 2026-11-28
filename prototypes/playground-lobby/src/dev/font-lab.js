// Font comparison, for development only. main.js imports this file behind `import.meta.env.DEV`, so neither it
// nor the candidate fonts reach a build. It is temporary: once a face is chosen, its settings move into
// style.css and fonts-ja.js, and this folder and the candidates in devDependencies go.
//
//   ?font=z|m|a|b|c   start with that set          ?lab=off   hide the switcher (for screenshots)
//
// Each set swaps the two font variables and carries its own small adjustments (font-lab.css). The lobby's own
// default is whatever style.css says; "m" below is that default and loads nothing.
import './font-lab.css'

const css = (...loaders) => () => Promise.all(loaders.map((load) => load()))
export const SETS = [
  { key: 'z', label: '従来', name: 'Sora + Zen Kaku Gothic New', load: css(
    () => import('@fontsource/zen-kaku-gothic-new/400.css'), () => import('@fontsource/zen-kaku-gothic-new/500.css'), () => import('@fontsource/zen-kaku-gothic-new/700.css')) },
  { key: 'm', label: '現在', name: 'Sora + M PLUS 2', load: css() },
  { key: 'a', label: 'A', name: 'Inter + Noto Sans JP', load: css(
    () => import('@fontsource/inter/400.css'), () => import('@fontsource/inter/500.css'), () => import('@fontsource/inter/600.css'),
    () => import('@fontsource/noto-sans-jp/400.css'), () => import('@fontsource/noto-sans-jp/500.css'), () => import('@fontsource/noto-sans-jp/700.css')) },
  { key: 'b', label: 'B', name: 'Sora + LINE Seed JP', load: css(
    () => import('@fontsource/line-seed-jp/400.css'), () => import('@fontsource/line-seed-jp/700.css')) },
  { key: 'c', label: 'C', name: 'IBM Plex Sans + IBM Plex Sans JP', load: css(
    () => import('@fontsource/ibm-plex-sans/400.css'), () => import('@fontsource/ibm-plex-sans/500.css'), () => import('@fontsource/ibm-plex-sans/600.css'),
    () => import('@fontsource/ibm-plex-sans-jp/400.css'), () => import('@fontsource/ibm-plex-sans-jp/500.css'), () => import('@fontsource/ibm-plex-sans-jp/700.css')) },
]

const root = document.documentElement
const query = new URLSearchParams(location.search)

async function use(key) {
  const set = SETS.find((s) => s.key === key) ?? SETS.find((s) => s.key === 'm')
  await set.load()
  if (set.key === 'm') delete root.dataset.font; else root.dataset.font = set.key
  const url = new URL(location.href)
  if (set.key === 'm') url.searchParams.delete('font'); else url.searchParams.set('font', set.key)
  history.replaceState(history.state, '', url)
  for (const b of document.querySelectorAll('.font-lab button')) b.setAttribute('aria-pressed', String(b.dataset.key === set.key))
  const name = document.querySelector('.font-lab output')
  if (name) name.textContent = set.name
}

if (query.get('lab') !== 'off') {
  const panel = document.createElement('div')
  panel.className = 'font-lab'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', 'フォントの比較（開発時のみ）')
  panel.innerHTML = `<span>フォント</span>${SETS.map((s) => `<button type="button" data-key="${s.key}" title="${s.name}">${s.label}</button>`).join('')}<output></output>`
  panel.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) use(b.dataset.key) })
  document.body.append(panel)
}
use(query.get('font') ?? 'm')
