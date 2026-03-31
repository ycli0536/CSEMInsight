import { describe, expect, it } from 'vitest';

import {
  buildTriangleViewportAxes,
  TRIANGLE_VIEWPORT_AXIS_GUTTERS,
} from './triangleViewportAxes';

describe('triangleViewportAxes', () => {
  it('builds left and bottom axis ticks from the visible world range', () => {
    const axes = buildTriangleViewportAxes({
      cameraState: {
        baseHeight: 80,
        baseWidth: 100,
        centerX: 50,
        centerY: 40,
        zoom: 1,
      },
      plotSize: {
        height: 200,
        width: 400,
      },
    });

    expect(axes.yAxisX).toBe(TRIANGLE_VIEWPORT_AXIS_GUTTERS.left);
    expect(axes.xAxisY).toBe(200);
    expect(axes.frameWidth).toBe(448);
    expect(axes.frameHeight).toBe(232);
    expect(axes.xTicks.map((tick) => tick.value)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(axes.xTicks.map((tick) => tick.pixel)).toEqual([48, 128, 208, 288, 368, 448]);
    expect(axes.yTicks.map((tick) => tick.value)).toEqual([0, 20, 40, 60, 80]);
    expect(axes.yTicks.map((tick) => tick.pixel)).toEqual([0, 50, 100, 150, 200]);
  });

  it('switches to finer nice-number steps as the camera zooms in', () => {
    const zoomedOut = buildTriangleViewportAxes({
      cameraState: {
        baseHeight: 10,
        baseWidth: 10,
        centerX: 5,
        centerY: 5,
        zoom: 1,
      },
      plotSize: {
        height: 240,
        width: 360,
      },
    });
    const zoomedIn = buildTriangleViewportAxes({
      cameraState: {
        baseHeight: 10,
        baseWidth: 10,
        centerX: 5,
        centerY: 5,
        zoom: 8,
      },
      plotSize: {
        height: 240,
        width: 360,
      },
    });

    const zoomedOutStep = zoomedOut.xTicks[1].value - zoomedOut.xTicks[0].value;
    const zoomedInStep = zoomedIn.xTicks[1].value - zoomedIn.xTicks[0].value;

    expect(zoomedOutStep).toBe(2);
    expect(zoomedInStep).toBe(0.5);
    expect(zoomedInStep).toBeLessThan(zoomedOutStep);
    expect(zoomedIn.xTicks.some((tick) => tick.label === '4.5')).toBe(true);
  });

  it('moves the same x tick right on screen when the viewport center moves left', () => {
    const centered = buildTriangleViewportAxes({
      cameraState: {
        baseHeight: 80,
        baseWidth: 100,
        centerX: 50,
        centerY: 40,
        zoom: 1,
      },
      plotSize: {
        height: 200,
        width: 400,
      },
    });
    const pannedLeft = buildTriangleViewportAxes({
      cameraState: {
        baseHeight: 80,
        baseWidth: 100,
        centerX: 40,
        centerY: 40,
        zoom: 1,
      },
      plotSize: {
        height: 200,
        width: 400,
      },
    });

    const centeredForty = centered.xTicks.find((tick) => tick.value === 40);
    const pannedForty = pannedLeft.xTicks.find((tick) => tick.value === 40);

    expect(centeredForty).toBeDefined();
    expect(pannedForty).toBeDefined();
    expect(pannedForty!.pixel).toBeGreaterThan(centeredForty!.pixel);
  });
});
