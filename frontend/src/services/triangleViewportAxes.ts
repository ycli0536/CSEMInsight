import { getTriangleCameraWorldSize } from '@/services/triangleCamera';
import type { TriangleCameraState } from '@/types';

const X_TICK_TARGET_PIXELS = 90;
const Y_TICK_TARGET_PIXELS = 64;
const MAX_TICK_DECIMALS = 6;
const ZERO_EPSILON = 1e-9;

export const TRIANGLE_VIEWPORT_AXIS_GUTTERS = {
  bottom: 32,
  left: 48,
} as const;

export interface TriangleViewportAxisTick {
  label: string;
  pixel: number;
  value: number;
}

export interface TriangleViewportAxes {
  frameHeight: number;
  frameWidth: number;
  plotHeight: number;
  plotWidth: number;
  xAxisY: number;
  xTicks: TriangleViewportAxisTick[];
  yAxisX: number;
  yTicks: TriangleViewportAxisTick[];
}

function getTickStep(range: number, targetPixelSpan: number, plotPixels: number) {
  const targetTickCount = Math.max(plotPixels / targetPixelSpan, 2);
  const rawStep = range / targetTickCount;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / Math.pow(10, exponent);
  let niceFraction = 10;

  if (fraction < 1.5) {
    niceFraction = 1;
  } else if (fraction < 3) {
    niceFraction = 2;
  } else if (fraction < 7) {
    niceFraction = 5;
  }

  return niceFraction * Math.pow(10, exponent);
}

function normalizeTickValue(value: number, step: number) {
  const decimals = Math.min(
    Math.max(0, -Math.floor(Math.log10(step + Number.EPSILON))),
    MAX_TICK_DECIMALS,
  );
  const normalized = Number(value.toFixed(decimals));

  return Math.abs(normalized) < ZERO_EPSILON ? 0 : normalized;
}

function formatTickLabel(value: number, step: number) {
  const decimals = Math.min(
    Math.max(0, -Math.floor(Math.log10(step + Number.EPSILON))),
    MAX_TICK_DECIMALS,
  );

  return value
    .toFixed(decimals)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function buildAxisTicks(options: {
  axisMax: number;
  axisMin: number;
  axisStartPixel: number;
  invert: boolean;
  plotPixels: number;
  targetPixelSpan: number;
}) {
  const { axisMax, axisMin, axisStartPixel, invert, plotPixels, targetPixelSpan } = options;
  const range = Math.max(axisMax - axisMin, Number.EPSILON);
  const step = getTickStep(range, targetPixelSpan, plotPixels);
  const firstTick = Math.ceil((axisMin - ZERO_EPSILON) / step) * step;
  const lastTick = Math.floor((axisMax + ZERO_EPSILON) / step) * step;
  const ticks: TriangleViewportAxisTick[] = [];

  for (let value = firstTick; value <= lastTick + ZERO_EPSILON; value += step) {
    const normalized = normalizeTickValue(value, step);
    const offset = ((normalized - axisMin) / range) * plotPixels;
    ticks.push({
      label: formatTickLabel(normalized, step),
      pixel: invert ? axisStartPixel + plotPixels - offset : axisStartPixel + offset,
      value: normalized,
    });
  }

  return ticks;
}

export function buildTriangleViewportAxes(options: {
  cameraState: TriangleCameraState;
  plotSize: {
    height: number;
    width: number;
  };
  verticalExaggeration?: number;
}): TriangleViewportAxes {
  const { cameraState, plotSize, verticalExaggeration = 1 } = options;
  const safePlotWidth = Math.max(plotSize.width, 1);
  const safePlotHeight = Math.max(plotSize.height, 1);
  const worldSize = getTriangleCameraWorldSize(cameraState);
  const minX = cameraState.centerX - worldSize.width / 2;
  const maxX = cameraState.centerX + worldSize.width / 2;
  const minY = (cameraState.centerY - worldSize.height / 2) / verticalExaggeration;
  const maxY = (cameraState.centerY + worldSize.height / 2) / verticalExaggeration;

  return {
    frameHeight: safePlotHeight + TRIANGLE_VIEWPORT_AXIS_GUTTERS.bottom,
    frameWidth: safePlotWidth + TRIANGLE_VIEWPORT_AXIS_GUTTERS.left,
    plotHeight: safePlotHeight,
    plotWidth: safePlotWidth,
    xAxisY: safePlotHeight,
    xTicks: buildAxisTicks({
      axisMax: maxX,
      axisMin: minX,
      axisStartPixel: TRIANGLE_VIEWPORT_AXIS_GUTTERS.left,
      invert: false,
      plotPixels: safePlotWidth,
      targetPixelSpan: X_TICK_TARGET_PIXELS,
    }),
    yAxisX: TRIANGLE_VIEWPORT_AXIS_GUTTERS.left,
    yTicks: buildAxisTicks({
      axisMax: maxY,
      axisMin: minY,
      axisStartPixel: 0,
      invert: false,
      plotPixels: safePlotHeight,
      targetPixelSpan: Y_TICK_TARGET_PIXELS,
    }),
  };
}
