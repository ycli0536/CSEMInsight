import { describe, expect, it } from 'vitest';

import { getPlotLabelParts } from './customPlot.utils';

describe('getPlotLabelParts', () => {
  it('uses defaults when no columns selected', () => {
    const result = getPlotLabelParts('', '', '');

    expect(result).toEqual({
      xLabel: 'Lon_tx',
      yLabel: 'Lat_rx',
      splitLabel: 'Freq',
    });
  });

  it('uses provided columns when set', () => {
    const result = getPlotLabelParts('Freq', 'Residual', 'Type');

    expect(result).toEqual({
      xLabel: 'Freq',
      yLabel: 'Residual',
      splitLabel: 'Type',
    });
  });
});
