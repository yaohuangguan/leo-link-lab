import * as satellite from 'satellite.js';
import type { OmmRecord } from '../types';

type InitMessage = {
  type: 'init';
  records: OmmRecord[];
};

type StartMessage = {
  type: 'start';
  intervalMs?: number;
};

type StopMessage = {
  type: 'stop';
};

type IncomingMessage = InitMessage | StartMessage | StopMessage;

type PreparedSatellite = {
  noradId: string;
  name: string;
  satrec: ReturnType<typeof satellite.json2satrec>;
};

let prepared: PreparedSatellite[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

const toDeg = (radians: number) => radians * 180 / Math.PI;

function computePositions() {
  if (!prepared.length) return;

  const date = new Date();
  const gmst = satellite.gstime(date);
  const features: Array<{
    type: 'Feature';
    properties: { noradId: string; name: string };
    geometry: { type: 'Point'; coordinates: [number, number] };
  }> = [];

  for (const item of prepared) {
    try {
      const pv = satellite.propagate(item.satrec, date);
      if (!pv?.position) continue;
      const geodetic = satellite.eciToGeodetic(pv.position, gmst);
      const lon = toDeg(geodetic.longitude);
      const lat = toDeg(geodetic.latitude);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      features.push({
        type: 'Feature',
        properties: { noradId: item.noradId, name: item.name },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      });
    } catch {
      // Skip malformed or currently unpropagatable records.
    }
  }

  self.postMessage({
    type: 'positions',
    generatedAt: date.toISOString(),
    count: features.length,
    geojson: {
      type: 'FeatureCollection',
      features,
    },
  });
}

function start(intervalMs = 3000) {
  if (timer) clearInterval(timer);
  computePositions();
  timer = setInterval(computePositions, Math.max(1500, intervalMs));
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    prepared = [];
    for (const record of message.records) {
      try {
        const satrec = satellite.json2satrec(record as any);
        prepared.push({
          noradId: String(record.NORAD_CAT_ID ?? ''),
          name: String(record.OBJECT_NAME ?? 'SATELLITE'),
          satrec,
        });
      } catch {
        // Ignore records satellite.js cannot parse.
      }
    }

    self.postMessage({ type: 'ready', count: prepared.length });
    return;
  }

  if (message.type === 'start') {
    start(message.intervalMs);
    return;
  }

  if (message.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};
