import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
// import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from "@ag-grid-community/client-side-row-model";
import { 
  ModuleRegistry,
  PaginationNumberFormatterParams,
  RowSelectionOptions,
} from "@ag-grid-community/core";
import "@ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid
import "@ag-grid-community/styles/ag-theme-quartz.css"; // Optional theme for the Data Grid
import { useDataTableStore } from '@/store/settingFormStore';

// Register the ClientSideRowModelModule
ModuleRegistry.register(ClientSideRowModelModule);

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  const { tableData, colDefs, visibleColumns, setFilteredData, setFilterModel } = useDataTableStore();
  const [loading, setLoading] = useState<boolean>(true);

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

  // const onFilterChanged = useCallback(() => {
  //   // console.log('onFilterChanged is called')
  //   const api = gridRef.current?.api;
  //   if (api) {
  //     const filteredData: typeof tableData = [];
  //     api.forEachNodeAfterFilterAndSort((node) => {
  //       filteredData.push(node.data);
  //     });
  //     setFilteredData(filteredData);
  //     setFilterModel(api.getFilterModel());
  //     // console.log('filterModel', api.getFilterModel());
  //     // console.log('filteredData', filteredData);
  //   }
  // }, [setFilteredData, setFilterModel]);

  const onSelectionChanged = useCallback(() => {
    // console.log('onRowSelected is called');
    const api = gridRef.current?.api;
    if (api) {
      const selectedNodes = api.getSelectedNodes();
      const selectedData = selectedNodes.map(node => node.data);
      // console.log('selectedData', selectedData);
      setFilteredData(selectedData);
    }
  }, [setFilteredData]);

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

  const style = {
    height: 350,
    width: '100%',
    '--ag-grid-size': '6px' as string,
  };

  return (
    <div className="grid-flow-col">
      {/* AG Grid */}
      <div className="ag-theme-quartz" style={style}>
        <AgGridReact
          loading={loading}
          ref={gridRef}
          rowData={tableData}
          columnDefs={getFilteredColDefs()} // Use filtered columns
          rowSelection={rowSelection}
          pagination={true}
          paginationPageSize={500}
          paginationPageSizeSelector={paginationPageSizeSelector}
          paginationNumberFormatter={paginationNumberFormatter}
          // onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          // onFilterChanged={onFilterChanged}
          onRowDataUpdated={onRowDataUpdated}
        />
      </div>
    </div>
  );
}
