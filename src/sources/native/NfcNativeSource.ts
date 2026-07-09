// JS side of the native NFC reader. Emits a categorical tap event per tag —
// never a signal level (NFC is a fixed 13.56 MHz carrier, not measured). Web NFC
// exists in Chrome-Android but is NDEF-only; full reader mode is APK-only.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { TrustClass, type Emission } from '../../core/model';
import type { Availability, RadioSource, SourceCapabilities } from '../RadioSource';

interface NdefRecordJs {
  tnf: number;
  kind: string;
  value: string;
}
interface NfcTagEvent {
  uid: string;
  techList: string[];
  records: NdefRecordJs[];
}
interface NfcPluginApi {
  startReader(): Promise<void>;
  stopReader(): Promise<void>;
  addListener(event: 'nfcTag', cb: (e: NfcTagEvent) => void): Promise<{ remove: () => void }>;
}

const Nfc = registerPlugin<NfcPluginApi>('Nfc');

export class NfcNativeSource implements RadioSource {
  readonly id = 'nfc' as const;

  capabilities(): SourceCapabilities {
    return {
      hasFrequency: false,
      hasSnr: false,
      trustClass: TrustClass.CATEGORICAL,
      nominalCadenceHz: 0,
      label: 'NFC (reader mode)',
    };
  }

  async availability(): Promise<Availability> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', reason: 'NFC reader is APK-only (Web NFC is NDEF-only)' };
    }
    return { state: 'available' };
  }

  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void {
    let handle: { remove: () => void } | null = null;
    Nfc.addListener('nfcTag', (e) => {
      onEmit({
        kind: 'event',
        radio: 'nfc',
        name: 'tap',
        tsMs: Date.now(),
        payload: { uid: e.uid, techList: e.techList, records: e.records },
      });
    }).then((h) => {
      handle = h;
      if (signal.aborted) h.remove();
    });
    Nfc.startReader().catch(() => {});
    signal.addEventListener('abort', () => {
      handle?.remove();
      Nfc.stopReader().catch(() => {});
    });
  }
}
