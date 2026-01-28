import type { CsemData } from "@/types";

type MatchKey = keyof Pick<CsemData, "Freq_id" | "Tx_id" | "Rx_id" | "Type">;

const buildKey = (item: CsemData, keys: MatchKey[]) => {
  return keys.map((key) => String(item[key])).join("|");
};

export const computeDifferenceData = (
  reference: CsemData[],
  target: CsemData[],
  matchKeys: MatchKey[] = ["Freq_id", "Tx_id", "Rx_id", "Type"],
) => {
  const refMap = new Map<string, CsemData>();
  reference.forEach((item) => {
    refMap.set(buildKey(item, matchKeys), item);
  });

  const diffs: CsemData[] = [];
  target.forEach((item) => {
    const match = refMap.get(buildKey(item, matchKeys));
    if (!match) {
      return;
    }

    const diffValue = match.Data - item.Data;
    const diffStdError = Math.sqrt(match.StdError ** 2 + item.StdError ** 2);

    diffs.push({
      ...match,
      Data: diffValue,
      StdError: diffStdError,
    });
  });

  return diffs;
};
