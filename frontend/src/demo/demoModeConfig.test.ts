import { describe, expect, it } from 'vitest';

import {
  buildInitialWindows,
  getDemoDatasetIds,
  getVisibleNavWindowIds,
} from './demoModeConfig';

describe('demoModeConfig', () => {
  it('loads only the single resp dataset for demo mode', () => {
    expect(getDemoDatasetIds()).toEqual(['shumagin-line5-resp']);
  });

  it('opens the response plot and hides unrelated windows in demo mode', () => {
    const windows = buildInitialWindows(true);

    expect(windows.settings.isOpen).toBe(true);
    expect(windows['response-plot'].isOpen).toBe(false);
    expect(windows.bathymetry.isOpen).toBe(true);
    expect(windows['custom-plot'].isOpen).toBe(false);
    expect(windows['misfit-stats'].isOpen).toBe(false);
  });

  it('keeps the full window defaults outside demo mode', () => {
    const windows = buildInitialWindows(false);

    expect(windows.settings.isOpen).toBe(true);
    expect(windows['response-plot'].isOpen).toBe(false);
    expect(windows.bathymetry.isOpen).toBe(true);
  });

  it('shows only settings and response navigation in demo mode', () => {
    expect(getVisibleNavWindowIds(true)).toEqual([
      'settings',
      'response-plot',
      'bathymetry',
      'custom-plot',
      'misfit-stats',
    ]);
    expect(getVisibleNavWindowIds(false)).toEqual([
      'settings',
      'response-plot',
      'bathymetry',
      'custom-plot',
      'misfit-stats',
    ]);
  });
});
