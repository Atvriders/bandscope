import { describe, expect, test } from 'vitest';
import {
  earfcnToHz,
  earfcnBand,
  nrarfcnToHz,
  uarfcnToHz,
  gsmArfcnToHz,
  gnssBandLabel,
} from './bandplan';

const mhz1 = (hz: number | null) => Math.round(hz! / 1e5) / 10;

describe('LTE EARFCN → Hz (TS 36.101)', () => {
  test('EARFCN 0 (band 1) = exactly 2110 MHz DL', () => {
    expect(earfcnToHz(0)).toBe(2_110_000_000);
    expect(earfcnBand(0)).toBe(1);
  });
  test('EARFCN 6300 (band 20) ≈ 806.0 MHz DL', () => {
    expect(mhz1(earfcnToHz(6300))).toBeCloseTo(806.0, 1);
    expect(earfcnBand(6300)).toBe(20);
  });
  test('EARFCN 1575 (band 3) ≈ 1842.5 MHz DL', () => {
    expect(mhz1(earfcnToHz(1575))).toBeCloseTo(1842.5, 1);
    expect(earfcnBand(1575)).toBe(3);
  });
  test('EARFCN 2400 (band 5) = exactly 869 MHz DL', () => {
    expect(earfcnToHz(2400)).toBe(869_000_000);
    expect(earfcnBand(2400)).toBe(5);
  });
  test('EARFCN in no known band → null', () => {
    expect(earfcnToHz(50000)).toBeNull();
  });
});

describe('5G NR-ARFCN → Hz (TS 38.104 global raster)', () => {
  test('NR-ARFCN 620000 (n78) ≈ 3300 MHz', () => {
    expect(Math.round(nrarfcnToHz(620000)! / 1e6)).toBe(3300);
  });
  test('NR-ARFCN 2016667 = FR2 raster base ≈ 24250 MHz', () => {
    expect(Math.round(nrarfcnToHz(2016667)! / 1e6)).toBe(24250);
  });
  test('NR-ARFCN 0 = 0 Hz (raster origin)', () => {
    expect(nrarfcnToHz(0)).toBe(0);
  });
  test('negative NR-ARFCN → null', () => {
    expect(nrarfcnToHz(-5)).toBeNull();
  });
});

describe('WCDMA UARFCN → Hz', () => {
  test('UARFCN 10700 = 2140 MHz', () => {
    expect(uarfcnToHz(10700)).toBe(2_140_000_000);
  });
});

describe('GSM ARFCN → Hz', () => {
  test('ARFCN 1 = 935.2 MHz (GSM900 DL)', () => {
    expect(mhz1(gsmArfcnToHz(1))).toBeCloseTo(935.2, 1);
  });
  test('ARFCN 512 = 1805.2 MHz (DCS1800 DL)', () => {
    expect(mhz1(gsmArfcnToHz(512))).toBeCloseTo(1805.2, 1);
  });
  test('ARFCN 9999 → null', () => {
    expect(gsmArfcnToHz(9999)).toBeNull();
  });
});

describe('GNSS band labeling', () => {
  test('1575.42 MHz → L1', () => {
    expect(gnssBandLabel(1_575_420_000)).toBe('L1');
  });
  test('1176.45 MHz → L5', () => {
    expect(gnssBandLabel(1_176_450_000)).toBe('L5');
  });
  test('1227.60 MHz → L2', () => {
    expect(gnssBandLabel(1_227_600_000)).toBe('L2');
  });
  test('far-off carrier → generic L-band', () => {
    expect(gnssBandLabel(1_400_000_000)).toBe('L-band');
  });
});
