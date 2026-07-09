// 3GPP frequency mathematics: convert the channel numbers a phone reports
// (EARFCN / NR-ARFCN / UARFCN / GSM ARFCN) into a real downlink frequency in
// Hz, and label GNSS carriers by band. The frequency is physically correct but
// COMPUTED from metadata — callers place these with TrustClass.DERIVED.
//
// Golden vectors verified against public ARFCN calculators (see bandplan.test).

interface LteBand {
  band: number;
  fdlLowMhz: number;
  nOffsDl: number;
  loEarfcn: number;
  hiEarfcn: number;
}

// TS 36.101 Table 5.7.3-1 (subset of common bands). F_DL = FDL_low + 0.1·(EARFCN − N_Offs-DL).
const LTE_BANDS: LteBand[] = [
  { band: 1, fdlLowMhz: 2110, nOffsDl: 0, loEarfcn: 0, hiEarfcn: 599 },
  { band: 2, fdlLowMhz: 1930, nOffsDl: 600, loEarfcn: 600, hiEarfcn: 1199 },
  { band: 3, fdlLowMhz: 1805, nOffsDl: 1200, loEarfcn: 1200, hiEarfcn: 1949 },
  { band: 4, fdlLowMhz: 2110, nOffsDl: 1950, loEarfcn: 1950, hiEarfcn: 2399 },
  { band: 5, fdlLowMhz: 869, nOffsDl: 2400, loEarfcn: 2400, hiEarfcn: 2649 },
  { band: 7, fdlLowMhz: 2620, nOffsDl: 2750, loEarfcn: 2750, hiEarfcn: 3449 },
  { band: 8, fdlLowMhz: 925, nOffsDl: 3450, loEarfcn: 3450, hiEarfcn: 3799 },
  { band: 12, fdlLowMhz: 729, nOffsDl: 5010, loEarfcn: 5010, hiEarfcn: 5179 },
  { band: 13, fdlLowMhz: 746, nOffsDl: 5180, loEarfcn: 5180, hiEarfcn: 5279 },
  { band: 20, fdlLowMhz: 791, nOffsDl: 6150, loEarfcn: 6150, hiEarfcn: 6449 },
  { band: 25, fdlLowMhz: 1930, nOffsDl: 8040, loEarfcn: 8040, hiEarfcn: 8689 },
  { band: 26, fdlLowMhz: 859, nOffsDl: 8690, loEarfcn: 8690, hiEarfcn: 9039 },
  { band: 28, fdlLowMhz: 758, nOffsDl: 9210, loEarfcn: 9210, hiEarfcn: 9659 },
  { band: 38, fdlLowMhz: 2570, nOffsDl: 37750, loEarfcn: 37750, hiEarfcn: 38249 },
  { band: 41, fdlLowMhz: 2496, nOffsDl: 39650, loEarfcn: 39650, hiEarfcn: 41589 },
  { band: 66, fdlLowMhz: 2110, nOffsDl: 66436, loEarfcn: 66436, hiEarfcn: 67335 },
  { band: 71, fdlLowMhz: 617, nOffsDl: 68586, loEarfcn: 68586, hiEarfcn: 68935 },
];

/** LTE EARFCN → downlink center frequency (Hz), or null if not in a known band. */
export function earfcnToHz(earfcn: number): number | null {
  const b = LTE_BANDS.find((x) => earfcn >= x.loEarfcn && earfcn <= x.hiEarfcn);
  if (!b) return null;
  const mhz = b.fdlLowMhz + 0.1 * (earfcn - b.nOffsDl);
  return Math.round(mhz * 1e6);
}

/** Which LTE band an EARFCN falls in (for labeling), or null. */
export function earfcnBand(earfcn: number): number | null {
  const b = LTE_BANDS.find((x) => earfcn >= x.loEarfcn && earfcn <= x.hiEarfcn);
  return b ? b.band : null;
}

/**
 * 5G NR-ARFCN → frequency (Hz) via the TS 38.104 global frequency raster.
 * Three ranges with different ΔF_global and reference offsets.
 */
export function nrarfcnToHz(nrarfcn: number): number | null {
  if (nrarfcn < 0) return null;
  if (nrarfcn <= 599999) {
    // 0–3000 MHz, ΔF = 5 kHz
    return nrarfcn * 5000;
  }
  if (nrarfcn <= 2016666) {
    // 3000–24250 MHz, ΔF = 15 kHz, ref 3000 MHz @ N 600000
    return 3_000_000_000 + (nrarfcn - 600000) * 15000;
  }
  if (nrarfcn <= 3279165) {
    // 24250–100000 MHz (FR2), ΔF = 60 kHz, ref 24250.08 MHz @ N 2016667
    return 24_250_080_000 + (nrarfcn - 2016667) * 60000;
  }
  return null;
}

/** WCDMA UARFCN → downlink frequency (Hz). General raster: F_DL = UARFCN × 0.2 MHz. */
export function uarfcnToHz(uarfcn: number): number {
  return Math.round(uarfcn * 0.2 * 1e6);
}

/** GSM ARFCN → downlink frequency (Hz) for GSM900 + DCS1800, or null. */
export function gsmArfcnToHz(arfcn: number): number | null {
  if (arfcn >= 1 && arfcn <= 124) {
    // P-GSM900: F_DL = 935.0 + 0.2·n MHz
    return Math.round((935 + 0.2 * arfcn) * 1e6);
  }
  if (arfcn >= 512 && arfcn <= 885) {
    // DCS1800: F_DL = 1805.2 + 0.2·(n − 512) MHz
    return Math.round((1805.2 + 0.2 * (arfcn - 512)) * 1e6);
  }
  return null;
}

/** WiFi ScanResult.frequency is already MHz; helper normalizes to Hz. */
export function wifiMhzToHz(freqMhz: number): number {
  return Math.round(freqMhz * 1e6);
}

const GNSS_CARRIERS: Array<[number, string]> = [
  [1575.42, 'L1'], // GPS L1 / Galileo E1 / QZSS L1 / SBAS / BeiDou B1C
  [1227.6, 'L2'], // GPS L2
  [1176.45, 'L5'], // GPS L5 / Galileo E5a / BeiDou B2a
  [1207.14, 'E5b'], // Galileo E5b / BeiDou B2b
  [1561.098, 'B1I'], // BeiDou B1I
  [1602.0, 'GLO-L1'], // GLONASS L1 FDMA (center)
  [1246.0, 'GLO-L2'], // GLONASS L2 FDMA (center)
];

/** Nearest known GNSS band label for a carrier frequency (Hz), within 3 MHz. */
export function gnssBandLabel(carrierHz: number): string {
  const mhz = carrierHz / 1e6;
  let best = 'L-band';
  let bestDelta = 3.0; // MHz tolerance
  for (const [f, label] of GNSS_CARRIERS) {
    const d = Math.abs(mhz - f);
    if (d < bestDelta) {
      bestDelta = d;
      best = label;
    }
  }
  return best;
}
