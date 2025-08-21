import {
    Settings,
  } from "lucide-react"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
  } from "@/components/ui/resizable"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
  } from "@/components/ui/sheet"
import { SettingForm } from "@/components/custom/SettingForm"
import { Button } from "@/components/ui/button"

import { DataPage } from "@/components/custom/table-page"
import { ResponsesWithErrorBars } from "@/components/custom/ResponsePlot";
import { TxRxPosPlot } from "@/components/custom/TxRxPos";
import Map from "@/components/custom/Map";
import HeatmapComponent from "@/components/custom/Heatmap";
import { BathymetryUpload } from "@/components/custom/BathymetryUpload";

export function Dashboard() {
return (
    <div className="grid h-screen w-full">
        <div className="flex flex-col gap-2 m-1">
        <header className="sticky z-10 flex h-[60px] items-center justify-between bg-background px-6 border-b shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">EM</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">CSEMInsight</h1>
                <p className="text-xs text-muted-foreground">Marine CSEM Data Visualization</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden md:flex">
              Export Report
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="size-5" />
                  <span className="sr-only">Settings</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-auto w-[425px] sm:w-[550px]" side={"left"}>
                <SheetHeader>
                  <SheetTitle>Control Panel</SheetTitle>
                  <SheetDescription>
                    Configure the settings for the CSEM data visualization.
                  </SheetDescription>
                </SheetHeader>
                <SettingForm />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <ResizablePanelGroup
            direction="horizontal"
            className="rounded-lg border"
            >
            <ResizablePanel collapsible={true} minSize={10} defaultSize={25}
            className="hidden xl:flex max-h-[calc(100vh-80px)] overflow-y-scroll">
              <SettingForm />
            </ResizablePanel>
            <ResizableHandle withHandle className="hidden md:flex"/>
            <ResizablePanel defaultSize={75}>
              <div className="flex flex-col gap-4 p-4 max-h-[calc(100vh-80px)] overflow-y-auto">
                
                {/* Data Table Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                    <h2 className="text-lg font-semibold text-foreground">Data Overview</h2>
                  </div>
                  <div className="bg-card rounded-lg border p-4 shadow-sm">
                    <h3 className="font-medium text-card-foreground mb-3">Data Table</h3>
                    <DataPage />
                  </div>
                </section>

                {/* CSEM Responses Section - Always Full Width */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-purple-600 rounded-full"></div>
                    <h2 className="text-lg font-semibold text-foreground">CSEM Responses</h2>
                  </div>
                  <div className="bg-card rounded-lg border p-4 shadow-sm">
                    <h3 className="font-medium text-card-foreground mb-3">Amplitude & Phase Analysis</h3>
                    <div className="w-full">
                      <ResponsesWithErrorBars />
                    </div>
                  </div>
                </section>

                {/* Visualization Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-green-600 rounded-full"></div>
                    <h2 className="text-lg font-semibold text-foreground">Survey Geometry</h2>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="bg-card rounded-lg border p-4 shadow-sm">
                      <h3 className="font-medium text-card-foreground mb-3">Tx/Rx Positions & Bathymetry</h3>
                      <div className="space-y-4">
                        <BathymetryUpload />
                        <div className="overflow-auto">
                          <TxRxPosPlot />
                        </div>
                      </div>
                    </div>
                    <div className="bg-card rounded-lg border p-4 shadow-sm">
                      <h3 className="font-medium text-card-foreground mb-3">Geographic Map</h3>
                      <Map />
                    </div>
                  </div>
                </section>

                {/* Results Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-orange-600 rounded-full"></div>
                    <h2 className="text-lg font-semibold text-foreground">Inversion Results</h2>
                  </div>
                  <div className="bg-card rounded-lg border p-4 shadow-sm">
                    <h3 className="font-medium text-card-foreground mb-3">Resistivity Model</h3>
                    <HeatmapComponent />
                  </div>
                </section>
                
              </div>
            </ResizablePanel>
        </ResizablePanelGroup>

        </div>
    </div>
    )
}
