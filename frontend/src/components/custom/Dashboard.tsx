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

export function Dashboard() {
return (
    <div className="grid h-screen w-full">
        <div className="flex flex-col gap-2 m-1">
        <header className="sticky top-0 z-10 flex h-[53px] items-center gap-1 bg-background px-4">
        <h1 className="text-xl font-semibold">CSEM viz tool</h1>
        
          <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                <Settings className="size-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-auto w-[350px] sm:w-[550px]" side={"left"}>
              <SheetHeader>
                <SheetTitle>Control Panel</SheetTitle>
                <SheetDescription>
                Configure the settings for the CSEM data viz.
                </SheetDescription>
              </SheetHeader>
                <SettingForm />
            </SheetContent>
          </Sheet>
        </header>

        <ResizablePanelGroup
            direction="horizontal"
            className="rounded-lg border"
            >
            <ResizablePanel collapsible={true} minSize={8} defaultSize={25}
            className="hidden md:flex">
                <SettingForm />
            </ResizablePanel>
            <ResizableHandle withHandle className="hidden md:flex"/>
            <ResizablePanel defaultSize={75}>
              <div className="grid-flow-col items-center justify-center p-2">
                <fieldset className="grid gap-6 rounded-lg border p-2 m-0">
                  <legend className="-ml-1 px-1 text-base font-bold">
                    Data table
                  </legend>
                  <DataPage />
                </fieldset>
                <fieldset className="grid gap-6 rounded-lg border p-2 m-0">
                  <legend className="-ml-1 px-1 text-base font-bold">
                    CSEM Responses
                  </legend>
                  <div id="plot" className="w-full">
                    <ResponsesWithErrorBars />
                  </div>
                </fieldset>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <fieldset className="grid gap-6 rounded-lg border p-2 m-0">
                  <legend className="-ml-1 px-1 text-base font-bold">
                    Rx Tx positions (MARE2DEM coordinate system)
                  </legend>
                  <div id="txrxplot" className="overflow-auto">
                    <TxRxPosPlot />
                  </div>
                </fieldset>
                <fieldset className="grid gap-6 rounded-lg border p-2 m-0">
                  <legend className="-ml-1 px-1 text-base font-bold">
                    Inversion results
                  </legend>
                  <HeatmapComponent />
                </fieldset>
                </div>
                <fieldset className="grid gap-6 rounded-lg border p-2 m-0">
                  <legend className="-ml-1 px-1 text-base font-bold">
                    Rx Tx positions on Map
                  </legend>
                  <Map />
                </fieldset>
              </div>

            </ResizablePanel>
        </ResizablePanelGroup>

        </div>
    </div>
    )
}
