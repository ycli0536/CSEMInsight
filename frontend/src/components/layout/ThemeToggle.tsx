import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const nextTheme =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  const icon =
    theme === "system" ? (
      <Monitor className="h-4 w-4" />
    ) : resolvedTheme === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  const label =
    theme === "system"
      ? `Theme: system (${resolvedTheme})`
      : `Theme: ${resolvedTheme}`;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      title={`Switch to ${nextTheme} theme`}
      aria-label={label}
      className="h-8 w-8"
    >
      {icon}
    </Button>
  );
}
