// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

describe('SafeResponsiveContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when container has valid dimensions', async () => {
    // Arrange
    const mockRef = { current: { offsetWidth: 400, offsetHeight: 300 } };
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);

    // Act
    const { container } = render(
      <SafeResponsiveContainer>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    await waitFor(() => {
      const chartContent = container.querySelector('[data-testid="chart-content"]');
      expect(chartContent).toBeInTheDocument();
    });
  });

  it('should not render children when container has zero width', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);

    // Act
    const { container } = render(
      <SafeResponsiveContainer>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    const chartContent = container.querySelector('[data-testid="chart-content"]');
    expect(chartContent).not.toBeInTheDocument();
  });

  it('should not render children when container has zero height', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);

    // Act
    const { container } = render(
      <SafeResponsiveContainer>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    const chartContent = container.querySelector('[data-testid="chart-content"]');
    expect(chartContent).not.toBeInTheDocument();
  });

  it('should respect minWidth prop', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(50);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);

    // Act
    const { container } = render(
      <SafeResponsiveContainer minWidth={100}>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    const chartContent = container.querySelector('[data-testid="chart-content"]');
    expect(chartContent).not.toBeInTheDocument();
  });

  it('should respect minHeight prop', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);

    // Act
    const { container } = render(
      <SafeResponsiveContainer minHeight={100}>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    const chartContent = container.querySelector('[data-testid="chart-content"]');
    expect(chartContent).not.toBeInTheDocument();
  });

  it('should show loading state by default when dimensions are invalid', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);

    // Act
    const { container } = render(
      <SafeResponsiveContainer>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    expect(container.textContent).toContain('Loading chart');
  });

  it('should allow custom fallback content', () => {
    // Arrange
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);

    // Act
    const { container } = render(
      <SafeResponsiveContainer fallback={<div>Custom Fallback</div>}>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Assert
    expect(container.textContent).toContain('Custom Fallback');
  });

  it('should render children after ResizeObserver detects valid size', async () => {
    // Arrange
    const mockObserve = vi.fn();
    const mockDisconnect = vi.fn();
    let observerCallback: ResizeObserverCallback;

    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: mockObserve,
        unobserve: vi.fn(),
        disconnect: mockDisconnect,
      };
    });

    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);

    // Act
    const { container, rerender } = render(
      <SafeResponsiveContainer>
        <div data-testid='chart-content'>Chart Content</div>
      </SafeResponsiveContainer>
    );

    // Initially no content
    expect(container.querySelector('[data-testid="chart-content"]')).not.toBeInTheDocument();

    // Simulate ResizeObserver detecting valid size
    const mockEntry = {
      contentRect: { width: 400, height: 300 },
    } as ResizeObserverEntry;

    act(() => {
      observerCallback!([mockEntry], {} as ResizeObserver);
    });

    // Assert
    await waitFor(() => {
      expect(container.querySelector('[data-testid="chart-content"]')).toBeInTheDocument();
    });
  });
});
