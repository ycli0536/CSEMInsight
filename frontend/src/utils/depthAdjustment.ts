import { TxData, BathymetryData } from '@/store/settingFormStore';

/**
 * Interpolate bathymetry depth at a given inline distance
 */
function interpolateBathymetryDepth(
  inlineDistance: number, 
  bathymetryData: BathymetryData
): number {
  const { inline_distance: bathyX, depth: bathyY } = bathymetryData;
  
  // If outside range, return nearest boundary value
  if (inlineDistance <= bathyX[0]) return bathyY[0];
  if (inlineDistance >= bathyX[bathyX.length - 1]) return bathyY[bathyY.length - 1];
  
  // Linear interpolation
  for (let i = 0; i < bathyX.length - 1; i++) {
    if (inlineDistance >= bathyX[i] && inlineDistance <= bathyX[i + 1]) {
      const ratio = (inlineDistance - bathyX[i]) / (bathyX[i + 1] - bathyX[i]);
      return bathyY[i] + ratio * (bathyY[i + 1] - bathyY[i]);
    }
  }
  
  return bathyY[bathyY.length - 1];
}

/**
 * Adjust Tx depths based on bathymetry data
 * New depth = interpolated bathymetry depth - offset (default 0.1m)
 */
export function adjustTxDepthsToBathymetry(
  txData: TxData[], 
  bathymetryData: BathymetryData,
  offset: number = 0.1
): TxData[] {
  console.log('=== Depth Adjustment Debug ===');
  console.log('Input Tx data count:', txData.length);
  console.log('Bathymetry range:', bathymetryData.inline_distance[0], 'to', bathymetryData.inline_distance[bathymetryData.inline_distance.length - 1]);
  console.log('Depth range:', bathymetryData.depth[0], 'to', bathymetryData.depth[bathymetryData.depth.length - 1]);
  
  return txData.map((tx, index) => {
    // Use Y_tx as inline distance for interpolation
    const interpolatedDepth = interpolateBathymetryDepth(tx.Y_tx, bathymetryData);
    const newDepth = interpolatedDepth - offset;
    
    if (index < 3) { // Log first few for debugging
      console.log(`Tx ${index}: Y=${tx.Y_tx}, Original Z=${tx.Z_tx}, Bathymetry Z=${interpolatedDepth}, New Z=${newDepth}`);
    }
    
    return {
      ...tx,
      Z_tx: newDepth // Subtract offset to place Tx above seafloor (shallower)
    };
  });
}

/**
 * Create combined dataset showing both original and adjusted positions
 */
export function createCombinedTxData(
  originalTx: TxData[],
  adjustedTx: TxData[]
): { original: TxData[], adjusted: TxData[] } {
  return {
    original: originalTx,
    adjusted: adjustedTx
  };
} 