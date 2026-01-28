import { MapLayerKey } from "@/lib/mapLayers";
import { useSettingFormStore } from "@/store/settingFormStore";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Globe, Map, Mountain, Layers } from "lucide-react";

export function MapLayerControl() {
    const { mapLayer, setMapLayer } = useSettingFormStore();

    return (
        <div
            className="absolute top-[4.5rem] left-16 z-[1000] bg-background/80 backdrop-blur-sm rounded-lg shadow-md border border-border p-1"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onScroll={(e) => e.stopPropagation()}
        >
            <ToggleGroup
                type="single"
                value={mapLayer}
                onValueChange={(value) => {
                    if (value) setMapLayer(value as MapLayerKey);
                }}
                size="sm"
                variant="outline"
                className="gap-1"
            >
                <ToggleGroupItem value="satellite" aria-label="Satellite">
                    <Globe className="h-4 w-4 mr-2" />
                    <span className="text-xs">Sat</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="bathymetry-ocean" aria-label="Ocean Bathymetry">
                    <Layers className="h-4 w-4 mr-2" />
                    <span className="text-xs">Ocean</span>
                </ToggleGroupItem>

                <ToggleGroupItem value="topographic" aria-label="Topographic">
                    <Mountain className="h-4 w-4 mr-2" />
                    <span className="text-xs">Topo</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="osm-standard" aria-label="OSM Standard">
                    <Map className="h-4 w-4 mr-2" />
                    <span className="text-xs">OSM</span>
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}
