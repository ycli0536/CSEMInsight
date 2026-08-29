import { Check, Download, Loader2, Scissors } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type {
  PenaltyCutUnits,
  RhoBoundSide,
  SideTrimApplyResponse,
  SideTrimParameters,
  SideTrimPreviewResponse,
  SideTrimRhoMode,
} from '@/types';

interface SideTrimPanelProps {
  disabled?: boolean;
  isApplying?: boolean;
  isPreviewing?: boolean;
  preview?: SideTrimPreviewResponse | null;
  result?: SideTrimApplyResponse | null;
  boundaryFileName?: string | null;
  status?: string | null;
  /** Bumped by the parent to empty the file input after a model reload. */
  boundaryInputKey?: number;
  onApply: (parameters: SideTrimParameters) => void;
  onDownload: (fileName: string, text: string) => void;
  onPreview: (parameters: SideTrimParameters) => void;
  /** A setting changed, so any preview on screen is answering the old question. */
  onSettingsChange: () => void;
  onBoundaryFileChange: (file: File | null) => void;
}

/**
 * Clear one side of the model along an uploaded boundary -- typically the
 * bathymetry the model was built from -- collapsing it into one region so the
 * subsurface can be redesigned without rebuilding water, air and seafloor.
 */
export function SideTrimPanel({
  disabled = false,
  isApplying = false,
  isPreviewing = false,
  preview = null,
  result = null,
  boundaryFileName = null,
  status = null,
  boundaryInputKey = 0,
  onApply,
  onDownload,
  onPreview,
  onSettingsChange,
  onBoundaryFileChange,
}: SideTrimPanelProps) {
  const [side, setSide] = useState<RhoBoundSide>('below');
  const [units, setUnits] = useState<PenaltyCutUnits>('km');
  const [extendToBounds, setExtendToBounds] = useState(true);
  const [defaultRho, setDefaultRho] = useState('100');
  const [rhoMode, setRhoMode] = useState<SideTrimRhoMode>('free');

  const parsedRho = Number(defaultRho);
  const rhoError =
    defaultRho.trim() === '' || !Number.isFinite(parsedRho) || parsedRho <= 0
      ? 'The default resistivity must be a positive number.'
      : null;

  const parameters: SideTrimParameters = {
    units,
    side,
    extendToBounds,
    defaultRho: rhoError ? 0 : parsedRho,
    rhoMode,
  };

  const busy = disabled || isApplying || isPreviewing;
  const canPreview = !busy && !!boundaryFileName && !rhoError;
  const canApply = canPreview;

  return (
    <div
      className="space-y-3 rounded-xl border border-border/40 bg-background/60 p-3"
      data-testid="side-trim-panel"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Clear One Side
        </h3>
        <span className="text-[11px] text-muted-foreground">two columns: y z</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Clear</span>
          <select
            aria-label="Trim side"
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

        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Units</span>
          <select
            aria-label="Trim boundary units"
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

        <label className="flex items-center gap-1.5">
          <input
            aria-label="Extend to model bounds"
            type="checkbox"
            checked={extendToBounds}
            disabled={busy}
            onChange={(event) => {
              setExtendToBounds(event.target.checked);
              onSettingsChange();
            }}
          />
          <span className="text-muted-foreground">Extend to model bounds</span>
        </label>
      </div>

      <input
        key={boundaryInputKey}
        aria-label="Trim boundary file"
        type="file"
        accept=".txt,.csv,.dat"
        disabled={busy}
        onChange={(event) => {
          onBoundaryFileChange(event.target.files?.[0] ?? null);
        }}
        className="block w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>New region rho (Ohm-m)</span>
          <input
            aria-label="Default resistivity"
            type="number"
            min="0"
            value={defaultRho}
            disabled={busy}
            onChange={(event) => setDefaultRho(event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Parameter</span>
          <select
            aria-label="New region mode"
            value={rhoMode}
            disabled={busy}
            onChange={(event) => setRhoMode(event.target.value as SideTrimRhoMode)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs"
          >
            <option value="free">free (inverted)</option>
            <option value="fixed">fixed (Param 0)</option>
          </select>
        </label>
      </div>

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
            <Scissors className="h-3.5 w-3.5" />
          )}
          Preview removal
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
          Clear side
        </Button>
      </div>

      {boundaryFileName && rhoError ? (
        <p className="text-xs text-destructive">{rhoError}</p>
      ) : null}

      {status ? (
        <p className="text-xs text-muted-foreground" data-testid="side-trim-status">
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
          <dt>Regions removed</dt>
          <dd className="text-right font-medium text-foreground">
            {preview.stats.removedRegionCount} / {preview.stats.totalRegionCount}
          </dd>
          <dt>Segments removed</dt>
          <dd className="text-right font-medium text-foreground">
            {preview.stats.removedSegmentCount}
          </dd>
          <dt>Vertices removed</dt>
          <dd className="text-right font-medium text-foreground">
            {preview.stats.removedVertexCount}
          </dd>
          {preview.stats.componentCount > 1 ? (
            <>
              <dt>New regions</dt>
              <dd className="text-right font-medium text-foreground">
                {preview.stats.componentCount}
              </dd>
            </>
          ) : null}
          {preview.stats.outsideSpanCount ? (
            <>
              <dt>Beyond the ends</dt>
              <dd className="text-right font-medium text-foreground">
                {preview.stats.outsideSpanCount}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {result ? (
        // One button per file: a browser honours a single programmatic
        // download per click, so bundling both files behind one button
        // silently drops the second.
        <div className="space-y-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            title={result.polyFileName}
            onClick={() => onDownload(result.polyFileName, result.polyText)}
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{result.polyFileName}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            title={result.resistivityFileName}
            onClick={() =>
              onDownload(result.resistivityFileName, result.resistivityText)
            }
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{result.resistivityFileName}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
