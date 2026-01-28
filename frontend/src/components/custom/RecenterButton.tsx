import { useSettingFormStore } from "@/store/settingFormStore";
import { Button } from "@/components/ui/button";
import { Scan } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export function RecenterButton() {
    const { triggerRecenter } = useSettingFormStore();

    return (
        <div className="absolute top-[4.5rem] left-4 z-[1000]">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 bg-background/80 backdrop-blur-sm shadow-md"
                        onClick={triggerRecenter}
                        aria-label="Recenter Map"
                    >
                        <Scan className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                    <p>Recenter Map</p>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}
