// Per-band normalization. You CANNOT put dBm, dB, and dB-Hz on one linear
// color scale — they are physically different quantities. So each radio maps
// its own realistic floor→ceiling into [0,1] for the shared color ramp, and the
// UI always shows the real unit + range beside it. The 0..1 is a rendering aid,
// explicitly "relative activity within this band", never calibrated cross-radio
// power.

import type { RadioId } from './model';

/** Realistic [floor, ceiling] for each radio's native value. */
export const BAND_RANGE: Record<RadioId, [number, number]> = {
  wifi: [-90, -30], // RSSI dBm
  ble: [-100, -40], // RSSI dBm
  bt_classic: [-110, -40], // inquiry RSSI dBm
  cellular: [-140, -44], // RSRP dBm
  gnss: [10, 50], // C/N0 dB-Hz
  uwb: [-100, -40], // coarse ranging RSSI dBm
  nfc: [0, 1], // categorical (present/absent)
  sdr: [-120, -20], // PSD dBFS-ish
};

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Map a radio's native value into [0,1] within its own band range. */
export function normalize01(source: RadioId, value: number): number {
  const [lo, hi] = BAND_RANGE[source];
  return clamp01((value - lo) / (hi - lo));
}
