import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { appTheme, colors } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "light" | "classic";

const THEME_KEY = "warehouse.theme.mode";

export const classicTheme = {
  bg: colors.bg,
  surface: colors.surface,
  surfaceSoft: colors.surfaceHi,
  surfaceLavender: colors.surfaceHi,
  border: colors.border,
  text: colors.textPrimary,
  muted: colors.textSecondary,
  primary: colors.morning,
  primaryDark: colors.bg,
  primaryDeep: colors.bg,
  purpleSoft: colors.morningBg,
  green: colors.success,
  greenSoft: colors.leaveBg,
  yellow: colors.warning,
  yellowSoft: "rgba(255,159,10,0.14)",
  red: colors.danger,
  redSoft: "rgba(255,59,48,0.12)",
  blue: "#0A84FF",
  blueSoft: "rgba(10,132,255,0.14)",
  shadow: "rgba(0,0,0,0.34)",
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
