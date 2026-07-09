// JS side of the native cellular plugin. Polls getCells() (~2 s) and maps
// serving + neighbor cells to DERIVED-frequency bars. No browser API exposes
// cellular signal, so this is unavailable off-device.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { TrustClass, type Emission } from '../../core/model';
import { mapCells, type CellInfo, type Rat } from './cellularMap';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface NativeCell {
  rat: Rat;
  arfcn: number;
  pci?: number;
  powerDbm: number;
  rsrqDb?: number | null;
  sinrDb?: number | null;
  registered: boolean;
  mccMnc?: string | null;
}
interface CellsResult {
  cells: NativeCell[];
}
interface CellularPluginApi {
  getCells(): Promise<CellsResult>;
}

const Cellular = registerPlugin<CellularPluginApi>('Cellular');
const POLL_MS = 2000;

export class CellularNativeSource implements RadioSource {
  readonly id = 'cellular' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: true, // derived from ARFCN
      hasSnr: true, // RSSNR / SS-SINR where reported
      trustClass: TrustClass.DERIVED,
      nominalCadenceHz: 0.5,
      label: 'Cellular (native)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'Cellular signal is APK-only (no browser API)' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    const poll = async () => {
      try {
        const res = await Cellular.getCells();
        const now = Date.now();
        const cells: CellInfo[] = res.cells.map((c) => ({
          rat: c.rat,
          arfcn: c.arfcn,
          powerDbm: c.powerDbm,
          sinrDb: c.sinrDb ?? null,
          rsrqDb: c.rsrqDb ?? null,
          pci: c.pci,
          registered: c.registered,
          mccMnc: c.mccMnc ?? undefined,
        }));
        onEmit({ kind: 'markers', samples: mapCells(cells, now) });
      } catch {
        /* permission denied / no modem — panel stays unavailable */
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    signal.addEventListener('abort', () => clearInterval(timer));
  }
}
