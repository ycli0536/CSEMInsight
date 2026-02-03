import type { ComparisonMode, Dataset } from "@/types";
import { computeDifferenceData } from "@/services/extractComparisonData";

export function resolveReferenceDataset(
  datasets: Dataset[],
  referenceDatasetId: string | null,
): Dataset | null {
  if (!datasets.length) {
    return null;
  }
  if (referenceDatasetId) {
    return datasets.find((dataset) => dataset.id === referenceDatasetId) ?? datasets[0];
  }
  return datasets[0];
}

export function buildOverlayDatasets(
  comparisonMode: ComparisonMode,
  activeDatasets: Dataset[],
  referenceDataset: Dataset | null,
): Dataset[] {
  if (comparisonMode === 'difference' && referenceDataset) {
    return activeDatasets
      .filter((dataset) => dataset.id !== referenceDataset.id)
      .map((dataset) => ({
        ...dataset,
        name: `Delta: ${referenceDataset.name} - ${dataset.name}`,
        data: computeDifferenceData(referenceDataset.data, dataset.data),
      }));
  }
  if (comparisonMode === 'overlay') {
    return activeDatasets;
  }
  return [];
}
