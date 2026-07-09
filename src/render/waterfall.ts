// GPU waterfall via a ring-buffer texture. Each new scan/FFT row is uploaded as
// a SINGLE row (texture.subimage) and the scroll is done by offsetting the
// texture V coordinate in the shader — the GPU scrolls, the CPU never re-blits
// the whole texture. Color comes from the viridis LUT (1D texture). The trust
// class travels in the green channel so the shader can dim DERIVED rows and a
// one-tap "provenance" overlay can recolor by measured/derived/categorical.

import createREGL from 'regl';
import { viridisLut } from './colormap';

// Re-export the trust encoding (defined in ./trust, GL-free) for callers that
// import it from the waterfall module (e.g. the smoke path).
export { TRUST_MEASURED, TRUST_DERIVED, TRUST_CATEGORICAL } from './trust';

type Regl = ReturnType<typeof createREGL>;

const VERT = `
precision mediump float;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uData;
uniform sampler2D uLut;
uniform float uScroll;      // writeRow / rows
uniform float uProvenance;  // 0 = signal color, 1 = provenance color
void main() {
  float v = fract(uScroll - vUv.y);              // newest row at the bottom
  vec4 cell = texture2D(uData, vec2(vUv.x, v));
  float val = cell.r;                            // 0..1 normalized signal
  float trust = cell.g;                          // 0 meas, .5 derived, 1 categ
  if (val <= 0.002 && trust <= 0.002) {          // empty cell → panel bg
    gl_FragColor = vec4(0.03, 0.035, 0.05, 1.0);
    return;
  }
  vec3 col;
  if (uProvenance > 0.5) {
    if (trust < 0.25) col = vec3(0.31, 0.82, 0.77);       // measured  → teal
    else if (trust < 0.75) col = vec3(0.96, 0.68, 0.34);  // derived   → amber
    else col = vec3(0.70, 0.45, 0.95);                     // categorical → violet
    col *= (0.35 + 0.65 * val);
  } else {
    col = texture2D(uLut, vec2(val, 0.5)).rgb;
    if (trust > 0.25 && trust < 0.75) col *= 0.7;          // derived dimmer
    if (trust >= 0.75) col = mix(col, vec3(0.0), 0.5);     // categorical marker
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Waterfall {
  private regl: Regl;
  private data: ReturnType<Regl['texture']>;
  private lut: ReturnType<Regl['texture']>;
  private draw: ReturnType<Regl>;
  private writeRow = 0;
  private provenance = 0;
  private rowBuf: Uint8Array;

  constructor(
    private canvas: HTMLCanvasElement,
    private bins: number,
    private rows: number,
  ) {
    this.regl = createREGL({ canvas, attributes: { antialias: false, alpha: false } });
    this.rowBuf = new Uint8Array(bins * 4);
    this.data = this.regl.texture({
      width: bins,
      height: rows,
      format: 'rgba',
      type: 'uint8',
      min: 'nearest',
      mag: 'nearest',
      wrapS: 'clamp',
      wrapT: 'repeat',
      data: new Uint8Array(bins * rows * 4),
    });
    this.lut = this.regl.texture({
      width: 256,
      height: 1,
      format: 'rgba',
      type: 'uint8',
      min: 'linear',
      mag: 'linear',
      wrapS: 'clamp',
      wrapT: 'clamp',
      data: viridisLut(256),
    });
    this.draw = this.regl({
      vert: VERT,
      frag: FRAG,
      attributes: { position: [-1, -1, 3, -1, -1, 3] },
      uniforms: {
        uData: this.data,
        uLut: this.lut,
        uScroll: () => this.writeRow / this.rows,
        uProvenance: () => this.provenance,
      },
      count: 3,
    });
  }

  /** Upload one new row. `values01` in [0,1]; `trust` bytes per bin. */
  pushRow(values01: Float32Array, trust: Uint8Array): void {
    const b = this.rowBuf;
    for (let i = 0; i < this.bins; i++) {
      const v = values01[i];
      b[i * 4] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
      b[i * 4 + 1] = trust[i] ?? 0;
      b[i * 4 + 2] = 0;
      b[i * 4 + 3] = 255;
    }
    this.data.subimage({ width: this.bins, height: 1, data: b }, 0, this.writeRow);
    this.writeRow = (this.writeRow + 1) % this.rows;
  }

  setProvenance(on: boolean): void {
    this.provenance = on ? 1 : 0;
  }

  /** Match the drawing buffer to the CSS size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(): void {
    this.regl.poll();
    this.regl.clear({ color: [0.03, 0.035, 0.05, 1], depth: 1 });
    this.draw();
  }

  dispose(): void {
    this.regl.destroy();
  }
}
