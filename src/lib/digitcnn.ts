/**
 * Minimal hand-rolled CNN inference for a 28x28 grayscale digit classifier.
 * The model (public/models/digit_cnn.json) is trained offline by
 * scripts/train_digit_cnn.py; its weights are int8-quantized per layer.
 *
 * Architecture (all padding "valid", max-pool 2x2 stride 2):
 *   conv(3x3, 16) -> relu -> pool -> conv(3x3, 32) -> relu -> pool
 *   -> dense(128) -> relu -> dense(10) -> softmax
 */

export interface DigitCnnModel {
  inputSize: number
  layers: Layer[]
}

type Layer =
  | { type: 'conv'; kernel: number; in: number; out: number; w: Float32Array; b: Float32Array }
  | { type: 'pool' }
  | { type: 'dense'; in: number; out: number; w: Float32Array; b: Float32Array }

export async function loadModel(): Promise<DigitCnnModel> {
  const url = `${import.meta.env.BASE_URL}models/digit_cnn.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load digit model (HTTP ${res.status})`)
  }
  return modelFromJson(await res.json())
}

interface RawLayer {
  type: 'conv' | 'pool' | 'dense'
  kernel?: number
  in: number
  out: number
  w?: number[][]
  wScale?: number
  wZero?: number
  b?: number[]
}

export function modelFromJson(raw: {
  version: number
  inputSize: number
  layers: RawLayer[]
}): DigitCnnModel {
  if (raw.version !== 1) {
    throw new Error(`Unsupported digit model version ${raw.version}`)
  }
  const layers: Layer[] = raw.layers.map((l) => {
    if (l.type === 'pool') return { type: 'pool' } as Layer
    const flat = (l.w ?? []).flat()
    const w = new Float32Array(flat.length)
    const zero = l.wZero ?? 0
    const scale = l.wScale ?? 1
    for (let i = 0; i < flat.length; i++) w[i] = (flat[i] - zero) * scale
    return {
      type: l.type,
      kernel: l.kernel ?? 3,
      in: l.type === 'dense' ? Math.round(flat.length / l.out) : l.in,
      out: l.out,
      w,
      b: new Float32Array(l.b ?? []),
    }
  })
  return { inputSize: raw.inputSize, layers }
}

/** Classify one 28x28 cell (0..1, 1 = ink) into a softmax distribution. */
export function predict(model: DigitCnnModel, input: Float32Array): Float32Array {
  return softmax(forward(model, input))
}

/** Raw pre-softmax logits for one 28x28 cell. */
export function forward(
  model: DigitCnnModel,
  input: Float32Array,
): Float32Array {
  const n = model.inputSize
  const conv1 = model.layers[0] as Extract<Layer, { type: 'conv' }>
  const conv2 = model.layers[2] as Extract<Layer, { type: 'conv' }>
  const fc1 = model.layers[4] as Extract<Layer, { type: 'dense' }>
  const fc2 = model.layers[5] as Extract<Layer, { type: 'dense' }>

  const c1 = conv(input, n, n, 1, conv1)
  const p1 = pool(c1, 26, 26, 16)
  const c2 = conv(p1, 13, 13, 16, conv2)
  const p2 = pool(c2, 11, 11, 32)
  const h1 = dense(p2, fc1)
  return dense(h1, fc2, false)
}

function conv(
  x: Float32Array,
  H: number,
  W: number,
  C: number,
  layer: { kernel: number; out: number; w: Float32Array; b: Float32Array },
): Float32Array {
  const kh = layer.kernel
  const kw = layer.kernel
  const outC = layer.out
  const K = kh * kw * C
  const oh = H - kh + 1
  const ow = W - kw + 1
  const M = oh * ow
  const out = new Float32Array(M * outC)
  const col = new Float32Array(K)
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      let p = 0
      for (let ky = 0; ky < kh; ky++) {
        const iy = oy + ky
        for (let kx = 0; kx < kw; kx++) {
          const ix = ox + kx
          for (let c = 0; c < C; c++) col[p++] = x[(iy * W + ix) * C + c]
        }
      }
      const m = oy * ow + ox
      for (let o = 0; o < outC; o++) {
        let acc = layer.b[o]
        const wo = o * K
        for (let k = 0; k < K; k++) acc += col[k] * layer.w[wo + k]
        out[m * outC + o] = acc > 0 ? acc : 0
      }
    }
  }
  return out
}

function pool(x: Float32Array, H: number, W: number, C: number): Float32Array {
  const oh = H >> 1
  const ow = W >> 1
  const out = new Float32Array(oh * ow * C)
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      for (let c = 0; c < C; c++) {
        let best = -Infinity
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const v = x[((oy * 2 + dy) * W + (ox * 2 + dx)) * C + c]
            if (v > best) best = v
          }
        }
        out[(oy * ow + ox) * C + c] = best
      }
    }
  }
  return out
}

function dense(
  x: Float32Array,
  layer: { in: number; out: number; w: Float32Array; b: Float32Array },
  relu = true,
): Float32Array {
  const n = layer.in
  const m = layer.out
  const out = new Float32Array(m)
  for (let j = 0; j < m; j++) {
    let acc = layer.b[j]
    for (let i = 0; i < n; i++) acc += x[i] * layer.w[i * m + j]
    out[j] = relu && acc < 0 ? 0 : acc
  }
  return out
}

function softmax(x: Float32Array): Float32Array {
  let max = -Infinity
  for (let i = 0; i < x.length; i++) if (x[i] > max) max = x[i]
  let sum = 0
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) {
    out[i] = Math.exp(x[i] - max)
    sum += out[i]
  }
  for (let i = 0; i < x.length; i++) out[i] /= sum
  return out
}
