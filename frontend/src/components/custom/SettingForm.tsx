
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { InputFile } from "@/components/custom/InputFile";
import { Combobox } from "@/components/custom/Combobox";
import { DataTableCtrl } from "@/components/custom/DataTableCtrl";
import { DatasetManager } from "@/components/custom/DatasetManager";
import { SampleDataLoader } from "@/components/custom/SampleDataLoader";
import { useSettingFormStore, useDataTableStore } from '@/store/settingFormStore';
import { useWindowStore } from '@/store/windowStore';
import { Button } from "@/components/ui/button";

export function SettingForm() {
  const {
    xAxisColumn, setXAxisColumn,
    yAxisColumn, setYAxisColumn,
    splitByColumn, setSplitByColumn
  } = useSettingFormStore();
  const { colDefs } = useDataTableStore();
  const { toggleWindow } = useWindowStore();

  const columnOptions = colDefs
    .filter(col => col.field && col.headerName)
    .map(col => ({
      value: col.field!,
      label: col.headerName!
    }));

  return (
    <form className="sticky w-full items-start gap-6 overflow-auto p-4 pt-0">
      <fieldset className="grid gap-6">
        <InputFile />
      </fieldset>
      <fieldset className="grid gap-6 rounded-lg border p-4">
        <legend className="-ml-1 px-1 text-base font-medium">
          Datasets
        </legend>
        <DatasetManager />
        <SampleDataLoader />
      </fieldset>

      <fieldset className="grid gap-6 rounded-lg border p-4">
        <legend className="-ml-1 px-1 text-base font-medium">
          Data table
        </legend>
        <DataTableCtrl />
      </fieldset>
      <fieldset className="grid gap-6 rounded-lg border p-4">
        <legend className="-ml-1 px-1 text-base font-medium">
          Popular options
        </legend>

        <div className="grid gap-3">
          <Label htmlFor="plot">Plot</Label>
          <Select defaultValue="response">
            <SelectTrigger>
              <SelectValue placeholder="Select a plot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="response">Response Lines</SelectItem>
              <SelectItem value="uncertainty">Uncertainty</SelectItem>
              <SelectItem value="placeholder">placeholder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3">
          <Label htmlFor="position">Position</Label>
          <Select defaultValue="y-position">
            <SelectTrigger>
              <SelectValue placeholder="select the x-axis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="y-position">Y Position</SelectItem>
              <SelectItem value="in-tow-out-tow">In-tow & Out-tow</SelectItem>
              <SelectItem value="placeholder1">placeholder1</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      <fieldset className="grid gap-6 rounded-lg border p-4">
        <legend className="-ml-1 px-1 text-base font-medium">
          Customizations
        </legend>
        <div className="grid gap-3">
          <Label htmlFor="x-axis">X Axis</Label>
          <Combobox
            options={columnOptions}
            value={xAxisColumn}
            onSelect={setXAxisColumn}
            placeholder="Select a column..."
          />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="y-axis">Y Axis</Label>
          <Combobox
            options={columnOptions}
            value={yAxisColumn}
            onSelect={setYAxisColumn}
            placeholder="Select a column..."
          />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="split-by">Split By</Label>
          <Combobox
            options={columnOptions}
            value={splitByColumn}
            onSelect={setSplitByColumn}
            placeholder="Select a column..."
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => toggleWindow('custom-plot')}
        >
          Toggle Custom Plot Window
        </Button>
      </fieldset>
    </form>
  )
}