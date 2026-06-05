import { describe, expect, it } from 'vitest';

import { useDataTableStore, useSettingFormStore } from './settingFormStore';

describe('useSettingFormStore defaults', () => {
  it('sets default plot customization fields', () => {
    const state = useSettingFormStore.getState();

    expect(state.xAxisColumn).toBe('Lon_tx');
    expect(state.yAxisColumn).toBe('Lat_rx');
    expect(state.splitByColumn).toBe('Freq');
  });

  it('disables shared quick filters by default', () => {
    const state = useSettingFormStore.getState();

    expect(state.applyQuickFiltersGlobally).toBe(false);
  });
});

describe('useDataTableStore column defaults', () => {
  it('exposes parsed offset, distance, and solve-correction columns to the UI', () => {
    const fields = useDataTableStore
      .getState()
      .colDefs.map((column) => column.field);

    expect(fields).toEqual(
      expect.arrayContaining([
        'offset',
        'distance',
        'SolveCorr_rx',
        'SolveCorr_tx',
      ]),
    );
  });
});
