// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SimpleBarChart } from './SimpleBarChart';

describe('SimpleBarChart', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalResizeObserver = global.ResizeObserver;
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.ResizeObserver = originalResizeObserver;
  });

  it('should not render Recharts when mounted in 0-size container', () => {
    const testData = [
      { name: 'A', Amplitude: 10, Phase: 20 },
      { name: 'B', Amplitude: 15, Phase: 25 },
    ];

    const mockObserve = vi.fn();
    const mockDisconnect = vi.fn();
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: mockObserve,
      unobserve: vi.fn(),
      disconnect: mockDisconnect,
    }));

    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);

    const { container } = render(<SimpleBarChart data={testData} xLabel="X" yLabel="Y" />);

    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should render without errors with valid container size', async () => {
    const testData = [
      { name: 'A', Amplitude: 10, Phase: 20 },
      { name: 'B', Amplitude: 15, Phase: 25 },
    ];

    let observerCallback: ResizeObserverCallback;
    const mockObserve = vi.fn();
    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: (target: Element) => {
          mockObserve(target);
          const mockEntry = {
            contentRect: { width: 400, height: 300 },
          } as ResizeObserverEntry;
          observerCallback([mockEntry], {} as ResizeObserver);
        },
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);

    const { container } = render(<SimpleBarChart data={testData} xLabel="X" yLabel="Y" />);

    await waitFor(() => {
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    });
  });

  it('should handle custom series configuration', async () => {
    const testData = [
      { name: 'A', custom1: 100, custom2: 200 },
      { name: 'B', custom1: 150, custom2: 250 },
    ];

    const customSeries = [
      { key: 'custom1', label: 'Custom 1', color: '#ff0000' },
      { key: 'custom2', label: 'Custom 2', color: '#00ff00' },
    ];

    let observerCallback: ResizeObserverCallback;
    const mockObserve = vi.fn();
    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: (target: Element) => {
          mockObserve(target);
          const mockEntry = {
            contentRect: { width: 400, height: 300 },
          } as ResizeObserverEntry;
          observerCallback([mockEntry], {} as ResizeObserver);
        },
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);

    const { container } = render(<SimpleBarChart data={testData} series={customSeries} />);

    await waitFor(() => {
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    });
  });
});
