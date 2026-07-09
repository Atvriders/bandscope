import { describe, expect, test } from 'vitest';
import { toCsv, toJson } from './csv';
import { Unit, TrustClass, type RfSample } from '../core/model';

const s: RfSample = {
  source: 'wifi',
  tsMs: 1000,
  measuredAtMs: 990,
  centerFreqHz: 2_412_000_000,
  bandwidthHz: 20_000_000,
  value: -55,
  unit: Unit.DBM,
  snrDb: null,
  trustClass: TrustClass.MEASURED,
  identity: 'aa:bb:cc:dd:ee:ff',
  channel: '1',
  extras: { ssid: 'HomeNet' },
};

describe('CSV/JSON export', () => {
  test('first line is the header', () => {
    const csv = toCsv([s]);
    expect(csv.split('\n')[0]).toBe(
      'source,tsMs,measuredAtMs,centerFreqHz,bandwidthHz,value,unit,snrDb,trustClass,identity,channel',
    );
  });

  test('a row carries the native value + unit + trust', () => {
    const row = toCsv([s]).split('\n')[1];
    expect(row).toContain('wifi');
    expect(row).toContain('2412000000');
    expect(row).toContain('-55');
    expect(row).toContain('dBm');
    expect(row).toContain('measured');
    expect(row).toContain('aa:bb:cc:dd:ee:ff');
  });

  test('a comma-bearing identity is quoted', () => {
    const evil = { ...s, identity: 'evil,name' };
    expect(toCsv([evil]).split('\n')[1]).toContain('"evil,name"');
  });

  test('a formula-injection identity is neutralized', () => {
    const evil = { ...s, identity: '=CMD()' };
    expect(toCsv([evil]).split('\n')[1]).toContain("'=CMD()");
  });

  test('JSON round-trips', () => {
    const parsed = JSON.parse(toJson([s]));
    expect(parsed[0].identity).toBe('aa:bb:cc:dd:ee:ff');
    expect(parsed[0].unit).toBe('dBm');
  });
});
