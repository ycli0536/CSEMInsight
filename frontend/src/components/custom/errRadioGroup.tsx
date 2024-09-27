import {Label, Radio, RadioGroup} from 'react-aria-components';
import { CircleCheck } from 'lucide-react';
import { useRadioGroupStore } from '@/store/plotCanvasStore';


export function RadioGroupExample() {
  // Access Zustand store values and functions
  const {selectedValue, setSelectedValue} = useRadioGroupStore();

  const handleShowErr = (value: string) => {
    setSelectedValue(value);
    console.log('selectedValue', selectedValue);
  };


  return (
    <div className="flex gap-4 py-2 w-320">
      <RadioGroup
        className="flex flex-row gap-2 max-w-[1000px]"
        aria-label='Shipping Options'
        defaultValue="Error Bars"
        value={selectedValue}
        onChange={handleShowErr}
        // isDisabled
      >
        <Label className="text-xl text-primary font-semibold content-center">
          Errors
        </Label>
        <Option
          name="Error Bars"
          descr="Most wanted chart but slow for too many curves"
        />
        <Option
          name="High-Low Bands"
          descr="Balanced option but overlaps are annoying"
        />
        <Option 
          name="No Error Bars"
          descr="Fastest :) but without showing errors"
        />
      </RadioGroup>
    </div>
  );
}

function Option({ name, descr }: {name: string, descr: string}) {
  return (
    <Radio
      value={name}
      className={({ isFocusVisible, isSelected, isPressed, isDisabled }) => `
      group relative flex cursor-pointer rounded-lg px-3 py-2 shadow-lg outline-none bg-clip-padding border border-solid
      ${
        isFocusVisible && !isDisabled
          ? 'ring-2 ring-primary ring-offset-1 ring-offset-white/80'
          : ''
      }
      ${
        isSelected && !isDisabled
          ? 'bg-primary border-white/30 text-white'
          : 'border-transparent'
      }
      ${isPressed && !isSelected && !isDisabled? 'bg-primary-foreground' : ''}
      ${!isSelected && !isPressed && !isDisabled? 'bg-white' : ''}
      ${isDisabled ? 'bg-gray-100 cursor-auto' : ''}
    `}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center shrink-0 text-gray-600 group-selected:text-white group-disabled:text-gray-400 group-disabled:bg-gray-100">
          <CircleCheck />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="text-sm font-semibold text-gray-900 group-selected:text-white group-disabled:text-gray-400 group-disabled:bg-gray-100">
            {name}
          </div>
          <div className="text-sm inline text-gray-500 group-selected:text-sky-100 group-disabled:text-gray-400 group-disabled:bg-gray-100">
            {descr}
          </div>
        </div>
      </div>
    </Radio>
  );
}