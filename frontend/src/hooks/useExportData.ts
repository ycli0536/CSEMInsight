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

  const { dataBlocks, setDataFileString, data } = useDataTableStore();

  const hasData = data.length > 0;

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

      const fileHandle = await (window as SaveFilePickerWindow).showSaveFilePicker({
        suggestedName: "myDataFile.data",
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

      setStatus("success");
      setMessage("File saved successfully! (Only supports EMData_2.2 format)");
      
      return {
        status: "success",
        message: "File saved successfully! (Only supports EMData_2.2 format)",
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
  }, [hasData, dataBlocks, setDataFileString]);

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
  };
}
