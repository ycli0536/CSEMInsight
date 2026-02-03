import { useState, useCallback } from "react";
import axios from "axios";
import { useDataTableStore } from "@/store/settingFormStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

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

const isTauri = () => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

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
      const currentDataset = activeTableDatasetId 
        ? useDataTableStore.getState().datasets.get(activeTableDatasetId) 
        : null;
      const suggestedName = currentDataset?.name 
        ? `${currentDataset.name.replace(/\.[^/.]+$/, "")}_export.data`
        : "export.data";

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
        if (isTauri()) {
          const filePath = await save({
            defaultPath: suggestedName,
            filters: [
              {
                name: "MARE2DEM Data Files",
                extensions: ["data", "emdata"],
              },
            ],
          });

          if (filePath) {
            await writeTextFile(filePath, response.data);
          } else {
            setStatus("idle");
            setMessage("");
            return { status: "idle", message: "" };
          }
        } else {
          if (!("showSaveFilePicker" in window)) {
            throw new Error(
              "File System Access API is not supported in this browser. Please use Chrome or Edge."
            );
          }

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

          const writableStream = await fileHandle.createWritable();
          await writableStream.write(response.data);
          await writableStream.close();
        }
      }

      const exportedCount = filteredData?.length ?? 0;
      setStatus("success");
      setMessage(`Exported ${exportedCount} records`);
      
      return {
        status: "success",
        message: `Exported ${exportedCount} records`,
      };
    } catch (error) {
      let errorMessage = "Failed to save the file.";
      
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
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
