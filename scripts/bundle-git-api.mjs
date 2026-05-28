/**
 * Bundles server/git-api.mjs (Express + parsers) for the Wails desktop runtime.
 */
import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outfile = path.join(root, 'internal', 'apiserver', 'git-api-bundle.mjs')

await esbuild.build({
  entryPoints: [path.join(root, 'server', 'git-api.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  loader: { '.ts': 'ts' },
  logLevel: 'info',
})
