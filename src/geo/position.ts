// Unified position provider. @capacitor/geolocation uses the native fused
// location in the APK and navigator.geolocation in the browser — same JS API,
// same permission prompt flow. Position only (never per-satellite data).

import { Geolocation } from '@capacitor/geolocation';
import type { Fix } from './recorder';

export class PositionProvider {
  private watchId: string | null = null;

  async start(onFix: (f: Fix) => void): Promise<void> {
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* web prompts on watch instead */
    }
    this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
      if (err || !pos) return;
      onFix({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        tsMs: pos.timestamp,
      });
    });
  }

  async stop(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }
}
