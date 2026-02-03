import { Activity, Settings, Waves, LineChart, BarChart3, Download, Zap, Loader2, Check, AlertCircle } from "lucide-react";
import { useWindowStore } from "@/store/windowStore";
import MapSubstrate from "@/components/layout/MapSubstrate";
import { WindowManager } from "@/components/layout/WindowManager";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WindowId } from "@/types/window";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useExportData } from "@/hooks/useExportData";
import { useEffect } from "react";
import { useAlertDialog } from "@/hooks/useAlertDialog";
import { CustomAlertDialog } from "@/components/custom/CustomAlertDialog";

export default function SpatialLayout() {
  const { toggleWindow, windows } = useWindowStore();
  const { exportData, status, message, hasData, resetStatus, activeDatasetName, filteredDataCount } = useExportData();
  const { alertState, showAlert, hideAlert, handleConfirm } = useAlertDialog();
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  const navItems = [
    { id: "settings", icon: Settings, label: "Settings" },
    { id: "response-plot", icon: Activity, label: "Response" },
    { id: "bathymetry", icon: Waves, label: "Bathymetry" },
    { id: "custom-plot", icon: LineChart, label: "Plot" },
    { id: "misfit-stats", icon: BarChart3, label: "Misfit" },
  ] as const;

  useEffect(() => {
    if (status === "error" && message) {
      showAlert("Export Failed", message, "error");
      resetStatus();
    } else if (status === "success") {
      const timer = setTimeout(resetStatus, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, message, resetStatus, showAlert]);

  const getExportIcon = () => {
    switch (status) {
      case "exporting":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "success":
        return <Check className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Download className="h-4 w-4" />;
    }
  };

  const getTooltipContent = () => {
    if (isDemoMode) {
      return <span className="text-muted-foreground">Export is disabled in demo mode</span>;
    }
    if (!hasData) {
      return <span className="text-muted-foreground">No data loaded</span>;
    }
    if (status === "success" || status === "error") {
      return <span>{message}</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">Export Data</span>
        {activeDatasetName && (
          <span className="text-xs text-muted-foreground">
            File: {activeDatasetName}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {filteredDataCount} records (filtered)
        </span>
      </div>
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <BottomPanel>
        <div className="relative h-full w-full">
          <div className="absolute inset-0 z-0">
            <MapSubstrate />
          </div>

          <WindowManager />

          <header className="fixed top-0 left-0 right-0 z-50">
            <div className="absolute inset-0 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50" />
            
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            
            <div className="relative flex h-14 items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold tracking-tight">CSEMInsight</span>
                    <span className="text-[10px] text-muted-foreground tracking-wide">Geophysical Visualization</span>
                  </div>
                </div>
              </div>

              <nav className="flex items-center gap-1">
                {navItems.map((item) => {
                  const isOpen = windows[item.id as WindowId]?.isOpen;
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isOpen ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => toggleWindow(item.id as WindowId)}
                          className={cn(
                            "gap-2 h-9 px-3 font-medium",
                            isOpen && "bg-secondary ring-1 ring-primary/20 shadow-sm"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="hidden lg:inline-block text-sm">{item.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={8} className="lg:hidden">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                <div className="mx-2 h-6 w-px bg-border" aria-hidden="true" />

                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-9 w-9 text-muted-foreground hover:text-foreground",
                          !hasData && "opacity-50 cursor-not-allowed",
                          status === "success" && "text-green-500",
                          status === "error" && "text-destructive"
                        )}
                        aria-label="Export data file"
                        onClick={exportData}
                        disabled={!hasData || status === "exporting"}
                      >
                        {getExportIcon()}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className="max-w-xs">
                      {getTooltipContent()}
                    </TooltipContent>
                  </Tooltip>
                  
                  <ThemeToggle />
                </div>
              </nav>
            </div>
          </header>
        </div>
      </BottomPanel>

      <CustomAlertDialog 
        alertState={alertState} 
        onClose={hideAlert} 
        onConfirm={handleConfirm} 
      />
    </div>
  );
}
