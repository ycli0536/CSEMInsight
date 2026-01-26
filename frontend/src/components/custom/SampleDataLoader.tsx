import axios from "axios";
import { Button } from "@/components/ui/button";
import { useDataTableStore, CsemData, GeometryData } from "@/store/settingFormStore";
import { useSettingFormStore } from "@/store/settingFormStore";
import { useAlertDialog } from "@/hooks/useAlertDialog";
import { CustomAlertDialog } from "@/components/custom/CustomAlertDialog";
import { getTxRxData } from "@/utils/extractTxRxPlotData";

const datasetColors = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#d97706",
  "#0891b2",
  "#7c3aed",
  "#0f766e",
];

const SAMPLE_DATASETS = [
  {
    id: "spatial",
    label: "Spatial offset comparison",
    files: [
      "EMAGE_LINE2_s4IC_m_ef3.data",
      "EMAGE_LINE2_s4IC_m_ef3_offset3km.cl.data",
    ],
  },
  {
    id: "processing",
    label: "Processing version comparison",
    files: [
      "EMAGE_LINE2_s4IC_m_ef3.data",
      "EMAGE_LINE2_s4IC_m_ef4_offset3km.data",
    ],
  },
  {
    id: "multi",
    label: "Multi-dataset survey comparison",
    files: [
      "EMAGE_LINE2_s3.3_phi_m.data",
      "EMAGE_LINE2_s4F_ef3.cl.data",
      "EMAGE_LINE2_s4IC_m_ef3_offset3km.cl.data",
      "EMAGE_LINE2_s4IC_m_ef3_test.data",
      "EMAGE_LINE2_s4IC_m_ef3.data",
      "EMAGE_LINE2_s4IC_m_ef4_offset3km.data",
    ],
  },
];

export function SampleDataLoader() {
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
  const { setDataFiles } = useSettingFormStore();
  const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();

  const loadSamples = (files: string[]) => {
    axios
      .post("http://127.0.0.1:3354/api/load-sample-data", { files })
      .then((response) => {
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
        setDataFiles(files.join(", "));

        const referenceDataset = parsedDatasets[0];
        if (referenceDataset) {
          setData(referenceDataset.data);
          setTableData(referenceDataset.data);
          setFilteredData(referenceDataset.data);
          setGeometryInfo(referenceDataset.geometryInfo);
          setDataBlocks(referenceDataset.dataBlocks);
          setIsTxDepthAdjusted(false);
        }

        showAlert("Sample data loaded", "Sample datasets loaded successfully.", "success");
      })
      .catch((error) => {
        console.error("Error loading sample data:", error);
        showAlert(
          "Sample data error",
          `Error loading sample data: ${error.response?.data?.error ?? error.message}`,
          "error"
        );
      });
  };

  return (
    <div className="grid gap-3">
      <div className="text-sm font-medium">Quick-load sample datasets</div>
      <div className="grid gap-2">
        {SAMPLE_DATASETS.map((sample) => (
          <Button
            key={sample.id}
            type="button"
            variant="outline"
            onClick={() => loadSamples(sample.files)}
          >
            {sample.label}
          </Button>
        ))}
      </div>
      <CustomAlertDialog
        alertState={alertState}
        onClose={hideAlert}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
