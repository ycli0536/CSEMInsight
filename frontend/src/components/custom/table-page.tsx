import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ModuleRegistry,
  TextFilterModule,
  NumberFilterModule,
  RowSelectionModule,
  PaginationModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type PaginationNumberFormatterParams,
  type RowSelectionOptions,
  type FilterChangedEvent,
} from 'ag-grid-community';
import { useDataTableStore, useSettingFormStore } from '@/store/settingFormStore';
import { useTheme } from '@/hooks/useTheme';

// Register AG Grid modules
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  TextFilterModule,
  NumberFilterModule,
  RowSelectionModule,
  PaginationModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  const { tableData, colDefs, visibleColumns, setFilteredData, setFilterModel } = useDataTableStore();
  const { resetColumnFilters, setResetColumnFilters } = useSettingFormStore();
  const [loading, setLoading] = useState<boolean>(true);
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const rowSelection = useMemo<
    RowSelectionOptions | "single" | "multiple"
  >(() => {
    return {
      mode: "multiRow",
      // groupSelects: "descendants",
      selectAll: "filtered",
    };
  }, []);

  const paginationPageSizeSelector = useMemo<number[] | boolean>(() => {
    return [200, 500, 1000];
  }, []);

  const paginationNumberFormatter = useCallback(
    (params: PaginationNumberFormatterParams) => {
      return "[" + params.value.toLocaleString() + "]";
    },
    [],
  );

  // Default column definition - enable filters for all columns
  const defaultColDef = useMemo<ColDef>(() => ({
    filter: true,
    sortable: true,
    resizable: true,
  }), []);

  // Update column definitions based on visible columns
  const getFilteredColDefs = () => {
    if (visibleColumns === 'all') {
      return colDefs;
    }
    else {
      const filteredColDefs = colDefs.filter(col => col.field && Array.from(visibleColumns).includes(col.field));
      return filteredColDefs;

    }
  };

  const onFilterChanged = useCallback((event: FilterChangedEvent) => {
    const api = gridRef.current?.api;
    if (api) {
      if (event.source === 'columnFilter') {
        setResetColumnFilters(false);
      }

      const filteredData: typeof tableData = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        filteredData.push(node.data);
      });
      setFilteredData(filteredData);
      setFilterModel(api.getFilterModel());
    }
  }, [setFilteredData, setFilterModel, setResetColumnFilters]);

  const onSelectionChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (api) {
      const selectedNodes = api.getSelectedNodes();
      // If items are selected, show only them. If selection cleared, show all filtered items.
      if (selectedNodes.length > 0) {
        const selectedData = selectedNodes.map(node => node.data);
        setFilteredData(selectedData);
      } else {
        const filteredData: typeof tableData = [];
        api.forEachNodeAfterFilterAndSort((node) => {
          filteredData.push(node.data);
        });
        setFilteredData(filteredData);
      }
    }
  }, [setFilteredData]);

  // Handle data updates and filter priority
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    if (resetColumnFilters) {
      // If user wants to reset filters on new data, we clear them.
      api.setFilterModel(null);
    } else {
      // If user wants to keep filters, we leave them.
      // AG-Grid automatically re-applies active filters to new rowData.
      // 'onFilterChanged' will trigger automatically if the resulting set changes.
    }

    // Explicitly update filteredData to match what's in the grid
    // We do this in a timeout or on proper event to ensure grid has processed
    // but onRowDataUpdated handles it.
  }, [tableData, resetColumnFilters]);

  // Keep onRowDataUpdated to ensure store sync
  const onRowDataUpdated = useCallback(() => {
    // console.log('onRowDataUpdated is called');
    const api = gridRef.current?.api;
    if (api) {
      setLoading(true);
      const filteredData: typeof tableData = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        filteredData.push(node.data);
      });
      setFilterModel(api.getFilterModel());
      setFilteredData(filteredData);
      setLoading(false);
      // console.log('filterModel', api.getFilterModel());
      // console.log('filteredData', filteredData);
    }
  }, [setFilteredData, setFilterModel, setLoading]);

  useEffect(onRowDataUpdated, [onRowDataUpdated]);
  // useEffect(onFilterChanged, [onFilterChanged]);
  useEffect(onSelectionChanged, [onSelectionChanged]);

  // Build theme based on resolved theme
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

  const style = {
    height: '100%',
    width: '100%',
  };

  return (
    <div className="flex h-full flex-col">
      {/* AG Grid */}
      <div className="flex-1" style={style}>
        <AgGridReact
          loading={loading}
          ref={gridRef}
          theme={gridTheme}
          rowData={tableData}
          columnDefs={getFilteredColDefs()} // Use filtered columns
          defaultColDef={defaultColDef}
          rowSelection={rowSelection}
          pagination={true}
          paginationPageSize={500}
          paginationPageSizeSelector={paginationPageSizeSelector}
          paginationNumberFormatter={paginationNumberFormatter}
          // onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onFilterChanged={onFilterChanged}
          onRowDataUpdated={onRowDataUpdated}
        />
      </div>
    </div>
  );
}
