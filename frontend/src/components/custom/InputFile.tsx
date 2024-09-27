import axios from 'axios';
import { useState } from 'react';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";

import { useDataTableStore, CsemData,
    useInv2DStore, xyzData } from '@/store/settingFormStore';

export function InputFile() {
    const { setData } = useDataTableStore();
    const { setInvResult } = useInv2DStore();
    const [files, setFiles] = useState<string | null>(null);
        
return (
    <div className="grid gap-6 rounded-lg border p-4">
    <DropZone
        className="h-full text-base text-center justify-center 
                   border-dashed border-2 rounded-lg"
        onDrop={(e) => {
            const files = e.items.filter(
            (file) => file.kind === "file"
            ) as FileDropItem[];
            const filenames = files.map((file) => file.name);
            setFiles(filenames.join(", "));
        }}
        >
        <FileTrigger
            allowsMultiple
            onSelect={(e) => {
            if (e) {
                const files = Array.from(e);
                const filenames = files.map((file) => file.name);
                setFiles(filenames.join(", "));
                const formData = new FormData();
                files.forEach((file, index) => {
                    formData.append(`file${index}`, file);
                });

                axios.post('http://127.0.0.1:5000/upload-data', formData)
                .then(response => {
                        console.log('response.json: ', response)
                        const responseData: CsemData[] = JSON.parse(response.data).data;
                        console.log('responseData', responseData)
                        setData(responseData);
                })
                .catch(error => console.error('Error uploading file:', error));
                
                // console.log('test: ', dataItems.filter((item) => item.type === '24'));
            }
            }}
        >
            <Button
            className="h-[100px] w-full border-none border-input bg-background hover:bg-accent hover:text-accent-foreground
              block items-center justify-center whitespace-normal rounded-md text-sm font-medium ring-offset-background transition-colors 
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >{files || "Click to upload or drag and drop files here"}
            </Button>
            
        </FileTrigger>
    </DropZone>
    <DropZone
    className="h-full text-base text-center justify-center 
               border-dashed border-2 rounded-lg"
    onDrop={(e) => {
        const files = e.items.filter(
        (file) => file.kind === "file"
        ) as FileDropItem[];
        const filenames = files.map((file) => file.name);
        setFiles(filenames.join(", "));
    }}
    >
    <FileTrigger
        allowsMultiple
        onSelect={(e) => {
        if (e) {
            const files = Array.from(e);
            const filenames = files.map((file) => file.name);
            setFiles(filenames.join(", "));
            const formData = new FormData();
            files.forEach((file, index) => {
                formData.append(`file${index}`, file);
            });

            axios.post('http://127.0.0.1:5000/upload-xyz', formData)
            .then(data => {
                console.log('xyz data: ', data)
                const invResult: xyzData[] = JSON.parse(data.data); //Dataset mode for eCharts
                // const invResult: xyzData[] = JSON.parse(data.data).data;
                console.log('inversion result: ', invResult)
                setInvResult(invResult);
            })
            .catch(error => console.error('Error uploading file:', error));
            
            // console.log('test: ', dataItems.filter((item) => item.type === '24'));
        }
        }}
    >
        <Button
        className="h-[100px] w-full border-none border-input bg-background hover:bg-accent hover:text-accent-foreground
          block items-center justify-center whitespace-normal rounded-md text-sm font-medium ring-offset-background transition-colors 
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >{files || "Click to upload or drag and drop files here"}
        </Button>
        
    </FileTrigger>
</DropZone>
</div>
)
}
