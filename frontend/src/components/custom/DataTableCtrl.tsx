import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ListBoxItem, ListBox as MyListBox } from "@/components/custom/ListBox";
import { Item, ListBox, Provider, lightTheme, darkTheme } from "@adobe/react-spectrum";
import { useCallback, useEffect, useMemo } from "react";
import type { Selection } from 'react-aria-components';
// import { FilterModel } from "@ag-grid-community/core";

import type { TxData, RxData } from "@/types";
import { useSettingFormStore, useDataTableStore } from "@/store/settingFormStore";
import axios from "axios";
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { CustomAlertDialog } from '@/components/custom/CustomAlertDialog';
import { useTheme } from "@/hooks/useTheme";

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: {
    description: string;
    accept: Record<string, string[]>;
  }[];
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker: (
    options?: SaveFilePickerOptions
  ) => Promise<FileSystemFileHandle>;
};

export function DataTableCtrl() {
  const {
    freqSelected,
    txSelected,
    rxSelected,
    setFreqSelected,
    setTxSelected,
    setRxSelected,
    resetColumnFilters,
    setResetColumnFilters,
  } = useSettingFormStore();
  const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();
  /* 
     Performance Optimization:
     We deliberately DO NOT subscribe to `filteredData` here.
     If we did, every time AG-Grid updates filteredData (via column filters),
     this component would re-render. If that re-render triggers the useEffect below,
     it effectively resets the data, clearing the AG-Grid filter.
     
     We only need `filteredData` for the Save/Export function, so we access it
     directly from the store state when needed.
  */
  /* filteredData used to represent active subset, but now filtering is unified in AG Grid (DataPage). */
  /* We don't subscribe to filteredData here to avoid re-renders. */
  const {
    data,
    /* variables unused but kept for destructuring safety if needed later, or remove */
    activeTableDatasetId,
    // updateDatasetFilter, // Unused
    setDataFileString,
    txData, // Used for items
    rxData, // Used for items
    dataBlocks, // Used for export
    /* We access filteredData directly from store via getState() in save if needed */
  } = useDataTableStore();
  const { colDefs, visibleColumns, setVisibleColumns } = useDataTableStore();
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const spectrumTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  // Memoize unique values to ensure performance
  const uniqueFreqs = useMemo(() => Array.from(new Set(data.map((item) => item.Freq))).sort((a, b) => a - b), [data]);
  const uniqueFreqIds = useMemo(() => Array.from(new Set(data.map((item) => item.Freq_id))).sort((a, b) => Number(a) - Number(b)), [data]);

  // Centralized filtering logic removed. 
  // Filtering is now handled directly by AG Grid in DataPage to ensure unified logic.
  // The Sidebar now just updates the store selections, which DataPage listens to.

  // We still need to update the active dataset filter settings when selections change,
  // but DataPage handles the heavy lifting of updating filteredData.
  useEffect(() => {
    if (activeTableDatasetId) {
      // Just update settings here? Or let DataPage do it all?
      // If DataPage handles it, we don't need to do anything here.
      // But DataPage updates on `filteredData` change.
      // If we change Selection -> DataPage updates Grid -> onFilterChanged -> updateDatasetFilter.
      // So we are good.
    }
  }, [activeTableDatasetId]);


  // Function to handle Freq selection changes
  const onFreqSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: string[], newSelection: Selection) => {
      const antiSelectedFreq = allItems.filter((item) => !(newSelection as Set<string>).has(String(item)));
      return new Set<string>(antiSelectedFreq.map(String));
    };

    if ((newSelection as Set<string>).size === uniqueFreqIds.length) {
      setFreqSelected('all');
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === uniqueFreqIds.length;
      if (freqSelected === 'all' && !isAllSelected) {
        setFreqSelected(getAntiSelection(uniqueFreqIds, newSelection));
      } else {
        setFreqSelected(newSelection);
      }
    }
  }, [setFreqSelected, uniqueFreqIds, freqSelected]);

  // Function to handle Tx selection changes
  const onTxSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: TxData[], newSelection: Selection) => {
      const antiSelectedTx = allItems.filter((item) => !(newSelection as Set<string>).has(item.Tx_id.toString()));
      return new Set<string>(antiSelectedTx.map((item) => item.Tx_id.toString()));
    };

    if ((newSelection as Set<string>).size === txData.length) {
      setTxSelected('all');
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === txData.length;
      if (txSelected === 'all' && !isAllSelected) {
        setTxSelected(getAntiSelection(txData, newSelection));
      } else {
        setTxSelected(newSelection);
      }
    }
  }, [setTxSelected, txData, txSelected]);

  // Function to handle Rx selection changes
  const onRxSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: RxData[], newSelection: Selection) => {
      const antiSelectedRx = allItems.filter((item) => !(newSelection as Set<string>).has(item.Rx_id.toString()));
      return new Set<string>(antiSelectedRx.map((item) => item.Rx_id.toString()));
    };

    if ((newSelection as Set<string>).size === rxData.length) {
      setRxSelected('all');
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === rxData.length;
      if (rxSelected === 'all' && !isAllSelected) {
        setRxSelected(getAntiSelection(rxData, newSelection));
      } else {
        setRxSelected(newSelection);
      }
    }
  }, [setRxSelected, rxData, rxSelected]);

  const handleSave = async () => {
    try {
      // Show the file picker dialog to select a file to save
      if (!("showSaveFilePicker" in window)) {
        throw new Error("File System Access API is not supported in this browser.");
      }
      const fileHandle = await (window as SaveFilePickerWindow).showSaveFilePicker({
        suggestedName: "myDataFile.data",
        types: [
          {
            description: "MARE2DEM Data Files",
            accept: {
              "application/octet-stream": [".data", ".emdata"],
            },
          },
        ],
      });
      const content = JSON.stringify(useDataTableStore.getState().filteredData);
      console.log("filteredData (export): ", useDataTableStore.getState().filteredData);

      // Send the file name to the backend
      const response = await axios.post(
        "http://localhost:3354/api/write-data-file",
        {
          content,
          dataBlocks,
        }
      );
      setDataFileString(response.data);

      if (response.data) {
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(response.data);
        await writableStream.close();
      }

      showAlert(
        'File Export Successful',
        'File saved successfully on the server! (Only support EMData_2.2 format for now)',
        'success'
      );
    } catch (error) {
      console.error("Error saving the file:", error);
      showAlert(
        'File Export Error',
        'Failed to save the file.',
        'error'
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 gap-4">
        <div className="flex-1 flex flex-col space-y-3">
          <Label htmlFor="toggle-col">Toggle Columns</Label>

          {/* Reset Filters Option */}
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              id="reset-filters"
              checked={resetColumnFilters}
              onCheckedChange={setResetColumnFilters}
            />
            <Label htmlFor="reset-filters" className="text-sm font-medium leading-none">
              Reset Table Column Filters
            </Label>
          </div>

          <MyListBox
            aria-label="Toggle Columns"
            selectionMode="multiple"
            selectionBehavior="toggle"
            selectedKeys={visibleColumns}
            onSelectionChange={setVisibleColumns}
            autoFocus={true}
            className="text-lg flex-1"
          >
            {colDefs.map((col) => (
              <ListBoxItem key={col.field} id={col.field}>
                {col.headerName}
              </ListBoxItem>
            ))}
          </MyListBox>
        </div>

        <div className="flex-1 flex flex-col space-y-3">
          <Label htmlFor="filter">Quick Filter Options</Label>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="freq">Frequencies (Hz)</Label>
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"}>
              <ListBox
                maxHeight="100px"
                aria-label="Freq"
                selectionMode="multiple"
                selectedKeys={freqSelected}
                onSelectionChange={onFreqSelectedChange}
                items={uniqueFreqIds.map((id, index) => ({ id, freq: uniqueFreqs[index] }))}
              >
                {(item) => <Item key={item.id}>{item.freq.toString()}</Item>}
              </ListBox>
            </Provider>
          </div>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="tx">Tx</Label>
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"}>
              <ListBox
                maxHeight="300px"
                minHeight="100px"
                aria-label="Tx"
                selectionMode="multiple"
                selectedKeys={txSelected}
                onSelectionChange={onTxSelectedChange}
                items={txData}
              >
                {(tx) => <Item key={tx.Tx_id}>{"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}</Item>}
              </ListBox>
            </Provider>
          </div>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="rx">Rx</Label>
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"}>
              <ListBox
                maxHeight="300px"
                minHeight="100px"
                aria-label="Rx"
                selectionMode="multiple"
                selectedKeys={rxSelected}
                onSelectionChange={onRxSelectedChange}
                items={rxData}
              >
                {(rx) => <Item key={rx.Rx_id}>{"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}</Item>}
              </ListBox>
            </Provider>
          </div>
        </div>
      </div>

      <div className="flex-row">
        <hr className="my-4" />
        <Button className="w-fit" type="button" onClick={handleSave}>
          Export data file
        </Button>
      </div>

      <CustomAlertDialog
        alertState={alertState}
        onClose={hideAlert}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
