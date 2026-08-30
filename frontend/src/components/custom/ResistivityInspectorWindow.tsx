import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  NumberFilterModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResistivityMetadataList } from '@/components/custom/ResistivityMetadataList';
import {
  getResistivityColumnInfo,
  type ResistivityParameterInfo,
} from '@/config/resistivityParameterInfo';
import { useResistivityInspectorStore } from '@/store/resistivityInspectorStore';
import { useTheme } from '@/hooks/useTheme';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

/** Columns whose value is an identifier, not a measurement, so no formatting. */
const IDENTIFIER_COLUMNS = new Set(['#', 'region', 'param']);

function formatCell(params: ValueFormatterParams): string {
  const { value } = params;
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value !== 'number') {
    return String(value);
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e6) {
    return String(value);
  }
  // Resistivities span decades, so a fixed number of decimals is unreadable at
  // both ends; significant digits keep 0.31 and 6.7727e2 equally legible.
  return value.toPrecision(6).replace(/\.?0+e/, 'e').replace(/\.?0+$/, '');
}

function tooltipText(info: ResistivityParameterInfo | undefined): string | undefined {
  if (!info) {
    return undefined;
  }
  return [info.description, info.constraint].filter(Boolean).join(' ');
}

/**
 * The whole `.resistivity` file: every header parameter with an explanation of
 * what it controls, and every region row.
 *
 * Kept out of the Triangle Model window's control column on purpose. The header
 * is a narrow key/value list but the region table is wide (up to 14 columns for
 * anisotropic files) and long (tens of thousands of rows), and the point of
 * reading it is to compare it against the mesh -- which a modal over the viewer
 * would prevent.
 */
export function ResistivityInspectorWindow() {
  const resistivity = useResistivityInspectorStore((state) => state.resistivity);
  const resistivityFileName = useResistivityInspectorStore(
    (state) => state.resistivityFileName,
  );
  const polyFileName = useResistivityInspectorStore((state) => state.polyFileName);
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Memoized so the fallback [] does not remake every useMemo below per render.
  const rows = useMemo(() => resistivity?.table ?? [], [resistivity]);
  const metadata = resistivity?.metadata ?? {};

  // The file's own column order. Falling back to the first row's keys keeps
  // older payloads working, but those arrive alphabetized.
  const columnOrder = useMemo(
    () => resistivity?.columns ?? Object.keys(rows[0] ?? {}),
    [resistivity, rows],
  );

  const columnDefs = useMemo<ColDef[]>(() => {
    if (rows.length === 0) {
      return [];
    }
    return columnOrder.map((column) => {
      const info = getResistivityColumnInfo(column);
      const isIdentifier = IDENTIFIER_COLUMNS.has(column.trim().toLowerCase());
      return {
        field: column,
        headerName: column,
        headerTooltip: tooltipText(info),
        filter: 'agNumberColumnFilter',
        valueFormatter: isIdentifier ? undefined : formatCell,
        type: 'numericColumn',
        minWidth: 96,
        flex: 1,
      } satisfies ColDef;
    });
  }, [columnOrder, rows]);

  /**
   * Free vs fixed counts, matching the solver's own definition: a region is
   * free when its Param entry is above zero (`nFree = count(iFreeParam > 0)`,
   * mare2dem_io.f90:651).
   */
  const parameterCounts = useMemo(() => {
    const paramColumns = columnOrder.filter((column) =>
      column.trim().toLowerCase().startsWith('param'),
    );
    if (paramColumns.length === 0) {
      return null;
    }
    let free = 0;
    let fixed = 0;
    for (const row of rows) {
      for (const column of paramColumns) {
        const value = row[column];
        if (typeof value === 'number' && value > 0) {
          free += 1;
        } else {
          fixed += 1;
        }
      }
    }
    return { free, fixed };
  }, [columnOrder, rows]);

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, resizable: true, filter: true }),
    [],
  );

  const gridTheme = useMemo(() => {
    return resolvedTheme === 'dark'
      ? themeQuartz.withParams({
          accentColor: '#3b82f6',
          backgroundColor: '#1e293b',
          foregroundColor: '#e2e8f0',
          headerBackgroundColor: '#0f172a',
          headerTextColor: '#f1f5f9',
          borderColor: '#334155',
        })
      : themeQuartz;
  }, [resolvedTheme]);

  if (!resistivity) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          No resistivity file loaded. Load a model with a .resistivity file in the
          Triangle Model window and its parameters will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="min-w-0 shrink-0">
        <p className="truncate text-sm font-semibold" title={resistivityFileName ?? ''}>
          {resistivityFileName ?? 'Resistivity file'}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={polyFileName ?? ''}>
          {polyFileName ? `Model: ${polyFileName}` : 'No .poly file recorded'}
          {parameterCounts
            ? ` · ${parameterCounts.free.toLocaleString()} free, ${parameterCounts.fixed.toLocaleString()} fixed`
            : null}
        </p>
      </div>

      <Tabs defaultValue="parameters" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="parameters">
            Parameters ({Object.keys(metadata).length})
          </TabsTrigger>
          <TabsTrigger value="regions">
            Regions ({rows.length.toLocaleString()})
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="parameters"
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-background/60 p-4"
        >
          <ResistivityMetadataList metadata={metadata} layout="grouped" />
        </TabsContent>

        <TabsContent value="regions" className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              This file has no region table.
            </p>
          ) : (
            <div className="h-full w-full">
              <AgGridReact
                theme={gridTheme}
                rowData={rows}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                tooltipShowDelay={300}
                // The table runs to tens of thousands of rows; row virtualization
                // is what makes rendering it viable at all, so no pagination.
                rowBuffer={20}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
