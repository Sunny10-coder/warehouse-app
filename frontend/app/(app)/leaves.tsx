import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, leaveLabel, leaveColor } from "@/src/theme";

const LEAVE_TYPES: { key: string; label: string; icon: any }[] = [
  { key: "annual", label: "Annual Vacation", icon: "airplane" },
  { key: "sick", label: "Sick Leave", icon: "medkit" },
  { key: "comp_off", label: "Comp Off", icon: "swap-horizontal" },
  { key: "emergency", label: "Emergency", icon: "warning" },
];

export default function Leaves() {
  const { user, refresh } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/leaves");
      setLeaves(r.data);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  const submit = async () => {
    if (!startDate || !endDate || !reason) {
      setError("All fields are required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/leaves", {
        leave_type: type,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      setShowModal(false);
      setStartDate(""); setEndDate(""); setReason(""); setType("annual");
      Alert.alert("Submitted", "Your leave request has been submitted for approval.");
      await load();
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.overline}>LEAVES</Text>
          <Text style={styles.title}>My Requests</Text>
        </View>
        <TouchableOpacity testID="leaves-new-btn" style={styles.newBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={20} color={colors.bg} />
          <Text style={styles.newBtnText}>APPLY</Text>
        </TouchableOpacity>
      </View>

      {/* Balance pills */}
      <View style={styles.balanceRow}>
        <BalancePill label="Annual" value={user?.annual_leave_balance ?? 0} color={colors.annual} />
        <BalancePill label="Sick" value={user?.sick_leave_balance ?? 0} color={colors.sick} />
        <BalancePill label="Comp Off" value={user?.comp_off_balance ?? 0} color={colors.compOff} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {leaves.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="airplane-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No leave requests yet</Text>
            <Text style={styles.emptySub}>Tap APPLY to submit a new request</Text>
          </View>
        ) : leaves.map((l, i) => (
          <View key={l.id} style={[styles.card, { borderLeftColor: leaveColor(l.leave_type) }]} testID={`leave-item-${i}`}>
            <View style={styles.cardTop}>
              <View>
                <Text style={[styles.leaveType, { color: leaveColor(l.leave_type) }]}>
                  {leaveLabel[l.leave_type]}
                </Text>
                <Text style={styles.leaveDates}>
                  {l.start_date} → {l.end_date} · {l.days} day{l.days > 1 ? "s" : ""}
                </Text>
              </View>
              <StatusBadge status={l.status} />
            </View>
            <Text style={styles.reason}>{l.reason}</Text>
            {l.approval_notes && (
              <Text style={styles.approverNote}>Note: {l.approval_notes}</Text>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Leave Request</Text>
              <TouchableOpacity testID="leave-close" onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Leave Type</Text>
            <View style={styles.typeGrid}>
              {LEAVE_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  testID={`leave-type-${t.key}`}
                  onPress={() => setType(t.key)}
                  style={[
                    styles.typeChip,
                    type === t.key && { borderColor: leaveColor(t.key), backgroundColor: `${leaveColor(t.key)}22` },
                  ]}
                >
                  <Ionicons name={t.icon} size={14} color={type === t.key ? leaveColor(t.key) : colors.textSecondary} />
                  <Text style={[styles.typeChipText, type === t.key && { color: leaveColor(t.key) }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              testID="leave-start-date"
              style={styles.modalInput}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-06-01"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.modalLabel}>End Date</Text>
            <TextInput
              testID="leave-end-date"
              style={styles.modalInput}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-06-03"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              testID="leave-reason"
              style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder="Briefly explain the reason"
              placeholderTextColor={colors.textMuted}
            />

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              testID="leave-submit"
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.bg} /> :
                <Text style={styles.submitBtnText}>SUBMIT REQUEST</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BalancePill({ label, value, color }: any) {
  return (
    <View style={[styles.balancePill, { borderColor: color }]}>
      <Text style={styles.balanceValue}>{value}</Text>
      <Text style={[styles.balanceLabel, { color }]}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: any) {
  const map: any = {
    pending: { c: colors.warning, txt: "PENDING" },
    approved: { c: colors.success, txt: "APPROVED" },
    rejected: { c: colors.danger, txt: "REJECTED" },
  };
  const m = map[status] || map.pending;
  return (
    <View style={[styles.statusBadge, { borderColor: m.c, backgroundColor: `${m.c}22` }]}>
      <Text style={[styles.statusText, { color: m.c }]}>{m.txt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 20, paddingBottom: 12 },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
  newBtn: {
    flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: colors.textPrimary,
    paddingHorizontal: 14, height: 40, borderRadius: 4,
  },
  newBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  balanceRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 8 },
  balancePill: {
    flex: 1, borderWidth: 1, borderRadius: 4, padding: 12, alignItems: "center",
    backgroundColor: colors.surface,
  },
  balanceValue: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  balanceLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  empty: { alignItems: "center", padding: 60, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: 12 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4,
    borderRadius: 6, padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  leaveType: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  leaveDates: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  reason: { color: colors.textPrimary, fontSize: 13, marginTop: 8 },
  approverNote: { color: colors.textMuted, fontStyle: "italic", fontSize: 12, marginTop: 6 },
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "92%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 6 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surfaceHi,
  },
  typeChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  modalInput: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 8, fontSize: 15,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
    backgroundColor: "rgba(255,59,48,0.1)", borderColor: colors.danger, borderWidth: 1,
    borderRadius: 4, marginVertical: 8,
  },
  errorText: { color: colors.danger, fontSize: 12, flex: 1 },
  submitBtn: {
    height: 52, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center",
    borderRadius: 4, marginTop: 12,
  },
  submitBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5 },
});
