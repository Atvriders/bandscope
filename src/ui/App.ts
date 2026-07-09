// Dashboard shell ("Comm Stack"): all radios visible at once as fixed live
// readout tiles — no tabs for basic info. Sources emit independently into a
// SampleStore; a single throttled tick reads one merged snapshot and drives the
// combined-spectrum strip + every tile with in-place (non-flashing) updates.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { buildRegistry } from '../sources/registry';
import { Waterfall } from '../render/waterfall';
import { Canvas2DWaterfall } from '../render/waterfall2d';
import type { WaterfallLike } from '../render/WaterfallLike';
import { rasterize } from '../render/rasterize';
import { SampleStore } from '../core/SampleStore';
import type { Emission, RfSample } from '../core/model';
import { createHonestyBanner } from './HonestyBanner';
import { el } from './dash/parts';
import { radioTile, nfcTile, uwbTile, type Tile } from './dash/tiles';
import { toCsv } from '../export/csv';
import { SessionRecorder, type Fix } from '../geo/recorder';
import { PositionProvider } from '../geo/position';
import type { MapPanel } from './panels/MapPanel';

const BINS = 720;
const ROWS = 256;
const TICK_MS = 200; // ~5 Hz: one combined strip row + tile refresh per tick

const strongest = (items: RfSample[]): RfSample | null =>
  items.length ? items.reduce((b, s) => (s.value > b.value ? s : b), items[0]) : null;

const nameOf = (s: RfSample): string => String(s.extras.name || s.identity);
const mhz = (s: RfSample): string => (s.centerFreqHz ? `${Math.round(s.centerFreqHz / 1e6)} MHz` : '');

function cellMeta(items: RfSample[]): string {
  if (!items.length) return 'no cells yet';
  const sv = items.find((s) => s.extras.serving);
  if (!sv) return `${items.length} cells · ARFCN + power only`;
  const band = sv.extras.band ? `B${String(sv.extras.band)}` : String(sv.extras.rat ?? '');
  const f = sv.centerFreqHz ? `${(Math.round(sv.centerFreqHz / 1e5) / 10).toFixed(1)} MHz (computed)` : '';
  const sinr = sv.snrDb != null ? ` · SINR ${sv.snrDb.toFixed(0)}` : '';
  return `${band} · ${String(sv.channel ?? '')} · ${f}${sinr}`;
}

export class App {
  private store = new SampleStore();
  private wf: WaterfallLike | null = null;
  private canvas!: HTMLCanvasElement;
  private controller = new AbortController();
  private tiles: Tile[] = [];
  private lastTick = 0;

  // wardriving map kept as a separate full-screen tool
  private recorder = new SessionRecorder();
  private posProvider = new PositionProvider();
  private mapPanel: MapPanel | null = null;
  private mapPanelPromise: Promise<MapPanel> | null = null;
  private mapHost = el('div', 'overlay');
  private currentFix: Fix | null = null;
  private mapOpen = false;
  private lastMapRefresh = 0;

