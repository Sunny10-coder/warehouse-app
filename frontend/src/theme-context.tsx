import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { appTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "cinematic" | "light";
export type AppTheme = Record<keyof typeof appTheme, string>;

const lightTheme: AppTheme = {
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceHi: "#EEF1F5",
  surfaceSoft: "#F8F9FB",
  surfaceLavender: "#FFF1F2",
  border: "#D8DDE6",
  text: "#101217",
  muted: "#667085",
  primary: "#D71920",
  primaryDark: "#A90F16",
  primaryDeep: "#701016",
  purpleSoft: "rgba(215,25,32,0.10)",
  green: "#078C5A",
  greenSoft: "rgba(7,140,90,0.11)",
  yellow: "#B76E00",
  yellowSoft: "rgba(183,110,0,0.11)",
  red: "#D92D20",
  redSoft: "rgba(217,45,32,0.10)",
  blue: "#175CD3",
  blueSoft: "rgba(23,92,211,0.10)",
  shadow: "rgba(16,24,40,0.12)",
  glassHighlight: "rgba(255,255,255,0.92)",
};

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = "warehouse.theme.mode";

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("cinematic");

  useEffect(() => {
    storage.getItem<ThemeMode>(KEY, "cinematic").then(saved => {
      setModeState(saved === "light" ? "light" : "cinematic");
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    storage.setItem(KEY, next);
  };

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    theme: mode === "light" ? lightTheme : appTheme,
    setMode,
    toggleMode: () => setMode(mode === "light" ? "cinematic" : "light"),
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeProvider");
  return ctx;
}