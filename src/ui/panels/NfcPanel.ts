// NFC tap log: an event timeline (NOT a meter). Each tap = UID + tech list +
// decoded NDEF records. The 13.56 MHz carrier is fixed and unmeasured — labeled
// as such. All tag-derived text via textContent (a tag can carry anything).

import type { EventEmission } from '../../core/model';

interface NdefRecordJs {
  tnf: number;
  kind: string;
  value: string;
}

const MAX_TAPS = 40;

export class NfcPanel {
  readonly element: HTMLElement;
  private log: HTMLElement;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'NFC taps — 13.56 MHz (fixed carrier, not measured)';
    const hint = document.createElement('div');
    hint.className = 'panel-empty';
    hint.textContent = 'Tap a tag to the back of the phone. Reader mode is APK-only.';
    this.log = document.createElement('div');
    this.log.className = 'nfc-log';
    wrap.append(h, hint, this.log);
    this.element = wrap;
  }

  addTap(e: EventEmission): void {
    const uid = String(e.payload.uid ?? '');
    const techs = (e.payload.techList as string[] | undefined) ?? [];
    const records = (e.payload.records as NdefRecordJs[] | undefined) ?? [];

    const row = document.createElement('div');
    row.className = 'nfc-tap';

    const head = document.createElement('div');
    head.className = 'nfc-head';
    const uidEl = document.createElement('span');
    uidEl.className = 'nfc-uid';
    uidEl.textContent = uid || '(no UID)';
    const techEl = document.createElement('span');
    techEl.className = 'nfc-tech';
    techEl.textContent = techs.join(', ');
    head.append(uidEl, techEl);
    row.appendChild(head);

    for (const r of records) {
      const rec = document.createElement('div');
      rec.className = 'nfc-rec';
      rec.textContent = `${r.kind}: ${r.value}`; // textContent — safe
      row.appendChild(rec);
    }

    this.log.prepend(row);
    while (this.log.childElementCount > MAX_TAPS) {
      this.log.lastElementChild?.remove();
    }
  }
}
