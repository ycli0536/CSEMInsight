import { act, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDataTableStore, useSettingFormStore } from '@/store/settingFormStore';
import type { CsemData } from '@/types';
import { CustomPlot } from './CustomPlot';
import { getPlotLabelParts } from './customPlot.utils';

vi.mock('uplot', () => {
  const mockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setSize: vi.fn(),
  }));
  return {
    default: mockUPlot,
  };
});

vi.mock('@/components/custom/uplot-wheel-zoom-plugin', () => ({
  wheelZoomPlugin: vi.fn(() => ({})),
}));

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

describe('CustomPlot', () => {
  const row: CsemData = {
    index: 0,
    Type: '28',
    Freq_id: '1',
    Freq: 1,
    Tx_id: 1,
    Rx_id: 1,
    Data: 1,
    StdError: 0.1,
    X_rx: 0,
    Y_rx: 0,
    Lon_rx: -150,
    Lat_rx: 56,
    Z_rx: 0,
    Theta: 0,
    Alpha: 0,
    Beta: 0,
    Length_rx: 100,
    Name_rx: 'rx',
    X_tx: 0,
    Y_tx: 0,
    Lon_tx: -151,
    Lat_tx: 55,
    Z_tx: 0,
    Azimuth: 0,
    Dip: 0,
    Length_tx: 100,
    Type_tx: 'edipole',
    Name_tx: 'tx',
    offset: 0,
    distance: 1,
  };

  let resizeCallbacks: ResizeObserverCallback[] = [];
  let clientWidth = 0;
  let clientHeight = 0;
  let clientWidthSpy: { mockRestore: () => void } | null = null;
  let clientHeightSpy: { mockRestore: () => void } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallbacks = [];
    clientWidth = 0;
    clientHeight = 0;
    clientWidthSpy = null;
    clientHeightSpy = null;

    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation((callback: ResizeObserverCallback) => {
        resizeCallbacks.push(callback);
        return {
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        };
      }),
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => clientWidth,
    );
    clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      () => clientHeight,
    );

    useDataTableStore.setState({
      data: [row],
      tableData: [row],
      filteredData: [row],
    });
    useSettingFormStore.setState({
      xAxisColumn: 'Lon_tx',
      yAxisColumn: 'Lat_rx',
      splitByColumn: 'Freq',
    });
  });

  afterEach(() => {
    clientWidthSpy?.mockRestore();
    clientHeightSpy?.mockRestore();
    vi.unstubAllGlobals();
  });

  it('initializes from current customization settings once the opened window has a measurable width', async () => {
    const { default: uPlot } = await import('uplot');

    render(createElement(CustomPlot));

    expect(uPlot).not.toHaveBeenCalled();

    clientWidth = 640;
    clientHeight = 360;
    act(() => {
      resizeCallbacks.forEach((callback) => {
        callback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      });
    });

    await waitFor(() => {
      expect(uPlot).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(uPlot).mock.calls[0][0]).toMatchObject({
      title: 'Lat_rx vs Lon_tx by Freq',
      width: 640,
      height: 248,
    });
  });

  it('keeps resize dimensions inside the plot area so the title and legend remain visible', async () => {
    const { default: uPlot } = await import('uplot');

    clientWidth = 640;
    clientHeight = 360;

    render(createElement(CustomPlot));

    await waitFor(() => {
      expect(uPlot).toHaveBeenCalledTimes(1);
    });

    const plotInstance = vi.mocked(uPlot).mock.results[0].value as {
      setSize: ReturnType<typeof vi.fn>;
    };

    clientWidth = 700;
    clientHeight = 420;
    act(() => {
      resizeCallbacks.forEach((callback) => {
        callback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      });
    });

    expect(plotInstance.setSize).toHaveBeenCalledWith({
      width: 700,
      height: 308,
    });
  });
});
