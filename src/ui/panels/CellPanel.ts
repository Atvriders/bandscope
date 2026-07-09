// Cellular detail panel: the serving cell as a hero card (RAT, band, ARFCN,
// computed MHz, RSRP/RSRQ/SINR) plus neighbors. Frequency is honestly marked
// "computed from ARFCN". RSSI-style radios never get a fake SNR — SINR shows
// only when the modem reported it.

import type { RfSample } from '../../core/model';

function line(label: string, value: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'kv';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'v';
  v.textContent = value;
  el.append(k, v);
  return el;
}

export class CellPanel {
  readonly element: HTMLElement;
  private body: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Cellular — RSRP (dBm), frequency computed from ARFCN';
    this.body = document.createElement('div');
    this.body.className = 'cell-body';
    wrap.append(h, this.body);
    this.element = wrap;
  }

  update(samples: RfSample[]): void {
    const cells = samples.filter((s) => s.source === 'cellular');
    this.body.replaceChildren();

    const serving = cells.find((c) => c.extras.serving);
    if (serving) {
      const hero = document.createElement('div');
      hero.className = 'cell-hero';
      const mhz = serving.centerFreqHz ? Math.round(serving.centerFreqHz / 1e5) / 10 : 0;
      const band = serving.extras.band ? `B${serving.extras.band}` : '—';
      hero.append(
        line('RAT', String(serving.extras.rat)),
        line('Band / ARFCN', `${band} · ${serving.channel}`),
        line('Frequency', `${mhz} MHz (computed)`),
        line('RSRP', `${serving.value.toFixed(0)} dBm`),
        line('RSRQ', serving.extras.rsrq != null ? `${serving.extras.rsrq} dB` : '—'),
        line('SINR', serving.snrDb != null ? `${serving.snrDb.toFixed(0)} dB` : 'not reported'),
        line('PCI', String(serving.extras.pci ?? '—')),
      );
      this.body.appendChild(hero);
    }

    const neighbors = cells.filter((c) => !c.extras.serving);
    if (neighbors.length) {
      const nh = document.createElement('h3');
      nh.className = 'cell-sub';
      nh.textContent = `Neighbors (${neighbors.length}) — ARFCN + power only`;
      this.body.appendChild(nh);
      for (const n of neighbors) {
        const mhz = n.centerFreqHz ? Math.round(n.centerFreqHz / 1e6) : 0;
        this.body.appendChild(
          line(`${n.extras.rat} ${n.channel}`, `${mhz} MHz · ${n.value.toFixed(0)} dBm`),
        );
      }
    }

    if (!cells.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No cells yet (cellular signal is APK-only).';
      this.body.appendChild(empty);
    }
  }
}
