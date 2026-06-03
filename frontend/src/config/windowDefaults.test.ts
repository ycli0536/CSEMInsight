import { describe, expect, it } from 'vitest';

import {
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  getWindowMinimumSize,
} from './windowDefaults';

describe('windowDefaults', () => {
  it('uses a larger minimum size for the triangle model viewer window', () => {
    expect(getWindowMinimumSize('triangle-model')).toEqual({
      width: 720,
      height: 600,
    });
  });

  it('keeps the shared minimum size for regular windows', () => {
    expect(getWindowMinimumSize('custom-plot')).toEqual({
      width: WINDOW_MIN_WIDTH,
      height: WINDOW_MIN_HEIGHT,
    });
  });
});
