import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { forward, modelFromJson, predict } from '../src/lib/digitcnn'

const modelRaw = JSON.parse(
  readFileSync(new URL('../public/models/digit_cnn.json', import.meta.url), 'utf8'),
)
const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/digitCnnVectors.json', import.meta.url), 'utf8'),
)

const model = modelFromJson(modelRaw)

function argmax(p: Float32Array): number {
  let best = 0
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i
  return best
}

describe('digit CNN inference', () => {
  it('reproduces the training logits within tolerance', () => {
    for (const s of fixtures.samples) {
      const input = new Float32Array(s.input.flat())
      const logits = forward(model, input)
      for (let i = 0; i < 10; i++) {
        expect(Math.abs(logits[i] - s.logits[i])).toBeLessThan(1e-2)
      }
    }
  })

  it('classifies every fixture digit correctly', () => {
    for (const s of fixtures.samples) {
      const input = new Float32Array(s.input.flat())
      const p = predict(model, input)
      expect(argmax(p)).toBe(s.label)
      expect(p[s.label]).toBeGreaterThan(0.5)
    }
  })
})
