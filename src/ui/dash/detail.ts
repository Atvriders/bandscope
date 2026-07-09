// Per-radio "view all" detail sheet: a full-screen list of every device/network
// for one radio, with complete honest detail. Reuses the overlay shell + the
// KeyedList in-place engine + the SAME tick snapshot the tiles use, so it never
// flashes and never diverges from the dashboard. No source changes — every field
// already lives in RfSample.extras.

import { normalize01 } from '../../core/normalize';
import type { EventEmission, RadioId, RfSample } from '../../core/model';
import { estimateDistanceM } from '../../sources/native/bleMap';
import { el, Bar, KeyedList, type Row } from './parts';

type TrustStr = 'measured' | 'derived' | 'categorical';
const s0 = (x: unknown): string => String(x ?? '');
const mhzOf = (s: RfSample): string => (s.centerFreqHz ? `${Math.round(s.centerFreqHz / 1e6)} MHz` : '');
const bwOf = (s: RfSample): string => (s.bandwidthHz ? `${Math.round(s.bandwidthHz / 1e6)} MHz` : '—');
const nameOf = (s: RfSample): string => s0(s.extras.name) || s.identity;

/** Parse an 802.11 capabilities string into a security label. */
export function securityLabel(caps: string): string {
  if (/SAE|WPA3/.test(caps)) return 'WPA3';
  if (/OWE/.test(caps)) return 'OWE';
  if (/WPA2|RSN/.test(caps)) return 'WPA2';
  if (/WPA/.test(caps)) return 'WPA';
  if (/WEP/.test(caps)) return 'WEP';
  return 'Open';
}

/** Map an Android major device-class constant to a human label. */
export function btClassLabel(cls: number): string {
  switch (cls) {
    case 0x0100: return 'Computer';
    case 0x0200: return 'Phone';
    case 0x0300: return 'Network';
    case 0x0400: return 'Audio/Video';
    case 0x0500: return 'Peripheral';
    case 0x0600: return 'Imaging';
    case 0x0700: return 'Wearable';
    case 0x0800: return 'Toy';
    case 0x0900: return 'Health';
    default: return 'Device';
  }
}

interface SortOpt {
  label: string;
  cmp: (a: RfSample, b: RfSample) => number;
}
export interface DetailConfig {
  id: RadioId;
  label: string;
  unit: string;
  trust: TrustStr;
  noun: string;
  mode: 'signal' | 'events';
  primary?: (s: RfSample) => string;
  lines?: (s: RfSample) => string[];
  value?: (s: RfSample) => string;
  showBar?: boolean;
  barTrust?: (s: RfSample) => TrustStr;
  sorts?: SortOpt[];
}

const bySignal: SortOpt = { label: 'Signal', cmp: (a, b) => b.value - a.value };
const byName: SortOpt = { label: 'Name', cmp: (a, b) => nameOf(a).localeCompare(nameOf(b)) };

