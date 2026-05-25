import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, shiftLabel, shiftColor, roleLabel } from "@/src/theme";

type DashboardData = {
  today_schedule: any;
  hours_this_month: number;
  present_days_this_month: number;
  pending_leaves: number;
  annual_leave_balance: number;
  sick_leave_balance: number;
  comp_off_balance: number;
  admin?: {
    pending_user_approvals: number;
    pending_leave_approvals: number;
    total_active_users: number;
    today_coverage: Record<string, number>;
  };
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<DashboardData>("/dashboard");
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = data?.today_schedule;
  const todayColor = shiftColor(today?.shift_type);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
        testID="dashboard-scroll"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name} testID="dashboard-user-name">{user?.full_name}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {roleLabel[user?.role || ""]} {user?.team ? `· TEAM ${user.team}` : ""}
              </Text>
            </View>
          </View>
          <TouchableOpacity testID="dashboard-profile-btn" onPress={() => router.push("/(app)/profile")} style={styles.avatar}>
            <Ionicons name="person" size={24} color={colors.morning} />
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Today's Shift */}
        <Text style={styles.overline}>TODAY'S SHIFT</Text>
        <View style={[styles.todayCard, { borderLeftColor: todayColor.c }]}>
          {loading && !data ? (
            <ActivityIndicator color={colors.morning} />
          ) : today ? (
            <>
              <View style={styles.shiftBadge(todayColor.bg, todayColor.c)}>
                <Text style={styles.shiftBadgeText(todayColor.c)}>
                  {shiftLabel[today.shift_type] || today.shift_type}
                </Text>
              </View>
              {today.shift_type !== "off" && today.shift_type !== "leave" && (
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.timeText}>
                    {today.start_time} – {today.end_time}
                  </Text>
                  <Text style={styles.hoursText}>{today.hours}h</Text>
                </View>
              )}
              <TouchableOpacity
                testID="dashboard-mark-attendance"
                style={styles.markBtn}
                onPress={() => router.push("/(app)/attendance")}
              >
                <Ionicons name="checkmark-circle" size={18} color={colors.bg} />
                <Text style={styles.markBtnText}>MARK ATTENDANCE</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyToday}>
              <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No shift scheduled today</Text>
            </View>
          )}
        </View>

        {/* Stats Grid */}
        <Text style={styles.overline}>THIS MONTH</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="time"
            color={colors.morning}
            label="Hours Worked"
            value={`${data?.hours_this_month ?? 0}h`}
          />
          <StatCard
            icon="checkmark-done"
            color={colors.success}
            label="Present Days"
            value={`${data?.present_days_this_month ?? 0}`}
          />
        </View>

        <TouchableOpacity
          testID="dashboard-view-report"
          style={styles.reportBtn}
          onPress={() => router.push("/(app)/reports")}
        >
          <Ionicons name="bar-chart" size={18} color={colors.morning} />
          <Text style={styles.reportBtnText}>VIEW MY FULL REPORT</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.morning} />
        </TouchableOpacity>

        {/* Leave balances */}
        <Text style={styles.overline}>LEAVE BALANCES</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="airplane" color={colors.annual} label="Annual" value={`${data?.annual_leave_balance ?? 0}`} />
          <StatCard icon="medkit" color={colors.sick} label="Sick" value={`${data?.sick_leave_balance ?? 0}`} />
          <StatCard icon="swap-horizontal" color={colors.compOff} label="Comp Off" value={`${data?.comp_off_balance ?? 0}`} />
          <StatCard icon="hourglass" color={colors.warning} label="Pending" value={`${data?.pending_leaves ?? 0}`} />
        </View>

        {/* Admin block */}
        {isAdmin && data?.admin && (
          <>
            <Text style={styles.overline}>ADMIN OVERVIEW</Text>
            <View style={styles.adminGrid}>
              <AdminTile
                testID="admin-tile-approvals"
                icon="person-add"
                label="User Approvals"
                count={data.admin.pending_user_approvals}
                onPress={() => router.push("/(app)/admin")}
              />
              <AdminTile
                testID="admin-tile-leaves"
                icon="clipboard"
                label="Leave Approvals"
                count={data.admin.pending_leave_approvals}
                onPress={() => router.push("/(app)/admin")}
              />
            </View>

            <View style={styles.coverageCard}>
              <Text style={styles.coverageTitle}>Today's Coverage</Text>
              <View style={styles.coverageRow}>
                <CoverageDot label="Morning" count={data.admin.today_coverage.morning || 0} min={3} color={colors.morning} />
                <CoverageDot label="Afternoon" count={data.admin.today_coverage.afternoon || 0} min={2} color={colors.afternoon} />
                <CoverageDot label="Night" count={data.admin.today_coverage.night || 0} min={2} color={colors.night} />
              </View>
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "GOOD MORNING";
  if (h < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function StatCard({ icon, color, label, value }: any) {
  return (
    <View style={styles.statCard} testID={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AdminTile({ icon, label, count, onPress, testID }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.adminTile} testID={testID}>
      <View style={styles.adminTileTop}>
        <Ionicons name={icon} size={22} color={colors.morning} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.adminTileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function CoverageDot({ label, count, min, color }: any) {
  const ok = count >= min;
  return (
    <View style={styles.covItem}>
      <View style={[styles.covCircle, { borderColor: color, backgroundColor: ok ? `${color}22` : "transparent" }]}>
        <Text style={[styles.covCount, { color }]}>{count}</Text>
      </View>
      <Text style={styles.covLabel}>{label}</Text>
      <Text style={[styles.covMin, { color: ok ? colors.success : colors.danger }]}>
        {ok ? `OK` : `Need ${min}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  greeting: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  name: { color: colors.textPrimary, fontSize: 28, fontWeight: "800", marginTop: 2 },
  roleBadge: { marginTop: 6 },
  roleText: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "600" },
  avatar: {
    width: 48, height: 48, borderRadius: 4, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
  },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  todayCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4,
    borderRadius: 8, padding: 18, minHeight: 100,
  },
  shiftBadge: (bg: string, c: string) => ({
    alignSelf: "flex-start" as const,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2,
    backgroundColor: bg, borderColor: c, borderWidth: 1,
  }),
  shiftBadgeText: (c: string) => ({ color: c, fontSize: 11, fontWeight: "800", letterSpacing: 1 }),
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  timeText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  hoursText: { color: colors.morning, fontSize: 14, fontWeight: "700", marginLeft: "auto" },
  markBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.textPrimary, height: 44, borderRadius: 4, marginTop: 14,
  },
  markBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
  emptyToday: { alignItems: "center", gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1, minWidth: "47%", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 16, gap: 6,
  },
  statValue: { color: colors.textPrimary, fontSize: 26, fontWeight: "800" },
  statLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "500" },
  reportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.morningBg, borderColor: colors.morning, borderWidth: 1,
    height: 48, borderRadius: 4, marginTop: 12,
  },
  reportBtnText: { color: colors.morning, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
  adminGrid: { flexDirection: "row", gap: 12 },
  adminTile: {
    flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 16,
  },
  adminTileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  adminTileLabel: { color: colors.textPrimary, fontWeight: "600", fontSize: 14, marginTop: 12 },
  badge: {
    backgroundColor: colors.danger, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, minWidth: 22, alignItems: "center",
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  coverageCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 16, marginTop: 12,
  },
  coverageTitle: { color: colors.textPrimary, fontWeight: "700", marginBottom: 14 },
  coverageRow: { flexDirection: "row", justifyContent: "space-around" },
  covItem: { alignItems: "center" },
  covCircle: {
    width: 50, height: 50, borderRadius: 25, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  covCount: { fontSize: 18, fontWeight: "800" },
  covLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  covMin: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  errorText: { color: colors.danger, marginBottom: 12 },
});
