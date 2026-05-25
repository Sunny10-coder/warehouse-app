import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, leaveColor, leaveLabel, roleLabel } from "@/src/theme";

function monthBounds(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export default function Reports() {
  const { user, isAdmin } = useAuth();
  const params = useLocalSearchParams<{ user_id?: string }>();
  const [targetId, setTargetId] = useState<string>(params.user_id || user?.id || "");
  const [users, setUsers] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { start, end } = monthBounds(year, month);
      const r = await api.get(`/reports/employee/${targetId}`, {
        params: { start_date: start, end_date: end },
      });
      setReport(r.data);
      if (isAdmin && users.length === 0) {
        const u = await api.get("/users", { params: { status_filter: "active" } });
        setUsers(u.data);
      }
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [targetId, year, month, isAdmin, users.length]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="reports-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>REPORTS</Text>
          <Text style={styles.title}>
            {targetId === user?.id ? "My Report" : (report?.user?.full_name || "Loading...")}
          </Text>
        </View>
        {isAdmin && (
          <TouchableOpacity testID="reports-pick-user" style={styles.pickBtn} onPress={() => setShowUserPicker(true)}>
            <Ionicons name="people" size={18} color={colors.morning} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.monthRow}>
        <TouchableOpacity testID="reports-prev-month" style={styles.monthBtn} onPress={prevMonth}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthName}</Text>
        <TouchableOpacity testID="reports-next-month" style={styles.monthBtn} onPress={nextMonth}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {!report ? (
          <ActivityIndicator color={colors.morning} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Hours & Days */}
            <Text style={styles.sectionLabel}>HOURS & DAYS</Text>
            <View style={styles.statsGrid}>
              <BigStat label="Total Hours" value={`${report.attendance.total_hours}h`} color={colors.morning} icon="time" />
              <BigStat label="Present Days" value={`${report.attendance.present_days}`} color={colors.success} icon="checkmark-done" />
              <BigStat label="Scheduled Days" value={`${report.attendance.scheduled_work_days}`} color={colors.afternoon} icon="calendar" />
              <BigStat label="Late Days" value={`${report.attendance.late_days}`} color={colors.warning} icon="alarm" />
              <BigStat label="Absent" value={`${report.attendance.absent_days}`} color={colors.danger} icon="close-circle" />
              <BigStat label="Half Days" value={`${report.attendance.half_days}`} color={colors.night} icon="contrast" />
            </View>

            {/* Leaves */}
            <Text style={styles.sectionLabel}>LEAVE USAGE ({monthName})</Text>
            {(["annual", "sick", "comp_off", "emergency"] as const).map(k => {
              const s = report.leaves.summary[k];
              const bal = report.leaves.balances[k as "annual" | "sick" | "comp_off"];
              return (
                <View key={k} style={[styles.leaveRow, { borderLeftColor: leaveColor(k) }]} testID={`report-leave-${k}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.leaveTitle, { color: leaveColor(k) }]}>{leaveLabel[k]}</Text>
                    <View style={styles.leaveStats}>
                      <Text style={styles.leaveStatItem}>
                        <Text style={styles.leaveStatBold}>{s.taken}</Text> taken
                      </Text>
                      {s.pending > 0 && (
                        <Text style={[styles.leaveStatItem, { color: colors.warning }]}>
                          <Text style={[styles.leaveStatBold, { color: colors.warning }]}>{s.pending}</Text> pending
                        </Text>
                      )}
                      {k !== "emergency" && bal !== undefined && (
                        <Text style={[styles.leaveStatItem, { color: colors.success }]}>
                          <Text style={[styles.leaveStatBold, { color: colors.success }]}>{bal}</Text> remaining
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}

            {/* User card */}
            <Text style={styles.sectionLabel}>PROFILE</Text>
            <View style={styles.profileBox}>
              <Text style={styles.profileName}>{report.user.full_name}</Text>
              <Text style={styles.profileMeta}>{report.user.email}</Text>
              <Text style={styles.profileMeta}>
                {roleLabel[report.user.role]}
                {report.user.team ? ` · TEAM ${report.user.team}` : ""}
                {" · "}{report.user.location.toUpperCase()}
              </Text>
            </View>

            {/* Recent attendance records */}
            {report.attendance.records.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ATTENDANCE LOG ({report.attendance.records.length})</Text>
                {report.attendance.records.slice().reverse().slice(0, 20).map((a: any, i: number) => (
                  <View key={i} style={styles.attRow}>
                    <Text style={styles.attDate}>{a.attendance_date}</Text>
                    <Text style={[styles.attStatus, {
                      color: a.status === "present" ? colors.success
                        : a.status === "late" ? colors.warning
                        : a.status === "absent" ? colors.danger : colors.textSecondary,
                    }]}>
                      {a.status.toUpperCase()}
                    </Text>
                    <Text style={styles.attHours}>{a.hours_worked}h</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* User picker */}
      <Modal visible={showUserPicker} transparent animationType="slide" onRequestClose={() => setShowUserPicker(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {users.map(u => (
                <TouchableOpacity
                  key={u.id}
                  testID={`pick-${u.id}`}
                  style={styles.userPickRow}
                  onPress={() => {
                    setTargetId(u.id);
                    setShowUserPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userPickName}>{u.full_name}</Text>
                    <Text style={styles.userPickMeta}>
                      {roleLabel[u.role]} {u.team ? `· TEAM ${u.team}` : ""}
                    </Text>
                  </View>
                  {targetId === u.id && <Ionicons name="checkmark" size={18} color={colors.morning} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BigStat({ label, value, color, icon }: any) {
  return (
    <View style={styles.statBox} testID={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: 20, paddingBottom: 12, gap: 12 },
  backBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  pickBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderColor: colors.morning, borderWidth: 1, borderRadius: 4, backgroundColor: colors.morningBg,
  },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 2 },
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16,
    padding: 12, marginHorizontal: 20, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  monthBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  monthLabel: { color: colors.textPrimary, fontWeight: "800", fontSize: 14, letterSpacing: 1 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 18, marginBottom: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    width: "31%", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, padding: 12, alignItems: "center", gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLab: { color: colors.textSecondary, fontSize: 10, textAlign: "center", letterSpacing: 0.3 },
  leaveRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 4,
  },
  leaveTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  leaveStats: { flexDirection: "row", gap: 12, marginTop: 4, flexWrap: "wrap" },
  leaveStatItem: { color: colors.textSecondary, fontSize: 12 },
  leaveStatBold: { color: colors.textPrimary, fontWeight: "800" },
  profileBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6, padding: 12,
  },
  profileName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  profileMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  attRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4, marginBottom: 4,
  },
  attDate: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  attStatus: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginRight: 12 },
  attHours: { color: colors.morning, fontWeight: "800", fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "85%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  userPickRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 6,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  userPickName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  userPickMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
});
