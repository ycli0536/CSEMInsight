import axios from 'axios';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";

import type { CsemData, GeometryData } from "@/types";
import { useDataTableStore, useSettingFormStore } from "@/store/settingFormStore";
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { CustomAlertDialog } from '@/components/custom/CustomAlertDialog';
import { getTxRxData } from "@/services/extractTxRxPlotData";

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
    const { dataFiles, setDataFiles } = useSettingFormStore();
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

    const renderFileDisplay = () => {
        if (!dataFiles) return "Click to upload or drag and drop data file here";
        const files = dataFiles.split(", ");
        if (files.length <= 2) return dataFiles;

        return (
            <div className="flex flex-col items-center p-2">
                <span className="font-semibold text-primary">{files.length} files selected</span>
                <span className="text-xs text-muted-foreground mt-1 max-w-[240px] truncate">
                    {files.slice(0, 2).join(", ")} +{files.length - 2} more
                </span>
            </div>
        );
    };

    return (
        <div className="grid gap-6">
            <DropZone
                className="h-full min-h-[100px] text-base text-center justify-center 
                       border-dashed border-2 border-muted-foreground/25 hover:border-primary/50 transition-colors rounded-lg bg-muted/5"
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
                    acceptedFileTypes={[".data", ".emdata", ".resp"]}
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
                        className="h-full min-h-[100px] w-full border-none bg-transparent hover:bg-transparent
                  flex items-center justify-center whitespace-normal rounded-md text-sm font-medium transition-colors 
                  focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 px-4 py-8"
                    >
                        {renderFileDisplay()}
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
