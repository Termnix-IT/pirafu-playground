// 最新トピック: a carousel of banners. Each banner is one link and one image; the image carries the whole
// message, so nothing about the topic is written a second time around it.
//
// It turns by itself every few seconds, and stops turning whenever that would get in the way: while the pointer
// is over it, while it has keyboard focus, after the visitor pressed pause, while the tab is hidden, while a
// sheet covers the lobby, and whenever motion is to be reduced. With one topic there is nothing to turn and no
// controls are drawn; with none the section is hidden.
import { frame } from './frame.js'
import { icon } from './icons.js'

const TURN_MS = 8000
const SESSION = 'pirafu-lobby-topic'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * @param {object} o
 * @param {HTMLElement} o.host the <section> to fill
 * @param {object[]} o.topics from lobby.json, in display order
 * @param {string} o.baseUrl
 * @param {() => boolean} o.reduced whether motion should be reduced right now
 */
export function createTopics({ host, topics, baseUrl, reduced }) {
  // "from" and "until" are instants with their own UTC offset, so they are compared as they are with the
  // visitor's clock: a topic appears and disappears at the same moment everywhere.
  const onShow = () => { const now = Date.now(); return topics.filter((t) => (!t.from || Date.parse(t.from) <= now) && (!t.until || Date.parse(t.until) > now)) }
  let list = [], index = 0, timer = 0
  const state = { paused: false, hover: false, focus: false, suspended: false }
  try { state.paused = sessionStorage.getItem(SESSION + '-paused') === '1' } catch { /* storage may be unavailable */ }

  const turning = () => list.length > 1 && !state.paused && !state.hover && !state.focus && !state.suspended && !document.hidden && !reduced()
  function schedule() {
    clearTimeout(timer)
    const on = turning()
    host.classList.toggle('is-turning', on)
    if (on) timer = setTimeout(() => show(index + 1, 1, false), TURN_MS)
  }

  function render() {
    list = onShow()
    host.hidden = list.length === 0
    if (!list.length) { host.innerHTML = ''; return }
    let saved = null
    try { saved = sessionStorage.getItem(SESSION) } catch { /* ignore */ }
    index = Math.max(0, list.findIndex((t) => t.id === saved))
    const many = list.length > 1
    host.innerHTML = `<h2 class="eyebrow" id="topicsTitle">最新トピック</h2>
      <div class="tp" id="tp" role="group" aria-roledescription="カルーセル" aria-labelledby="topicsTitle">
        <div class="tp-view" data-frame="card">${list.map((t, i) => `
          <a class="tp-slide" draggable="false" href="${esc(t.href)}"${t.external ? ' target="_blank" rel="noopener"' : ''} data-i="${i}" aria-label="${esc(t.kind)}：${esc(t.title)}${t.external ? '（新しいタブで開きます）' : ''}"${many ? ` aria-roledescription="スライド"` : ''}>
            <img src="${esc(baseUrl + t.imageSmall)}" srcset="${esc(baseUrl + t.imageSmall)} 630w, ${esc(baseUrl + t.image)} 1260w" sizes="(max-width: 700px) 92vw, 440px" alt="${esc(t.alt)}" width="1260" height="540" ${i === index ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false">
          </a>`).join('')}
        </div>
        ${many ? `<div class="tp-bar">
          <ol class="tp-dots">${list.map((t, i) => `<li><button type="button" data-i="${i}" aria-label="${i + 1}件目：${esc(t.title)}"><i></i></button></li>`).join('')}</ol>
          <button type="button" class="tp-pause" id="tpPause"></button>
          <button type="button" class="tp-step" id="tpPrev" aria-label="前のトピック">${icon('prev', 20)}</button>
          <button type="button" class="tp-step" id="tpNext" aria-label="次のトピック">${icon('next', 20)}</button>
        </div>
        <p class="sr" aria-live="polite" id="tpLive"></p>` : ''}
      </div>`
    for (const el of host.querySelectorAll('[data-frame]')) frame(el, el.dataset.frame)
    place(index, 0, true)
    if (!many) return
    const tp = host.querySelector('#tp')
    tp.addEventListener('pointerenter', () => { state.hover = true; schedule() })
    tp.addEventListener('pointerleave', () => { state.hover = false; schedule() })
    tp.addEventListener('focusin', () => { state.focus = true; schedule() })
    tp.addEventListener('focusout', (e) => { if (!tp.contains(e.relatedTarget)) { state.focus = false; schedule() } })
    tp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1, 1, true) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1, -1, true) }
    })
    host.querySelector('.tp-dots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i, +b.dataset.i > index ? 1 : -1, true) })
    host.querySelector('#tpPrev').addEventListener('click', () => show(index - 1, -1, true))
    host.querySelector('#tpNext').addEventListener('click', () => show(index + 1, 1, true))
    host.querySelector('#tpPause').addEventListener('click', () => {
      state.paused = !state.paused
      try { sessionStorage.setItem(SESSION + '-paused', state.paused ? '1' : '0') } catch { /* ignore */ }
      syncPause(); schedule()
    })
    // a sideways swipe turns the banner; the tap that ends a swipe must not also open the link
    const view = host.querySelector('.tp-view')
    let start = null, swiped = false
    view.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; swiped = false })
    view.addEventListener('pointerup', (e) => {
      if (!start) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      start = null
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) { swiped = true; show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, true) }
    })
    view.addEventListener('pointercancel', () => { start = null })
    view.addEventListener('dragstart', (e) => e.preventDefault())
    view.addEventListener('click', (e) => { if (swiped) { e.preventDefault(); swiped = false } }, true)
    syncPause()
    schedule()
  }

  function syncPause() {
    const b = host.querySelector('#tpPause')
    if (!b) return
    // with reduced motion the banner never turns by itself, so there is nothing to pause
    b.hidden = reduced()
    b.setAttribute('aria-label', state.paused ? '自動切り替えを再開する' : '自動切り替えを止める')
    b.innerHTML = icon(state.paused ? 'play' : 'pause', 20)
  }

  // Puts slide i on show. dir: 1 the new one comes in from the right, -1 from the left, 0 no movement.
  function place(i, dir, first) {
    const slides = [...host.querySelectorAll('.tp-slide')]
    const previous = slides.find((s) => s.classList.contains('is-on'))
    const next = slides[i]
    for (const s of slides) { const on = s === next; s.classList.toggle('is-on', on); s.inert = !on; s.setAttribute('aria-hidden', on ? 'false' : 'true') }
    if (!first && dir && previous && previous !== next && !reduced()) {
      const options = { duration: 560, easing: 'cubic-bezier(.3,.7,.2,1)' }
      previous.classList.add('is-leaving')
      previous.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 100}%)` }], options).finished.finally(() => previous.classList.remove('is-leaving'))
      next.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: 'translateX(0)' }], options)
    }
    host.querySelectorAll('.tp-dots button').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current') })
    // the banner after this one is fetched now, so that it is there when its turn comes
    const after = list[(i + 1) % list.length]
    if (list.length > 1 && after) { const img = slides[(i + 1) % list.length].querySelector('img'); img.loading = 'eager' }
  }
  function show(i, dir, byVisitor) {
    if (!list.length) return
    const hadFocus = host.querySelector('.tp-slide.is-on') === document.activeElement
    index = (i + list.length) % list.length
    place(index, dir, false)
    try { sessionStorage.setItem(SESSION, list[index].id) } catch { /* ignore */ }
    if (hadFocus) host.querySelector('.tp-slide.is-on').focus({ preventScroll: true })
    // a turn the visitor asked for is announced; the automatic ones stay silent
    const live = host.querySelector('#tpLive')
    if (live) live.textContent = byVisitor ? `${index + 1} / ${list.length} ${list[index].kind}：${list[index].title}` : ''
    schedule()
  }

  document.addEventListener('visibilitychange', schedule)
  // topics come on show and go off by the clock, without a reload
  setInterval(() => { const now = onShow(); if (now.length !== list.length || now.some((t, i) => t.id !== list[i].id)) render() }, 60000)
  render()

  return {
    /** Stops the turning while something covers the lobby. */
    suspend(on) { state.suspended = on; schedule() },
    /** Call when the reduced-motion setting changed. */
    refresh() { syncPause(); schedule() },
    get count() { return list.length },
  }
}
