import { describe, expect, test } from 'vitest';
import { DEFAULT_SEGMENTS, freqToX, segmentSpan } from './axis';

describe('segmented log-frequency axis', () => {
  test('segment widthFracs sum to 1', () => {
    const sum = DEFAULT_SEGMENTS.reduce((a, s) => a + s.widthFrac, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  test('WiFi channel 1 (2412 MHz) lands in the 2.4 GHz segment span', () => {
    const x = freqToX(2_412_000_000);
    expect(x).not.toBeNull();
    const idx = DEFAULT_SEGMENTS.findIndex((s) => s.label === 'WiFi/BLE 2.4');
    const [x0, x1] = segmentSpan(idx);
    expect(x!).toBeGreaterThanOrEqual(x0);
    expect(x!).toBeLessThanOrEqual(x1);
  });

  test('GPS L1 (1575.42 MHz) lands in the GNSS-L segment span', () => {
    const x = freqToX(1_575_420_000);
    expect(x).not.toBeNull();
    const idx = DEFAULT_SEGMENTS.findIndex((s) => s.label === 'GNSS-L');
    const [x0, x1] = segmentSpan(idx);
    expect(x!).toBeGreaterThanOrEqual(x0);
    expect(x!).toBeLessThanOrEqual(x1);
  });

  test('a frequency in a collapsed gap (e.g. 100 MHz FM) returns null', () => {
    expect(freqToX(100_000_000)).toBeNull();
  });

  test('all x values are within [0,1]', () => {
    for (const hz of [13.56e6, 806e6, 1575.42e6, 2140e6, 2412e6, 3500e6, 5500e6, 6500e6]) {
      const x = freqToX(hz);
      if (x !== null) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    }
  });

  test('x increases monotonically with frequency across segments', () => {
    const xs = [806e6, 1575.42e6, 2140e6, 2412e6, 3500e6, 5500e6, 6500e6]
      .map((hz) => freqToX(hz))
      .filter((x): x is number => x !== null);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });
});
