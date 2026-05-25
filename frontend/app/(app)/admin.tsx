import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { colors, leaveLabel, leaveColor, roleLabel, shiftLabel } from "@/src/theme";

const SHIFT_OPTIONS = ["morning", "afternoon", "night", "admin", "ega", "off"];

type Tab = "leaves" | "users" | "schedule";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("leaves");
  const [users, setUsers] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<any>(null);
  const [genStart, setGenStart] = useState("");
  const [genTeam, setGenTeam] = useState<"A" | "B">("A");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        api.get("/users"),
        api.get("/leaves", { params: { status_filter: "pending" } }),
      ]);
      setUsers(u.data);
      setLeaves(l.data);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approveLeave = async (id: string) => {
    try {
      await api.post(`/leaves/${id}/action`, { action: "approve" });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    }
  };
  const rejectLeave = async (id: string) => {
    try {
      await api.post(`/leaves/${id}/action`, { action: "reject" });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    }
  };

  const approveUser = async (id: string) => {
    try {
      await api.post(`/users/${id}/approve`);
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    }
  };

  const generate = async () => {
    if (!genStart) {
      Alert.alert("Required", "Enter start date (Monday, YYYY-MM-DD)");
      return;
    }
    setGenerating(true);
    try {
      const r = await api.post("/schedules/generate", {
        start_date: genStart,
        weeks: 2,
        active_saturday_team: genTeam,
      });
      Alert.alert("Generated", `${r.data.generated} shift entries over ${r.data.days} days created.`);
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setGenerating(false);
    }
  };

  const pendingUsers = users.filter(u => u.status === "pending");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.overline}>ADMIN CONSOLE</Text>
        <Text style={styles.title}>Manage Operations</Text>
      </View>

      <View style={styles.tabRow}>
        <TabBtn id="leaves" tab={tab} setTab={setTab} label="LEAVES" badge={leaves.length} />
        <TabBtn id="users" tab={tab} setTab={setTab} label="STAFF" badge={pendingUsers.length} />
        <TabBtn id="schedule" tab={tab} setTab={setTab} label="SCHEDULE" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {tab === "leaves" && (
          <>
            {leaves.length === 0 ? (
              <Empty icon="checkmark-done" text="No pending leave requests" />
            ) : leaves.map(l => (
              <View key={l.id} style={[styles.card, { borderLeftColor: leaveColor(l.leave_type) }]} testID={`pending-leave-${l.id}`}>
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.userName}>{l.user_name}</Text>
                    <Text style={[styles.leaveType, { color: leaveColor(l.leave_type) }]}>
                      {leaveLabel[l.leave_type]} · {l.days} day{l.days > 1 ? "s" : ""}
                    </Text>
                    <Text style={styles.dates}>{l.start_date} → {l.end_date}</Text>
                  </View>
                </View>
                <Text style={styles.reason}>{l.reason}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    testID={`reject-leave-${l.id}`}
                    style={[styles.btnSm, { backgroundColor: colors.surfaceHi, borderColor: colors.danger }]}
                    onPress={() => rejectLeave(l.id)}
                  >
                    <Ionicons name="close" size={16} color={colors.danger} />
                    <Text style={[styles.btnSmText, { color: colors.danger }]}>REJECT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`approve-leave-${l.id}`}
                    style={[styles.btnSm, { backgroundColor: colors.success }]}
                    onPress={() => approveLeave(l.id)}
                  >
                    <Ionicons name="checkmark" size={16} color={colors.bg} />
                    <Text style={[styles.btnSmText, { color: colors.bg }]}>APPROVE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "users" && (
          <>
            {pendingUsers.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pending Approval ({pendingUsers.length})</Text>
                {pendingUsers.map(u => (
                  <View key={u.id} style={[styles.card, { borderLeftColor: colors.warning }]}>
                    <View style={styles.cardTop}>
                      <View>
                        <Text style={styles.userName}>{u.full_name}</Text>
                        <Text style={styles.userEmail}>{u.email}</Text>
                      </View>
                      <TouchableOpacity
                        testID={`approve-user-${u.id}`}
                        style={[styles.btnSm, { backgroundColor: colors.success }]}
                        onPress={() => approveUser(u.id)}
                      >
                        <Ionicons name="checkmark" size={16} color={colors.bg} />
                        <Text style={[styles.btnSmText, { color: colors.bg }]}>APPROVE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionTitle}>All Staff ({users.filter(u => u.status === "active").length})</Text>
            {users.filter(u => u.status === "active").map(u => (
              <TouchableOpacity
                key={u.id}
                testID={`user-row-${u.id}`}
                style={styles.userRow}
                onPress={() => setEditUser(u)}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{u.full_name.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.full_name}</Text>
                  <Text style={styles.userMeta}>
                    {roleLabel[u.role]}
                    {u.team ? ` · TEAM ${u.team}` : ""}
                    {u.location === "ega" ? " · EGA" : ""}
                  </Text>
                  {u.default_shift && (
                    <Text style={styles.userShift}>Default: {shiftLabel[u.default_shift] || u.default_shift}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {tab === "schedule" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Auto-Generate Schedule</Text>
            <Text style={styles.helper}>
              Generates a 2-week schedule for all active staff based on their default shift.
              Manager off 1st Sat, Asst+DC off 2nd Sat.
            </Text>

            <Text style={styles.modalLabel}>Start Date (must be a Monday)</Text>
            <TextInput
              testID="generate-start-date"
              value={genStart}
              onChangeText={setGenStart}
              style={styles.modalInput}
              placeholder="2026-06-01"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.modalLabel}>Active Saturday Team (Week 1)</Text>
            <View style={styles.teamRow}>
              {(["A", "B"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  testID={`gen-team-${t}`}
                  onPress={() => setGenTeam(t)}
                  style={[styles.teamBtn, genTeam === t && styles.teamBtnActive]}
                >
                  <Text style={[styles.teamBtnText, genTeam === t && { color: colors.bg }]}>
                    TEAM {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              testID="generate-submit"
              style={[styles.submitBtn, generating && { opacity: 0.6 }]}
              onPress={generate}
              disabled={generating}
            >
              {generating ? <ActivityIndicator color={colors.bg} /> :
                <Text style={styles.submitBtnText}>GENERATE 2-WEEK SCHEDULE</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <UserEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); }} />
    </SafeAreaView>
  );
}

function TabBtn({ id, tab, setTab, label, badge }: any) {
  const active = tab === id;
  return (
    <TouchableOpacity
      testID={`admin-tab-${id}`}
      style={[styles.tab, active && styles.tabActive]}
      onPress={() => setTab(id)}
    >
      <Text style={[styles.tabText, active && { color: colors.bg }]}>{label}</Text>
      {badge > 0 && (
        <View style={[styles.tabBadge, active && { backgroundColor: colors.bg }]}>
          <Text style={[styles.tabBadgeText, active && { color: colors.morning }]}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function Empty({ icon, text }: any) {
  return (
    <View style={{ alignItems: "center", padding: 60, gap: 12 }}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

function UserEditModal({ user, onClose, onSaved }: any) {
  const [shift, setShift] = useState(user?.default_shift || "morning");
  const [team, setTeam] = useState(user?.team || "");
  const [location, setLocation] = useState(user?.location || "warehouse");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, {
        default_shift: shift,
        team: team || null,
        location,
      });
      onSaved();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!user} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{user.full_name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalLabel}>Default Shift</Text>
          <View style={styles.optGrid}>
            {SHIFT_OPTIONS.map(s => (
              <TouchableOpacity
                key={s}
                testID={`edit-shift-${s}`}
                onPress={() => setShift(s)}
                style={[styles.optChip, shift === s && styles.optChipActive]}
              >
                <Text style={[styles.optChipText, shift === s && { color: colors.bg }]}>
                  {shiftLabel[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>Team</Text>
          <View style={styles.optGrid}>
            {["A", "B", ""].map(t => (
              <TouchableOpacity
                key={t || "none"}
                testID={`edit-team-${t || "none"}`}
                onPress={() => setTeam(t)}
                style={[styles.optChip, team === t && styles.optChipActive]}
              >
                <Text style={[styles.optChipText, team === t && { color: colors.bg }]}>
                  {t ? `TEAM ${t}` : "NONE"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>Location</Text>
          <View style={styles.optGrid}>
            {["warehouse", "ega"].map(l => (
              <TouchableOpacity
                key={l}
                testID={`edit-location-${l}`}
                onPress={() => setLocation(l)}
                style={[styles.optChip, location === l && styles.optChipActive]}
              >
                <Text style={[styles.optChipText, location === l && { color: colors.bg }]}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            testID="user-save"
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.bg} /> :
              <Text style={styles.submitBtnText}>SAVE CHANGES</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 20, paddingBottom: 12 },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, gap: 6, marginBottom: 8 },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 40, borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  tabText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  tabBadge: { backgroundColor: colors.danger, paddingHorizontal: 6, borderRadius: 8, minWidth: 18, alignItems: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4,
    borderRadius: 6, padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  userName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  userEmail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  userMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  userShift: { color: colors.morning, fontSize: 11, marginTop: 2, fontWeight: "600" },
  leaveType: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  dates: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  reason: { color: colors.textPrimary, fontSize: 13, marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  btnSm: {
    flex: 1, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center",
    height: 38, borderWidth: 1, borderRadius: 4, borderColor: "transparent",
  },
  btnSmText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 8, marginBottom: 10 },
  userRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8, gap: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 4, backgroundColor: colors.surfaceHi,
    alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1,
  },
  userAvatarText: { color: colors.morning, fontWeight: "800", fontSize: 13 },
  helper: { color: colors.textSecondary, fontSize: 12, marginBottom: 14, lineHeight: 18 },
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 8 },
  modalInput: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 8, fontSize: 15,
  },
  teamRow: { flexDirection: "row", gap: 8 },
  teamBtn: {
    flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 4,
    borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceHi,
  },
  teamBtnActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  teamBtnText: { color: colors.textSecondary, fontWeight: "800", letterSpacing: 1 },
  submitBtn: {
    height: 52, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center",
    borderRadius: 4, marginTop: 16,
  },
  submitBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "92%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  optGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  optChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    backgroundColor: colors.surfaceHi,
  },
  optChipActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  optChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
});
