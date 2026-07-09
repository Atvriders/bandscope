// Perceptually-uniform, colorblind-safe sequential colormap (viridis), used as a
// 1D LUT in the waterfall fragment shader. Legible in both light and dark.

// matplotlib viridis anchors (t, R, G, B) 0..255.
const VIRIDIS: Array<[number, number, number, number]> = [
  [0.0, 68, 1, 84],
  [0.1, 72, 36, 117],
  [0.2, 65, 68, 135],
  [0.3, 53, 95, 141],
  [0.4, 42, 120, 142],
  [0.5, 33, 145, 140],
  [0.6, 34, 168, 132],
  [0.7, 68, 190, 112],
  [0.8, 122, 209, 81],
  [0.9, 189, 223, 38],
  [1.0, 253, 231, 37],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample the viridis ramp at t ∈ [0,1] → [r,g,b] 0..255. */
export function viridis(t: number): [number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < VIRIDIS.length; i++) {
    if (x <= VIRIDIS[i][0]) {
      const [t0, r0, g0, b0] = VIRIDIS[i - 1];
      const [t1, r1, g1, b1] = VIRIDIS[i];
      const f = (x - t0) / (t1 - t0);
      return [Math.round(lerp(r0, r1, f)), Math.round(lerp(g0, g1, f)), Math.round(lerp(b0, b1, f))];
    }
  }
  const last = VIRIDIS[VIRIDIS.length - 1];
  return [last[1], last[2], last[3]];
}

/** Build an n×RGBA LUT (A=255) for upload as a 1D GL texture. */
export function viridisLut(n: number): Uint8Array {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = viridis(i / (n - 1));
    out[i * 4 + 0] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}
