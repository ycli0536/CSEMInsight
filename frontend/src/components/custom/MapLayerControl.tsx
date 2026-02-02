import { useState } from "react";
import { MapLayerKey } from "@/lib/mapLayers";
import { useSettingFormStore } from "@/store/settingFormStore";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Globe,
    Map,
    Mountain,
    Layers as LayersIcon,
    Plus,
    Minus,
    Scan,
    Layers,
    Check
} from "lucide-react";
import { cn } from "@/lib/utils";

// Map layer configuration with icons
const layerOptions: { key: MapLayerKey; icon: typeof Globe; label: string }[] = [
    { key: "satellite", icon: Globe, label: "Satellite" },
    { key: "bathymetry-ocean", icon: LayersIcon, label: "Ocean Bathymetry" },
    { key: "topographic", icon: Mountain, label: "Topographic" },
    { key: "osm-standard", icon: Map, label: "OpenStreetMap" },
];

// Custom hook to access the Leaflet map instance
const useMapZoom = () => {
    const zoomIn = () => {
        window.dispatchEvent(new CustomEvent('map-zoom', { detail: { direction: 'in' } }));
    };

    const zoomOut = () => {
        window.dispatchEvent(new CustomEvent('map-zoom', { detail: { direction: 'out' } }));
    };

    return { zoomIn, zoomOut };
};

export function MapLayerControl() {
    const { mapLayer, setMapLayer, triggerRecenter } = useSettingFormStore();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { zoomIn, zoomOut } = useMapZoom();

    // Find current layer info
    const currentLayer = layerOptions.find(l => l.key === mapLayer) || layerOptions[0];

    return (
        <div
            className="absolute top-[4.5rem] left-4 z-[1000] flex flex-col gap-2"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {/* Zoom & Navigation Controls */}
            <div className="flex flex-col bg-background/90 backdrop-blur-sm rounded-lg shadow-lg border border-border overflow-hidden">
                {/* Zoom In */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none border-b border-border/30 hover:bg-accent"
                    onClick={zoomIn}
                    aria-label="Zoom in"
                >
                    <Plus className="h-4 w-4" />
                </Button>

                {/* Zoom Out */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none border-b border-border/30 hover:bg-accent"
                    onClick={zoomOut}
                    aria-label="Zoom out"
                >
                    <Minus className="h-4 w-4" />
                </Button>

                {/* Recenter */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none hover:bg-accent"
                    onClick={triggerRecenter}
                    aria-label="Recenter Map"
                >
                    <Scan className="h-4 w-4" />
                </Button>
            </div>

            {/* Base Layer Selection - Separate Button Group */}
            <div className="flex flex-col bg-background/90 backdrop-blur-sm rounded-lg shadow-lg border border-border overflow-hidden">
                <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <span className="flex outline-none" tabIndex={-1}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-8 w-8 rounded-none hover:bg-accent",
                                            isDropdownOpen && "bg-accent"
                                        )}
                                        aria-label="Map Layers"
                                    >
                                        <Layers className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                {!isDropdownOpen && (
                                    <TooltipContent
                                        side="right"
                                        sideOffset={8}
                                        className="z-[9999] bg-popover text-popover-foreground border-border shadow-md"
                                    >
                                        <p>Base Layer: {currentLayer.label}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </span>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={8}
                        className="min-w-[160px]"
                    >
                        {layerOptions.map((layer) => {
                            const LayerIcon = layer.icon;
                            const isActive = mapLayer === layer.key;
                            return (
                                <DropdownMenuItem
                                    key={layer.key}
                                    onClick={() => setMapLayer(layer.key)}
                                    className={cn(
                                        "flex items-center gap-2 cursor-pointer",
                                        isActive && "bg-accent"
                                    )}
                                >
                                    <LayerIcon className="h-4 w-4" />
                                    <span className="flex-1">{layer.label}</span>
                                    {isActive && <Check className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
