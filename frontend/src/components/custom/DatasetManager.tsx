import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComparisonMode, Dataset, DatasetRole } from "@/types";
import { useDataTableStore } from "@/store/settingFormStore";
import { useComparisonStore } from "@/store/comparisonStore";
import { GripVertical, X } from "lucide-react";

const comparisonOptions: { value: ComparisonMode; label: string }[] = [
  { value: "overlay", label: "Overlay" },
  { value: "sidebyside", label: "Side-by-Side" },
  { value: "difference", label: "Difference" },
  { value: "statistical", label: "Statistical" },
];

interface DroppableZoneProps {
  id: DatasetRole;
  label: string;
  description: string;
  children: React.ReactNode;
  isEmpty: boolean;
}

function DroppableZone({ id, label, description, children, isEmpty }: DroppableZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
        isOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/40"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
      </div>
      <div className="space-y-2">
        {children}
        {isEmpty && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

interface DraggableDatasetProps {
  dataset: Dataset;
  isPrimary: boolean;
  onRemove: () => void;
  onColorChange: (color: string) => void;
}

function DraggableDataset({
  dataset,
  isPrimary,
  onRemove,
  onColorChange,
}: DraggableDatasetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dataset.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card p-2 shadow-sm ${
        isPrimary ? "border-primary/50 bg-primary/5" : ""
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="color"
          value={dataset.color}
          className="h-5 w-5 cursor-pointer rounded border-0 p-0"
          onChange={(e) => onColorChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="truncate text-sm font-medium" title={dataset.name}>
          {dataset.name}
        </span>
      </div>

      {isPrimary && (
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          TABLE
        </span>
      )}

      <button
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DatasetOverlay({ dataset }: { dataset: Dataset }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2 shadow-lg">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div
        className="h-5 w-5 rounded"
        style={{ backgroundColor: dataset.color }}
      />
      <span className="text-sm font-medium">{dataset.name}</span>
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
    moveDataset,
    updateDataset,
    removeDataset,
    setComparisonMode,
  } = useDataTableStore();
  const { referenceDatasetId, setReferenceDatasetId } = useComparisonStore();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const datasetList = useMemo(() => Array.from(datasets.values()), [datasets]);

  const primaryDataset = primaryDatasetId ? datasets.get(primaryDatasetId) : null;
  const comparedDatasets = comparedDatasetIds
    .map((id) => datasets.get(id))
    .filter((d): d is Dataset => Boolean(d));
  const hiddenDatasets = datasetList.filter(
    (d) => d.id !== primaryDatasetId && !comparedDatasetIds.includes(d.id)
  );

  const activeDataset = activeId ? datasets.get(activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedId = active.id as string;
    const targetZone = over.id as DatasetRole;

    if (targetZone === "primary" || targetZone === "compared" || targetZone === "hidden") {
      moveDataset(draggedId, targetZone);
    }
  };

  const handleDoubleClick = (id: string) => {
    setPrimaryDataset(id);
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-3">
            <DroppableZone
              id="primary"
              label="Primary"
              description="Drag a dataset here to edit in table"
              isEmpty={!primaryDataset}
            >
              {primaryDataset && (
                <SortableContext
                  items={[primaryDataset.id]}
                  strategy={verticalListSortingStrategy}
                >
                  <div onDoubleClick={() => handleDoubleClick(primaryDataset.id)}>
                    <DraggableDataset
                      dataset={primaryDataset}
                      isPrimary={true}
                      onRemove={() => removeDataset(primaryDataset.id)}
                      onColorChange={(color) =>
                        updateDataset(primaryDataset.id, { color })
                      }
                    />
                  </div>
                </SortableContext>
              )}
            </DroppableZone>

            <DroppableZone
              id="compared"
              label="Compare"
              description="Drag datasets here to overlay on plots"
              isEmpty={comparedDatasets.length === 0}
            >
              <SortableContext
                items={comparedDatasetIds}
                strategy={verticalListSortingStrategy}
              >
                {comparedDatasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    onDoubleClick={() => handleDoubleClick(dataset.id)}
                  >
                    <DraggableDataset
                      dataset={dataset}
                      isPrimary={false}
                      onRemove={() => removeDataset(dataset.id)}
                      onColorChange={(color) =>
                        updateDataset(dataset.id, { color })
                      }
                    />
                  </div>
                ))}
              </SortableContext>
            </DroppableZone>

            {hiddenDatasets.length > 0 && (
              <DroppableZone
                id="hidden"
                label="Hidden"
                description="Datasets here are loaded but not visible"
                isEmpty={hiddenDatasets.length === 0}
              >
                <SortableContext
                  items={hiddenDatasets.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {hiddenDatasets.map((dataset) => (
                    <div
                      key={dataset.id}
                      onDoubleClick={() => handleDoubleClick(dataset.id)}
                      className="opacity-60"
                    >
                      <DraggableDataset
                        dataset={dataset}
                        isPrimary={false}
                        onRemove={() => removeDataset(dataset.id)}
                        onColorChange={(color) =>
                          updateDataset(dataset.id, { color })
                        }
                      />
                    </div>
                  ))}
                </SortableContext>
              </DroppableZone>
            )}
          </div>

          <DragOverlay>
            {activeDataset && <DatasetOverlay dataset={activeDataset} />}
          </DragOverlay>
        </DndContext>
      )}

      <div className="text-xs text-muted-foreground">
        <p>• Drag datasets between zones to change their role</p>
        <p>• Double-click to set as primary</p>
      </div>
    </div>
  );
}
