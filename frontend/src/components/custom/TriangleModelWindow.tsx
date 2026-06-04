import axios from 'axios';
import {
  ChevronDown,
  Check,
  Download,
  Eye,
  LassoSelect,
  Loader2,
  MousePointer2,
  Move,
  Redo2,
  RotateCcw,
  Undo2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DelaunayMeshIcon } from '@/components/icons/DelaunayMeshIcon';
import { TriangleResegmentPanel } from '@/components/custom/TriangleResegmentPanel';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { buildRegionAdjacency, getFeatherRegionWeights } from '@/services/triangleRegionAdjacency';
import {
  applyEditPatch,
  applySetRhoEdit,
  buildRegionRhoMap,
  deriveTriangleResistivityValues,
  revertEditPatch,
  type TriangleRegionEditPatch,
} from '@/services/triangleRegionEditing';
import {
  collectSelectedRegionIds,
  selectTrianglesByLasso,
  type TriangleModelPoint2D,
} from '@/services/triangleRegionSelection';
import {
  buildTriangleResistivityGradientCss,
  buildTriangleResistivityLegendTicks,
  formatTriangleResistivityTick,
  TRIANGLE_RESISTIVITY_RANGE,
  type TriangleResistivityColorRange,
} from '@/services/triangleModelColorScale';
import { formatTriangleHoverSummary } from '@/services/triangleModelHoverSummary';
import {
  buildTriangleMeshFromConstrainedMesh,
  buildTriangleMeshFromModel,
} from '@/services/triangleModelMesh';
import {
  exportTriangleResegmentation,
  previewTriangleResegmentation,
} from '@/services/triangleResegmentation';
import {
  buildTriangleViewportAxes,
  TRIANGLE_VIEWPORT_AXIS_GUTTERS,
} from '@/services/triangleViewportAxes';
import {
  createTriangleModelViewer,
  type TriangleModelViewer,
  type TriangleViewportView,
} from '@/services/triangleModelViewer';
import type {
  TriangleHoverState,
  TriangleLayerVisibility,
  TriangleConstrainedMesh,
  TriangleMesh,
  TriangleModelResponse,
  TriangleResegmentationExportResponse,
  TriangleResegmentationParameters,
  TriangleResegmentationPreviewResponse,
} from '@/types';

const DEFAULT_LAYER_VISIBILITY: TriangleLayerVisibility = {
  triangles: true,
  segments: true,
  vertices: false,
};

interface TriangleLassoSelection {
  featherTriangleIndices: number[];
  regionWeights: Map<number, number>;
  selectedRegionIds: Set<number>;
  selectedTriangleIndices: number[];
}

function getInitialLayerVisibility(mesh: TriangleMesh): TriangleLayerVisibility {
  const hasCellColors =
    mesh.source === 'constrained' &&
    (mesh.triangleResistivityValues ?? []).some((value) => value !== null);

  return {
    triangles: true,
    segments: !hasCellColors,
    vertices: false,
  };
}

function getTriangleIndicesForRegionIds(mesh: TriangleMesh, regionIds: Set<number>) {
  const triangleIndices: number[] = [];

  mesh.triangleRegionIds?.forEach((regionId, triangleIndex) => {
    if (regionId !== null && regionIds.has(regionId)) {
      triangleIndices.push(triangleIndex);
    }
  });

  return triangleIndices;
}

function getUploadErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed to load triangle model files.';
}

function getEditedResistivityFileName(fileName: string) {
  if (fileName.endsWith('.resistivity')) {
    return `${fileName.slice(0, -'.resistivity'.length)}.edited.resistivity`;
  }

  return `${fileName}.edited.resistivity`;
}

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

function scaleConstrainedMeshForDisplay(
  constrainedMesh: TriangleConstrainedMesh,
): TriangleConstrainedMesh {
  return {
    ...constrainedMesh,
    vertices: constrainedMesh.vertices.map((vertex) => ({
      ...vertex,
      x: vertex.x * 1e-3,
      y: vertex.y * 1e-3,
    })),
  };
}

function isSameRhoValue(previousRho: number, nextRho: number) {
  const tolerance = Math.max(1e-12, Math.abs(previousRho) * 1e-12);
  return Math.abs(previousRho - nextRho) <= tolerance;
}

function buildChangedRegionRhoUpdates(
  baseRhoByRegion: Map<number, number>,
  rhoByRegion: Map<number, number>,
) {
  const updates: Record<string, number> = {};
  rhoByRegion.forEach((rho, regionId) => {
    const baseRho = baseRhoByRegion.get(regionId);
    if (baseRho === undefined || !isSameRhoValue(baseRho, rho)) {
      updates[String(regionId)] = rho;
    }
  });
  return updates;
}

