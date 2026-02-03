import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WindowContentRenderer } from "@/components/layout/WindowContentRenderer";
import { useWindowStore } from "@/store/windowStore";

export function MobileDrawer() {
  const { windows, activeWindowId, toggleWindow } = useWindowStore();
  const activeWindow = activeWindowId ? windows[activeWindowId] : null;
  const isOpen = Boolean(activeWindowId && activeWindow?.isOpen);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && activeWindowId) {
          toggleWindow(activeWindowId);
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="h-[85vh] border-t border-border/30 bg-background/95 p-4 backdrop-blur-lg flex flex-col"
      >
        {activeWindow ? (
          <>
            <SheetHeader className="mb-4 shrink-0">
              <SheetTitle>{activeWindow.title}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WindowContentRenderer type={activeWindow.type} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
