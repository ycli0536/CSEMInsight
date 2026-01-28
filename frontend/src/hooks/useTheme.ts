import { useEffect, useState } from "react";
import { create } from "zustand";

type ThemePreference = "light" | "dark" | "system";

const storageKey = "cseminight-theme";

const getSystemTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(storageKey) as ThemePreference | null;
  return stored ?? "system";
};

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme: ThemePreference) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, theme);
    }
    set({ theme });
  },
}));

export function useTheme() {
  const { theme, setTheme } = useThemeStore();
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");

    onChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  const appliedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = window.document.documentElement;
    if (appliedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [appliedTheme]);

  return {
    theme,
    setTheme,
    systemTheme,
  };
}
