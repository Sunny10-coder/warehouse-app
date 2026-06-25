import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeMode } from "@/src/theme-context";

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, theme } = useThemeMode();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceHi, borderColor: theme.border }, compact && styles.compactWrap]}>
      <TouchableOpacity
        testID="theme-cinematic"
        onPress={() => setMode("cinematic")}
        style={[styles.option, compact && styles.compactOption, mode === "cinematic" && { backgroundColor: theme.primary }]}
      >
        <Ionicons name="moon" size={compact ? 13 : 15} color={mode === "cinematic" ? "#fff" : theme.muted} />
        {!compact && <Text style={[styles.label, { color: mode === "cinematic" ? "#fff" : theme.muted }]}>Cinema</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        testID="theme-light"
        onPress={() => setMode("light")}
        style={[styles.option, compact && styles.compactOption, mode === "light" && { backgroundColor: theme.primary }]}
      >
        <Ionicons name="sunny" size={compact ? 13 : 15} color={mode === "light" ? "#fff" : theme.muted} />
        {!compact && <Text style={[styles.label, { color: mode === "light" ? "#fff" : theme.muted }]}>Light</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  compactWrap: { borderRadius: 10 },
  option: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, borderRadius: 9 },
  compactOption: { width: 32, minHeight: 28, paddingHorizontal: 0 },
  label: { fontSize: 11, fontWeight: "800" },
});