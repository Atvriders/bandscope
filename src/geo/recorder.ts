// Wardriving session recorder: geotags scans and keeps the strongest observation
// per emitter. OFF by default (privacy) — the UI must opt in. Anonymization
// truncates MAC/BSSID identities to their OUI so exports don't fingerprint
// devices that randomize precisely to resist tracking.

import type { RadioId, RfSample } from '../core/model';

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  tsMs: number;
}

export interface GeoObservation {
  key: string;
  source: RadioId;
  identity: string;
  ssid: string;
  value: number;
  centerFreqHz: number | null;
  channel: string | null;
  lat: number;
  lon: number;
  tsMs: number;
}

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

/** Truncate a MAC/BSSID to its OUI (first 3 octets); otherwise shorten. */
export function anonId(id: string): string {
  if (MAC_RE.test(id)) return id.slice(0, 8) + ':xx:xx:xx';
  return id.length > 6 ? id.slice(0, 6) + '…' : id;
}

export class SessionRecorder {
  readonly fixes: Fix[] = [];
  private best = new Map<string, GeoObservation>();
  recording = false;
  anonymize = false;

  start(): void {
    this.recording = true;
  }
  stop(): void {
    this.recording = false;
  }
  clear(): void {
    this.fixes.length = 0;
    this.best.clear();
  }

  addFix(f: Fix): void {
    if (this.recording) this.fixes.push(f);
  }

  /** Record the strongest observation per (source, identity) at this fix. */
  addSamples(samples: RfSample[], f: Fix | null): void {
    if (!this.recording || !f) return;
    for (const s of samples) {
      const key = `${s.source}|${s.identity}`;
      const prev = this.best.get(key);
      if (!prev || s.value > prev.value) {
        this.best.set(key, {
          key,
          source: s.source,
          identity: s.identity,
          ssid: String(s.extras.ssid ?? s.extras.name ?? ''),
          value: s.value,
          centerFreqHz: s.centerFreqHz,
          channel: s.channel,
          lat: f.lat,
          lon: f.lon,
          tsMs: f.tsMs,
        });
      }
    }
  }

  observations(): GeoObservation[] {
    return [...this.best.values()];
  }

  displayId(o: GeoObservation): string {
    return this.anonymize ? anonId(o.identity) : o.identity;
  }

  /** WiGLE-flavored CSV with lat/lon. Honors the anonymization toggle. */
  toCsv(): string {
    const header = 'source,identity,ssid,centerFreqHz,channel,rssiOrValue,lat,lon,tsMs';
    const rows = this.observations().map((o) =>
      [
        o.source,
        this.displayId(o),
        JSON.stringify(o.ssid),
        o.centerFreqHz ?? '',
        o.channel ?? '',
        o.value,
        o.lat,
        o.lon,
        o.tsMs,
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }
}
