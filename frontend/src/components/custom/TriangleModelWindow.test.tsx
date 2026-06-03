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
  setInteractionMode: vi.fn(),
  setLayerVisibility: vi.fn(),
  setSelectionOverlay: vi.fn(),
  setResistivityColorRange: vi.fn(),
  setTriangleResistivityValues: vi.fn(),
  setVerticalExaggeration: vi.fn(),
};

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

let latestViewerOptions:
  | {
      onHoverChange: (hover: unknown) => void;
      onLassoComplete?: (path: Array<{ x: number; y: number }>) => void;
      onLassoPreviewChange?: (path: Array<{ x: number; y: number }> | null) => void;
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

function buildEditableTriangleModelResponse() {
  return {
    polyFileName: 'editable.poly',
    resistivityFileName: 'editable.resistivity',
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
    regions: [
      { id: 10, hCoor: 0.33, vCoor: 0.33, attribute: 10, max_area: -1 },
      { id: 20, hCoor: 0.67, vCoor: 0.67, attribute: 20, max_area: -1 },
    ],
    resistivity: {
      metadata: {
        'Number of regions': 2,
      },
      table: [
        { Region: 10, Rho: 10 },
        { Region: 20, Rho: 100 },
      ],
    },
    constrainedMesh: {
      vertices: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 1, y: 0 },
        { id: 2, x: 0, y: 1 },
        { id: 3, x: 1, y: 1 },
      ],
      triangles: [
        [0, 1, 2],
        [1, 3, 2],
      ],
      triangleRegionIds: [10, 20],
      triangleResistivityValues: [10, 100],
      regionResistivity: [
        { regionId: 10, rho: 10 },
        { regionId: 20, rho: 100 },
      ],
    },
  };
}

