import { describe, expect, test } from 'vitest';
import { MockSource } from './MockSource';
import { Unit, type MarkersEmission } from '../core/model';

describe('MockSource', () => {
  test('tick emits a non-empty markers batch', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    expect(e.kind).toBe('markers');
    expect(e.samples.length).toBeGreaterThan(0);
  });

  test('every sample has a unit and trust class', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    for (const s of e.samples) {
      expect(Object.values(Unit)).toContain(s.unit);
      expect(s.trustClass).toBeTruthy();
    }
  });

  test('WiFi, GNSS and cellular samples all carry a real center frequency', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    for (const src of ['wifi', 'gnss', 'cellular'] as const) {
      const s = e.samples.find((x) => x.source === src);
      expect(s, `expected a ${src} sample`).toBeDefined();
      expect(s!.centerFreqHz).not.toBeNull();
      expect(s!.centerFreqHz!).toBeGreaterThan(0);
    }
  });

  test('cellular samples are DERIVED (frequency reconstructed from EARFCN)', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    const cell = e.samples.find((x) => x.source === 'cellular')!;
    expect(cell.trustClass).toBe('derived');
  });

  test('GNSS values are in dB-Hz', () => {
    const e = new MockSource(1).tick(1000) as MarkersEmission;
    const sat = e.samples.find((x) => x.source === 'gnss')!;
    expect(sat.unit).toBe(Unit.DB_HZ);
  });

  test('same seed + same tick time is deterministic', () => {
    const a = new MockSource(7).tick(2000);
    const b = new MockSource(7).tick(2000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
