import { ChangeEvent, Fragment } from 'react';
import { CustomFloatingFilterProps } from 'ag-grid-react';
import { Input } from '@/components/ui/input'; // Import shadcn/ui Input


const NumberFloatingFilterComponent = ({ model, onModelChange }: CustomFloatingFilterProps) => {
    const value = (model && model.filter) || '';

    const onInput = ({ target: { value: newValue } }: ChangeEvent<HTMLInputElement>) => {
        onModelChange(
            newValue === ''
                ? null
                : {
                    ...(model || {
                        type: 'equals',
                    }),
                    filter: Number(newValue),
                }
        );
    };
    return (
        <div className="py-1.5">
            <Fragment>
                <Input
                    className='h-full py-0 ring-offset-0 ring-2 ring-inset focus-visible:ring-offset-0'
                    value={value}
                    type="number"
                    min="0"
                    onInput={onInput}
                />
            </Fragment>
        </div>
    );
};

export default NumberFloatingFilterComponent;
