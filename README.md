# LEO Link Lab

Interactive LEO satellite communication lab using real Starlink orbital data.

## What it teaches

- Slant range and elevation
- Free-space path loss (FSPL)
- Received power and link budget
- Thermal noise floor
- SNR and link margin
- Doppler shift
- Propagation delay
- Shannon capacity upper bound

## Architecture

- `apps/web`: React + Vite + TypeScript, served as Cloudflare Static Assets
- `apps/worker`: Cloudflare Worker API/cache for CelesTrak orbital data
- `packages/core`: RF calculations and tests

The production app and API are deployed together as one Cloudflare Worker. Static files are served directly from Cloudflare's asset layer; only `/api/*` and `/health` invoke Worker code.

## Local development

```bash
npm install
npm run dev:worker
npm run dev:web
```

Vite proxies `/api` and `/health` to the local Worker on port 8791.

## Build and deploy

```bash
npm run build
npm run deploy:cloudflare
```

Production: `https://leo-link-lab.719919153.workers.dev`

## Roadmap

1. Rain attenuation and SINR
2. Handover hysteresis + time-to-trigger
3. LEO/MEO/GEO comparison mode
4. Full-constellation Web Worker propagation
5. Optional RTL-SDR companion lab
