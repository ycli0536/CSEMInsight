// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MapLayerControl } from './MapLayerControl';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettingFormStore } from '@/store/settingFormStore';

vi.mock('@/store/settingFormStore', () => {
  return {
    useSettingFormStore: vi.fn(),
  };
});

describe('MapLayerControl', () => {
  it('updates map layer when selecting a different option', async () => {
    const setMapLayer = vi.fn();
    const triggerRecenter = vi.fn();

    (useSettingFormStore as unknown as vi.Mock).mockReturnValue({
      mapLayer: 'satellite',
      setMapLayer,
      triggerRecenter,
    });

    render(
      <TooltipProvider>
        <MapLayerControl />
      </TooltipProvider>
    );

    await userEvent.click(screen.getByLabelText('Map Layers'));
    await userEvent.click(screen.getByText('Topographic'));

    expect(setMapLayer).toHaveBeenCalledWith('topographic');
  });
});
