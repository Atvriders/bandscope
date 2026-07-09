// WiFi detail panel: a live AP list sorted by RSSI, with band/channel/exact MHz,
// a level bar (dBm, NOT an SNR), and the security from capabilities. All dynamic
// text uses textContent — a hostile SSID can never inject markup.

import type { RfSample } from '../../core/model';

function bandLabel(freqHz: number): string {
  const mhz = freqHz / 1e6;
  if (mhz < 2500) return '2.4';
  if (mhz < 5895) return '5';
  return '6E';
}

function securityLabel(cap: string): string {
  if (/SAE|WPA3/.test(cap)) return 'WPA3';
  if (/WPA2|RSN/.test(cap)) return 'WPA2';
  if (/WPA/.test(cap)) return 'WPA';
  if (/WEP/.test(cap)) return 'WEP';
  return 'Open';
}

export class WifiPanel {
  readonly element: HTMLElement;
  private list: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'WiFi access points — RSSI (dBm) at exact channel';
    this.list = document.createElement('div');
    this.list.className = 'ap-list';
    wrap.append(h, this.list);
    this.element = wrap;
  }

  update(samples: RfSample[]): void {
    const aps = samples.filter((s) => s.source === 'wifi').sort((a, b) => b.value - a.value);
    this.list.replaceChildren();
    for (const s of aps) {
      const row = document.createElement('div');
      row.className = 'ap-row';

      const name = document.createElement('div');
      name.className = 'ap-name';
      name.textContent = String(s.extras.ssid || '(hidden)'); // safe
      const meta = document.createElement('div');
      meta.className = 'ap-meta';
      const mhz = s.centerFreqHz ? Math.round(s.centerFreqHz / 1e6) : 0;
      meta.textContent = `${bandLabel(s.centerFreqHz ?? 0)} GHz · ch ${s.channel} · ${mhz} MHz · ${securityLabel(String(s.extras.capabilities ?? ''))}`;
      const nameCol = document.createElement('div');
      nameCol.className = 'ap-col';
      nameCol.append(name, meta);

      const track = document.createElement('div');
      track.className = 'ap-track';
      const fill = document.createElement('div');
      fill.className = 'ap-fill';
      // -90..-30 dBm → 0..100%
      const pct = Math.max(0, Math.min(100, ((s.value + 90) / 60) * 100));
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      const num = document.createElement('div');
      num.className = 'ap-num';
      num.textContent = `${s.value.toFixed(0)}`;

      row.append(nameCol, track, num);
      this.list.appendChild(row);
    }
    if (!aps.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No APs yet (WiFi scan is APK-only; throttled ~4/2min).';
      this.list.appendChild(empty);
    }
  }
}
