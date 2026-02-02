import { useState, useCallback } from "react";
import axios from "axios";
import { useDataTableStore } from "@/store/settingFormStore";

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: {
    description: string;
    accept: Record<string, string[]>;
  }[];
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker: (
    options?: SaveFilePickerOptions
  ) => Promise<FileSystemFileHandle>;
};

export type ExportStatus = "idle" | "exporting" | "success" | "error";

export interface ExportResult {
  status: ExportStatus;
  message: string;
}

export function useExportData() {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [message, setMessage] = useState("");

  const { dataBlocks, setDataFileString, data, datasets, activeTableDatasetId } = useDataTableStore();

  const hasData = data.length > 0;
  
  const activeDataset = activeTableDatasetId ? datasets.get(activeTableDatasetId) : null;
  const activeDatasetName = activeDataset?.name ?? null;
  const filteredDataCount = useDataTableStore.getState().filteredData?.length ?? 0;

  const exportData = useCallback(async (): Promise<ExportResult> => {
    if (!hasData) {
      return {
        status: "error",
        message: "No data to export. Please load a data file first.",
      };
    }

    setStatus("exporting");
    setMessage("");

    try {
      if (!("showSaveFilePicker" in window)) {
        throw new Error(
          "File System Access API is not supported in this browser. Please use Chrome or Edge."
        );
      }

      const currentDataset = activeTableDatasetId 
        ? useDataTableStore.getState().datasets.get(activeTableDatasetId) 
        : null;
      const suggestedName = currentDataset?.name 
        ? `${currentDataset.name.replace(/\.[^/.]+$/, "")}_export.data`
        : "export.data";

      const fileHandle = await (window as SaveFilePickerWindow).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "MARE2DEM Data Files",
            accept: {
              "application/octet-stream": [".data", ".emdata"],
            },
          },
        ],
      });

      const filteredData = useDataTableStore.getState().filteredData;
      const content = JSON.stringify(filteredData);

      const response = await axios.post(
        "http://localhost:3354/api/write-data-file",
        {
          content,
          dataBlocks,
        }
      );

      setDataFileString(response.data);

      if (response.data) {
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(response.data);
        await writableStream.close();
      }

      const exportedCount = filteredData?.length ?? 0;
      setStatus("success");
      setMessage(`Exported ${exportedCount} records`);
      
      return {
        status: "success",
        message: `Exported ${exportedCount} records`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save the file.";
      
      if (errorMessage.includes("user aborted") || errorMessage.includes("AbortError")) {
        setStatus("idle");
        setMessage("");
        return { status: "idle", message: "" };
      }

      setStatus("error");
      setMessage(errorMessage);
      
      return {
        status: "error",
        message: errorMessage,
      };
    }
  }, [hasData, dataBlocks, setDataFileString, activeTableDatasetId]);

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setMessage("");
  }, []);

  return {
    exportData,
    status,
    message,
    hasData,
    resetStatus,
    activeDatasetName,
    filteredDataCount,
  };
}
