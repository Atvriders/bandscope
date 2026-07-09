import { describe, expect, test } from 'vitest';
import { radioTile } from './tiles';
import { Unit, TrustClass, type RfSample } from '../../core/model';

function wifi(bssid: string, val: number, ssid = 'Net'): RfSample {
  return {
    source: 'wifi',
    tsMs: 0,
    measuredAtMs: 0,
    centerFreqHz: 2_412_000_000,
    bandwidthHz: 20_000_000,
    value: val,
    unit: Unit.DBM,
    snrDb: null,
    trustClass: TrustClass.MEASURED,
    identity: bssid,
    channel: '1',
    extras: { ssid },
  };
}

function mkTile() {
  return radioTile({
    id: 'wifi',
    label: 'WIFI',
    unit: 'dBm',
    trust: 'measured',
    full: true,
    hero: (items) => (items.length ? items[0] : null),
    meta: (items) => `${items.length} APs`,
    rowLabel: (s) => String(s.extras.ssid),
    rowSub: (s) => s.identity,
    rowSort: (a, b) => b.value - a.value,
  });
}

describe('radioTile — glanceable + non-flashing', () => {
  test('renders hero readout + keyed list from a snapshot', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50), wifi('bb', -70)], events: [], now: 1000 });
    expect(tile.element.querySelector('.readout-num')!.textContent).toBe('-50');
    expect(tile.element.querySelector('.readout')!.getAttribute('data-trust')).toBe('measured');
    expect(tile.element.querySelectorAll('.drow')).toHaveLength(2);
    expect(tile.element.querySelector('.tile-meta')!.textContent).toBe('2 APs');
  });

  test('updates IN PLACE — same DOM nodes reused, not rebuilt (anti-flash)', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50), wifi('bb', -70)], events: [], now: 1000 });
    const firstRow = tile.element.querySelectorAll('.drow')[0];
    const heroNum = tile.element.querySelector('.readout-num')!;

    // second update: same identities, changed values
    tile.update({ snapshot: [wifi('aa', -42), wifi('bb', -71)], events: [], now: 1200 });

    // the row element and hero node are the SAME objects — mutated, not recreated
    expect(tile.element.querySelectorAll('.drow')[0]).toBe(firstRow);
    expect(tile.element.querySelector('.readout-num')!).toBe(heroNum);
    expect(heroNum.textContent).toBe('-42');
  });

  test('a departing device stays at its rank during grace (does not jump to top)', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50), wifi('bb', -70), wifi('cc', -90)], events: [], now: 1000 });
    let names = [...tile.element.querySelectorAll('.drow-name')].map((n) => n.textContent);
    expect(names).toEqual(['Net', 'Net', 'Net']); // 3 rows, aa/bb/cc order (strongest first)
    // weakest (cc) departs; it must NOT jump to the top — order stays aa,bb,cc
    tile.update({ snapshot: [wifi('aa', -48), wifi('bb', -71)], events: [], now: 1100 });
    const rows = [...tile.element.querySelectorAll('.drow-sub')].map((n) => n.textContent);
    expect(rows).toEqual(['aa', 'bb', 'cc']); // cc held in place at the bottom
  });

  test('an empty snapshot for this radio does not blow away rows immediately (grace window)', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50)], events: [], now: 1000 });
    // a few ticks with no wifi (e.g. only BLE emitted) — row must persist via grace
    tile.update({ snapshot: [], events: [], now: 1100 });
    tile.update({ snapshot: [], events: [], now: 1200 });
    expect(tile.element.querySelectorAll('.drow')).toHaveLength(1);
  });
});
