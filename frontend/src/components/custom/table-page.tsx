import { useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import "ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid
import "ag-grid-community/styles/ag-theme-quartz.css"; // Optional theme for the Data Grid
import { useDataTableStore } from '@/store/settingFormStore';
import { 
  GridReadyEvent,
  FilterModel,
 } from 'ag-grid-community';

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  const { data, colDefs, setFilteredData } = useDataTableStore();

  const onGridReady = useCallback((params: GridReadyEvent) => {
    // splitDataset();
    
    const hardcodedFilter = {
      // "Freq#": {
      //   type: 'equals',
      //   filter: '2',
      // },
      "Tx_id": {
        type: 'equals',
        filter: null,
      },
      // "Y_rx": {
      //   type: 'inRange',
      //   filter: -120e3,
      //   filterTo: -115e3,
      // },
      "Type": {
        type: 'contains',
        filter: '2',
      },
    } as FilterModel;

    // Set the hardcoded filter model
    params.api.setFilterModel(hardcodedFilter);

    // Apply the filter immediately
    onFilterChanged();
    
    params.api.addEventListener('filterChanged', onFilterChanged);
  }, []);

  const onFilterChanged = () => {
    const api = gridRef.current?.api;
    if (api) {
      const filteredData: typeof data = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        filteredData.push(node.data);
      });
      setFilteredData(filteredData);
      console.log('filteredData', filteredData);
    }
  };

  const style = {
    height: 300,
    width: '100%',
    '--ag-grid-size': '5px' as string,
  };

  return (
    <div className="h-400[px]">
      <div className="ag-theme-quartz" style={style}>
        <AgGridReact
          ref={gridRef}
          rowData={data}
          columnDefs={colDefs}
          onGridReady={onGridReady}
          // onFilterChanged={onFilterChanged}
        />
      </div>
    </div>
  )
}