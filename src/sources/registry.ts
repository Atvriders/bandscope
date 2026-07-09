// Builds the set of active radio sources, feature-detected for the current
// tier. In the browser PWA with no native bridge we run the MockSource so the
// UI is alive; on the native APK we register real radio sources (starting with
// GNSS in Milestone 2; WiFi/cellular/BLE/... follow in Milestone 3).

import type { RadioSource } from './RadioSource';
import { MockSource } from './MockSource';
import { GnssNativeSource } from './native/GnssNativeSource';
import { WifiNativeSource } from './native/WifiNativeSource';
import { CellularNativeSource } from './native/CellularNativeSource';
import { BleNativeSource } from './native/BleNativeSource';

export interface RegistryOptions {
  /** True inside the Capacitor Android APK (Capacitor.isNativePlatform()). */
  isNative?: boolean;
  /** Force the mock even on native, for demos/tests. */
  forceMock?: boolean;
}

export function buildRegistry(opts: RegistryOptions = {}): RadioSource[] {
  if (opts.forceMock || !opts.isNative) {
    // Browser/dev tier: simulated radios so the waterfall is populated. Real
    // per-satellite GNSS, WiFi scan, and cellular signal have no browser API.
    return [new MockSource()];
  }

  // Native tier: real radios. GNSS + WiFi + cellular + BLE today; NFC/UWB/
  // BT-Classic follow. (No MockSource on native — we show only what the
  // hardware actually reports.)
  const sources: RadioSource[] = [
    new GnssNativeSource(),
    new WifiNativeSource(),
    new CellularNativeSource(),
    new BleNativeSource(),
  ];
  return sources;
}
