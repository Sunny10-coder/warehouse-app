import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, ImageBackground,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";
import { ThemeSwitch } from "@/src/components/ThemeSwitch";
import { useThemeMode } from "@/src/theme-context";

const BG = "https://static.prod-images.emergentagent.com/jobs/da884466-d91f-4b87-b67b-1b279911f97e/images/8df459a8f432a298283cddb3146fbe81a6ab182bc9811a8792ba20570d0227c5.png";

export default function Login() {
  const { login } = useAuth();
  const { theme, isClassic } = useThemeMode();
  const [email, setEmail] = useState("manager@warehouse.com");
  const [password, setPassword] = useState("Manager@123");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    setError(null);
    setBusy(true);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (r.ok) {
      router.replace("/(app)/dashboard");
    } else {
      const msg = r.error === "pending_approval"
        ? "Your account is awaiting admin approval."
        : r.error === "account_disabled"
        ? "Your account has been disabled."
        : r.error || "Login failed";
      setError(msg);
    }
  };

  return (
    <ImageBackground source={{ uri: BG }} style={[styles.bg, { backgroundColor: theme.bg }]} blurRadius={isClassic ? 2 : 14}>
      <View style={[styles.overlay, { backgroundColor: isClassic ? "rgba(10,10,10,0.85)" : "rgba(243,241,255,0.9)" }]} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.themeHolder}>
              <ThemeSwitch />
            </View>
            <View style={styles.logoWrap}>
              <View style={[styles.logoBadge, { borderColor: theme.primary, backgroundColor: isClassic ? colors.morningBg : theme.purpleSoft }]}>
                <Ionicons name="cube" size={32} color={theme.primary} />
              </View>
              <Text style={[styles.brand, { color: theme.text }]}>WAREHOUSE OPS</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>Workforce Command Center</Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.overline, { color: theme.primary }]}>SIGN IN</Text>
              <Text style={[styles.title, { color: theme.text }]}>Access your shift</Text>

              <Text style={[styles.label, { color: theme.muted }]}>Email</Text>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@warehouse.com"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, { backgroundColor: theme.surfaceSoft, borderColor: theme.border, color: theme.text }]}
              />

              <Text style={[styles.label, { color: theme.muted }]}>Password</Text>
              <View style={styles.pwRow}>
                <TextInput
                  testID="login-password-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.muted}
                  secureTextEntry={!show}
                  style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: theme.surfaceSoft, borderColor: theme.border, color: theme.text }]}
                />
                <TouchableOpacity onPress={() => setShow(!show)} style={[styles.eye, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} testID="login-toggle-password">
                  <Ionicons name={show ? "eye-off" : "eye"} size={20} color={theme.muted} />
                </TouchableOpacity>
              </View>

              {error && (
                <View style={styles.errorBox} testID="login-error">
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                testID="login-submit-button"
                style={[styles.btnPrimary, { backgroundColor: isClassic ? colors.textPrimary : theme.primary }, busy && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={isClassic ? colors.bg : "#fff"} />
                ) : (
                  <>
                    <Text style={[styles.btnPrimaryText, { color: isClassic ? colors.bg : "#fff" }]}>SIGN IN</Text>
                    <Ionicons name="arrow-forward" size={18} color={isClassic ? colors.bg : "#fff"} />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="login-go-register"
                style={styles.linkRow}
                onPress={() => router.push("/(auth)/register")}
              >
                <Text style={[styles.linkMuted, { color: theme.muted }]}>New employee?</Text>
                <Text style={[styles.linkText, { color: theme.primary }]}>Create account</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.demo, { color: theme.muted }]}>
              Demo: manager@warehouse.com / Manager@123
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.85)" },
  scroll: { flexGrow: 1, padding: 18, justifyContent: "center" },
  themeHolder: { width: "100%", maxWidth: 420, alignSelf: "center", marginBottom: 18 },
  logoWrap: { alignItems: "center", marginBottom: 22 },
  logoBadge: {
    width: 72, height: 72, borderRadius: 4, borderWidth: 1,
    borderColor: colors.morning, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.morningBg, marginBottom: 16,
  },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4, letterSpacing: 2 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 18, padding: 20, width: "100%", maxWidth: 680, alignSelf: "center",
  },
  overline: { color: colors.morning, fontSize: 11, letterSpacing: 3, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginBottom: 24 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 1 },
  input: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 14, fontSize: 15,
  },
  pwRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  eye: {
    width: 48, height: 48, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, marginLeft: 8,
    backgroundColor: colors.surfaceHi,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
    backgroundColor: "rgba(255,59,48,0.1)", borderColor: colors.danger, borderWidth: 1,
    borderRadius: 4, marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  btnPrimary: {
    height: 52, backgroundColor: colors.textPrimary, borderRadius: 4,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 6,
  },
  btnPrimaryText: { color: colors.bg, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 20, gap: 6 },
  linkMuted: { color: colors.textSecondary, fontSize: 13 },
  linkText: { color: colors.morning, fontSize: 13, fontWeight: "700" },
  demo: { textAlign: "center", color: colors.textMuted, fontSize: 11, marginTop: 24, letterSpacing: 1 },
});
