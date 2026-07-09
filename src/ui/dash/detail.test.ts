import { describe, expect, test } from 'vitest';
import { DetailSheet, DETAIL_CONFIGS, securityLabel, btClassLabel } from './detail';
import { Unit, TrustClass, type EventEmission, type RfSample } from '../../core/model';

function wifi(bssid: string, val: number, ssid = 'Net'): RfSample {
  return {
    source: 'wifi', tsMs: 0, measuredAtMs: 0,
    centerFreqHz: 2_412_000_000, bandwidthHz: 20_000_000,
    value: val, unit: Unit.DBM, snrDb: null, trustClass: TrustClass.MEASURED,
    identity: bssid, channel: '1', extras: { ssid, capabilities: '[WPA2-PSK-CCMP][ESS]' },
  };
}
const ctx = (snapshot: RfSample[], events: EventEmission[] = []) => ({ snapshot, events, now: 1000 });

describe('DetailSheet — signal radio', () => {
  test('lists every device with a strength bar and a live count', () => {
    const sheet = new DetailSheet(() => {});
    sheet.bind(DETAIL_CONFIGS.wifi);
    sheet.update(ctx([wifi('aa', -50), wifi('bb', -70)]));
    expect(sheet.element.querySelectorAll('.drow4')).toHaveLength(2);
    expect(sheet.element.querySelectorAll('.drow4 .bar')).toHaveLength(2);
    expect(sheet.element.querySelector('.detail-count')!.textContent).toBe('2 APs');
    // strongest first
    expect(sheet.element.querySelector('.drow4-val')!.textContent).toBe('-50');
  });

  test('updates rows in place — same DOM nodes reused (anti-flash)', () => {
    const sheet = new DetailSheet(() => {});
    sheet.bind(DETAIL_CONFIGS.wifi);
    sheet.update(ctx([wifi('aa', -50), wifi('bb', -70)]));
    const firstRow = sheet.element.querySelectorAll('.drow4')[0];
    sheet.update(ctx([wifi('aa', -41), wifi('bb', -71)]));
    expect(sheet.element.querySelectorAll('.drow4')[0]).toBe(firstRow);
    expect(sheet.element.querySelector('.drow4-val')!.textContent).toBe('-41');
  });

  test('rebinding to another radio resets the list', () => {
    const sheet = new DetailSheet(() => {});
    sheet.bind(DETAIL_CONFIGS.wifi);
    sheet.update(ctx([wifi('aa', -50)]));
    expect(sheet.element.querySelectorAll('.drow4')).toHaveLength(1);
    sheet.bind(DETAIL_CONFIGS.ble); // switch radios
    sheet.update(ctx([])); // no BLE devices
    expect(sheet.element.querySelectorAll('.drow4')).toHaveLength(0);
  });
});

describe('DetailSheet — categorical NFC', () => {
  test('renders a tap log with NO strength bar', () => {
    const sheet = new DetailSheet(() => {});
    sheet.bind(DETAIL_CONFIGS.nfc);
    const tap: EventEmission = {
      kind: 'event', radio: 'nfc', name: 'tap', tsMs: 900,
      payload: { uid: '04:A2:F1', techList: ['IsoDep', 'Ndef'], records: [] },
    };
    sheet.update(ctx([], [tap]));
    expect(sheet.element.querySelectorAll('.drow4')).toHaveLength(0);
    expect(sheet.element.querySelectorAll('.bar')).toHaveLength(0);
    expect(sheet.element.querySelector('.nfc-line')!.textContent).toContain('04:A2:F1');
    expect(sheet.element.querySelector('.detail-count')!.textContent).toBe('1 taps');
  });
});

describe('label helpers', () => {
  test('securityLabel', () => {
    expect(securityLabel('[RSN-SAE-CCMP][ESS]')).toBe('WPA3');
    expect(securityLabel('[WPA2-PSK-CCMP][ESS]')).toBe('WPA2');
    expect(securityLabel('[ESS]')).toBe('Open');
  });
  test('btClassLabel', () => {
    expect(btClassLabel(0x0400)).toBe('Audio/Video');
    expect(btClassLabel(0x0200)).toBe('Phone');
    expect(btClassLabel(0)).toBe('Device');
  });
});
