import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const { name } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

await Promise.all([
  build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
  }),
  build({
    entryPoints: ['src/client.ts'],
    outfile: 'dist/client.js',
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    external: ['react'],
    banner: {
      js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {\nconst module = { exports: {} };\nconst exports = module.exports;`,
    },
    footer: { js: 'return module.exports;\n} });' },
  }),
])
