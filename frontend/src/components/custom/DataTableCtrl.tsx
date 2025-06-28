import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ListBoxItem, ListBox as MyListBox } from "@/components/custom/ListBox";
import { Item, ListBox, Provider, lightTheme } from "@adobe/react-spectrum";
import { useCallback } from "react";
import type { Selection } from 'react-aria-components';
// import { FilterModel } from "@ag-grid-community/core";

import {
  useSettingFormStore,
  useDataTableStore,
  TxData,
} from "@/store/settingFormStore";
import axios from "axios";

export function DataTableCtrl() {
  const {
    freqSelected,
    txSelected,
    rxSelected,
    setFreqSelected,
    setTxSelected,
    setRxSelected,
  } = useSettingFormStore();
  const {
    data,
    filteredData,
    txData,
    rxData,
    dataBlocks,
    setTableData,
    setDataFileString,
  } = useDataTableStore();
  const { colDefs, visibleColumns, setVisibleColumns } = useDataTableStore();

  // Function to handle Tx selection changes
  const onTxSelectedChange = useCallback((newSelection: Selection) => {

    // const updataTxFilterModel = (newSelection: Selection) => {

    //     const filterModel: FilterModel = {
    //         filterType: 'number',
    //         operator: 'OR',
    //         conditions:
    //         Array.from(newSelection).map((item) => ({
    //             filterType: 'number',
    //             type: 'equals',
    //             filter: item as number,
    //         })),
    //     };
    //     console.log("Filter Model: ", filterModel);
    //     setFilterModel(filterModel);
    //     }

    // Function to calculate anti-selection
    const getAntiSelection = (allItems: TxData[], newSelection: Selection) => {
        const antiSelectedTx = allItems.filter((item) => !(newSelection as Set<string>).has(item.Tx_id.toString()));
        const antiSelection = new Set<string>(antiSelectedTx.map((item) => item.Tx_id.toString()));
        return antiSelection;
    };

    if ((newSelection as Set<string>).size === txData.length)
    {
        console.log("All Tx are selected");
        newSelection = 'all';
        setTxSelected(newSelection);
    }
    else
    {
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
        // updataTxFilterModel(newSelection);
    }
    else if (newSelection === 'all') 
    {
        setTableData(data);
        // updataTxFilterModel(newSelection);
    }
  }, [setTxSelected, setTableData, data, txData, txSelected]);

  const handleSave = async () => {
    try {
      // Show the file picker dialog to select a file to save
      const fileHandle = await (window as any).showSaveFilePicker({
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

      alert("File saved successfully on the server! (Only support EMData_2.2 format for now)");
    } catch (error) {
      console.error("Error saving the file:", error);
      alert("Failed to save the file.");
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
            <Provider theme={lightTheme} colorScheme="light">
              <ListBox
                maxHeight="100px"
                aria-label="Freq"
                selectionMode="multiple"
                selectedKeys={freqSelected}
                onSelectionChange={setFreqSelected}
                autoFocus={true}
              >
                <Item>0.25</Item>
                <Item>0.25</Item>
                <Item>0.25</Item>
                <Item>0.25</Item>
              </ListBox>
            </Provider>
          </div>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="tx">Tx</Label>
            <Provider theme={lightTheme} colorScheme="light">
              <ListBox
                maxHeight="300px"
                minHeight="100px"
                aria-label="Tx"
                selectionMode="multiple"
                selectedKeys={txSelected}
                onSelectionChange={onTxSelectedChange}
                items={txData}
              >
                {txData.map((tx) => (
                  <Item key={tx.Tx_id}>
                    {"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}
                  </Item>
                ))}
              </ListBox>
            </Provider>
          </div>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="rx">Rx</Label>
            <Provider theme={lightTheme} colorScheme="light">
              <ListBox
                maxHeight="300px"
                minHeight="100px"
                aria-label="Rx"
                selectionMode="multiple"
                selectedKeys={rxSelected}
                onSelectionChange={setRxSelected}
              >
                {rxData.map((rx) => (
                  <Item key={rx.Rx_id}>
                    {"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}
                  </Item>
                ))}
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
    </div>
  );
}
