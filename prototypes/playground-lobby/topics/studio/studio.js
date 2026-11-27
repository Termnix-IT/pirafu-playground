// Fills the banner sources with the works' own images (from the catalog, through lobby.json) and tells
// render-banners.mjs when everything, fonts included, is ready to be photographed.
import '@fontsource/sora/400.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/800.css'
import '@fontsource/zen-kaku-gothic-new/500.css'
import '@fontsource/zen-kaku-gothic-new/700.css'
import '@fontsource/zen-kaku-gothic-new/900.css'
import './studio.css'

const data = await fetch('/assets/lobby.json').then((r) => r.json())
const loads = []
for (const img of document.querySelectorAll('img[data-work], img[data-still]')) {
  const work = data.works.find((w) => w.id === img.dataset.work)
  img.src = img.dataset.still ? `/assets/stills/${img.dataset.still}.webp` : `/${work.image.src}`
  loads.push(img.decode().catch(() => { img.dataset.missing = '' }))
}
// the minesweeper cells of the DOPASWEEPER banner: a fixed pattern, so the banner renders the same every time
const cells = document.querySelector('.cells')
const OPEN = '0010011000011100100111011000110100101100011011100110010011010011'
for (let i = 0; i < 64; i++) { const c = document.createElement('i'); if (OPEN[i] === '1') c.className = 'on c' + (i % 4); cells.appendChild(c) }

await Promise.all([...loads, document.fonts.ready])
await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
document.documentElement.dataset.ready = ''
