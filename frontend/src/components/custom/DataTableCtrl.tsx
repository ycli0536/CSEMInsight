import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ListBoxItem, ListBox as MyListBox } from "@/components/custom/ListBox";
import { Item, ListBox, Provider, lightTheme, darkTheme } from "@adobe/react-spectrum";
import { useCallback } from "react";
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
  const {
    data,
    filteredData,
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

  const uniqueFreqs = Array.from(new Set(data.map((item) => item.Freq))).sort((a, b) => a - b);
  const uniqueFreqIds = Array.from(new Set(data.map((item) => item.Freq_id))).sort((a, b) => Number(a) - Number(b));


  // Function to handle Freq selection changes
  const onFreqSelectedChange = useCallback((newSelection: Selection) => {

    const getAntiSelection = (allItems: string[], newSelection: Selection) => {
      const antiSelectedFreq = allItems.filter((item) => !(newSelection as Set<string>).has(String(item)));
      const antiSelection = new Set<string>(antiSelectedFreq.map(String));
      return antiSelection;
    };

    if ((newSelection as Set<string>).size === uniqueFreqIds.length) {
      console.log("All Freq are selected");
      newSelection = 'all';
      setFreqSelected(newSelection);
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === uniqueFreqIds.length;
      if (freqSelected === 'all' && !isAllSelected) {
        const antiSelection = getAntiSelection(uniqueFreqIds, newSelection);
        newSelection = antiSelection;
        setFreqSelected(newSelection);
      } else {
        setFreqSelected(newSelection);
      }
    }

    if (newSelection && newSelection !== 'all' && (newSelection as Set<string>).size > 0) {
      const filteredTableData = data.filter((row) => (newSelection as Set<string>).has(String(row.Freq_id)));
      setTableData(filteredTableData);
      setFilteredData(filteredTableData);
    }
    else if (newSelection === 'all') {
      setTableData(data);
      setFilteredData(data);
    }
  }, [setFreqSelected, setTableData, setFilteredData, data, uniqueFreqIds, freqSelected]);

  // Function to handle Tx selection changes
  const onTxSelectedChange = useCallback((newSelection: Selection) => {

    // Function to calculate anti-selection
    const getAntiSelection = (allItems: TxData[], newSelection: Selection) => {
      const antiSelectedTx = allItems.filter((item) => !(newSelection as Set<string>).has(item.Tx_id.toString()));
      const antiSelection = new Set<string>(antiSelectedTx.map((item) => item.Tx_id.toString()));
      return antiSelection;
    };

    if ((newSelection as Set<string>).size === txData.length) {
      console.log("All Tx are selected");
      newSelection = 'all';
      setTxSelected(newSelection);
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === txData.length;
      if (txSelected === 'all' && !isAllSelected) {
        // console.log("'All' was previously selected, and now another item is clicked");
        const antiSelection = getAntiSelection(txData, newSelection);
        // console.log("Anti-Selected Tx Items:", antiSelection);
        newSelection = antiSelection;
        setTxSelected(newSelection);
      } else {
        // console.log("Normal selection behavior");
        setTxSelected(newSelection);
      }
    }

    // Filter the data based on the selected Tx values
    if (newSelection && (newSelection as Set<string>).size > 0) {
      const filteredTableData = data.filter((row) => (newSelection as Set<string>).has(row.Tx_id.toString()));
      setTableData(filteredTableData);
      setFilteredData(filteredTableData);
      // updataTxFilterModel(newSelection);
    }
    else if (newSelection === 'all') {
      setTableData(data);
      setFilteredData(data);
      // updataTxFilterModel(newSelection);
    }
  }, [setTxSelected, setTableData, setFilteredData, data, txData, txSelected]);

  // Function to handle Rx selection changes
  const onRxSelectedChange = useCallback((newSelection: Selection) => {

    // Function to calculate anti-selection
    const getAntiSelection = (allItems: RxData[], newSelection: Selection) => {
      const antiSelectedRx = allItems.filter((item) => !(newSelection as Set<string>).has(item.Rx_id.toString()));
      const antiSelection = new Set<string>(antiSelectedRx.map((item) => item.Rx_id.toString()));
      return antiSelection;
    };

    if ((newSelection as Set<string>).size === rxData.length) {
      console.log("All Rx are selected");
      newSelection = 'all';
      setRxSelected(newSelection);
    }
    else {
      const isAllSelected = newSelection === 'all' || (newSelection as Set<string>).size === rxData.length;
      if (rxSelected === 'all' && !isAllSelected) {
        const antiSelection = getAntiSelection(rxData, newSelection);
        newSelection = antiSelection;
        setRxSelected(newSelection);
      } else {
        setRxSelected(newSelection);
      }
    }

    // Filter the data based on the selected Rx values
    if (newSelection && newSelection !== 'all' && (newSelection as Set<string>).size > 0) {
      const matchRx = data.filter((row) => (newSelection as Set<string>).has(String(row.Rx_id)));
      setTableData(matchRx);
      setFilteredData(matchRx);
    }
    else if (newSelection === 'all') {
      setTableData(data);
      setFilteredData(data);
    }
  }, [setRxSelected, setTableData, setFilteredData, data, rxData, rxSelected]);

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
      const content = JSON.stringify(filteredData);
      console.log("filteredData: ", filteredData);

      // Send the file name to the backend
      const response = await axios.post(
        "http://127.0.0.1:3354/api/write-data-file",
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
