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
import { colors, shiftLabel, shiftColor } from "@/src/theme";

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function Attendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaySched, setTodaySched] = useState<any>(null);
  const [todayMarked, setTodayMarked] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const monthStart = (() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();

  const load = useCallback(async () => {
    try {
      const today = todayStr();
      const [att, sched] = await Promise.all([
        api.get("/attendance", { params: { start_date: monthStart, end_date: today } }),
        api.get("/schedules", { params: { start_date: today, end_date: today, user_id: user?.id } }),
      ]);
      setRecords(att.data);
      setTodaySched(sched.data[0] || null);
      setTodayMarked(att.data.find((a: any) => a.attendance_date === today) || null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id, monthStart]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  const submitClockInOut = async () => {
    if (!clockIn || !clockOut) {
      setError("Enter both clock in and clock out time (HH:MM)");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/attendance", {
        attendance_date: todayStr(),
        status: "present",
        clock_in: clockIn,
        clock_out: clockOut,
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

  const totalHours = records.reduce((s, r) => s + (r.hours_worked || 0), 0);
  const presentCount = records.filter(r => r.status === "present").length;

  const sc = shiftColor(todaySched?.shift_type);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        <Text style={styles.overline}>ATTENDANCE</Text>
        <Text style={styles.title}>Today · {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>

        {/* Today card */}
        <View style={[styles.todayCard, { borderLeftColor: sc.c }]}>
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
                    {todayMarked.clock_in} – {todayMarked.clock_out} · {todayMarked.hours_worked}h
                  </Text>
                )}
              </View>
            </View>
          ) : (
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
                onPress={() => setShowModal(true)}
              >
                <Ionicons name="hourglass" size={16} color={colors.bg} />
                <Text style={styles.actionBtnText}>CLOCK</Text>
              </TouchableOpacity>
            </View>
          )}
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
              <View key={i} style={styles.historyRow} testID={`attendance-record-${i}`}>
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
              <Text style={styles.modalTitle}>Clock In / Out</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Clock In (HH:MM)</Text>
            <TextInput
              testID="clock-in-input"
              style={styles.modalInput}
              value={clockIn}
              onChangeText={setClockIn}
              placeholder="07:00"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.modalLabel}>Clock Out (HH:MM)</Text>
            <TextInput
              testID="clock-out-input"
              style={styles.modalInput}
              value={clockOut}
              onChangeText={setClockOut}
              placeholder="16:00"
              placeholderTextColor={colors.textMuted}
            />
            {error && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
            <TouchableOpacity
              testID="clock-submit"
              style={styles.modalBtn}
              onPress={submitClockInOut}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.bg} /> :
                <Text style={styles.modalBtnText}>SUBMIT</Text>}
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
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  actionBtn: {
    flex: 1, height: 44, borderRadius: 4, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  markedBox: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14,
    padding: 12, backgroundColor: colors.surfaceHi, borderRadius: 4,
  },
  markedStatus: { color: colors.textSecondary, fontSize: 13 },
  markedStatusBold: { color: colors.success, fontWeight: "800" },
  markedDetail: { color: colors.textPrimary, fontSize: 13, marginTop: 2 },
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
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  modalInput: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 14, fontSize: 15,
  },
  modalBtn: {
    height: 48, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  modalBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5 },
});
