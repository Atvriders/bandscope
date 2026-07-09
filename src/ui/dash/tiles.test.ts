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

const strongest = (items: RfSample[]) =>
  items.length ? items.reduce((b, s) => (s.value > b.value ? s : b), items[0]) : null;

function mkTile(onOpen: (id: string) => void = () => {}) {
  return radioTile({
    id: 'wifi', label: 'WIFI', unit: 'dBm', trust: 'measured', full: true, noun: 'APs',
    onOpen: onOpen as never,
    hero: strongest,
    meta: (items) => `${items.length} live`,
  });
}

describe('radioTile', () => {
  test('shows the hero readout and a live footer count', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50), wifi('bb', -70)], events: [], now: 1000 });
    expect(tile.element.querySelector('.readout-num')!.textContent).toBe('-50');
    expect(tile.element.querySelector('.tile-more')!.textContent).toContain('2 APs');
  });

  test('the footer opens the detail sheet for this radio', () => {
    let opened = '';
    const tile = mkTile((id) => (opened = id));
    document.body.appendChild(tile.element);
    (tile.element.querySelector('.tile-more') as HTMLButtonElement).click();
    expect(opened).toBe('wifi');
  });

  test('hero updates in place — same node reused (anti-flash)', () => {
    const tile = mkTile();
    document.body.appendChild(tile.element);
    tile.update({ snapshot: [wifi('aa', -50)], events: [], now: 1000 });
    const heroNum = tile.element.querySelector('.readout-num')!;
    tile.update({ snapshot: [wifi('aa', -42)], events: [], now: 1100 });
    expect(tile.element.querySelector('.readout-num')!).toBe(heroNum);
    expect(heroNum.textContent).toBe('-42');
  });
});
