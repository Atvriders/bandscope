import { describe, expect, test } from 'vitest';
import { mapWifiScan, wifiChannel, type WifiScanResult } from './wifiMap';
import { Unit } from '../../core/model';

describe('wifiChannel', () => {
  test('2.4 GHz channels', () => {
    expect(wifiChannel(2412)).toBe('1');
    expect(wifiChannel(2437)).toBe('6');
    expect(wifiChannel(2462)).toBe('11');
  });
  test('5 GHz channel', () => {
    expect(wifiChannel(5180)).toBe('36');
  });
  test('6 GHz (6E) channel labeled', () => {
    expect(wifiChannel(5955)).toBe('2(6E)');
  });
});

describe('mapWifiScan', () => {
  const r: WifiScanResult = {
    ssid: 'HomeNet',
    bssid: 'aa:bb:cc:dd:ee:ff',
    level: -55,
    frequencyMhz: 2412,
    channelWidthMhz: 20,
    capabilities: '[WPA2-PSK-CCMP][ESS]',
  };

  test('maps to a MEASURED dBm sample at the real frequency', () => {
    const [s] = mapWifiScan([r], 1000);
    expect(s.source).toBe('wifi');
    expect(s.centerFreqHz).toBe(2_412_000_000);
    expect(s.bandwidthHz).toBe(20_000_000);
    expect(s.value).toBe(-55);
    expect(s.unit).toBe(Unit.DBM);
    expect(s.trustClass).toBe('measured');
    expect(s.snrDb).toBeNull();
    expect(s.identity).toBe('aa:bb:cc:dd:ee:ff');
    expect(s.extras.ssid).toBe('HomeNet');
  });

  test('defaults bandwidth to 20 MHz when unspecified', () => {
    const [s] = mapWifiScan([{ ...r, channelWidthMhz: undefined }], 1000);
    expect(s.bandwidthHz).toBe(20_000_000);
  });
});
