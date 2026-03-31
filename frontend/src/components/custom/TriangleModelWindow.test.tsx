// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

import { TriangleModelWindow } from './TriangleModelWindow';
import { formatTriangleHoverSummary } from '@/services/triangleModelHoverSummary';
import { createTriangleModelViewer } from '@/services/triangleModelViewer';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

const mockViewer = {
  dispose: vi.fn(),
  resetView: vi.fn(),
  resize: vi.fn(),
  setData: vi.fn(),
  setLayerVisibility: vi.fn(),
  setVerticalExaggeration: vi.fn(),
};

let latestViewerOptions:
  | {
      onHoverChange: (hover: unknown) => void;
      onViewChange: (view: unknown) => void;
      canvas: HTMLCanvasElement;
      interactionTarget: HTMLElement;
    }
  | null = null;

vi.mock('@/services/triangleModelViewer', () => ({
  createTriangleModelViewer: vi.fn((options) => {
    latestViewerOptions = options;
    return mockViewer;
  }),
}));

describe('TriangleModelWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestViewerOptions = null;
  });

  it('renders the three.js canvas viewport after upload succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        polyFileName: 'simple.poly',
        resistivityFileName: 'simple.resistivity',
        vertices: [
          { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 2, hCoor: 1, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 3, hCoor: 0, vCoor: 1, attributes: [], boundary_marker: null },
          { id: 4, hCoor: 1, vCoor: 1, attributes: [], boundary_marker: null },
        ],
        segments: [
          { id: 1, endpoint_1: 1, endpoint_2: 2, boundary_marker: null },
          { id: 2, endpoint_1: 2, endpoint_2: 4, boundary_marker: null },
          { id: 3, endpoint_1: 4, endpoint_2: 3, boundary_marker: null },
          { id: 4, endpoint_1: 3, endpoint_2: 1, boundary_marker: null },
        ],
        holes: [],
        regions: [{ id: 1, hCoor: 0.5, vCoor: 0.5, attribute: 1, max_area: -1 }],
        resistivity: {
          metadata: {
            'Number of regions': 1,
          },
          table: [{ Region: 1, Rho: 100 }],
        },
        constrainedMesh: {
          vertices: [
            { id: 0, x: 0, y: 0 },
            { id: 1, x: 1, y: 0 },
            { id: 2, x: 0, y: 1 },
          ],
          triangles: [[0, 1, 2]],
          triangleRegionIds: [1],
          triangleResistivityValues: [100],
          regionResistivity: [{ regionId: 1, rho: 100 }],
        },
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'simple.poly', { type: 'text/plain' }),
    );
    await user.upload(
      screen.getByLabelText(/resistivity file/i),
      new File(['rho'], 'simple.resistivity', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:3354/api/upload-triangle-model',
        expect.any(FormData),
      );
    });

    await waitFor(() => {
      expect(createTriangleModelViewer).toHaveBeenCalled();
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    expect(mockViewer.setData).toHaveBeenLastCalledWith({
      mesh: expect.objectContaining({
        source: 'constrained',
        triangleResistivityValues: [100],
      }),
      model: expect.objectContaining({
        constrainedMesh: expect.objectContaining({
          triangleRegionIds: [1],
        }),
      }),
    });
    expect(await screen.findByTestId('triangle-model-canvas')).toBeInTheDocument();
    expect(await screen.findByTestId('triangle-stat-vertices')).toHaveTextContent('4');
    expect(screen.getByTestId('triangle-stat-segments')).toHaveTextContent('4');
    expect(screen.getByTestId('triangle-stat-regions')).toHaveTextContent('1');
    expect(screen.getByTestId('triangle-stat-triangles')).toHaveTextContent('1');
    expect(screen.getByText(/cells are colored from constrained region resistivity/i)).toBeInTheDocument();
    const colorbar = screen.getByTestId('triangle-colorbar');
    expect(colorbar).toBeInTheDocument();
    expect(within(colorbar).getByText(/resistivity/i)).toBeInTheDocument();
    expect(within(colorbar).getByText('0.3')).toBeInTheDocument();
    expect(within(colorbar).getByText('1000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^model$/i })).toBeInTheDocument();
    expect(mockViewer.setLayerVisibility).toHaveBeenLastCalledWith({
      segments: false,
      triangles: true,
      vertices: false,
    });
  });

  it('renders viewport axes from the current camera view and updates ticks after zooming', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        polyFileName: 'simple.poly',
        resistivityFileName: null,
        vertices: [
          { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 2, hCoor: 10, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 3, hCoor: 0, vCoor: 10, attributes: [], boundary_marker: null },
        ],
        segments: [
          { id: 1, endpoint_1: 1, endpoint_2: 2, boundary_marker: null },
          { id: 2, endpoint_1: 2, endpoint_2: 3, boundary_marker: null },
          { id: 3, endpoint_1: 3, endpoint_2: 1, boundary_marker: null },
        ],
        holes: [],
        regions: [],
        resistivity: null,
        constrainedMesh: null,
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'simple.poly', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
      expect(latestViewerOptions).not.toBeNull();
    });

    expect(latestViewerOptions?.interactionTarget).toBe(
      screen.getByTestId('triangle-model-viewport-frame'),
    );

    act(() => {
      latestViewerOptions?.onViewChange({
        cameraState: {
          baseHeight: 10,
          baseWidth: 10,
          centerX: 5,
          centerY: 5,
          zoom: 1,
        },
        canvasSize: {
          height: 240,
          width: 360,
        },
      });
    });

    const axes = await screen.findByTestId('triangle-viewport-axes');
    expect(within(axes).getAllByText('0')).toHaveLength(2);
    expect(within(axes).getAllByText('10')).toHaveLength(2);

    act(() => {
      latestViewerOptions?.onViewChange({
        cameraState: {
          baseHeight: 10,
          baseWidth: 10,
          centerX: 5,
          centerY: 5,
          zoom: 8,
        },
        canvasSize: {
          height: 240,
          width: 360,
        },
      });
    });

    await waitFor(() => {
      expect(within(axes).getAllByText('4.5')).toHaveLength(2);
    });
  });

  it('keeps the three.js canvas stretched to the plot area when axes are shown', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        polyFileName: 'simple.poly',
        resistivityFileName: null,
        vertices: [
          { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 2, hCoor: 10, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 3, hCoor: 0, vCoor: 10, attributes: [], boundary_marker: null },
        ],
        segments: [
          { id: 1, endpoint_1: 1, endpoint_2: 2, boundary_marker: null },
          { id: 2, endpoint_1: 2, endpoint_2: 3, boundary_marker: null },
          { id: 3, endpoint_1: 3, endpoint_2: 1, boundary_marker: null },
        ],
        holes: [],
        regions: [],
        resistivity: null,
        constrainedMesh: null,
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'simple.poly', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    const plotArea = await screen.findByTestId('triangle-model-plot-area');
    const canvas = screen.getByTestId('triangle-model-canvas');

    expect(plotArea).toHaveClass('absolute', 'overflow-hidden');
    expect(canvas).toHaveClass('h-full', 'w-full');
  });

  it('forwards layer visibility changes to the viewer after the model loads', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        polyFileName: 'simple.poly',
        resistivityFileName: null,
        vertices: [
          { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 2, hCoor: 1, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 3, hCoor: 0, vCoor: 1, attributes: [], boundary_marker: null },
          { id: 4, hCoor: 1, vCoor: 1, attributes: [], boundary_marker: null },
        ],
        segments: [
          { id: 1, endpoint_1: 1, endpoint_2: 2, boundary_marker: null },
          { id: 2, endpoint_1: 2, endpoint_2: 4, boundary_marker: null },
        ],
        holes: [],
        regions: [],
        resistivity: null,
        constrainedMesh: null,
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'simple.poly', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /vertices/i }));
    await user.click(screen.getByRole('button', { name: /^model$/i }));
    await user.click(screen.getByRole('button', { name: /segments/i }));

    expect(mockViewer.setLayerVisibility).toHaveBeenLastCalledWith({
      segments: false,
      triangles: false,
      vertices: true,
    });
    expect(
      screen.getByText(/triangles are computed with unconstrained delaunator/i),
    ).toBeInTheDocument();
  });

  it('resets the viewer camera when reset is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        polyFileName: 'simple.poly',
        resistivityFileName: null,
        vertices: [
          { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 2, hCoor: 1, vCoor: 0, attributes: [], boundary_marker: null },
          { id: 3, hCoor: 0, vCoor: 1, attributes: [], boundary_marker: null },
        ],
        segments: [{ id: 1, endpoint_1: 1, endpoint_2: 2, boundary_marker: null }],
        holes: [],
        regions: [],
        resistivity: null,
        constrainedMesh: null,
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'simple.poly', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /reset/i }));

    expect(mockViewer.resetView).toHaveBeenCalledTimes(1);
  });

  it('formats hover copy as rho-only when resistivity is available', () => {
    expect(
      formatTriangleHoverSummary(
        {
          point: { x: 12.25, y: 7.5 },
          triangleIndex: 1,
          regionId: 8,
          resistivityValue: 100,
          vertex: { id: 4, x: 12.25, y: 7.5 },
          segment: null,
        },
        {
          regions: [{ id: 8, hCoor: 10.5, vCoor: 6.25, attribute: 1, max_area: -1 }],
          vertices: [],
        },
      ),
    ).toBe('Rho 100.0 @ (10.50, 6.25)');
  });

  it('falls back to the nearest source vertex when rho exists but region center is missing', () => {
    expect(
      formatTriangleHoverSummary(
        {
          point: { x: 12.25, y: 7.5 },
          triangleIndex: 1,
          regionId: 8,
          resistivityValue: 100,
          vertex: null,
          segment: null,
        },
        {
          regions: [],
          vertices: [
            { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
            { id: 2, hCoor: 11.9, vCoor: 7.1, attributes: [], boundary_marker: null },
            { id: 3, hCoor: 20, vCoor: 20, attributes: [], boundary_marker: null },
          ],
        },
      ),
    ).toBe('Rho 100.0 @ (11.90, 7.10)');
  });

  it('falls back to geometry copy when no resistivity value is available', () => {
    expect(
      formatTriangleHoverSummary({
        point: { x: 1, y: 2 },
        triangleIndex: null,
        regionId: null,
        resistivityValue: null,
        vertex: null,
        segment: {
          id: 3,
          endpoint_1: 7,
          endpoint_2: 8,
          boundary_marker: null,
        },
      }),
    ).toBe('Segment 3: 7 -> 8');
  });
});
