import { describe, expect, it } from 'vitest';

import {
  clampWindowToViewport,
  constrainWindowSizeToViewport,
  getWindowWorkspaceViewport,
} from './windowPositioning';

describe('windowPositioning', () => {
  it('keeps an oversized-right window resize handle reachable', () => {
    expect(
      clampWindowToViewport({
        position: { x: 760, y: 120 },
        size: { width: 400, height: 300 },
        viewport: { width: 1000, height: 800 },
      }),
    ).toEqual({ x: 584, y: 120 });
  });

  it('keeps the titlebar reachable when the window is taller than the viewport', () => {
    expect(
      clampWindowToViewport({
        position: { x: 80, y: 700 },
        size: { width: 500, height: 900 },
        viewport: { width: 1200, height: 600 },
      }),
    ).toEqual({ x: 80, y: 16 });
  });

  it('caps window size to the reachable viewport area', () => {
    expect(
      constrainWindowSizeToViewport({
        size: { width: 2000, height: 2000 },
        minSize: { width: 300, height: 200 },
        maxSize: { width: 2000, height: 2000 },
        viewport: { width: 1000, height: 800 },
      }),
    ).toEqual({ width: 968, height: 768 });
  });

  it('keeps the minimum size when the viewport is smaller than the minimum', () => {
    expect(
      constrainWindowSizeToViewport({
        size: { width: 2000, height: 2000 },
        minSize: { width: 720, height: 600 },
        maxSize: { width: 2000, height: 2000 },
        viewport: { width: 700, height: 560 },
      }),
    ).toEqual({ width: 720, height: 600 });
  });

  it('subtracts reserved app chrome from the window workspace viewport', () => {
    expect(
      getWindowWorkspaceViewport({
        viewport: { width: 1000, height: 800 },
        reservedTop: 56,
        reservedRight: 0,
        reservedBottom: 36,
      }),
    ).toEqual({ width: 1000, height: 708 });
  });
});
