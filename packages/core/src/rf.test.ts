import { describe, expect, it } from 'vitest';
import { fsplDb, noiseFloorDbm, propagationDelayMs } from './rf';

describe('RF fundamentals', () => {
  it('FSPL: 550 km at 12 GHz', () => {
    expect(fsplDb(550, 12)).toBeCloseTo(168.84, 1);
  });

  it('noise floor: 100 MHz with 3 dB NF', () => {
    expect(noiseFloorDbm(100e6, 3)).toBeCloseTo(-91, 1);
  });

  it('one-way delay: 550 km', () => {
    expect(propagationDelayMs(550)).toBeCloseTo(1.83, 1);
  });
});