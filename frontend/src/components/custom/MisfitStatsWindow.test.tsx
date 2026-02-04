// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MisfitStatsWindow } from './MisfitStatsWindow';
import { useDataTableStore } from '@/store/settingFormStore';
import { useWindowStore } from '@/store/windowStore';
import { useTheme } from '@/hooks/useTheme';
import type { CsemData, Dataset } from '@/types';
import uPlot from 'uplot';

// Mock the store
vi.mock('@/store/settingFormStore', () => ({
  useDataTableStore: vi.fn(),
}));

vi.mock('@/store/windowStore', () => ({
  useWindowStore: vi.fn(),
}));

// Mock useTheme hook
vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(),
}));

// Mock uPlot to avoid canvas errors
vi.mock('uplot', () => {
  const mockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setSize: vi.fn(),
  }));
  mockUPlot.paths = {
    points: vi.fn(() => vi.fn()),
  };
  return {
    default: mockUPlot,
  };
});

// Mock wheelZoomPlugin
vi.mock('@/components/custom/uplot-wheel-zoom-plugin', () => ({
  wheelZoomPlugin: vi.fn(() => ({})),
}));

// Mock misfit stats mock data
vi.mock('@/mocks/misfitStatsMock', () => ({
  generateMisfitStatsMockData: vi.fn(() => ({
    byRx: {
      amplitude: [{ Y_rx_km: 1.0, RMS: 0.5 }],
      phase: [{ Y_rx_km: 1.0, RMS: 0.3 }],
    },
    byTx: {
      amplitude: [{ Y_tx_km: 2.0, RMS: 0.4 }],
      phase: [{ Y_tx_km: 2.0, RMS: 0.2 }],
    },
    byRange: {
      amplitude: [{ Y_range_km: 3.0, RMS: 0.6 }],
      phase: [{ Y_range_km: 3.0, RMS: 0.25 }],
    },
    byFreq: {
      amplitude: [{ Freq_id: 1, RMS: 0.35 }],
      phase: [{ Freq_id: 1, RMS: 0.15 }],
    },
  })),
}));

