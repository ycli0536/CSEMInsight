import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ComparisonMode, Dataset } from "@/types";
import { useDataTableStore } from "@/store/settingFormStore";
import { useComparisonStore } from "@/store/comparisonStore";
import { X } from "lucide-react";

const comparisonOptions: { value: ComparisonMode; label: string }[] = [
  { value: "overlay", label: "Overlay" },
  { value: "sidebyside", label: "Side-by-Side" },
  { value: "difference", label: "Difference" },
  { value: "statistical", label: "Statistical" },
];

interface DatasetItemProps {
  dataset: Dataset;
  isPrimary: boolean;
  isVisible: boolean;
  onToggleVisibility: (checked: boolean) => void;
  onSetPrimary: () => void;
  onRemove: () => void;
  onColorChange: (color: string) => void;
}

function DatasetItem({
  dataset,
  isPrimary,
  isVisible,
  onToggleVisibility,
  onSetPrimary,
  onRemove,
  onColorChange,
}: DatasetItemProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-2 transition-all duration-200 ${
        !isVisible
          ? "border-muted bg-muted/30 opacity-50"
          : isPrimary
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-card"
      }`}
    >
      <Checkbox
        checked={isVisible}
        onCheckedChange={onToggleVisibility}
        className="shrink-0"
      />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`flex min-w-0 flex-1 items-center gap-2 text-left transition-colors ${
                isVisible ? "cursor-pointer hover:opacity-80" : "cursor-default"
              }`}
              onClick={() => isVisible && onSetPrimary()}
              disabled={!isVisible}
            >
              <input
                type="color"
                value={dataset.color}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 p-0"
                onChange={(e) => onColorChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <span
                className={`truncate text-sm ${isPrimary ? "font-semibold" : "font-medium"}`}
                title={dataset.name}
              >
                {dataset.name}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isPrimary
              ? "Currently shown in data table"
              : isVisible
                ? "Click to show in data table"
                : "Check to make visible"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isPrimary && (
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          TABLE
        </span>
      )}

      {isVisible && !isPrimary && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          PLOT
        </span>
      )}

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 text-destructive/60 transition-colors hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Remove dataset</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function DatasetManager() {
  const {
    datasets,
    primaryDatasetId,
    comparedDatasetIds,
    comparisonMode,
    setPrimaryDataset,
    addToCompared,
    removeFromCompared,
    updateDataset,
    removeDataset,
    setComparisonMode,
  } = useDataTableStore();
  const { referenceDatasetId, setReferenceDatasetId } = useComparisonStore();

  const datasetList = useMemo(() => Array.from(datasets.values()), [datasets]);

  const isDatasetVisible = (id: string) =>
    id === primaryDatasetId || comparedDatasetIds.includes(id);

  const handleToggleVisibility = (id: string, checked: boolean) => {
    if (checked) {
      if (!primaryDatasetId) {
        setPrimaryDataset(id);
      } else {
        addToCompared(id);
      }
    } else {
      if (id === primaryDatasetId) {
        const nextPrimary = comparedDatasetIds[0];
        if (nextPrimary) {
          setPrimaryDataset(nextPrimary);
        }
      } else {
        removeFromCompared(id);
      }
    }
  };

  const handleSetPrimary = (id: string) => {
    if (id !== primaryDatasetId) {
      setPrimaryDataset(id);
    }
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

      {datasetList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No datasets loaded yet. Upload a file to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {datasetList.map((dataset) => {
            const isVisible = isDatasetVisible(dataset.id);
            const isPrimary = dataset.id === primaryDatasetId;

            return (
              <DatasetItem
                key={dataset.id}
                dataset={dataset}
                isPrimary={isPrimary}
                isVisible={isVisible}
                onToggleVisibility={(checked) =>
                  handleToggleVisibility(dataset.id, checked)
                }
                onSetPrimary={() => handleSetPrimary(dataset.id)}
                onRemove={() => removeDataset(dataset.id)}
                onColorChange={(color) => updateDataset(dataset.id, { color })}
              />
            );
          })}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p>• Check/uncheck to show/hide on plots</p>
        <p>• Click a visible dataset to show in data table</p>
      </div>
    </div>
  );
}
