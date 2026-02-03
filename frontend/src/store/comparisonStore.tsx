import { create } from "zustand";
import type { CsemData } from "@/types";

type ComparisonStore = {
  referenceDatasetId: string | null;
  differenceData: CsemData[];
  alignmentMode: "exact" | "interpolated";
  setReferenceDatasetId: (id: string | null) => void;
  setDifferenceData: (data: CsemData[]) => void;
  setAlignmentMode: (mode: "exact" | "interpolated") => void;
};

export const useComparisonStore = create<ComparisonStore>()((set) => ({
  referenceDatasetId: null,
  differenceData: [],
  alignmentMode: "exact",
  setReferenceDatasetId: (id) => set({ referenceDatasetId: id }),
  setDifferenceData: (data) => set({ differenceData: data }),
  setAlignmentMode: (mode) => set({ alignmentMode: mode }),
}));
