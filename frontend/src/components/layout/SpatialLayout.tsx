import { Activity, Settings, Waves, LineChart, BarChart3, Download, Zap } from "lucide-react";
import { useWindowStore } from "@/store/windowStore";
import MapSubstrate from "@/components/layout/MapSubstrate";
import { WindowManager } from "@/components/layout/WindowManager";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WindowId } from "@/types/window";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function SpatialLayout() {
  const { toggleWindow, windows } = useWindowStore();

  // Removed "data-table" from nav items - now in bottom panel
  const navItems = [
    { id: "settings", icon: Settings, label: "Settings" },
    { id: "response-plot", icon: Activity, label: "Response" },
    { id: "bathymetry", icon: Waves, label: "Bathymetry" },
    { id: "custom-plot", icon: LineChart, label: "Plot" },
    { id: "misfit-stats", icon: BarChart3, label: "Misfit" },
  ] as const;


  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <BottomPanel>
        {/* Map and floating windows container */}
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
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        aria-label="Export data file"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>
                      <p>Export data file</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <ThemeToggle />
                </div>
              </nav>
            </div>
          </header>
        </div>
      </BottomPanel>
    </div>
  );
}
