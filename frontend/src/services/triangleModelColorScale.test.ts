import { describe, expect, it } from 'vitest';

import {
  buildTriangleFillColors,
  buildTriangleResistivityLegendTicks,
  buildTriangleResistivityGradientCss,
  formatTriangleResistivityTick,
  getTriangleResistivityColor,
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

  it('uploads triangle fill colors in linear space so the WebGL sRGB output pass restores the authored color', () => {
    // three.js renders with outputColorSpace = sRGB, which applies an sRGB OETF to the
    // fragment output. Vertex-color buffers are treated as linear, so to make the on-screen
    // color match the authored (sRGB) Turbo color — i.e. the CSS colorbar and MATLAB — the
    // buffer must hold the LINEAR form of the colormap color.
    const srgbToLinear = (channel: number) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

    const value = 10;
    const [r, g, b] = getTriangleResistivityColor(value);
    const colors = buildTriangleFillColors([value]);

    expect(colors[0]).toBeCloseTo(srgbToLinear(r), 6);
    expect(colors[1]).toBeCloseTo(srgbToLinear(g), 6);
    expect(colors[2]).toBeCloseTo(srgbToLinear(b), 6);
  });

  it('applies custom resistivity limits to triangle colors', () => {
    const defaultColors = buildTriangleFillColors([10]);
    const customColors = buildTriangleFillColors([10], { min: 10, max: 1000 });

    expect(Array.from(customColors.slice(0, 3))).not.toEqual(
      Array.from(defaultColors.slice(0, 3)),
    );
    expect(normalizeTriangleResistivity(10, { min: 10, max: 1000 })).toBe(0);
  });

  it('builds a CSS gradient string for the in-window colorbar', () => {
    const gradient = buildTriangleResistivityGradientCss({}, 'to right');

    expect(gradient).toContain('linear-gradient(to right');
    expect(gradient).toContain('0%');
    expect(gradient).toContain('100%');
  });

  it('builds log-spaced legend ticks for custom limits', () => {
    expect(buildTriangleResistivityLegendTicks({ min: 1, max: 10000 })).toEqual([
      1,
      10,
      100,
      1000,
      10000,
    ]);
  });

  it('formats colorbar tick labels for the default log scale', () => {
    expect(formatTriangleResistivityTick(1000)).toBe('1000');
    expect(formatTriangleResistivityTick(10)).toBe('10');
    expect(formatTriangleResistivityTick(0.3)).toBe('0.3');
  });
});
