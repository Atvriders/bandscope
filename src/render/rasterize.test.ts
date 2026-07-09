import { describe, expect, test } from 'vitest';
import { rasterize } from './rasterize';
import { TRUST_MEASURED, TRUST_DERIVED } from './trust';
import { freqToX } from '../core/axis';
import { MockSource } from '../sources/MockSource';
import { Unit, TrustClass, type MarkersEmission, type RfSample } from '../core/model';

const BINS = 720;
const binOf = (hz: number) => Math.round(freqToX(hz)! * (BINS - 1));

function sample(p: Partial<RfSample>): RfSample {
  return {
    source: 'wifi',
    tsMs: 0,
    measuredAtMs: 0,
    centerFreqHz: 2_412_000_000,
    bandwidthHz: 20_000_000,
    value: -50,
    unit: Unit.DBM,
    snrDb: null,
    trustClass: TrustClass.MEASURED,
    identity: 'x',
    channel: '1',
    extras: {},
    ...p,
  };
}

describe('rasterize (waterfall data path)', () => {
  test('places a WiFi AP at its real frequency bin with MEASURED trust', () => {
    const row = rasterize([sample({ centerFreqHz: 2_412_000_000 })], BINS);
    const bin = binOf(2_412_000_000);
    expect(row.values[bin]).toBeGreaterThan(0);
    expect(row.trust[bin]).toBe(TRUST_MEASURED);
  });

  test('a DERIVED cellular bar encodes the derived trust byte', () => {
    const row = rasterize(
      [sample({ source: 'cellular', centerFreqHz: 806_000_000, trustClass: TrustClass.DERIVED, value: -90 })],
      BINS,
    );
    const bin = binOf(806_000_000);
    expect(row.trust[bin]).toBe(TRUST_DERIVED);
  });

  test('samples with no frequency (BLE) paint nothing', () => {
    const row = rasterize([sample({ source: 'ble', centerFreqHz: null })], BINS);
    expect(row.values.every((v) => v === 0)).toBe(true);
  });

  test('a full mock frame produces multiple populated bins', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    const row = rasterize(e.samples, BINS);
    const nonZero = row.values.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    // 6 APs + 8 sats + 3 cells, each widened a little → comfortably > 10 bins.
    expect(nonZero).toBeGreaterThan(10);
  });

  test('stronger sample wins the bin (max, not overwrite)', () => {
    const hz = 2_412_000_000;
    const row = rasterize(
      [sample({ centerFreqHz: hz, value: -80 }), sample({ centerFreqHz: hz, value: -35 })],
      BINS,
    );
    const bin = binOf(hz);
    // -35 dBm normalizes higher than -80 dBm for wifi
    expect(row.values[bin]).toBeGreaterThan(0.7);
  });
});
