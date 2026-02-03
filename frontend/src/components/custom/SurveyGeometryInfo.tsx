import { useDataTableStore } from "@/store/settingFormStore";
import { Card } from "@/components/ui/card";
import { Compass } from "lucide-react";

export function SurveyGeometryInfo() {
    const { geometryInfo } = useDataTableStore();

    if (!geometryInfo) return null;

    return (
        <div
            className="absolute top-16 right-4 z-[1000]"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onScroll={(e) => e.stopPropagation()}
        >
            <Card className="bg-background/80 backdrop-blur-sm shadow-md border border-border p-2 min-w-[160px]">
                <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-border/50">
                    <Compass className="h-3 w-3 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Survey Geometry</span>
                </div>

                <div className="flex flex-col gap-1 text-[12px]">
                    <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Zone/Hemi</span>
                            <span className="font-medium text-foreground">{geometryInfo.UTM_zone} {geometryInfo.Hemisphere}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Strike</span>
                            <span className="font-mono text-foreground">{geometryInfo.Strike?.toFixed(1) || 0}°</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">N</span>
                            <span className="font-mono text-foreground">{geometryInfo.North?.toFixed(1) || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">E</span>
                            <span className="font-mono text-foreground">{geometryInfo.East?.toFixed(1) || 0}</span>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
