import { describe, expect, it } from 'vitest';

import {
  buildTriangleFillColors,
  buildTriangleResistivityGradientCss,
  formatTriangleResistivityTick,
  normalizeTriangleResistivity,
} from './triangleModelColorScale';

describe('triangleModelColorScale', () => {
  it('normalizes resistivity values on a log scale', () => {
    expect(normalizeTriangleResistivity(0.3)).toBe(0);
    expect(normalizeTriangleResistivity(1000)).toBe(1);
    expect(normalizeTriangleResistivity(10)).toBeGreaterThan(0);
    expect(normalizeTriangleResistivity(10)).toBeLessThan(1);
  });

  it('builds repeated rgb colors for each triangle vertex', () => {
    const colors = buildTriangleFillColors([0.3, 1000, null]);

    expect(colors).toHaveLength(27);
    expect(Array.from(colors.slice(0, 3))).not.toEqual(Array.from(colors.slice(9, 12)));
    expect(Array.from(colors.slice(18, 21))).toEqual(Array.from(colors.slice(21, 24)));
  });

  it('builds a CSS gradient string for the in-window colorbar', () => {
    const gradient = buildTriangleResistivityGradientCss({}, 'to right');

    expect(gradient).toContain('linear-gradient(to right');
    expect(gradient).toContain('0%');
    expect(gradient).toContain('100%');
  });

  it('formats colorbar tick labels for the default log scale', () => {
    expect(formatTriangleResistivityTick(1000)).toBe('1000');
    expect(formatTriangleResistivityTick(10)).toBe('10');
    expect(formatTriangleResistivityTick(0.3)).toBe('0.3');
  });
});
