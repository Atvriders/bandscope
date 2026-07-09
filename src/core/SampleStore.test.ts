import { describe, expect, test } from 'vitest';
import { SampleStore, heroFor } from './SampleStore';
import { Unit, TrustClass, type MarkersEmission, type RfSample } from './model';

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
    extras: {},
  };
}
const markers = (samples: RfSample[]): MarkersEmission => ({ kind: 'markers', samples });

describe('SampleStore', () => {
  test('merges by identity — latest wins, no duplicates', () => {
    const s = new SampleStore();
    s.ingest(markers([wifi('aa', -80)]), 1000);
    s.ingest(markers([wifi('aa', -50)]), 1500);
    const snap = s.snapshot(1600);
    expect(snap).toHaveLength(1);
    expect(snap[0].value).toBe(-50);
  });

  test('an unrelated radio emission does NOT drop another radio (anti-flash)', () => {
    const s = new SampleStore();
    s.ingest(markers([wifi('aa', -55)]), 1000);
    // a BLE-only frame arrives; wifi must still be present
    s.ingest(markers([{ ...wifi('bleX', -60), source: 'ble', centerFreqHz: null }]), 1100);
    const snap = s.snapshot(1200);
    expect(snap.find((x) => x.source === 'wifi')).toBeDefined();
    expect(snap.find((x) => x.source === 'ble')).toBeDefined();
  });

  test('expires stale entries past their TTL', () => {
    const s = new SampleStore();
    s.ingest(markers([{ ...wifi('a', -50), source: 'gnss', unit: Unit.DB_HZ }]), 1000);
    expect(s.snapshot(3000)).toHaveLength(1); // within gnss TTL (6s)
    expect(s.snapshot(9000)).toHaveLength(0); // past 6s
  });

  test('events queue newest-first and cap', () => {
    const s = new SampleStore();
    for (let i = 0; i < 60; i++) {
      s.ingest({ kind: 'event', radio: 'nfc', name: 'tap', tsMs: i, payload: { n: i } }, i);
    }
    const ev = s.recentEvents();
    expect(ev.length).toBe(50);
    expect(ev[0].payload.n).toBe(59); // newest first
  });
});

describe('heroFor', () => {
  test('WiFi hero is the strongest AP', () => {
    const snap = [wifi('a', -80), wifi('b', -42), wifi('c', -70)];
    expect(heroFor('wifi', snap)?.value).toBe(-42);
  });
  test('cellular hero is the serving cell even if weaker', () => {
    const serving = { ...wifi('s', -100), source: 'cellular' as const, extras: { serving: true } };
    const neighbor = { ...wifi('n', -80), source: 'cellular' as const, extras: { serving: false } };
    expect(heroFor('cellular', [neighbor, serving])).toBe(serving);
  });
  test('returns null when the radio has no data', () => {
    expect(heroFor('gnss', [wifi('a', -50)])).toBeNull();
  });
});
