import { lazy, Suspense, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { BathymetryWidget } from "@/components/custom/BathymetryWidget";
import { SettingForm } from "@/components/custom/SettingForm";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import type { WindowId } from "@/types";

type WindowContentRendererProps = {
  type: WindowId;
};

const ResponsesWithErrorBars = lazy(() =>
  import("@/components/custom/ResponsePlot").then((mod) => ({
    default: mod.ResponsesWithErrorBars,
  }))
);

const CustomPlot = lazy(() =>
  import("@/components/custom/CustomPlot").then((mod) => ({ default: mod.CustomPlot }))
);

const MisfitStatsWindow = lazy(() =>
  import("@/components/custom/MisfitStatsWindow").then((mod) => ({ default: mod.MisfitStatsWindow }))
);

const windowContentRegistry: Record<WindowId, ComponentType> = {
  settings: SettingForm,
  "response-plot": ResponsesWithErrorBars,
  bathymetry: BathymetryWidget,
  "custom-plot": CustomPlot,
  "misfit-stats": MisfitStatsWindow,
};


const LoadingFallback = () => (
  <div className="flex h-full items-center justify-center p-8">
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading window content...</p>
    </div>
  </div>
);

export function WindowContentRenderer({ type }: WindowContentRendererProps) {
  const Content = windowContentRegistry[type];
  if (!Content) {
    return null;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <Content />
      </Suspense>
    </ErrorBoundary>
  );
}