export const DETAIL_CONFIGS: Record<string, DetailConfig> = {
  gnss: {
    id: 'gnss', label: 'GNSS', unit: 'dB-Hz', trust: 'measured', noun: 'sats', mode: 'signal', showBar: true,
    primary: (s) => `${s0(s.extras.constellation)} ${s0(s.channel)}`.trim(),
    lines: (s) => [
      `${s0(s.extras.band)} · el ${s0(s.extras.elevation)}° · az ${s0(s.extras.azimuth)}°`,
      s.extras.usedInFix ? 'in fix' : 'tracking',
    ],
    value: (s) => s.value.toFixed(0),
    sorts: [
      bySignal,
      { label: 'Elev', cmp: (a, b) => Number(b.extras.elevation ?? 0) - Number(a.extras.elevation ?? 0) },
      { label: 'SVID', cmp: (a, b) => s0(a.channel).localeCompare(s0(b.channel), undefined, { numeric: true }) },
    ],
  },
  wifi: {
    id: 'wifi', label: 'WIFI', unit: 'dBm', trust: 'measured', noun: 'APs', mode: 'signal', showBar: true,
    primary: (s) => s0(s.extras.ssid) || '(hidden)',
    lines: (s) => [
      `ch ${s0(s.channel)} · ${mhzOf(s)} · ${bwOf(s)}`,
      `${s.identity} · ${securityLabel(s0(s.extras.capabilities))}`,
    ],
    value: (s) => s.value.toFixed(0),
    sorts: [
      bySignal,
      { label: 'Channel', cmp: (a, b) => (a.centerFreqHz ?? 0) - (b.centerFreqHz ?? 0) },
      { label: 'SSID', cmp: (a, b) => s0(a.extras.ssid).localeCompare(s0(b.extras.ssid)) },
    ],
  },
  cellular: {
    id: 'cellular', label: 'CELL', unit: 'dBm', trust: 'derived', noun: 'cells', mode: 'signal', showBar: true,
    primary: (s) =>
      `${s0(s.extras.rat)} ${s.extras.band ? `B${s0(s.extras.band)}` : ''} ${s.extras.serving ? '· SERVING' : ''}`
        .replace(/\s+/g, ' ')
        .trim(),
    lines: (s) => [
      `${s.centerFreqHz ? `${(Math.round(s.centerFreqHz / 1e5) / 10).toFixed(1)} MHz (computed)` : ''} · ${s0(s.channel)}`,
      `PCI ${s0(s.extras.pci)}${s.extras.rsrq != null ? ` · RSRQ ${s0(s.extras.rsrq)}` : ''}${s.snrDb != null ? ` · SINR ${s.snrDb.toFixed(0)}` : ''}${s.extras.mccMnc ? ` · ${s0(s.extras.mccMnc)}` : ''}`,
    ],
    value: (s) => s.value.toFixed(0),
    sorts: [
      { label: 'Serving', cmp: (a, b) => (b.extras.serving ? 1 : 0) - (a.extras.serving ? 1 : 0) || b.value - a.value },
      bySignal,
      { label: 'Freq', cmp: (a, b) => (a.centerFreqHz ?? 0) - (b.centerFreqHz ?? 0) },
    ],
  },
  ble: {
    id: 'ble', label: 'BLE', unit: 'dBm', trust: 'measured', noun: 'devices', mode: 'signal', showBar: true,
    primary: (s) => s0(s.extras.name) || s.identity,
    lines: (s) => {
      const tx = s.extras.txPower;
      const dist =
        typeof tx === 'number' ? `≈ ${estimateDistanceM(s.value, tx).toFixed(1)} m · TxPwr ${tx}` : 'no TxPwr';
      return [dist, `${s.identity} · no freq (hops 2.4 GHz)`];
    },
    value: (s) => s.value.toFixed(0),
    sorts: [bySignal, byName],
  },
  bt_classic: {
    id: 'bt_classic', label: 'BT', unit: 'dBm', trust: 'measured', noun: 'devices', mode: 'signal', showBar: true,
    primary: (s) => s0(s.extras.name) || s.identity,
    lines: (s) => [
      `${btClassLabel(Number(s.extras.cls ?? 0))}${s.extras.rssiReported === false ? ' · no RSSI' : ''}`,
      `${s.identity} · no freq`,
    ],
    value: (s) => (s.extras.rssiReported === false ? '—' : s.value.toFixed(0)),
    sorts: [bySignal, byName],
  },
  nfc: {
    id: 'nfc', label: 'NFC', unit: '13.56 MHz', trust: 'categorical', noun: 'taps', mode: 'events',
  },
};

function detailRow(cfg: DetailConfig): Row {
  const rowEl = el('div', 'drow4');
  const main = el('div', 'drow4-main');
  const primary = el('div', 'drow4-primary');
  const pNode = document.createTextNode('');
  primary.appendChild(pNode);
  const l1 = el('div', 'drow4-line');
  const l1Node = document.createTextNode('');
  l1.appendChild(l1Node);
  const l2 = el('div', 'drow4-line');
  const l2Node = document.createTextNode('');
  l2.appendChild(l2Node);
  main.append(primary, l1, l2);

  const right = el('div', 'drow4-right');
  const val = el('div', 'drow4-val');
  const vNode = document.createTextNode('');
  val.appendChild(vNode);
  const bar = new Bar();
  right.append(val);
  if (cfg.showBar) right.append(bar.el);
  rowEl.append(main, right);

  let lp = '', l1s = '', l2s = '', lv = '';
  return {
    el: rowEl,
    update(s) {
      const p = cfg.primary!(s);
      if (p !== lp) { pNode.nodeValue = p; lp = p; }
      const lines = cfg.lines!(s);
      const a = lines[0] ?? '';
      if (a !== l1s) { l1Node.nodeValue = a; l1s = a; }
      const b = lines[1] ?? '';
      if (b !== l2s) { l2Node.nodeValue = b; l2s = b; }
      const v = cfg.value!(s);
      if (v !== lv) { vNode.nodeValue = v; lv = v; }
      if (cfg.showBar) bar.set(normalize01(s.source, s.value), cfg.barTrust ? cfg.barTrust(s) : cfg.trust);
    },
  };
}

