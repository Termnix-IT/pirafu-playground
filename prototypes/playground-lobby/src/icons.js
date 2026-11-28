// Line icons drawn for the lobby. Square caps and mitred joins keep them as sharp as the slabs they sit on.
// Every icon is decorative: the text beside it carries the meaning.
const PATHS = {
  games: '<path d="M6.5 7.5h11l3.5 9.5h-4.2l-2.2-3.2H9.4L7.2 17H3z"/><path d="M8.6 9.6v3M7.1 11.1h3M15 10.2h.01M17 12.2h.01"/>',
  tools: '<path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.6 4.5l-3.2 15"/>',
  lab: '<path d="M9 3.5h6M10.2 3.5v5.8L4.8 19.5h14.4L13.8 9.3V3.5M7.6 14.6h8.8"/>',
  media: '<path d="M3.5 5.5h17v13h-17z"/><path d="M3.5 15.5l4.8-4.8 3.9 3.9 2.6-2.6 5.7 5.7M15.2 8.6h.01"/>',
  profile: '<path d="M8.6 7.8a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0zM4.5 20c.8-3.8 3.6-5.7 7.5-5.7s6.7 1.9 7.5 5.7"/>',
  settings: '<path d="M3.5 7h9.2M17 7h3.5M3.5 12h3M11.5 12h9M3.5 17h7.2M15 17h5.5"/><path d="M12.7 5h4.3v4h-4.3zM6.5 10h5v4h-5zM10.7 15h4.3v4h-4.3z"/>',
  sky: '<path d="M8.4 12a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 1 0-7.2 0zM12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/>',
  moon: '<path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z"/>',
  cloud: '<path d="M7.5 18h9.2a3.8 3.8 0 0 0 .5-7.57A5.6 5.6 0 0 0 6.5 11.3 3.4 3.4 0 0 0 7.5 18z"/>',
  water: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  out: '<path d="M7.5 16.5l9-9M9.5 7.5h7v7"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  pause: '<path d="M8.5 6v12M15.5 6v12"/>',
  play: '<path d="M8.5 6l9.5 6-9.5 6z"/>',
  updates: '<path d="M5.5 4.5h13v15h-13zM8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  retry: '<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5.5 5v3.5H9"/>',
  prev: '<path d="M14 6.5L8.5 12l5.5 5.5"/>',
  next: '<path d="M10 6.5l5.5 5.5-5.5 5.5"/>',
}

export function icon(name, size = 20) {
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${PATHS[name] ?? ''}</svg>`
}

// The site's mark: the pixel "P" of the portal's favicon, in one colour so that it sits in the title bar.
export const MARK = '<svg class="mark-svg" viewBox="0 0 7 9" width="14" height="18" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path d="M1 1h4v1h1v2h-1v1h-3v3h-1zM2 2v2h3v-2z" fill-rule="evenodd"/></svg>'
