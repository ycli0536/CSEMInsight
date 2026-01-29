import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  const {
    data,
    // filteredData, // Don't subscribe!
    tableData,
    txData,
    rxData,
    dataBlocks,
    setTableData,
    setFilteredData,
    setDataFileString,
  } = useDataTableStore();
  const { colDefs, visibleColumns, setVisibleColumns } = useDataTableStore();
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const spectrumTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  // Memoize unique values to ensure performance
  const uniqueFreqs = useMemo(() => Array.from(new Set(data.map((item) => item.Freq))).sort((a, b) => a - b), [data]);
  const uniqueFreqIds = useMemo(() => Array.from(new Set(data.map((item) => item.Freq_id))).sort((a, b) => Number(a) - Number(b)), [data]);

  // Centralized filtering logic
  const filteredResult = useMemo(() => {
    // If no data, nothing to filter
    if (!data || data.length === 0) {
      return [];
    }

    let result = data;

    // 1. Filter by Frequency
    if (freqSelected !== 'all' && (freqSelected as Set<string>).size > 0 && (freqSelected as Set<string>).size < uniqueFreqIds.length) {
      const selectedSet = freqSelected as Set<string>;
      result = result.filter((row) => selectedSet.has(String(row.Freq_id)));
    }

    // 2. Filter by Tx
    if (txSelected !== 'all' && (txSelected as Set<string>).size > 0 && (txSelected as Set<string>).size < txData.length) {
      const selectedSet = txSelected as Set<string>;
      result = result.filter((row) => selectedSet.has(row.Tx_id.toString()));
    }

    // 3. Filter by Rx
    if (rxSelected !== 'all' && (rxSelected as Set<string>).size > 0 && (rxSelected as Set<string>).size < rxData.length) {
      const selectedSet = rxSelected as Set<string>;
      result = result.filter((row) => selectedSet.has(String(row.Rx_id)));
    }

    return result;
  }, [data, freqSelected, txSelected, rxSelected, uniqueFreqIds.length, txData.length, rxData.length]);

  useEffect(() => {
    // Optimization: Skip update if no meaningful change or initialization
    if (filteredResult.length === 0 && (!data || data.length === 0)) {
      if (tableData.length > 0) {
        setFilteredData([]);
        setTableData([]);
      }
      return;
    }

    // CRITICAL FIX: Prevent overwriting AG-Grid filters if sidebar filters haven't changed.
    if (filteredResult === tableData) {
      return;
    }

    setTableData(filteredResult);
    // setFilteredData(filteredResult); // Redundant if setTableData handles it

  }, [filteredResult, tableData, setTableData, setFilteredData, data]);




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
