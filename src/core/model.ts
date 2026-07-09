// The unified vocabulary every radio maps into. Sources emit these native
// values and NEVER pre-normalize — normalization is a rendering concern
// (see core/normalize.ts) so provenance and real units are never lost.

/** Physical unit of a sample's `value`. They are NOT interchangeable. */
export enum Unit {
  /** Received power, dBm (WiFi RSSI, cell RSRP, BLE RSSI). */
  DBM = 'dBm',
  /** A ratio in dB (RSRQ, RSSNR, SS-SINR, Ec/No). */
  DB = 'dB',
  /** Carrier-to-noise density, dB-Hz (GNSS C/N0). NOT the same as SNR. */
  DB_HZ = 'dB-Hz',
  /** No signal level — a tap/discovery/lock event (NFC, UWB, BT presence). */
  CATEGORICAL = 'categorical',
  /** Throughput, Mbps (the honest "activity" proxy for TX — never RF power). */
  MBPS = 'Mbps',
}

/**
 * How much the value can be trusted as a real RF measurement. Drives the
 * visual grammar: MEASURED = smooth gradient, DERIVED = hatched/low-opacity,
 * CATEGORICAL = discrete glyph (never a strength color).
 */
export enum TrustClass {
  /** Genuine received power / ratio the chip reported (WiFi, cell, GNSS, BLE). */
  MEASURED = 'measured',
  /** Real number but positioned/declared from metadata (ARFCN→MHz freq,
   *  BLE advertised TxPower, UWB configured channel). */
  DERIVED = 'derived',
  /** A discrete event with no signal level (NFC tap, UWB lock, BT discovery). */
  CATEGORICAL = 'categorical',
}

export type RadioId =
  | 'gnss'
  | 'wifi'
  | 'cellular'
  | 'ble'
  | 'bt_classic'
  | 'uwb'
  | 'nfc'
  | 'sdr';

/** One normalized reading from any radio. */
export interface RfSample {
  /** Which radio produced it. */
  source: RadioId;
  /** When we ingested it (ms since epoch). */
  tsMs: number;
  /** When the radio actually measured it (ms) — may lag `tsMs` (e.g. cached
   *  WiFi scan). Used to show honest signal age, never faked freshness. */
  measuredAtMs: number;
  /** Real center frequency in Hz, or null when unknown (BLE/BT hop invisibly). */
  centerFreqHz: number | null;
  /** Occupied bandwidth in Hz where known (WiFi channel width, LTE BW). */
  bandwidthHz: number | null;
  /** The reading, in `unit`. */
  value: number;
  unit: Unit;
  /** A genuine SNR-like ratio in dB, only where one truly exists
   *  (LTE RSSNR, NR SS-SINR, WCDMA Ec/No). null otherwise. */
  snrDb: number | null;
  trustClass: TrustClass;
  /** Stable identity: BSSID / PCI+CI+MCCMNC / SVID+constellation / MAC / UID. */
  identity: string;
  /** Channel-ish label: WiFi channel, EARFCN/NRARFCN, "svid 7", or null. */
  channel: string | null;
  /** Per-radio extras (SSID, RSRQ, constellation, azimuth, NDEF, ...). */
  extras: Record<string, unknown>;
}

/** A batch of discrete placements (WiFi APs, cells, satellites, BLE devices). */
export interface MarkersEmission {
  kind: 'markers';
  samples: RfSample[];
}

/** A real swept FFT row — only ever produced by an external SDR (out of the
 *  phone-native scope, but modeled so the renderer stays source-agnostic). */
export interface RowEmission {
  kind: 'row';
  freqStartHz: number;
  binHz: number;
  powers: Float32Array;
}

/** A categorical event: NFC tap, UWB ranging lock, Bluetooth discovery. */
export interface EventEmission {
  kind: 'event';
  radio: RadioId;
  name: string;
  payload: Record<string, unknown>;
  tsMs: number;
}

export type Emission = MarkersEmission | RowEmission | EventEmission;

/** True only for genuine measured received power / ratios — the only marks
 *  allowed to render as continuous spectrum. */
export function isMeasured(s: RfSample): boolean {
  return s.trustClass === TrustClass.MEASURED;
}
