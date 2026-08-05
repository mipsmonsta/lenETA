import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const outFile = join(publicDir, 'stops.json')
const url = 'https://cdn.jsdelivr.net/gh/cheeaun/sgbusdata@master/data/v1/stops.min.json'

const res = await fetch(url)
if (!res.ok) {
  console.warn(`Download failed (HTTP ${res.status}); keeping existing stops.json if present.`)
  if (!existsSync(outFile)) {
    console.error('No existing stops.json found; run with network access.')
    process.exit(1)
  }
  process.exit(0)
}

const raw = await res.json()
const entries = Object.entries(raw)
const stops = {}
for (const [code, value] of entries) {
  const [lng, lat, name, road] = value
  stops[code] = [lng, lat, name, road]
}

mkdirSync(publicDir, { recursive: true })
writeFileSync(outFile, JSON.stringify({ updatedAt: new Date().toISOString(), stops }))
console.log(`Wrote ${outFile} (${entries.length} stops, ${(Buffer.byteLength(JSON.stringify({ stops })) / 1024).toFixed(0)} KB)`)
