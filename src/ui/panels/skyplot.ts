// Polar sky-plot projection for the GNSS panel: elevation 90° at the center,
// 0° at the horizon (edge); azimuth 0° = north (up), 90° = east (right).

export interface SkyPoint {
  x: number;
  y: number;
}

export function projectSky(azDeg: number, elDeg: number, r: number): SkyPoint {
  const el = Math.max(0, Math.min(90, elDeg));
  const radius = r * (1 - el / 90);
  const a = (azDeg * Math.PI) / 180;
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

/** Distinct color per constellation for the sky-plot / C/N0 bars. */
export function constellationColor(name: string): string {
  switch (name) {
    case 'GPS':
      return '#4fd1c5';
    case 'GLONASS':
      return '#f6ad55';
    case 'Galileo':
      return '#63b3ed';
    case 'BeiDou':
      return '#fc8181';
    case 'QZSS':
      return '#b794f4';
    case 'SBAS':
      return '#a0aec0';
    default:
      return '#718096';
  }
}
