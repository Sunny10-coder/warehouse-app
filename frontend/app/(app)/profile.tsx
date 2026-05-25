import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors, roleLabel, shiftLabel } from "@/src/theme";

export default function Profile() {
  const { user, logout } = useAuth();

  const onLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={styles.overline}>PROFILE</Text>
        <Text style={styles.title}>My Account</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatarLg}>
            <Text style={styles.avatarLgText}>{user.full_name.slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={styles.userName}>{user.full_name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.morning} />
            <Text style={styles.roleText}>{roleLabel[user.role]}</Text>
          </View>
        </View>

        <Text style={styles.overline}>DETAILS</Text>
        <DetailRow icon="people" label="Team" value={user.team ? `TEAM ${user.team}` : "—"} />
        <DetailRow icon="location" label="Location" value={user.location.toUpperCase()} />
        <DetailRow icon="time" label="Default Shift" value={shiftLabel[user.default_shift || ""] || "Not set"} />

        <Text style={styles.overline}>LEAVE BALANCES</Text>
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
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
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
