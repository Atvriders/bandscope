// The contract every radio implements. One thin adapter per radio translates a
// platform API (native Capacitor plugin, Web API, or mock) into `Emission`s.
// No adapter depends on another — each is independently testable.

import type { Emission, RadioId, TrustClass } from '../core/model';

export interface SourceCapabilities {
  /** Does this radio expose a real center frequency? (WiFi/GNSS/cell yes; BLE no) */
  hasFrequency: boolean;
  /** Does it expose a genuine SNR-like ratio? (cell RSSNR/SS-SINR) */
  hasSnr: boolean;
  /** The trust class of its primary value. */
  trustClass: TrustClass;
  /** Roughly how often it produces fresh data (Hz). WiFi ~0.03, GNSS/cell ~1. */
  nominalCadenceHz: number;
  /** Human label for the UI. */
  label: string;
}

export type Availability =
  | { state: 'available' }
  | { state: 'unavailable'; reason: string };

export interface RadioSource {
  id: RadioId;
  capabilities(): SourceCapabilities;
  /** Runtime check: hardware present? permission granted? tier supports it? */
  availability(): Promise<Availability>;
  /** Emit until `signal` aborts, invoking `onEmit` per emission. */
  stream(signal: AbortSignal, onEmit: (e: Emission) => void): void;
}
