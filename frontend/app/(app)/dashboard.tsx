import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Image, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { appTheme, colors, shiftLabel, roleLabel } from "@/src/theme";
import { ThemeSwitch } from "@/src/components/ThemeSwitch";
import { useThemeMode } from "@/src/theme-context";

type DashboardData = {
  today_schedule: any;
  today_signed_in: number;
  today_sick: number;
  today_comp_off: number;
  today_on_leave: number;
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
    today_signed_in: number;
    today_sick: number;
    today_comp_off: number;
    today_on_leave: number;
  };
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const { theme, isClassic } = useThemeMode();
  const isMobile = width < 760;
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
  const presentToday = data?.admin?.today_signed_in ?? data?.today_signed_in ?? 0;
  const sickToday = data?.admin?.today_sick ?? data?.today_sick ?? 0;
  const compOffToday = data?.admin?.today_comp_off ?? data?.today_comp_off ?? 0;
  const onLeaveToday = data?.admin?.today_on_leave ?? data?.today_on_leave ?? 0;
  const pendingLeaves = data?.pending_leaves ?? 0;
  const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.round((presentToday / totalEmployees) * 100)) : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={appTheme.primary} />}
        testID="dashboard-scroll"
      >
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Dashboard</Text>
            <Text style={[styles.pageDate, { color: theme.muted }]}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          </View>
          <View style={styles.topActions}>
            <View style={styles.themeTop}>
              <ThemeSwitch compact />
            </View>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push("/(app)/admin")}>
              <Ionicons name="notifications-outline" size={20} color={theme.muted} />
              {isAdmin && (data?.admin?.pending_leave_approvals || 0) > 0 && (
                <View style={styles.notifyBadge}>
                  <Text style={styles.notifyText}>{data?.admin?.pending_leave_approvals}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity testID="dashboard-profile-btn" onPress={() => router.push("/(app)/profile")} style={[styles.avatarBtn, { backgroundColor: theme.primary }]}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{String(user?.full_name || "U").slice(0, 1).toUpperCase()}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={[styles.hero, isMobile && styles.heroMobile]}>
          <View style={styles.heroOrbOne} />
          <View style={styles.heroOrbTwo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}, {user?.full_name?.split(" ")[0] || "Team"}</Text>
            <Text style={styles.heroTitle} testID="dashboard-user-name">Welcome Back!</Text>
            <Text style={styles.heroSub}>Here's what's happening with your team today.</Text>
          </View>
          <View style={[styles.rateCard, isMobile && styles.rateCardMobile]}>
            <View style={[styles.rateRing, isMobile && styles.rateRingMobile]}>
              <Text style={styles.rateText}>{attendanceRate}%</Text>
            </View>
            <View>
              <Text style={styles.rateLabel}>ATTENDANCE RATE</Text>
              <Text style={styles.rateValue}>{presentToday}/{totalEmployees}</Text>
              <Text style={styles.rateSub}>Employees signed in today</Text>
            </View>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard icon="people" color={appTheme.primary} value={totalEmployees} label="Total Employees" sub={`${totalEmployees} registered`} />
          <MetricCard icon="trending-up" color={appTheme.green} value={presentToday} label="Signed In Today" sub={`${attendanceRate}% live attendance`} />
          <MetricCard icon="medkit" color={appTheme.red} value={sickToday} label="Sick Today" sub="Approved sick leave" />
          <MetricCard icon="swap-horizontal" color={appTheme.blue} value={compOffToday} label="Comp Off Today" sub="Approved comp off" />
          <MetricCard icon="trending-down" color={appTheme.red} value="0" label="Absent Today" sub="Requires follow-up" />
        </View>

        <View style={styles.dashboardGrid}>
          <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.panel, { borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
            <Text style={styles.panelTitle}>Quick Actions</Text>
            <View style={styles.actionGrid}>
              <ActionTile icon="finger-print" label="Clock In" color={appTheme.primary} bg={appTheme.purpleSoft} onPress={() => router.push("/(app)/attendance")} />
              <ActionTile icon="calendar" label="Schedule" color={appTheme.green} bg={appTheme.greenSoft} onPress={() => router.push("/(app)/schedule")} />
              <ActionTile icon="people" label="Employees" color={appTheme.yellow} bg={appTheme.yellowSoft} onPress={() => router.push("/(app)/admin")} />
              <ActionTile icon="bar-chart" label="Reports" color={appTheme.blue} bg={appTheme.blueSoft} onPress={() => router.push("/(app)/reports")} />
              <ActionTile icon="briefcase" label="Leave" color={appTheme.red} bg={appTheme.redSoft} onPress={() => router.push("/(app)/leaves")} />
              <ActionTile icon="pulse" label="Activity" color={appTheme.green} bg="#ECFDF3" onPress={() => router.push("/(app)/command-center")} />
            </View>
          </BlurView>

          <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.panel, { borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Today's Shifts</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/schedule")}>
                <Text style={styles.linkText}>View ›</Text>
              </TouchableOpacity>
            </View>
            <ShiftRow color={appTheme.green} bg={appTheme.greenSoft} label={shiftLabel[today?.shift_type] || "No Shift"} time={today ? `${today.start_time || "--"} - ${today.end_time || "--"}` : "Not scheduled"} value={today ? `${today.hours || 0}h` : "--"} />
            <ShiftRow color={appTheme.yellow} bg={appTheme.yellowSoft} label="Hours This Month" time="Logged attendance" value={`${data?.hours_this_month ?? 0}h`} />
            <ShiftRow color={appTheme.primary} bg={appTheme.purpleSoft} label="Pending Leave" time="Awaiting approval" value={pendingLeaves} />
          </BlurView>

          <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.panel, { borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>This Month</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/reports")}>
                <Text style={styles.linkText}>Report ›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              <MiniStat value={presentToday} label="Present" color={appTheme.green} bg={appTheme.greenSoft} />
              <MiniStat value={sickToday} label="Sick Today" color={appTheme.red} bg={appTheme.redSoft} />
              <MiniStat value={compOffToday} label="Comp Off" color={appTheme.blue} bg={appTheme.blueSoft} />
              <MiniStat value={onLeaveToday} label="On Leave" color={appTheme.primary} bg={appTheme.purpleSoft} />
            </View>
            <Text style={styles.progressLabel}>Attendance Rate <Text style={{ color: appTheme.primary }}>{attendanceRate}%</Text></Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${attendanceRate}%` }]} />
            </View>
          </BlurView>
        </View>

        <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.activityPanel, { borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
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
                <Text style={[styles.activityName, { color: theme.text }]}>{user?.full_name}</Text>
                <Text style={styles.activityRole}>{roleLabel[user?.role || "employee"]}</Text>
              </View>
            </View>
            <Text style={styles.presentPill}>Present</Text>
            <Text style={styles.activityDate}>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
          </View>
        </BlurView>

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
  const { theme, isClassic } = useThemeMode();
  return (
    <BlurView intensity={50} tint={isClassic ? "dark" : "light"} style={[styles.metricCard, { borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
      <View style={[styles.metricIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.metricSub, { color }]}>{sub}</Text>
    </BlurView>
  );
}

function ActionTile({ icon, label, color, bg, onPress }: any) {
  const { theme, isClassic } = useThemeMode();
  return (
    <TouchableOpacity onPress={onPress} style={{ width: "47%" }}>
      <BlurView intensity={40} tint={isClassic ? "dark" : "light"} style={[styles.actionTile, { backgroundColor: bg, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
        <Ionicons name={icon} size={24} color={color} />
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      </BlurView>
    </TouchableOpacity>
  );
}

function ShiftRow({ color, bg, label, time, value }: any) {
  const { theme, isClassic } = useThemeMode();
  return (
    <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.shiftRow, { backgroundColor: bg, borderColor: theme.border }]}>
      <View style={[styles.shiftIcon, { backgroundColor: color }]}>
        <Ionicons name="time-outline" size={19} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.shiftLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.shiftTime, { color: theme.muted }]}>{time}</Text>
      </View>
      <Text style={[styles.shiftValue, { color }]}>{value}</Text>
    </BlurView>
  );
}

function MiniStat({ value, label, color, bg }: any) {
  const { theme, isClassic } = useThemeMode();
  return (
    <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.miniStat, { backgroundColor: bg, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
      <Text style={[styles.miniLabel, { color: theme.muted }]}>{label}</Text>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  scroll: { padding: 20, paddingBottom: 110 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { color: appTheme.text, fontSize: 24, fontWeight: "900" },
  pageDate: { color: appTheme.muted, fontSize: 13, marginTop: 2 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  themeTop: { width: 158 },
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
  heroMobile: {
    minHeight: 0,
    borderRadius: 22,
    padding: 20,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 16,
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
  rateCardMobile: { minWidth: "100%", width: "100%", padding: 16, gap: 14 },
  rateRingMobile: { width: 68, height: 68, borderRadius: 34, borderWidth: 7 },
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
