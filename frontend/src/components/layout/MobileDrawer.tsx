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
        className="h-[85vh] border-t border-border/30 bg-background/95 p-4 backdrop-blur-lg"
      >
        {activeWindow ? (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{activeWindow.title}</SheetTitle>
            </SheetHeader>
            <WindowContentRenderer type={activeWindow.type} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
