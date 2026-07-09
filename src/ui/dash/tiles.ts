// Radio tiles. Each builds its DOM once and mutates in place from a throttled
// snapshot — no rebuilds, no flashing. MEASURED/DERIVED tiles show a recessed
// hero readout + strength bar + a one-line summary + a "N devices ›" footer that
// opens the full detail sheet. CATEGORICAL tiles (NFC/UWB) show status only and
// NEVER a strength bar (the layout refuses to fake a level).

import { registerPlugin, Capacitor } from '@capacitor/core';
import { normalize01 } from '../../core/normalize';
import type { EventEmission, RadioId, RfSample } from '../../core/model';
import { el, Readout, Bar } from './parts';

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
  noun: string;
  hero: (items: RfSample[]) => RfSample | null;
  meta: (items: RfSample[]) => string;
  onOpen: (id: RadioId) => void;
}

function moreButton(trust: string, onClick: () => void): { el: HTMLButtonElement; set(n: number, noun: string): void } {
  const btn = el('button', 'tile-more');
  btn.dataset.trust = trust;
  const label = document.createTextNode('');
  const chevron = el('span', 'tile-more-chevron', '›');
  btn.append(label, chevron);
  btn.onclick = onClick;
  let last = -1;
  return {
    el: btn,
    set(n, noun) {
      if (n === last) return;
      last = n;
      label.nodeValue = n > 0 ? `${n} ${noun} ` : `no ${noun} yet `;
    },
  };
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
  const col = el('div', 'tile-col');
  col.append(meta, bar.el);
  const body = el('div', 'tile-body');
  body.append(readout.el, col);

  const more = moreButton(cfg.trust, () => cfg.onOpen(cfg.id));

  root.append(head, body, more.el);

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
      if (m !== lastMeta) { meta.textContent = m; lastMeta = m; }

      let ageStr = '';
      if (items.length) {
        const fresh = Math.max(...items.map((s) => s.measuredAtMs));
        const secs = Math.max(0, Math.round((now - fresh) / 1000));
        ageStr = secs < 1 ? 'live' : `${secs}s`;
      }
      if (ageStr !== lastAge) { age.textContent = ageStr; lastAge = ageStr; }

      more.set(items.length, cfg.noun);
    },
  };
}

// --- NFC: categorical event log; footer opens the tap history sheet ---
export function nfcTile(onOpen: (id: RadioId) => void): Tile {
  const root = el('section', 'tile half');
  root.dataset.trust = 'categorical';
  const head = el('div', 'tile-head');
  const lamp = el('span', 'lamp');
  lamp.dataset.trust = 'categorical';
  head.append(lamp, el('span', 'tile-label', 'NFC'), el('span', 'tile-unit', '13.56 MHz'));
  const status = el('div', 'tile-meta', 'No taps yet — tap a tag');
  const more = moreButton('categorical', () => onOpen('nfc'));
  root.append(head, status, more.el);

  let lastStatus = '';
  return {
    element: root,
    update({ events, now }) {
      const taps = events.filter((e) => e.radio === 'nfc');
      let st = 'No taps yet — tap a tag';
      if (taps.length) {
        const secs = Math.max(0, Math.round((now - taps[0].tsMs) / 1000));
        st = `${taps.length} tap${taps.length > 1 ? 's' : ''} · last ${secs}s ago`;
      }
      if (st !== lastStatus) { status.textContent = st; lastStatus = st; }
      more.set(taps.length, 'taps');
    },
  };
}

// --- UWB: categorical presence, no list ---
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
