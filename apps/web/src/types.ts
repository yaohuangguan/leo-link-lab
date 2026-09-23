export type OmmRecord = Record<string, string | number | null> & {
  OBJECT_NAME?: string;
  NORAD_CAT_ID?: number | string;
  EPOCH?: string;
};

export type RadioConfig = {
  frequencyGHz: number;
  bandwidthMHz: number;
  txPowerDbm: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  otherLossDb: number;
  requiredSnrDb: number;
  minElevationDeg: number;
};

export type SatelliteLink = {
  name: string;
  noradId: string;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  rangeRateMps: number;
  subLatDeg: number;
  subLonDeg: number;
  altitudeKm: number;
  fsplDb: number;
  receivedPowerDbm: number;
  noiseDbm: number;
  snrDb: number;
  dopplerHz: number;
  delayMs: number;
  capacityMbps: number;
  linkMarginDb: number;
};