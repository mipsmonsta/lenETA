import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { otsuThreshold } from '../src/lib/preprocessing'
import { modelFromJson } from '../src/lib/digitcnn'
import { normalizeCell, segmentDigits, selectTextBand } from '../src/lib/segment'
import { recognizeDigits } from '../src/lib/ocr'
import type { BinaryImage } from '../src/lib/preprocessing'

const modelRaw = JSON.parse(
  readFileSync(new URL('../public/models/digit_cnn.json', import.meta.url), 'utf8'),
)
const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/digitCnnVectors.json', import.meta.url), 'utf8'),
)
const strips = JSON.parse(
  readFileSync(new URL('./fixtures/stripFixtures.json', import.meta.url), 'utf8'),
)

const model = modelFromJson(modelRaw)

function fixtureInput(label: number): number[][] {
  const s = fixtures.samples.find((x: { label: number }) => x.label === label)
  if (!s) throw new Error(`no fixture for digit ${label}`)
  return s.input as number[][]
}

/** Place real digit images (from the training fixtures) side by side. */
function makeStrip(digits: number[], scale = 4, gap = 6): BinaryImage {
  const cell = 28 * scale
  const width = digits.length * cell + gap * (digits.length + 1)
  const height = cell + 2
  const data = new Uint8Array(width * height)
  let x0 = gap
  for (const d of digits) {
    const src = fixtureInput(d)
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        if (src[y][x] > 0) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              data[(y * scale + dy) * width + (x0 + x * scale + dx)] = 1
            }
          }
        }
      }
    }
    x0 += cell + gap
  }
  return { data, width, height }
}

describe('segmentation', () => {
  it('selects a single text band in a digit strip', () => {
    const strip = makeStrip([4, 4, 0, 0, 9])
    const band = selectTextBand(strip)
    expect(band).not.toBeNull()
    expect(band!.y0).toBeGreaterThanOrEqual(0)
    expect(band!.y1).toBeLessThanOrEqual(strip.height)
    expect(band!.y1).toBeGreaterThan(band!.y0)
  })

  it('segments the strip into exactly five ordered digits', () => {
    const strip = makeStrip([4, 4, 0, 0, 9])
    const segs = segmentDigits(strip)
    expect(segs).not.toBeNull()
    expect(segs!.length).toBe(5)
    for (let i = 1; i < segs!.length; i++) {
      expect(segs![i].x).toBeGreaterThan(segs![i - 1].x)
    }
  })

  it('rejects an empty image', () => {
    const strip: BinaryImage = { data: new Uint8Array(100), width: 10, height: 10 }
    expect(segmentDigits(strip)).toBeNull()
  })

  it('prefers a tall digit row over a thin 1px noise line', () => {
    // Build a canvas with a 1px-tall noise line across the top and a real
    // (tall) digit strip lower down.
    const strip = makeStrip([4, 4, 0, 0, 9])
    const width = strip.width
    const noiseTop = 3
    const digitTop = 40
    const height = digitTop + strip.height + 20
    const data = new Uint8Array(width * height)

    // Copy the digit strip into [digitTop, ...)
    for (let y = 0; y < strip.height; y++) {
      for (let x = 0; x < width; x++) {
        if (strip.data[y * width + x]) data[(digitTop + y) * width + x] = 1
      }
    }
    // Add a thin noise line spanning most of the width at noiseTop.
    for (let x = 0; x < width; x += 3) data[noiseTop * width + x] = 1

    const band = selectTextBand({ data, width, height })
    expect(band).not.toBeNull()
    // Expect the chosen band to be over the tall digit strip region (well
    // below the 1px noise line at noiseTop=3), not the noise row itself.
    expect(band!.y1).toBeGreaterThan(digitTop)
    expect(band!.y0).toBeGreaterThan(noiseTop + 5)
    expect(band!.y1 - band!.y0).toBeGreaterThan(20)

    const segs = segmentDigits({ data, width, height })
    expect(segs).not.toBeNull()
    expect(segs!.length).toBe(5)
  })
})

describe('segmentation + CNN end to end (real rendered rows)', () => {
  for (const strip of strips) {
    it(`reads ${strip.expected}`, () => {
      const bin: BinaryImage = {
        data: Uint8Array.from(strip.data.flat()),
        width: strip.width,
        height: strip.height,
      }
      const result = recognizeDigits(model, bin)
      expect(result?.digits).toBe(strip.expected)
      expect(result!.confidence).toBeGreaterThan(0.5)
    })
  }

  it('normalizes a digit without destroying it', () => {
    const src = fixtureInput(9).flat()
    const bin: BinaryImage = { data: new Uint8Array(src), width: 28, height: 28 }
    const cell = normalizeCell(bin, 0, 0, 28, 28)
    expect(cell).not.toBeNull()
    expect(cell!.some((v) => v > 0)).toBe(true)
  })
})

describe('otsu binarization threshold', () => {
  it('splits a clean bimodal crop near the midpoint of the two classes', () => {
    // Two clean classes: dark digits ~40, bright background ~210.
    const gray = new Uint8Array(10000)
    for (let i = 0; i < 2000; i++) gray[i] = 40
    for (let i = 2000; i < 10000; i++) gray[i] = 210
    const th = otsuThreshold(gray, gray.length)
    // Otsu lands on the separator; with `<=`, th=40 must still classify the
    // dark class and never the light one.
    expect(th).toBeGreaterThanOrEqual(40)
    expect(th).toBeLessThan(210)
    let ink = 0
    for (let i = 0; i < 2000; i++) if (gray[i] <= th) ink++
    expect(ink).toBe(2000)
  })

  it('separates uniform foreground from background even when small', () => {
    const gray = new Uint8Array(4000)
    for (let i = 0; i < 400; i++) gray[i] = 30
    for (let i = 400; i < 4000; i++) gray[i] = 180
    const th = otsuThreshold(gray, gray.length)
    expect(th).toBeGreaterThanOrEqual(30)
    expect(th).toBeLessThan(180)
  })
})
