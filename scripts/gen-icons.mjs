import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const iconDir = join(publicDir, 'icons')
mkdirSync(iconDir, { recursive: true })

const NAVY = [11, 37, 69, 255]
const YELLOW = [242, 183, 5, 255]
const CREAM = [247, 244, 236, 255]

const FONT = {
  0: ['11111', '10001', '10001', '10001', '10001', '10001', '11111'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['11111', '00001', '00001', '11111', '10000', '10000', '11111'],
  3: ['11111', '00001', '00001', '01111', '00001', '00001', '11111'],
  4: ['10001', '10001', '10001', '11111', '00001', '00001', '00001'],
  5: ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
  6: ['11111', '10000', '10000', '11111', '10001', '10001', '11111'],
  7: ['11111', '00001', '00001', '00010', '00100', '01000', '01000'],
  8: ['11111', '10001', '10001', '11111', '10001', '10001', '11111'],
  9: ['11111', '10001', '10001', '11111', '00001', '00001', '11111'],
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(
      raw,
      y * (size * 4 + 1) + 1,
    )
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function layout(size, scaleOverride) {
  const scale = scaleOverride ?? Math.max(3, Math.round(size / 46))
  const digitW = 5 * scale
  const digitH = 7 * scale
  const gap = Math.max(2, Math.round(scale * 1.2))
  const blockW = 5 * digitW + 4 * gap
  const blockH = digitH
  const pad = Math.round(scale * 4)
  const plateW = blockW + pad * 2
  const plateH = blockH + pad * 2
  const px0 = (size - plateW) / 2
  const py0 = (size - plateH) / 2
  const dx0 = px0 + pad
  const dy0 = py0 + pad
  return { scale, digitW, digitH, gap, blockW, blockH, px0, py0, plateW, plateH, dx0, dy0 }
}

function drawDigit(rgba, size, digit, x, y, scale, color) {
  // Typed-array indexes must be integers: the layout offsets can be
  // fractional (e.g. plate width is odd at 512px), and a fractional index
  // silently drops the write — which used to make the digits vanish on the
  // 512px icons. Round the origin first.
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const rows = FONT[digit]
  for (let r = 0; r < 7; r++) {
    const row = rows[r]
    for (let c = 0; c < 5; c++) {
      if (row[c] !== '1') continue
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const X = x0 + c * scale + px
          const Y = y0 + r * scale + py
          if (X >= size || Y >= size) continue
          const i = (Y * size + X) * 4
          rgba[i] = color[0]
          rgba[i + 1] = color[1]
          rgba[i + 2] = color[2]
          rgba[i + 3] = color[3]
        }
      }
    }
  }
}

/** Paint the yellow/cream bus-stop plate (with navy digits) centred in the canvas. */
function fillPlate(rgba, size, L) {
  const border = Math.max(2, Math.round(size * 0.012))
  const px1 = L.px0 + L.plateW
  const py1 = L.py0 + L.plateH
  const rOuter = Math.round(L.plateH * 0.18)
  const rInner = Math.round(L.plateH * 0.16)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inPlate = inRoundedRect(x, y, L.px0, L.py0, px1, py1, rOuter)
      const inInner = inRoundedRect(x, y, L.px0 + border, L.py0 + border, px1 - border, py1 - border, rInner)
      if (inPlate) {
        const col = inInner ? CREAM : YELLOW
        rgba[i] = col[0]
        rgba[i + 1] = col[1]
        rgba[i + 2] = col[2]
        rgba[i + 3] = col[3]
      }
    }
  }
  const digits = '83111'
  for (let d = 0; d < 5; d++) {
    const dx = L.dx0 + d * (L.digitW + L.gap)
    drawDigit(rgba, size, digits[d], dx, L.dy0, L.scale, NAVY)
  }
}

