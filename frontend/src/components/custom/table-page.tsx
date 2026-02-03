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
  ExternalFilterModule,
  type IRowNode,
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
  ExternalFilterModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  /* Removed duplicate getState call */
  // Converting to hook for reactivity:
  const { tableData, colDefs, visibleColumns, setFilteredData, setFilterModel, activeTableDatasetId, datasets } = useDataTableStore();
  const { freqSelected, txSelected, rxSelected, resetColumnFilters, setResetColumnFilters } = useSettingFormStore();

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

      // Save filter model to active dataset
      // Save filter model to active dataset
      const { activeTableDatasetId, updateDatasetFilter } = useDataTableStore.getState();

      if (activeTableDatasetId) {
        const { freqSelected, txSelected, rxSelected } = useSettingFormStore.getState();
        // We pass filteredData and filterModel (fourth arg)
        updateDatasetFilter(activeTableDatasetId, filteredData, { freqSelected, txSelected, rxSelected }, api.getFilterModel());
      }
    }
  }, [setFilteredData, setFilterModel, setResetColumnFilters]); // Removed updateDatasetFilter from deps as we use getState()

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

  // -- External Filter Logic (Unified with Sidebar) -- 
  const isExternalFilterPresent = useCallback((): boolean => {
    // Check if any sidebar selection is active (not 'all' and not empty)
    // We assume 'all' means no filter.
    // Note: 'all' string check for Set<string>? Types say Selection = 'all' | Set<Key>.
    const hasFreq = freqSelected !== 'all';
    const hasTx = txSelected !== 'all';
    const hasRx = rxSelected !== 'all';
    return hasFreq || hasTx || hasRx;
  }, [freqSelected, txSelected, rxSelected]);

  const doesExternalFilterPass = useCallback((node: IRowNode): boolean => {
    if (!node.data) return true;
    const { Freq_id, Tx_id, Rx_id } = node.data;

    // Freq
    if (freqSelected !== 'all') {
      // freqSelected is Set<Key>
      if (!(freqSelected as Set<string>).has(String(Freq_id))) return false;
    }
    // Tx
    if (txSelected !== 'all') {
      if (!(txSelected as Set<string>).has(String(Tx_id))) return false;
    }
    // Rx
    if (rxSelected !== 'all') {
      if (!(rxSelected as Set<string>).has(String(Rx_id))) return false;
    }
    return true;
  }, [freqSelected, txSelected, rxSelected]);

  // Trigger external filter re-eval when selections change
  useEffect(() => {
    const api = gridRef.current?.api;
    if (api) {
      api.onFilterChanged();
    }
  }, [freqSelected, txSelected, rxSelected]);

  // Ref to track the previous dataset ID to detect switches
  const prevDatasetIdRef = useRef<string | null>(activeTableDatasetId);

  // Handle dataset switching and filter restoration
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || !activeTableDatasetId) return;

    const datasetChanged = prevDatasetIdRef.current !== activeTableDatasetId;
    if (datasetChanged) {
      prevDatasetIdRef.current = activeTableDatasetId;

      // Restore saved filters for this dataset immediately upon switch
      const activeDataset = datasets?.get(activeTableDatasetId);
      if (activeDataset && activeDataset.filterModel) {
        api.setFilterModel(activeDataset.filterModel);
      } else {
        // Only clear if we really switched to a dataset without filters.
        // But be careful not to override 'initial' state if we want to default to something.
        // For now, null is correct (no column filters).
        api.setFilterModel(null);
      }
    } else if (resetColumnFilters) {
      // If presumably same dataset but User requests reset (e.g. Reload Data button logic if exists), or just plain reset check
      // NOTE: resetColumnFilters is set to true by some external action?
      // If logic is "Reset on new data load", we handle it here.
      api.setFilterModel(null);
    }

  }, [activeTableDatasetId, datasets, resetColumnFilters]);

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

  // Function to save current filter model when it changes
  // We already do this in onFilterChanged.
  // But onRowDataUpdated resets filters if resetColumnFilters is true.

  // Actually, onFilterChanged is sufficient for user interactions.


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
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
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
