import { Check, Download, Loader2, Ruler } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type {
  PenaltyCutUnits,
  RhoBoundApplyResponse,
  RhoBoundParameters,
  RhoBoundPreviewResponse,
  RhoBoundShape,
  RhoBoundSide,
} from '@/types';

interface RhoBoundPanelProps {
  disabled?: boolean;
  isApplying?: boolean;
  isPreviewing?: boolean;
  preview?: RhoBoundPreviewResponse | null;
  result?: RhoBoundApplyResponse | null;
  shapeFileName?: string | null;
  status?: string | null;
  /** Bumped by the parent to empty the file input after a model reload. */
  shapeInputKey?: number;
  onApply: (parameters: RhoBoundParameters) => void;
  onDownload: (result: RhoBoundApplyResponse) => void;
  onPreview: (parameters: RhoBoundParameters) => void;
  /** A setting changed, so any preview on screen is answering the old question. */
  onSettingsChange: () => void;
  onShapeFileChange: (file: File | null) => void;
}

/**
 * A pair of zeros is not an empty form: it is the value that sends a region
 * back to Global Bounds, and the only way to undo a bound that was applied by
 * mistake. So the inputs start empty and zeros have to be typed.
 */
function parseBound(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function RhoBoundPanel({
  disabled = false,
  isApplying = false,
  isPreviewing = false,
  preview = null,
  result = null,
  shapeFileName = null,
  status = null,
  shapeInputKey = 0,
  onApply,
  onDownload,
  onPreview,
  onSettingsChange,
  onShapeFileChange,
}: RhoBoundPanelProps) {
  const [shape, setShape] = useState<RhoBoundShape>('boundary');
  const [side, setSide] = useState<RhoBoundSide>('below');
  const [units, setUnits] = useState<PenaltyCutUnits>('km');
  const [lower, setLower] = useState('');
  const [upper, setUpper] = useState('');
  const [resetRho, setResetRho] = useState('');

  const parsedLower = parseBound(lower);
  const parsedUpper = parseBound(upper);
  const boundsGiven = parsedLower !== null && parsedUpper !== null;
  const isCleared = boundsGiven && parsedLower === 0 && parsedUpper === 0;
  const boundsError = !boundsGiven
    ? 'Give both a lower and an upper bound, or 0 and 0 to clear.'
    : !isCleared && parsedLower >= parsedUpper
      ? 'The lower bound must be below the upper bound.'
      : null;

  // A new band can leave a region's inverted rho outside it, and MARE2DEM will
  // not start from a free parameter outside its bounds. Those regions move
  // either way; this only decides where to.
  const parsedReset = parseBound(resetRho);
  const resetError =
    resetRho.trim() === ''
      ? null
      : parsedReset === null || isCleared
        ? 'A reset resistivity needs a band to sit inside.'
        : !boundsGiven || parsedReset <= parsedLower || parsedReset >= parsedUpper
          ? 'The reset resistivity must sit strictly inside the band.'
          : null;

  const parameters: RhoBoundParameters = {
    shape,
    side,
    units,
    lower: parsedLower ?? 0,
    upper: parsedUpper ?? 0,
    ...(parsedReset !== null && !resetError ? { resetRho: parsedReset } : {}),
  };

  const busy = disabled || isApplying || isPreviewing;
  const canPreview = !busy && !!shapeFileName;
  const canApply = canPreview && !boundsError && !resetError;

  return (
    <div
      className="space-y-3 rounded-xl border border-border/40 bg-background/60 p-3"
      data-testid="rho-bound-panel"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Rho Bounds
        </h3>
        <span className="text-[11px] text-muted-foreground">two columns: y z</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Shape</span>
          <select
            aria-label="Bound shape"
            value={shape}
            disabled={busy}
            onChange={(event) => {
              setShape(event.target.value as RhoBoundShape);
              onSettingsChange();
            }}
            className="rounded-md border border-border/50 bg-background px-2 py-1"
          >
            <option value="boundary">boundary (open line)</option>
            <option value="polygon">polygon (closed)</option>
          </select>
        </label>

        {shape === 'boundary' ? (
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Side</span>
            <select
              aria-label="Bound side"
              value={side}
              disabled={busy}
              onChange={(event) => {
                setSide(event.target.value as RhoBoundSide);
                onSettingsChange();
              }}
              className="rounded-md border border-border/50 bg-background px-2 py-1"
            >
              <option value="below">below (deeper)</option>
              <option value="above">above (shallower)</option>
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Units</span>
          <select
            aria-label="Bound shape units"
            value={units}
            disabled={busy}
            onChange={(event) => {
              setUnits(event.target.value as PenaltyCutUnits);
              onSettingsChange();
            }}
            className="rounded-md border border-border/50 bg-background px-2 py-1"
          >
            <option value="km">km</option>
            <option value="m">m</option>
          </select>
        </label>
      </div>

      <input
        key={shapeInputKey}
        aria-label="Bound shape file"
        type="file"
        accept=".txt,.csv,.dat"
        disabled={busy}
        onChange={(event) => {
          onShapeFileChange(event.target.files?.[0] ?? null);
        }}
        className="block w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Lower (Ohm-m)</span>
          <input
            aria-label="Lower bound"
            type="number"
            min="0"
            placeholder="e.g. 1"
            value={lower}
            disabled={busy}
            onChange={(event) => setLower(event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Upper (Ohm-m)</span>
          <input
            aria-label="Upper bound"
            type="number"
            min="0"
            placeholder="e.g. 500"
            value={upper}
            disabled={busy}
            onChange={(event) => setUpper(event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
          />
        </label>
      </div>

      {isCleared ? (
        <p className="text-xs text-muted-foreground">
          0 and 0 clears the selected regions' bounds, sending them back to
          Global Bounds.
        </p>
      ) : (
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Reset out-of-range rho to (optional)</span>
          <input
            aria-label="Reset resistivity"
            type="number"
            min="0"
            placeholder="blank: move to the nearest bound"
            value={resetRho}
            disabled={busy}
            onChange={(event) => setResetRho(event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
          />
        </label>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5"
          disabled={!canPreview}
          onClick={() => onPreview(parameters)}
        >
          {isPreviewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Ruler className="h-3.5 w-3.5" />
          )}
          Preview regions
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 gap-1.5"
          disabled={!canApply}
          onClick={() => onApply(parameters)}
        >
          {isApplying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Apply bounds
        </Button>
      </div>

      {shapeFileName && (boundsError || resetError) ? (
        <p className="text-xs text-destructive">{boundsError ?? resetError}</p>
      ) : null}

      {status ? (
        <p className="text-xs text-muted-foreground" data-testid="rho-bound-status">
          {status}
        </p>
      ) : null}

      {preview?.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-600">
          {warning}
        </p>
      ))}

      {preview ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <dt>Regions covered</dt>
          <dd className="text-right font-medium text-foreground">
            {preview.stats.selectedRegionCount} / {preview.stats.totalRegionCount}
          </dd>
          <dt>Shape points</dt>
          <dd className="text-right font-medium text-foreground">
            {preview.stats.shapePointCount}
          </dd>
          {preview.stats.outsideShapeSpanCount ? (
            <>
              <dt>Beyond the ends</dt>
              <dd className="text-right font-medium text-foreground">
                {preview.stats.outsideShapeSpanCount}
              </dd>
            </>
          ) : null}
          {preview.stats.updatedRowCount !== undefined ? (
            <>
              <dt>Rows written</dt>
              <dd className="text-right font-medium text-foreground">
                {preview.stats.updatedRowCount}
              </dd>
            </>
          ) : null}
          {preview.stats.clampedRowCount ? (
            <>
              <dt>Rho moved into band</dt>
              <dd className="text-right font-medium text-foreground">
                {preview.stats.clampedRowCount}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {result ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => onDownload(result)}
        >
          <Download className="h-3.5 w-3.5" />
          {result.resistivityFileName}
        </Button>
      ) : null}
    </div>
  );
}
