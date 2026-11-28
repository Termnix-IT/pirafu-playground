// How the room view depends on the shape of the screen. Kept apart from stage.js because the still-image
// backdrop uses the same rule and must work without loading three.js.

/** Vertical field of view of the lobby's room view for a screen of the given aspect ratio, in degrees. */
export function roomFov(aspect) {
  return Math.max(40, Math.min(78, 2 * Math.atan(Math.tan(33 * Math.PI / 180) / aspect) * 180 / Math.PI))
}

// The stills are photographed a little taller and much wider than a 16:9 screen shows
// (scripts/render-stills.mjs). Cropping the middle of a wide picture gives the same picture as a narrower lens
// from the same place, so one still lines up with the live view on every screen from 16:10 to 21:9.
export const STILL = { fov: 46, aspect: 2.05 }

/**
 * Size, in CSS px, at which a still must be shown so that it lines up with the live room view on a screen of
 * width x height. When the screen would see past the still's edges (a tall phone), the still covers the screen.
 */
export function stillSize(width, height) {
  const focal = (h, fov) => h / (2 * Math.tan(fov * Math.PI / 360))
  const live = roomFov(width / height)
  const cover = Math.max(height, width / STILL.aspect)
  // a screen that sees more than the still holds cannot be matched; there the still simply fills the screen
  const scale = live > STILL.fov ? cover : Math.max(cover, focal(height, live) / focal(1, STILL.fov))   // height of the still on screen
  return { width: scale * STILL.aspect, height: scale }
}
