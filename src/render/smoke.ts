// Dev-only smoke: mount at ?smoke=1 to see the waterfall scroll with random
// rows, independent of the radio pipeline. Verifies the GL path on a real
// browser/device (jsdom has no WebGL, so this can't run in unit tests).

import { Waterfall } from './waterfall';
import { TRUST_MEASURED, TRUST_DERIVED, TRUST_CATEGORICAL } from './waterfall';

export function runSmoke(canvas: HTMLCanvasElement): void {
  const bins = 512;
  const rows = 256;
  const wf = new Waterfall(canvas, bins, rows);
  const values = new Float32Array(bins);
  const trust = new Uint8Array(bins);
  let phase = 0;

  const frame = () => {
    wf.resize();
    phase += 0.05;
    for (let i = 0; i < bins; i++) {
      const t = i / bins;
      const peak = Math.exp(-Math.pow((t - 0.5 - 0.2 * Math.sin(phase)) * 12, 2));
      values[i] = Math.min(1, peak + Math.random() * 0.05);
      trust[i] = t < 0.4 ? TRUST_MEASURED : t < 0.7 ? TRUST_DERIVED : TRUST_CATEGORICAL;
    }
    wf.pushRow(values, trust);
    wf.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
