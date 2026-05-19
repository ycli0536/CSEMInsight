// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TriangleResegmentPanel } from './TriangleResegmentPanel';

const preview = {
  previewMesh: {
    vertices: [],
    triangles: [],
    triangleRegionIds: [],
    triangleResistivityValues: [],
    regionResistivity: [],
  },
  stats: {
    sourceTriangleCount: 12,
    activeTriangleCount: 8,
    outputVertexCount: 6,
    outputSegmentCount: 7,
    outputRegionCount: 3,
    mergedComponentCount: 1,
  },
  warnings: ['Boundary simplification used topology-safe fallback'],
};

describe('TriangleResegmentPanel', () => {
  it('disables preview when ROI limits are invalid', async () => {
    const user = userEvent.setup();
    render(<TriangleResegmentPanel onPreview={vi.fn()} onExport={vi.fn()} />);

    await user.clear(screen.getByLabelText(/y min/i));
    await user.type(screen.getByLabelText(/y min/i), '10');
    await user.clear(screen.getByLabelText(/y max/i));
    await user.type(screen.getByLabelText(/y max/i), '1');

    expect(screen.getByRole('button', { name: /^preview$/i })).toBeDisabled();
    expect(screen.getByText(/y min must be less than y max/i)).toBeInTheDocument();
  });

  it('disables preview when rho levels are invalid', async () => {
    const user = userEvent.setup();
    render(<TriangleResegmentPanel onPreview={vi.fn()} onExport={vi.fn()} />);

    await user.clear(screen.getByLabelText(/rho levels/i));
    await user.type(screen.getByLabelText(/rho levels/i), '0, 10');

    expect(screen.getByRole('button', { name: /^preview$/i })).toBeDisabled();
    expect(screen.getByText(/rho levels must be positive/i)).toBeInTheDocument();
  });

  it('calls onPreview with parsed parameters', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<TriangleResegmentPanel onPreview={onPreview} onExport={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(onPreview).toHaveBeenCalledWith({
      roi: { yMin: -100, yMax: 100, zMin: 0, zMax: 50 },
      rhoLevels: [0.3, 3, 10, 30, 100, 300, 10000000000000],
      onlyFreeParameters: true,
      boundaryTolerance: 0,
      minimumRegionArea: 0,
    });
  });

  it('renders preview stats and warnings', () => {
    render(
      <TriangleResegmentPanel
        preview={preview}
        onPreview={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/topology-safe fallback/i)).toBeInTheDocument();
  });

  it('disables export until preview data exists', () => {
    const { rerender } = render(
      <TriangleResegmentPanel onPreview={vi.fn()} onExport={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /export both/i })).toBeDisabled();

    rerender(
      <TriangleResegmentPanel
        preview={preview}
        onPreview={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /export both/i })).toBeEnabled();
  });
});
