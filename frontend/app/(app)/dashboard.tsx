import { useCallback, useState, useEffect } from "react";
import * as Notifications from "expo-notifications";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Image,
  FlatList, useWindowDimensions, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { appTheme, colors, shiftLabel, shiftColor, roleLabel } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";
import { SectionRow } from "@/src/components/SectionRow";
import { StaffTile } from "@/src/components/StaffTile";
import { ThemeSwitch } from "@/src/components/ThemeSwitch";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type DashboardData = {
  today_schedule: any;
  today_signed_in: number;
  today_sick: number;
  today_comp_off: number;
  today_on_leave: number;
  today_duty_holders: any[];
  leave_request_reminders: { attendance_date: string; attendance_status: string; suggested_leave_type: string; message: string }[];
  hours_this_month: number;
  present_days_this_month: number;
  has_punched_in_today: boolean;
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
  today_duty_holders: any[];
  };
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const { theme } = useThemeMode();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [adminLeavesDismissed, setAdminLeavesDismissed] = useState(false);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const load = useCallback(async () => {
    try {
      const r = await api.get<DashboardData>("/dashboard");
      setData(r.data);
      setError(null);
      // Admin-only directory data is used for the off-duty rail. Live duty holders come from /dashboard.
      if (isAdmin) {
        try {
          const usersRes = await api.get("/users", { params: { status_filter: "active" } });
          setStaffList(usersRes.data || []);
        } catch { /* non-critical */ }
      }
      // Fetch pending leaves for admin
      try {
        const lvRes = await api.get("/leaves", { params: { status_filter: "pending" } });
        setPendingLeaves(lvRes.data || []);
      } catch { /* non-critical */ }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [todayStr, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["users", "schedules", "attendance", "leaves"]);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      if (!data || !user) return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      const todaySched = data.today_schedule;
      const hasPunched = data.has_punched_in_today;
      
      if (!hasPunched && todaySched && todaySched.shift_type) {
        const shiftTimes: Record<string, string> = {
          "morning": "07:00",
          "afternoon": "12:00",
          "night": "21:00",
          "admin": "07:30",
          "sat_day": "06:00",
          "sat_night": "18:00",
          "sun_day": "06:00",
          "sun_night": "18:00",
          "ega": "07:00",
        };
        const startTimeStr = shiftTimes[todaySched.shift_type];
        if (startTimeStr) {
          const [h, m] = startTimeStr.split(':').map(Number);
          const now = new Date();
          const scheduledTime = new Date();
          scheduledTime.setHours(h, m, 0, 0);
          
          if (scheduledTime > now) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Attendance Reminder',
                body: "It's time to punch in for your shift!",
              },
              trigger: scheduledTime,
            });
          } else {
            // Already late! Fire immediately if it's the same day
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Late Punch Alert',
                body: "You are late! Please punch in immediately.",
              },
              trigger: null, // Fire immediately
            });
          }
        }
      }
    })();
  }, [data, user]);

  const todaySched = data?.today_schedule;
  const totalEmployees = data?.admin?.total_active_users ?? 1;
  const presentToday = data?.admin?.today_signed_in ?? data?.today_signed_in ?? 0;
  const sickToday = data?.admin?.today_sick ?? data?.today_sick ?? 0;
  const compOffToday = data?.admin?.today_comp_off ?? data?.today_comp_off ?? 0;
  const onLeaveToday = data?.admin?.today_on_leave ?? data?.today_on_leave ?? 0;
  const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.round((presentToday / totalEmployees) * 100)) : 0;

  const staffOnShift = data?.today_duty_holders || [];
  const dutyIds = new Set(staffOnShift.map((item: any) => item.user_id));
  const staffOff = staffList.filter(u => u.status === "active" && !dutyIds.has(u.id));

  // Quick action items
  const quickActions = [
    { icon: "finger-print" as const, label: "Clock In", color: appTheme.primary, bg: appTheme.purpleSoft, route: "/(app)/attendance" },
    { icon: "calendar" as const, label: "Schedule", color: appTheme.green, bg: appTheme.greenSoft, route: "/(app)/schedule" },
    { icon: "briefcase" as const, label: "Leave", color: appTheme.red, bg: appTheme.redSoft, route: "/(app)/leaves" },
    { icon: "bar-chart" as const, label: "Reports", color: appTheme.blue, bg: appTheme.blueSoft, route: "/(app)/reports" },
    { icon: "people" as const, label: "Admin", color: appTheme.yellow, bg: appTheme.yellowSoft, route: "/(app)/admin" },
    { icon: "pulse" as const, label: "Command", color: appTheme.green, bg: appTheme.greenSoft, route: "/(app)/command-center" },
  ];

  // Stat tiles
  const statTiles = [
    { icon: "people", value: totalEmployees, label: "Total Staff", color: appTheme.primary },
    { icon: "trending-up", value: presentToday, label: "Signed In", color: "#34C759" },
    { icon: "medkit", value: sickToday, label: "Sick", color: "#FF3B30" },
    { icon: "swap-horizontal", value: compOffToday, label: "Comp Off", color: "#0A84FF" },
    { icon: "airplane", value: onLeaveToday, label: "On Leave", color: "#FF9F0A" },
  ];

  const sc = shiftColor(todaySched?.shift_type);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={appTheme.primary} />}
        testID="dashboard-scroll"
      >
        {/* ─── HERO BANNER ─── */}
        <View style={styles.hero}>
          <View style={styles.heroOverlay}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroGreeting}>{getGreeting()}</Text>
                <Text style={styles.heroName} testID="dashboard-user-name">{user?.full_name || "Team"}</Text>
                <Text style={styles.heroDate}>
                  {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </Text>
              </View>
              <View style={styles.heroTools}><ThemeSwitch compact />
              <TouchableOpacity testID="dashboard-profile-btn" onPress={() => router.push("/(app)/profile")} style={styles.profileBtn}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.profileImg} />
                ) : (
                  <Text style={styles.profileInitial}>{(user?.full_name || "U").slice(0, 1).toUpperCase()}</Text>
                )}
              </TouchableOpacity>
              </View>
            </View>

            {/* Today's shift card inside hero */}
            <View style={styles.heroShiftCard}>
              <View style={[styles.heroShiftDot, { backgroundColor: sc.c }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroShiftLabel}>
                  {todaySched ? (shiftLabel[todaySched.shift_type] || todaySched.shift_type) : "No Shift Today"}
                </Text>
                {todaySched?.start_time && (
                  <Text style={styles.heroShiftTime}>{todaySched.start_time} – {todaySched.end_time}</Text>
                )}
              </View>
              <View style={styles.heroRateBadge}>
                <Text style={styles.heroRateNum}>{attendanceRate}%</Text>
                <Text style={styles.heroRateLabel}>Rate</Text>
              </View>
            </View>

            {/* Hero CTA */}
            <TouchableOpacity style={styles.heroCta} onPress={() => router.push("/(app)/attendance")}>
              <Ionicons name="finger-print" size={18} color="#fff" />
              <Text style={styles.heroCtaText}>CLOCK IN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* ─── QUICK ACTIONS ROW ─── */}
        <SectionRow
          title="Quick Actions"
          data={quickActions}
          keyExtractor={(item) => item.label}
          renderItem={(item) => (
            <TouchableOpacity onPress={() => router.push(item.route as any)} style={styles.actionTile}>
              <View style={[styles.actionIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={[styles.actionLabel, { color: item.color }]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />

        {/* ─── STAFF ON SHIFT ROW ─── */}
        <SectionRow
          title={`On Shift Today (${staffOnShift.length})`}
          onSeeAll={() => router.push("/(app)/schedule")}
          data={staffOnShift}
          keyExtractor={(item) => item.user_id}
          emptyText="No staff on shift today"
          renderItem={(item) => (
            <StaffTile
              name={item.user_name || item.full_name || "Employee"}
              avatarUrl={item.avatar_url}
              shiftType={item.shift_type}
              status={item.attendance_status || (item.is_present ? "present" : "scheduled")}
              role={`${item.team ? `Team ${item.team}` : roleLabel[item.role] || item.role}${item.clock_in ? ` · ${item.clock_in}` : ""}`}
            />
          )}
        />

        {/* ─── TODAY'S STATS ROW ─── */}
        <SectionRow
          title="Today at a Glance"
          data={statTiles}
          keyExtractor={(item) => item.label}
          renderItem={(item) => (
            <View style={styles.statTile}>
              <View style={[styles.statIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon as any} size={20} color="#fff" />
              </View>
              <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          )}
        />

        {/* ─── STAFF OFF / ON LEAVE ROW ─── */}
        {staffOff.length > 0 && (
          <SectionRow
            title={`Off / On Leave (${staffOff.length})`}
            data={staffOff}
            keyExtractor={(item) => item.id}
            renderItem={(item) => (
              <StaffTile
                name={item.user_name || item.full_name || "Employee"}
                avatarUrl={item.avatar_url}
                shiftType="off"
                role={roleLabel[item.role] || item.role}
              />
            )}
          />
        )}

        {/* ─── PENDING APPROVALS ROW (Admin) ─── */}
        {isAdmin && pendingLeaves.length > 0 && (
          <SectionRow
            title={`Pending Approvals (${pendingLeaves.length})`}
            onSeeAll={() => router.push("/(app)/admin")}
            data={pendingLeaves}
            keyExtractor={(item) => item.id}
            renderItem={(item) => (
              <View style={styles.leaveTile}>
                <View style={[styles.leaveAccent, { backgroundColor: leaveColorFn(item.leave_type) }]} />
                <Text style={styles.leaveName} numberOfLines={1}>{item.user_name || "Staff"}</Text>
                <Text style={[styles.leaveType, { color: leaveColorFn(item.leave_type) }]}>
                  {item.leave_type?.replace("_", " ").toUpperCase()}
                </Text>
                <Text style={styles.leaveDates}>{item.start_date} → {item.end_date}</Text>
                <Text style={styles.leaveDays}>{item.days} day{item.days > 1 ? "s" : ""}</Text>
              </View>
            )}
          />
        )}

        {/* ─── MY MONTH SUMMARY ─── */}
        <View style={styles.monthSection}>
          <Text style={styles.sectionTitle}>This Month</Text>
          <View style={styles.monthRow}>
            <View style={styles.monthCard}>
              <Text style={[styles.monthVal, { color: appTheme.green }]}>{data?.hours_this_month ?? 0}h</Text>
              <Text style={styles.monthLab}>Hours</Text>
            </View>
            <View style={styles.monthCard}>
              <Text style={[styles.monthVal, { color: appTheme.primary }]}>{data?.present_days_this_month ?? 0}</Text>
              <Text style={styles.monthLab}>Days Present</Text>
            </View>
            <View style={styles.monthCard}>
              <Text style={[styles.monthVal, { color: appTheme.yellow }]}>{data?.pending_leaves ?? 0}</Text>
              <Text style={styles.monthLab}>Pending Leave</Text>
            </View>
          </View>
          {/* Leave balances */}
          <View style={styles.balanceRow}>
            <BalancePill label="Annual" value={data?.annual_leave_balance ?? 0} color={colors.annual} />
            <BalancePill label="Sick" value={data?.sick_leave_balance ?? 0} color={colors.sick} />
            <BalancePill label="Comp Off" value={data?.comp_off_balance ?? 0} color={colors.compOff} />
          </View>
          {/* Attendance progress bar */}
          <View style={styles.progressWrap}>
            <Text style={styles.progressLabel}>
              Attendance Rate <Text style={{ color: appTheme.primary, fontWeight: "900" }}>{attendanceRate}%</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${attendanceRate}%` }]} />
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={!reminderDismissed && !!data?.leave_request_reminders?.length} transparent animationType="fade" onRequestClose={() => setReminderDismissed(true)}>
        <View style={styles.reminderBackdrop}>
          <View style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.reminderIcon}>
              <Ionicons name="notifications" size={28} color="#FF9F0A" />
            </View>
            <Text style={[styles.reminderTitle, { color: theme.text }]}>Leave request required</Text>
            <Text style={[styles.reminderText, { color: theme.muted }]}>{data?.leave_request_reminders?.[0]?.message}</Text>
            <TouchableOpacity style={styles.reminderApply} onPress={() => { setReminderDismissed(true); router.push("/(app)/leaves"); }}>
              <Ionicons name="document-text" size={17} color="#fff" />
              <Text style={styles.reminderApplyText}>APPLY THROUGH THE APP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reminderLater} onPress={() => setReminderDismissed(true)}>
              <Text style={[styles.reminderLaterText, { color: theme.muted }]}>REMIND ME NEXT TIME</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!adminLeavesDismissed && isAdmin && pendingLeaves.length > 0} transparent animationType="fade" onRequestClose={() => setAdminLeavesDismissed(true)}>
        <View style={styles.reminderBackdrop}>
          <View style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.reminderIcon}>
              <Ionicons name="notifications-circle" size={32} color="#0A84FF" />
            </View>
            <Text style={[styles.reminderTitle, { color: theme.text }]}>Pending Leave Applications</Text>
            <Text style={[styles.reminderText, { color: theme.muted }]}>There are {pendingLeaves.length} pending leave requests that require your approval.</Text>
            <TouchableOpacity style={[styles.reminderApply, { backgroundColor: "#0A84FF" }]} onPress={() => { setAdminLeavesDismissed(true); router.push("/(app)/admin"); }}>
              <Ionicons name="shield-checkmark" size={17} color="#fff" />
              <Text style={styles.reminderApplyText}>REVIEW NOW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reminderLater} onPress={() => setAdminLeavesDismissed(true)}>
              <Text style={[styles.reminderLaterText, { color: theme.muted }]}>REMIND ME LATER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function leaveColorFn(t?: string) {
  switch (t) {
    case "annual": return colors.annual;
    case "sick": return colors.sick;
    case "comp_off": return colors.compOff;
    case "emergency": return colors.emergency;
    default: return appTheme.muted;
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function BalancePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.balancePill, { borderColor: color }]}>
      <Text style={[styles.balanceVal, { color: "#fff" }]}>{value}</Text>
      <Text style={[styles.balanceLab, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: appTheme.bg },
  scroll: { paddingBottom: 110 },

  // ─── HERO ───
  hero: {
    margin: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: appTheme.primaryDeep,
  },
  heroOverlay: {
    padding: 24,
    gap: 16,
  },
  heroTools: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroGreeting: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "700",
  },
  heroName: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  heroDate: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 4,
  },
  profileBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: appTheme.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  profileImg: { width: 50, height: 50, borderRadius: 25 },
  profileInitial: { color: "#fff", fontSize: 20, fontWeight: "900" },

  heroShiftCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  heroShiftDot: { width: 10, height: 10, borderRadius: 5 },
  heroShiftLabel: { color: "#fff", fontSize: 15, fontWeight: "800" },
  heroShiftTime: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
  heroRateBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  heroRateNum: { color: "#fff", fontSize: 20, fontWeight: "900" },
  heroRateLabel: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "800", letterSpacing: 1 },

  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: appTheme.primary,
    borderRadius: 12,
    height: 48,
  },
  heroCtaText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },

  // ─── QUICK ACTIONS ───
  actionTile: {
    width: 90,
    alignItems: "center",
    gap: 8,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },

  // ─── STAT TILES ───
  statTile: {
    width: 120,
    backgroundColor: appTheme.surface,
    borderColor: appTheme.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 26, fontWeight: "900" },
  statLabel: { color: appTheme.muted, fontSize: 11, fontWeight: "700" },

  // ─── LEAVE TILES ───
  leaveTile: {
    width: 160,
    backgroundColor: appTheme.surface,
    borderColor: appTheme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  leaveAccent: {
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  leaveName: { color: appTheme.text, fontSize: 14, fontWeight: "800" },
  leaveType: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  leaveDates: { color: appTheme.muted, fontSize: 11, marginTop: 4 },
  leaveDays: { color: appTheme.muted, fontSize: 11 },

  // ─── MONTH SUMMARY ───
  monthSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    color: appTheme.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  monthRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  monthCard: {
    flex: 1,
    backgroundColor: appTheme.surface,
    borderColor: appTheme.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  monthVal: { fontSize: 24, fontWeight: "900" },
  monthLab: { color: appTheme.muted, fontSize: 11, fontWeight: "700", marginTop: 4 },

  balanceRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  balancePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    backgroundColor: appTheme.surface,
  },
  balanceVal: { fontSize: 20, fontWeight: "900" },
  balanceLab: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 2 },

  progressWrap: { marginTop: 4 },
  progressLabel: { color: appTheme.muted, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  progressTrack: {
    height: 8,
    backgroundColor: appTheme.surfaceHi,
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor: appTheme.primary,
  },

  reminderBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center", padding: 20 },
  reminderCard: { width: "100%", maxWidth: 430, borderWidth: 1, borderRadius: 18, padding: 22, alignItems: "center" },
  reminderIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(255,159,10,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  reminderTitle: { fontSize: 19, fontWeight: "900", marginBottom: 8 },
  reminderText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  reminderApply: { width: "100%", minHeight: 48, marginTop: 18, borderRadius: 10, backgroundColor: appTheme.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  reminderApplyText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  reminderLater: { minHeight: 40, justifyContent: "center", marginTop: 4 },
  reminderLaterText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  errorText: { color: appTheme.red, margin: 20, fontWeight: "800" },
});
