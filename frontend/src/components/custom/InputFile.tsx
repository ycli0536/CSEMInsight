import axios from 'axios';
import { useState } from 'react';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";

import { useDataTableStore, CsemData, GeometryData,
    useInv2DStore, xyzData } from '@/store/settingFormStore';

export function InputFile() {
    const { setData, setGeometryInfo } = useDataTableStore();
    const { setInvResult } = useInv2DStore();
    const [dataFiles, setDataFiles] = useState<string | null>(null);
    const [modelFiles, setModelFiles] = useState<string | null>(null);

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
            setDataFiles(filenames.join(", "));
        }}
        >
        <FileTrigger
            // allowsMultiple
            acceptedFileTypes={[".data", ".emdata"]}
            onSelect={(e) => {
            if (e) {
                const files = Array.from(e);
                const filenames = files.map((file) => file.name);
                setDataFiles(filenames.join(", "));
                const formData = new FormData();
                files.forEach((file, index) => {
                    formData.append(`file${index}`, file);
                });

                axios.post('http://127.0.0.1:3354/api/upload-data', formData)
                .then(response => {
                        console.log('response.json: ', response)
                        const geomtryData: GeometryData = response.data[0];
                        const responseData: CsemData[] = JSON.parse(response.data[1]).data;
                        console.log('responseData', responseData)
                        setData(responseData);
                        setGeometryInfo(geomtryData);
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
            >{dataFiles || "Click to upload or drag and drop data file here"}
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
        setModelFiles(filenames.join(", "));
    }}
    >
    <FileTrigger
        // allowsMultiple
        acceptedFileTypes={[".xyz"]}
        onSelect={(e) => {
        if (e) {
            const files = Array.from(e);
            const filenames = files.map((file) => file.name);
            setModelFiles(filenames.join(", "));
            const formData = new FormData();
            files.forEach((file, index) => {
                formData.append(`file${index}`, file);
            });

            axios.post('http://127.0.0.1:3354/api/upload-xyz', formData)
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
        >{modelFiles || "Click to upload or drag and drop inv model file here"}
        </Button>
        
    </FileTrigger>
</DropZone>
</div>
)
}
