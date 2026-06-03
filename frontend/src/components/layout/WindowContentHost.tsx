import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { WindowContentRenderer } from "@/components/layout/WindowContentRenderer";
import type { WindowId, WindowState } from "@/types/window";

type SlotRegistry = Partial<Record<WindowId, HTMLDivElement | null>>;

interface WindowContentHostContextValue {
  slots: SlotRegistry;
  registerSlot: (id: WindowId, node: HTMLDivElement | null) => void;
}

const WindowContentHostContext =
  createContext<WindowContentHostContextValue | null>(null);

function useWindowContentHostContext() {
  const context = useContext(WindowContentHostContext);
  if (!context) {
    throw new Error(
      "WindowContentSlot must be used within WindowContentHostProvider",
    );
  }
  return context;
}

export function WindowContentHostProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slots, setSlots] = useState<SlotRegistry>({});

  const registerSlot = useCallback(
    (id: WindowId, node: HTMLDivElement | null) => {
      setSlots((currentSlots) => {
        if (currentSlots[id] === node) {
          return currentSlots;
        }
        return { ...currentSlots, [id]: node };
      });
    },
    [],
  );

  const contextValue = useMemo(
    () => ({ slots, registerSlot }),
    [slots, registerSlot],
  );

  return (
    <WindowContentHostContext.Provider value={contextValue}>
      {children}
    </WindowContentHostContext.Provider>
  );
}

export function WindowContentSlot({ id }: { id: WindowId }) {
  const { registerSlot } = useWindowContentHostContext();
  const slotRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerSlot(id, node);
    },
    [id, registerSlot],
  );

  return (
    <div
      ref={slotRef}
      className="h-full min-h-0 w-full"
      data-window-content-slot={id}
    />
  );
}

export function WindowContentLayer({ windows }: { windows: WindowState[] }) {
  return (
    <>
      {windows.map((window) => (
        <WindowContentMount key={window.id} window={window} />
      ))}
    </>
  );
}

function WindowContentMount({ window }: { window: WindowState }) {
  const { slots } = useWindowContentHostContext();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const slot = slots[window.id] ?? null;

  if (!hostRef.current && typeof document !== "undefined") {
    const host = document.createElement("div");
    host.className = "h-full min-h-0 w-full";
    host.dataset.windowContentHost = window.id;
    hostRef.current = host;
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !slot) {
      return;
    }

    slot.appendChild(host);
    return () => {
      if (host.parentNode === slot) {
        slot.removeChild(host);
      }
    };
  }, [slot]);

  if (!hostRef.current) {
    return null;
  }

  return createPortal(
    <WindowContentRenderer type={window.type} />,
    hostRef.current,
  );
}
