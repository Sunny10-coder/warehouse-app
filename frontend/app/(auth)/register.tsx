import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async () => {
    if (!fullName || !email || !password) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError(null);
    setBusy(true);
    const r = await register(fullName.trim(), email.trim(), password);
    setBusy(false);
    if (r.ok) {
      setSuccess(true);
    } else {
      setError(r.error || "Registration failed");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            testID="register-back"
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          {success ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              </View>
              <Text style={styles.successTitle}>Request Submitted</Text>
              <Text style={styles.successText}>
                Your account is pending admin approval. You'll be able to log in once approved.
              </Text>
              <TouchableOpacity
                testID="register-back-to-login"
                style={styles.btnPrimary}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.btnPrimaryText}>BACK TO LOGIN</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.overline}>NEW EMPLOYEE</Text>
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.helper}>
                Admin will approve your account before you can log in.
              </Text>

              <Text style={styles.label}>Full Name</Text>
              <TextInput
                testID="register-name-input"
                value={fullName}
                onChangeText={setFullName}
                placeholder="John Doe"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              <Text style={styles.label}>Work Email</Text>
              <TextInput
                testID="register-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@warehouse.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="register-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                testID="register-submit-button"
                style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={colors.bg} /> : (
                  <Text style={styles.btnPrimaryText}>REQUEST ACCOUNT</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24 },
  backBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderRadius: 4, borderColor: colors.border, borderWidth: 1, marginBottom: 24,
  },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 24 },
  overline: { color: colors.morning, fontSize: 11, letterSpacing: 3, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginBottom: 6 },
  helper: { color: colors.textSecondary, fontSize: 13, marginBottom: 20 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 1 },
  input: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 14, fontSize: 15,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
    backgroundColor: "rgba(255,59,48,0.1)", borderColor: colors.danger, borderWidth: 1,
    borderRadius: 4, marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  btnPrimary: {
    height: 52, backgroundColor: colors.textPrimary, borderRadius: 4,
    alignItems: "center", justifyContent: "center", marginTop: 6,
  },
  btnPrimaryText: { color: colors.bg, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  successBox: { alignItems: "center", padding: 24 },
  successIcon: { marginBottom: 16 },
  successTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginBottom: 8 },
  successText: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
});
