import { useRef, useState, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import "ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid
import "ag-grid-community/styles/ag-theme-quartz.css"; // Optional theme for the Data Grid
import { useDataTableStore } from '@/store/settingFormStore';
import { Checkbox } from '@/components/ui/checkbox'; // Import shadcn/ui Checkbox
import { Label } from '@/components/ui/label'; // Import shadcn/ui Label

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  const { data, colDefs, setFilteredData, setFilterModel } = useDataTableStore();
  const [visibleColumns, setVisibleColumns] = useState(colDefs.map(col => col.field)); // Track visible columns
  const [loading, setLoading] = useState<boolean>(true);
  // // On component mount, initialize visible columns with defaults
  // useEffect(() => {
  //   // Default columns to be toggled on initially
  //   const defaultVisibleColumns = ['Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdErr', 'Type'];
  //   const initialColumns = colDefs
  //     .map((col) => col.field)
  //     .filter((field) => field && defaultVisibleColumns.includes(field)); // Set only default visible columns
  //   setVisibleColumns(initialColumns);
  // }, [colDefs]);

  // Handle column visibility change
  const handleColumnVisibilityChange = (columnField: string) => {
    setVisibleColumns((prev) => {
      if (prev.includes(columnField)) {
        return prev.filter((field) => field !== columnField);
      } else {
        return [...prev, columnField];
      }
    });
  };

  // Update column definitions based on visible columns
  const getFilteredColDefs = () => {
    return colDefs.filter(col => visibleColumns.includes(col.field));
  };

  const onFilterChanged = useCallback(() => {
    console.log('onFilterChanged is called')
    const api = gridRef.current?.api;
    if (api) {
      const filteredData: typeof data = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        filteredData.push(node.data);
      });
      setFilteredData(filteredData);
      setFilterModel(api.getFilterModel());
      // console.log('filterModel', filterModel);
      // console.log('filteredData', filteredData);
    }
  }, [setFilteredData, setFilterModel]);

  const onRowDataUpdated = useCallback(() => {
    console.log('onRowDataUpdated is called');
    const api = gridRef.current?.api;
    if (api) {
      setLoading(true);
      const filteredData: typeof data = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        filteredData.push(node.data);
      });
      setFilterModel(api.getFilterModel());
      setFilteredData(filteredData);
      setLoading(false);
      console.log('filterModel', api.getFilterModel());
      console.log('filteredData', filteredData);
    }
  }, [setFilteredData, setFilterModel, setLoading]);

  useEffect(onRowDataUpdated, [onRowDataUpdated]);
  useEffect(onFilterChanged, [onFilterChanged]);

  const style = {
    height: 300,
    width: '100%',
    '--ag-grid-size': '5px' as string,
  };

  return (
    <div className="grid-flow-col">
      {/* Column Visibility Control */}
      <div className="mb-4 space-y-4">
        {/* Add flex-wrap to allow the checkboxes to wrap */}
        <div className="flex flex-wrap gap-4">
          <Label htmlFor="toggle-col" className='font-semibold'>Toggle Columns: </Label>
          {colDefs.map((col) => (
            <Label key={col.field} className="flex items-center space-x-2">
              <Checkbox
                checked={visibleColumns.includes(col.field)}
                onCheckedChange={() => col.field && handleColumnVisibilityChange(col.field)}
                id={col.field} // Add id for better accessibility
              />
              <span>{col.headerName}</span>
            </Label>
          ))}
        </div>
      </div>

      {/* AG Grid */}
      <div className="ag-theme-quartz" style={style}>
        <AgGridReact
          loading={loading}
          ref={gridRef}
          rowData={data}
          columnDefs={getFilteredColDefs()} // Use filtered columns
          // onGridReady={onGridReady}
          onFilterChanged={onFilterChanged}
          onRowDataUpdated={onRowDataUpdated}
        />
      </div>
    </div>
  );
}