function parseResistivityColorRange(minInput: string, maxInput: string) {
  const min = Number(minInput);
  const max = Number(maxInput);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min) {
    return null;
  }

  return { min, max };
}

export function TriangleModelWindow() {
  const [polyFile, setPolyFile] = useState<File | null>(null);
  const [resistivityFile, setResistivityFile] = useState<File | null>(null);
  const [loadedPolyFile, setLoadedPolyFile] = useState<File | null>(null);
  const [loadedResistivityFile, setLoadedResistivityFile] = useState<File | null>(null);
  const [model, setModel] = useState<TriangleModelResponse | null>(null);
  const [mesh, setMesh] = useState<TriangleMesh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<TriangleLayerVisibility>(
    DEFAULT_LAYER_VISIBILITY,
  );
  const [hover, setHover] = useState<TriangleHoverState | null>(null);
  const [viewportView, setViewportView] = useState<TriangleViewportView | null>(null);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'lasso'>('pan');
  const [targetRho, setTargetRho] = useState('100');
  const [colorMinInput, setColorMinInput] = useState(String(TRIANGLE_RESISTIVITY_RANGE.min));
  const [colorMaxInput, setColorMaxInput] = useState(String(TRIANGLE_RESISTIVITY_RANGE.max));
  const [resistivityColorRange, setResistivityColorRange] =
    useState<TriangleResistivityColorRange>({
      min: TRIANGLE_RESISTIVITY_RANGE.min,
      max: TRIANGLE_RESISTIVITY_RANGE.max,
    });
  const [isFeatherEnabled, setIsFeatherEnabled] = useState(false);
  const [featherRings, setFeatherRings] = useState(2);
  const [regionRhoById, setRegionRhoById] = useState<Map<number, number>>(new Map());
  const [baseRegionRhoById, setBaseRegionRhoById] = useState<Map<number, number>>(new Map());
  const [undoStack, setUndoStack] = useState<TriangleRegionEditPatch[]>([]);
  const [redoStack, setRedoStack] = useState<TriangleRegionEditPatch[]>([]);
  const [lassoSelection, setLassoSelection] = useState<TriangleLassoSelection | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [isExportingResistivity, setIsExportingResistivity] = useState(false);
  const [resegmentationPreview, setResegmentationPreview] =
    useState<TriangleResegmentationPreviewResponse | null>(null);
  const [resegmentationStatus, setResegmentationStatus] = useState<string | null>(null);
  const [isPreviewingResegmentation, setIsPreviewingResegmentation] = useState(false);
  const [isExportingResegmentation, setIsExportingResegmentation] = useState(false);
  const [isSegmentationOpen, setIsSegmentationOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<TriangleModelViewer | null>(null);
  const lassoCompleteHandlerRef = useRef<(path: TriangleModelPoint2D[]) => void>(() => {});

  const hoverSummary = useMemo(
    () =>
      formatTriangleHoverSummary(hover, model ? {
        regions: model.regions,
        vertices: model.vertices,
      } : null),
    [hover, model],
  );
  const resistivityMetadata = model?.resistivity?.metadata ?? {};
  const resistivityRows = model?.resistivity?.table ?? [];
  const showColorbar =
    mesh?.source === 'constrained' &&
    !!model?.resistivity &&
    (mesh.triangleResistivityValues ?? []).some((value) => value !== null);
  const colorbarGradient = useMemo(
    () => buildTriangleResistivityGradientCss(resistivityColorRange, 'to right'),
    [resistivityColorRange],
  );
  const colorbarTicks = useMemo(
    () => buildTriangleResistivityLegendTicks(resistivityColorRange),
    [resistivityColorRange],
  );
  const viewportAxes = useMemo(
    () =>
      viewportView
        ? buildTriangleViewportAxes({
            cameraState: viewportView.cameraState,
            plotSize: viewportView.canvasSize,
            verticalExaggeration,
          })
        : null,
    [viewportView, verticalExaggeration],
  );
  const canEditRegions =
    !resegmentationPreview &&
    mesh?.source === 'constrained' &&
    (mesh.triangleRegionIds ?? []).some((regionId) => regionId !== null) &&
    regionRhoById.size > 0;
  const changedRegionRhoUpdates = useMemo(
    () => buildChangedRegionRhoUpdates(baseRegionRhoById, regionRhoById),
    [baseRegionRhoById, regionRhoById],
  );
  const canExportResistivity =
    !!loadedResistivityFile && Object.keys(changedRegionRhoUpdates).length > 0;
  const targetRhoValue = Number(targetRho);
  const hasValidTargetRho = Number.isFinite(targetRhoValue) && targetRhoValue > 0;

  const handleLoadModel = async () => {
    if (!polyFile) {
      setError('Select a .poly file before loading the model.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('poly_file', polyFile);
    if (resistivityFile) {
      formData.append('resistivity_file', resistivityFile);
    }

    try {
      const response = await axios.post<TriangleModelResponse>(
        'http://127.0.0.1:3354/api/upload-triangle-model',
        formData,
      );
      const nextMesh = buildTriangleMeshFromModel(response.data);
      setModel(response.data);
      setMesh(nextMesh);
      setVisibleLayers(getInitialLayerVisibility(nextMesh));
      setHover(null);
      setViewportView(null);
      setInteractionMode('pan');
      const nextRegionRhoById = buildRegionRhoMap(response.data);
      setRegionRhoById(nextRegionRhoById);
      setBaseRegionRhoById(nextRegionRhoById);
      setLoadedPolyFile(polyFile);
      setLoadedResistivityFile(resistivityFile);
      setUndoStack([]);
      setRedoStack([]);
      setLassoSelection(null);
      setEditStatus(null);
      setResegmentationPreview(null);
      setResegmentationStatus(null);
      setIsSegmentationOpen(false);
    } catch (uploadError) {
      setError(getUploadErrorMessage(uploadError));
      setModel(null);
      setMesh(null);
      setHover(null);
      setViewportView(null);
      setRegionRhoById(new Map());
      setBaseRegionRhoById(new Map());
      setLoadedPolyFile(null);
      setLoadedResistivityFile(null);
      setUndoStack([]);
      setRedoStack([]);
      setLassoSelection(null);
      setEditStatus(null);
      setResegmentationPreview(null);
      setResegmentationStatus(null);
      setIsSegmentationOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLayer = (layer: keyof TriangleLayerVisibility) => {
    setVisibleLayers((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  };

  const pushTriangleValuesToViewer = useCallback(
    (rhoByRegion: Map<number, number>) => {
      if (!viewerRef.current || !mesh) {
        return;
      }

      viewerRef.current.setTriangleResistivityValues(
        deriveTriangleResistivityValues({
          mesh,
          rhoByRegion,
        }),
      );
    },
    [mesh],
  );

  const handleCancelLasso = useCallback(() => {
    setLassoSelection(null);
    setEditStatus(null);
    viewerRef.current?.setSelectionOverlay(null);
  }, []);

  const handleLassoComplete = useCallback(
    (path: TriangleModelPoint2D[]) => {
      if (!mesh || path.length < 3) {
        handleCancelLasso();
        return;
      }

      const hitTriangleIndices = selectTrianglesByLasso(mesh, path);
      const selectedRegionIds = collectSelectedRegionIds(mesh, hitTriangleIndices);
      if (selectedRegionIds.size === 0) {
        setLassoSelection(null);
        setEditStatus('No editable regions selected.');
        viewerRef.current?.setSelectionOverlay(null);
        return;
      }

      const regionWeights = isFeatherEnabled
        ? getFeatherRegionWeights({
            adjacency: buildRegionAdjacency(mesh),
            selectedRegionIds,
            rings: featherRings,
          })
        : new Map(Array.from(selectedRegionIds, (regionId) => [regionId, 1]));
      const featherRegionIds = new Set(
        Array.from(regionWeights.keys()).filter(
          (regionId) => !selectedRegionIds.has(regionId),
        ),
      );
      const selectedTriangleIndices = getTriangleIndicesForRegionIds(
        mesh,
        selectedRegionIds,
      );
      const featherTriangleIndices = getTriangleIndicesForRegionIds(mesh, featherRegionIds);

      setLassoSelection({
        featherTriangleIndices,
        regionWeights,
        selectedRegionIds,
        selectedTriangleIndices,
      });
      setEditStatus(
        `Selected ${selectedRegionIds.size} region${selectedRegionIds.size === 1 ? '' : 's'}.`,
      );
      viewerRef.current?.setSelectionOverlay({
        selectedTriangleIndices,
        featherTriangleIndices,
      });
    },
    [featherRings, handleCancelLasso, isFeatherEnabled, mesh],
  );

  const handleApplyEdit = () => {
    if (!lassoSelection) {
      setEditStatus('Draw a lasso before applying an edit.');
      return;
    }

    if (!hasValidTargetRho) {
      setEditStatus('Target rho must be a positive number.');
      return;
    }

    const patch = applySetRhoEdit({
      currentRhoByRegion: regionRhoById,
      regionWeights: lassoSelection.regionWeights,
      targetRho: targetRhoValue,
    });
    if (patch.nextRhoByRegion.size === 0) {
      setEditStatus('No selected regions have editable rho values.');
      return;
    }

    const nextRhoByRegion = applyEditPatch(regionRhoById, patch);
    setRegionRhoById(nextRhoByRegion);
    setUndoStack((current) => [...current, patch]);
    setRedoStack([]);
    pushTriangleValuesToViewer(nextRhoByRegion);
    setEditStatus(
      `Updated ${patch.nextRhoByRegion.size} region${
        patch.nextRhoByRegion.size === 1 ? '' : 's'
      }${patch.skippedRegionIds.length > 0 ? `, skipped ${patch.skippedRegionIds.length}` : ''}.`,
    );
  };

  const handleUndoEdit = () => {
    const patch = undoStack[undoStack.length - 1];
    if (!patch) {
      return;
    }

    const nextRhoByRegion = revertEditPatch(regionRhoById, patch);
    setRegionRhoById(nextRhoByRegion);
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, patch]);
    pushTriangleValuesToViewer(nextRhoByRegion);
    setEditStatus('Undo applied.');
  };

  const handleRedoEdit = () => {
    const patch = redoStack[redoStack.length - 1];
    if (!patch) {
      return;
    }

    const nextRhoByRegion = applyEditPatch(regionRhoById, patch);
    setRegionRhoById(nextRhoByRegion);
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, patch]);
    pushTriangleValuesToViewer(nextRhoByRegion);
    setEditStatus('Redo applied.');
  };

  const handleColorLimitChange = (nextMinInput: string, nextMaxInput: string) => {
    setColorMinInput(nextMinInput);
    setColorMaxInput(nextMaxInput);

    const nextRange = parseResistivityColorRange(nextMinInput, nextMaxInput);
    if (!nextRange) {
      setEditStatus('Color limits require 0 < min < max.');
      return;
    }

    setResistivityColorRange(nextRange);
    setEditStatus(null);
  };

  const handleResetColorLimits = () => {
    const defaultRange = {
      min: TRIANGLE_RESISTIVITY_RANGE.min,
      max: TRIANGLE_RESISTIVITY_RANGE.max,
    };
    setColorMinInput(String(defaultRange.min));
    setColorMaxInput(String(defaultRange.max));
    setResistivityColorRange(defaultRange);
    setEditStatus('Color limits reset.');
  };

  const handleExportResistivity = async () => {
    if (!loadedResistivityFile) {
      setEditStatus('Load a .resistivity file before exporting.');
      return;
    }
    if (Object.keys(changedRegionRhoUpdates).length === 0) {
      setEditStatus('No region rho edits are available to export.');
      return;
    }

    setIsExportingResistivity(true);
    setEditStatus('Exporting .resistivity...');

    const formData = new FormData();
    formData.append('resistivity_file', loadedResistivityFile);
    formData.append(
      'region_rho_updates',
      new Blob([JSON.stringify(changedRegionRhoUpdates)], {
        type: 'application/json',
      }),
      'region-rho-updates.json',
    );

    try {
      const response = await axios.post<Blob>(
        'http://127.0.0.1:3354/api/export-triangle-resistivity',
        formData,
        { responseType: 'blob' },
      );
      const downloadUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = getEditedResistivityFileName(loadedResistivityFile.name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      setEditStatus(`Exported ${link.download}.`);
    } catch (exportError) {
      setEditStatus(getUploadErrorMessage(exportError));
    } finally {
      setIsExportingResistivity(false);
    }
  };

  const applyResegmentationPreview = (
    response: TriangleResegmentationPreviewResponse | TriangleResegmentationExportResponse,
  ) => {
    const previewMesh = buildTriangleMeshFromConstrainedMesh(
      scaleConstrainedMeshForDisplay(response.previewMesh),
    );
    setResegmentationPreview({
      previewMesh: response.previewMesh,
      stats: response.stats,
      warnings: response.warnings,
    });
    setMesh(previewMesh);
    setVisibleLayers({
      triangles: true,
      segments: false,
      vertices: false,
    });
    setInteractionMode('pan');
    setLassoSelection(null);
    viewerRef.current?.setSelectionOverlay(null);
  };

  const handlePreviewResegmentation = async (
    parameters: TriangleResegmentationParameters,
  ) => {
    if (!loadedPolyFile || !loadedResistivityFile) {
      setResegmentationStatus('Load a .poly and .resistivity file before previewing.');
      return;
    }

    setIsPreviewingResegmentation(true);
    setResegmentationStatus('Building resegmentation preview...');

    try {
      const response = await previewTriangleResegmentation({
        polyFile: loadedPolyFile,
        resistivityFile: loadedResistivityFile,
        parameters,
      });
      applyResegmentationPreview(response);
      setResegmentationStatus(
        `Previewed ${response.stats.outputRegionCount} forward-model region${
          response.stats.outputRegionCount === 1 ? '' : 's'
        }.`,
      );
    } catch (previewError) {
      setResegmentationPreview(null);
      setResegmentationStatus(getUploadErrorMessage(previewError));
    } finally {
      setIsPreviewingResegmentation(false);
    }
  };

  const handleExportResegmentation = async (
    parameters: TriangleResegmentationParameters,
  ) => {
    if (!loadedPolyFile || !loadedResistivityFile) {
      setResegmentationStatus('Load a .poly and .resistivity file before exporting.');
      return;
    }

    setIsExportingResegmentation(true);
    setResegmentationStatus('Exporting resegmented model...');

    try {
      const response = await exportTriangleResegmentation({
        polyFile: loadedPolyFile,
        resistivityFile: loadedResistivityFile,
        parameters,
      });
      applyResegmentationPreview(response);
      downloadTextFile(response.polyFileName, response.polyText);
      downloadTextFile(response.resistivityFileName, response.resistivityText);
      setResegmentationStatus(
        `Exported ${response.polyFileName} and ${response.resistivityFileName}.`,
      );
    } catch (exportError) {
      setResegmentationStatus(getUploadErrorMessage(exportError));
    } finally {
      setIsExportingResegmentation(false);
    }
  };

  useEffect(() => {
    lassoCompleteHandlerRef.current = handleLassoComplete;
  }, [handleLassoComplete]);

  useEffect(() => {
    if (!model || !mesh || !canvasRef.current || !viewportRef.current) {
      return;
    }

    if (!viewerRef.current) {
      viewerRef.current = createTriangleModelViewer({
        canvas: canvasRef.current,
        interactionTarget: viewportRef.current,
        onHoverChange: setHover,
        onLassoComplete: (path) => lassoCompleteHandlerRef.current(path),
        onViewChange: setViewportView,
      });
    }

    viewerRef.current.resize();
  }, [mesh, model]);

  useEffect(() => {
    if (!viewerRef.current || !model || !mesh) {
      return;
    }

    viewerRef.current.setData({ mesh, model });
  }, [mesh, model]);

  useEffect(() => {
    if (!viewerRef.current || !model || !mesh) {
      return;
    }

    viewerRef.current.setLayerVisibility(visibleLayers);
  }, [mesh, model, visibleLayers]);

  useEffect(() => {
    if (!viewerRef.current || !model || !mesh) {
      return;
    }

    viewerRef.current.setInteractionMode(interactionMode);
  }, [interactionMode, mesh, model]);

  useEffect(() => {
    if (!viewerRef.current || !model || !mesh) {
      return;
    }

    viewerRef.current.setVerticalExaggeration(verticalExaggeration);
  }, [mesh, model, verticalExaggeration]);

  useEffect(() => {
    if (!viewerRef.current || !model || !mesh) {
      return;
    }

    viewerRef.current.setResistivityColorRange(resistivityColorRange);
  }, [mesh, model, resistivityColorRange]);

  useEffect(() => {
    if ((model && mesh) || !viewerRef.current) {
      return;
    }

    viewerRef.current.dispose();
    viewerRef.current = null;
    setViewportView(null);
  }, [mesh, model]);

  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!viewportRef.current || !viewerRef.current) {
      return;
    }

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            viewerRef.current?.resize();
          });
    const resizeHandler = () => {
      viewerRef.current?.resize();
    };

    if (observer) {
      observer.observe(viewportRef.current);
    } else {
      window.addEventListener('resize', resizeHandler);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', resizeHandler);
      }
    };
  }, [mesh, model]);

  return (
    <div
      data-testid="triangle-model-root"
      className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(19rem,21rem)]"
    >
      <section
        data-testid="triangle-model-controls-panel"
        className="order-2 flex shrink-0 flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm lg:order-2 lg:h-full lg:min-h-0 lg:overflow-y-auto"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DelaunayMeshIcon className="h-4 w-4" data-testid="triangle-model-header-icon" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">2D Triangle Model</h2>
              <p className="text-xs text-muted-foreground">
                Load a `.poly` mesh and optional `.resistivity` model.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-border/50 bg-background/70 p-3">
          <div className="space-y-2">
            <label
              htmlFor="triangle-model-poly"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Poly File
            </label>
            <input
              id="triangle-model-poly"
              aria-label="Poly file"
              type="file"
              accept=".poly"
              onChange={(event) => {
                setPolyFile(event.target.files?.[0] ?? null);
              }}
              className="block w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
            />
            <p className="text-xs text-muted-foreground">
              {polyFile ? polyFile.name : 'Required. Used as the source geometry.'}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="triangle-model-resistivity"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Resistivity File
            </label>
            <input
              id="triangle-model-resistivity"
              aria-label="Resistivity file"
              type="file"
              accept=".resistivity"
              onChange={(event) => {
                setResistivityFile(event.target.files?.[0] ?? null);
              }}
              className="block w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <p className="text-xs text-muted-foreground">
              {resistivityFile
                ? resistivityFile.name
                : 'Optional. Used for metadata and table inspection.'}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleLoadModel}
            disabled={isLoading}
            className="w-full justify-center gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Load Triangle Model
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-border/40 bg-background/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Source Stats
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Vertices</p>
                <p className="text-lg font-semibold" data-testid="triangle-stat-vertices">
                  {model?.vertices.length ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Segments</p>
                <p className="text-lg font-semibold" data-testid="triangle-stat-segments">
                  {model?.segments.length ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Holes</p>
                <p className="text-lg font-semibold">{model?.holes.length ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Regions</p>
                <p className="text-lg font-semibold" data-testid="triangle-stat-regions">
                  {model?.regions.length ?? 0}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Delaunay Triangles</p>
                <p className="text-lg font-semibold" data-testid="triangle-stat-triangles">
                  {mesh?.triangles.length ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-border/40 bg-background/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Resistivity Summary
            </p>
            {model?.resistivity ? (
              <div className="mt-3 min-w-0 space-y-2 text-sm">
                {Object.entries(resistivityMetadata).slice(0, 5).map(([key, value]) => {
                  const displayValue = String(value);
                  return (
                    <div key={key} className="flex min-w-0 items-start justify-between gap-3">
                      <span className="shrink-0 text-muted-foreground">{key}</span>
                      <span
                        className="min-w-0 flex-1 truncate text-right font-medium"
                        title={displayValue}
                      >
                        {displayValue}
                      </span>
                    </div>
                  );
                })}
                <div className="flex min-w-0 items-start justify-between gap-3 border-t border-border/40 pt-2">
                  <span className="text-muted-foreground">Rows</span>
                  <span className="font-medium">{resistivityRows.length}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No resistivity file loaded. Geometry-only visualization is still available.
              </p>
            )}
          </div>
        </div>

        {mesh && loadedResistivityFile ? (
          // shrink-0 is required: the controls panel is a flex column, and this
          // Collapsible's overflow-hidden makes its flex min-height resolve to 0.
          // Without it the panel gets squashed to a sliver (clipping the expanded
          // segmentation content and keeping it out of the panel's overflow-y-auto
          // scroll range) once the column's content overflows.
          <Collapsible
            open={isSegmentationOpen}
            onOpenChange={setIsSegmentationOpen}
            className="shrink-0 overflow-hidden rounded-xl border border-border/40 bg-background/80"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold tracking-tight">
                    Segmentation
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {resegmentationPreview
                      ? 'Preview ready'
                      : (resegmentationStatus ?? 'Optional forward-model simplification')}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isSegmentationOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TriangleResegmentPanel
                disabled={!loadedPolyFile || isLoading}
                isExporting={isExportingResegmentation}
                isPreviewing={isPreviewingResegmentation}
                preview={resegmentationPreview}
                status={resegmentationStatus}
                onExport={handleExportResegmentation}
                onPreview={handlePreviewResegmentation}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </section>

      <section
        data-testid="triangle-model-viewer-panel"
        className="order-1 flex min-h-[420px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm lg:order-1 lg:min-h-0"
      >
        {mesh ? (
          <div className="border-b border-border/40 px-4 py-3">
            <div className="flex w-full flex-wrap items-center justify-start gap-2">
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <p>{mesh.points.length} points</p>
                <p>{mesh.triangles.length} triangles</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={visibleLayers.triangles ? 'secondary' : 'outline'}
                className="gap-1.5"
                aria-pressed={visibleLayers.triangles}
                onClick={() => toggleLayer('triangles')}
              >
                <Eye className="h-3.5 w-3.5" />
                Model
              </Button>
              <Button
                type="button"
                size="sm"
                variant={visibleLayers.segments ? 'secondary' : 'outline'}
                className="gap-1.5"
                aria-pressed={visibleLayers.segments}
                onClick={() => toggleLayer('segments')}
              >
                <Move className="h-3.5 w-3.5" />
                Segments
              </Button>
              <Button
                type="button"
                size="sm"
                variant={visibleLayers.vertices ? 'secondary' : 'outline'}
                className="gap-1.5"
                aria-pressed={visibleLayers.vertices}
                onClick={() => toggleLayer('vertices')}
              >
                <ZoomIn className="h-3.5 w-3.5" />
                Vertices
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => viewerRef.current?.resetView()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="triangle-ve-slider"
                  className="whitespace-nowrap text-xs text-muted-foreground"
                >
                  VE:
                </label>
                <input
                  id="triangle-ve-slider"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={verticalExaggeration}
                  onChange={(e) => setVerticalExaggeration(Number(e.target.value))}
                  className="h-1.5 w-20 cursor-pointer accent-sky-600"
                />
                <span className="min-w-[2ch] text-xs font-medium tabular-nums">
                  {verticalExaggeration}x
                </span>
              </div>
              {showColorbar ? (
                <div className="flex flex-wrap items-center gap-2 border-border/40 pl-0 sm:border-l sm:pl-2">
                  <label
                    htmlFor="triangle-color-min"
                    className="whitespace-nowrap text-xs text-muted-foreground"
                  >
                    Color Min
                  </label>
                  <input
                    id="triangle-color-min"
                    aria-label="Color min"
                    type="number"
                    min="0"
                    step="any"
                    value={colorMinInput}
                    onChange={(event) =>
                      handleColorLimitChange(event.target.value, colorMaxInput)
                    }
                    className="h-8 w-20 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
                  />
                  <label
                    htmlFor="triangle-color-max"
                    className="whitespace-nowrap text-xs text-muted-foreground"
                  >
                    Max
                  </label>
                  <input
                    id="triangle-color-max"
                    aria-label="Color max"
                    type="number"
                    min="0"
                    step="any"
                    value={colorMaxInput}
                    onChange={(event) =>
                      handleColorLimitChange(colorMinInput, event.target.value)
                    }
                    className="h-8 w-20 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Reset color limits"
                    className="gap-1.5"
                    onClick={handleResetColorLimits}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              ) : null}
              {canEditRegions ? (
                <div className="flex flex-wrap items-center justify-start gap-2 border-border/40 pl-0 sm:border-l sm:pl-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={interactionMode === 'pan' ? 'secondary' : 'outline'}
                    className="gap-1.5"
                    aria-pressed={interactionMode === 'pan'}
                    onClick={() => setInteractionMode('pan')}
                  >
                    <MousePointer2 className="h-3.5 w-3.5" />
                    Pan
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={interactionMode === 'lasso' ? 'secondary' : 'outline'}
                    className="gap-1.5"
                    aria-pressed={interactionMode === 'lasso'}
                    onClick={() => setInteractionMode('lasso')}
                  >
                    <LassoSelect className="h-3.5 w-3.5" />
                    Lasso
                  </Button>
                  <label
                    htmlFor="triangle-target-rho"
                    className="whitespace-nowrap text-xs text-muted-foreground"
                  >
                    Rho
                  </label>
                  <input
                    id="triangle-target-rho"
                    aria-label="Target rho"
                    type="number"
                    min="0"
                    step="any"
                    value={targetRho}
                    onChange={(event) => setTargetRho(event.target.value)}
                    className="h-8 w-20 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      aria-label="Apply feather to neighboring regions"
                      type="checkbox"
                      checked={isFeatherEnabled}
                      onChange={(event) => setIsFeatherEnabled(event.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-sky-600"
                    />
                    Feather
                  </label>
                  <input
                    aria-label="Feather rings"
                    type="number"
                    min="0"
                    max="5"
                    step="1"
                    value={featherRings}
                    disabled={!isFeatherEnabled}
                    onChange={(event) => {
                      setFeatherRings(
                        Math.min(Math.max(Number(event.target.value), 0), 5),
                      );
                    }}
                    className="h-8 w-14 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={!lassoSelection || !hasValidTargetRho}
                    onClick={handleApplyEdit}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!lassoSelection}
                    onClick={handleCancelLasso}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={undoStack.length === 0}
                    onClick={handleUndoEdit}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={redoStack.length === 0}
                    onClick={handleRedoEdit}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                    Redo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!canExportResistivity || isExportingResistivity}
                    onClick={handleExportResistivity}
                  >
                    {isExportingResistivity ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Export .resistivity
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 border-b border-border/40 bg-background/70 px-4 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p>Wheel to zoom, drag to pan, double-click to reset.</p>
          <div className="min-w-0 text-right">
            {editStatus ? (
              <p data-testid="triangle-edit-status" className="truncate">
                {editStatus}
              </p>
            ) : hoverSummary ? (
              <p className="truncate">{hoverSummary}</p>
            ) : null}
          </div>
        </div>

        <div
          ref={viewportRef}
          data-testid="triangle-model-viewport-frame"
          className="relative min-h-[360px] flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.06),rgba(15,23,42,0.02))]"
        >
          {mesh && model ? (
            <>
              <div
                data-testid="triangle-model-plot-area"
                className="absolute overflow-hidden"
                style={{
                  bottom: TRIANGLE_VIEWPORT_AXIS_GUTTERS.bottom,
                  left: TRIANGLE_VIEWPORT_AXIS_GUTTERS.left,
                  right: 0,
                  top: 0,
                }}
              >
                <canvas
                  ref={canvasRef}
                  data-testid="triangle-model-canvas"
                  aria-label="Triangle model mesh viewport"
                  className="h-full w-full"
                />
              </div>
              {viewportAxes ? (
                <svg
                  data-testid="triangle-viewport-axes"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10"
                  viewBox={`0 0 ${viewportAxes.frameWidth} ${viewportAxes.frameHeight}`}
                  preserveAspectRatio="none"
                >
                  <rect
                    x="0"
                    y={viewportAxes.xAxisY}
                    width={viewportAxes.frameWidth}
                    height={TRIANGLE_VIEWPORT_AXIS_GUTTERS.bottom}
                    fill="rgba(248, 250, 252, 0.88)"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={TRIANGLE_VIEWPORT_AXIS_GUTTERS.left}
                    height={viewportAxes.plotHeight}
                    fill="rgba(248, 250, 252, 0.88)"
                  />
                  <line
                    x1={viewportAxes.yAxisX}
                    y1="0"
                    x2={viewportAxes.yAxisX}
                    y2={viewportAxes.xAxisY}
                    stroke="rgba(15, 23, 42, 0.48)"
                    strokeWidth="1"
                  />
                  <line
                    x1={viewportAxes.yAxisX}
                    y1={viewportAxes.xAxisY}
                    x2={viewportAxes.frameWidth}
                    y2={viewportAxes.xAxisY}
                    stroke="rgba(15, 23, 42, 0.48)"
                    strokeWidth="1"
                  />
                  {viewportAxes.xTicks.map((tick) => (
                    <g key={`x-${tick.value}`}>
                      <line
                        x1={tick.pixel}
                        y1={viewportAxes.xAxisY}
                        x2={tick.pixel}
                        y2={viewportAxes.xAxisY + 6}
                        stroke="rgba(15, 23, 42, 0.56)"
                        strokeWidth="1"
                      />
                      <text
                        x={tick.pixel}
                        y={viewportAxes.xAxisY + 18}
                        fill="rgba(15, 23, 42, 0.78)"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}
                  {viewportAxes.yTicks.map((tick) => (
                    <g key={`y-${tick.value}`}>
                      <line
                        x1={viewportAxes.yAxisX - 6}
                        y1={tick.pixel}
                        x2={viewportAxes.yAxisX}
                        y2={tick.pixel}
                        stroke="rgba(15, 23, 42, 0.56)"
                        strokeWidth="1"
                      />
                      <text
                        x={viewportAxes.yAxisX - 10}
                        y={tick.pixel + 3}
                        fill="rgba(15, 23, 42, 0.78)"
                        fontSize="10"
                        textAnchor="end"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : null}
              {showColorbar ? (
                <div
                  data-testid="triangle-colorbar"
                  className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(18rem,calc(100%-2rem))] rounded-2xl border border-border/50 bg-background/90 px-3 py-3 shadow-lg backdrop-blur"
                  style={{ bottom: TRIANGLE_VIEWPORT_AXIS_GUTTERS.bottom + 16 }}
                >
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80">
                        Resistivity
                      </p>
                      <p className="text-[10px] text-muted-foreground">Ohm-m</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">log scale</p>
                  </div>
                  <div className="space-y-1.5">
                    <div
                      aria-hidden="true"
                      className="h-3 w-full rounded-full border border-black/10 shadow-inner"
                      style={{ backgroundImage: colorbarGradient }}
                    />
                    <div className="grid grid-cols-5 text-[10px] font-medium text-foreground/80">
                      {colorbarTicks.map((tick, index) => (
                        <span
                          key={tick}
                          className={
                            index === 0
                              ? 'text-left'
                              : index === colorbarTicks.length - 1
                                ? 'text-right'
                                : 'text-center'
                          }
                        >
                          {formatTriangleResistivityTick(tick)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div className="max-w-md space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <DelaunayMeshIcon className="h-6 w-6" data-testid="triangle-model-empty-icon" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">Load a 2D triangle model</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a `.poly` file to inspect geometry and use an optional `.resistivity`
                    file to review model attributes alongside the mesh.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
          {mesh?.source === 'constrained' && model?.resistivity
            ? 'Cells are colored from constrained region resistivity on a log scale. Segments and vertices start hidden so the fill stays legible, and you can re-enable overlays from the toolbar.'
            : mesh?.source === 'constrained'
              ? 'Constrained triangulation is active. No resistivity file is loaded, so cell colors use the neutral fallback.'
              : 'Triangles are computed with unconstrained Delaunator. Use the black overlay to inspect the original `.poly` segment network separately from the derived mesh.'}
        </div>
      </section>
    </div>
  );
}
