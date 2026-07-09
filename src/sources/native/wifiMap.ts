// Pure mapping from a native WiFi scan result into RfSamples. Kept separate
// from the Capacitor bridge so it is unit-testable without a device. WiFi is the
// only phone radio that gives received power AND an exact per-emitter frequency.

import { Unit, TrustClass, type RfSample } from '../../core/model';

export interface WifiScanResult {
  ssid: string;
  bssid: string;
  /** RSSI in dBm. */
  level: number;
  /** Primary channel center in MHz (ScanResult.frequency). */
  frequencyMhz: number;
  /** Channel width in MHz (20/40/80/160/320). */
  channelWidthMhz?: number;
  capabilities?: string;
  /** ScanResult.timestamp (device-boot micros) mapped to ms, if provided. */
  measuredAtMs?: number;
}

/** Approximate channel number from a WiFi center frequency (MHz). */
export function wifiChannel(freqMhz: number): string {
  if (freqMhz === 2484) return '14';
  if (freqMhz >= 2412 && freqMhz <= 2472) return String((freqMhz - 2412) / 5 + 1);
  if (freqMhz >= 5150 && freqMhz <= 5895) return String((freqMhz - 5000) / 5);
  if (freqMhz >= 5925 && freqMhz <= 7125) return String((freqMhz - 5950) / 5 + 1) + '(6E)';
  return '?';
}

export function mapWifiScan(results: WifiScanResult[], nowMs: number): RfSample[] {
  return results.map((r): RfSample => ({
    source: 'wifi',
    tsMs: nowMs,
    measuredAtMs: r.measuredAtMs ?? nowMs,
    centerFreqHz: Math.round(r.frequencyMhz * 1e6),
    bandwidthHz: (r.channelWidthMhz ?? 20) * 1e6,
    value: r.level,
    unit: Unit.DBM,
    snrDb: null, // WiFi exposes no noise floor → no true SNR
    trustClass: TrustClass.MEASURED,
    identity: r.bssid,
    channel: wifiChannel(r.frequencyMhz),
    extras: { ssid: r.ssid, capabilities: r.capabilities ?? '' },
  }));
}
