// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

let resizeCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeCallback = callback;
  }

  observe() {}

  disconnect() {}
}

const triggerResize = (width: number, height: number) => {
  if (!resizeCallback) {
    throw new Error('ResizeObserver callback not initialized');
  }

  const entry = {
    contentRect: { width, height },
  } as ResizeObserverEntry;

  resizeCallback([entry], {} as ResizeObserver);
};

describe('SafeResponsiveContainer', () => {
  beforeEach(() => {
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 0,
    });

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders child once for duplicate resize sizes', async () => {
    let renderCount = 0;
    const onRender = () => {
      renderCount += 1;
    };

    const { queryByText } = render(
      <React.Profiler id="safe-responsive" onRender={onRender}>
        <SafeResponsiveContainer minWidth={200} minHeight={200} fallback={<div>Fallback</div>}>
          <div>Child</div>
        </SafeResponsiveContainer>
      </React.Profiler>
    );

    expect(queryByText('Fallback')).not.toBeNull();
    const countAfterMount = renderCount;

    await act(async () => {
      triggerResize(300, 300);
    });

    await waitFor(() => {
      expect(queryByText('Child')).not.toBeNull();
    });

    const countAfterFirstResize = renderCount;
    expect(countAfterFirstResize).toBeGreaterThan(countAfterMount);

    await act(async () => {
      triggerResize(300, 300);
    });

    expect(renderCount).toBe(countAfterFirstResize);
  });
});
