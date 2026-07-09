// Pure mapping from native BLE scan results into RfSamples. BLE has NO frequency
// (it hops invisibly across 40 channels), so centerFreqHz is null — these render
// as a 2.4 GHz presence / device list, never a spectral line. The advertised TX
// power is the REMOTE device's declared value (for path-loss), not ours.

import { Unit, TrustClass, type RfSample } from '../../core/model';

export interface BleDevice {
  address: string;
  rssi: number;
  txPower?: number | null;
  name?: string;
}

/** Rough path-loss distance (m) from RSSI vs advertised TX power. Estimate only. */
export function estimateDistanceM(rssi: number, txPower: number, n = 2.5): number {
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

export function mapBle(devices: BleDevice[], nowMs: number): RfSample[] {
  return devices.map((d): RfSample => ({
    source: 'ble',
    tsMs: nowMs,
    measuredAtMs: nowMs,
    centerFreqHz: null, // no frequency exposed for BLE
    bandwidthHz: null,
    value: d.rssi,
    unit: Unit.DBM,
    snrDb: null,
    trustClass: TrustClass.MEASURED,
    identity: d.address,
    channel: null,
    extras: { name: d.name ?? '', txPower: d.txPower ?? null },
  }));
}
