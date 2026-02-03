import { describe, expect, it } from 'vitest';

import { useSettingFormStore } from './settingFormStore';

describe('useSettingFormStore defaults', () => {
  it('sets default plot customization fields', () => {
    const state = useSettingFormStore.getState();

    expect(state.xAxisColumn).toBe('Lon_tx');
    expect(state.yAxisColumn).toBe('Lat_rx');
    expect(state.splitByColumn).toBe('Freq');
  });
});
