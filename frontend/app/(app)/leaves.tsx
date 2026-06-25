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
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, leaveLabel, leaveColor, appTheme } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";
import { SectionRow } from "@/src/components/SectionRow";

const LEAVE_TYPES: { key: string; label: string; icon: any }[] = [
  { key: "annual", label: "Annual Vacation", icon: "airplane" },
  { key: "sick", label: "Sick Leave", icon: "medkit" },
  { key: "comp_off", label: "Comp Off", icon: "swap-horizontal" },
  { key: "emergency", label: "Emergency", icon: "warning" },
];

export default function Leaves() {
  const { user, refresh, isAdmin } = useAuth();
  const { theme } = useThemeMode();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [shortage, setShortage] = useState<any>(null);
  const [swapCandidates, setSwapCandidates] = useState<any[]>([]);
  const [selectedSwapUser, setSelectedSwapUser] = useState("");
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
      const [leaveResult, swapResult] = await Promise.all([
        api.get("/leaves"),
        api.get("/swaps"),
      ]);
      setLeaves(leaveResult.data || []);
      setSwaps(swapResult.data || []);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));
  useRealtimeRefresh(load, ["leaves", "users", "swaps"]);

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
      const detail = (e as any)?.response?.data?.detail;
      if (detail?.error === "coverage_insufficient") {
        const firstDate = detail.dates?.[0];
        setShortage({ ...detail, start_date: startDate, end_date: endDate, reason });
        setSwapCandidates(firstDate ? (detail.swap_candidates?.[firstDate] || []) : []);
        setSelectedSwapUser("");
        setShowModal(false);
      } else {
        setError(errMsg(e));
      }
    } finally {
      setSubmitting(false);
    }
  };


  const submitEmergency = async () => {
    if (!shortage) return;
    setSubmitting(true);
    try {
      await api.post("/leaves", {
        leave_type: "emergency",
        start_date: shortage.start_date,
        end_date: shortage.end_date,
        reason: shortage.reason,
      });
      setShortage(null);
      Alert.alert("Emergency request submitted", "The request was sent for admin approval.");
      await load();
    } catch (e) {
      Alert.alert("Could not submit", errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitSwap = async () => {
    if (!shortage || !selectedSwapUser) {
      Alert.alert("Select employee", "Choose an available employee for the swap.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/swaps", {
        swap_user_id: selectedSwapUser,
        shift_date: shortage.dates[0],
        reason: shortage.reason,
      });
      setShortage(null);
      setSelectedSwapUser("");
      Alert.alert("Swap requested", "The selected employee must approve before admin review.");
      await load();
    } catch (e) {
      Alert.alert("Could not request swap", errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const actOnSwap = async (swap: any, action: "approve" | "reject") => {
    try {
      const endpoint = isAdmin ? `/swaps/${swap.id}/admin-action` : `/swaps/${swap.id}/employee-action`;
      await api.post(endpoint, { action });
      await load();
    } catch (e) {
      Alert.alert("Swap action failed", errMsg(e));
    }
  };
  const pendingLeaves = leaves.filter(l => l.status === "pending");
  const approvedLeaves = leaves.filter(l => l.status === "approved");
  const rejectedLeaves = leaves.filter(l => l.status === "rejected");

  const renderLeaveTile = (l: any) => (
    <View style={styles.leaveTile}>
      <View style={[styles.leaveAccent, { backgroundColor: leaveColor(l.leave_type) }]} />
      <Text style={[styles.leaveType, { color: leaveColor(l.leave_type) }]} numberOfLines={1}>
        {leaveLabel[l.leave_type] || l.leave_type}
      </Text>
      <Text style={styles.leaveDates}>
        {l.start_date} → {l.end_date}
      </Text>
      <Text style={styles.leaveDays}>{l.days} day{l.days > 1 ? "s" : ""}</Text>
      <Text style={styles.leaveReason} numberOfLines={2}>{l.reason}</Text>
      {l.approval_notes && (
        <Text style={styles.approverNote} numberOfLines={1}>Note: {l.approval_notes}</Text>
      )}
      <StatusBadge status={l.status} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
        <View>
          <Text style={styles.overline}>LEAVES</Text>
          <Text style={[styles.title, { color: theme.text }]}>My Requests</Text>
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
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        <View style={{ height: 20 }} />


        <SectionRow
          title="Swap Requests"
          data={swaps}
          keyExtractor={(item) => item.id}
          emptyText="No swap requests"
          renderItem={(item) => (
            <View style={[styles.swapTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.swapIcon}><Ionicons name="swap-horizontal" size={18} color="#C084FC" /></View>
              <Text style={[styles.swapTitle, { color: theme.text }]}>{item.requester_name}</Text>
              <Text style={[styles.swapMeta, { color: theme.muted }]}>{item.shift_date}</Text>
              <Text style={styles.swapRoute}>{item.requester_original_shift.toUpperCase()} → {item.swap_user_original_shift.toUpperCase()}</Text>
              <Text style={[styles.swapMeta, { color: theme.muted }]} numberOfLines={2}>With {item.swap_user_name}</Text>
              <SwapStatus status={item.status} />
              {item.status === "pending_employee_approval" && item.swap_user_id === user?.id && (
                <View style={styles.swapActions}>
                  <TouchableOpacity style={[styles.swapAction, { backgroundColor: colors.danger }]} onPress={() => actOnSwap(item, "reject")}><Text style={styles.swapActionText}>Reject</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.swapAction, { backgroundColor: colors.success }]} onPress={() => actOnSwap(item, "approve")}><Text style={styles.swapActionText}>Approve</Text></TouchableOpacity>
                </View>
              )}
              {isAdmin && item.status === "pending_admin_approval" && (
                <View style={styles.swapActions}>
                  <TouchableOpacity style={[styles.swapAction, { backgroundColor: colors.danger }]} onPress={() => actOnSwap(item, "reject")}><Text style={styles.swapActionText}>Reject</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.swapAction, { backgroundColor: colors.success }]} onPress={() => actOnSwap(item, "approve")}><Text style={styles.swapActionText}>Execute</Text></TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
        <SectionRow
          title="Pending Requests"
          data={pendingLeaves}
          keyExtractor={(l) => l.id}
          emptyText="No pending leave requests"
          renderItem={renderLeaveTile}
        />

        <SectionRow
          title="Approved Leaves"
          data={approvedLeaves}
          keyExtractor={(l) => l.id}
          emptyText="No approved leaves"
          renderItem={renderLeaveTile}
        />

        {rejectedLeaves.length > 0 && (
          <SectionRow
            title="Rejected Leaves"
            data={rejectedLeaves}
            keyExtractor={(l) => l.id}
            renderItem={renderLeaveTile}
          />
        )}
      </ScrollView>


      <Modal visible={!!shortage} transparent animationType="slide" onRequestClose={() => setShortage(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Coverage issue</Text>
                <Text style={[styles.shortageText, { color: theme.muted }]}>Your leave balance is valid, but approving these dates would reduce the assigned shift below minimum staffing. Continue as Emergency Leave or arrange a Swap Request.</Text>
              </View>
              <TouchableOpacity onPress={() => setShortage(null)}><Ionicons name="close" size={22} color={theme.muted} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.emergencyBtn} onPress={submitEmergency} disabled={submitting}>
              <Ionicons name="warning" size={18} color="#fff" />
              <Text style={styles.emergencyText}>SUBMIT EMERGENCY LEAVE</Text>
            </TouchableOpacity>
            <Text style={styles.modalLabel}>AVAILABLE SWAP STAFF</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.candidateRow}>
              {swapCandidates.map(candidate => {
                const active = selectedSwapUser === candidate.user_id;
                return (
                  <TouchableOpacity key={candidate.user_id} onPress={() => setSelectedSwapUser(candidate.user_id)} style={[styles.candidateCard, { borderColor: active ? "#C084FC" : theme.border, backgroundColor: active ? "rgba(192,132,252,0.16)" : theme.surfaceHi }]}>
                    <View style={styles.candidateAvatar}><Text style={styles.candidateInitial}>{candidate.user_name.slice(0, 1)}</Text></View>
                    <Text style={[styles.candidateName, { color: theme.text }]} numberOfLines={1}>{candidate.user_name}</Text>
                    <Text style={styles.candidateShift}>{candidate.current_shift.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[styles.swapSubmitBtn, !selectedSwapUser && { opacity: 0.45 }]} onPress={submitSwap} disabled={!selectedSwapUser || submitting}>
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
              <Text style={styles.emergencyText}>SEND SWAP REQUEST</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>New Leave Request</Text>
              <TouchableOpacity testID="leave-close" onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={theme.muted} />
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
              style={[styles.modalInput, { backgroundColor: theme.surfaceHi, borderColor: theme.border, color: theme.text }]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.modalLabel}>End Date</Text>
            <TextInput
              testID="leave-end-date"
              style={[styles.modalInput, { backgroundColor: theme.surfaceHi, borderColor: theme.border, color: theme.text }]}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              testID="leave-reason"
              style={[styles.modalInput, { height: 80, textAlignVertical: "top", backgroundColor: theme.surfaceHi, borderColor: theme.border, color: theme.text }]}
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


function SwapStatus({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending_employee_approval: "EMPLOYEE APPROVAL",
    pending_admin_approval: "ADMIN APPROVAL",
    executed: "EXECUTED",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
  };
  const color = status === "executed" ? colors.success : status === "rejected" || status === "cancelled" ? colors.danger : colors.warning;
  return <Text style={[styles.swapStatus, { color, borderColor: color }]}>{label[status] || status.toUpperCase()}</Text>;
}
function BalancePill({ label, value, color }: any) {
  const { theme } = useThemeMode();
  return (
    <View style={[styles.balancePill, { borderColor: color, backgroundColor: theme.surface, borderWidth: 1 }]}>
      <Text style={[styles.balanceValue, { color: theme.text }]}>{value}</Text>
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
  swapTile: { width: 220, borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 },
  swapIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(192,132,252,0.14)", alignItems: "center", justifyContent: "center" },
  swapTitle: { fontSize: 14, fontWeight: "900" },
  swapMeta: { fontSize: 11 },
  swapRoute: { color: "#C084FC", fontSize: 12, fontWeight: "900" },
  swapStatus: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 8, fontWeight: "900", marginTop: 4 },
  swapActions: { flexDirection: "row", gap: 7, marginTop: 7 },
  swapAction: { flex: 1, minHeight: 34, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  swapActionText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  shortageText: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  emergencyBtn: { minHeight: 48, borderRadius: 10, backgroundColor: colors.emergency, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emergencyText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  candidateRow: { gap: 9, paddingVertical: 4, paddingRight: 20 },
  candidateCard: { width: 118, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 5 },
  candidateAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#C084FC", alignItems: "center", justifyContent: "center" },
  candidateInitial: { color: "#fff", fontSize: 16, fontWeight: "900" },
  candidateName: { fontSize: 11, fontWeight: "800", maxWidth: 98 },
  candidateShift: { color: "#C084FC", fontSize: 9, fontWeight: "900" },
  swapSubmitBtn: { minHeight: 48, borderRadius: 10, backgroundColor: "#7C3AED", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14 },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 20, paddingBottom: 12 },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
  newBtn: {
    flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: colors.textPrimary,
    paddingHorizontal: 14, height: 40, borderRadius: 4,
  },
  newBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  balanceRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 8, marginTop: 12 },
  balancePill: {
    flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: "center",
    backgroundColor: colors.surface,
  },
  balanceValue: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  balanceLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  
  leaveTile: {
    width: 200,
    backgroundColor: appTheme.surface,
    borderColor: appTheme.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  leaveAccent: {
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  leaveType: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  leaveDates: { color: appTheme.text, fontSize: 12, marginTop: 4, fontWeight: "600" },
  leaveDays: { color: appTheme.muted, fontSize: 11 },
  leaveReason: { color: appTheme.muted, fontSize: 11, marginTop: 8, fontStyle: "italic" },
  approverNote: { color: appTheme.muted, fontSize: 11, marginTop: 4, fontWeight: "600" },
  
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: "flex-start", marginTop: 10 },
  statusText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  
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
