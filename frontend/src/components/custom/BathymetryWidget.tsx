import { BathymetryUpload } from "@/components/custom/BathymetryUpload";
import { TxRxPosPlot } from "@/components/custom/TxRxPos";

export function BathymetryWidget() {
  return (
    <div className="space-y-4">
      <BathymetryUpload />
      <div className="overflow-auto">
        <TxRxPosPlot />
      </div>
    </div>
  );
}
