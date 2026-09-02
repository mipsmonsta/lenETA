#!/usr/bin/env node
/**
 * Vendor the Tesseract.js runtime assets into public/models/tesseract/ so the
 * PWA stays fully offline and everything is served under the app base path.
 *
 *   - worker.min.js               (tesseract.js worker bootstrap)
 *   - tesseract-core-simd-lstm.wasm.js  (self-contained core: SIMD + LSTM)
 *   - tesseract-core-lstm.wasm.js       (fallback core for non-SIMD devices)
 *   - eng.traineddata.gz          (tessdata_fast: ~2 MB, LSTM integer model)
 *
 * The tesseract-core-*.wasm.js files embed their WASM as base64, so a single
 * file per flavor is enough (no sibling .wasm is fetched at runtime).
 *
 * Run with: npm run vendor:ocr
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const TESSDATA_URL =
  'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz'

const COPIES = [
  // [from (relative to ROOT/node_modules), to (relative to ROOT/public)]
  [
    'node_modules/tesseract.js/dist/worker.min.js',
    'public/models/tesseract/worker.min.js',
  ],
  [
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'public/models/tesseract/tesseract-core-simd-lstm.wasm.js',
  ],
  [
    'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'public/models/tesseract/tesseract-core-lstm.wasm.js',
  ],
]

const destDir = join(ROOT, 'public', 'models', 'tesseract')
mkdirSync(destDir, { recursive: true })

for (const [from, to] of COPIES) {
  const src = join(ROOT, from)
  if (!existsSync(src)) {
    console.error(`Missing ${from} — did you run "npm install tesseract.js"?`)
    process.exit(1)
  }
  copyFileSync(src, join(ROOT, to))
  const kb = Math.round(readFileSync(src).length / 1024)
  console.log(`vendored ${to} (${kb} KB)`)
}

// English LSTM traineddata (fast = integer, LSTM-only). Reuse when present so
// rebuilds work offline once downloaded.
const langPath = join(destDir, 'eng.traineddata.gz')
if (!existsSync(langPath)) {
  console.log(`Downloading ${TESSDATA_URL} …`)
  const res = await fetch(TESSDATA_URL)
  if (!res.ok) {
    console.error(
      `Failed to download eng.traineddata.gz (HTTP ${res.status}). ` +
        'Re-run with the file already in place, or fix the network.',
    )
    process.exit(1)
  }
  writeFileSync(langPath, Buffer.from(await res.arrayBuffer()))
  console.log(`vendored public/models/tesseract/eng.traineddata.gz`)
} else {
  console.log('eng.traineddata.gz already present — reusing')
}
console.log('OCR assets vendored.')
