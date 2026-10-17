import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Fontsource lists a .woff fallback after every .woff2 source. All supported browsers read woff2, so dropping the
// fallback halves both the bundled font files and the @font-face text. Runs before Vite emits the url() assets.
function fontsourceWoff2Only(): Plugin {
  return {
    name: 'fontsource-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@fontsource[\\/][^?]+\.css(?:\?|$)/.test(id)) return null
      return { code: code.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, ''), map: null }
    },
  }
}

export default defineConfig({
  plugins: [fontsourceWoff2Only(), react()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  // Never inline small assets as data: URLs: the CSP blocks them, and a woff2 subset under the default 4 KB limit
  // would otherwise fail to load with no fallback source left.
  build: { sourcemap: false, assetsInlineLimit: 0 },
})
