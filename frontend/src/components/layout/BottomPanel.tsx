import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { ChevronUp, ChevronDown, Table, Loader2 } from "lucide-react";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    const [isRaised, setIsRaised] = useState(false);
    const bottomPanelRef = useRef<ImperativePanelHandle>(null);
    const panelContentRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (panelContentRef.current?.contains(target) || headerRef.current?.contains(target)) {
                return;
            }
            setIsRaised(false);
        };

        window.addEventListener("pointerdown", handlePointerDown);
        return () => window.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    const raisePanel = () => {
        setIsRaised(true);
    };

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
                        onPointerDown={(event) => {
                            event?.stopPropagation();
                            raisePanel();
                        }}
                        className={cn(
                            "cursor-row-resize relative",
                            isRaised ? "z-20" : "z-0",
                        )}
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
                        <div
                            ref={panelContentRef}
                            className={cn(
                                "h-full w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-hidden border-t border-border/50",
                                "relative",
                                isRaised ? "z-20" : "z-0",
                            )}
                            onPointerDown={raisePanel}
                        >
                            <Suspense fallback={<LoadingFallback />}>
                                <DataPage />
                            </Suspense>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>

            {/* Fixed header bar - always visible at the bottom */}
            <div
                ref={headerRef}
                className={cn(
                    "flex items-center justify-between px-4 border-t cursor-pointer select-none shrink-0 transition-all duration-200",
                    "bg-background/80 backdrop-blur-sm hover:bg-muted/50",
                    !isCollapsed && "bg-muted/30",
                    "relative",
                    isRaised ? "z-20" : "z-0",
                )}
                style={{ height: HEADER_HEIGHT }}
                onClick={toggleCollapse}
                onDoubleClick={toggleCollapse}
                onPointerDown={raisePanel}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                        !isCollapsed && "bg-primary/10"
                    )}>
                        <Table className={cn(
                            "h-3.5 w-3.5 transition-colors",
                            isCollapsed ? "text-muted-foreground" : "text-primary"
                        )} />
                    </div>
                    <span className="text-sm font-medium">Data Table</span>
                    <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full transition-colors",
                        isCollapsed 
                            ? "text-muted-foreground bg-muted" 
                            : "text-primary/80 bg-primary/10"
                    )}>
                        {isCollapsed ? "collapsed" : "expanded"}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
