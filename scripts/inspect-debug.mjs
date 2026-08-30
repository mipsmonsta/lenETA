#!/usr/bin/env node
/**
 * Inspect a saved lenETA debug frame.
 *
 * From the phone (dev build), tap "Save frame" in the OCR debug panel while
 * holding a bus stop visible in the guide box. It downloads a
 * `leneta-debug-<ts>.json`. Run:
 *
 *   node scripts/inspect-debug.mjs path/to/leneta-debug-*.json
 *
 * This decodes the row-run-length-encoded binarized crop, writes an SVG
 * (ASCII fallback to stdout) so you can eyeball the exact pixels and digit
 * boxes the CNN/segmenter saw, and prints the diagnostic + per-digit
 * confidence. Use it to distinguish *classification* failures from
 * *segmentation* failures — the two very different root causes.
 */

import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/inspect-debug.mjs <leneta-debug-*.json>')
  process.exit(1)
}

const d = JSON.parse(readFileSync(file, 'utf8'))

function decodeRle(rle, w, h, pxValue = v => (v === 1 ? 0 : 255)) {
  // rle is [value, run, value, run, ...] over all rows.
  const out = Buffer.from(new Float32Array(w * h).map(() => 255)) // background white
  let p = 0
  const data = new Uint8Array(w * h)
  for (let k = 0; k < rle.length; k += 2) {
    const val = rle[k]
    const run = rle[k + 1]
    for (let n = 0; n < run; n++) {
      data[p++] = val
    }
  }
  for (let i = 0; i < data.length; i++) out[i] = pxValue(data[i])
  return { data: out, width: w, height: h }
}

function renderSvg(d, bin) {
  const w = bin.width
  const h = bin.height
  const px = Math.ceil(bin.pixel) || 1
  const W = w * px
  const H = h * px
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  s += `<rect width="${W}" height="${H}" fill="white"/>`
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bin.data[y * w + x] === 0) { // ink drawn black
        s += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="black"/>`
      }
    }
  }
  // digit boxes (green)
  for (const b of d.boxes ?? []) {
    s += `<rect x="${b.x * px}" y="${b.y * px}" width="${b.w * px}" height="${b.h * px}" fill="none" stroke="lime" stroke-width="${Math.max(1, px)}"/>`
  }
  // fail band (red) when no segments
  if (!d.boxes && d.diagnostic?.segmentCount != null) {
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="red" stroke-width="${Math.max(2, px)}"/>`
  }
  s += `</svg>`
  return s
}

const px = Math.max(1, Math.round(32 / (d.binWidth || 1)))
const bin = decodeRle(d.rle, d.binWidth, d.binHeight)
bin.pixel = px

console.log('Saved debug frame')
console.log('─────────────────')
console.log('  reading       :', d.reading || '—')
console.log('  mean conf     :', d.confidence ? `${Math.round(d.confidence * 100)}%` : '—')
console.log('  per-digit conf:', d.perDigitConf?.length ? d.perDigitConf.map(p => `${Math.round(p * 100)}%`).join('  ') : '—')
console.log('  segments      :', d.diagnostic?.segmentCount ?? '—', '/ 5',
  d.diagnostic?.segmentCount === 5 ? '(OK)' : '')
console.log('  fail stage    :', d.diagnostic?.failReason ?? '—')
console.log('  crop size     :', `${d.binWidth}×${d.binHeight}`)
console.log(
  '  verdicy       :',
  d.diagnostic?.segmentCount === 5
    ? 'classification problem (CNN misread)'
    : 'segmentation problem (could not split into 5 digits)',
)

// Render the normalized 28x28 cells the CNN actually received (if saved).
if (d.cells && d.cells.length === 5) {
  console.log('\nCNN inputs (normalized 28x28 cells):')
  for (let yy = 0; yy < 28; yy++) {
    let row = ''
    for (let i = 0; i < 5; i++) {
      let line = ''
      for (let xx = 0; xx < 28; xx++) {
        const v = (d.cells[i][yy * 28 + xx] || 0) / 255
        line += v > 0.4 ? '█' : (v > 0.15 ? '▒' : ' ')
      }
      row += line + '  '
    }
    console.log(row)
  }
}

const svgPath = file.replace(/\.json$/, '.svg')
import('node:fs/promises').then(async ({ writeFile }) => {
  await writeFile(svgPath, renderSvg(d, bin))
  console.log('\nWrote visualization:', svgPath)

  // Also emit an ASCII downscale for terminal viewing.
  const w = bin.width
  const h = bin.height
  const cols = 56
  const scale = Math.max(1, Math.ceil(w / cols))
  console.log('\nDownscaled ASCII (each char ≈', scale, 'px wide):')
  for (let y = 0; y < h; y += Math.max(1, scale)) {
    let line = ''
    for (let x = 0; x < w; x += scale) {
      line += bin.data[y * w + x] === 0 ? '██' : '  '
    }
    console.log(line)
  }
})
