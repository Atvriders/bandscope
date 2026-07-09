import { describe, expect, test } from 'vitest';
import { mapBle, estimateDistanceM, type BleDevice } from './bleMap';
import { Unit } from '../../core/model';

describe('mapBle', () => {
  test('maps a device to a MEASURED dBm sample with NO frequency', () => {
    const d: BleDevice = { address: 'AA:BB:CC:11:22:33', rssi: -63, txPower: -12, name: 'Tag' };
    const [s] = mapBle([d], 1000);
    expect(s.source).toBe('ble');
    expect(s.centerFreqHz).toBeNull(); // BLE has no frequency
    expect(s.value).toBe(-63);
    expect(s.unit).toBe(Unit.DBM);
    expect(s.trustClass).toBe('measured');
    expect(s.identity).toBe('AA:BB:CC:11:22:33');
    expect(s.extras.name).toBe('Tag');
  });
});

describe('estimateDistanceM', () => {
  test('at RSSI == txPower distance ≈ 1 m', () => {
    expect(estimateDistanceM(-59, -59)).toBeCloseTo(1, 5);
  });
  test('weaker RSSI than txPower → farther than 1 m', () => {
    expect(estimateDistanceM(-79, -59)).toBeGreaterThan(1);
  });
});
