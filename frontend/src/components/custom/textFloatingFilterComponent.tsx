import { CustomFloatingFilterProps } from 'ag-grid-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"


const TextFloatingFilterComponent = ({ model, onModelChange }: CustomFloatingFilterProps) => {

    const onValueChange = (selectedValue: string) => {
        const newValue = selectedValue === 'amp' ? '28' : selectedValue === 'phi' ? '24' : '';
        onModelChange(
            newValue === ''
                ? null
                : {
                    ...(model || {
                        type: 'equals',
                    }),
                    filter: newValue,
                }
        );
    };
    return (
        <div className="py-1.5 w-[140px]">
            <Select onValueChange={onValueChange}>
                <SelectTrigger className='h-full py-0 ring-offset-0 ring-2 ring-inset focus-visible:ring-offset-0'>
                    <SelectValue placeholder="select data type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="both">Amp & Phase</SelectItem>
                    <SelectItem value="amp">Amplitude</SelectItem>
                    <SelectItem value="phi">Phase</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
};

export default TextFloatingFilterComponent;
