// 2D-canvas waterfall fallback for WebViews where WebGL fails to initialize.
// Same ring-buffer scheme as the GL version (write one row into an offscreen
// bins×rows canvas, blit with a scroll offset), so the center is never blank.

import { viridisLut } from './colormap';
import type { WaterfallLike } from './WaterfallLike';

export class Canvas2DWaterfall implements WaterfallLike {
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private rowImg: ImageData;
  private lut = viridisLut(256);
  private writeRow = 0;
  private prov = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private bins: number,
    private rows: number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.off = document.createElement('canvas');
    this.off.width = bins;
    this.off.height = rows;
    const offCtx = this.off.getContext('2d');
    if (!offCtx) throw new Error('2D offscreen context unavailable');
    this.offCtx = offCtx;
    this.offCtx.fillStyle = '#08090d';
    this.offCtx.fillRect(0, 0, bins, rows);
    this.rowImg = this.offCtx.createImageData(bins, 1);
  }

  pushRow(values01: Float32Array, trust: Uint8Array): void {
    const d = this.rowImg.data;
    for (let i = 0; i < this.bins; i++) {
      const v = values01[i];
      const tb = trust[i] ?? 0;
      let r: number, g: number, b: number;
      if (v <= 0.002 && tb === 0) {
        r = 8; g = 9; b = 13; // empty → panel bg
      } else if (this.prov) {
        if (tb < 64) { r = 79; g = 209; b = 196; } // measured teal (matches GL)
        else if (tb < 192) { r = 245; g = 173; b = 87; } // derived amber (matches GL)
        else { r = 179; g = 115; b = 242; } // categorical violet (matches GL)
        const s = 0.35 + 0.65 * v;
        r *= s; g *= s; b *= s;
      } else {
        const idx = Math.max(0, Math.min(255, Math.round(v * 255))) * 4;
        r = this.lut[idx]; g = this.lut[idx + 1]; b = this.lut[idx + 2];
        if (tb >= 64 && tb < 192) { r *= 0.7; g *= 0.7; b *= 0.7; }
        else if (tb >= 192) { r *= 0.5; g *= 0.5; b *= 0.5; }
      }
      const p = i * 4;
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
    }
    this.offCtx.putImageData(this.rowImg, 0, this.writeRow);
    this.writeRow = (this.writeRow + 1) % this.rows;
  }

  setProvenance(on: boolean): void {
    this.prov = on ? 1 : 0;
  }

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
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.imageSmoothingEnabled = false;
    // oldest block [writeRow..end] on top, newest block [0..writeRow] below
    const topRows = this.rows - this.writeRow;
    const splitY = (h * topRows) / this.rows;
    this.ctx.drawImage(this.off, 0, this.writeRow, this.bins, topRows, 0, 0, w, splitY);
    if (this.writeRow > 0) {
      this.ctx.drawImage(this.off, 0, 0, this.bins, this.writeRow, 0, splitY, w, h - splitY);
    }
  }

  dispose(): void {
    /* nothing to release */
  }
}
