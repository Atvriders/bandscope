import { describe, expect, test } from 'vitest';
import { viridis, viridisLut } from './colormap';

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

describe('viridis colormap', () => {
  test('LUT has n*4 bytes and opaque alpha', () => {
    const lut = viridisLut(256);
    expect(lut.length).toBe(256 * 4);
    expect(lut[3]).toBe(255);
    expect(lut[255 * 4 + 3]).toBe(255);
  });

  test('low end is dark, high end is bright', () => {
    const [r0, g0, b0] = viridis(0);
    const [r1, g1, b1] = viridis(1);
    expect(luma(r0, g0, b0)).toBeLessThan(60);
    expect(luma(r1, g1, b1)).toBeGreaterThan(180);
  });

  test('luminance increases from low → mid → high', () => {
    const lo = luma(...viridis(0));
    const mid = luma(...viridis(0.5));
    const hi = luma(...viridis(1));
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
  });

  test('clamps out-of-range t', () => {
    expect(viridis(-5)).toEqual(viridis(0));
    expect(viridis(5)).toEqual(viridis(1));
  });
});
