import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, TextInput, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, shiftLabel, shiftColor, leaveLabel, leaveColor } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

const LEAVE_TYPES = [
  { key: "annual", icon: "airplane" },
  { key: "sick", icon: "medkit" },
  { key: "comp_off", icon: "swap-horizontal" },
  { key: "emergency", icon: "warning" },
] as const;

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default function Attendance() {
  const { user } = useAuth();
  const { theme } = useThemeMode();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaySched, setTodaySched] = useState<any>(null);
  const [todayMarked, setTodayMarked] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]["key"]>("sick");
  const [leaveStart, setLeaveStart] = useState(todayStr());
  const [leaveEnd, setLeaveEnd] = useState(todayStr());
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const monthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = todayStr();
      const [att, sched] = await Promise.all([
        api.get("/attendance", { params: { start_date: monthStart, end_date: today, user_id: user.id } }),
        api.get("/schedules", { params: { start_date: today, end_date: today, user_id: user?.id } }),
      ]);
      setRecords(att.data);
      setTodaySched(sched.data.find((s: any) => s.user_id === user.id) || sched.data[0] || null);
      setTodayMarked(att.data.find((a: any) => a.user_id === user.id && a.attendance_date === today) || null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id, monthStart]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["attendance", "schedules", "leaves"]);

  const quickMark = async (status: string) => {
    setSubmitting(true);
    try {
      await api.post("/attendance", { attendance_date: todayStr(), status });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const clockInNow = async () => {
    setSubmitting(true);
    try {
      await api.post("/attendance", {
        attendance_date: todayStr(),
        status: todayMarked?.status || "present",
        clock_in: currentTimeStr(),
      });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const clockOutNow = async () => {
    setSubmitting(true);
    try {
      await api.post("/attendance", {
        attendance_date: todayStr(),
        status: todayMarked?.status || "present",
        clock_out: currentTimeStr(),
      });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitClockInOut = async () => {
    const inTime = clockIn.trim();
    const outTime = clockOut.trim();
    if (!inTime && !outTime) {
      setError("Enter clock in or clock out time (HH:MM)");
      return;
    }
    if ((inTime && !validTime(inTime)) || (outTime && !validTime(outTime))) {
      setError("Use 24-hour HH:MM format, for example 07:30 or 16:45");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/attendance", {
        attendance_date: todayStr(),
        status: todayMarked?.status || "present",
        ...(inTime ? { clock_in: inTime } : {}),
        ...(outTime ? { clock_out: outTime } : {}),
      });
      setShowModal(false);
      setClockIn(""); setClockOut("");
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openLeaveModal = () => {
    const today = todayStr();
    setLeaveType("sick");
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveReason("");
    setLeaveError(null);
    setShowLeaveModal(true);
  };

  const submitLeaveRequest = async () => {
    const start = leaveStart.trim();
    const end = leaveEnd.trim();
    const reason = leaveReason.trim();
    if (!start || !end) {
      setLeaveError("Enter start date and end date");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      setLeaveError("Use date format YYYY-MM-DD");
      return;
    }
    if (!reason) {
      setLeaveError("Enter the leave reason");
      return;
    }
    setLeaveError(null);
    setSubmitting(true);
    try {
      await api.post("/leaves", {
        leave_type: leaveType,
        start_date: start,
        end_date: end,
        reason,
      });
      setShowLeaveModal(false);
      setLeaveReason("");
      Alert.alert("Submitted", "Leave request sent for approval.");
      await load();
    } catch (e) {
      setLeaveError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const totalHours = records.reduce((s, r) => s + (r.hours_worked || 0), 0);
  const presentCount = records.filter(r => r.status === "present").length;
  const canClockIn = !todayMarked?.clock_in;
  const canClockOut = !todayMarked?.clock_out;

  const sc = shiftColor(todaySched?.shift_type);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        <Text style={styles.overline}>ATTENDANCE</Text>
        <Text style={styles.title}>Today · {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>

        {/* Today card */}
        <View style={[styles.todayCard, { borderLeftColor: sc.c, backgroundColor: theme.surface, borderColor: theme.border }]}>
          {todaySched ? (
            <>
              <Text style={[styles.scheduledLabel, { color: sc.c }]}>
                SCHEDULED: {shiftLabel[todaySched.shift_type] || todaySched.shift_type}
              </Text>
              {todaySched.start_time && (
                <Text style={styles.scheduledTime}>{todaySched.start_time} – {todaySched.end_time}</Text>
              )}
            </>
          ) : (
            <Text style={styles.scheduledLabel}>NO SHIFT SCHEDULED TODAY</Text>
          )}

          {todayMarked ? (
            <View style={styles.markedBox}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.markedStatus}>
                  Marked: <Text style={styles.markedStatusBold}>{todayMarked.status.toUpperCase()}</Text>
                </Text>
                {todayMarked.clock_in && (
                  <Text style={styles.markedDetail}>
                    {todayMarked.clock_in} – {todayMarked.clock_out || "..."} · {todayMarked.hours_worked}h
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.unmarkedText}>Not marked yet</Text>
          )}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="attendance-clock-in-now"
              style={[styles.actionBtn, { backgroundColor: colors.morning }, (!canClockIn || submitting) && styles.actionBtnDisabled]}
              onPress={clockInNow}
              disabled={!canClockIn || submitting}
            >
              <Ionicons name="enter" size={18} color={colors.bg} />
              <Text style={styles.actionBtnText}>CLOCK IN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="attendance-clock-out-now"
              style={[styles.actionBtn, { backgroundColor: colors.danger }, (!canClockOut || submitting) && styles.actionBtnDisabled]}
              onPress={clockOutNow}
              disabled={!canClockOut || submitting}
            >
              <Ionicons name="exit" size={18} color={colors.bg} />
              <Text style={styles.actionBtnText}>CLOCK OUT</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="attendance-mark-present"
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => quickMark("present")}
              disabled={submitting}
            >
              <Ionicons name="checkmark" size={18} color={colors.bg} />
              <Text style={styles.actionBtnText}>PRESENT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="attendance-mark-late"
              style={[styles.actionBtn, { backgroundColor: colors.warning }]}
              onPress={() => quickMark("late")}
              disabled={submitting}
            >
              <Ionicons name="time" size={18} color={colors.bg} />
              <Text style={styles.actionBtnText}>LATE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="attendance-clock-in-out"
              style={[styles.actionBtn, { backgroundColor: colors.textPrimary }]}
              onPress={() => {
                setError(null);
                setClockIn("");
                setClockOut("");
                setShowModal(true);
              }}
              disabled={submitting}
            >
              <Ionicons name="hourglass" size={16} color={colors.bg} />
              <Text style={styles.actionBtnText}>MANUAL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="attendance-leave-request"
              style={[styles.actionBtn, { backgroundColor: colors.compOff }]}
              onPress={openLeaveModal}
              disabled={submitting}
            >
              <Ionicons name="calendar-clear" size={16} color={colors.bg} />
              <Text style={styles.actionBtnText}>LEAVE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Month stats */}
        <Text style={styles.overline}>THIS MONTH</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{totalHours.toFixed(1)}h</Text>
            <Text style={styles.statLab}>Total Hours</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{presentCount}</Text>
            <Text style={styles.statLab}>Days Present</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{records.length}</Text>
            <Text style={styles.statLab}>Total Marked</Text>
          </View>
        </View>

        {/* History */}
        <Text style={styles.overline}>HISTORY</Text>
        {records.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No attendance records yet this month</Text>
          </View>
        ) : (
          records.slice().reverse().map((r, i) => {
            const c = shiftColor(r.shift_type);
            const statusColor =
              r.status === "present" ? colors.success :
              r.status === "late" ? colors.warning :
              r.status === "absent" ? colors.danger : colors.textSecondary;
            return (
              <View key={i} style={[styles.historyRow, { backgroundColor: theme.surface, borderColor: theme.border }]} testID={`attendance-record-${i}`}>
                <View style={[styles.dateBlock, { borderColor: c.c }]}>
                  <Text style={styles.dateDay}>{new Date(r.attendance_date).getDate()}</Text>
                  <Text style={styles.dateMonth}>
                    {new Date(r.attendance_date).toLocaleString(undefined, { month: "short" }).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyShift}>{shiftLabel[r.shift_type] || "—"}</Text>
                  <Text style={[styles.historyStatus, { color: statusColor }]}>
                    {r.status.toUpperCase()}
                    {r.clock_in && ` · ${r.clock_in}-${r.clock_out}`}
                  </Text>
                </View>
                <Text style={styles.historyHours}>{r.hours_worked}h</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Clock In/Out Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manual Attendance</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Enter one or both times. Existing saved time stays unchanged if left blank.</Text>
            <Text style={styles.modalLabel}>Clock In (HH:MM)</Text>
            <TextInput
              testID="clock-in-input"
              style={styles.modalInput}
              value={clockIn}
              onChangeText={setClockIn}
              placeholder="07:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            <Text style={styles.modalLabel}>Clock Out (HH:MM)</Text>
            <TextInput
              testID="clock-out-input"
              style={styles.modalInput}
              value={clockOut}
              onChangeText={setClockOut}
              placeholder="16:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            {error && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
            <TouchableOpacity
              testID="clock-submit"
              style={styles.modalBtn}
              onPress={submitClockInOut}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.bg} /> :
                <Text style={styles.modalBtnText}>SUBMIT ATTENDANCE</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Leave Request Modal */}
      <Modal visible={showLeaveModal} transparent animationType="fade" onRequestClose={() => setShowLeaveModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Leave</Text>
              <TouchableOpacity onPress={() => setShowLeaveModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Select the leave type and dates. Approved leave updates schedule, calendar, and reports.</Text>
            <Text style={styles.modalLabel}>Leave Type</Text>
            <View style={styles.leaveTypeGrid}>
              {LEAVE_TYPES.map((t) => {
                const selected = leaveType === t.key;
                const c = leaveColor(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    testID={`attendance-leave-type-${t.key}`}
                    style={[
                      styles.leaveTypeChip,
                      { borderColor: selected ? c : colors.border, backgroundColor: selected ? `${c}22` : colors.surfaceHi },
                    ]}
                    onPress={() => setLeaveType(t.key)}
                  >
                    <Ionicons name={t.icon as any} size={16} color={c} />
                    <Text style={[styles.leaveTypeText, { color: selected ? colors.textPrimary : colors.textSecondary }]}>
                      {leaveLabel[t.key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalLabel}>Start Date</Text>
            <TextInput
              testID="attendance-leave-start"
              style={styles.modalInput}
              value={leaveStart}
              onChangeText={setLeaveStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.modalLabel}>End Date</Text>
            <TextInput
              testID="attendance-leave-end"
              style={styles.modalInput}
              value={leaveEnd}
              onChangeText={setLeaveEnd}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              testID="attendance-leave-reason"
              style={[styles.modalInput, styles.reasonInput]}
              value={leaveReason}
              onChangeText={setLeaveReason}
              placeholder="Reason for leave"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            {leaveError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>{leaveError}</Text>}
            <TouchableOpacity
              testID="attendance-leave-submit"
              style={styles.modalBtn}
              onPress={submitLeaveRequest}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.bg} /> :
                <Text style={styles.modalBtnText}>SUBMIT LEAVE</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  todayCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4,
    borderRadius: 8, padding: 18, marginTop: 14,
  },
  scheduledLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.textSecondary },
  scheduledTime: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 4 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  actionBtn: {
    flexGrow: 1, minWidth: 112, height: 44, borderRadius: 4, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  markedBox: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14,
    padding: 12, backgroundColor: colors.surfaceHi, borderRadius: 4,
  },
  markedStatus: { color: colors.textSecondary, fontSize: 13 },
  markedStatusBold: { color: colors.success, fontWeight: "800" },
  markedDetail: { color: colors.textPrimary, fontSize: 13, marginTop: 2 },
  unmarkedText: { color: colors.textSecondary, fontSize: 13, marginTop: 14 },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, padding: 14,
  },
  statVal: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  statLab: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  empty: { alignItems: "center", padding: 30, gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  historyRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
  },
  dateBlock: {
    width: 48, alignItems: "center", paddingVertical: 6, borderWidth: 1, borderRadius: 4, marginRight: 12,
  },
  dateDay: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  dateMonth: { color: colors.textMuted, fontSize: 9, letterSpacing: 1 },
  historyShift: { color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
  historyStatus: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  historyHours: { color: colors.morning, fontWeight: "800", fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  modalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 20,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  modalHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  modalInput: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 14, fontSize: 15,
  },
  reasonInput: { minHeight: 78, paddingTop: 12, textAlignVertical: "top" },
  leaveTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  leaveTypeChip: {
    minHeight: 42, minWidth: 132, flexGrow: 1, borderWidth: 1, borderRadius: 4,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10,
  },
  leaveTypeText: { fontSize: 12, fontWeight: "800" },
  modalBtn: {
    height: 48, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  modalBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5 },
});
