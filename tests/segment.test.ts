import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
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
