import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComparisonMode, Dataset } from "@/types";
import { useDataTableStore } from "@/store/settingFormStore";
import { useComparisonStore } from "@/store/comparisonStore";

const comparisonOptions: { value: ComparisonMode; label: string }[] = [
  { value: "overlay", label: "Overlay" },
  { value: "sidebyside", label: "Side-by-Side" },
  { value: "difference", label: "Difference" },
  { value: "statistical", label: "Statistical" },
];

const formatUploadTime = (value: Dataset["uploadTime"]) => {
  if (!value) {
    return "";
  }
  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? "" : dateValue.toLocaleString();
};

export function DatasetManager() {
  const {
    datasets,
    activeDatasetIds,
    comparisonMode,
    updateDataset,
    removeDataset,
    setActiveDatasets,
    setComparisonMode,
  } = useDataTableStore();
  const { referenceDatasetId, setReferenceDatasetId } = useComparisonStore();

  const datasetList = useMemo(() => Array.from(datasets.values()), [datasets]);

  const toggleActive = (id: string) => {
    if (activeDatasetIds.includes(id)) {
      setActiveDatasets(activeDatasetIds.filter((datasetId) => datasetId !== id));
      updateDataset(id, { visible: false });
      return;
    }
    setActiveDatasets([...activeDatasetIds, id]);
    updateDataset(id, { visible: true });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Comparison Mode</Label>
        <Select
          value={comparisonMode}
          onValueChange={(value) => setComparisonMode(value as ComparisonMode)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {comparisonOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(comparisonMode === "difference" || comparisonMode === "statistical") && (
        <div className="grid gap-2">
          <Label>Reference Dataset</Label>
          <Select
            value={referenceDatasetId ?? ""}
            onValueChange={(value) => setReferenceDatasetId(value || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reference dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasetList.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-3">
        <Label>Loaded datasets</Label>
        {datasetList.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No datasets loaded yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {datasetList.map((dataset) => (
              <div
                key={dataset.id}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
              >
                <Checkbox
                  id={`dataset-${dataset.id}`}
                  checked={activeDatasetIds.includes(dataset.id)}
                  onCheckedChange={() => toggleActive(dataset.id)}
                />
                <label
                  htmlFor={`dataset-${dataset.id}`}
                  className="text-sm font-medium"
                >
                  {dataset.name}
                </label>
                <input
                  aria-label={`Color for ${dataset.name}`}
                  type="color"
                  value={dataset.color}
                  className="h-6 w-6 cursor-pointer rounded border"
                  onChange={(event) =>
                    updateDataset(dataset.id, { color: event.target.value })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {formatUploadTime(dataset.uploadTime)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => removeDataset(dataset.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
