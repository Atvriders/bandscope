// JS side of the native BLE plugin. Receives ~1 s device batches (RSSI +
// advertised TX power) and maps them to frequency-less samples. No practical
// browser BLE scan (requestLEScan is flag-gated + paused), so unavailable here.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { TrustClass, type Emission } from '../../core/model';
import { mapBle, type BleDevice } from './bleMap';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface NativeBleDevice {
  address: string;
  rssi: number;
  txPower?: number | null;
  name?: string;
}
interface BleScanEvent {
  devices: NativeBleDevice[];
}
interface BlePluginApi {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  addListener(event: 'bleScan', cb: (e: BleScanEvent) => void): Promise<{ remove: () => void }>;
}

const Ble = registerPlugin<BlePluginApi>('Ble');

export class BleNativeSource implements RadioSource {
  readonly id = 'ble' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: false, // hops across 40 channels, never exposed
      hasSnr: false,
      trustClass: TrustClass.MEASURED,
      nominalCadenceHz: 1,
      label: 'BLE (native scan)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'Full BLE scan is APK-only (browser requestLEScan is flag-gated)' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    let handle: { remove: () => void } | null = null;
    Ble.addListener('bleScan', (e) => {
      const now = Date.now();
      const devices: BleDevice[] = e.devices.map((d) => ({
        address: d.address,
        rssi: d.rssi,
        txPower: d.txPower ?? null,
        name: d.name,
      }));
      onEmit({ kind: 'markers', samples: mapBle(devices, now) });
    }).then((h) => {
      handle = h;
      if (signal.aborted) h.remove();
    });
    Ble.startScan().catch(() => {});
    signal.addEventListener('abort', () => {
      handle?.remove();
      Ble.stopScan().catch(() => {});
    });
  }
}
