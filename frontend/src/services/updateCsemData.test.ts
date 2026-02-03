import { describe, expect, it } from 'vitest';

import type { CsemData, TxData } from '@/types';
import {
  updateCsemDataWithAdjustedTx,
  revertCsemDataToOriginalTx,
} from './updateCsemData';

const baseRow: CsemData = {
  index: 0,
  Type: '28',
  Freq_id: '1',
  Freq: 1,
  Tx_id: 1,
  Rx_id: 1,
  Data: 1,
  StdError: 0.1,
  X_rx: 0,
  Y_rx: 0,
  Lon_rx: 0,
  Lat_rx: 0,
  Z_rx: 0,
  Theta: 0,
  Alpha: 0,
  Beta: 0,
  Length_rx: 0,
  Name_rx: 'rx',
  X_tx: 0,
  Y_tx: 0,
  Lon_tx: 0,
  Lat_tx: 0,
  Z_tx: 10,
  Azimuth: 0,
  Dip: 0,
  Length_tx: 0,
  Type_tx: 'tx',
  Name_tx: 'tx',
  offset: 0,
  distance: 0,
};

const baseTx: TxData = {
  Tx_id: 1,
  X_tx: 0,
  Y_tx: 0,
  Lon_tx: 0,
  Lat_tx: 0,
  Z_tx: 10,
  Azimuth: 0,
  Dip: 0,
  Length_tx: 0,
  Type_tx: 'tx',
  Name_tx: 'tx',
};

describe('updateCsemDataWithAdjustedTx', () => {
  it('updates Z_tx when matching Tx_id exists', () => {
    const adjusted: TxData[] = [{ ...baseTx, Z_tx: 25 }];

    const result = updateCsemDataWithAdjustedTx([baseRow], adjusted);

    expect(result[0].Z_tx).toBe(25);
  });

  it('keeps Z_tx when no matching Tx_id', () => {
    const adjusted: TxData[] = [{ ...baseTx, Tx_id: 2, Z_tx: 99 }];

    const result = updateCsemDataWithAdjustedTx([baseRow], adjusted);

    expect(result[0].Z_tx).toBe(10);
  });
});

describe('revertCsemDataToOriginalTx', () => {
  it('restores original Z_tx when matching Tx_id exists', () => {
    const adjustedRow = { ...baseRow, Z_tx: 25 };
    const original: TxData[] = [{ ...baseTx, Z_tx: 10 }];

    const result = revertCsemDataToOriginalTx([adjustedRow], original);

    expect(result[0].Z_tx).toBe(10);
  });
});
