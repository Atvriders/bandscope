// Radio tiles. Every tile builds its DOM once and mutates in place from a
// throttled snapshot — no rebuilds, no flashing. MEASURED/DERIVED tiles show a
// recessed hero readout + strength bar + optional keyed device list; CATEGORICAL
// tiles (NFC/UWB) show status only and NEVER a strength bar (the layout refuses
// to fake a level).

import { registerPlugin, Capacitor } from '@capacitor/core';
import { normalize01 } from '../../core/normalize';
import type { EventEmission, RadioId, RfSample } from '../../core/model';
import { el, Readout, Bar, KeyedList, type Row } from './parts';

export interface TileCtx {
  snapshot: RfSample[];
  events: EventEmission[];
  now: number;
}
export interface Tile {
  element: HTMLElement;
  update(ctx: TileCtx): void;
}

export interface RadioTileCfg {
  id: RadioId;
  label: string;
  unit: string;
  trust: 'measured' | 'derived' | 'categorical';
  full: boolean;
  /** which sample drives the hero readout (strongest / serving) */
  hero: (items: RfSample[]) => RfSample | null;
  /** one-line summary under the hero */
  meta: (items: RfSample[]) => string;
  /** if set, the tile has an expandable keyed device list */
  rowLabel?: (s: RfSample) => string;
  rowSub?: (s: RfSample) => string;
  rowSort?: (a: RfSample, b: RfSample) => number;
}

export function radioTile(cfg: RadioTileCfg): Tile {
  const root = el('section', `tile ${cfg.full ? 'full' : 'half'}`);
  root.dataset.trust = cfg.trust;

  const head = el('div', 'tile-head');
  const lamp = el('span', 'lamp');
  lamp.dataset.trust = cfg.trust;
  const age = el('span', 'tile-age');
  head.append(lamp, el('span', 'tile-label', cfg.label), el('span', 'tile-unit', cfg.unit), age);

  const readout = new Readout(cfg.unit);
  const bar = new Bar();
  const meta = el('div', 'tile-meta', '—');
  const body = el('div', 'tile-body');
  body.append(readout.el, el('div', 'tile-col', ''));
  body.children[1].append(meta, bar.el);

  const listWrap = el('div', 'tile-list');
  const keyed = cfg.rowLabel
    ? new KeyedList(listWrap, (s) => `${s.source}|${s.identity}`, () => deviceRow(cfg))
    : null;

  root.append(head, body, listWrap);
  if (keyed) {
    root.classList.add('expandable');
    head.onclick = () => root.classList.toggle('expanded');
  }

  let lastAge = '';
  let lastMeta = '';

  return {
    element: root,
    update({ snapshot, now }) {
      const items = snapshot.filter((s) => s.source === cfg.id);
      const hero = cfg.hero(items);
      readout.set(hero ? hero.value : null, cfg.trust);
      bar.set(hero ? normalize01(cfg.id, hero.value) : 0, cfg.trust);

      const m = cfg.meta(items);
      if (m !== lastMeta) {
        meta.textContent = m;
        lastMeta = m;
      }

      let ageStr = '';
      if (items.length) {
        const fresh = Math.max(...items.map((s) => s.measuredAtMs));
        const secs = Math.max(0, Math.round((now - fresh) / 1000));
        ageStr = secs < 1 ? 'live' : `${secs}s`;
      }
      if (ageStr !== lastAge) {
        age.textContent = ageStr;
        lastAge = ageStr;
      }

      if (keyed) {
        const sorted = cfg.rowSort ? [...items].sort(cfg.rowSort) : items;
        keyed.update(sorted);
      }
    },
  };
}

function deviceRow(cfg: RadioTileCfg): Row {
  const rowEl = el('div', 'drow');
  const nameNode = document.createTextNode('');
  const subNode = document.createTextNode('');
  const valNode = document.createTextNode('');
  const name = el('span', 'drow-name');
  name.appendChild(nameNode);
  const sub = el('span', 'drow-sub');
  sub.appendChild(subNode);
  const col = el('div', 'drow-col');
  col.append(name, sub);
  const rbar = new Bar();
  const val = el('span', 'drow-val');
  val.appendChild(valNode);
  rowEl.append(col, rbar.el, val);

  let ln = '', ls = '', lv = '';
  return {
    el: rowEl,
    update(s) {
      const nm = cfg.rowLabel!(s);
      if (nm !== ln) { nameNode.nodeValue = nm; ln = nm; }
      const sb = cfg.rowSub ? cfg.rowSub(s) : '';
      if (sb !== ls) { subNode.nodeValue = sb; ls = sb; }
      rbar.set(normalize01(s.source, s.value), s.trustClass);
      const vv = s.value.toFixed(0);
      if (vv !== lv) { valNode.nodeValue = vv; lv = vv; }
    },
  };
}

// --- NFC: categorical event log, no level ---
export function nfcTile(): Tile {
  const root = el('section', 'tile half');
  root.dataset.trust = 'categorical';
  const head = el('div', 'tile-head');
  const lamp = el('span', 'lamp');
  lamp.dataset.trust = 'categorical';
  head.append(lamp, el('span', 'tile-label', 'NFC'), el('span', 'tile-unit', '13.56 MHz'));
  const status = el('div', 'tile-meta', 'No taps yet — tap a tag');
  const log = el('div', 'nfc-log');
  root.append(head, status, log);

  let lastTop = -1;
  let lastStatus = '';
  return {
    element: root,
    update({ events, now }) {
      const taps = events.filter((e) => e.radio === 'nfc');
      if (!taps.length) return;
      const latest = taps[0];
      const secs = Math.max(0, Math.round((now - latest.tsMs) / 1000));
      const st = `${taps.length} tap${taps.length > 1 ? 's' : ''} · last ${secs}s ago`;
      if (st !== lastStatus) { status.textContent = st; lastStatus = st; }
      if (latest.tsMs !== lastTop) {
        lastTop = latest.tsMs;
        log.replaceChildren(); // rebuild only on a genuine new tap (rare, user-driven)
        for (const t of taps.slice(0, 5)) {
          const line = el('div', 'nfc-line');
          const uid = String((t.payload as { uid?: string }).uid ?? '');
          const techs = ((t.payload as { techList?: string[] }).techList ?? []).join(', ');
          line.textContent = `${uid}${techs ? ' · ' + techs : ''}`;
          log.appendChild(line);
        }
      }
    },
  };
}

// --- UWB: categorical presence, no scan ---
interface UwbApi {
  getStatus(): Promise<{ present: boolean }>;
}
export function uwbTile(): Tile {
  const Uwb = registerPlugin<UwbApi>('Uwb');
  const root = el('section', 'tile half');
  root.dataset.trust = 'categorical';
  const head = el('div', 'tile-head');
  const lamp = el('span', 'lamp');
  lamp.dataset.trust = 'categorical';
  head.append(lamp, el('span', 'tile-label', 'UWB'), el('span', 'tile-unit', '6.5/8 GHz'));
  const status = el('div', 'tile-meta', 'Checking…');
  const note = el('div', 'tile-sub', 'Ranging to a peer — not passive sensing');
  root.append(head, status, note);

  let probed = false;
  const probe = async () => {
    if (probed) return;
    probed = true;
    if (!Capacitor.isNativePlatform()) {
      status.textContent = 'APK-only (no web API)';
      return;
    }
    try {
      const { present } = await Uwb.getStatus();
      status.textContent = present ? 'Hardware present' : 'Not present on this device';
    } catch {
      status.textContent = 'Status unavailable';
    }
  };

  return {
    element: root,
    update() {
      void probe();
    },
  };
}
