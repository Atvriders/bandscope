// The unified frequency axis. Real measurable phone bands are orders of
// magnitude apart and mostly empty, so we use a BROKEN log axis: dead spectrum
// between clusters is collapsed, and active clusters are given screen width by
// weight. freqToX maps a real frequency (Hz) to a normalized [0,1] position.

export interface AxisSegment {
  loHz: number;
  hiHz: number;
  /** Fraction of the total axis width this segment occupies (all sum to 1). */
  widthFrac: number;
  label: string;
}

// [loHz, hiHz, weight, label] — strictly ascending, non-overlapping.
const RAW: Array<[number, number, number, string]> = [
  [13.0e6, 14.0e6, 0.3, 'NFC'],
  [0.6e9, 1.0e9, 1.0, 'Cell-Low'],
  [1.15e9, 1.65e9, 1.2, 'GNSS-L'],
  [1.7e9, 2.4e9, 1.4, 'Cell-Mid'],
  [2.4e9, 2.5e9, 1.2, 'WiFi/BLE 2.4'],
  [2.5e9, 2.7e9, 0.5, 'Cell-2.5'],
  [3.3e9, 4.2e9, 1.0, 'Cell-C'],
  [5.15e9, 5.895e9, 1.4, 'WiFi 5'],
  [5.925e9, 8.0e9, 1.2, 'WiFi-6E/UWB'],
];

function buildSegments(raw: typeof RAW): AxisSegment[] {
  const sum = raw.reduce((a, [, , w]) => a + w, 0);
  return raw.map(([loHz, hiHz, w, label]) => ({
    loHz,
    hiHz,
    widthFrac: w / sum,
    label,
  }));
}

export const DEFAULT_SEGMENTS: AxisSegment[] = buildSegments(RAW);

/**
 * Map a frequency (Hz) to a normalized x in [0,1] across the segmented axis,
 * log-interpolated within its segment. Returns null if the frequency falls in
 * a collapsed gap (no segment contains it).
 */
export function freqToX(hz: number, segments: AxisSegment[] = DEFAULT_SEGMENTS): number | null {
  let offset = 0;
  for (const seg of segments) {
    if (hz >= seg.loHz && hz <= seg.hiHz) {
      const frac =
        (Math.log(hz) - Math.log(seg.loHz)) / (Math.log(seg.hiHz) - Math.log(seg.loHz));
      return offset + frac * seg.widthFrac;
    }
    offset += seg.widthFrac;
  }
  return null;
}

/** Inverse-ish helper: the [x0,x1] span a segment occupies, for drawing ticks. */
export function segmentSpan(index: number, segments: AxisSegment[] = DEFAULT_SEGMENTS): [number, number] {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += segments[i].widthFrac;
  return [offset, offset + segments[index].widthFrac];
}
