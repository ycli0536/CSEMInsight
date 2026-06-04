const DEFAULT_MIN_RESISTIVITY = 0.3;
const DEFAULT_MAX_RESISTIVITY = 1000;
const UNKNOWN_COLOR: [number, number, number] = [0.70, 0.78, 0.87];
const GRADIENT_SAMPLE_STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const DEFAULT_LEGEND_TICK_COUNT = 5;

export interface TriangleResistivityColorRange {
  max: number;
  min: number;
}

export const TRIANGLE_RESISTIVITY_RANGE = {
  min: DEFAULT_MIN_RESISTIVITY,
  max: DEFAULT_MAX_RESISTIVITY,
} as const;

export const TRIANGLE_RESISTIVITY_LEGEND_TICKS = [1000, 100, 10, 1, 0.3] as const;

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function sampleTurbo(value: number): [number, number, number] {
  const x = clamp01(value);
  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x3 * x;
  const x5 = x4 * x;

  const r =
    0.13572138 +
    4.6153926 * x +
    -42.66032258 * x2 +
    132.13108234 * x3 +
    -152.94239396 * x4 +
    59.28637943 * x5;
  const g =
    0.09140261 +
    2.19418839 * x +
    4.84296658 * x2 +
    -14.18503333 * x3 +
    4.27729857 * x4 +
    2.82956604 * x5;
  const b =
    0.1066733 +
    12.64194608 * x +
    -60.58204836 * x2 +
    110.36276771 * x3 +
    -89.90310912 * x4 +
    27.34824973 * x5;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

function toCssRgb(color: [number, number, number]) {
  return `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`;
}

export function normalizeTriangleResistivity(
  value: number,
  range: { min?: number; max?: number } = {},
) {
  const min = range.min ?? DEFAULT_MIN_RESISTIVITY;
  const max = range.max ?? DEFAULT_MAX_RESISTIVITY;
  const clamped = Math.min(Math.max(value, min), max);

  return (Math.log10(clamped) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
}

export function getTriangleResistivityColor(
  value: number | null | undefined,
  range: { min?: number; max?: number } = {},
): [number, number, number] {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return UNKNOWN_COLOR;
  }

  return sampleTurbo(1 - normalizeTriangleResistivity(value, range));
}

// Convert a single sRGB color channel (0..1) to linear-light. This is the inverse of the
// sRGB OETF that three.js applies on output (outputColorSpace = sRGB).
function srgbChannelToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function buildTriangleFillColors(
  triangleValues: Array<number | null | undefined>,
  range: { min?: number; max?: number } = {},
) {
  const colors = new Float32Array(triangleValues.length * 9);

  triangleValues.forEach((value, triangleIndex) => {
    // The colormap is authored in sRGB (matching the CSS colorbar and MATLAB). three.js
    // treats vertex-color buffers as linear and re-encodes to sRGB on output, so upload the
    // linear form here to cancel that encoding and render the true authored color.
    const [sr, sg, sb] = getTriangleResistivityColor(value, range);
    const r = srgbChannelToLinear(sr);
    const g = srgbChannelToLinear(sg);
    const b = srgbChannelToLinear(sb);
    const offset = triangleIndex * 9;

    colors.set([r, g, b, r, g, b, r, g, b], offset);
  });

  return colors;
}

export function buildTriangleResistivityGradientCss(
  range: { min?: number; max?: number } = {},
  direction = 'to top',
) {
  const stops = GRADIENT_SAMPLE_STOPS.map((stop) => {
    const value =
      (range.min ?? DEFAULT_MIN_RESISTIVITY) *
      10 **
        (stop *
          (Math.log10(range.max ?? DEFAULT_MAX_RESISTIVITY) -
            Math.log10(range.min ?? DEFAULT_MIN_RESISTIVITY)));

    return `${toCssRgb(getTriangleResistivityColor(value, range))} ${Math.round(stop * 100)}%`;
  });

  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

export function buildTriangleResistivityLegendTicks(
  range: TriangleResistivityColorRange,
  count = DEFAULT_LEGEND_TICK_COUNT,
) {
  if (range.min === DEFAULT_MIN_RESISTIVITY && range.max === DEFAULT_MAX_RESISTIVITY) {
    return Array.from(TRIANGLE_RESISTIVITY_LEGEND_TICKS).reverse();
  }

  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min <= 0 ||
    range.max <= range.min ||
    count <= 1
  ) {
    return Array.from(TRIANGLE_RESISTIVITY_LEGEND_TICKS).reverse();
  }

  const minLog = Math.log10(range.min);
  const maxLog = Math.log10(range.max);

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return 10 ** (minLog + (maxLog - minLog) * ratio);
  });
}

export function formatTriangleResistivityTick(value: number) {
  if (value >= 1) {
    return String(Math.round(value));
  }

  return value.toFixed(1);
}
