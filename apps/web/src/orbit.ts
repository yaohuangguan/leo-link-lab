import * as satellite from 'satellite.js';
import {
  dopplerShiftHz, fsplDb, noiseFloorDbm, propagationDelayMs,
  receivedPowerDbm, shannonCapacityMbps, snrDb,
} from '@leo/core';
import type { OmmRecord, RadioConfig, SatelliteLink } from './types';

const toDeg = (r: number) => r * 180 / Math.PI;

function geometry(record: OmmRecord, observer: { latitude: number; longitude: number; height: number }, date: Date) {
  const satrec = satellite.json2satrec(record as any);
  const pv = satellite.propagate(satrec, date);
  if (!pv) return null;
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(observer, ecf);
  return {
    azimuthDeg: (toDeg(look.azimuth) + 360) % 360,
    elevationDeg: toDeg(look.elevation),
    rangeKm: look.rangeSat,
  };
}

export function computeLink(record: OmmRecord, station: { latDeg: number; lonDeg: number }, radio: RadioConfig, date: Date): SatelliteLink | null {
  const observer = {
    latitude: satellite.degreesToRadians(station.latDeg),
    longitude: satellite.degreesToRadians(station.lonDeg),
    height: 0,
  };
  const now = geometry(record, observer, date);
  if (!now) return null;
  const before = geometry(record, observer, new Date(date.getTime() - 1000));
  const after = geometry(record, observer, new Date(date.getTime() + 1000));
  const rangeRateMps = before && after ? (after.rangeKm - before.rangeKm) * 500 : 0;
  const pathLoss = fsplDb(now.rangeKm, radio.frequencyGHz);
  const received = receivedPowerDbm(radio.txPowerDbm, radio.txGainDbi, radio.rxGainDbi, pathLoss, radio.otherLossDb);
  const noise = noiseFloorDbm(radio.bandwidthMHz * 1e6, radio.noiseFigureDb);
  const snr = snrDb(received, noise);
  return {
    name: String(record.OBJECT_NAME || 'STARLINK'),
    noradId: String(record.NORAD_CAT_ID || '—'),
    ...now,
    rangeRateMps,
    fsplDb: pathLoss,
    receivedPowerDbm: received,
    noiseDbm: noise,
    snrDb: snr,
    dopplerHz: dopplerShiftHz(rangeRateMps, radio.frequencyGHz * 1e9),
    delayMs: propagationDelayMs(now.rangeKm),
    capacityMbps: shannonCapacityMbps(radio.bandwidthMHz * 1e6, snr),
    linkMarginDb: snr - radio.requiredSnrDb,
  };
}