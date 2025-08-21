import axios from 'axios';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";
import { useState } from 'react';
import { useBathymetryStore, BathymetryData, useDataTableStore } from '@/store/settingFormStore';
import { adjustTxDepthsToBathymetry } from '@/utils/depthAdjustment';
import { updateCsemDataWithAdjustedTx, revertCsemDataToOriginalTx } from '@/utils/updateCsemData';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { CustomAlertDialog } from '@/components/custom/CustomAlertDialog';

export function BathymetryUpload() {
    const [bathymetryFile, setBathymetryFile] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { bathymetryData, setBathymetryData } = useBathymetryStore();
    const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();
    const { 
        data,
        txData, 
        originalTxData, 
        isTxDepthAdjusted, 
        setData,
        setTxData, 
        setOriginalTxData, 
        setIsTxDepthAdjusted,
        setTableData,
        setFilteredData
    } = useDataTableStore();

    const handleBathymetryUpload = (files: File[]) => {
        if (files.length === 0) return;
        
        setIsUploading(true);
        const formData = new FormData();
        files.forEach((file, index) => {
            formData.append(`file${index}`, file);
        });

        axios.post('http://127.0.0.1:3354/api/upload-bathymetry', formData)
        .then(response => {
            // console.log('Bathymetry response: ', response);
            const bathymetryData: BathymetryData = {
                inline_distance: response.data.inline_distance,
                depth: response.data.depth,
                num_points: response.data.num_points,
                distance_range: response.data.distance_range,
                depth_range: response.data.depth_range
            };
            setBathymetryData(bathymetryData);
            setBathymetryFile(files[0].name);
            showAlert(
                'Bathymetry Upload Successful',
                `Bathymetry data uploaded successfully!\n${response.data.num_points} points loaded.`,
                'success'
            );
        })
        .catch(error => {
            // console.error('Error uploading bathymetry file:', error);
            showAlert(
                'Bathymetry Upload Error',
                `Error uploading bathymetry file: ${error.response?.data?.error || error.message}`,
                'error'
            );
        })
        .finally(() => {
            setIsUploading(false);
        });
    };

    const clearBathymetryData = () => {
        setBathymetryData(null);
        setBathymetryFile(null);
        // Revert Tx depths if they were adjusted
        if (isTxDepthAdjusted && originalTxData.length > 0) {
            // Revert Tx data for plotting
            setTxData(originalTxData);
            
            // Revert main CSEM data for export functionality
            const revertedCsemData = revertCsemDataToOriginalTx(data, originalTxData);
            setData(revertedCsemData);
            setTableData(revertedCsemData);
            setFilteredData(revertedCsemData);
            
            setIsTxDepthAdjusted(false);
        }
    };

    const adjustTxDepths = () => {
        if (!bathymetryData || txData.length === 0) {
            showAlert(
                'Missing Data',
                'Please ensure both CSEM data and bathymetry data are loaded.',
                'warning'
            );
            return;
        }

        // Store original data if not already stored (use current txData as fallback)
        let sourceData = originalTxData;
        if (originalTxData.length === 0) {
            // console.log('Storing original Tx data from current txData:', txData);
            setOriginalTxData([...txData]);
            sourceData = txData; // Use current data for this adjustment
        }
        
        // console.log('Source data for adjustment:', sourceData);
        
        // Adjust Tx depths based on bathymetry
        const adjustedTx = adjustTxDepthsToBathymetry(sourceData, bathymetryData, 0.1);
        // console.log('Adjusted Tx data:', adjustedTx);
        // console.log('Comparison - Original Z_tx:', sourceData.map(tx => tx.Z_tx));
        // console.log('Comparison - Adjusted Z_tx:', adjustedTx.map(tx => tx.Z_tx));
        
        // Calculate depth changes for user awareness
        const depthChanges = adjustedTx.map((tx, index) => 
            Math.abs(tx.Z_tx - sourceData[index].Z_tx)
        );
        const maxDepthChange = Math.max(...depthChanges);
        const avgDepthChange = depthChanges.reduce((sum, change) => sum + change, 0) / depthChanges.length;
        
        // Update Tx data for plotting
        setTxData(adjustedTx);
        
        // Update main CSEM data for export functionality
        const updatedCsemData = updateCsemDataWithAdjustedTx(data, adjustedTx);
        setData(updatedCsemData);
        setTableData(updatedCsemData);
        setFilteredData(updatedCsemData);
        
        setIsTxDepthAdjusted(true);
        
        // Show informative alert about bathymetry adjustments
        showAlert(
            'Tx Depths Adjusted Successfully',
            `📊 Depth Changes:\n` +
            `• Maximum change: ${maxDepthChange.toFixed(1)}m\n` +
            `• Average change: ${avgDepthChange.toFixed(1)}m\n\n` +
            `⚠️ IMPORTANT NOTICE:\n` +
            `This adjustment can only accept small changes of the bathymetry comparing to original bathymetry. ` +
            `If you change too much, please be careful about potential unexpected navigation uncertainties ` +
            `because it will affect the estimate of antenna dipole center (Rx here if reciprocity applied).\n\n` +
            `💡 Recommendation: Review the orange (original) vs red (adjusted) positions in the plot to ` +
            `ensure changes are ok for you.`,
            'warning'
        );
    };

    const revertTxDepths = () => {
        if (originalTxData.length > 0) {
            // Revert Tx data for plotting
            setTxData(originalTxData);
            
            // Revert main CSEM data for export functionality
            const revertedCsemData = revertCsemDataToOriginalTx(data, originalTxData);
            setData(revertedCsemData);
            setTableData(revertedCsemData);
            setFilteredData(revertedCsemData);
            
            setIsTxDepthAdjusted(false);
        }
    };

    return (
        <div className="grid gap-4 rounded-lg border p-4">
            <div className="text-center">
                <h3 className="text-lg font-medium">Bathymetry Data</h3>
                <p className="text-sm text-muted-foreground">
                    Upload a text file with inline distance and depth data (two columns)
                </p>
            </div>
            
            <div className="flex gap-2">
                <DropZone
                    className="h-[40px] text-base text-center justify-center border-dashed border-2 rounded-lg flex items-center flex-1"
                    onDrop={(e) => {
                        const files = e.items.filter(
                            (file) => file.kind === "file"
                        ) as FileDropItem[];
                        const fileObjects = files.map(item => item.getFile());
                        Promise.all(fileObjects).then(handleBathymetryUpload);
                    }}
                >
                    <FileTrigger
                        acceptedFileTypes={[".txt"]}
                        onSelect={(e) => {
                            if (e) {
                                const files = Array.from(e);
                                setBathymetryFile(files[0].name);
                                handleBathymetryUpload(files);
                            }
                        }}
                    >
                        <Button
                            className="h-full w-full border-none bg-background hover:bg-accent hover:text-accent-foreground
                                flex items-center justify-center whitespace-normal rounded-md text-sm font-medium 
                                ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 
                                focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                            isDisabled={isUploading}
                        >
                            {isUploading 
                                ? "Uploading..." 
                                : bathymetryFile 
                                    ? `Loaded: ${bathymetryFile}` 
                                    : "Click to upload or drag and drop bathymetry file (.txt)"
                            }
                        </Button>
                    </FileTrigger>
                </DropZone>

                {bathymetryFile && (
                    <div className="flex gap-1">
                        <Button
                            className="h-[40px] px-3 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg whitespace-nowrap"
                            onPress={isTxDepthAdjusted ? revertTxDepths : adjustTxDepths}
                            isDisabled={!bathymetryData || txData.length === 0}
                        >
                            {isTxDepthAdjusted ? 'Revert Tx' : 'Adjust Tx'}
                        </Button>
                        <Button
                            className="h-[40px] px-3 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg whitespace-nowrap"
                            onPress={clearBathymetryData}
                        >
                            Clear
                        </Button>
                    </div>
                )}
            </div>
            
            {bathymetryFile && (
                <div className="text-xs mt-2">
                    {isTxDepthAdjusted 
                        ? (
                            <div className="space-y-1">
                                <div className="text-green-600 font-medium">
                                    ✓ Tx depths adjusted to bathymetry (-0.1m offset)
                                </div>
                                <div className="text-amber-600">
                                    ⚠️ Large depth changes may affect navigation uncertainties
                                </div>
                            </div>
                        )
                        : (
                            <div className="text-muted-foreground">
                                Click "Adjust Tx" to position transmitters based on bathymetry
                            </div>
                        )
                    }
                </div>
            )}
            
            <CustomAlertDialog 
                alertState={alertState}
                onClose={hideAlert}
                onConfirm={handleConfirm}
            />
        </div>
    );
} 