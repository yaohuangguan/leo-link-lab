export const SPEED_OF_LIGHT_MPS = 299_792_458;
export const BOLTZMANN_NOISE_DENSITY_DBM_HZ = -174;

export function fsplDb(distanceKm: number, frequencyGHz: number) {
  if (distanceKm <= 0 || frequencyGHz <= 0) return Number.NaN;
  return 92.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyGHz);
}

export function noiseFloorDbm(bandwidthHz: number, noiseFigureDb: number) {
  return BOLTZMANN_NOISE_DENSITY_DBM_HZ + 10 * Math.log10(bandwidthHz) + noiseFigureDb;
}

export function receivedPowerDbm(txPowerDbm: number, txGainDbi: number, rxGainDbi: number, pathLossDb: number, otherLossDb = 0) {
  return txPowerDbm + txGainDbi + rxGainDbi - pathLossDb - otherLossDb;
}

export const snrDb = (signalDbm: number, noiseDbm: number) => signalDbm - noiseDbm;

export function propagationDelayMs(distanceKm: number) {
  return distanceKm * 1_000 / SPEED_OF_LIGHT_MPS * 1_000;
}

export function dopplerShiftHz(rangeRateMps: number, carrierHz: number) {
  return -(rangeRateMps / SPEED_OF_LIGHT_MPS) * carrierHz;
}

export function shannonCapacityMbps(bandwidthHz: number, signalToNoiseDb: number) {
  const linearSnr = 10 ** (signalToNoiseDb / 10);
  return bandwidthHz * Math.log2(1 + linearSnr) / 1_000_000;
}