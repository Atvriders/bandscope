// The persistent honesty affordances: the "normalized per band" caption and the
// measured / derived / categorical trust legend. Always visible so the pretty
// waterfall can never be mistaken for calibrated cross-radio power.

export function createHonestyBanner(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'honesty';
  el.innerHTML = `
    <span class="honesty-note">Colors are normalized <b>per band</b> — not calibrated across radios.</span>
    <span class="legend">
      <span class="legend-item"><i class="sw measured"></i>measured</span>
      <span class="legend-item"><i class="sw derived"></i>derived</span>
      <span class="legend-item"><i class="sw categorical"></i>categorical</span>
    </span>`;
  return el;
}
