import { create } from "zustand";
import type { CsemData } from "@/types";

export type StatisticalMetrics = {
  count: number;
  rmse: number | null;
  mae: number | null;
  correlation: number | null;
};

type ComparisonStore = {
  referenceDatasetId: string | null;
  differenceData: CsemData[];
  statisticalResults: Record<string, StatisticalMetrics>;
  alignmentMode: "exact" | "interpolated";
  setReferenceDatasetId: (id: string | null) => void;
  setDifferenceData: (data: CsemData[]) => void;
  setStatisticalResults: (results: Record<string, StatisticalMetrics>) => void;
  setAlignmentMode: (mode: "exact" | "interpolated") => void;
};

export const useComparisonStore = create<ComparisonStore>()((set) => ({
  referenceDatasetId: null,
  differenceData: [],
  statisticalResults: {},
  alignmentMode: "exact",
  setReferenceDatasetId: (id) => set({ referenceDatasetId: id }),
  setDifferenceData: (data) => set({ differenceData: data }),
  setStatisticalResults: (results) => set({ statisticalResults: results }),
  setAlignmentMode: (mode) => set({ alignmentMode: mode }),
}));
