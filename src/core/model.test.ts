import { describe, expect, test } from 'vitest';
import { Unit, TrustClass, isMeasured, type RfSample } from './model';

function sample(partial: Partial<RfSample>): RfSample {
  return {
    source: 'wifi',
    tsMs: 1000,
    measuredAtMs: 1000,
    centerFreqHz: 2_412_000_000,
    bandwidthHz: 20_000_000,
    value: -55,
    unit: Unit.DBM,
    snrDb: null,
    trustClass: TrustClass.MEASURED,
    identity: 'aa:bb:cc:dd:ee:ff',
    channel: '1',
    extras: {},
    ...partial,
  };
}

describe('RfSample / isMeasured', () => {
  test('a measured WiFi RSSI sample is measured', () => {
    const s = sample({ source: 'wifi', unit: Unit.DBM, trustClass: TrustClass.MEASURED });
    expect(isMeasured(s)).toBe(true);
  });

  test('a categorical NFC tap is not measured', () => {
    const s = sample({
      source: 'nfc',
      centerFreqHz: 13_560_000,
      bandwidthHz: null,
      value: 0,
      unit: Unit.CATEGORICAL,
      trustClass: TrustClass.CATEGORICAL,
      identity: '04:A2:...',
      channel: null,
    });
    expect(isMeasured(s)).toBe(false);
  });

  test('a derived cellular bar (freq from ARFCN) is not "measured" class', () => {
    const s = sample({
      source: 'cellular',
      unit: Unit.DBM,
      trustClass: TrustClass.DERIVED,
      value: -95,
    });
    expect(isMeasured(s)).toBe(false);
  });
});
