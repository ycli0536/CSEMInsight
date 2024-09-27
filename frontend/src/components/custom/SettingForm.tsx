import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

import { InputFile } from "@/components/custom/InputFile";
import { Combobox } from "@/components/custom/Combobox";


// import { MultiselectList } from "@/components/custom/MultiselectList"
import { ListBoxItem, ListBox } from "@/components/custom/ListBox";

import { useSettingFormStore } from '@/store/settingFormStore';


export function SettingForm() {
    const { showData, showModel, showResiduals, freqSelected, setShowData, setShowModel, setShowResiduals, setFreqSelected } = useSettingFormStore();

    return (
      <form className="sticky w-full items-start gap-6 overflow-auto p-4 pt-0">
        <fieldset className="grid gap-6 rounded-lg border p-4">
          <legend className="-ml-1 px-1 text-base font-medium">
            Input
          </legend>
          <InputFile />
        </fieldset>
        <fieldset className="grid gap-6 rounded-lg border p-4">
          <legend className="-ml-1 px-1 text-base font-medium">
            Popular options
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid">
              <div className="flex items-center space-x-2">
                <Checkbox id="data" checked={showData} onCheckedChange={(checked) => {
                    setShowData(checked as boolean)}} />
                <label htmlFor="data"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Data
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="model" checked={showModel} onCheckedChange={(checked) => {
                    setShowModel(checked as boolean)}} />
                <label htmlFor="model"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Model
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="residuals" checked={showResiduals} onCheckedChange={(checked) => 
                    setShowResiduals(checked as boolean)} />
                    <label
                        htmlFor="residuals"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Residuals
              </label>
              </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freq">Frequencies (Hz)</Label>
                <ListBox aria-label="Freq" selectionMode="multiple" selectionBehavior="toggle"
                selectedKeys={freqSelected}
                onSelectionChange={setFreqSelected}
                autoFocus={true}
                className="h-[70px]">
                  <ListBoxItem>0.25</ListBoxItem>
                  <ListBoxItem>0.25</ListBoxItem>
                  <ListBoxItem>0.25</ListBoxItem>
                  <ListBoxItem>0.25</ListBoxItem>
                </ListBox>
              </div>
            </div>
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
          <Combobox />
          </div>
          <div className="grid gap-3">
          <Label htmlFor="y-axis">Y Axis</Label>
          <Combobox />
          </div>
          <div className="grid gap-3">
          <Label htmlFor="where">Where</Label>
          <Input id="where" type="number" placeholder="0.0" />
          </div>
          <div className="grid gap-3">
          <Label htmlFor="split">Split By</Label>
          <Combobox />
          </div>
          <div className="grid gap-3">
          <Label htmlFor="tooltip">Tooltip</Label>
          <Combobox />
          </div>
        </fieldset>
    </form>
  )
}