import type { CsemData } from "@/types";

type MatchKey = keyof Pick<CsemData, "Freq_id" | "Tx_id" | "Rx_id" | "Type">;

const buildKey = (item: CsemData, keys: MatchKey[]) => {
  return keys.map((key) => String(item[key])).join("|");
};

export type StatisticalMetrics = {
  count: number;
  rmse: number | null;
  mae: number | null;
  correlation: number | null;
};

export const computeStatistics = (
  reference: CsemData[],
  target: CsemData[],
  matchKeys: MatchKey[] = ["Freq_id", "Tx_id", "Rx_id", "Type"],
): StatisticalMetrics => {
  const refMap = new Map<string, CsemData>();
  reference.forEach((item) => {
    refMap.set(buildKey(item, matchKeys), item);
  });

  const valuesA: number[] = [];
  const valuesB: number[] = [];
  target.forEach((item) => {
    const match = refMap.get(buildKey(item, matchKeys));
    if (!match) {
      return;
    }
    valuesA.push(match.Data);
    valuesB.push(item.Data);
  });

  if (valuesA.length === 0) {
    return { count: 0, rmse: null, mae: null, correlation: null };
  }

  const diffs = valuesA.map((value, idx) => value - valuesB[idx]);
  const mse = diffs.reduce((acc, value) => acc + value ** 2, 0) / diffs.length;
  const rmse = Math.sqrt(mse);
  const mae = diffs.reduce((acc, value) => acc + Math.abs(value), 0) / diffs.length;
  const correlation = computeCorrelation(valuesA, valuesB);

  return {
    count: valuesA.length,
    rmse,
    mae,
    correlation,
  };
};

const computeCorrelation = (valuesA: number[], valuesB: number[]) => {
  if (valuesA.length < 2) {
    return null;
  }
  const meanA = valuesA.reduce((acc, value) => acc + value, 0) / valuesA.length;
  const meanB = valuesB.reduce((acc, value) => acc + value, 0) / valuesB.length;
  const numerator = valuesA.reduce(
    (acc, value, idx) => acc + (value - meanA) * (valuesB[idx] - meanB),
    0,
  );
  const denomA = Math.sqrt(valuesA.reduce((acc, value) => acc + (value - meanA) ** 2, 0));
  const denomB = Math.sqrt(valuesB.reduce((acc, value) => acc + (value - meanB) ** 2, 0));
  if (denomA === 0 || denomB === 0) {
    return null;
  }
  return numerator / (denomA * denomB);
};
