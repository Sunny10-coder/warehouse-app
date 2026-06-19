import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { appTheme, colors } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "light" | "classic";

const THEME_KEY = "warehouse.theme.mode";

export const classicTheme = {
  bg: "rgba(0, 0, 0, 0.0)", // Transparent for gradient
  surface: "rgba(0, 0, 0, 0.4)", // Dark Glass
  surfaceHi: "rgba(0, 0, 0, 0.5)",
  surfaceSoft: "rgba(0, 0, 0, 0.25)",
  surfaceLavender: "rgba(0, 0, 0, 0.5)",
  border: "rgba(255, 255, 255, 0.15)", // Subtle edge
  text: colors.textPrimary,
  muted: "rgba(255, 255, 255, 0.6)",
  primary: "rgba(255, 214, 0, 0.9)", 
  primaryDark: colors.bg,
  primaryDeep: colors.bg,
  purpleSoft: "rgba(255, 214, 0, 0.15)",
  green: "rgba(52, 199, 89, 0.9)",
  greenSoft: "rgba(52, 199, 89, 0.15)",
  yellow: "rgba(255, 159, 10, 0.9)",
  yellowSoft: "rgba(255, 159, 10, 0.15)",
  red: "rgba(255, 59, 48, 0.9)",
  redSoft: "rgba(255, 59, 48, 0.15)",
  blue: "rgba(10, 132, 255, 0.9)",
  blueSoft: "rgba(10, 132, 255, 0.15)",
  shadow: "rgba(0, 0, 0, 0.8)",
  glassHighlight: "rgba(255, 255, 255, 0.1)", // Top/Left 3D bevel edge
} as const;

export type AppTheme = Record<keyof typeof appTheme, string>;

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: AppTheme;
  isClassic: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    storage.getItem<ThemeMode>(THEME_KEY, "light").then(value => {
      setModeState(value === "classic" ? "classic" : "light");
    });
  }, []);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    storage.setItem(THEME_KEY, nextMode);
  };

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    setMode,
    theme: mode === "classic" ? classicTheme : appTheme,
    isClassic: mode === "classic",
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeProvider");
  return ctx;
}
