import { useRef, useState, useCallback, useEffect } from 'react';
// import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from "@ag-grid-community/client-side-row-model";
import { ModuleRegistry } from "@ag-grid-community/core";
import "@ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid
import "@ag-grid-community/styles/ag-theme-quartz.css"; // Optional theme for the Data Grid
import { useDataTableStore } from '@/store/settingFormStore';
import { Button } from '@/components/ui/button'; // Import shadcn/ui Button
import axios from 'axios';

// Register the ClientSideRowModelModule
ModuleRegistry.register(ClientSideRowModelModule);

export function DataPage() {
  const gridRef = useRef<AgGridReact>(null);
  const { data, colDefs, filteredData, dataBlocks, visibleColumns, setDataFileString, setFilteredData, setFilterModel } = useDataTableStore();
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

  const handleSave = async() => {
    try {
      // Show the file picker dialog to select a file to save
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: 'myDataFile.data',
        types: [
          {
            description: 'MARE2DEM Data Files',
            accept: {
              'application/octet-stream': ['.data', '.emdata'],
            },
          },
        ],
      });
      const content = JSON.stringify(filteredData);
      console.log('filteredData: ', filteredData);

      // Send the file name to the backend
      // Send the content and file name to the backend using axios
      const response = await axios.post('http://127.0.0.1:3354/api/write-data-file', {
        content,
        dataBlocks,
      })
      setDataFileString(response.data);

      // If dataFileString is successfully set, save the file
      if (response.data) {
        // Create a writable stream and save the content
        // console.log('datafilestring after: ', response.data);
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(response.data);
        await writableStream.close();
      }

      alert('File saved successfully on the server!');
    } catch (error) {
      console.error('Error saving the file:', error);
      alert('Failed to save the file.');
    }
  };


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
      // console.log('filteredData', filteredData);
    }
  }, [setFilteredData, setFilterModel, setLoading]);

  useEffect(onRowDataUpdated, [onRowDataUpdated]);
  useEffect(onFilterChanged, [onFilterChanged]);

  const style = {
    height: 350,
    width: '100%',
    '--ag-grid-size': '6px' as string,
  };

  return (
    <div className="grid-flow-col">
      {/* Column Visibility Control */}
      <div className="mb-4 space-y-4">
        {/* Add flex-wrap to allow the checkboxes to wrap */}
        <div className="flex flex-wrap gap-4">
          <div className="flex">
            <Button onClick={handleSave} className="full">
              Export data file
            </Button>
          </div>
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
