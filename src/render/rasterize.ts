// Pure data→row rasterization: turn a batch of RfSamples into one waterfall row
// (normalized value per bin + trust byte per bin), placing each sample at its
// real frequency on the segmented axis. This is the heart of the waterfall and
// is fully unit-testable without a GL context.

import { freqToX, type AxisSegment } from '../core/axis';
import { normalize01 } from '../core/normalize';
import type { RfSample } from '../core/model';
import { trustByte } from './trust';

export interface Row {
  values: Float32Array;
  trust: Uint8Array;
}

export function rasterize(samples: RfSample[], bins: number, segments?: AxisSegment[]): Row {
  const values = new Float32Array(bins);
  const trust = new Uint8Array(bins);
  for (const s of samples) {
    if (s.centerFreqHz === null) continue; // no frequency → not on the spectrum
    const x = freqToX(s.centerFreqHz, segments);
    if (x === null) continue; // in a collapsed gap
    const center = Math.max(0, Math.min(bins - 1, Math.round(x * (bins - 1))));
    const v = normalize01(s.source, s.value);
    const tb = trustByte(s.trustClass);
    // widen a little for visibility; wider channels paint wider.
    const half = s.bandwidthHz && s.bandwidthHz > 40e6 ? 2 : 1;
    for (let b = center - half; b <= center + half; b++) {
      if (b < 0 || b >= bins) continue;
      if (v > values[b]) {
        values[b] = v;
        trust[b] = tb;
      }
    }
  }
  return { values, trust };
}
