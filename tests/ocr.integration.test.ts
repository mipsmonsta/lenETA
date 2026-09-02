import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { createWorker, OEM, PSM } from 'tesseract.js'
import { extractCode } from '../src/lib/ocrEngine'

/**
 * Optional end-to-end smoke test that runs the real Tesseract.js engine (in
 * Node) against a rendered 5-digit strip, using the same vendored language
 * data and settings as the app.
 *
 * Opt in with: npm run test:ocr
 *
 * It needs network-free local assets (already vendored into public/models/
 * by `npm run vendor:ocr`) and a TrueType font for rendering the test strip.
 */
const RUN = process.env.RUN_OCR_TESTS === '1'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
]

describe.skipIf(!RUN)('tesseract.js OCR (real engine)', () => {
  it('reads a rendered 5-digit strip end to end', async () => {
    const fontPath = FONT_CANDIDATES.find((f) => existsSync(f))
    if (fontPath) {
      GlobalFonts.registerFromPath(fontPath, 'TestSans')
    } else {
      throw new Error('No TrueType font found to render the test strip')
    }

    // Render "04229" the way a bus-pole plaque looks: bold, dark-on-light.
    const text = '04229'
    const canvas = createCanvas(420, 120)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 88px TestSans'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6)

    const langPath = join(ROOT, 'public', 'models', 'tesseract')
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      langPath,
      gzip: true,
      cacheMethod: 'none',
    })
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      })
      const { data } = await worker.recognize(await canvas.encode('png'))
      expect(extractCode(data.text)).toBe(text)
    } finally {
      await worker.terminate()
    }
  }, 120_000)
})
