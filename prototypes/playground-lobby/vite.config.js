import { defineConfig } from 'vite'

// The lobby is served on its own. Vite and the fonts come from the repository root; three.js and the tools
// that prepare the 3D model are this prototype's own dependencies (npm install here).

// The production portal's policy (public/_headers). `npm run preview` serves the build with it, so anything
// the lobby does that the portal would block shows up here.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'"

export default defineConfig({
  base: './',
  server: { fs: { allow: ['../..'] } },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
})
