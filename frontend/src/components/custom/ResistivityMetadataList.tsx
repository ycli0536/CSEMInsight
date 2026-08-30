import { Fragment, useMemo } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getResistivityParameterInfo,
  getResistivityParameterGroup,
  getResistivityParameterLabel,
  RESISTIVITY_PARAMETER_GROUP_LABELS,
  RESISTIVITY_PARAMETER_GROUP_ORDER,
  type ResistivityParameterGroup,
} from '@/config/resistivityParameterInfo';
import type {
  TriangleResistivityMetadataValue,
} from '@/types/triangleModel';

/**
 * Render a metadata value the way the file spells it. Comma-separated entries
 * are parsed into arrays upstream (Global Bounds, Roughness Weights), so they
 * are re-joined rather than shown as a JS array.
 */
function formatResistivityMetadataValue(
  value: TriangleResistivityMetadataValue,
): string {
  if (value === null || value === undefined) {
    return '--';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  const text = String(value);
  return text.trim().length === 0 ? '--' : text;
}

type ResistivityMetadataListProps = {
  metadata: Record<string, TriangleResistivityMetadataValue>;
  /** Restrict to these keys, in this order. Missing keys are skipped. */
  keys?: string[];
  /** `grouped` splits into labelled sections; `flat` keeps file order. */
  layout?: 'flat' | 'grouped';
};

function ParameterTooltip({ parameterKey }: { parameterKey: string }) {
  const info = getResistivityParameterInfo(parameterKey);

  if (!info) {
    return null;
  }

  return (
    // Own provider rather than relying on the app-level one: this list is
    // rendered inside the mesh window's control column, inside a separate
    // window, and in tests that mount neither -- a missing provider is a
    // render-time throw, so the component supplies its own. Nesting inside the
    // app provider is fine; the inner one just wins for this subtree.
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            // Descriptive rather than "more info": the accessible name is the
            // only thing a screen reader gets before the tooltip opens.
            aria-label={`What ${parameterKey} controls`}
            className="shrink-0 cursor-help text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        {/* What the parameter does, and what it will accept -- nothing else.
            Where the description came from, and whatever inline note the file
            itself carried, are maintainer concerns and live in
            resistivityParameterInfo.ts; putting them here would bury the one
            line the reader actually opened the tooltip for. */}
        <TooltipContent side="right" className="max-w-xs space-y-1.5">
          <p className="text-xs leading-relaxed">{info.description}</p>
          {info.allowed ? (
            <p className="text-[11px] text-muted-foreground">
              Accepts: {info.allowed.join(', ')}
            </p>
          ) : null}
          {info.constraint ? (
            <p className="text-[11px] text-muted-foreground">{info.constraint}</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MetadataRow({
  parameterKey,
  value,
}: {
  parameterKey: string;
  value: TriangleResistivityMetadataValue;
}) {
  const displayValue = formatResistivityMetadataValue(value);

  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="flex min-w-0 shrink-0 items-center gap-1 text-muted-foreground">
        <span className="truncate" title={parameterKey}>
          {getResistivityParameterLabel(parameterKey)}
        </span>
        <ParameterTooltip parameterKey={parameterKey} />
      </span>
      <span
        className="min-w-0 flex-1 truncate text-right font-medium"
        title={displayValue}
      >
        {displayValue}
      </span>
    </div>
  );
}

export function ResistivityMetadataList({
  metadata,
  keys,
  layout = 'flat',
}: ResistivityMetadataListProps) {
  const entries = useMemo(() => {
    if (!keys) {
      return Object.entries(metadata);
    }
    return keys
      .filter((key) => key in metadata)
      .map((key) => [key, metadata[key]] as const);
  }, [keys, metadata]);

  if (entries.length === 0) {
    return null;
  }

  if (layout === 'flat') {
    return (
      <div className="min-w-0 space-y-2 text-sm">
        {entries.map(([key, value]) => (
          <MetadataRow key={key} parameterKey={key} value={value} />
        ))}
      </div>
    );
  }

  const grouped = new Map<ResistivityParameterGroup, [string, TriangleResistivityMetadataValue][]>();
  for (const [key, value] of entries) {
    const group = getResistivityParameterGroup(key);
    const bucket = grouped.get(group);
    if (bucket) {
      bucket.push([key, value]);
    } else {
      grouped.set(group, [[key, value]]);
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-sm">
      {RESISTIVITY_PARAMETER_GROUP_ORDER.map((group) => {
        const groupEntries = grouped.get(group);
        if (!groupEntries || groupEntries.length === 0) {
          return null;
        }
        return (
          <Fragment key={group}>
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {RESISTIVITY_PARAMETER_GROUP_LABELS[group]}
              </p>
              {groupEntries.map(([key, value]) => (
                <MetadataRow key={key} parameterKey={key} value={value} />
              ))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
