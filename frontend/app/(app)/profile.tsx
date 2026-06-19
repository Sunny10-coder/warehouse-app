import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors, roleLabel, shiftLabel } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

export default function Profile() {
  const { user, logout } = useAuth();
  const { theme, isClassic } = useThemeMode();

  const onLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.location.replace("/login");
          } else {
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={[styles.overline, { color: theme.muted }]}>PROFILE</Text>
        <Text style={[styles.title, { color: theme.text }]}>My Account</Text>

        <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarLg} />
          ) : (
            <View style={styles.avatarLg}>
              <Text style={styles.avatarLgText}>{user.full_name.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <Text style={[styles.userName, { color: theme.text }]}>{user.full_name}</Text>
          <Text style={[styles.userEmail, { color: theme.muted }]}>{user.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.morning} />
            <Text style={styles.roleText}>{roleLabel[user.role]}</Text>
          </View>
        </BlurView>

        <Text style={[styles.overline, { color: theme.muted }]}>DETAILS</Text>
        <DetailRow icon="people" label="Team" value={user.team ? `TEAM ${user.team}` : "—"} />
        <DetailRow icon="location" label="Location" value={user.location.toUpperCase()} />
        <DetailRow icon="time" label="Default Shift" value={shiftLabel[user.default_shift || ""] || "Not set"} />

        <Text style={[styles.overline, { color: theme.muted }]}>LEAVE BALANCES</Text>
        <DetailRow icon="airplane" label="Annual Vacation" value={`${user.annual_leave_balance} days`} valueColor={colors.annual} />
        <DetailRow icon="medkit" label="Sick Leave" value={`${user.sick_leave_balance} days`} valueColor={colors.sick} />
        <DetailRow icon="swap-horizontal" label="Comp Off" value={`${user.comp_off_balance} days`} valueColor={colors.compOff} />

        <TouchableOpacity testID="profile-logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <Text style={styles.foot}>WAREHOUSE OPS · v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, valueColor }: any) {
  const { theme, isClassic } = useThemeMode();
  return (
    <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.detailRow, { borderColor: theme.border, backgroundColor: theme.surface, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
      <Ionicons name={icon} size={18} color={theme.muted} />
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }, valueColor && { color: valueColor }]}>{value}</Text>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginBottom: 8, marginTop: 16 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  profileCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    padding: 24, alignItems: "center", marginTop: 16,
  },
  avatarLg: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.morningBg,
    borderColor: colors.morning, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarLgText: { color: colors.morning, fontWeight: "800", fontSize: 22 },
  userName: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  userEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  roleBadge: {
    flexDirection: "row", gap: 4, alignItems: "center", marginTop: 10,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.morningBg,
    borderColor: colors.morning, borderWidth: 1, borderRadius: 2,
  },
  roleText: { color: colors.morning, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  detailRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  detailLabel: { color: colors.textSecondary, flex: 1, fontSize: 13 },
  detailValue: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  logoutBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", height: 50,
    borderColor: colors.danger, borderWidth: 1, borderRadius: 4, marginTop: 24,
    backgroundColor: "rgba(255,59,48,0.08)",
  },
  logoutText: { color: colors.danger, fontWeight: "800", letterSpacing: 1.5 },
  foot: { color: colors.textMuted, textAlign: "center", marginTop: 30, fontSize: 11, letterSpacing: 2 },
});
