// Japanese glyphs are split into ~120 unicode-range subsets per weight, so these @font-face rules alone run to
// hundreds of kilobytes. main.tsx imports this module dynamically: Vite emits it as a separate stylesheet that
// the script inserts, which does not block the first paint. Text shows in the fallback font until it swaps in.
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/700.css'
import '@fontsource/zen-kaku-gothic-new/900.css'
