# lenETA

Scan the 5-digit bus stop code on a Singapore bus pole with your phone camera
to see real-time bus arrivals for every service at that stop.

A fully client-side PWA: React + Vite + TypeScript, deployed as static files on
GitHub Pages. No backend, no API keys.

## Features

- **Camera scan** — point at the bus stop code; the app crops the guide box and
  reads the line of digits with an **on-device Tesseract OCR engine**
  (bundled WASM + LSTM language data, precached, no network needed after first
  load).
- **Manual entry** — numeric keypad fallback when the camera or OCR fails.
- **Live arrivals** — real-time ETAs via the ArriveLah proxy of LTA DataMall
  (free, CORS-enabled, refreshed every 30s).
- **Stop info** — validates the code and shows the stop name + road from a
  bundled dataset of ~5,200 SG bus stops.
- **Favourites** — save stops to check them quickly from the home screen.
- **Offline-friendly** — the app shell, stop dataset, last arrivals, and the
  full OCR engine are cached by the service worker.

## Development

Requires Node.js 20+ (Node 24 recommended).

```bash
npm install
npm run vendor:ocr    # copy the Tesseract runtime into public/models/tesseract/
npm run dev           # local dev server (http://localhost:5173/lenETA/)
```

Useful scripts:

```bash
npm run stops        # refresh public/stops.json from cheeaun/sgbusdata
npm run vendor:ocr   # (re-)vendor the Tesseract engine assets locally
npm run test         # unit tests (digit extraction helpers)
npm run test:ocr     # optional: real Tesseract end-to-end test in Node
npm run build        # typecheck + build to dist/ (also runs vendor:ocr)
npm run preview      # serve the production build
npm run lint         # oxlint
npm run inspect:ocr  # inspect a saved debug frame (see below)
```

`npm run build` re-runs the vendor step automatically; the vendored files are
also committed to `public/models/tesseract/` so CI and offline builds don't
need a download. The language data download only happens once, when the file is
first missing.

### Debugging OCR on a real device

The `dev` build shows an **OCR debug panel** on the scan screen. It displays
the current 5-digit reading, the engine confidence, and Tesseract's **raw
output text** so you can tell at a glance whether a miss is an image-quality
problem (blur, glare, digits too small) or a genuine misread of a clean crop.

To capture a frame for offline analysis tap **Save frame** while holding a
stop in the guide box. It downloads a `leneta-debug-<ts>.json` containing the
*exact* raw crop the engine saw plus its text output, then:

```bash
npm run inspect:ocr -- path/to/leneta-debug-12345.json
```

This writes the crop as a PNG (plus an HTML viewer) with the recorded reading,
raw OCR text, and confidence. Collect several frames of a real bus-stop pole —
that tells you whether to adjust framing (bigger/closer, avoid glare) or tune
the engine settings in `src/lib/ocrEngine.ts` (page-segmentation mode, crop
upscaling, confidence gate in `src/hooks/useOcr.ts`).

`vite.config.ts` uses `base: '/lenETA/'` so the app works under a GitHub Pages
project URL (`https://<user>.github.io/lenETA/`). Override with the
`BASE_PATH` env var if you host elsewhere.

## Deployment (GitHub Pages)

1. Create a GitHub repository named **`lenETA`** (must match the base path).
2. Push this folder to the `main` branch.
3. Enable **Settings → Pages → Build and deployment → GitHub Actions**. The
   included workflow (`.github/workflows/deploy.yml`) builds and deploys
   automatically on every push to `main`.

The app will be live at `https://<user>.github.io/lenETA/`.

### Testing on a real phone

Camera access requires HTTPS and a user gesture. Use the deployed Pages URL on
your phone (Safari or Chrome), then **Add to Home Screen** to install it as a
PWA.

## How it works

- **Scan**: `getUserMedia` starts the rear camera. Roughly every 0.35s the
  current frame is cropped to the on-screen guide box (a short strip that hugs
  the code line), upscaled when the digits are small, and handed to a
  Tesseract.js worker configured for **a single line of digits only**
  (`tessedit_char_whitelist=0123456789`, page-segmentation mode 7). The raw
  output is filtered down to digits; a reading is accepted only when it is
  exactly 5 digits, passes a confidence gate, appears in at least 2 of the last
  4 frames, and validates against the stop dataset. The engine's worker script,
  WASM core, and language data are served same-origin from the Workbox
  precache; the worker's `importScripts` and fetches are intercepted by the
  service worker once the page is controlled, so the whole pipeline runs fully
  offline after the first visit.
- **Arrivals**: the stop code is sent to `https://arrivelah2.busrouter.sg/?id=…`
  (cheeaun's open-source proxy of LTA's DataMall `BusArrival` API, cached 15s).
- **Stop names**: `public/stops.json` is generated from
  [`cheeaun/sgbusdata`](https://github.com/cheeaun/sgbusdata) (source:
  LTA DataMall `BusStops`).

## OCR engine assets

`scripts/vendor-ocr.mjs` copies four files from `node_modules` (plus the
language data) into `public/models/tesseract/`:

| Asset | Purpose |
| --- | --- |
| `worker.min.js` | Tesseract.js worker bootstrap |
| `tesseract-core-simd-lstm.wasm.js` | SIMD + LSTM core (self-contained WASM) |
| `tesseract-core-lstm.wasm.js` | Non-SIMD fallback core for older devices |
| `eng.traineddata.gz` | English LSTM model — tessdata_fast (~2 MB) |

The app bundles only the core flavour the device needs (~4 MB), chosen by
`wasm-feature-detect` at load. Total precache footprint is ~10 MB; everything
is served from the app's own origin, so scanning works with the network off.

## Caveats

- OCR accuracy depends on framing: keep the code level, in focus, and filling
  the guide box, and avoid glare. The confidence gate (default 0.65) plus
  2-of-4 voting and stop-dataset validation suppress most false readings.
- ArriveLah is a shared, free service — the app shows loading/error/retry
  states if it is unreachable.
- The LTA BusArrival API only returns buses currently in operation, so a stop
  shows "No buses in operation" outside service hours.

## Data licence

Bus arrival and stop data is provided by LTA under the
[Singapore Open Data Licence](https://data.gov.sg/open-data-licence).
