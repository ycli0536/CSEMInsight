import { Activity, Settings, Waves, LineChart, BarChart3, Download } from "lucide-react";
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

          <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight">CSEMInsight</span>
            </div>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isOpen = windows[item.id as WindowId]?.isOpen;
                return (
                  <Button
                    key={item.id}
                    variant={isOpen ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleWindow(item.id as WindowId)}
                    className={cn(
                      "gap-2 transition-all",
                      isOpen && "bg-secondary text-secondary-foreground shadow-sm"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{item.label}</span>
                  </Button>
                );
              })}
              <div className="ml-2 flex items-center gap-2 border-l pl-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Export data file"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    <p>Export data file</p>
                  </TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-border" aria-hidden="true" />
                <ThemeToggle />
              </div>
            </nav>
          </header>
        </div>
      </BottomPanel>
    </div>
  );
}
