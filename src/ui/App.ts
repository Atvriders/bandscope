// App shell: wires the radio registry → per-band rasterization → the WebGL
// waterfall, and mounts the honesty banner, provenance toggle, frequency-axis
// legend, and live gauges. UI is intentionally framework-free (small, portable
// to the Capacitor WebView unchanged).

import { Capacitor } from '@capacitor/core';
import { buildRegistry } from '../sources/registry';
import { Waterfall } from '../render/waterfall';
import { rasterize } from '../render/rasterize';
import { DEFAULT_SEGMENTS } from '../core/axis';
import { type Emission } from '../core/model';
import { createHonestyBanner } from './HonestyBanner';
import { Gauge } from './Gauge';
import { GnssPanel } from './panels/GnssPanel';
import { WifiPanel } from './panels/WifiPanel';
import { CellPanel } from './panels/CellPanel';

const BINS = 720;
const ROWS = 256;

export class App {
  private wf!: Waterfall;
  private canvas!: HTMLCanvasElement;
  private controller = new AbortController();
  private gauges: Record<'gnss' | 'cell' | 'wifi', Gauge> = {} as never;
  private gnssPanel = new GnssPanel();
  private wifiPanel = new WifiPanel();
  private cellPanel = new CellPanel();
  private overlay!: HTMLElement;
  private panelEls: Record<string, HTMLElement> = {};
  private tabButtons: Record<string, HTMLButtonElement> = {};

  start(): void {
    const app = document.getElementById('app')!;
    this.canvas = document.getElementById('waterfall') as HTMLCanvasElement;

    // --- header: brand + provenance toggle ---
    const header = document.createElement('header');
    header.className = 'topbar';
    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.textContent = 'BandScope';
    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group';
    for (const [key, label] of [
      ['gnss', 'GNSS'],
      ['wifi', 'WiFi'],
      ['cell', 'Cell'],
    ] as const) {
      const b = document.createElement('button');
      b.className = 'prov-btn';
      b.textContent = label;
      b.onclick = () => this.togglePanel(key);
      this.tabButtons[key] = b;
      btnGroup.appendChild(b);
    }
    const provBtn = document.createElement('button');
    provBtn.className = 'prov-btn';
    provBtn.textContent = 'Show provenance';
    let prov = false;
    provBtn.onclick = () => {
      prov = !prov;
      this.wf.setProvenance(prov);
      provBtn.classList.toggle('on', prov);
      provBtn.textContent = prov ? 'Show signal' : 'Show provenance';
    };
    btnGroup.appendChild(provBtn);
    header.append(brand, btnGroup);

    // --- honesty banner ---
    const banner = createHonestyBanner();

    // --- frequency-axis legend (widths match the segmented axis) ---
    const axis = document.createElement('div');
    axis.className = 'axis';
    for (const seg of DEFAULT_SEGMENTS) {
      const s = document.createElement('span');
      s.className = 'axis-seg';
      s.style.flexGrow = String(seg.widthFrac);
      s.textContent = seg.label;
      axis.appendChild(s);
    }

    // --- gauges (only genuine values; RSSI shown as level, not SNR) ---
    const gaugeRow = document.createElement('div');
    gaugeRow.className = 'gauges';
    this.gauges = {
      gnss: new Gauge({ label: 'Best GNSS C/N0', unit: 'dB-Hz', min: 0, max: 55 }),
      cell: new Gauge({ label: 'Serving RSRP', unit: 'dBm', min: -140, max: -44 }),
      wifi: new Gauge({ label: 'Best WiFi RSSI', unit: 'dBm', min: -95, max: -30 }),
    };
    gaugeRow.append(this.gauges.gnss.element, this.gauges.cell.element, this.gauges.wifi.element);

    // --- detail overlay with tabbed panels (GNSS / WiFi / Cell) ---
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    const close = document.createElement('button');
    close.className = 'overlay-close';
    close.textContent = '✕';
    close.onclick = () => this.closePanels();
    this.panelEls = {
      gnss: this.gnssPanel.element,
      wifi: this.wifiPanel.element,
      cell: this.cellPanel.element,
    };
    this.overlay.appendChild(close);
    for (const el of Object.values(this.panelEls)) {
      el.classList.add('hidden');
      this.overlay.appendChild(el);
    }

    // assemble around the existing canvas
    app.insertBefore(header, this.canvas);
    app.insertBefore(banner, this.canvas);
    app.insertBefore(axis, this.canvas.nextSibling);
    app.appendChild(gaugeRow);
    app.appendChild(this.overlay);

    // --- renderer + sources (native radios on the APK, mock in the browser) ---
    this.wf = new Waterfall(this.canvas, BINS, ROWS);
    for (const src of buildRegistry({ isNative: Capacitor.isNativePlatform() })) {
      src.stream(this.controller.signal, (e) => this.onEmit(e));
    }

    const loop = () => {
      if (this.controller.signal.aborted) return;
      this.wf.resize();
      this.wf.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private togglePanel(key: string): void {
    const alreadyOpen = this.overlay.classList.contains('open') && !this.panelEls[key].classList.contains('hidden');
    if (alreadyOpen) {
      this.closePanels();
      return;
    }
    this.overlay.classList.add('open');
    for (const [k, el] of Object.entries(this.panelEls)) {
      el.classList.toggle('hidden', k !== key);
      this.tabButtons[k]?.classList.toggle('on', k === key);
    }
  }

  private closePanels(): void {
    this.overlay.classList.remove('open');
    for (const b of Object.values(this.tabButtons)) b.classList.remove('on');
  }

  private onEmit(e: Emission): void {
    if (e.kind !== 'markers') return;

    let bestGnss: number | null = null;
    let servingRsrp: number | null = null;
    let bestWifi: number | null = null;
    for (const s of e.samples) {
      if (s.source === 'gnss') bestGnss = Math.max(bestGnss ?? -Infinity, s.value);
      if (s.source === 'cellular' && s.extras.serving) servingRsrp = s.value;
      if (s.source === 'wifi') bestWifi = Math.max(bestWifi ?? -Infinity, s.value);
    }

    const row = rasterize(e.samples, BINS);
    this.wf.pushRow(row.values, row.trust);
    this.gauges.gnss.update(bestGnss);
    this.gauges.cell.update(servingRsrp);
    this.gauges.wifi.update(bestWifi);
    this.gnssPanel.update(e.samples);
    this.wifiPanel.update(e.samples);
    this.cellPanel.update(e.samples);
  }

  stop(): void {
    this.controller.abort();
    this.wf?.dispose();
  }
}
