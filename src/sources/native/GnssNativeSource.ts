// JS side of the native GNSS plugin. On the APK it streams real per-satellite
// C/N0 (dB-Hz) at each carrier frequency; in the browser it reports unavailable
// (Geolocation exposes only a fused position, never per-satellite data).

import { registerPlugin, Capacitor } from '@capacitor/core';
import { Unit, TrustClass, type Emission, type RfSample } from '../../core/model';
import { gnssBandLabel } from '../../core/bandplan';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface GnssSat {
  svid: number;
  constellation: string;
  cn0DbHz: number;
  carrierFreqHz?: number;
  azimuth: number;
  elevation: number;
  usedInFix: boolean;
}
interface GnssStatusEvent {
  satellites: GnssSat[];
}
interface GnssPluginApi {
  startWatch(): Promise<void>;
  stopWatch(): Promise<void>;
  addListener(
    event: 'gnssStatus',
    cb: (e: GnssStatusEvent) => void,
  ): Promise<{ remove: () => void }>;
}

const Gnss = registerPlugin<GnssPluginApi>('Gnss');

export class GnssNativeSource implements RadioSource {
  readonly id = 'gnss' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: true,
      hasSnr: false, // C/N0 is a CNR, not SNR — we never label it dB
      trustClass: TrustClass.MEASURED,
      nominalCadenceHz: 1,
      label: 'GNSS (native C/N0)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'Per-satellite GNSS C/N0 is APK-only' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    let handle: { remove: () => void } | null = null;

    Gnss.addListener('gnssStatus', (e) => {
      const now = Date.now();
      const samples: RfSample[] = e.satellites
        .filter((s) => s.cn0DbHz > 0)
        .map((s): RfSample => {
          const carrier = s.carrierFreqHz ?? 1_575_420_000; // default L1 if not reported
          return {
            source: 'gnss',
            tsMs: now,
            measuredAtMs: now,
            centerFreqHz: carrier,
            bandwidthHz: null,
            value: s.cn0DbHz,
            unit: Unit.DB_HZ,
            snrDb: null,
            trustClass: TrustClass.MEASURED,
            identity: `${s.constellation}-${s.svid}`,
            channel: `svid ${s.svid}`,
            extras: {
              constellation: s.constellation,
              azimuth: s.azimuth,
              elevation: s.elevation,
              usedInFix: s.usedInFix,
              band: gnssBandLabel(carrier),
            },
          };
        });
      onEmit({ kind: 'markers', samples });
    }).then((h) => {
      handle = h;
      if (signal.aborted) h.remove();
    });

    Gnss.startWatch().catch(() => {
      /* permission denied / no GPS — leave the panel in its unavailable state */
    });

    signal.addEventListener('abort', () => {
      handle?.remove();
      Gnss.stopWatch().catch(() => {});
    });
  }
}