  start(): void {
    const app = document.getElementById('app')!;
    this.canvas = document.getElementById('waterfall') as HTMLCanvasElement;

    // --- header ---
    const header = el('header', 'topbar');
    header.append(el('div', 'brand', 'BandScope'));
    const fallbackChip = el('span', 'chip hidden', '2D');
    const btns = el('div', 'btn-group');
    const provBtn = el('button', 'prov-btn', 'prov');
    let prov = false;
    provBtn.onclick = () => {
      prov = !prov;
      this.wf?.setProvenance(prov);
      provBtn.classList.toggle('on', prov);
    };
    const csvBtn = el('button', 'prov-btn', '⤓ CSV');
    csvBtn.onclick = () => this.exportCsv();
    const mapBtn = el('button', 'prov-btn', 'Map');
    mapBtn.onclick = () => this.openMap();
    btns.append(fallbackChip, provBtn, csvBtn, mapBtn);
    header.append(btns);

    // --- honesty legend ---
    const banner = createHonestyBanner();

    // --- combined-spectrum strip (the demoted waterfall) ---
    const strip = el('div', 'strip');
    strip.appendChild(this.canvas); // move canvas into the strip

    // --- tile grid ---
    const grid = el('div', 'grid');
    this.tiles = this.buildTiles();
    for (const t of this.tiles) grid.appendChild(t.element);

    // --- map overlay (lazy) ---
    const mapClose = el('button', 'overlay-close', '✕');
    mapClose.onclick = () => this.closeMap();
    this.mapHost.appendChild(mapClose);

    app.replaceChildren(header, banner, strip, grid, this.mapHost);

    // --- renderer: GL, falling back to 2D so the strip is never blank ---
    try {
      this.wf = new Waterfall(this.canvas, BINS, ROWS);
    } catch (glErr) {
      console.warn('WebGL waterfall unavailable, using 2D fallback', glErr);
      try {
        // A canvas that was bound to a (failed) WebGL context can never return a
        // 2D context — swap in a fresh element before the 2D fallback.
        const fresh = document.createElement('canvas');
        fresh.id = this.canvas.id;
        fresh.className = this.canvas.className;
        this.canvas.replaceWith(fresh);
        this.canvas = fresh;
        this.wf = new Canvas2DWaterfall(this.canvas, BINS, ROWS);
        fallbackChip.classList.remove('hidden');
      } catch (err2) {
        console.error('2D waterfall also failed', err2);
      }
    }

    // --- sources (serial permission bootstrap on native) → store ---
    void this.startSources();

    const loop = () => {
      if (this.controller.signal.aborted) return;
      const now = Date.now();
      this.wf?.resize();
      if (now - this.lastTick >= TICK_MS) {
        this.lastTick = now;
        this.tick(now);
      }
      this.wf?.render();
      if (this.mapOpen && this.mapPanel && now - this.lastMapRefresh > 800) {
        this.mapPanel.refresh();
        this.lastMapRefresh = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private buildTiles(): Tile[] {
    return [
      radioTile({
        id: 'gnss', label: 'GNSS', unit: 'dB-Hz', trust: 'measured', full: true,
        hero: strongest,
        meta: (items) =>
          items.length
            ? `${items.length} sats · ${items.filter((s) => s.extras.usedInFix).length} in fix · ${[...new Set(items.map((s) => String(s.extras.constellation ?? '')))].filter(Boolean).join(' ')}`
            : 'acquiring satellites…',
        rowLabel: (s) => String(s.channel ?? s.identity),
        rowSub: (s) => `${String(s.extras.constellation ?? '')} ${String(s.extras.band ?? '')}`.trim(),
        rowSort: (a, b) => b.value - a.value,
      }),
      radioTile({
        id: 'cellular', label: 'CELL', unit: 'dBm', trust: 'derived', full: true,
        hero: (items) => items.find((s) => s.extras.serving) ?? strongest(items),
        meta: cellMeta,
        rowLabel: (s) => `${String(s.extras.rat ?? '')} ${String(s.channel ?? '')}`.trim(),
        rowSub: (s) => mhz(s),
        rowSort: (a, b) => (b.extras.serving ? 1 : 0) - (a.extras.serving ? 1 : 0) || b.value - a.value,
      }),
      radioTile({
        id: 'wifi', label: 'WIFI', unit: 'dBm', trust: 'measured', full: true,
        hero: strongest,
        meta: (items) => {
          if (!items.length) return 'scanning…';
          const t = strongest(items)!;
          return `${String(t.extras.ssid || '(hidden)')} · ch ${String(t.channel ?? '')} · ${mhz(t)} · ${items.length} APs`;
        },
        rowLabel: (s) => String(s.extras.ssid || '(hidden)'),
        rowSub: (s) => `ch ${String(s.channel ?? '')} · ${mhz(s)}`,
        rowSort: (a, b) => b.value - a.value,
      }),
      radioTile({
        id: 'ble', label: 'BLE', unit: 'dBm', trust: 'measured', full: false,
        hero: strongest,
        meta: (items) => (items.length ? `${items.length} near · 2.4 GHz, no channel` : 'scanning…'),
        rowLabel: nameOf,
        rowSub: (s) => s.identity,
        rowSort: (a, b) => b.value - a.value,
      }),
      radioTile({
        id: 'bt_classic', label: 'BT', unit: 'dBm', trust: 'measured', full: false,
        hero: strongest,
        meta: (items) => (items.length ? `${items.length} found · no freq` : 'discovery…'),
        rowLabel: nameOf,
        rowSub: (s) => s.identity,
        rowSort: (a, b) => b.value - a.value,
      }),
      nfcTile(),
      uwbTile(),
    ];
  }

  private tick(now: number): void {
    const snapshot = this.store.snapshot(now);
    const row = rasterize(snapshot, BINS); // null-freq radios (BLE/BT) contribute nothing
    this.wf?.pushRow(row.values, row.trust);
    const ctx = { snapshot, events: this.store.recentEvents(), now };
    for (const t of this.tiles) t.update(ctx);
  }

  private async startSources(): Promise<void> {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) await this.bootstrapPermissions();
    for (const src of buildRegistry({ isNative })) {
      src.stream(this.controller.signal, (e) => this.onEmit(e));
    }
  }

  // Serial permission requests so the plugins' dialogs don't collide (which
  // auto-denies the losers and shows as "no data"). Location→phone→bluetooth.
  private async bootstrapPermissions(): Promise<void> {
    for (const name of ['Gnss', 'Cellular', 'Ble']) {
      try {
        const p = registerPlugin(name) as { requestPermissions?: () => Promise<unknown> };
        await p.requestPermissions?.();
      } catch {
        /* denied/unavailable — that tile stays empty */
      }
    }
  }

  private onEmit(e: Emission): void {
    this.store.ingest(e, Date.now());
    if (e.kind === 'markers') this.recorder.addSamples(e.samples, this.currentFix);
  }

  private exportCsv(): void {
    const csv = toCsv(this.store.snapshot(Date.now()));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bandscope-snapshot.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- wardriving map (separate full-screen tool) ---
  private async openMap(): Promise<void> {
    try {
      // Memoize the (lazy) build so a double-tap can't create two MapPanels.
      if (!this.mapPanelPromise) {
        this.mapPanelPromise = (async () => {
          const { MapPanel } = await import('./panels/MapPanel');
          const panel = new MapPanel(this.recorder, (on) => this.setRecording(on));
          this.mapHost.appendChild(panel.element);
          this.mapPanel = panel;
          return panel;
        })();
      }
      const panel = await this.mapPanelPromise;
      this.mapHost.classList.add('open');
      this.mapOpen = true;
      panel.open();
    } catch (err) {
      this.mapPanelPromise = null; // allow retry after a failed load
      console.error('Map failed to open', err);
    }
  }

  private closeMap(): void {
    this.mapHost.classList.remove('open');
    this.mapOpen = false;
  }

  private setRecording(on: boolean): void {
    if (on) {
      this.recorder.start();
      void this.posProvider.start((fix) => {
        this.currentFix = fix;
        this.recorder.addFix(fix);
      });
    } else {
      this.recorder.stop();
      void this.posProvider.stop();
    }
  }

  stop(): void {
    this.controller.abort();
    this.wf?.dispose();
  }
}
