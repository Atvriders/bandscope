// The single source of truth between radio sources and the UI. Sources emit
// independently (WiFi every ~30s, BLE ~1s, cellular ~2s, GNSS ~1Hz); if views
// reacted to each raw emission they'd blink (an unrelated radio's frame would
// wipe another panel). Instead every emission is merged here by identity with a
// per-radio staleness TTL, and the UI reads ONE snapshot per throttled tick.

import type { Emission, EventEmission, RadioId, RfSample } from './model';

interface Stored {
  sample: RfSample;
  lastSeenMs: number;
}

// How long a device persists after it was last heard (ms). Generous relative to
// each radio's scan cadence so throttled scans don't make rows vanish→reappear.
const TTL: Record<RadioId, number> = {
  wifi: 75_000, // scans throttled to ~4/2min
  cellular: 12_000,
  gnss: 6_000,
  ble: 8_000,
  bt_classic: 45_000, // ~12s inquiry cycles
  uwb: 3_600_000,
  nfc: 0,
  sdr: 6_000,
};

const MAX_EVENTS = 50;

export class SampleStore {
  private byId = new Map<string, Stored>();
  private events: EventEmission[] = [];

  /** Merge an emission. Markers update the latest-per-device; events queue. */
  ingest(e: Emission, nowMs: number): void {
    if (e.kind === 'markers') {
      for (const s of e.samples) {
        this.byId.set(`${s.source}|${s.identity}`, { sample: s, lastSeenMs: nowMs });
      }
    } else if (e.kind === 'event') {
      this.events.unshift(e);
      if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    }
    // RowEmission (real SDR IQ) is not produced on a phone.
  }

  /** All currently-live samples; expires stale entries as a side effect. */
  snapshot(nowMs: number): RfSample[] {
    const out: RfSample[] = [];
    for (const [key, v] of this.byId) {
      const ttl = TTL[v.sample.source] ?? 6000;
      if (nowMs - v.lastSeenMs > ttl) {
        this.byId.delete(key);
        continue;
      }
      out.push(v.sample);
    }
    return out;
  }

  recentEvents(): EventEmission[] {
    return this.events;
  }

  clear(): void {
    this.byId.clear();
    this.events.length = 0;
  }
}

/** Pick the "hero" sample for a radio from a snapshot (strongest, or serving
 *  cell). Returns null when that radio has no live data. */
export function heroFor(source: RadioId, snapshot: RfSample[]): RfSample | null {
  const items = snapshot.filter((s) => s.source === source);
  if (!items.length) return null;
  if (source === 'cellular') {
    const serving = items.find((s) => s.extras.serving);
    if (serving) return serving;
  }
  return items.reduce((best, s) => (s.value > best.value ? s : best), items[0]);
}
