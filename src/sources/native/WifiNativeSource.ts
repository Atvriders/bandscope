// JS side of the native WiFi plugin. Re-scans on a ~30 s cadence to respect the
// OS scan throttle (4 / 2 min), stamping each AP's real measurement age. No
// browser has a WiFi scan API, so this reports unavailable off-device.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { TrustClass, type Emission } from '../../core/model';
import { mapWifiScan, type WifiScanResult } from './wifiMap';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface NativeWifiResult {
  ssid: string;
  bssid: string;
  level: number;
  frequencyMhz: number;
  channelWidthMhz: number;
  capabilities: string;
  ageMs: number;
}
interface WifiScanEvent {
  results: NativeWifiResult[];
}
interface WifiPluginApi {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  addListener(event: 'wifiScan', cb: (e: WifiScanEvent) => void): Promise<{ remove: () => void }>;
}

const Wifi = registerPlugin<WifiPluginApi>('Wifi');
const RESCAN_MS = 30_000; // stay within the 4-scans/2-min throttle budget

export class WifiNativeSource implements RadioSource {
  readonly id = 'wifi' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: true,
      hasSnr: false, // no noise floor exposed → no true WiFi SNR
      trustClass: TrustClass.MEASURED,
      nominalCadenceHz: 1 / 30,
      label: 'WiFi (native scan)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'WiFi scan is APK-only (no browser API)' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    let handle: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    Wifi.addListener('wifiScan', (e) => {
      const now = Date.now();
      const results: WifiScanResult[] = e.results.map((r) => ({
        ssid: r.ssid,
        bssid: r.bssid,
        level: r.level,
        frequencyMhz: r.frequencyMhz,
        channelWidthMhz: r.channelWidthMhz,
        capabilities: r.capabilities,
        measuredAtMs: now - (r.ageMs ?? 0),
      }));
      onEmit({ kind: 'markers', samples: mapWifiScan(results, now) });
    }).then((h) => {
      handle = h;
      if (signal.aborted) h.remove();
    });

    Wifi.startScan().catch(() => {});
    timer = setInterval(() => Wifi.startScan().catch(() => {}), RESCAN_MS);

    signal.addEventListener('abort', () => {
      if (timer) clearInterval(timer);
      handle?.remove();
      Wifi.stopScan().catch(() => {});
    });
  }
}
