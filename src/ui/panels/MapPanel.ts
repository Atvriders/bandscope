// Wardriving map: plots each discovered emitter at its strongest-signal fix,
// colored by per-band normalized signal, over an OpenStreetMap base. Recording
// is OFF by default and opt-in (privacy), with an anonymization toggle. Popups
// and exports honor anonymization.

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { normalize01 } from '../../core/normalize';
import type { SessionRecorder } from '../../geo/recorder';

// Raster OSM style — no API key. Personal/light use per the OSM tile policy.
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export class MapPanel {
  readonly element: HTMLElement;
  private mapEl: HTMLElement;
  private map: maplibregl.Map | null = null;
  private centered = false;
  private recBtn: HTMLButtonElement;

  constructor(
    private recorder: SessionRecorder,
    private onToggleRecord: (on: boolean) => void,
  ) {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Wardriving map — emitters at strongest-signal location';

    const controls = document.createElement('div');
    controls.className = 'map-controls';

    this.recBtn = document.createElement('button');
    this.recBtn.className = 'prov-btn';
    this.recBtn.textContent = '● Record';
    this.recBtn.onclick = () => {
      const on = !this.recorder.recording;
      this.onToggleRecord(on);
      this.syncRecBtn();
    };

    const anonBtn = document.createElement('button');
    anonBtn.className = 'prov-btn';
    anonBtn.textContent = 'Anonymize: off';
    anonBtn.onclick = () => {
      this.recorder.anonymize = !this.recorder.anonymize;
      anonBtn.textContent = `Anonymize: ${this.recorder.anonymize ? 'on' : 'off'}`;
      anonBtn.classList.toggle('on', this.recorder.anonymize);
    };

    const clearBtn = document.createElement('button');
    clearBtn.className = 'prov-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => {
      this.recorder.clear();
      this.centered = false;
      this.refresh();
    };

    const exportBtn = document.createElement('button');
    exportBtn.className = 'prov-btn';
    exportBtn.textContent = '⤓ CSV';
    exportBtn.onclick = () => this.exportCsv();

    controls.append(this.recBtn, anonBtn, clearBtn, exportBtn);

    const note = document.createElement('div');
    note.className = 'panel-empty';
    note.textContent =
      'Off by default. Records where each AP/cell/device is heard strongest. ' +
      'Enable Anonymize to truncate MAC/BSSID in the map and export.';

    this.mapEl = document.createElement('div');
    this.mapEl.className = 'map-canvas';

    wrap.append(h, controls, note, this.mapEl);
    this.element = wrap;
  }

  private syncRecBtn(): void {
    this.recBtn.classList.toggle('on', this.recorder.recording);
    this.recBtn.textContent = this.recorder.recording ? '■ Stop' : '● Record';
  }

  /** Init (lazily) or resize the map when the panel opens. */
  open(): void {
    if (!this.map) {
      this.map = new maplibregl.Map({
        container: this.mapEl,
        style: OSM_STYLE as never,
        center: [0, 20],
        zoom: 1.5,
        attributionControl: { compact: true },
      });
      this.map.on('load', () => {
        this.map!.addSource('track', { type: 'geojson', data: this.trackGeoJson() });
        this.map!.addLayer({
          id: 'track',
          type: 'line',
          source: 'track',
          paint: { 'line-color': '#4fd1c5', 'line-width': 3, 'line-opacity': 0.7 },
        });
        this.map!.addSource('obs', { type: 'geojson', data: this.obsGeoJson() });
        this.map!.addLayer({
          id: 'obs',
          type: 'circle',
          source: 'obs',
          paint: {
            'circle-radius': 6,
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'v'],
              0,
              '#3b1f5e',
              0.5,
              '#21918c',
              1,
              '#fde725',
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#000',
          },
        });
        this.map!.on('click', 'obs', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { id: string; source: string; detail: string };
          new maplibregl.Popup()
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setText(`${p.source} · ${p.id} · ${p.detail}`)
            .addTo(this.map!);
        });
      });
    } else {
      this.map.resize();
    }
    this.syncRecBtn();
  }

  /** Push the latest recorded data into the map sources. */
  refresh(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;
    (this.map.getSource('track') as maplibregl.GeoJSONSource | undefined)?.setData(this.trackGeoJson());
    (this.map.getSource('obs') as maplibregl.GeoJSONSource | undefined)?.setData(this.obsGeoJson());
    const last = this.recorder.fixes[this.recorder.fixes.length - 1];
    if (last && !this.centered) {
      this.map.flyTo({ center: [last.lon, last.lat], zoom: 16 });
      this.centered = true;
    }
  }

  private trackGeoJson(): GeoJSON.Feature {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: this.recorder.fixes.map((f) => [f.lon, f.lat]),
      },
    };
  }

  private obsGeoJson(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.recorder.observations().map((o) => ({
        type: 'Feature',
        properties: {
          v: normalize01(o.source, o.value),
          id: this.recorder.displayId(o),
          source: o.source,
          detail: `${o.value.toFixed(0)}${o.centerFreqHz ? ' · ' + Math.round(o.centerFreqHz / 1e6) + ' MHz' : ''}`,
        },
        geometry: { type: 'Point', coordinates: [o.lon, o.lat] },
      })),
    };
  }

  private exportCsv(): void {
    const blob = new Blob([this.recorder.toCsv()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bandscope-wardrive.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
