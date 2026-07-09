// A small SVG arc gauge for a single real value, always shown with its true
// unit and range (dBm / dB-Hz). RSSI-only radios use these as level readouts —
// we never imply an SNR we can't measure.

export interface GaugeOptions {
  label: string;
  unit: string;
  min: number;
  max: number;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 180) * Math.PI) / 180; // 180°..360° sweep (top semicircle)
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x0, y0] = polar(cx, cy, r, startDeg);
  const [x1, y1] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export class Gauge {
  readonly element: HTMLElement;
  private valueArc: SVGPathElement;
  private valueText: SVGTextElement;

  constructor(private opts: GaugeOptions) {
    const wrap = document.createElement('div');
    wrap.className = 'gauge';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 62');

    const track = document.createElementNS(NS, 'path');
    track.setAttribute('d', arcPath(50, 55, 42, 180, 360));
    track.setAttribute('class', 'gauge-track');

    this.valueArc = document.createElementNS(NS, 'path');
    this.valueArc.setAttribute('class', 'gauge-value');

    this.valueText = document.createElementNS(NS, 'text');
    this.valueText.setAttribute('x', '50');
    this.valueText.setAttribute('y', '48');
    this.valueText.setAttribute('text-anchor', 'middle');
    this.valueText.setAttribute('class', 'gauge-num');
    this.valueText.textContent = '—';

    const unit = document.createElementNS(NS, 'text');
    unit.setAttribute('x', '50');
    unit.setAttribute('y', '59');
    unit.setAttribute('text-anchor', 'middle');
    unit.setAttribute('class', 'gauge-unit');
    unit.textContent = opts.unit;

    svg.append(track, this.valueArc, this.valueText, unit);

    const label = document.createElement('div');
    label.className = 'gauge-label';
    label.textContent = opts.label;

    wrap.append(svg, label);
    this.element = wrap;
    this.update(null);
  }

  update(value: number | null): void {
    if (value === null || Number.isNaN(value)) {
      this.valueArc.setAttribute('d', '');
      this.valueText.textContent = '—';
      return;
    }
    const f = Math.max(0, Math.min(1, (value - this.opts.min) / (this.opts.max - this.opts.min)));
    this.valueArc.setAttribute('d', arcPath(50, 55, 42, 180, 180 + f * 180));
    this.valueText.textContent = value.toFixed(0);
  }
}
