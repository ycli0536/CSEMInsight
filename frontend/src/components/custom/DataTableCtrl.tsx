import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListBoxItem, ListBox as MyListBox } from "@/components/custom/ListBox";
import { Item, ListBox, Provider, lightTheme, darkTheme } from "@adobe/react-spectrum";
import { useCallback, useMemo } from "react";
import type { Selection } from 'react-aria-components';

import type { TxData, RxData } from "@/types";
import { useSettingFormStore, useDataTableStore } from "@/store/settingFormStore";
import { useTheme } from "@/hooks/useTheme";

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

  const {
    data,
    txData,
    rxData,
  } = useDataTableStore();
  const { colDefs, visibleColumns, setVisibleColumns } = useDataTableStore();
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const spectrumTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  const uniqueFreqs = useMemo(() => Array.from(new Set(data.map((item) => item.Freq))).sort((a, b) => a - b), [data]);
  const uniqueFreqIds = useMemo(() => Array.from(new Set(data.map((item) => item.Freq_id))).sort((a, b) => Number(a) - Number(b)), [data]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 gap-4">
        <div className="flex-1 flex flex-col space-y-3 min-w-0">
          <Label htmlFor="toggle-col">Toggle Columns</Label>

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

        <div className="flex-1 flex flex-col space-y-3 min-w-0">
          <Label htmlFor="filter">Quick Filter Options</Label>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="freq">Frequencies (Hz)</Label>
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"} width="100%">
              <ListBox
                width="100%"
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
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"} width="100%">
              <ListBox
                width="100%"
                maxHeight="300px"
                minHeight="100px"
                aria-label="Tx"
                selectionMode="multiple"
                selectedKeys={txSelected}
                onSelectionChange={onTxSelectedChange}
                items={txData}
              >
                {(tx) => (
                  <Item key={tx.Tx_id} textValue={"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}>
                    <div className="truncate w-full relative">
                      {"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}
                    </div>
                  </Item>
                )}
              </ListBox>
            </Provider>
          </div>

          <div className="flex flex-col space-y-3">
            <Label htmlFor="rx">Rx</Label>
            <Provider theme={spectrumTheme} colorScheme={resolvedTheme as "light" | "dark"} width="100%">
              <ListBox
                width="100%"
                maxHeight="300px"
                minHeight="100px"
                aria-label="Rx"
                selectionMode="multiple"
                selectedKeys={rxSelected}
                onSelectionChange={onRxSelectedChange}
                items={rxData}
              >
                {(rx) => (
                  <Item key={rx.Rx_id} textValue={"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}>
                    <div className="truncate w-full relative">
                      {"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}
                    </div>
                  </Item>
                )}
              </ListBox>
            </Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
