import { Download, Loader2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type {
  TriangleResegmentationParameters,
  TriangleResegmentationPreviewResponse,
} from '@/types';

interface TriangleResegmentPanelProps {
  disabled?: boolean;
  isExporting?: boolean;
  isPreviewing?: boolean;
  preview?: TriangleResegmentationPreviewResponse | null;
  status?: string | null;
  onExport: (parameters: TriangleResegmentationParameters) => void;
  onPreview: (parameters: TriangleResegmentationParameters) => void;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRhoLevels(value: string) {
  const levels = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item));

  if (levels.length === 0) {
    return { error: 'Enter at least one rho level.', levels: [] };
  }
  if (levels.some((level) => !Number.isFinite(level) || level <= 0)) {
    return { error: 'Rho levels must be positive finite values.', levels: [] };
  }
  return { error: null, levels };
}

export function TriangleResegmentPanel({
  disabled = false,
  isExporting = false,
  isPreviewing = false,
  preview = null,
  status = null,
  onExport,
  onPreview,
}: TriangleResegmentPanelProps) {
  const [yMin, setYMin] = useState('-100');
  const [yMax, setYMax] = useState('100');
  const [zMin, setZMin] = useState('0');
  const [zMax, setZMax] = useState('50');
  const [rhoLevels, setRhoLevels] = useState('0.3, 3, 10, 30, 100, 300, 1e13');
  const [onlyFreeParameters, setOnlyFreeParameters] = useState(true);
  const [boundaryTolerance, setBoundaryTolerance] = useState('0');
  const [minimumRegionArea, setMinimumRegionArea] = useState('0');

  const parsed = useMemo(() => {
    const nextYMin = parseNumber(yMin);
    const nextYMax = parseNumber(yMax);
    const nextZMin = parseNumber(zMin);
    const nextZMax = parseNumber(zMax);
    const nextBoundaryTolerance = parseNumber(boundaryTolerance);
    const nextMinimumRegionArea = parseNumber(minimumRegionArea);
    const parsedRhoLevels = parseRhoLevels(rhoLevels);
    const errors: string[] = [];

    if (
      nextYMin === null ||
      nextYMax === null ||
      nextZMin === null ||
      nextZMax === null
    ) {
      errors.push('ROI values must be numeric.');
    } else {
      if (nextYMin >= nextYMax) {
        errors.push('Y min must be less than Y max.');
      }
      if (nextZMin >= nextZMax) {
        errors.push('Z min must be less than Z max.');
      }
    }

    if (parsedRhoLevels.error) {
      errors.push(parsedRhoLevels.error);
    }
    if (nextBoundaryTolerance === null || nextBoundaryTolerance < 0) {
      errors.push('Boundary tolerance must be non-negative.');
    }
    if (nextMinimumRegionArea === null || nextMinimumRegionArea < 0) {
      errors.push('Minimum region area must be non-negative.');
    }

    if (
      errors.length > 0 ||
      nextYMin === null ||
      nextYMax === null ||
      nextZMin === null ||
      nextZMax === null ||
      nextBoundaryTolerance === null ||
      nextMinimumRegionArea === null
    ) {
      return { errors, parameters: null };
    }

    return {
      errors,
      parameters: {
        roi: {
          yMin: nextYMin,
          yMax: nextYMax,
          zMin: nextZMin,
          zMax: nextZMax,
        },
        rhoLevels: parsedRhoLevels.levels,
        onlyFreeParameters,
        boundaryTolerance: nextBoundaryTolerance,
        minimumRegionArea: nextMinimumRegionArea,
      },
    };
  }, [
    boundaryTolerance,
    minimumRegionArea,
    onlyFreeParameters,
    rhoLevels,
    yMax,
    yMin,
    zMax,
    zMin,
  ]);

  const canSubmit = !disabled && parsed.parameters !== null;
  const canExport = canSubmit && !!preview && !isExporting;

  const handlePreview = () => {
    if (parsed.parameters) {
      onPreview(parsed.parameters);
    }
  };

  const handleExport = () => {
    if (parsed.parameters) {
      onExport(parsed.parameters);
    }
  };

  return (
    <aside className="border-t border-border/40 bg-background/80 px-4 py-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(17rem,22rem)_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold tracking-tight">Resegment</h4>
              <p className="text-xs text-muted-foreground">Forward-model simplification</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                aria-label="Only free parameters"
                type="checkbox"
                checked={onlyFreeParameters}
                onChange={(event) => setOnlyFreeParameters(event.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-sky-600"
              />
              Free only
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Y min</span>
              <input
                aria-label="Y min"
                type="number"
                value={yMin}
                onChange={(event) => setYMin(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Y max</span>
              <input
                aria-label="Y max"
                type="number"
                value={yMax}
                onChange={(event) => setYMax(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Z min</span>
              <input
                aria-label="Z min"
                type="number"
                value={zMin}
                onChange={(event) => setZMin(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Z max</span>
              <input
                aria-label="Z max"
                type="number"
                value={zMax}
                onChange={(event) => setZMax(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
          </div>

          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Rho levels</span>
            <input
              aria-label="Rho levels"
              value={rhoLevels}
              onChange={(event) => setRhoLevels(event.target.value)}
              className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Boundary tolerance</span>
              <input
                aria-label="Boundary tolerance"
                type="number"
                min="0"
                value={boundaryTolerance}
                onChange={(event) => setBoundaryTolerance(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Minimum region area</span>
              <input
                aria-label="Minimum region area"
                type="number"
                min="0"
                value={minimumRegionArea}
                onChange={(event) => setMinimumRegionArea(event.target.value)}
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
              />
            </label>
          </div>

          {parsed.errors.length > 0 ? (
            <div className="space-y-1 text-xs text-destructive">
              {parsed.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!canSubmit || isPreviewing}
              onClick={handlePreview}
            >
              {isPreviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!canExport}
              onClick={handleExport}
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export both
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-2 text-xs">
          {status ? (
            <p className="rounded-md border border-border/40 bg-card px-2 py-1.5 text-muted-foreground">
              {status}
            </p>
          ) : null}

          {preview ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <p className="text-muted-foreground">Active tris</p>
                <p className="text-sm font-semibold">{preview.stats.activeTriangleCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Regions</p>
                <p className="text-sm font-semibold">{preview.stats.outputRegionCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vertices</p>
                <p className="text-sm font-semibold">{preview.stats.outputVertexCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Segments</p>
                <p className="text-sm font-semibold">{preview.stats.outputSegmentCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Merged</p>
                <p className="text-sm font-semibold">{preview.stats.mergedComponentCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source tris</p>
                <p className="text-sm font-semibold">{preview.stats.sourceTriangleCount}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Preview creates a fixed-parameter forward model from ROI free regions.
            </p>
          )}

          {preview?.warnings.length ? (
            <div className="space-y-1 text-amber-700">
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
