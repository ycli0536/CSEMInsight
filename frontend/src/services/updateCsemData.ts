import type { CsemData, TxData } from "@/types";

/**
 * Update CSEM data with adjusted Tx depths
 * This ensures that when data is exported, it includes the adjusted Tx depths
 */
export function updateCsemDataWithAdjustedTx(
  csemData: CsemData[],
  adjustedTxData: TxData[]
): CsemData[] {
  // Create a map of Tx_id to adjusted Z_tx for quick lookup
  const txDepthMap = new Map<number, number>();
  adjustedTxData.forEach((tx) => {
    txDepthMap.set(tx.Tx_id, tx.Z_tx);
  });

  // Update CSEM data with adjusted Tx depths
  return csemData.map((row) => {
    const adjustedDepth = txDepthMap.get(row.Tx_id);
    if (adjustedDepth !== undefined) {
      return {
        ...row,
        Z_tx: adjustedDepth,
      };
    }
    return row;
  });
}

/**
 * Revert CSEM data to original Tx depths
 */
export function revertCsemDataToOriginalTx(
  csemData: CsemData[],
  originalTxData: TxData[]
): CsemData[] {
  // Create a map of Tx_id to original Z_tx for quick lookup
  const originalTxDepthMap = new Map<number, number>();
  originalTxData.forEach((tx) => {
    originalTxDepthMap.set(tx.Tx_id, tx.Z_tx);
  });

  // Revert CSEM data to original Tx depths
  return csemData.map((row) => {
    const originalDepth = originalTxDepthMap.get(row.Tx_id);
    if (originalDepth !== undefined) {
      return {
        ...row,
        Z_tx: originalDepth,
      };
    }
    return row;
  });
}
