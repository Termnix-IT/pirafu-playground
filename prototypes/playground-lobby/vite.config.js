import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The lobby reuses the 3D space of prototypes/playground-3d without copying its source: src/stage.js imports
// that prototype's sky.js and room.js. Both sides must share one copy of three.js, so every "three" import is
// pointed at the copy installed there. Vite and the fonts come from the repository root.
const here = path.dirname(fileURLToPath(import.meta.url))
const three = path.resolve(here, '../playground-3d/node_modules/three').replaceAll('\\', '/')

// The production portal's policy (public/_headers). `npm run preview` serves the build with it, so anything
// the lobby does that the portal would block shows up here.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'"

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^three$/, replacement: `${three}/build/three.module.js` },
      { find: /^three\/addons\/(.*)$/, replacement: `${three}/examples/jsm/$1` },
    ],
  },
  server: { fs: { allow: ['../..'] } },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
})
