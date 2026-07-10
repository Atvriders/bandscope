// Live frequency scope: a spectrum-analyzer-style plot of every frequency-
// bearing signal, LOW frequency on the LEFT → HIGH on the RIGHT, on the same
// segmented broken-log axis as the waterfall strip below it. Each emitter (WiFi
// AP, cell, satellite) is a bar at its real frequency, height = per-band
// normalized strength, colored by trust; a decaying peak-hold marks recent
// maxima. Canvas repaint each tick — no DOM, so it can't flash.

import { DEFAULT_SEGMENTS, freqToX, segmentSpan } from '../../core/axis';
import { normalize01 } from '../../core/normalize';
import type { RfSample } from '../../core/model';
import { el } from './parts';

const TRUST_COLOR: Record<string, string> = {
  measured: '#56e0ce',
  derived: '#f0a94b',
  categorical: '#b07cf0',
};
const PEAK_BINS = 512;
const PEAK_DECAY = 0.9;

function fmtHz(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(hz < 10e9 ? 1 : 0)}G`;
  if (hz >= 1e6) return `${Math.round(hz / 1e6)}M`;
  return `${Math.round(hz / 1e3)}k`;
}

/** The shared frequency-axis label strip (low → high). */
export function createFreqAxis(): HTMLElement {
  const axis = el('div', 'freq-axis');
  for (let i = 0; i < DEFAULT_SEGMENTS.length; i++) {
    const seg = DEFAULT_SEGMENTS[i];
    const cell = el('div', 'freq-seg');
    cell.style.flexGrow = String(seg.widthFrac);
    cell.title = `${fmtHz(seg.loHz)}–${fmtHz(seg.hiHz)}`;
    cell.append(el('span', 'freq-name', seg.label), el('span', 'freq-hz', fmtHz(seg.loHz)));
    axis.appendChild(cell);
  }
  return axis;
}

export class SpectrumScope {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private peak = new Float32Array(PEAK_BINS);

  constructor() {
    this.element = el('div', 'scope');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scope-canvas';
    this.element.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
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

  update(snapshot: RfSample[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // background
    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, W, H);

    // band shading + separators (alternating so segments read as bands)
    for (let i = 0; i < DEFAULT_SEGMENTS.length; i++) {
      const [x0, x1] = segmentSpan(i);
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(x0 * W, 0, (x1 - x0) * W, H);
      }
      ctx.strokeStyle = '#141c26';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x1 * W) + 0.5, 0);
      ctx.lineTo(Math.round(x1 * W) + 0.5, H);
      ctx.stroke();
    }

    // decay peak-hold
    for (let i = 0; i < this.peak.length; i++) this.peak[i] *= PEAK_DECAY;

    const dpr = this.canvas.clientWidth > 0 ? W / this.canvas.clientWidth : 1;

    // signal bars
    for (const s of snapshot) {
      if (s.centerFreqHz == null) continue; // BLE/BT have no frequency
      const x = freqToX(s.centerFreqHz);
      if (x == null) continue;
      const v = normalize01(s.source, s.value);
      const px = x * W;

      let wpx = 2 * dpr; // min bar width in device px
      if (s.bandwidthHz) {
        const xa = freqToX(s.centerFreqHz - s.bandwidthHz / 2);
        const xb = freqToX(s.centerFreqHz + s.bandwidthHz / 2);
        if (xa != null && xb != null) wpx = Math.max(wpx, (xb - xa) * W);
      }
      const h = v * (H - 2);
      ctx.fillStyle = TRUST_COLOR[s.trustClass] ?? '#9aa7b4';
      ctx.globalAlpha = 0.82;
      ctx.fillRect(px - wpx / 2, H - h, wpx, h);
      ctx.globalAlpha = 1;

      const col = Math.max(0, Math.min(PEAK_BINS - 1, Math.floor(x * PEAK_BINS)));
      if (v > this.peak[col]) this.peak[col] = v;
    }

    // peak-hold dots
    ctx.fillStyle = 'rgba(230,236,242,0.55)';
    for (let c = 0; c < PEAK_BINS; c++) {
      const pk = this.peak[c];
      if (pk < 0.03) continue;
      const pxx = (c / PEAK_BINS) * W;
      ctx.fillRect(pxx - 1, H - pk * (H - 2) - 1, 2, 2);
    }
  }
}
