import { defineConfig } from 'vite'

// The prototype is served on its own. It reuses Vite and the fonts installed at the repository root.
export default defineConfig({
  base: './',
  server: { fs: { allow: ['../..'] } },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
})
