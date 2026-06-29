import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, leaveColor, leaveLabel, roleLabel, shiftLabel } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

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
  const { theme } = useThemeMode();
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

  // Admin attendance editing states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editUserId, setEditUserId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("present");
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [deletingAttendance, setDeletingAttendance] = useState(false);

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

  const openEditAttendanceModal = (record?: any) => {
    if (!isAdmin) return;
    if (record) {
      setEditRecord(record);
      setEditUserId(record.user_id);
      setEditDate(record.attendance_date);
      setEditStatus(record.status || "present");
      setEditClockIn(record.clock_in || "");
      setEditClockOut(record.clock_out || "");
      setEditHours(record.hours_worked !== undefined && record.hours_worked !== null ? String(record.hours_worked) : "");
      setEditNotes(record.notes || "");
    } else {
      setEditRecord(null);
      setEditUserId(reportMode === "employee" ? targetId : (users[0]?.id || ""));
      setEditDate(new Date().toISOString().slice(0, 10));
      setEditStatus("present");
      setEditClockIn("");
      setEditClockOut("");
      setEditHours("");
      setEditNotes("");
    }
    setShowEditModal(true);
  };

  const saveAttendance = async () => {
    if (!editUserId) {
      Alert.alert("Required", "Please select an employee.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate.trim())) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for the attendance date.");
      return;
    }
    if (editClockIn.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editClockIn.trim())) {
      Alert.alert("Invalid Clock In", "Use 24-hour HH:MM format.");
      return;
    }
    if (editClockOut.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editClockOut.trim())) {
      Alert.alert("Invalid Clock Out", "Use 24-hour HH:MM format.");
      return;
    }

    setSavingAttendance(true);
    try {
      const payload: any = {
        user_id: editUserId,
        attendance_date: editDate.trim(),
        status: editStatus,
        clock_in: editClockIn.trim() || null,
        clock_out: editClockOut.trim() || null,
        hours_worked: editHours.trim() ? parseFloat(editHours.trim()) : null,
        notes: editNotes.trim() || null,
      };
      await api.post("/attendance", payload);
      setShowEditModal(false);
      Alert.alert("Success", "Attendance record saved.");
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSavingAttendance(false);
    }
  };

  const deleteAttendanceRecord = async () => {
    if (!editRecord) return;
    const runDelete = async () => {
      setDeletingAttendance(true);
      try {
        await api.delete(`/attendance/${editUserId}/${editDate.trim()}`);
        setShowEditModal(false);
        Alert.alert("Deleted", "Attendance record deleted.");
        await load();
      } catch (e) {
        Alert.alert("Error", errMsg(e));
      } finally {
        setDeletingAttendance(false);
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Delete this attendance record?")) {
        runDelete();
      }
      return;
    }
    Alert.alert("Delete attendance", "Are you sure you want to delete this record?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: runDelete },
    ]);
  };

  const exportExcel = async () => {
    if (!isAdmin) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exportStart) || !/^\d{4}-\d{2}-\d{2}$/.test(exportEnd)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for start and end date.");
      return;
    }
    if (typeof window === "undefined") {
      Alert.alert("Web export only", "Open Reports in a browser to download the Excel workbook.");
      return;
    }
    setExporting(true);
    try {
      const response = await api.get("/reports/export.xlsx", {
        params: { start_date: exportStart, end_date: exportEnd },
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `warehouse-management-${exportStart}-to-${exportEnd}.xlsx`;
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

      <View style={[styles.monthRow, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
        <TouchableOpacity testID="reports-prev-month" style={[styles.monthBtn, { borderColor: theme.border }]} onPress={prevMonth}>
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: theme.text }]}>{monthName}</Text>
        <TouchableOpacity testID="reports-next-month" style={[styles.monthBtn, { borderColor: theme.border }]} onPress={nextMonth}>
          <Ionicons name="chevron-forward" size={18} color={theme.text} />
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
        <View style={[styles.exportBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
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
                <Text style={styles.exportBtnText}>DOWNLOAD MANAGEMENT WORKBOOK</Text>
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

              {isAdmin && (
                <TouchableOpacity
                  testID="reports-add-attendance"
                  style={styles.addManualBtn}
                  onPress={() => openEditAttendanceModal()}
                >
                  <Ionicons name="add" size={16} color={colors.bg} />
                  <Text style={styles.addManualText}>ADD MANUAL ATTENDANCE</Text>
                </TouchableOpacity>
              )}

              {allReport.users.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>STAFF SUMMARY ({allReport.users.length})</Text>
                  {allReport.users.map((u: any) => (
                    <View key={u.user_id} style={[styles.summaryRow, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.summaryName, { color: theme.text }]}>{u.user_name}</Text>
                        <Text style={[styles.summaryMeta, { color: theme.muted }]}>
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
                    <TouchableOpacity
                      key={`${a.user_id}-${a.attendance_date}-${i}`}
                      style={{ marginBottom: 4, borderRadius: 4 }}
                      onPress={() => openEditAttendanceModal(a)}
                      disabled={!isAdmin}
                      testID={`reports-all-att-row-${i}`}
                    >
                      <View style={[styles.attRow, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, marginBottom: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.attDate, { color: theme.text }]}>{a.attendance_date} · {a.user_name}</Text>
                        {(a.clock_in || a.clock_out) && (
                          <Text style={[styles.attTime, { color: theme.muted }]}>{a.clock_in || "--"} → {a.clock_out || "--"}</Text>
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
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
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

            {isAdmin && (
              <TouchableOpacity
                testID="reports-add-attendance-emp"
                style={styles.addManualBtn}
                onPress={() => openEditAttendanceModal()}
              >
                <Ionicons name="add" size={16} color={colors.bg} />
                <Text style={styles.addManualText}>ADD MANUAL ATTENDANCE</Text>
              </TouchableOpacity>
            )}

            {/* Leaves */}
            <Text style={styles.sectionLabel}>LEAVE BALANCE & USAGE ({monthName})</Text>
            {(["annual", "sick", "comp_off", "emergency"] as const).map(k => {
              const s = report.leaves.summary[k];
              const bal = report.leaves.balances[k as "annual" | "sick" | "comp_off"];
              const title = k === "annual" ? "Vacation" : leaveLabel[k];
              return (
                <View key={k} style={[styles.leaveRow, { borderLeftColor: leaveColor(k), backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]} testID={`report-leave-${k}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.leaveTitle, { color: leaveColor(k) }]}>{title}</Text>
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
            <View style={[styles.profileBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.profileName, { color: theme.text }]}>{report.user.full_name}</Text>
              <Text style={[styles.profileMeta, { color: theme.muted }]}>{report.user.email}</Text>
              <Text style={[styles.profileMeta, { color: theme.muted }]}>
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
                  <TouchableOpacity
                    key={i}
                    style={{ marginBottom: 4, borderRadius: 4 }}
                    onPress={() => openEditAttendanceModal(a)}
                    disabled={!isAdmin}
                    testID={`reports-emp-att-row-${i}`}
                  >
                    <View style={[styles.attRow, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, marginBottom: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attDate, { color: theme.text }]}>{a.attendance_date}</Text>
                      {(a.clock_in || a.clock_out) && (
                        <Text style={[styles.attTime, { color: theme.muted }]}>{a.clock_in || "--"} → {a.clock_out || "--"}</Text>
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
                  </TouchableOpacity>
                ))}
              </>
            )}

            {report.leaves.records.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>LEAVE RECORDS ({report.leaves.records.length})</Text>
                {report.leaves.records.slice().reverse().map((lv: any) => {
                  const c = leaveColor(lv.leave_type);
                  const title = lv.leave_type === "annual" ? "Vacation" : leaveLabel[lv.leave_type];
                  const statusColor = lv.status === "approved" ? colors.success : lv.status === "pending" ? colors.warning : colors.danger;
                  return (
                    <View key={lv.id} style={[styles.leaveRecordRow, { borderLeftColor: c, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.leaveRecordTitle, { color: c }]}>{title}</Text>
                        <Text style={[styles.leaveRecordMeta, { color: theme.muted }]}>
                          {lv.start_date} - {lv.end_date} | {lv.days} day{lv.days === 1 ? "" : "s"}
                        </Text>
                        {lv.reason && <Text style={[styles.leaveRecordReason, { color: theme.text }]}>{lv.reason}</Text>}
                      </View>
                      <Text style={[styles.leaveRecordStatus, { color: statusColor }]}>{lv.status.toUpperCase()}</Text>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* User picker */}
      <Modal visible={showUserPicker} transparent animationType="slide" onRequestClose={() => setShowUserPicker(false)}>
        <View style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.8)" }]}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
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

      {/* Admin Attendance Edit Modal */}
      {isAdmin && (
        <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
          <View style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.8)" }]}>
            <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}><ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editRecord ? "Edit Attendance" : "Add Manual Attendance"}</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Employee</Text>
              {editRecord ? (
                <View style={styles.readOnlyBox}>
                  <Text style={styles.readOnlyText}>{editRecord.user_name}</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {users.map(u => (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => setEditUserId(u.id)}
                        style={[styles.userChip, editUserId === u.id && styles.userChipActive]}
                      >
                        <Text style={[styles.userChipText, editUserId === u.id && { color: colors.bg }]}>
                          {u.full_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                editable={!editRecord}
              />

              <Text style={styles.modalLabel}>Status</Text>
              <View style={styles.statusSelectRow}>
                {["present", "late", "absent", "leave", "sick"].map(s => {
                  const active = editStatus === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setEditStatus(s)}
                      style={[styles.statusSelectBtn, active && { backgroundColor: colors.morning, borderColor: colors.morning }]}
                    >
                      <Text style={[styles.statusSelectText, active && { color: colors.bg }]}>
                        {s.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {editStatus === "sick" && (
                <Text style={{ color: colors.sick, fontSize: 11, fontWeight: "700", marginBottom: 10 }}>
                  Saving Sick creates an approved one-day sick record and deducts 1 day from the employee's sick balance.
                </Text>
              )}

              <Text style={styles.modalLabel}>Clock In (HH:MM - 24h)</Text>
              <TextInput
                style={styles.modalInput}
                value={editClockIn}
                onChangeText={setEditClockIn}
                placeholder="07:00"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.modalLabel}>Clock Out (HH:MM - 24h)</Text>
              <TextInput
                style={styles.modalInput}
                value={editClockOut}
                onChangeText={setEditClockOut}
                placeholder="16:00"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.modalLabel}>Hours Worked (Leave empty for auto-calculate)</Text>
              <TextInput
                style={styles.modalInput}
                value={editHours}
                onChangeText={setEditHours}
                placeholder="9.0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.modalLabel}>Notes</Text>
              <TextInput
                style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add manual notes"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                {editRecord && (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { flex: 1 }]}
                    onPress={deleteAttendanceRecord}
                    disabled={deletingAttendance}
                  >
                    {deletingAttendance ? <ActivityIndicator color={colors.bg} /> : (
                      <>
                        <Ionicons name="trash" size={16} color={colors.bg} />
                        <Text style={styles.grantBtnText}>DELETE</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: editRecord ? 2 : 1 }]}
                  onPress={saveAttendance}
                  disabled={savingAttendance}
                >
                  {savingAttendance ? <ActivityIndicator color={colors.bg} /> : (
                    <>
                      <Ionicons name="save" size={16} color={colors.bg} />
                      <Text style={styles.grantBtnText}>SAVE RECORD</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView></View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function BigStat({ label, value, color, icon }: any) {
  const { theme } = useThemeMode();
  return (
    <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]} testID={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLab, { color: theme.muted }]}>{label}</Text>
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
  leaveRecordRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 4,
  },
  leaveRecordTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  leaveRecordMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  leaveRecordReason: { color: colors.textPrimary, fontSize: 11, marginTop: 5 },
  leaveRecordStatus: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginLeft: 8 },
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
  addManualBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.morning, height: 42, borderRadius: 6, marginTop: 12, marginBottom: 12,
  },
  addManualText: { color: colors.bg, fontWeight: "900", letterSpacing: 0.8, fontSize: 12 },
  readOnlyBox: {
    height: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, justifyContent: "center", paddingHorizontal: 14, marginBottom: 8,
  },
  readOnlyText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
  userChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    backgroundColor: colors.surfaceHi,
  },
  userChipActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  userChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  statusSelectRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  statusSelectBtn: {
    flex: 1, height: 38, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHi,
  },
  statusSelectText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  modalInput: { height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 8, fontSize: 15 },
  saveBtn: {
    height: 48, backgroundColor: colors.morning, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, borderRadius: 4,
  },
  deleteBtn: {
    height: 48, backgroundColor: colors.danger, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, borderRadius: 4,
  },
  grantBtnText: { color: colors.bg, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});
