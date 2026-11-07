import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/** Fills the service worker's build id and file list. Hashed file names change whenever content does, so the id changes with every real release. */
function serviceWorkerStamp(): Plugin {
  let outDir = 'dist'
  return {
    name: 'tryline-sw-stamp',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    writeBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort().map((f) => `/${f}`)
      const urls = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', ...files]
      const id = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12)
      const path = join(outDir, 'sw.js')
      writeFileSync(path, readFileSync(path, 'utf8').replace("'__BUILD_ID__'", `'${id}'`).replace("'__PRECACHE__'", `'${JSON.stringify(urls)}'`))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerStamp()],
})
