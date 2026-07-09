// Bluetooth Classic device list (discovery snapshot). Inquiry RSSI where the
// controller reports it; no frequency (Classic hops across 79 channels).

import type { RfSample } from '../../core/model';

export class BtPanel {
  readonly element: HTMLElement;
  private list: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Bluetooth Classic — discovery snapshot (~12 s cycles)';
    this.list = document.createElement('div');
    this.list.className = 'ap-list';
    wrap.append(h, this.list);
    this.element = wrap;
  }

  update(samples: RfSample[]): void {
    const devs = samples.filter((s) => s.source === 'bt_classic').sort((a, b) => b.value - a.value);
    this.list.replaceChildren();
    for (const s of devs) {
      const reported = s.extras.rssiReported === true;
      const row = document.createElement('div');
      row.className = 'ap-row';

      const nameCol = document.createElement('div');
      nameCol.className = 'ap-col';
      const name = document.createElement('div');
      name.className = 'ap-name';
      name.textContent = String(s.extras.name || s.identity); // safe
      const meta = document.createElement('div');
      meta.className = 'ap-meta';
      meta.textContent = s.identity;
      nameCol.append(name, meta);

      const track = document.createElement('div');
      track.className = 'ap-track';
      const fill = document.createElement('div');
      fill.className = 'ap-fill';
      fill.style.width = `${Math.max(0, Math.min(100, ((s.value + 110) / 70) * 100))}%`;
      track.appendChild(fill);

      const num = document.createElement('div');
      num.className = 'ap-num';
      num.textContent = reported ? `${s.value.toFixed(0)}` : '—';

      row.append(nameCol, track, num);
      this.list.appendChild(row);
    }
    if (!devs.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No Classic devices yet (discovery is APK-only, slow).';
      this.list.appendChild(empty);
    }
  }
}
