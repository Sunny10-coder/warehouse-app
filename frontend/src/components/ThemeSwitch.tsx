import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { ThemeMode, useThemeMode } from "@/src/theme-context";

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, theme, isClassic } = useThemeMode();
  const options: Array<{ key: ThemeMode; label: string }> = [
    { key: "light", label: "Light" },
    { key: "classic", label: "Classic" },
  ];

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.surfaceSoft, borderColor: theme.border },
        compact && styles.wrapCompact,
      ]}
    >
      {options.map(option => {
        const active = mode === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => setMode(option.key)}
            style={[
              styles.option,
              compact && styles.optionCompact,
              active && { backgroundColor: theme.primary },
            ]}
            testID={`theme-${option.key}`}
          >
            <Text style={[styles.text, { color: active ? (isClassic ? "#0A0A0A" : "#fff") : theme.muted }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  wrapCompact: { borderRadius: 12 },
  option: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  optionCompact: { minHeight: 34, paddingHorizontal: 10 },
  text: { fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
});
