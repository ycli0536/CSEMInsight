import axios from 'axios';
import {
  Eye,
  Loader2,
  Move,
  Network,
  RotateCcw,
  Upload,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  buildTriangleResistivityGradientCss,
  formatTriangleResistivityTick,
  TRIANGLE_RESISTIVITY_LEGEND_TICKS,
} from '@/services/triangleModelColorScale';
import { formatTriangleHoverSummary } from '@/services/triangleModelHoverSummary';
import { buildTriangleMeshFromModel } from '@/services/triangleModelMesh';
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
  TriangleMesh,
  TriangleModelResponse,
} from '@/types';

const DEFAULT_LAYER_VISIBILITY: TriangleLayerVisibility = {
  triangles: true,
  segments: true,
  vertices: false,
};

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

export function TriangleModelWindow() {
  const [polyFile, setPolyFile] = useState<File | null>(null);
  const [resistivityFile, setResistivityFile] = useState<File | null>(null);
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<TriangleModelViewer | null>(null);

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
    () => buildTriangleResistivityGradientCss({}, 'to right'),
    [],
  );
  const colorbarTicks = useMemo(
    () => Array.from(TRIANGLE_RESISTIVITY_LEGEND_TICKS).reverse(),
    [],
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
    } catch (uploadError) {
      setError(getUploadErrorMessage(uploadError));
      setModel(null);
      setMesh(null);
      setHover(null);
      setViewportView(null);
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

  useEffect(() => {
    if (!model || !mesh || !canvasRef.current || !viewportRef.current) {
      return;
    }

    if (!viewerRef.current) {
      viewerRef.current = createTriangleModelViewer({
        canvas: canvasRef.current,
        interactionTarget: viewportRef.current,
        onHoverChange: setHover,
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

    viewerRef.current.setVerticalExaggeration(verticalExaggeration);
  }, [mesh, model, verticalExaggeration]);

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
    <div className="grid h-full min-h-0 gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col gap-4 rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Network className="h-4 w-4" />
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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

          <div className="rounded-xl border border-border/40 bg-background/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Resistivity Summary
            </p>
            {model?.resistivity ? (
              <div className="mt-3 space-y-2 text-sm">
                {Object.entries(resistivityMetadata).slice(0, 5).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="text-right font-medium">{String(value)}</span>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-3 border-t border-border/40 pt-2">
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
      </section>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Mesh Viewport</h3>
            <p className="text-xs text-muted-foreground">
              Original `.poly` segments can be overlaid on top of the computed mesh.
            </p>
          </div>
          {mesh ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
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
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-border/40 bg-background/70 px-4 py-2 text-xs text-muted-foreground">
          <p>Wheel to zoom, drag to pan, double-click to reset.</p>
          {hoverSummary ? <p className="truncate">{hoverSummary}</p> : null}
        </div>

        <div
          ref={viewportRef}
          data-testid="triangle-model-viewport-frame"
          className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.06),rgba(15,23,42,0.02))]"
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
                  <Network className="h-6 w-6" />
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
