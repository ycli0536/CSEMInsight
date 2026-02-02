import { useState, useRef, lazy, Suspense } from "react";
import { ChevronUp, ChevronDown, Table, Loader2 } from "lucide-react";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import type { ImperativePanelHandle } from "react-resizable-panels";

const DataPage = lazy(() =>
    import("@/components/custom/table-page").then((mod) => ({ default: mod.DataPage }))
);

const LoadingFallback = () => (
    <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading data table...</p>
        </div>
    </div>
);

interface BottomPanelProps {
    children: React.ReactNode;
}

// Fixed header height in pixels
const HEADER_HEIGHT = 36;

export function BottomPanel({ children }: BottomPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [expandedSize, setExpandedSize] = useState(35);
    const bottomPanelRef = useRef<ImperativePanelHandle>(null);

    const handlePanelResize = (sizes: number[]) => {
        if (sizes.length >= 2) {
            const bottomSize = sizes[1];
            // Consider panel collapsed if it's at minimum (essentially 0 for content)
            if (bottomSize < 2) {
                setIsCollapsed(true);
            } else {
                setIsCollapsed(false);
                setExpandedSize(bottomSize);
            }
        }
    };

    const toggleCollapse = () => {
        const panel = bottomPanelRef.current;
        if (!panel) return;

        if (isCollapsed) {
            panel.resize(expandedSize);
        } else {
            panel.collapse();
        }
    };

    return (
        <div className="flex flex-col h-full w-full" style={{ paddingRight: "var(--sidebar-width, 0px)" }}>
            {/* Resizable area - takes remaining space */}
            <div className="flex-1 min-h-0">
                <ResizablePanelGroup
                    direction="vertical"
                    className="h-full w-full"
                    onLayout={handlePanelResize}
                >
                    {/* Main content area */}
                    <ResizablePanel defaultSize={100} minSize={30}>
                        <div className="h-full w-full">
                            {children}
                        </div>
                    </ResizablePanel>

                    {/* Resize handle - double click to toggle */}
                    <ResizableHandle
                        withHandle
                        onDoubleClick={toggleCollapse}
                        className="cursor-row-resize"
                    />

                    {/* Bottom panel for data table content (no header here) */}
                    <ResizablePanel
                        ref={bottomPanelRef}
                        defaultSize={0}
                        minSize={0}
                        maxSize={70}
                        collapsible
                        collapsedSize={0}
                        onCollapse={() => setIsCollapsed(true)}
                        onExpand={() => setIsCollapsed(false)}
                    >
                        <div className="h-full w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-hidden">
                            <Suspense fallback={<LoadingFallback />}>
                                <DataPage />
                            </Suspense>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>

            {/* Fixed header bar - always visible at the bottom */}
            <div
                className="flex items-center justify-between px-4 border-t bg-muted/50 cursor-pointer select-none hover:bg-muted/70 transition-colors shrink-0"
                style={{ height: HEADER_HEIGHT }}
                onClick={toggleCollapse}
                onDoubleClick={toggleCollapse}
            >
                <div className="flex items-center gap-2">
                    <Table className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Data Table</span>
                    {isCollapsed ? (
                        <span className="text-xs text-muted-foreground">(click to expand)</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">(click to collapse)</span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        toggleCollapse();
                    }}
                >
                    {isCollapsed ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </Button>
            </div>
        </div>
    );
}