export class DetailSheet {
  readonly element: HTMLElement;
  private titleNode: Text;
  private countNode: Text;
  private subNode: Text;
  private controls: HTMLElement;
  private listEl: HTMLElement;
  private nfcLog: HTMLElement;
  private keyed: KeyedList;
  private cfg: DetailConfig | null = null;
  private cmp: (a: RfSample, b: RfSample) => number = bySignal.cmp;
  private lastSnapshot: RfSample[] = [];
  private lastCount = -1;
  private nfcLastTop = -1;

  constructor(onClose: () => void) {
    this.element = el('div', 'overlay detail-sheet');
    const close = el('button', 'overlay-close', '✕');
    close.onclick = onClose;

    const head = el('div', 'detail-head');
    const title = el('span', 'detail-title');
    this.titleNode = document.createTextNode('');
    title.appendChild(this.titleNode);
    const count = el('span', 'detail-count');
    this.countNode = document.createTextNode('');
    count.appendChild(this.countNode);
    head.append(title, count);

    const sub = el('div', 'detail-sub');
    this.subNode = document.createTextNode('');
    sub.appendChild(this.subNode);

    this.controls = el('div', 'detail-controls');
    this.listEl = el('div', 'detail-list');
    this.nfcLog = el('div', 'nfc-log');

    const top = el('div', 'detail-top');
    top.append(close, head, sub, this.controls);
    this.element.append(top, this.listEl, this.nfcLog);
    this.keyed = new KeyedList(this.listEl, (s) => `${s.source}|${s.identity}`, () => detailRow(this.cfg!));
  }

  /** Retarget the sheet to a radio and reset its list. */
  bind(cfg: DetailConfig): void {
    this.cfg = cfg;
    this.titleNode.nodeValue = cfg.label;
    this.subNode.nodeValue = `${cfg.trust} · ${cfg.unit}`;
    this.element.dataset.trust = cfg.trust;
    this.keyed.reset();
    this.lastCount = -1;
    this.nfcLastTop = -1;
    this.nfcLog.replaceChildren();

    this.controls.replaceChildren();
    const isEvents = cfg.mode === 'events';
    this.listEl.style.display = isEvents ? 'none' : '';
    this.nfcLog.style.display = isEvents ? '' : 'none';
    this.controls.style.display = isEvents ? 'none' : '';

    if (!isEvents && cfg.sorts) {
      this.cmp = cfg.sorts[0].cmp;
      cfg.sorts.forEach((opt, i) => {
        const b = el('button', 'sort-btn', opt.label);
        if (i === 0) b.classList.add('on');
        b.onclick = () => {
          this.cmp = opt.cmp;
          for (const c of this.controls.children) c.classList.remove('on');
          b.classList.add('on');
          this.render(this.lastSnapshot, [], Date.now());
        };
        this.controls.appendChild(b);
      });
    }
  }

  update(ctx: { snapshot: RfSample[]; events: EventEmission[]; now: number }): void {
    if (!this.cfg) return;
    this.lastSnapshot = ctx.snapshot;
    this.render(ctx.snapshot, ctx.events, ctx.now);
  }

  private render(snapshot: RfSample[], events: EventEmission[], _now: number): void {
    const cfg = this.cfg!;
    if (cfg.mode === 'events') {
      this.renderNfc(events);
      return;
    }
    const items = snapshot.filter((s) => s.source === cfg.id).slice().sort(this.cmp);
    this.keyed.update(items);
    if (items.length !== this.lastCount) {
      this.countNode.nodeValue = `${items.length} ${cfg.noun}`;
      this.lastCount = items.length;
    }
  }

  private renderNfc(events: EventEmission[]): void {
    const taps = events.filter((e) => e.radio === 'nfc');
    if (taps.length !== this.lastCount) {
      this.countNode.nodeValue = `${taps.length} taps`;
      this.lastCount = taps.length;
    }
    const top = taps.length ? taps[0].tsMs : -1;
    if (top === this.nfcLastTop) return;
    this.nfcLastTop = top;
    this.nfcLog.replaceChildren();
    for (const t of taps.slice(0, 30)) {
      const uid = s0((t.payload as { uid?: string }).uid);
      const techs = ((t.payload as { techList?: string[] }).techList ?? []).join(', ');
      const recs = ((t.payload as { records?: { kind: string; value: string }[] }).records ?? [])
        .map((r) => `${r.kind}:${r.value}`)
        .join(' · ');
      const line = el('div', 'nfc-line');
      line.textContent = `${uid}${techs ? ' · ' + techs : ''}${recs ? ' — ' + recs : ''}`;
      this.nfcLog.appendChild(line);
    }
  }
}
