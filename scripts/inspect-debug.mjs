#!/usr/bin/env node
/**
 * Inspect a saved lenETA debug frame.
 *
 * From the phone (debug build), tap "Save frame" in the OCR debug panel while
 * holding a bus stop visible in the guide box. It downloads a
 * `leneta-debug-<ts>.json`. Run:
 *
 *   node scripts/inspect-debug.mjs path/to/leneta-debug-*.json
 *
 * The frame stores the *exact raw crop pixels* the Tesseract.js engine saw
 * (cropDataUrl) plus its raw output text, so you can replay and judge
 * whether a miss was an image-quality problem (blur/glare/small digits) or a
 * genuine OCR mistake.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/inspect-debug.mjs <leneta-debug-*.json>')
  process.exit(1)
}

const d = JSON.parse(readFileSync(file, 'utf8'))

console.log('Saved debug frame')
console.log('─────────────────')
console.log('  saved at     :', d.savedAt ?? '—')
console.log('  reading      :', d.reading || '—')
console.log('  code (5 digs):', d.code ?? '—')
console.log('  confidence   :', d.confidence ? `${Math.round(d.confidence * 100)}%` : '—')
console.log('  raw OCR text :', JSON.stringify(d.rawText ?? '—'))

if (d.cropDataUrl) {
  const png = Buffer.from(d.cropDataUrl.split(',')[1] || '', 'base64')
  if (!png.length) {
    console.error('  cropDataUrl present but could not be decoded.')
    process.exit(1)
  }
  const out = file.replace(/\.json$/, '.png')
  writeFileSync(out, png)
  console.log(`\nWrote the raw OCR crop: ${out}`)

  // A tiny HTML page embedding the crop + the readings for quick review.
  const html = `<!doctype html><meta charset="utf-8"><title>lenETA debug</title>
<style>body{font:14px system-ui;background:#0b2545;color:#eee;padding:16px}
img{display:block;max-width:min(90vw,760px);border:1px solid #555;background:#fff}
code{background:#14294d;padding:2px 6px;border-radius:4px}</style>
<img src="${d.cropDataUrl}" alt="OCR crop">
<ul>
<li>saved: ${d.savedAt ?? '—'}</li>
<li>reading: <code>${d.reading || '—'}</code></li>
<li>code (5 digits): <code>${d.code ?? '—'}</code></li>
<li>confidence: <code>${d.confidence ? Math.round(d.confidence * 100) + '%' : '—'}</code></li>
<li>raw OCR text: <code>${(d.rawText ?? '').replace(/</g, '&lt;') || '—'}</code></li>
</ul>`
  const htmlOut = file.replace(/\.json$/, '.html')
  writeFileSync(htmlOut, html)
  console.log(`Wrote viewer: ${htmlOut}`)
  console.log('\nOpen the PNG or HTML to eyeball what the OCR engine actually saw.')
} else if (Array.isArray(d.rle)) {
  console.log(
    '\nThis looks like a pre-OCR-engine debug frame (binarized RLE from the old CNN ' +
      'pipeline). Collect a new frame from the Tesseract.js build for a crop image.',
  )
} else {
  console.log('\nNo crop image in this frame.')
}
