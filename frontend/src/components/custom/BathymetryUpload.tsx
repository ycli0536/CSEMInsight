import axios from 'axios';
import { Button, FileTrigger, DropZone } from "react-aria-components";
import type { FileDropItem } from "react-aria";
import { useState } from 'react';
import { useBathymetryStore, BathymetryData } from '@/store/settingFormStore';

export function BathymetryUpload() {
    const [bathymetryFile, setBathymetryFile] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { setBathymetryData } = useBathymetryStore();

    const handleBathymetryUpload = (files: File[]) => {
        if (files.length === 0) return;
        
        setIsUploading(true);
        const formData = new FormData();
        files.forEach((file, index) => {
            formData.append(`file${index}`, file);
        });

        axios.post('http://127.0.0.1:3354/api/upload-bathymetry', formData)
        .then(response => {
            console.log('Bathymetry response: ', response);
            const bathymetryData: BathymetryData = {
                inline_distance: response.data.inline_distance,
                depth: response.data.depth,
                num_points: response.data.num_points,
                distance_range: response.data.distance_range,
                depth_range: response.data.depth_range
            };
            setBathymetryData(bathymetryData);
            setBathymetryFile(files[0].name);
            alert(`Bathymetry data uploaded successfully! ${response.data.num_points} points loaded.`);
        })
        .catch(error => {
            console.error('Error uploading bathymetry file:', error);
            alert(`Error uploading bathymetry file: ${error.response?.data?.error || error.message}`);
        })
        .finally(() => {
            setIsUploading(false);
        });
    };

    const clearBathymetryData = () => {
        setBathymetryData(null);
        setBathymetryFile(null);
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
                    <Button
                        className="h-[40px] px-4 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg whitespace-nowrap"
                        onPress={clearBathymetryData}
                    >
                        Clear Data
                    </Button>
                )}
            </div>
        </div>
    );
} 