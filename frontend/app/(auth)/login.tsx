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

const BG = "https://static.prod-images.emergentagent.com/jobs/da884466-d91f-4b87-b67b-1b279911f97e/images/8df459a8f432a298283cddb3146fbe81a6ab182bc9811a8792ba20570d0227c5.png";

export default function Login() {
  const { login } = useAuth();
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
    <ImageBackground source={{ uri: BG }} style={styles.bg} blurRadius={2}>
      <View style={styles.overlay} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.logoWrap}>
              <View style={styles.logoBadge}>
                <Ionicons name="cube" size={32} color={colors.morning} />
              </View>
              <Text style={styles.brand}>WAREHOUSE OPS</Text>
              <Text style={styles.subtitle}>Workforce Command Center</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.overline}>SIGN IN</Text>
              <Text style={styles.title}>Access your shift</Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@warehouse.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.pwRow}>
                <TextInput
                  testID="login-password-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!show}
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                />
                <TouchableOpacity onPress={() => setShow(!show)} style={styles.eye} testID="login-toggle-password">
                  <Ionicons name={show ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
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
                style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <>
                    <Text style={styles.btnPrimaryText}>SIGN IN</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.bg} />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="login-go-register"
                style={styles.linkRow}
                onPress={() => router.push("/(auth)/register")}
              >
                <Text style={styles.linkMuted}>New employee?</Text>
                <Text style={styles.linkText}>Create account</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.demo}>
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
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoBadge: {
    width: 72, height: 72, borderRadius: 4, borderWidth: 1,
    borderColor: colors.morning, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.morningBg, marginBottom: 16,
  },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4, letterSpacing: 2 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 24,
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
