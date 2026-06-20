import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useRealtimeRefresh } from "@/src/realtime";
import { useThemeMode } from "@/src/theme-context";
import { colors, shiftLabel, shiftColor } from "@/src/theme";

const SHIFT_GROUPS = [
  { key: "morning", title: "MORNING (7-16)", min: 3 },
  { key: "afternoon", title: "AFTERNOON (12-21)", min: 2 },
  { key: "night", title: "NIGHT (21-06)", min: 2 },
  { key: "admin", title: "ADMIN (7:30-16:30)", min: 0 },
  { key: "ega", title: "EGA SITE", min: 0 },
  { key: "sat_day", title: "SAT DAY (6-18)", min: 0 },
  { key: "sat_night", title: "SAT NIGHT (18-6)", min: 0 },
  { key: "sun_day", title: "SUN DAY (6-18)", min: 0 },
  { key: "sun_night", title: "SUN NIGHT (18-6)", min: 0 },
];

const ASSIGN_OPTIONS = ["morning", "afternoon", "night", "admin", "ega", "sat_day", "sat_night", "sun_day", "sun_night", "off"];
const ADMIN_ROLES = ["manager", "asst_manager", "document_controller"];

function canAssignShift(user: any, shiftType: string, isSunday: boolean, entries: any[], users: any[]) {
  if (!user) return false;
  const isAdminRole = ADMIN_ROLES.includes(user.role);
  if (!isSunday && (shiftType === "sun_day" || shiftType === "sun_night")) return false;
  if (isSunday && isAdminRole) return shiftType === "off";
  if (shiftType !== "sun_day" && shiftType !== "sun_night") return true;
  if (isAdminRole || user.location === "ega" || !["A", "B"].includes(user.team)) return false;
  const sameTeamAssigned = entries.some(e => {
    if (e.user_id === user.id || !["sun_day", "sun_night"].includes(e.shift_type)) return false;
    const assignedUser = users.find(u => u.id === e.user_id);
    return assignedUser?.team === user.team;
  });
  if (!sameTeamAssigned) return true;
  const assignedUserIds = entries.filter(e => ["sun_day", "sun_night"].includes(e.shift_type)).map(e => e.user_id);
  return assignedUserIds.includes(user.id);
}

