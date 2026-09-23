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

- `apps/web`: React + Vite + TypeScript, intended for Vercel
- `apps/worker`: Cloudflare Worker proxy/cache for CelesTrak GP JSON
- `packages/core`: RF calculations and tests

## Local development

```bash
npm install
npm run dev:worker
npm run dev:web
```

The web app defaults to `http://localhost:8787` for its API.

## Roadmap

1. Rain attenuation
2. SINR and interference sources
3. Handover hysteresis + time-to-trigger
4. LEO/MEO/GEO comparison mode
5. Web Worker propagation for larger constellations
6. Optional RTL-SDR companion lab
