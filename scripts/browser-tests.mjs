import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const [mode, ...args] = process.argv.slice(2)
if (!['install', 'test'].includes(mode)) throw new Error('Expected install or test')
const command = mode === 'install' ? ['install', ...args, 'chromium'] : ['test', ...args]
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), ...command], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(root, 'node_modules/.cache/ms-playwright') },
})
if (result.error) { console.error(result.error.message); process.exitCode = 1 }
else process.exitCode = result.status ?? 1
