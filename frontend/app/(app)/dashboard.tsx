import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { appTheme, colors, shiftLabel, roleLabel } from "@/src/theme";

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
  useRealtimeRefresh(load, ["users", "schedules", "attendance", "leaves"]);

  const today = data?.today_schedule;
  const totalEmployees = data?.admin?.total_active_users ?? 1;
  const presentToday = data?.present_days_this_month ?? 0;
  const pendingLeaves = data?.pending_leaves ?? 0;
  const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.round((presentToday / totalEmployees) * 100)) : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={appTheme.primary} />}
        testID="dashboard-scroll"
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageTitle}>Dashboard</Text>
            <Text style={styles.pageDate}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/(app)/admin")}>
              <Ionicons name="notifications-outline" size={20} color={appTheme.muted} />
              {isAdmin && (data?.admin?.pending_leave_approvals || 0) > 0 && (
                <View style={styles.notifyBadge}>
                  <Text style={styles.notifyText}>{data?.admin?.pending_leave_approvals}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity testID="dashboard-profile-btn" onPress={() => router.push("/(app)/profile")} style={styles.avatarBtn}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{String(user?.full_name || "U").slice(0, 1).toUpperCase()}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.hero}>
          <View style={styles.heroOrbOne} />
          <View style={styles.heroOrbTwo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}, {user?.full_name?.split(" ")[0] || "Team"}</Text>
            <Text style={styles.heroTitle} testID="dashboard-user-name">Welcome Back!</Text>
            <Text style={styles.heroSub}>Here's what's happening with your team today.</Text>
          </View>
          <View style={styles.rateCard}>
            <View style={styles.rateRing}>
              <Text style={styles.rateText}>{attendanceRate}%</Text>
            </View>
            <View>
              <Text style={styles.rateLabel}>ATTENDANCE RATE</Text>
              <Text style={styles.rateValue}>{presentToday}/{totalEmployees}</Text>
              <Text style={styles.rateSub}>Employees checked in today</Text>
            </View>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard icon="people" color={appTheme.primary} value={totalEmployees} label="Total Employees" sub={`${totalEmployees} registered`} />
          <MetricCard icon="trending-up" color={appTheme.green} value={presentToday} label="Present Today" sub={`${attendanceRate}% attendance rate`} />
          <MetricCard icon="briefcase" color={appTheme.yellow} value={pendingLeaves} label="On Leave" sub={`${pendingLeaves} pending requests`} />
          <MetricCard icon="trending-down" color={appTheme.red} value="0" label="Absent Today" sub="Requires follow-up" />
        </View>

        <View style={styles.dashboardGrid}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Quick Actions</Text>
            <View style={styles.actionGrid}>
              <ActionTile icon="finger-print" label="Clock In" color={appTheme.primary} bg={appTheme.purpleSoft} onPress={() => router.push("/(app)/attendance")} />
              <ActionTile icon="calendar" label="Schedule" color={appTheme.green} bg={appTheme.greenSoft} onPress={() => router.push("/(app)/schedule")} />
              <ActionTile icon="people" label="Employees" color={appTheme.yellow} bg={appTheme.yellowSoft} onPress={() => router.push("/(app)/admin")} />
              <ActionTile icon="bar-chart" label="Reports" color={appTheme.blue} bg={appTheme.blueSoft} onPress={() => router.push("/(app)/reports")} />
              <ActionTile icon="briefcase" label="Leave" color={appTheme.red} bg={appTheme.redSoft} onPress={() => router.push("/(app)/leaves")} />
              <ActionTile icon="pulse" label="Activity" color={appTheme.green} bg="#ECFDF3" onPress={() => router.push("/(app)/command-center")} />
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Today's Shifts</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/schedule")}>
                <Text style={styles.linkText}>View ›</Text>
              </TouchableOpacity>
            </View>
            <ShiftRow color={appTheme.green} bg={appTheme.greenSoft} label={shiftLabel[today?.shift_type] || "No Shift"} time={today ? `${today.start_time || "--"} - ${today.end_time || "--"}` : "Not scheduled"} value={today ? `${today.hours || 0}h` : "--"} />
            <ShiftRow color={appTheme.yellow} bg={appTheme.yellowSoft} label="Hours This Month" time="Logged attendance" value={`${data?.hours_this_month ?? 0}h`} />
            <ShiftRow color={appTheme.primary} bg={appTheme.purpleSoft} label="Pending Leave" time="Awaiting approval" value={pendingLeaves} />
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>This Month</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/reports")}>
                <Text style={styles.linkText}>Report ›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              <MiniStat value={presentToday} label="Present" color={appTheme.green} bg={appTheme.greenSoft} />
              <MiniStat value="0" label="Late Arrivals" color={appTheme.yellow} bg={appTheme.yellowSoft} />
              <MiniStat value="0" label="Absent" color={appTheme.red} bg={appTheme.redSoft} />
              <MiniStat value={pendingLeaves} label="Pending Leave" color={appTheme.primary} bg={appTheme.purpleSoft} />
            </View>
            <Text style={styles.progressLabel}>Attendance Rate <Text style={{ color: appTheme.primary }}>{attendanceRate}%</Text></Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${attendanceRate}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.activityPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/reports")}>
              <Text style={styles.linkText}>See All ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.activityHeader}>
            <Text style={styles.activityHeadText}>EMPLOYEE</Text>
            <Text style={styles.activityHeadText}>STATUS</Text>
            <Text style={styles.activityHeadText}>DATE</Text>
          </View>
          <View style={styles.activityRow}>
            <View style={styles.activityPerson}>
              <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{String(user?.full_name || "U").slice(0, 1).toUpperCase()}</Text></View>
              <View>
                <Text style={styles.activityName}>{user?.full_name}</Text>
                <Text style={styles.activityRole}>{roleLabel[user?.role || "employee"]}</Text>
              </View>
            </View>
            <Text style={styles.presentPill}>Present</Text>
            <Text style={styles.activityDate}>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
          </View>
        </View>

        <View style={{ height: 42 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MetricCard({ icon, color, value, label, sub }: any) {
  return (
    <View style={[styles.metricCard, { borderColor: `${color}35` }]}>
      <View style={[styles.metricIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricSub, { color }]}>{sub}</Text>
    </View>
  );
}

function ActionTile({ icon, label, color, bg, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.actionTile, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ShiftRow({ color, bg, label, time, value }: any) {
  return (
    <View style={[styles.shiftRow, { backgroundColor: bg }]}>
      <View style={[styles.shiftIcon, { backgroundColor: color }]}>
        <Ionicons name="time-outline" size={19} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.shiftLabel}>{label}</Text>
        <Text style={styles.shiftTime}>{time}</Text>
      </View>
      <Text style={[styles.shiftValue, { color }]}>{value}</Text>
    </View>
  );
}

function MiniStat({ value, label, color, bg }: any) {
  return (
    <View style={[styles.miniStat, { backgroundColor: bg }]}>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  scroll: { padding: 20, paddingBottom: 110 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { color: appTheme.text, fontSize: 24, fontWeight: "900" },
  pageDate: { color: appTheme.muted, fontSize: 13, marginTop: 2 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: appTheme.surface,
    borderColor: appTheme.border, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  notifyBadge: {
    position: "absolute", top: -5, right: -4, backgroundColor: appTheme.primary,
    borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
  },
  notifyText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  avatarBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: appTheme.primary, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  hero: {
    minHeight: 174, borderRadius: 26, backgroundColor: appTheme.primaryDeep,
    padding: 28, marginBottom: 30, overflow: "hidden", flexDirection: "row",
    alignItems: "center", gap: 24,
  },
  heroOrbOne: {
    position: "absolute", width: 230, height: 230, borderRadius: 115,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", left: 250, top: 55,
  },
  heroOrbTwo: {
    position: "absolute", width: 210, height: 210, borderRadius: 105,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", right: 80, top: -55,
  },
  greeting: { color: "#BEB4E9", fontSize: 15, fontWeight: "800", marginBottom: 8 },
  heroTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  heroSub: { color: "#AAA1D2", fontSize: 15, marginTop: 8 },
  rateCard: {
    minWidth: 310, flexDirection: "row", alignItems: "center", gap: 22,
    backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderRadius: 20, padding: 22,
  },
  rateRing: {
    width: 86, height: 86, borderRadius: 43, borderWidth: 9, borderColor: "#A78BFA",
    alignItems: "center", justifyContent: "center",
  },
  rateText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  rateLabel: { color: "#BEB4E9", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  rateValue: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 4 },
  rateSub: { color: "#BEB4E9", fontSize: 13, marginTop: 3 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20, marginBottom: 30 },
  metricCard: {
    flex: 1, minWidth: 230, backgroundColor: appTheme.surface, borderWidth: 1,
    borderRadius: 22, padding: 24, shadowColor: appTheme.shadow, shadowOpacity: 1,
    shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 2,
  },
  metricIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  metricValue: { color: appTheme.text, fontSize: 34, fontWeight: "900" },
  metricLabel: { color: appTheme.muted, fontSize: 14, fontWeight: "700", marginTop: 2 },
  metricSub: { fontSize: 13, fontWeight: "800", marginTop: 10 },
  dashboardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 22, marginBottom: 30 },
  panel: {
    flex: 1, minWidth: 320, backgroundColor: appTheme.surface, borderRadius: 22,
    borderColor: appTheme.border, borderWidth: 1, padding: 24,
  },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  panelTitle: { color: appTheme.text, fontSize: 18, fontWeight: "900", marginBottom: 16 },
  linkText: { color: appTheme.primary, fontSize: 13, fontWeight: "800" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionTile: {
    width: "47%", minHeight: 86, borderRadius: 16, alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  actionLabel: { fontSize: 12, fontWeight: "900" },
  shiftRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 16, marginBottom: 12, gap: 14 },
  shiftIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  shiftLabel: { color: appTheme.text, fontSize: 15, fontWeight: "900" },
  shiftTime: { color: appTheme.muted, fontSize: 12, marginTop: 3 },
  shiftValue: { fontSize: 21, fontWeight: "900" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  miniStat: { width: "47%", minHeight: 86, borderRadius: 16, padding: 16, justifyContent: "center" },
  miniValue: { fontSize: 28, fontWeight: "900" },
  miniLabel: { color: appTheme.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  progressLabel: { color: appTheme.muted, fontSize: 13, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  progressTrack: { height: 9, backgroundColor: appTheme.surfaceLavender, borderRadius: 9, overflow: "hidden" },
  progressFill: { height: 9, borderRadius: 9, backgroundColor: appTheme.green },
  activityPanel: {
    backgroundColor: appTheme.surface, borderColor: appTheme.border, borderWidth: 1,
    borderRadius: 22, padding: 24,
  },
  activityHeader: { flexDirection: "row", backgroundColor: appTheme.surfaceSoft, borderRadius: 12, padding: 12, marginBottom: 10 },
  activityHeadText: { flex: 1, color: appTheme.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  activityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  activityPerson: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: appTheme.primary, alignItems: "center", justifyContent: "center" },
  smallAvatarText: { color: "#fff", fontWeight: "900" },
  activityName: { color: appTheme.text, fontSize: 14, fontWeight: "900" },
  activityRole: { color: appTheme.muted, fontSize: 12 },
  presentPill: {
    flex: 1, alignSelf: "center", maxWidth: 88, textAlign: "center",
    color: appTheme.green, backgroundColor: appTheme.greenSoft,
    paddingVertical: 7, borderRadius: 12, overflow: "hidden", fontWeight: "900",
  },
  activityDate: { flex: 1, color: appTheme.muted, fontSize: 13, textAlign: "center" },
  errorText: { color: appTheme.red, marginBottom: 12, fontWeight: "800" },
});
