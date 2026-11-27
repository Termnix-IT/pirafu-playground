// Draws the outline of a slab as SVG behind its content: straight edges, diagonal cuts, a hairline border.
// CSS clip-path could cut the same corners but would also cut the border away, and a blurred shadow is not
// wanted here: the silhouette alone has to make the slab read as part of the screen's frame.
// The side that touches the screen edge is drawn past it, so no line and no gap shows there.
const NS = 'http://www.w3.org/2000/svg'
const OUT = 3

const SHAPES = {
  // rises from the bottom edge: slanted ends, flat top
  rise: (w, h, c) => [[-OUT, h + OUT], [c, 0.5], [w - c, 0.5], [w + OUT, h + OUT]],
  // comes out of the left edge: the far lower corner is cut
  left: (w, h, c) => [[-OUT, 0.5], [w - 0.5, 0.5], [w - 0.5, h - c], [w - c, h - 0.5], [-OUT, h - 0.5]],
  // comes out of the right edge: the far upper corner is cut
  right: (w, h, c) => [[c, 0.5], [w + OUT, 0.5], [w + OUT, h - 0.5], [0.5, h - 0.5], [0.5, c]],
  // a tab on the left edge with a slanted end, used for the labels that stand outside the cards
  tabLeft: (w, h, c) => [[-OUT, 0.5], [w - c, 0.5], [w - 0.5, h - 0.5], [-OUT, h - 0.5]],
  tabRight: (w, h, c) => [[c, 0.5], [w + OUT, 0.5], [w + OUT, h - 0.5], [0.5, h - 0.5]],
  // free-standing plate with two opposite corners cut
  plate: (w, h, c) => [[c, 0.5], [w - 0.5, 0.5], [w - 0.5, h - c], [w - c, h - 0.5], [0.5, h - 0.5], [0.5, c]],
}

const observer = new ResizeObserver((entries) => { for (const { target } of entries) draw(target) })

function draw(el) {
  const polygon = el.__frame
  const w = el.offsetWidth, h = el.offsetHeight
  if (!polygon || !w || !h) return
  const style = getComputedStyle(el)
  const cut = parseFloat(style.getPropertyValue('--cut')) || 0
  const shape = style.getPropertyValue('--shape').trim() || el.dataset.shape
  polygon.setAttribute('points', (SHAPES[shape] ?? SHAPES.plate)(w, h, cut).map((p) => p.join(',')).join(' '))
}

/** Gives `el` a drawn outline. The shape comes from data-shape, or from the CSS variable --shape so that a media query can change it; the size of the cut comes from --cut. */
export function frame(el, shape) {
  if (shape) el.dataset.shape = shape
  if (!el.__frame?.isConnected) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'frame')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    const polygon = document.createElementNS(NS, 'polygon')
    svg.appendChild(polygon)
    el.prepend(svg)
    el.__frame = polygon
    observer.observe(el)
  }
  draw(el)
  return el
}

/** Redraws every outline, for when a media query changed a shape without changing a size. */
export function redrawFrames() { for (const svg of document.querySelectorAll('svg.frame')) draw(svg.parentElement) }
