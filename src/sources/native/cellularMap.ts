// Pure mapping from native cell info into RfSamples. The frequency is
// reconstructed from the ARFCN family via the verified 3GPP band-plan — real,
// but COMPUTED, so cellular bars are TrustClass.DERIVED. RSRP/SS-RSRP is a
// genuine measured power; RSSNR/SS-SINR is a genuine SNR (populated only when
// the modem reports it).

import { Unit, TrustClass, type RfSample } from '../../core/model';
import { earfcnToHz, nrarfcnToHz, uarfcnToHz, gsmArfcnToHz, earfcnBand } from '../../core/bandplan';

export type Rat = 'LTE' | 'NR' | 'WCDMA' | 'GSM';

export interface CellInfo {
  rat: Rat;
  /** EARFCN / NRARFCN / UARFCN / GSM ARFCN depending on `rat`. */
  arfcn: number;
  /** RSRP (LTE), SS-RSRP (NR), RSCP (WCDMA), or RSSI (GSM), in dBm. */
  powerDbm: number;
  /** RSSNR / SS-SINR / Ec-No in dB, if the modem reports it. */
  sinrDb?: number | null;
  rsrqDb?: number | null;
  pci?: number;
  registered: boolean;
  mccMnc?: string;
}

function ratFreqHz(c: CellInfo): number | null {
  switch (c.rat) {
    case 'LTE':
      return earfcnToHz(c.arfcn);
    case 'NR':
      return nrarfcnToHz(c.arfcn);
    case 'WCDMA':
      return uarfcnToHz(c.arfcn);
    case 'GSM':
      return gsmArfcnToHz(c.arfcn);
  }
}

export function mapCells(cells: CellInfo[], nowMs: number): RfSample[] {
  return cells.map((c): RfSample => {
    const hz = ratFreqHz(c);
    return {
      source: 'cellular',
      tsMs: nowMs,
      measuredAtMs: nowMs,
      centerFreqHz: hz,
      bandwidthHz: null,
      value: c.powerDbm,
      unit: Unit.DBM,
      snrDb: c.sinrDb ?? null,
      trustClass: TrustClass.DERIVED, // frequency reconstructed from ARFCN
      // include ARFCN so same-PCI cells on different frequencies don't collide
      identity: `${c.rat}-${c.arfcn}-${c.pci ?? '?'}`,
      channel: `${c.rat} ${c.arfcn}`,
      extras: {
        rat: c.rat,
        serving: c.registered,
        rsrq: c.rsrqDb ?? null,
        pci: c.pci,
        band: c.rat === 'LTE' ? earfcnBand(c.arfcn) : null,
        mccMnc: c.mccMnc ?? null,
      },
    };
  });
}
