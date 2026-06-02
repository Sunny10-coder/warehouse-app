import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, leaveColor, leaveLabel, roleLabel, shiftLabel } from "@/src/theme";

function monthBounds(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function esc(value: any) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[ch] || ch));
}

function table(title: string, headers: string[], rows: any[][]) {
  return `
    <h2>${esc(title)}</h2>
    <table border="1">
      <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

export default function Reports() {
  const { user, isAdmin } = useAuth();
  const params = useLocalSearchParams<{ user_id?: string }>();
  const [targetId, setTargetId] = useState<string>(params.user_id || user?.id || "");
  const [reportMode, setReportMode] = useState<"employee" | "all">("employee");
  const [users, setUsers] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [allReport, setAllReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const initialBounds = monthBounds(now.getFullYear(), now.getMonth());
  const [exportStart, setExportStart] = useState(initialBounds.start);
  const [exportEnd, setExportEnd] = useState(initialBounds.end);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const { start, end } = monthBounds(year, month);
    setExportStart(start);
    setExportEnd(end);
  }, [year, month]);

  const load = useCallback(async () => {
    if (reportMode === "employee" && !targetId) return;
    setLoading(true);
    try {
      const { start, end } = monthBounds(year, month);
      if (isAdmin && reportMode === "all") {
        const r = await api.get("/reports/attendance/all", {
          params: { start_date: start, end_date: end },
        });
        setAllReport(r.data);
      } else {
        const r = await api.get(`/reports/employee/${targetId}`, {
          params: { start_date: start, end_date: end },
        });
        setReport(r.data);
      }
      if (isAdmin && users.length === 0) {
        const u = await api.get("/users", { params: { status_filter: "active" } });
        setUsers(u.data);
      }
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [targetId, reportMode, year, month, isAdmin, users.length]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["attendance", "leaves", "schedules", "users"]);

  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  const exportExcel = async () => {
    if (!isAdmin) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exportStart) || !/^\d{4}-\d{2}-\d{2}$/.test(exportEnd)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for start and end date.");
      return;
    }
    setExporting(true);
    try {
      const r = await api.get("/reports/export", { params: { start_date: exportStart, end_date: exportEnd } });
      const data = r.data;
      const days = datesBetween(exportStart, exportEnd);
      const scheduleByUserDate = new Map<string, any>();
      const attendanceByUserDate = new Map<string, any>();
      data.schedules.forEach((s: any) => scheduleByUserDate.set(`${s.user_id}|${s.shift_date}`, s));
      data.attendance.forEach((a: any) => attendanceByUserDate.set(`${a.user_id}|${a.attendance_date}`, a));

      const calendarRows = data.users.map((u: any) => [
        u.user_name,
        u.team || "",
        u.role,
        ...days.map(d => {
          const s = scheduleByUserDate.get(`${u.user_id}|${d}`);
          const a = attendanceByUserDate.get(`${u.user_id}|${d}`);
          const shift = s ? (shiftLabel[s.shift_type] || s.shift_type) : "";
          const status = a ? a.status : "";
          const time = a && (a.clock_in || a.clock_out) ? ` ${a.clock_in || "--"}-${a.clock_out || "--"}` : "";
          return [shift, status, time].filter(Boolean).join(" | ");
        }),
      ]);

      const summaryRows = data.users.map((u: any) => [
        u.user_name, u.email, u.role, u.team || "", u.location,
        u.attendance_records, u.present, u.late, u.absent, u.half_day, u.total_hours,
        u.annual_leave, u.sick_leave, u.vacation_leave, u.comp_off_leave, u.emergency_leave, u.pending_leave,
        u.annual_balance, u.sick_balance, u.comp_off_balance,
      ]);
      const attendanceRows = data.attendance.map((a: any) => [
        a.attendance_date, a.user_name, a.status, a.clock_in || "", a.clock_out || "", a.hours_worked, a.shift_type || "", a.notes || "",
      ]);
      const leaveRows = data.leaves.map((lv: any) => [
        lv.user_name, lv.leave_type, lv.status, lv.start_date, lv.end_date, lv.days, lv.reason || "", lv.approved_by || "",
      ]);

      const html = `
        <html><head><meta charset="utf-8" /></head><body>
          <h1>Warehouse Attendance Report ${esc(exportStart)} to ${esc(exportEnd)}</h1>
          ${table("Calendar", ["Employee", "Team", "Role", ...days], calendarRows)}
          ${table("Employee Summary", [
            "Employee", "Email", "Role", "Team", "Location", "Attendance Records", "Present", "Late", "Absent", "Half Day", "Total Hours",
            "Annual Leave", "Sick Leave", "Vacation", "Comp Off Leave", "Emergency Leave", "Pending Leave",
            "Annual Balance", "Sick Balance", "Comp Off Balance",
          ], summaryRows)}
          ${table("Attendance Log", ["Date", "Employee", "Status", "Clock In", "Clock Out", "Hours", "Shift", "Notes"], attendanceRows)}
          ${table("Leaves", ["Employee", "Type", "Status", "Start", "End", "Days", "Reason", "Approved By"], leaveRows)}
        </body></html>
      `;
      if (typeof window === "undefined") {
        Alert.alert("Web export only", "Open this reports page in browser to download Excel.");
        return;
      }
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `warehouse-attendance-${exportStart}-to-${exportEnd}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      Alert.alert("Export failed", errMsg(e));
    } finally {
      setExporting(false);
    }
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
            {reportMode === "all"
              ? "All Staff Attendance"
              : targetId === user?.id ? "My Report" : (report?.user?.full_name || "Loading...")}
          </Text>
        </View>
        {isAdmin && reportMode === "employee" && (
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

      {isAdmin && (
        <View style={styles.modeRow}>
          <TouchableOpacity
            testID="reports-mode-employee"
            style={[styles.modeBtn, reportMode === "employee" && styles.modeBtnActive]}
            onPress={() => setReportMode("employee")}
          >
            <Text style={[styles.modeText, reportMode === "employee" && styles.modeTextActive]}>EMPLOYEE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="reports-mode-all"
            style={[styles.modeBtn, reportMode === "all" && styles.modeBtnActive]}
            onPress={() => setReportMode("all")}
          >
            <Text style={[styles.modeText, reportMode === "all" && styles.modeTextActive]}>ALL STAFF</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAdmin && (
        <View style={styles.exportBox}>
          <Text style={styles.exportTitle}>EXCEL EXPORT</Text>
          <View style={styles.exportInputs}>
            <TextInput
              testID="report-export-start"
              value={exportStart}
              onChangeText={setExportStart}
              style={styles.exportInput}
              placeholder="Start YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              testID="report-export-end"
              value={exportEnd}
              onChangeText={setExportEnd}
              style={styles.exportInput}
              placeholder="End YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <TouchableOpacity
            testID="report-export-excel"
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={exportExcel}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator color={colors.bg} /> : (
              <>
                <Ionicons name="download" size={16} color={colors.bg} />
                <Text style={styles.exportBtnText}>DOWNLOAD EXCEL REPORT</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {reportMode === "all" && isAdmin ? (
          !allReport ? (
            <ActivityIndicator color={colors.morning} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={styles.sectionLabel}>FULL ATTENDANCE MARKED ({monthName})</Text>
              <View style={styles.statsGrid}>
                <BigStat label="Records" value={`${allReport.totals.records}`} color={colors.morning} icon="reader" />
                <BigStat label="Total Hours" value={`${allReport.totals.total_hours}h`} color={colors.morning} icon="time" />
                <BigStat label="Present Days" value={`${allReport.totals.present_days}`} color={colors.success} icon="checkmark-done" />
                <BigStat label="Late Days" value={`${allReport.totals.late_days}`} color={colors.warning} icon="alarm" />
                <BigStat label="Absent" value={`${allReport.totals.absent_days}`} color={colors.danger} icon="close-circle" />
                <BigStat label="Half Days" value={`${allReport.totals.half_days}`} color={colors.night} icon="contrast" />
              </View>

              {allReport.users.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>STAFF SUMMARY ({allReport.users.length})</Text>
                  {allReport.users.map((u: any) => (
                    <View key={u.user_id} style={styles.summaryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.summaryName}>{u.user_name}</Text>
                        <Text style={styles.summaryMeta}>
                          {u.records} marked · {u.present_days} present · {u.late_days} late · {u.absent_days} absent
                        </Text>
                      </View>
                      <Text style={styles.summaryHours}>{u.total_hours}h</Text>
                    </View>
                  ))}
                </>
              )}

              {allReport.records.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>ATTENDANCE LOG ({allReport.records.length})</Text>
                  {allReport.records.slice().reverse().map((a: any, i: number) => (
                    <View key={`${a.user_id}-${a.attendance_date}-${i}`} style={styles.attRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attDate}>{a.attendance_date} · {a.user_name}</Text>
                        {(a.clock_in || a.clock_out) && (
                          <Text style={styles.attTime}>{a.clock_in || "--"} → {a.clock_out || "--"}</Text>
                        )}
                      </View>
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
              ) : (
                <View style={styles.emptyBox}>
                  <Ionicons name="reader-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No attendance marked in this month</Text>
                </View>
              )}
            </>
          )
        ) : !report ? (
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
                {report.attendance.records.slice().reverse().map((a: any, i: number) => (
                  <View key={i} style={styles.attRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attDate}>{a.attendance_date}</Text>
                      {(a.clock_in || a.clock_out) && (
                        <Text style={styles.attTime}>{a.clock_in || "--"} → {a.clock_out || "--"}</Text>
                      )}
                    </View>
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
  modeRow: {
    flexDirection: "row", gap: 8, marginHorizontal: 20, marginTop: 10,
  },
  modeBtn: {
    flex: 1, height: 38, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  modeBtnActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  modeText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  modeTextActive: { color: colors.bg },
  exportBox: {
    marginHorizontal: 20, marginTop: 10, padding: 12, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  exportTitle: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  exportInputs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exportInput: {
    flexGrow: 1, minWidth: 140, height: 42, backgroundColor: colors.surfaceHi,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    color: colors.textPrimary, paddingHorizontal: 10, fontSize: 12,
  },
  exportBtn: {
    height: 42, marginTop: 8, borderRadius: 4, backgroundColor: colors.success,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  exportBtnText: { color: colors.bg, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
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
  attTime: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  attStatus: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginRight: 12 },
  attHours: { color: colors.morning, fontWeight: "800", fontSize: 12 },
  summaryRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  summaryName: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  summaryMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  summaryHours: { color: colors.morning, fontSize: 14, fontWeight: "800" },
  emptyBox: {
    alignItems: "center", justifyContent: "center", padding: 34,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
  },
  emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
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