describe('MisfitStatsWindow', () => {
  const createMockDataset = (id: string, hasResidual = true): Dataset => {
    const data: CsemData[] = hasResidual
      ? [
          {
            Freq_id: 1,
            Rx_id: 1,
            Tx_id: 1,
            Type: 'Ex',
            Data: 1.0,
            Residual: 0.5,
          } as CsemData,
        ]
      : [
          {
            Freq_id: 1,
            Rx_id: 1,
            Tx_id: 1,
            Type: 'Ex',
            Data: 1.0,
          } as CsemData,
        ];

    return {
      id,
      name: `Dataset ${id}`,
      color: '#3b82f6',
      data,
      visible: true,
      freqSelected: 'all',
      txSelected: 'all',
      rxSelected: 'all',
      filterModel: null,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock theme
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'light',
      systemTheme: 'light',
      setTheme: vi.fn(),
    });

    // Mock console.error to spy on it
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set VITE_DEMO_MODE to enable demo mode
    vi.stubEnv('VITE_DEMO_MODE', 'true');

    (useWindowStore as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({ draggingWindowId: null })
    );
  });

  it('should render chart section headers', async () => {
    // Arrange
    const mockDataset = createMockDataset('dataset1', true);
    const mockDatasets = new Map<string, Dataset>([['dataset1', mockDataset]]);

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: mockDataset.data,
      datasets: mockDatasets,
      activeDatasetIds: ['dataset1'],
    });

    // Act
    const { container } = render(<MisfitStatsWindow />);

    // Assert
    await waitFor(() => {
      expect(container.textContent).toContain('RMS vs Receiver Y Position');
      expect(container.textContent).toContain('RMS vs Transmitter Y Position');
      expect(container.textContent).toContain('RMS vs Tx-Rx Offset');
      expect(container.textContent).toContain('RMS vs Frequency');
    });
  });

  it('should handle dataset switch without console errors', async () => {
    // Arrange - Start with dataset1
    const mockDataset1 = createMockDataset('dataset1', true);
    const mockDatasets1 = new Map<string, Dataset>([['dataset1', mockDataset1]]);

    const mockStoreReturn = {
      filteredData: mockDataset1.data,
      datasets: mockDatasets1,
      activeDatasetIds: ['dataset1'],
    };

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStoreReturn);

    // Act - Initial render
    const { container, rerender } = render(<MisfitStatsWindow />);

    // Wait for initial render to complete
    await waitFor(() => {
      expect(container.textContent).toContain('RMS vs Receiver Y Position');
    });

    // Assert - No console errors on initial render
    expect(console.error).not.toHaveBeenCalled();

    // Arrange - Switch to dataset2
    const mockDataset2 = createMockDataset('dataset2', true);
    const mockDatasets2 = new Map<string, Dataset>([['dataset2', mockDataset2]]);

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: mockDataset2.data,
      datasets: mockDatasets2,
      activeDatasetIds: ['dataset2'],
    });

    // Act - Re-render with new dataset
    rerender(<MisfitStatsWindow />);

    // Assert - No console errors after dataset switch
    await waitFor(() => {
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  it('orders scatter series with primary dataset first', async () => {
    const mockDataset1 = createMockDataset('dataset1', true);
    const mockDataset2 = createMockDataset('dataset2', true);
    const mockDatasets = new Map<string, Dataset>([
      ['dataset1', mockDataset1],
      ['dataset2', mockDataset2],
    ]);

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: mockDataset1.data,
      datasets: mockDatasets,
      activeDatasetIds: ['dataset1', 'dataset2'],
      primaryDatasetId: 'dataset2',
    });

    render(<MisfitStatsWindow />);

    await waitFor(() => {
      expect(uPlot).toHaveBeenCalled();
    });

    const mockCalls = (uPlot as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastCall = mockCalls[mockCalls.length - 1];
    const options = lastCall?.[0] as { series?: { label?: string }[] } | undefined;
    const firstSeriesLabel = options?.series?.[1]?.label;

    expect(firstSeriesLabel).toBe('Dataset dataset1 Amp');
  });

  it('should show missing residual message when data lacks residuals', async () => {
    // Arrange
    const mockDataset = createMockDataset('dataset1', false);
    const mockDatasets = new Map<string, Dataset>([['dataset1', mockDataset]]);

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: mockDataset.data,
      datasets: mockDatasets,
      activeDatasetIds: ['dataset1'],
    });

    // Act
    const { container } = render(<MisfitStatsWindow />);

    // Assert
    await waitFor(() => {
      expect(container.textContent).toContain('Residual Data Required');
    });
  });

  it('should show empty state when no datasets available', () => {
    // Arrange
    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: [],
      datasets: new Map(),
      activeDatasetIds: [],
    });

    // Act
    const { container } = render(<MisfitStatsWindow />);

    // Assert
    expect(container.textContent).toContain('No misfit statistics available');
  });

  it('does not render Recharts charts while misfit window is dragging', async () => {
    const mockDataset = createMockDataset('dataset1', true);
    const mockDatasets = new Map<string, Dataset>([['dataset1', mockDataset]]);

    (useDataTableStore as ReturnType<typeof vi.fn>).mockReturnValue({
      filteredData: mockDataset.data,
      datasets: mockDatasets,
      activeDatasetIds: ['dataset1'],
    });

    (useWindowStore as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({ draggingWindowId: 'misfit-stats' })
    );

    const { container } = render(<MisfitStatsWindow />);

    await waitFor(() => {
      expect(container.textContent).toContain('RMS vs Receiver Y Position');
    });

    expect(container.querySelector('.recharts-responsive-container')).not.toBeInTheDocument();
  });
});
