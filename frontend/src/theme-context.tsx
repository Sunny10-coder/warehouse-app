import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { appTheme } from "@/src/theme";

export type AppTheme = Record<keyof typeof appTheme, string>;

type ThemeContextValue = {
  theme: AppTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const value = useMemo<ThemeContextValue>(() => ({
    theme: appTheme,
  }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeProvider");
  return ctx;
}
