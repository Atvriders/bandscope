import { describe, expect, test } from 'vitest';
import { mapCells, type CellInfo } from './cellularMap';
import { Unit } from '../../core/model';

describe('mapCells', () => {
  test('LTE serving cell: DERIVED bar at ARFCN-computed frequency, real RSRP + SINR', () => {
    const cell: CellInfo = {
      rat: 'LTE',
      arfcn: 1575, // band 3 → ~1842.5 MHz
      powerDbm: -95,
      sinrDb: 12,
      rsrqDb: -9,
      pci: 201,
      registered: true,
      mccMnc: '310260',
    };
    const [s] = mapCells([cell], 1000);
    expect(s.source).toBe('cellular');
    expect(Math.round(s.centerFreqHz! / 1e5) / 10).toBeCloseTo(1842.5, 1);
    expect(s.value).toBe(-95);
    expect(s.unit).toBe(Unit.DBM);
    expect(s.snrDb).toBe(12);
    expect(s.trustClass).toBe('derived');
    expect(s.extras.serving).toBe(true);
    expect(s.extras.band).toBe(3);
  });

  test('5G NR cell places at the NR raster frequency', () => {
    const [s] = mapCells(
      [{ rat: 'NR', arfcn: 620000, powerDbm: -88, registered: false }],
      1000,
    );
    expect(Math.round(s.centerFreqHz! / 1e6)).toBe(3300);
    expect(s.extras.serving).toBe(false);
  });

  test('neighbor cell with no SINR reported leaves snrDb null', () => {
    const [s] = mapCells(
      [{ rat: 'LTE', arfcn: 6300, powerDbm: -110, registered: false }],
      1000,
    );
    expect(s.snrDb).toBeNull();
  });
});
