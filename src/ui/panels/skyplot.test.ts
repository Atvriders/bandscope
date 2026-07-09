import { describe, expect, test } from 'vitest';
import { projectSky } from './skyplot';

describe('projectSky', () => {
  test('elevation 90° (overhead) projects to the center', () => {
    const p = projectSky(0, 90, 100);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  test('north horizon (az 0, el 0) projects straight up', () => {
    const p = projectSky(0, 0, 100);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(-100, 5);
  });

  test('east horizon (az 90, el 0) projects to the right edge', () => {
    const p = projectSky(90, 0, 100);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  test('a mid-elevation satellite sits between center and edge', () => {
    const p = projectSky(0, 45, 100);
    expect(p.y).toBeCloseTo(-50, 5); // radius = 100*(1-45/90) = 50
  });
});
