// BLE detail panel: devices sorted by RSSI, with a rough path-loss distance
// (clearly an estimate, from the REMOTE device's declared TX power). No
// frequency — 2.4 GHz, channel unknown. Names via textContent (safe).

import type { RfSample } from '../../core/model';
import { estimateDistanceM } from '../../sources/native/bleMap';

export class BlePanel {
  readonly element: HTMLElement;
  private list: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'BLE devices — RSSI (dBm), 2.4 GHz (channel unknown)';
    this.list = document.createElement('div');
    this.list.className = 'ap-list';
    wrap.append(h, this.list);
    this.element = wrap;
  }

  update(samples: RfSample[]): void {
    const devs = samples.filter((s) => s.source === 'ble').sort((a, b) => b.value - a.value);
    this.list.replaceChildren();
    for (const s of devs) {
      const row = document.createElement('div');
      row.className = 'ap-row';

      const nameCol = document.createElement('div');
      nameCol.className = 'ap-col';
      const name = document.createElement('div');
      name.className = 'ap-name';
      name.textContent = String(s.extras.name || s.identity); // safe
      const meta = document.createElement('div');
      meta.className = 'ap-meta';
      const tx = s.extras.txPower;
      const dist =
        typeof tx === 'number' ? ` · ~${estimateDistanceM(s.value, tx).toFixed(1)} m (est)` : '';
      meta.textContent = `${s.identity}${dist}`;
      nameCol.append(name, meta);

      const track = document.createElement('div');
      track.className = 'ap-track';
      const fill = document.createElement('div');
      fill.className = 'ap-fill';
      const pct = Math.max(0, Math.min(100, ((s.value + 100) / 60) * 100));
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      const num = document.createElement('div');
      num.className = 'ap-num';
      num.textContent = `${s.value.toFixed(0)}`;

      row.append(nameCol, track, num);
      this.list.appendChild(row);
    }
    if (!devs.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No BLE devices yet (full scan is APK-only).';
      this.list.appendChild(empty);
    }
  }
}
