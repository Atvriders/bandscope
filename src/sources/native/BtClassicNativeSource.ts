// JS side of the native Bluetooth Classic discovery. Frequency-less presence +
// inquiry RSSI. ~12 s inquiry cycles, so re-triggered every ~15 s. APK-only.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { Unit, TrustClass, type Emission, type RfSample } from '../../core/model';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface NativeBtDevice {
  address: string;
  name: string;
  rssi: number | null;
  cls: number;
}
interface BtEvent {
  devices: NativeBtDevice[];
}
interface BtApi {
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  addListener(event: 'btDevices', cb: (e: BtEvent) => void): Promise<{ remove: () => void }>;
}

const Bt = registerPlugin<BtApi>('BtClassic');
const RESCAN_MS = 15000;

export class BtClassicNativeSource implements RadioSource {
  readonly id = 'bt_classic' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: false,
      hasSnr: false,
      trustClass: TrustClass.MEASURED,
      nominalCadenceHz: 1 / 12,
      label: 'Bluetooth Classic (discovery)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'BT Classic discovery is APK-only' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    let handle: { remove: () => void } | null = null;
    Bt.addListener('btDevices', (e) => {
      const now = Date.now();
      const samples: RfSample[] = e.devices.map((d) => ({
        source: 'bt_classic',
        tsMs: now,
        measuredAtMs: now,
        centerFreqHz: null,
        bandwidthHz: null,
        value: d.rssi ?? -110,
        unit: Unit.DBM,
        snrDb: null,
        trustClass: TrustClass.MEASURED,
        identity: d.address,
        channel: null,
        extras: { name: d.name, cls: d.cls, rssiReported: d.rssi !== null },
      }));
      onEmit({ kind: 'markers', samples });
    }).then((h) => {
      handle = h;
      if (signal.aborted) h.remove();
    });
    Bt.startDiscovery().catch(() => {});
    const timer = setInterval(() => Bt.startDiscovery().catch(() => {}), RESCAN_MS);
    signal.addEventListener('abort', () => {
      clearInterval(timer);
      handle?.remove();
      Bt.stopDiscovery().catch(() => {});
    });
  }
}
