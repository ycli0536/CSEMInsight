import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListBoxItem, ListBox as MyListBox } from "@/components/custom/ListBox";
import { CustomAlertDialog } from "@/components/custom/CustomAlertDialog";
import { Item, ListBox, Provider, lightTheme, darkTheme, Text } from "@adobe/react-spectrum";
import { useCallback, useMemo } from "react";
import type { Selection } from 'react-aria-components';

import type { TxData, RxData } from "@/types";
import { useSettingFormStore, useDataTableStore } from "@/store/settingFormStore";
import { useAlertDialog } from "@/hooks/useAlertDialog";
import { useTheme } from "@/hooks/useTheme";
import { isDemoModeEnabled } from '@/demo/demoModeConfig';

export function DataTableCtrl() {
  const isDemoMode = isDemoModeEnabled();
  const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();
  const {
    freqSelected,
    txSelected,
    rxSelected,
    applyQuickFiltersGlobally,
    setFreqSelected,
    setTxSelected,
    setRxSelected,
    setApplyQuickFiltersGlobally,
    resetColumnFilters,
    setResetColumnFilters,
  } = useSettingFormStore();

  const {
    data,
    txData,
    rxData,
    datasets,
    syncQuickFiltersAcrossDatasets,
  } = useDataTableStore();
  const { colDefs, visibleColumns, setVisibleColumns } = useDataTableStore();
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const spectrumTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  const freqOptions = useMemo(() => {
    const sourceData = applyQuickFiltersGlobally
      ? Array.from(datasets.values()).flatMap((dataset) => dataset.data)
      : data;
    const freqMap = new Map<string, { id: string; freq: number }>();

    sourceData.forEach((item) => {
      const id = String(item.Freq_id);
      if (!freqMap.has(id)) {
        freqMap.set(id, { id, freq: item.Freq });
      }
    });

    return Array.from(freqMap.values()).sort((a, b) => {
      if (a.freq !== b.freq) {
        return a.freq - b.freq;
      }

      const numericDiff = Number(a.id) - Number(b.id);
      return Number.isNaN(numericDiff) ? a.id.localeCompare(b.id) : numericDiff;
    });
  }, [applyQuickFiltersGlobally, data, datasets]);

  const availableTxData = useMemo(() => {
    if (!applyQuickFiltersGlobally) {
      return txData;
    }

    const txMap = new Map<number, TxData>();
    Array.from(datasets.values()).forEach((dataset) => {
      dataset.txData.forEach((tx) => {
        if (!txMap.has(tx.Tx_id)) {
          txMap.set(tx.Tx_id, tx);
        }
      });
    });

    return Array.from(txMap.values()).sort((a, b) => a.Tx_id - b.Tx_id);
  }, [applyQuickFiltersGlobally, datasets, txData]);

  const availableRxData = useMemo(() => {
    if (!applyQuickFiltersGlobally) {
      return rxData;
    }

    const rxMap = new Map<number, RxData>();
    Array.from(datasets.values()).forEach((dataset) => {
      dataset.rxData.forEach((rx) => {
        if (!rxMap.has(rx.Rx_id)) {
          rxMap.set(rx.Rx_id, rx);
        }
      });
    });

    return Array.from(rxMap.values()).sort((a, b) => a.Rx_id - b.Rx_id);
  }, [applyQuickFiltersGlobally, datasets, rxData]);

  const syncQuickFilters = useCallback((nextSelectionState: {
    freqSelected: Selection;
    txSelected: Selection;
    rxSelected: Selection;
  }) => {
    if (!applyQuickFiltersGlobally) {
      return;
    }

    syncQuickFiltersAcrossDatasets(nextSelectionState);
  }, [applyQuickFiltersGlobally, syncQuickFiltersAcrossDatasets]);

  const onApplyQuickFiltersGloballyChange = useCallback((checked: boolean) => {
    setApplyQuickFiltersGlobally(checked);
    if (checked) {
      showAlert(
        'Shared Quick Filter Mode',
        'Please ensure datasets share consistent ID indexing; otherwise, consistency between the selected filters and visualization results is not guaranteed.',
        'warning',
      );
      syncQuickFiltersAcrossDatasets({
        freqSelected,
        txSelected,
        rxSelected,
      });
    }
  }, [
    freqSelected,
    rxSelected,
    setApplyQuickFiltersGlobally,
    showAlert,
    syncQuickFiltersAcrossDatasets,
    txSelected,
  ]);

  const onFreqSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: string[], selection: Selection) => {
      const antiSelectedFreq = allItems.filter(
        (item) => !(selection as Set<string>).has(String(item)),
      );
      return new Set<string>(antiSelectedFreq.map(String));
    };

    let nextFreqSelected: Selection;
    if (newSelection === 'all' || (newSelection as Set<string>).size === freqOptions.length) {
      nextFreqSelected = 'all';
    } else {
      nextFreqSelected = freqSelected === 'all'
        ? getAntiSelection(
          freqOptions.map((item) => item.id),
          newSelection,
        )
        : newSelection;
    }

    setFreqSelected(nextFreqSelected);
    syncQuickFilters({
      freqSelected: nextFreqSelected,
      txSelected,
      rxSelected,
    });
  }, [freqOptions, freqSelected, rxSelected, setFreqSelected, syncQuickFilters, txSelected]);

  const onTxSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: TxData[], selection: Selection) => {
      const antiSelectedTx = allItems.filter(
        (item) => !(selection as Set<string>).has(item.Tx_id.toString()),
      );
      return new Set<string>(
        antiSelectedTx.map((item) => item.Tx_id.toString()),
      );
    };

    let nextTxSelected: Selection;
    if (
      newSelection === 'all' ||
      (newSelection as Set<string>).size === availableTxData.length
    ) {
      nextTxSelected = 'all';
    } else {
      nextTxSelected = txSelected === 'all'
        ? getAntiSelection(availableTxData, newSelection)
        : newSelection;
    }

    setTxSelected(nextTxSelected);
    syncQuickFilters({
      freqSelected,
      txSelected: nextTxSelected,
      rxSelected,
    });
  }, [
    availableTxData,
    freqSelected,
    rxSelected,
    setTxSelected,
    syncQuickFilters,
    txSelected,
  ]);

  const onRxSelectedChange = useCallback((newSelection: Selection) => {
    const getAntiSelection = (allItems: RxData[], selection: Selection) => {
      const antiSelectedRx = allItems.filter(
        (item) => !(selection as Set<string>).has(item.Rx_id.toString()),
      );
      return new Set<string>(
        antiSelectedRx.map((item) => item.Rx_id.toString()),
      );
    };

    let nextRxSelected: Selection;
    if (
      newSelection === 'all' ||
      (newSelection as Set<string>).size === availableRxData.length
    ) {
      nextRxSelected = 'all';
    } else {
      nextRxSelected = rxSelected === 'all'
        ? getAntiSelection(availableRxData, newSelection)
        : newSelection;
    }

    setRxSelected(nextRxSelected);
    syncQuickFilters({
      freqSelected,
      txSelected,
      rxSelected: nextRxSelected,
    });
  }, [
    availableRxData,
    freqSelected,
    rxSelected,
    setRxSelected,
    syncQuickFilters,
    txSelected,
  ]);

  return (
    <div className="flex flex-col">
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

          {!isDemoMode && (
            <div className="flex items-center space-x-2">
              <Switch
                id="global-quick-filters"
                checked={applyQuickFiltersGlobally}
                onCheckedChange={onApplyQuickFiltersGloballyChange}
              />
              <Label htmlFor="global-quick-filters" className="text-sm font-medium leading-none">
                Apply To All Datasets
              </Label>
            </div>
          )}

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
                items={freqOptions}
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
                items={availableTxData}
                UNSAFE_style={{ width: '100%', maxWidth: '100%' }}
              >
                {(tx) => (
                  <Item key={tx.Tx_id} textValue={"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}>
                    <Text>{"ID: " + tx.Tx_id.toString() + ", Site: " + tx.Name_tx}</Text>
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
                items={availableRxData}
                UNSAFE_style={{ width: '100%', maxWidth: '100%' }}
              >
                {(rx) => (
                  <Item key={rx.Rx_id} textValue={"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}>
                    <Text>{"ID: " + rx.Rx_id.toString() + ", Site: " + rx.Name_rx}</Text>
                  </Item>
                )}
              </ListBox>
            </Provider>
          </div>
        </div>
      </div>
      <CustomAlertDialog
        alertState={alertState}
        onClose={hideAlert}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
