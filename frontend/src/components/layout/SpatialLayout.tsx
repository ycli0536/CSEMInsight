import { Activity, Settings, Table, Waves, LineChart } from "lucide-react";
import { useWindowStore } from "@/store/windowStore";
import MapSubstrate from "@/components/layout/MapSubstrate";
import { WindowManager } from "@/components/layout/WindowManager";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WindowId } from "@/types/window";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function SpatialLayout() {
  const { toggleWindow, windows } = useWindowStore();

  const navItems = [
    { id: "settings", icon: Settings, label: "Settings" },
    { id: "data-table", icon: Table, label: "Data" },
    { id: "response-plot", icon: Activity, label: "Response" },
    { id: "bathymetry", icon: Waves, label: "Bathymetry" },
    { id: "custom-plot", icon: LineChart, label: "Plot" },
  ] as const;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
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
          <div className="ml-2 border-l pl-2">
            <ThemeToggle />
          </div>
        </nav>
      </header>
    </div>
  );
}
