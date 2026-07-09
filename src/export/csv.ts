// Session export. Scalar scan streams go to CSV/JSON (WiGLE-compatible spirit);
// real SDR IQ would use SigMF (out of the phone-native scope). Values are
// exported in their native units with trust class preserved — never a
// normalized number, so exported data is as honest as the display.

import type { RfSample } from '../core/model';

const HEADER = [
  'source',
  'tsMs',
  'measuredAtMs',
  'centerFreqHz',
  'bandwidthHz',
  'value',
  'unit',
  'snrDb',
  'trustClass',
  'identity',
  'channel',
] as const;

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote if the field contains a delimiter/quote/newline. Also neutralize
  // spreadsheet formula injection from hostile identities (SSID, NDEF text).
  const needsQuote = /[",\n]/.test(s);
  const guarded = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return needsQuote ? '"' + guarded.replace(/"/g, '""') + '"' : guarded;
}

export function toCsv(samples: RfSample[]): string {
  const lines = [HEADER.join(',')];
  for (const s of samples) {
    lines.push(
      [
        s.source,
        s.tsMs,
        s.measuredAtMs,
        s.centerFreqHz ?? '',
        s.bandwidthHz ?? '',
        s.value,
        s.unit,
        s.snrDb ?? '',
        s.trustClass,
        s.identity,
        s.channel ?? '',
      ]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}

export function toJson(samples: RfSample[]): string {
  return JSON.stringify(samples, null, 2);
}
