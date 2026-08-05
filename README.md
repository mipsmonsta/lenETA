# lenETA

Scan the 5-digit bus stop code on a Singapore bus pole with your phone camera
to see real-time bus arrivals for every service at that stop.

A fully client-side PWA: React + Vite + TypeScript, deployed as static files on
GitHub Pages. No backend, no API keys.

## Features

- **Camera scan** — point at the bus stop code; Tesseract.js OCR (in-browser,
  digits only) reads the 5-digit code.
- **Manual entry** — numeric keypad fallback when the camera or OCR fails.
- **Live arrivals** — real-time ETAs via the ArriveLah proxy of LTA DataMall
  (free, CORS-enabled, refreshed every 30s).
- **Stop info** — validates the code and shows the stop name + road from a
  bundled dataset of ~5,200 SG bus stops.
- **Favourites** — save stops to check them quickly from the home screen.
- **Offline-friendly** — the app shell, stop dataset, and last arrivals are
  cached by the service worker.

## Development

Requires Node.js 20+ (Node 24 recommended).

```bash
npm install
npm run dev          # local dev server (http://localhost:5173/lenETA/)
```

Useful scripts:

```bash
npm run stops        # refresh public/stops.json from cheeaun/sgbusdata
npm run build        # typecheck + build to dist/
npm run preview      # serve the production build
npm run lint         # oxlint
```

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

- **Scan**: `getUserMedia` starts the rear camera. Every ~0.8s a frame is
  cropped to the on-screen guide box, binarized and upscaled, then run through
  a digits-only Tesseract worker. The same 5-digit code must appear on two
  consecutive frames before it is accepted, then it is validated against the
  stop dataset.
- **Arrivals**: the stop code is sent to `https://arrivelah2.busrouter.sg/?id=…`
  (cheeaun's open-source proxy of LTA's DataMall `BusArrival` API, cached 15s).
- **Stop names**: `public/stops.json` is generated from
  [`cheeaun/sgbusdata`](https://github.com/cheeaun/sgbusdata) (source:
  LTA DataMall `BusStops`).

## Caveats

- The first scan downloads the Tesseract model (~4MB) from jsDelivr; it is then
  cached in IndexedDB and by the service worker, so later scans work offline.
- ArriveLah is a shared, free service — the app shows loading/error/retry
  states if it is unreachable.
- The LTA BusArrival API only returns buses currently in operation, so a stop
  shows "No buses in operation" outside service hours.

## Data licence

Bus arrival and stop data is provided by LTA under the
[Singapore Open Data Licence](https://data.gov.sg/open-data-licence).