describe('TriangleModelWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestViewerOptions = null;
  });

  it('renders Delaunay mesh icons for the model header and empty state', () => {
    render(<TriangleModelWindow />);

    expect(screen.getByTestId('triangle-model-header-icon')).toHaveAttribute(
      'data-icon',
      'delaunay-mesh',
    );
    expect(screen.getByTestId('triangle-model-header-icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByTestId('triangle-model-empty-icon')).toHaveAttribute(
      'data-icon',
      'delaunay-mesh',
    );
    expect(screen.getByTestId('triangle-model-empty-icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
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

  it('truncates long resistivity metadata values and exposes the full value on hover', async () => {
    const user = userEvent.setup();
    const longDataFileName =
      'line5_station_group_with_exceptionally_long_acquisition_name_and_processing_suffix.data';
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        ...buildEditableTriangleModelResponse(),
        resistivity: {
          metadata: {
            'Data File': longDataFileName,
            'Number of regions': 2,
          },
          table: [
            { Region: 10, Rho: 10 },
            { Region: 20, Rho: 100 },
          ],
        },
      },
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'editable.poly', { type: 'text/plain' }),
    );
    await user.upload(
      screen.getByLabelText(/resistivity file/i),
      new File(['rho'], 'editable.resistivity', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    const summaryValue = await screen.findByTitle(longDataFileName);

    expect(summaryValue).toHaveTextContent(longDataFileName);
    expect(summaryValue).toHaveClass('min-w-0', 'flex-1', 'truncate', 'text-right');
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

  it('prioritizes a usable model viewport after the model and mesh load', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: buildEditableTriangleModelResponse(),
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'editable.poly', { type: 'text/plain' }),
    );
    await user.upload(
      screen.getByLabelText(/resistivity file/i),
      new File(['rho'], 'editable.resistivity', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    expect(screen.getByTestId('triangle-model-root')).toHaveClass(
      'min-h-[560px]',
      'overflow-auto',
    );
    expect(screen.getByTestId('triangle-model-controls-panel')).toHaveClass(
      'order-2',
      'lg:order-1',
    );
    expect(screen.getByTestId('triangle-model-viewer-panel')).toHaveClass(
      'order-1',
      'min-h-[520px]',
      'lg:order-2',
    );
    expect(screen.getByTestId('triangle-model-viewport-frame')).toHaveClass(
      'min-h-[360px]',
      'flex-1',
    );
    expect(screen.getByTestId('triangle-model-canvas')).toBeInTheDocument();
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

  it('applies a lasso set-rho edit and updates triangle values without resetting data', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: buildEditableTriangleModelResponse(),
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'editable.poly', { type: 'text/plain' }),
    );
    await user.upload(
      screen.getByLabelText(/resistivity file/i),
      new File(['rho'], 'editable.resistivity', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /lasso/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /lasso/i }));
    expect(mockViewer.setInteractionMode).toHaveBeenLastCalledWith('lasso');

    act(() => {
      latestViewerOptions?.onLassoComplete?.([
        { x: -0.1, y: -0.1 },
        { x: 0.6, y: -0.1 },
        { x: 0.6, y: 0.6 },
        { x: -0.1, y: 0.6 },
      ]);
    });

    await waitFor(() => {
      expect(mockViewer.setSelectionOverlay).toHaveBeenLastCalledWith({
        selectedTriangleIndices: [0],
        featherTriangleIndices: [],
      });
    });

    await user.clear(screen.getByLabelText(/target rho/i));
    await user.type(screen.getByLabelText(/target rho/i), '1000');
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(mockViewer.setTriangleResistivityValues).toHaveBeenLastCalledWith([
        1000,
        100,
      ]);
      expect(screen.getByTestId('triangle-edit-status')).toHaveTextContent(
        /updated 1 region/i,
      );
    });

    expect(mockViewer.setData).toHaveBeenCalledTimes(1);
  });

  it('exports the current region rho values using the original resistivity file', async () => {
    const user = userEvent.setup();
    const exportedBlob = new Blob(['edited rho'], { type: 'text/plain' });
    const createObjectURL = vi.fn(() => 'blob:edited-resistivity');
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    try {
      vi.mocked(axios.post).mockImplementation(async (url) => {
        if (String(url).includes('/api/export-triangle-resistivity')) {
          return {
            data: exportedBlob,
          };
        }

        return {
          data: buildEditableTriangleModelResponse(),
        };
      });

      render(<TriangleModelWindow />);

      const resistivityFile = new File(['rho'], 'editable.resistivity', {
        type: 'text/plain',
      });
      await user.upload(
        screen.getByLabelText(/poly file/i),
        new File(['poly'], 'editable.poly', { type: 'text/plain' }),
      );
      await user.upload(screen.getByLabelText(/resistivity file/i), resistivityFile);
      await user.click(screen.getByRole('button', { name: /load triangle model/i }));

      await waitFor(() => {
        expect(mockViewer.setData).toHaveBeenCalled();
      });

      await user.upload(
        screen.getByLabelText(/resistivity file/i),
        new File(['other'], 'other.resistivity', { type: 'text/plain' }),
      );

      act(() => {
        latestViewerOptions?.onLassoComplete?.([
          { x: -0.1, y: -0.1 },
          { x: 0.6, y: -0.1 },
          { x: 0.6, y: 0.6 },
          { x: -0.1, y: 0.6 },
        ]);
      });

      await user.clear(await screen.findByLabelText(/target rho/i));
      await user.type(screen.getByLabelText(/target rho/i), '1000');
      await user.click(screen.getByRole('button', { name: /^apply$/i }));
      await user.click(screen.getByRole('button', { name: /export .resistivity/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledTimes(2);
      });

      const exportCall = vi.mocked(axios.post).mock.calls[1];
      expect(exportCall[0]).toBe(
        'http://127.0.0.1:3354/api/export-triangle-resistivity',
      );
      expect(exportCall[2]).toEqual({ responseType: 'blob' });
      const exportFormData = exportCall[1] as FormData;
      expect(exportFormData.get('resistivity_file')).toBe(resistivityFile);
      const updatesPart = exportFormData.get('region_rho_updates');
      expect(updatesPart).toBeInstanceOf(File);
      expect((updatesPart as File).name).toBe('region-rho-updates.json');
      expect(JSON.parse(await readBlobText(updatesPart as Blob))).toEqual({
        '10': 1000,
      });
      expect(createObjectURL).toHaveBeenCalledWith(exportedBlob);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:edited-resistivity');
      expect(anchorClick).toHaveBeenCalledTimes(1);
    } finally {
      anchorClick.mockRestore();
      Object.defineProperty(window.URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(window.URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it('updates and resets the mesh color limits', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: buildEditableTriangleModelResponse(),
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'editable.poly', { type: 'text/plain' }),
    );
    await user.upload(
      screen.getByLabelText(/resistivity file/i),
      new File(['rho'], 'editable.resistivity', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    await user.clear(screen.getByLabelText(/color min/i));
    await user.type(screen.getByLabelText(/color min/i), '1');
    await user.clear(screen.getByLabelText(/color max/i));
    await user.type(screen.getByLabelText(/color max/i), '500');

    await waitFor(() => {
      expect(mockViewer.setResistivityColorRange).toHaveBeenLastCalledWith({
        min: 1,
        max: 500,
      });
    });

    await user.click(screen.getByRole('button', { name: /reset color limits/i }));

    await waitFor(() => {
      expect(mockViewer.setResistivityColorRange).toHaveBeenLastCalledWith({
        min: 0.3,
        max: 1000,
      });
    });
  });

  it('undoes and redoes a lasso region edit', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockResolvedValue({
      data: buildEditableTriangleModelResponse(),
    });

    render(<TriangleModelWindow />);

    await user.upload(
      screen.getByLabelText(/poly file/i),
      new File(['poly'], 'editable.poly', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenCalled();
    });

    act(() => {
      latestViewerOptions?.onLassoComplete?.([
        { x: -0.1, y: -0.1 },
        { x: 0.6, y: -0.1 },
        { x: 0.6, y: 0.6 },
        { x: -0.1, y: 0.6 },
      ]);
    });

    await user.clear(await screen.findByLabelText(/target rho/i));
    await user.type(screen.getByLabelText(/target rho/i), '1000');
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(mockViewer.setTriangleResistivityValues).toHaveBeenLastCalledWith([
        1000,
        100,
      ]);
    });

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockViewer.setTriangleResistivityValues).toHaveBeenLastCalledWith([
      10,
      100,
    ]);

    await user.click(screen.getByRole('button', { name: /redo/i }));
    expect(mockViewer.setTriangleResistivityValues).toHaveBeenLastCalledWith([
      1000,
      100,
    ]);
  });

  it('previews a resegmented forward model from the loaded source files', async () => {
    const user = userEvent.setup();
    const polyFile = new File(['poly'], 'editable.poly', { type: 'text/plain' });
    const resistivityFile = new File(['rho'], 'editable.resistivity', {
      type: 'text/plain',
    });

    vi.mocked(axios.post).mockImplementation(async (url) => {
      if (String(url).includes('/api/upload-triangle-model')) {
        return { data: buildEditableTriangleModelResponse() };
      }
      return {
        data: {
          previewMesh: {
            vertices: [
              { id: 0, x: 0, y: 0 },
              { id: 1, x: 1000, y: 0 },
              { id: 2, x: 0, y: 1000 },
            ],
            triangles: [[0, 1, 2]],
            triangleRegionIds: [1],
            triangleResistivityValues: [10],
            regionResistivity: [{ regionId: 1, rho: 10 }],
          },
          stats: {
            sourceTriangleCount: 2,
            activeTriangleCount: 1,
            outputVertexCount: 3,
            outputSegmentCount: 3,
            outputRegionCount: 1,
            mergedComponentCount: 0,
          },
          warnings: [],
        },
      };
    });

    render(<TriangleModelWindow />);

    await user.upload(screen.getByLabelText(/poly file/i), polyFile);
    await user.upload(screen.getByLabelText(/resistivity file/i), resistivityFile);
    await user.click(screen.getByRole('button', { name: /load triangle model/i }));

    await waitFor(() => {
      expect(createTriangleModelViewer).toHaveBeenCalled();
    });

    await user.click(await screen.findByRole('button', { name: /^preview$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:3354/api/preview-triangle-resegmentation',
        expect.any(FormData),
      );
    });
    const previewCall = vi.mocked(axios.post).mock.calls.find(([url]) =>
      String(url).includes('/api/preview-triangle-resegmentation'),
    );
    const formData = previewCall?.[1] as FormData;
    expect(formData.get('poly_file')).toBe(polyFile);
    expect(formData.get('resistivity_file')).toBe(resistivityFile);
    expect(JSON.parse(String(formData.get('parameters')))).toEqual(
      expect.objectContaining({
        onlyFreeParameters: true,
        rhoLevels: [0.3, 3, 10, 30, 100, 300, 10000000000000],
      }),
    );

    await waitFor(() => {
      expect(mockViewer.setData).toHaveBeenLastCalledWith({
        mesh: expect.objectContaining({
          triangleResistivityValues: [10],
          points: expect.arrayContaining([expect.objectContaining({ x: 1, y: 0 })]),
        }),
        model: expect.any(Object),
      });
    });
    expect(screen.getByText(/previewed 1 forward-model region/i)).toBeInTheDocument();
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
