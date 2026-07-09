// A deterministic, hardware-free source so the whole pipeline (aggregation →
// waterfall → UI) is alive in a plain browser and in tests. It fabricates
// realistic WiFi APs, GNSS satellites, and cellular cells at REAL frequencies
// (via the band-plan), with per-tick jitter from a seeded PRNG. Clearly a
// simulation — the registry only uses it when no real radios are available.

import { Unit, TrustClass, type Emission, type RfSample } from '../core/model';
import { earfcnToHz, gnssBandLabel } from '../core/bandplan';
import type { Availability, RadioSource, SourceCapabilities } from './RadioSource';

/** mulberry32 — tiny deterministic PRNG so tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ApDesc { ssid: string; bssid: string; freqMhz: number; widthMhz: number; base: number; ch: string; cap: string; }
interface SatDesc { svid: number; constellation: string; carrierHz: number; base: number; az: number; el: number; }
interface CellDesc { earfcn: number; pci: number; base: number; serving: boolean; band: number; }

const WPA2 = '[WPA2-PSK-CCMP][ESS]';
const WPA3 = '[RSN-SAE-CCMP][ESS]';
const OPEN = '[ESS]';
const APS: ApDesc[] = [
  { ssid: 'HomeNet', bssid: 'a0:11:22:33:44:01', freqMhz: 2412, widthMhz: 20, base: -47, ch: '1', cap: WPA2 },
  { ssid: 'HomeNet-5G', bssid: 'a0:11:22:33:44:02', freqMhz: 5180, widthMhz: 80, base: -55, ch: '36', cap: WPA2 },
  { ssid: 'Neighbor_2G', bssid: 'b4:aa:bb:cc:dd:03', freqMhz: 2437, widthMhz: 20, base: -71, ch: '6', cap: WPA2 },
  { ssid: 'CoffeeShop', bssid: 'c8:99:88:77:66:04', freqMhz: 2462, widthMhz: 20, base: -78, ch: '11', cap: OPEN },
  { ssid: 'Office-5G', bssid: 'd0:55:44:33:22:05', freqMhz: 5765, widthMhz: 40, base: -62, ch: '153', cap: WPA3 },
  { ssid: 'MeshAP-6E', bssid: 'e0:66:77:88:99:06', freqMhz: 5955, widthMhz: 80, base: -58, ch: '1(6E)', cap: WPA3 },
];

const SATS: SatDesc[] = [
  { svid: 5, constellation: 'GPS', carrierHz: 1_575_420_000, base: 44, az: 45, el: 62 },
  { svid: 12, constellation: 'GPS', carrierHz: 1_575_420_000, base: 39, az: 120, el: 40 },
  { svid: 20, constellation: 'GPS', carrierHz: 1_176_450_000, base: 36, az: 200, el: 25 },
  { svid: 2, constellation: 'Galileo', carrierHz: 1_575_420_000, base: 41, az: 300, el: 55 },
  { svid: 8, constellation: 'Galileo', carrierHz: 1_176_450_000, base: 33, az: 15, el: 18 },
  { svid: 22, constellation: 'BeiDou', carrierHz: 1_561_098_000, base: 30, az: 260, el: 12 },
  { svid: 65, constellation: 'GLONASS', carrierHz: 1_602_000_000, base: 35, az: 90, el: 48 },
  { svid: 3, constellation: 'QZSS', carrierHz: 1_575_420_000, base: 46, az: 170, el: 70 },
];

const CELLS: CellDesc[] = [
  { earfcn: 1575, pci: 201, base: -84, serving: true, band: 3 }, // ~1842.5 MHz
  { earfcn: 6300, pci: 88, base: -98, serving: false, band: 20 }, // ~806 MHz
  { earfcn: 2400, pci: 305, base: -102, serving: false, band: 5 }, // ~869 MHz
];

interface BleDesc { addr: string; name: string; base: number; tx: number | null; }
const BLE_DEVS: BleDesc[] = [
  { addr: 'C1:22:33:44:55:01', name: 'Fitness Band', base: -58, tx: -12 },
  { addr: 'D2:33:44:55:66:02', name: 'Earbuds', base: -71, tx: -20 },
  { addr: 'E3:44:55:66:77:03', name: '', base: -83, tx: null },
  { addr: 'F4:55:66:77:88:04', name: 'SmartTag', base: -66, tx: -8 },
];

interface BtDesc { addr: string; name: string; base: number; }
const BT_DEVS: BtDesc[] = [
  { addr: '11:22:33:AA:BB:01', name: 'Car Audio', base: -74 },
  { addr: '11:22:33:AA:BB:02', name: 'Speaker', base: -81 },
];

export class MockSource implements RadioSource {
  readonly id = 'gnss' as const; // representative id; emits multiple radios
  private rnd: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(seed = 1) {
    this.rnd = mulberry32(seed);
  }

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: true,
      hasSnr: true,
      trustClass: TrustClass.MEASURED,
      nominalCadenceHz: 1,
      label: 'Mock (simulated radios)',
    };
  }

  async availability(): Promise<Availability> {
    return { state: 'available' };
  }

  /** One deterministic frame of markers across WiFi/GNSS/cellular. */
  tick(nowMs: number): Emission {
    const jitter = (amp: number) => (this.rnd() - 0.5) * 2 * amp;
    const samples: RfSample[] = [];

    for (const ap of APS) {
      samples.push({
        source: 'wifi',
        tsMs: nowMs,
        measuredAtMs: nowMs,
        centerFreqHz: ap.freqMhz * 1e6,
        bandwidthHz: ap.widthMhz * 1e6,
        value: ap.base + jitter(3),
        unit: Unit.DBM,
        snrDb: null,
        trustClass: TrustClass.MEASURED,
        identity: ap.bssid,
        channel: ap.ch,
        extras: { ssid: ap.ssid, capabilities: ap.cap },
      });
    }

    for (const s of SATS) {
      samples.push({
        source: 'gnss',
        tsMs: nowMs,
        measuredAtMs: nowMs,
        centerFreqHz: s.carrierHz,
        bandwidthHz: null,
        value: Math.max(0, s.base + jitter(4)),
        unit: Unit.DB_HZ,
        snrDb: null,
        trustClass: TrustClass.MEASURED,
        identity: `${s.constellation}-${s.svid}`,
        channel: `svid ${s.svid}`,
        extras: {
          constellation: s.constellation,
          azimuth: s.az,
          elevation: s.el,
          band: gnssBandLabel(s.carrierHz),
          usedInFix: s.el > 15,
        },
      });
    }

    for (const c of CELLS) {
      const hz = earfcnToHz(c.earfcn);
      samples.push({
        source: 'cellular',
        tsMs: nowMs,
        measuredAtMs: nowMs,
        centerFreqHz: hz,
        bandwidthHz: 10e6,
        value: c.base + jitter(2),
        unit: Unit.DBM,
        snrDb: c.serving ? 12 + jitter(3) : null,
        trustClass: TrustClass.DERIVED, // frequency reconstructed from EARFCN
        identity: `LTE-${c.earfcn}-${c.pci}`,
        channel: `EARFCN ${c.earfcn}`,
        extras: {
          pci: c.pci,
          serving: c.serving,
          rat: 'LTE',
          band: c.band,
          rsrq: -9 - Math.round(jitter(2)),
          mccMnc: '310260',
        },
      });
    }

    for (const bt of BT_DEVS) {
      samples.push({
        source: 'bt_classic',
        tsMs: nowMs,
        measuredAtMs: nowMs,
        centerFreqHz: null,
        bandwidthHz: null,
        value: bt.base + jitter(4),
        unit: Unit.DBM,
        snrDb: null,
        trustClass: TrustClass.MEASURED,
        identity: bt.addr,
        channel: null,
        extras: { name: bt.name, cls: 0, rssiReported: true },
      });
    }

    for (const b of BLE_DEVS) {
      samples.push({
        source: 'ble',
        tsMs: nowMs,
        measuredAtMs: nowMs,
        centerFreqHz: null, // BLE has no frequency
        bandwidthHz: null,
        value: b.base + jitter(5),
        unit: Unit.DBM,
        snrDb: null,
        trustClass: TrustClass.MEASURED,
        identity: b.addr,
        channel: null,
        extras: { name: b.name, txPower: b.tx },
      });
    }

    return { kind: 'markers', samples };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    const emit = () => onEmit(this.tick(Date.now()));
    emit();
    this.timer = setInterval(emit, 1000);
    signal.addEventListener('abort', () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    });
  }
}
