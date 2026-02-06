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

export function hasModelResponseData(datasets: Dataset[]): boolean {
  return datasets.some((dataset) =>
    dataset.data.some((row) => Number.isFinite(row.Response))
  );
}

export function hasResidualResponseData(datasets: Dataset[]): boolean {
  return datasets.some((dataset) =>
    dataset.data.some((row) => Number.isFinite(row.Residual))
  );
}

export function wrapPhaseValue(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function unwrapPhaseSeries(values: number[]): number[] {
  if (!values.length) {
    return [];
  }

  const unwrapped: number[] = [];
  let prevUnwrapped: number | null = null;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      unwrapped.push(value);
      prevUnwrapped = null;
      continue;
    }

    if (prevUnwrapped === null) {
      unwrapped.push(value);
      prevUnwrapped = value;
      continue;
    }

    let current = value;
    let delta = current - prevUnwrapped;

    while (delta > 180) {
      current -= 360;
      delta -= 360;
    }

    while (delta < -180) {
      current += 360;
      delta += 360;
    }

    unwrapped.push(current);
    prevUnwrapped = current;
  }

  return unwrapped;
}

export function initializePhaseSeries(values: number[]): number[] {
  const unwrappedValues = unwrapPhaseSeries(values);
  const finiteValues = unwrappedValues.filter(Number.isFinite);
  if (!finiteValues.length) {
    return unwrappedValues;
  }

  const sortedValues = [...finiteValues].sort((a, b) => a - b);
  const medianValue = sortedValues[Math.floor(sortedValues.length / 2)];
  const shift = 360 * Math.round(medianValue / 360);

  return unwrappedValues.map((value) =>
    Number.isFinite(value) ? value - shift : value
  );
}