export default function ScheduleEdit() {
  const { theme } = useThemeMode();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<string | null>(null); // shift_type to assign to

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        api.get("/schedules", { params: { start_date: date, end_date: date } }),
        api.get("/users", { params: { status_filter: "active" } }),
      ]);
      setEntries(s.data);
      setUsers(u.data);
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["schedules", "users", "leaves"]);

  const changeShift = async (userId: string, shiftType: string) => {
    try {
      await api.post("/schedules", { user_id: userId, shift_date: date, shift_type: shiftType });
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    }
  };

  const removeEntry = async (userId: string) => {
    try {
      await api.delete(`/schedules/${userId}/${date}`);
      await load();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    }
  };

  const grouped = SHIFT_GROUPS.map(g => ({
    ...g,
    entries: entries.filter(e => e.shift_type === g.key),
  }));
  const unassigned = users.filter(u => !entries.some(e => e.user_id === u.id));
  const offEntries = entries.filter(e => e.shift_type === "off" || e.shift_type === "leave");

  const shiftDate = new Date(`${date}T00:00:00`);
  const isSunday = shiftDate.getDay() === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
        <TouchableOpacity testID="schedule-edit-back" style={[styles.backBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.overline, { color: theme.muted }]}>EDIT DAY</Text>
          <Text style={[styles.title, { color: theme.text }]}>{shiftDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
        </View>
        <View style={styles.dateNav}>
          <TouchableOpacity
            testID="edit-day-prev"
            onPress={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="edit-day-next"
            onPress={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {grouped.map(g => {
          const sc = shiftColor(g.key);
          const okCount = g.entries.length;
          const showWarn = g.min > 0 && okCount < g.min;
          const eligibleCount = users.filter(u => canAssignShift(u, g.key, isSunday, entries, users)).length;
          return (
            <View key={g.key} style={[styles.shiftSection, { borderLeftColor: sc.c, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.shiftSectionHeader}>
                <Text style={[styles.shiftSectionTitle, { color: sc.c }]}>{g.title}</Text>
                <View style={styles.shiftCount}>
                  <Text style={[styles.shiftCountText, { color: showWarn ? colors.danger : colors.textSecondary }]}>
                    {okCount}{g.min > 0 ? `/${g.min}` : ""}
                  </Text>
                  {showWarn && <Ionicons name="warning" size={14} color={colors.danger} />}
                </View>
              </View>
              {g.entries.map(e => (
                <View key={e.user_id} style={[styles.entryRow, { backgroundColor: theme.surfaceHi }]}>
                  <Text style={[styles.entryName, { color: theme.text }]}>{e.user_name}</Text>
                  <TouchableOpacity
                    testID={`remove-${e.user_id}`}
                    onPress={() => removeEntry(e.user_id)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="close" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                testID={`add-to-${g.key}`}
                style={[styles.addBtn, eligibleCount === 0 && { opacity: 0.45 }]}
                onPress={() => setAssignFor(g.key)}
                disabled={eligibleCount === 0}
              >
                <Ionicons name="add" size={16} color={sc.c} />
                <Text style={[styles.addBtnText, { color: sc.c }]}>{eligibleCount === 0 ? "NO ELIGIBLE STAFF" : "ADD STAFF"}</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {(unassigned.length > 0 || offEntries.length > 0) && (
          <View style={[styles.shiftSection, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.offTitle, { color: theme.muted }]}>OFF / UNASSIGNED ({unassigned.length + offEntries.length})</Text>
            {[...offEntries.map(e => ({ id: e.user_id, name: e.user_name, type: e.shift_type })),
              ...unassigned.map(u => ({ id: u.id, name: u.full_name, type: "" }))].map(p => (
              <TouchableOpacity
                key={p.id}
                testID={`unassigned-${p.id}`}
                style={[styles.entryRow, { backgroundColor: theme.surfaceHi }]}
                onPress={() => {
                  const pickedUser = users.find(u => u.id === p.id);
                  const options = ASSIGN_OPTIONS.filter(s => canAssignShift(pickedUser, s, isSunday, entries, users));
                  Alert.alert(
                    p.name,
                    "Assign to which shift?",
                    [
                      { text: "Cancel", style: "cancel" },
                      ...options.map(s => ({
                        text: shiftLabel[s],
                        onPress: () => changeShift(p.id, s),
                      })),
                    ],
                  );
                }}
              >
                <Text style={[styles.entryName, { color: theme.text }]}>{p.name}</Text>
                <Text style={[styles.entryTypeBadge, { color: theme.muted }]}>{p.type ? shiftLabel[p.type] : "—"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Assign modal */}
      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => setAssignFor(null)}>
        <View style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.8)" }]}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Assign to {assignFor && shiftLabel[assignFor]}</Text>
              <TouchableOpacity onPress={() => setAssignFor(null)}>
                <Ionicons name="close" size={22} color={theme.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {users.filter(u => assignFor ? canAssignShift(u, assignFor, isSunday, entries, users) : true).map(u => {
                const existing = entries.find(e => e.user_id === u.id);
                return (
                  <TouchableOpacity
                    key={u.id}
                    testID={`assign-user-${u.id}`}
                    style={[styles.userPickRow, { backgroundColor: theme.surfaceHi, borderColor: theme.border }]}
                    onPress={async () => {
                      await changeShift(u.id, assignFor || "off");
                      setAssignFor(null);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userPickName, { color: theme.text }]}>{u.full_name}</Text>
                      <Text style={[styles.userPickMeta, { color: theme.muted }]}>
                        {u.team ? `Team ${u.team} · ` : ""}{u.location.toUpperCase()}
                        {existing ? ` · currently ${shiftLabel[existing.shift_type]}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: 20, paddingBottom: 12, gap: 12 },
  backBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 2 },
  dateNav: { flexDirection: "row", gap: 4 },
  navBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  shiftSection: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4,
    borderRadius: 6, padding: 12, marginBottom: 12,
  },
  shiftSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  shiftSectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  shiftCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  shiftCountText: { fontSize: 12, fontWeight: "800" },
  entryRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: colors.surfaceHi, borderRadius: 4, marginBottom: 6,
  },
  entryName: { color: colors.textPrimary, flex: 1, fontSize: 13, fontWeight: "600" },
  entryTypeBadge: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  removeBtn: {
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
    borderColor: colors.danger, borderWidth: 1, borderRadius: 2,
  },
  addBtn: {
    flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center",
    paddingVertical: 8, borderRadius: 4, borderStyle: "dashed", borderWidth: 1, borderColor: colors.border,
  },
  addBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  offTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
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
