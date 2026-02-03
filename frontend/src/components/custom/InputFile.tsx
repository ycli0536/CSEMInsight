import axios from 'axios';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";

import type { CsemData, DatasetRole, GeometryData } from "@/types";
import { useDataTableStore, useSettingFormStore } from "@/store/settingFormStore";
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { CustomAlertDialog } from '@/components/custom/CustomAlertDialog';
import { getTxRxData } from "@/services/extractTxRxPlotData";

export function InputFile() {
    const {
        datasets,
        addDataset,
        setPrimaryDataset,
        resetAllFilters,
    } = useDataTableStore();
    const { setDataFiles } = useSettingFormStore();
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
                    const isFirst = datasets.size === 0 && index === 0;
                    const role: DatasetRole = isFirst ? 'primary' : 'compared';
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
                        role,
                        uploadTime: new Date(),
                    };
                });

                // Reset all filters (AG Grid and control panel) before adding new datasets
                resetAllFilters();

                parsedDatasets.forEach((dataset) => addDataset(dataset));

                const referenceDataset = parsedDatasets[0];
                if (referenceDataset) {
                    // Use the unified switching logic
                    // This ensures filters are reset/restored correctly and all store state is synced.
                    setPrimaryDataset(referenceDataset.id);
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
        if (datasets.size === 0) return "Click to upload or drag and drop data file here";
        const files = Array.from(datasets.values()).map(d => d.name);

        if (files.length <= 2) {
            return (
                <div className="w-full px-2 truncate text-center" title={files.join(", ")}>
                    {files.join(", ")}
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center p-2 w-full overflow-hidden">
                <span className="font-semibold text-primary">{files.length} files selected</span>
                <span
                    className="text-xs text-muted-foreground mt-1 w-full truncate text-center"
                    title={files.slice(0, 2).join(", ") + ` +${files.length - 2} more`}
                >
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
