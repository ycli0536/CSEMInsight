// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WindowId, WindowState } from '@/types/window';
import { useWindowStore } from '@/store/windowStore';
import { TooltipProvider } from '@/components/ui/tooltip';

const contentMounts = vi.hoisted(() => ({
  triangleModel: 0,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/components/layout/WindowContentRenderer', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    WindowContentRenderer: ({ type }: { type: WindowId }) => {
      const [count, setCount] = React.useState(0);

      React.useEffect(() => {
        if (type === 'triangle-model') {
          contentMounts.triangleModel += 1;
        }
      }, [type]);

      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setCount((value) => value + 1),
          'data-testid': `content-${type}`,
        },
        `${type} count ${count}`,
      );
    },
  };
});

import { WindowManager } from './WindowManager';

describe('WindowManager', () => {
  const initialWindows = useWindowStore.getState().windows;

  beforeEach(() => {
    contentMounts.triangleModel = 0;
    const windows = Object.fromEntries(
      Object.entries(initialWindows).map(([id, window]) => [
        id,
        { ...window, isOpen: false },
      ]),
    ) as Record<WindowId, WindowState>;

    windows['triangle-model'] = {
      ...windows['triangle-model'],
      container: 'main',
      isOpen: true,
    };

    useWindowStore.setState({
      windows,
      sidebarOrder: [],
      activeWindowId: null,
      globalZIndex: 10,
      draggingWindowId: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves mesh viewer content state when docking and undocking', async () => {
    render(
      <TooltipProvider>
        <WindowManager />
      </TooltipProvider>,
    );

    const meshContent = await screen.findByTestId('content-triangle-model');
    expect(meshContent).toHaveTextContent('triangle-model count 0');
    expect(contentMounts.triangleModel).toBe(1);

    fireEvent.click(meshContent);
    expect(screen.getByTestId('content-triangle-model')).toHaveTextContent(
      'triangle-model count 1',
    );

    act(() => {
      useWindowStore
        .getState()
        .moveWindowToContainer('triangle-model', 'sidebar');
    });

    expect(screen.getByTestId('content-triangle-model')).toHaveTextContent(
      'triangle-model count 1',
    );
    expect(contentMounts.triangleModel).toBe(1);

    act(() => {
      useWindowStore.getState().moveWindowToContainer('triangle-model', 'main');
    });

    expect(screen.getByTestId('content-triangle-model')).toHaveTextContent(
      'triangle-model count 1',
    );
    expect(contentMounts.triangleModel).toBe(1);
  });
});
