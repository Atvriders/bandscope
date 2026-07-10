import { describe, expect, test } from 'vitest';
import { createFreqAxis, SpectrumScope } from './scope';
import { DEFAULT_SEGMENTS } from '../../core/axis';
import { Unit, TrustClass, type RfSample } from '../../core/model';

describe('frequency axis (low → high)', () => {
  test('one labeled segment per axis segment, in ascending frequency order', () => {
    const axis = createFreqAxis();
    const segs = axis.querySelectorAll('.freq-seg');
    expect(segs).toHaveLength(DEFAULT_SEGMENTS.length);
    // first (leftmost) is the lowest band, last (rightmost) is the highest
    expect(segs[0].querySelector('.freq-name')!.textContent).toBe(DEFAULT_SEGMENTS[0].label);
    expect(segs[segs.length - 1].querySelector('.freq-name')!.textContent).toBe(
      DEFAULT_SEGMENTS[DEFAULT_SEGMENTS.length - 1].label,
    );
    // segment lo frequencies are strictly ascending → left-to-right is low-to-high
    for (let i = 1; i < DEFAULT_SEGMENTS.length; i++) {
      expect(DEFAULT_SEGMENTS[i].loHz).toBeGreaterThan(DEFAULT_SEGMENTS[i - 1].loHz);
    }
  });
});

describe('SpectrumScope', () => {
  test('update is safe with no 2D context (headless) and with real samples', () => {
    const scope = new SpectrumScope();
    const s: RfSample = {
      source: 'wifi', tsMs: 0, measuredAtMs: 0,
      centerFreqHz: 2_412_000_000, bandwidthHz: 20_000_000,
      value: -50, unit: Unit.DBM, snrDb: null, trustClass: TrustClass.MEASURED,
      identity: 'aa', channel: '1', extras: {},
    };
    // jsdom has no canvas 2D backend → ctx is null; update must no-op, not throw
    expect(() => scope.update([s])).not.toThrow();
    expect(() => scope.resize()).not.toThrow();
  });
});
