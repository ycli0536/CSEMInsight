// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WindowShell } from './WindowShell';

describe('WindowShell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders resize handles for every edge and corner', () => {
    render(
      <WindowShell title="Resizable" canResize onResize={vi.fn()}>
        <div>Window content</div>
      </WindowShell>,
    );

    expect(screen.getAllByTestId(/window-resize-handle-/)).toHaveLength(8);
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((direction) => {
      expect(
        screen.getByTestId(`window-resize-handle-${direction}`),
      ).toBeInTheDocument();
    });
  });

  it('does not render a decorative resize glyph in the southeast handle', () => {
    render(
      <WindowShell title="Resizable" canResize onResize={vi.fn()}>
        <div>Window content</div>
      </WindowShell>,
    );

    expect(
      screen.getByTestId('window-resize-handle-se').querySelector('svg'),
    ).toBeNull();
  });

  it('updates position when resizing from the north west corner', () => {
    const onResize = vi.fn();

    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240);

    render(
      <WindowShell
        title="Resizable"
        canResize
        currentPosition={{ x: 100, y: 120 }}
        minWidth={200}
        minHeight={160}
        onResize={onResize}
      >
        <div>Window content</div>
      </WindowShell>,
    );

    fireEvent.pointerDown(screen.getByTestId('window-resize-handle-nw'), {
      clientX: 100,
      clientY: 120,
    });
    fireEvent.pointerMove(window, {
      clientX: 70,
      clientY: 90,
    });
    fireEvent.pointerUp(window);

    expect(onResize).toHaveBeenCalledWith(
      { width: 350, height: 270 },
      { x: 70, y: 90 },
    );
  });
});