/**
 * Maskable icons get zoomed by Android to fill the launcher's mask (circle /
 * squircle / rounded square), then the mask clips everything outside the
 * central safe zone (~61-66% diameter). So: shrink the artwork to sit inside
 * that zone, and use a full-bleed opaque background — transparent corners
 * would show as holes on squircle/rounded-square masks.
 */
function layoutMaskable(size) {
  // Content sized so the plate stays inside the safe circle: for 512 this
  // yields a ~52% wide plate (digits ~41%), well within ~61%.
  const scale = Math.max(4, Math.round(size / 73))
  return layout(size, scale)
}

function makeMaskableIcon(size) {
  const rgba = new Uint8Array(size * size * 4)
  // Full-bleed navy background (no rounded corners, no transparency).
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = NAVY[0]
    rgba[p + 1] = NAVY[1]
    rgba[p + 2] = NAVY[2]
    rgba[p + 3] = NAVY[3]
  }
  fillPlate(rgba, size, layoutMaskable(size))
  return encodePNG(size, rgba)
}

/**
 * Android 13+ themed icons use a single-colour silhouette (system tints it).
 * Transparent background + just the digits keeps it recognisable and simple.
 */
function makeMonochromeIcon(size) {
  const rgba = new Uint8Array(size * size * 4) // transparent background
  const L = layoutMaskable(size)
  const digits = '83111'
  for (let d = 0; d < 5; d++) {
    const dx = L.dx0 + d * (L.digitW + L.gap)
    drawDigit(rgba, size, digits[d], dx, L.dy0, L.scale, NAVY)
  }
  return encodePNG(size, rgba)
}

function makeIcon(size) {
  const rgba = new Uint8Array(size * size * 4)
  const L = layout(size)
  const radius = Math.round(size * 0.2)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (inRoundedRect(x, y, 0, 0, size - 1, size - 1, radius)) {
        rgba[i] = NAVY[0]
        rgba[i + 1] = NAVY[1]
        rgba[i + 2] = NAVY[2]
        rgba[i + 3] = NAVY[3]
      }
    }
  }

  fillPlate(rgba, size, L)
  return encodePNG(size, rgba)
}

function makeSvg() {
  const size = 128
  const L = layout(size)
  const radius = Math.round(size * 0.2)
  const border = Math.max(1, Math.round(size * 0.012))
  const rOuter = Math.round(L.plateH * 0.18)
  const rInner = Math.round(L.plateH * 0.16)
  const rects = []
  const digits = '83111'

  rects.push(`<rect width="${size}" height="${size}" rx="${radius}" fill="#0b2545"/>`)
  rects.push(
    `<rect x="${L.px0}" y="${L.py0}" width="${L.plateW}" height="${L.plateH}" rx="${rOuter}" fill="#f2b705"/>`,
  )
  rects.push(
    `<rect x="${L.px0 + border}" y="${L.py0 + border}" width="${L.plateW - border * 2}" height="${L.plateH - border * 2}" rx="${rInner}" fill="#f7f4ec"/>`,
  )
  for (let d = 0; d < 5; d++) {
    const rows = FONT[digits[d]]
    const dx = L.dx0 + d * (L.digitW + L.gap)
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] === '1') {
          rects.push(`<rect x="${dx + c * L.scale}" y="${L.dy0 + r * L.scale}" width="${L.scale}" height="${L.scale}" fill="#0b2545"/>`)
        }
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${rects.join('')}</svg>\n`
}

writeFileSync(join(iconDir, 'icon-192.png'), makeIcon(192))
writeFileSync(join(iconDir, 'icon-512.png'), makeIcon(512))
writeFileSync(join(iconDir, 'icon-512-maskable.png'), makeMaskableIcon(512))
writeFileSync(join(iconDir, 'icon-512-monochrome.png'), makeMonochromeIcon(512))
writeFileSync(join(iconDir, 'apple-touch-icon.png'), makeIcon(180))
writeFileSync(join(publicDir, 'favicon.svg'), makeSvg())
console.log('Generated icons (192/512/maskable/monochrome/apple-touch) and favicon.svg')
