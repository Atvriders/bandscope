import { describe, expect, test } from 'vitest';
import { SessionRecorder, anonId, type Fix } from './recorder';
import { Unit, TrustClass, type RfSample } from '../core/model';

const fix: Fix = { lat: 40.1, lon: -74.2, accuracy: 5, tsMs: 1000 };

function wifi(bssid: string, value: number): RfSample {
  return {
    source: 'wifi',
    tsMs: 0,
    measuredAtMs: 0,
    centerFreqHz: 2_412_000_000,
    bandwidthHz: 20_000_000,
    value,
    unit: Unit.DBM,
    snrDb: null,
    trustClass: TrustClass.MEASURED,
    identity: bssid,
    channel: '1',
    extras: { ssid: 'Net' },
  };
}

describe('SessionRecorder', () => {
  test('does nothing while not recording', () => {
    const r = new SessionRecorder();
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -50)], fix);
    expect(r.observations()).toHaveLength(0);
  });

  test('keeps the strongest observation per emitter', () => {
    const r = new SessionRecorder();
    r.start();
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -80)], fix);
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -42)], { ...fix, lat: 40.2 });
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -70)], { ...fix, lat: 40.3 });
    const obs = r.observations();
    expect(obs).toHaveLength(1);
    expect(obs[0].value).toBe(-42);
    expect(obs[0].lat).toBe(40.2); // recorded at the strongest fix
  });

  test('addFix only records while recording', () => {
    const r = new SessionRecorder();
    r.addFix(fix);
    expect(r.fixes).toHaveLength(0);
    r.start();
    r.addFix(fix);
    expect(r.fixes).toHaveLength(1);
  });

  test('CSV has a header and a lat/lon row', () => {
    const r = new SessionRecorder();
    r.start();
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -50)], fix);
    const lines = r.toCsv().split('\n');
    expect(lines[0]).toContain('lat,lon');
    expect(lines[1]).toContain('40.1');
    expect(lines[1]).toContain('-74.2');
  });

  test('anonymize truncates the MAC in exports', () => {
    const r = new SessionRecorder();
    r.start();
    r.anonymize = true;
    r.addSamples([wifi('aa:bb:cc:dd:ee:ff', -50)], fix);
    expect(r.toCsv()).toContain('aa:bb:cc:xx:xx:xx');
    expect(r.toCsv()).not.toContain('aa:bb:cc:dd:ee:ff');
  });
});

describe('anonId', () => {
  test('MAC → OUI + masked tail', () => {
    expect(anonId('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:xx:xx:xx');
  });
  test('non-MAC identity shortened', () => {
    expect(anonId('GPS-12345')).toBe('GPS-12…');
  });
});
