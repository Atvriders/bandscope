import { describe, expect, test } from 'vitest';
import { normalize01 } from './normalize';

describe('per-band normalization', () => {
  test('GNSS C/N0 ceiling (50 dB-Hz) → 1', () => {
    expect(normalize01('gnss', 50)).toBe(1);
  });
  test('GNSS C/N0 floor (10 dB-Hz) → 0', () => {
    expect(normalize01('gnss', 10)).toBe(0);
  });
  test('WiFi -60 dBm sits mid-band (~0.5)', () => {
    expect(normalize01('wifi', -60)).toBeCloseTo(0.5, 2);
  });
  test('values above ceiling clamp to 1', () => {
    expect(normalize01('wifi', 0)).toBe(1);
  });
  test('values below floor clamp to 0', () => {
    expect(normalize01('cellular', -200)).toBe(0);
  });
});
