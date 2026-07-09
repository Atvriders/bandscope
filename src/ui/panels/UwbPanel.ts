// UWB panel: reports hardware presence honestly. UWB is two-way RANGING to a
// paired peer at ~6.5/8 GHz (distance + bearing), NOT passive spectrum sensing —
// a peer device and a shared session config are required, so there is nothing to
// "scan". Only a few flagships have UWB at all.

import { registerPlugin, Capacitor } from '@capacitor/core';

interface UwbApi {
  getStatus(): Promise<{ present: boolean }>;
}
const Uwb = registerPlugin<UwbApi>('Uwb');

export class UwbPanel {
  readonly element: HTMLElement;
  private status: HTMLElement;
  private probed = false;

  constructor() {
    const wrap = document.createElement('section');
    wrap.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'UWB — ~6.5 / 8 GHz ranging (not passive sensing)';
    this.status = document.createElement('div');
    this.status.className = 'uwb-status';
    this.status.textContent = 'Checking…';
    const note = document.createElement('p');
    note.className = 'panel-empty';
    note.textContent =
      'UWB measures distance and bearing to a cooperating peer, not the spectrum. ' +
      'It needs a paired UWB device and a shared session config, so there is nothing ' +
      'to scan passively. Channel 5 ≈ 6.49 GHz, channel 9 ≈ 7.99 GHz.';
    wrap.append(h, this.status, note);
    this.element = wrap;
  }

  /** Probe once when the panel is first opened. */
  async probe(): Promise<void> {
    if (this.probed) return;
    this.probed = true;
    if (!Capacitor.isNativePlatform()) {
      this.status.textContent = 'UWB is APK-only (no web API).';
      return;
    }
    try {
      const { present } = await Uwb.getStatus();
      this.status.textContent = present
        ? 'UWB hardware: present on this device.'
        : 'UWB hardware: not present on this device.';
    } catch {
      this.status.textContent = 'UWB status unavailable.';
    }
  }
}
