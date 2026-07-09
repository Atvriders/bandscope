// GNSS detail panel: a polar sky-plot (satellites by az/el, colored by
// constellation, sized by C/N0) plus a per-satellite C/N0 bar chart. Fed by the
// GNSS samples flowing through the app. This is the flagship real-data view.

import type { RfSample } from '../../core/model';
import { projectSky, constellationColor } from './skyplot';

const NS = 'http://www.w3.org/2000/svg';
const R = 90; // sky-plot radius in SVG units

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

export class GnssPanel {
  readonly element: HTMLElement;
  private dots: SVGGElement;
  private bars: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel gnss-panel';

    const title = document.createElement('h2');
    title.textContent = 'GNSS — per-satellite C/N0 (dB-Hz)';
    wrap.appendChild(title);

    // --- sky-plot ---
    const svg = svgEl('svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.setAttribute('class', 'skyplot');
    for (const el of [30, 60, 90] as const) {
      const c = svgEl('circle');
      c.setAttribute('cx', '0');
      c.setAttribute('cy', '0');
      c.setAttribute('r', String((R * (90 - el)) / 90 || R));
      c.setAttribute('class', 'sky-ring');
      svg.appendChild(c);
    }
    const outer = svgEl('circle');
    outer.setAttribute('cx', '0');
    outer.setAttribute('cy', '0');
    outer.setAttribute('r', String(R));
    outer.setAttribute('class', 'sky-ring outer');
    svg.appendChild(outer);
    for (const [label, x, y] of [
      ['N', 0, -R - 3],
      ['S', 0, R + 9],
      ['E', R + 4, 3],
      ['W', -R - 8, 3],
    ] as const) {
      const t = svgEl('text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(y));
      t.setAttribute('class', 'sky-card');
      t.textContent = label;
      svg.appendChild(t);
    }
    this.dots = svgEl('g');
    svg.appendChild(this.dots);
    wrap.appendChild(svg);

    // --- C/N0 bars ---
    this.bars = document.createElement('div');
    this.bars.className = 'cn0-bars';
    wrap.appendChild(this.bars);

    this.element = wrap;
  }

  /** Update from the latest GNSS samples (source === 'gnss'). */
  update(samples: RfSample[]): void {
    const sats = samples.filter((s) => s.source === 'gnss');

    // sky-plot dots
    this.dots.replaceChildren();
    for (const s of sats) {
      const az = Number(s.extras.azimuth ?? 0);
      const el = Number(s.extras.elevation ?? 0);
      const constellation = String(s.extras.constellation ?? 'Unknown');
      const { x, y } = projectSky(az, el, R);
      const dot = svgEl('circle');
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', (2 + (s.value / 50) * 4).toFixed(1));
      dot.setAttribute('fill', constellationColor(constellation));
      dot.setAttribute('opacity', s.extras.usedInFix ? '1' : '0.45');
      this.dots.appendChild(dot);
    }

    // C/N0 bars (sorted strongest first)
    this.bars.replaceChildren();
    for (const s of [...sats].sort((a, b) => b.value - a.value)) {
      const constellation = String(s.extras.constellation ?? 'Unknown');
      const row = document.createElement('div');
      row.className = 'cn0-row';

      const label = document.createElement('span');
      label.className = 'cn0-label';
      label.textContent = String(s.channel ?? s.identity); // textContent: safe
      label.style.color = constellationColor(constellation);

      const track = document.createElement('div');
      track.className = 'cn0-track';
      const fill = document.createElement('div');
      fill.className = 'cn0-fill';
      fill.style.width = `${Math.max(0, Math.min(100, (s.value / 55) * 100))}%`;
      // green >40, amber 25–40, red <25 dB-Hz
      fill.style.background = s.value > 40 ? '#48bb78' : s.value >= 25 ? '#f6ad55' : '#fc8181';
      track.appendChild(fill);

      const num = document.createElement('span');
      num.className = 'cn0-num';
      num.textContent = `${s.value.toFixed(0)}`;

      row.append(label, track, num);
      this.bars.appendChild(row);
    }
  }
}
