import axios from 'axios';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";

import { useDataTableStore,
         useSettingFormStore,
         useInv2DStore,
         CsemData,
         GeometryData,
         xyzData } from '@/store/settingFormStore';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { CustomAlertDialog } from '@/components/custom/CustomAlertDialog';
import { getTxRxData } from '@/utils/extractTxRxPlotData';

export function InputFile() {
    const {
        datasets,
        addDataset,
        setData,
        setTableData,
        setFilteredData,
        setGeometryInfo,
        setDataBlocks,
        setIsTxDepthAdjusted,
    } = useDataTableStore();
    const { setInvResult } = useInv2DStore();
    const { dataFiles, modelFiles, setDataFiles, setModelFiles } = useSettingFormStore();
    const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();

    const datasetColors = [
        '#2563eb',
        '#dc2626',
        '#16a34a',
        '#9333ea',
        '#d97706',
        '#0891b2',
        '#7c3aed',
        '#0f766e',
    ];

    const readData = (files: File[]) => {
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });

        axios.post('http://127.0.0.1:3354/api/upload-multiple-data', formData)
        .then(response => {
            console.log('response.json: ', response)
            const datasetsResponse = response.data as {
                id: string;
                name: string;
                geometryInfo: GeometryData;
                data: string;
                dataBlocks: [];
            }[];

            const parsedDatasets = datasetsResponse.map((dataset, index) => {
                const responseData: CsemData[] = JSON.parse(dataset.data).data;
                const { TxData, RxData } = getTxRxData(responseData);
                return {
                    id: dataset.id,
                    name: dataset.name,
                    data: responseData,
                    txData: TxData,
                    rxData: RxData,
                    geometryInfo: dataset.geometryInfo,
                    dataBlocks: dataset.dataBlocks,
                    color: datasetColors[(datasets.size + index) % datasetColors.length],
                    visible: true,
                    uploadTime: new Date(),
                };
            });

            parsedDatasets.forEach((dataset) => addDataset(dataset));

            const referenceDataset = parsedDatasets[0];
            if (referenceDataset) {
                setData(referenceDataset.data);
                setTableData(referenceDataset.data);
                setFilteredData(referenceDataset.data);
                setDataBlocks(referenceDataset.dataBlocks);
                setGeometryInfo(referenceDataset.geometryInfo);
                // Reset Tx depth adjustment state when loading new data
                setIsTxDepthAdjusted(false);
            }

            showAlert(
                'Data Upload Successful',
                'CSEM data uploaded and processed successfully! (only can show reciprocity applied data correctly for now)',
                'success'
            );
        })
        .catch(error => {
            console.error('Error uploading file:', error);
            showAlert(
                'Data Upload Error',
                `Error uploading file (backend processing): ${error.response.data.error}. Unsupported or wrong file format.`,
                'error'
            );
        });
    }

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
            Promise.all(files.map(file => file.getFile())).then(resolvedFiles => {
                readData(resolvedFiles);
            });
        }}
        >
        <FileTrigger
            allowsMultiple
            acceptedFileTypes={[".data", ".emdata"]}
            onSelect={(e) => {
                if (e) {
                    const files = Array.from(e);
                    const filenames = files.map((file) => file.name);
                    setDataFiles(filenames.join(", "));
                    readData(files);
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

<CustomAlertDialog 
    alertState={alertState}
    onClose={hideAlert}
    onConfirm={handleConfirm}
/>
</div>
)
}
