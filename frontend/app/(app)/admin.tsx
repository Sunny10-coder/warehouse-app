import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert, Platform, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, leaveLabel, leaveColor, roleLabel, shiftLabel } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

const SHIFT_OPTIONS = ["morning", "afternoon", "night", "admin", "ega", "off"];

type Tab = "leaves" | "users" | "schedule";

function localDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function mondayString(d = new Date()) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const date = String(monday.getDate()).padStart(2, "0");
  return `${monday.getFullYear()}-${month}-${date}`;
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const { theme } = useThemeMode();
  const [tab, setTab] = useState<Tab>("leaves");
  const [users, setUsers] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<any>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [genStart, setGenStart] = useState(mondayString());
  const [genTeam, setGenTeam] = useState<"A" | "B">("A");
  const [genSundayA, setGenSundayA] = useState("");
  const [genSundayB, setGenSundayB] = useState("");
  const [genSundayAShift, setGenSundayAShift] = useState<"sun_day" | "sun_night">("sun_day");
  const [genSundayBShift, setGenSundayBShift] = useState<"sun_day" | "sun_night">("sun_night");
  const [genWeeks, setGenWeeks] = useState<2 | 4>(2);
  const [lastGenerated, setLastGenerated] = useState<any>(null);
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
  useRealtimeRefresh(load, ["users", "leaves", "schedules"]);

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

  const runDeleteUser = async (u: any) => {
    try {
      await api.delete(`/users/${u.id}`);
      setUsers(current => current.filter(user => user.id !== u.id));
      await load();
      Alert.alert("Deleted", `${u.full_name} was removed.`);
    } catch (e) {
      Alert.alert("Delete failed", errMsg(e));
    }
  };

  const deleteUser = (u: any) => {
    const message = `Delete ${u.full_name}? This removes their account plus their schedule, attendance, and leave records.`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(message)) {
        runDeleteUser(u);
      }
      return;
    }
    Alert.alert("Delete staff login", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => runDeleteUser(u) },
    ]);
  };

  const resetOperationalData = () => {
    Alert.alert(
      "Clear operational data",
      "This deletes all schedules, attendance records, and leave requests. Staff logins stay. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const r = await api.post("/admin/reset-operational-data");
              Alert.alert("Cleared", `Deleted ${r.data.deleted.attendance} attendance, ${r.data.deleted.schedules} schedule, and ${r.data.deleted.leaves} leave records.`);
              await load();
            } catch (e) {
              Alert.alert("Error", errMsg(e));
            }
          },
        },
      ],
    );
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
    if (sundayTeamA.length > 0 && !genSundayA) {
      Alert.alert("Required", "Select one Team A staff for Sunday duty.");
      return;
    }
    if (sundayTeamB.length > 0 && !genSundayB) {
      Alert.alert("Required", "Select one Team B staff for Sunday duty.");
      return;
    }
    setGenerating(true);
    try {
      const r = await api.post("/schedules/generate", {
        start_date: genStart,
        weeks: genWeeks,
        active_saturday_team: genTeam,
        sunday_team_a_user_id: genSundayA || null,
        sunday_team_b_user_id: genSundayB || null,
        sunday_team_a_shift: genSundayAShift,
        sunday_team_b_shift: genSundayBShift,
      });
      setLastGenerated(r.data);
      await load();
      router.push({ pathname: "/(app)/schedule", params: { start: genStart, weeks: String(genWeeks) } });
      Alert.alert(
        "Generated",
        `${r.data.generated} shift entries over ${r.data.days} days created. Leave days kept: ${r.data.leave_preserved || 0}. Sunday comp off added: ${r.data.comp_off_added || 0}. Calendar is updated.`,
      );
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setGenerating(false);
    }
  };

  const pendingUsers = users.filter(u => u.status === "pending");
  const sundayTeamA = users.filter(u => u.status === "active" && u.role === "employee" && u.team === "A" && u.location !== "ega");
  const sundayTeamB = users.filter(u => u.status === "active" && u.role === "employee" && u.team === "B" && u.location !== "ega");

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.overline, { color: theme.muted }]}>ADMIN CONSOLE</Text>
        <Text style={[styles.title, { color: theme.text }]}>Manage Operations</Text>
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
              <View key={l.id} style={[styles.card, { borderLeftColor: leaveColor(l.leave_type), backgroundColor: theme.surface, borderColor: theme.border }]} testID={`pending-leave-${l.id}`}>
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
                  <View key={u.id} style={[styles.card, { borderLeftColor: colors.warning, backgroundColor: theme.surface, borderColor: theme.border }]}>
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

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>All Staff ({users.filter(u => u.status === "active").length})</Text>
              <TouchableOpacity
                testID="admin-add-staff"
                style={styles.addStaffBtn}
                onPress={() => setCreateUserOpen(true)}
              >
                <Ionicons name="person-add" size={15} color={colors.bg} />
                <Text style={styles.addStaffText}>ADD STAFF</Text>
              </TouchableOpacity>
            </View>
            {users.filter(u => u.status === "active").map(u => (
              <TouchableOpacity
                key={u.id}
                testID={`user-row-${u.id}`}
                style={[styles.userRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setEditUser(u)}
              >
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.userAvatar} />
                ) : (
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{u.full_name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
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
                <View style={styles.userActions}>
                  {u.id !== currentUser?.id && (
                    <TouchableOpacity
                      testID={`delete-user-${u.id}`}
                      style={styles.deleteUserBtn}
                      onPress={(event: any) => {
                        event?.stopPropagation?.();
                        deleteUser(u);
                      }}
                    >
                      <Ionicons name="trash" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {tab === "schedule" && (
          <>
            <View style={[styles.card, { borderLeftColor: colors.danger, backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={styles.sectionTitle}>Fresh Start</Text>
              <Text style={styles.helper}>
                Clears schedules, attendance, and leave requests. Staff logins remain active.
              </Text>
              <TouchableOpacity
                testID="admin-reset-operational-data"
                style={styles.dangerBtn}
                onPress={resetOperationalData}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.dangerBtnText}>CLEAR OPERATIONAL DATA</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.scheduleHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Generate Schedule</Text>
                  <Text style={styles.helper}>
                    One clean generation updates the live schedule calendar. Approved sick, annual, and comp-off leave automatically replaces shifts with Leave and reduces balances.
                  </Text>
                </View>
                <TouchableOpacity
                  testID="open-schedule-calendar"
                  style={styles.iconCommandBtn}
                  onPress={() => router.push({ pathname: "/(app)/schedule", params: { start: genStart, weeks: String(genWeeks) } })}
                >
                  <Ionicons name="calendar" size={18} color={colors.morning} />
                </TouchableOpacity>
              </View>
              <Text style={styles.helper}>
                Generates a 2-week schedule for active staff. Manager, Assistant Manager, and Document Controller stay off Sunday.
                Choose one Team A and one Team B staff for Sunday duty; each selected staff gets 1 comp off per Sunday duty.
              </Text>

              <Text style={styles.modalLabel}>Start Date (must be a Monday)</Text>
              <View style={styles.generateDateRow}>
                <TextInput
                  testID="generate-start-date"
                  value={genStart}
                  onChangeText={setGenStart}
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  placeholder="2026-06-01"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  testID="generate-this-week"
                  style={styles.dateQuickBtn}
                  onPress={() => setGenStart(mondayString())}
                >
                  <Text style={styles.dateQuickText}>THIS WEEK</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Coverage Length</Text>
              <View style={styles.teamRow}>
                {([2, 4] as const).map(w => (
                  <TouchableOpacity
                    key={w}
                    testID={`gen-weeks-${w}`}
                    onPress={() => setGenWeeks(w)}
                    style={[styles.teamBtn, genWeeks === w && styles.teamBtnActive]}
                  >
                    <Text style={[styles.teamBtnText, genWeeks === w && { color: colors.bg }]}>
                      {w} WEEKS
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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
              <Text style={styles.helper}>
                Saturday active team works Day 6am-6pm. Admin roles are excluded.
              </Text>

              <Text style={styles.modalLabel}>Sunday Duty - Team A</Text>
              <StaffSelectRow
                users={sundayTeamA}
                selectedId={genSundayA}
                onSelect={setGenSundayA}
                emptyText="No Team A staff available"
                testPrefix="gen-sunday-a"
              />
              <SundayShiftSelect
                selected={genSundayAShift}
                onSelect={setGenSundayAShift}
                testPrefix="gen-sunday-a-shift"
              />

              <Text style={styles.modalLabel}>Sunday Duty - Team B</Text>
              <StaffSelectRow
                users={sundayTeamB}
                selectedId={genSundayB}
                onSelect={setGenSundayB}
                emptyText="No Team B staff available"
                testPrefix="gen-sunday-b"
              />
              <SundayShiftSelect
                selected={genSundayBShift}
                onSelect={setGenSundayBShift}
                testPrefix="gen-sunday-b-shift"
              />

              <TouchableOpacity
                testID="generate-submit"
                style={[styles.submitBtn, generating && { opacity: 0.6 }]}
                onPress={generate}
                disabled={generating}
              >
                {generating ? <ActivityIndicator color={colors.bg} /> :
                  <Text style={styles.submitBtnText}>GENERATE & UPDATE CALENDAR</Text>}
              </TouchableOpacity>

              {lastGenerated && (
                <View style={styles.generatedSummary}>
                  <Text style={styles.generatedTitle}>LAST GENERATION COMPLETE</Text>
                  <Text style={styles.generatedText}>
                    {lastGenerated.generated} entries over {lastGenerated.days} days. Comp off added: {lastGenerated.comp_off_added || 0}.
                    {lastGenerated.leave_preserved ? ` Leave days kept: ${lastGenerated.leave_preserved}.` : ""}
                  </Text>
                  <View style={styles.generatedActions}>
                    <TouchableOpacity
                      testID="view-generated-schedule"
                      style={styles.generatedBtn}
                      onPress={() => router.push({ pathname: "/(app)/schedule", params: { start: genStart, weeks: String(genWeeks) } })}
                    >
                      <Ionicons name="calendar" size={15} color={colors.bg} />
                      <Text style={styles.generatedBtnText}>VIEW CALENDAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="edit-generated-day"
                      style={[styles.generatedBtn, { backgroundColor: colors.surfaceHi, borderColor: colors.morning, borderWidth: 1 }]}
                      onPress={() => router.push({ pathname: "/schedule-edit", params: { date: genStart } })}
                    >
                      <Ionicons name="create" size={15} color={colors.morning} />
                      <Text style={[styles.generatedBtnText, { color: colors.morning }]}>EDIT START DAY</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <UserEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); }} />
      <CreateUserModal
        visible={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        onSaved={() => { setCreateUserOpen(false); load(); }}
      />
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

function CreateUserModal({ visible, onClose, onSaved }: any) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [role, setRole] = useState("employee");
  const [team, setTeam] = useState("A");
  const [location, setLocation] = useState("warehouse");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!fullName || !email || !password) {
      Alert.alert("Required", "Name, email, and password are required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/users", {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        team: role === "document_controller" ? null : team,
        location,
        avatar_url: avatarUrl.trim() || null,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setAvatarUrl("");
      setRole("employee");
      setTeam("A");
      setLocation("warehouse");
      onSaved();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <ScrollView style={styles.modalBox} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Staff Login</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalLabel}>Full Name</Text>
          <TextInput
            testID="create-user-name"
            value={fullName}
            onChangeText={setFullName}
            style={styles.modalInput}
            placeholder="Employee name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.modalLabel}>Email</Text>
          <TextInput
            testID="create-user-email"
            value={email}
            onChangeText={setEmail}
            style={styles.modalInput}
            placeholder="employee@warehouse.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.modalLabel}>Temporary Password</Text>
          <TextInput
            testID="create-user-password"
            value={password}
            onChangeText={setPassword}
            style={styles.modalInput}
            placeholder="Give this to the employee"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.modalLabel}>Profile Photo URL</Text>
          <TextInput
            testID="create-user-avatar"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            style={styles.modalInput}
            placeholder="https://example.com/photo.jpg"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.modalLabel}>Role</Text>
          <View style={styles.optGrid}>
            {[
              ["employee", "Employee"],
              ["manager", "Manager"],
              ["asst_manager", "Assistant"],
              ["document_controller", "Doc Controller"],
            ].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                testID={`create-role-${value}`}
                onPress={() => setRole(value)}
                style={[styles.optChip, role === value && styles.optChipActive]}
              >
                <Text style={[styles.optChipText, role === value && { color: colors.bg }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>Team</Text>
          <View style={styles.optGrid}>
            {["A", "B", ""].map(t => (
              <TouchableOpacity
                key={t || "none"}
                testID={`create-team-${t || "none"}`}
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
                testID={`create-location-${l}`}
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
            testID="create-user-save"
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.bg} /> :
              <Text style={styles.submitBtnText}>CREATE ACTIVE LOGIN</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function UserEditModal({ user, onClose, onSaved }: any) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [password, setPassword] = useState("");
  const [shift, setShift] = useState(user?.default_shift || "morning");
  const [team, setTeam] = useState(user?.team || "");
  const [location, setLocation] = useState(user?.location || "warehouse");
  const [annual, setAnnual] = useState(String(user?.annual_leave_balance ?? 30));
  const [sick, setSick] = useState(String(user?.sick_leave_balance ?? 12));
  const [compOff, setCompOff] = useState(String(user?.comp_off_balance ?? 0));
  const [saving, setSaving] = useState(false);
  const [overtimeDate, setOvertimeDate] = useState(localDateString());
  const [overtimeHours, setOvertimeHours] = useState("");
  const [overtimeDays, setOvertimeDays] = useState("");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [grantingCompOff, setGrantingCompOff] = useState(false);
  const [vacationStart, setVacationStart] = useState(localDateString());
  const [vacationEnd, setVacationEnd] = useState(localDateString());
  const [vacationReason, setVacationReason] = useState("Annual vacation assigned by admin");
  const [assigningVacation, setAssigningVacation] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name || "");
    setEmail(user.email || "");
    setAvatarUrl(user.avatar_url || "");
    setPassword("");
    setShift(user.default_shift || "morning");
    setTeam(user.team || "");
    setLocation(user.location || "warehouse");
    setAnnual(String(user.annual_leave_balance ?? 30));
    setSick(String(user.sick_leave_balance ?? 12));
    setCompOff(String(user.comp_off_balance ?? 0));
    setOvertimeDate(localDateString());
    setOvertimeHours("");
    setOvertimeDays("");
    setOvertimeReason("");
    setVacationStart(localDateString());
    setVacationEnd(localDateString());
    setVacationReason("Annual vacation assigned by admin");
  }, [user]);

  if (!user) return null;

  const save = async () => {
    if (!email.trim()) {
      Alert.alert("Required", "Email / login ID is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        full_name: fullName,
        email: email.trim(),
        avatar_url: avatarUrl.trim() || null,
        default_shift: shift,
        team: team || null,
        location,
        annual_leave_balance: parseFloat(annual) || 0,
        sick_leave_balance: parseFloat(sick) || 0,
        comp_off_balance: parseFloat(compOff) || 0,
      };
      if (password.trim()) {
        if (password.trim().length < 6) {
          Alert.alert("Password too short", "Use at least 6 characters.");
          setSaving(false);
          return;
        }
        payload.password = password.trim();
      }
      await api.patch(`/users/${user.id}`, payload);
      setPassword("");
      onSaved();
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const adjustBalance = (which: "annual" | "sick" | "comp_off", delta: number) => {
    const current = which === "annual" ? annual : which === "sick" ? sick : compOff;
    const setter = which === "annual" ? setAnnual : which === "sick" ? setSick : setCompOff;
    const next = Math.max(0, (parseFloat(current) || 0) + delta);
    setter(String(next));
  };

  const grantCompOff = async () => {
    const days = parseFloat(overtimeDays);
    const hours = parseFloat(overtimeHours) || 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overtimeDate.trim())) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for the overtime worked date.");
      return;
    }
    if (!days || days <= 0) {
      Alert.alert("Required", "Enter the comp-off days to add.");
      return;
    }
    if (hours < 0) {
      Alert.alert("Invalid hours", "Overtime hours cannot be negative.");
      return;
    }
    if (!overtimeReason.trim()) {
      Alert.alert("Required", "Enter why this comp off is being added.");
      return;
    }
    setGrantingCompOff(true);
    try {
      await api.post(`/users/${user.id}/comp-off`, {
        earned_date: overtimeDate.trim(),
        overtime_hours: hours,
        days,
        reason: overtimeReason.trim(),
      });
      const next = Math.round(((parseFloat(compOff) || 0) + days) * 100) / 100;
      setCompOff(String(next));
      setOvertimeHours("");
      setOvertimeDays("");
      setOvertimeReason("");
      Alert.alert("Comp off added", `${days} day${days === 1 ? "" : "s"} added for overtime.`);
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setGrantingCompOff(false);
    }
  };

  const assignVacation = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacationStart.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(vacationEnd.trim())) {
      Alert.alert("Invalid dates", "Use YYYY-MM-DD for vacation start and end.");
      return;
    }
    if (!vacationReason.trim()) {
      Alert.alert("Required", "Enter why this vacation is being assigned.");
      return;
    }
    setAssigningVacation(true);
    try {
      const r = await api.post(`/users/${user.id}/vacation`, {
        start_date: vacationStart.trim(),
        end_date: vacationEnd.trim(),
        reason: vacationReason.trim(),
      });
      const next = Math.max(0, (parseFloat(annual) || 0) - (r.data.days || 0));
      setAnnual(String(next));
      Alert.alert("Vacation scheduled", `${r.data.days} vacation day${r.data.days === 1 ? "" : "s"} approved and locked on the schedule.`);
    } catch (e) {
      Alert.alert("Error", errMsg(e));
    } finally {
      setAssigningVacation(false);
    }
  };

  return (
    <Modal visible={!!user} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <ScrollView style={styles.modalBox} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{user.full_name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalLabel}>Full Name</Text>
          <TextInput
            testID="edit-fullname"
            value={fullName}
            onChangeText={setFullName}
            style={styles.modalInput}
            placeholder="Employee name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.modalLabel}>Email / Login ID</Text>
          <TextInput
            testID="edit-email"
            value={email}
            onChangeText={setEmail}
            style={styles.modalInput}
            placeholder="employee@warehouse.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.modalLabel}>Profile Photo URL</Text>
          <View style={styles.avatarEditRow}>
            {avatarUrl.trim() ? (
              <Image source={{ uri: avatarUrl.trim() }} style={styles.avatarPreview} />
            ) : (
              <View style={styles.avatarPreview}>
                <Text style={styles.avatarPreviewText}>{fullName.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <TextInput
              testID="edit-avatar-url"
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
              placeholder="https://example.com/photo.jpg"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.modalLabel}>New Login Password</Text>
          <TextInput
            testID="edit-password"
            value={password}
            onChangeText={setPassword}
            style={styles.modalInput}
            placeholder="Leave blank to keep current password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

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

          <Text style={styles.modalLabel}>Leave Balances</Text>
          <BalanceEditor testID="balance-annual" label="Vacation" color={colors.annual} value={annual} setValue={setAnnual} onAdjust={(d: number) => adjustBalance("annual", d)} />
          <BalanceEditor testID="balance-sick" label="Sick" color={colors.sick} value={sick} setValue={setSick} onAdjust={(d: number) => adjustBalance("sick", d)} />
          <BalanceEditor testID="balance-comp" label="Comp Off" color={colors.compOff} value={compOff} setValue={setCompOff} onAdjust={(d: number) => adjustBalance("comp_off", d)} />

          <View style={styles.vacationBox}>
            <Text style={styles.vacationTitle}>ASSIGN APPROVED VACATION</Text>
            <Text style={styles.vacationHint}>
              Creates approved vacation leave and locks those dates as Leave on the live schedule calendar.
            </Text>
            <View style={styles.overtimeGrid}>
              <TextInput
                testID="vacation-start-date"
                value={vacationStart}
                onChangeText={setVacationStart}
                style={styles.overtimeInput}
                placeholder="Start YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                testID="vacation-end-date"
                value={vacationEnd}
                onChangeText={setVacationEnd}
                style={styles.overtimeInput}
                placeholder="End YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <TextInput
              testID="vacation-reason"
              value={vacationReason}
              onChangeText={setVacationReason}
              style={styles.overtimeReason}
              placeholder="Reason / approval note"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TouchableOpacity
              testID="vacation-assign-submit"
              style={[styles.vacationBtn, assigningVacation && { opacity: 0.6 }]}
              onPress={assignVacation}
              disabled={assigningVacation}
            >
              {assigningVacation ? <ActivityIndicator color={colors.bg} /> : (
                <>
                  <Ionicons name="airplane" size={16} color={colors.bg} />
                  <Text style={styles.grantBtnText}>APPROVE & SCHEDULE VACATION</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.overtimeBox}>
            <Text style={styles.overtimeTitle}>ADD COMP OFF FOR OVERTIME</Text>
            <View style={styles.overtimeGrid}>
              <TextInput
                testID="comp-off-earned-date"
                value={overtimeDate}
                onChangeText={setOvertimeDate}
                style={styles.overtimeInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                testID="comp-off-hours"
                value={overtimeHours}
                onChangeText={setOvertimeHours}
                keyboardType="decimal-pad"
                style={styles.overtimeInput}
                placeholder="Overtime hours"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                testID="comp-off-days"
                value={overtimeDays}
                onChangeText={setOvertimeDays}
                keyboardType="decimal-pad"
                style={styles.overtimeInput}
                placeholder="Days to add"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <TextInput
              testID="comp-off-reason"
              value={overtimeReason}
              onChangeText={setOvertimeReason}
              style={styles.overtimeReason}
              placeholder="Reason / overtime work done"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TouchableOpacity
              testID="comp-off-grant-submit"
              style={[styles.grantBtn, grantingCompOff && { opacity: 0.6 }]}
              onPress={grantCompOff}
              disabled={grantingCompOff}
            >
              {grantingCompOff ? <ActivityIndicator color={colors.bg} /> : (
                <>
                  <Ionicons name="add-circle" size={16} color={colors.bg} />
                  <Text style={styles.grantBtnText}>ADD OVERTIME COMP OFF</Text>
                </>
              )}
            </TouchableOpacity>
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
        </ScrollView>
      </View>
    </Modal>
  );
}

function BalanceEditor({ label, color, value, setValue, onAdjust, testID }: any) {
  return (
    <View style={[styles.balanceEditor, { borderColor: color }]} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.balanceEditorLabel, { color }]}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          style={styles.balanceEditorInput}
        />
      </View>
      <View style={styles.balanceEditorActions}>
        <TouchableOpacity testID={`${testID}-minus`} style={styles.balanceBtn} onPress={() => onAdjust(-1)}>
          <Ionicons name="remove" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity testID={`${testID}-plus`} style={styles.balanceBtn} onPress={() => onAdjust(1)}>
          <Ionicons name="add" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StaffSelectRow({ users, selectedId, onSelect, emptyText, testPrefix }: any) {
  if (!users.length) {
    return <Text style={styles.selectorEmpty}>{emptyText}</Text>;
  }
  return (
    <View style={styles.staffSelectWrap}>
      {users.map((u: any) => {
        const active = selectedId === u.id;
        return (
          <TouchableOpacity
            key={u.id}
            testID={`${testPrefix}-${u.id}`}
            style={[styles.staffSelectChip, active && styles.staffSelectChipActive]}
            onPress={() => onSelect(active ? "" : u.id)}
          >
            <Text style={[styles.staffSelectName, active && { color: colors.bg }]}>{u.full_name}</Text>
            <Text style={[styles.staffSelectMeta, active && { color: colors.bg }]}>
              {u.default_shift ? shiftLabel[u.default_shift] || u.default_shift : "Staff"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SundayShiftSelect({ selected, onSelect, testPrefix }: any) {
  return (
    <View style={styles.sundayShiftRow}>
      {[
        { key: "sun_day", label: "DAY 6AM-6PM", icon: "sunny" },
        { key: "sun_night", label: "NIGHT 6PM-6AM", icon: "moon" },
      ].map(option => {
        const active = selected === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            testID={`${testPrefix}-${option.key}`}
            style={[styles.sundayShiftBtn, active && styles.sundayShiftBtnActive]}
            onPress={() => onSelect(option.key)}
          >
            <Ionicons name={option.icon as any} size={15} color={active ? colors.bg : colors.textPrimary} />
            <Text style={[styles.sundayShiftText, active && { color: colors.bg }]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  addStaffBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.morning,
    paddingHorizontal: 10, height: 34, borderRadius: 4,
  },
  addStaffText: { color: colors.bg, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  userRow: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8, gap: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 4, backgroundColor: colors.surfaceHi,
    alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1,
  },
  userAvatarText: { color: colors.morning, fontWeight: "800", fontSize: 13 },
  userActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteUserBtn: {
    width: 34, height: 34, alignItems: "center", justifyContent: "center",
    borderColor: colors.danger, borderWidth: 1, borderRadius: 4,
    backgroundColor: "rgba(255,59,48,0.08)",
  },
  helper: { color: colors.textSecondary, fontSize: 12, marginBottom: 14, lineHeight: 18 },
  scheduleHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconCommandBtn: {
    width: 42, height: 42, alignItems: "center", justifyContent: "center",
    borderColor: colors.morning, borderWidth: 1, borderRadius: 4, backgroundColor: colors.morningBg,
  },
  generateDateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dateQuickBtn: {
    height: 48, paddingHorizontal: 12, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surfaceHi,
  },
  dateQuickText: { color: colors.textPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  modalLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 8 },
  modalInput: {
    height: 48, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 14, marginBottom: 8, fontSize: 15,
  },
  avatarEditRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  avatarPreview: {
    width: 48, height: 48, borderRadius: 4, backgroundColor: colors.surfaceHi,
    borderColor: colors.border, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  avatarPreviewText: { color: colors.morning, fontSize: 13, fontWeight: "900" },
  teamRow: { flexDirection: "row", gap: 8 },
  teamBtn: {
    flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 4,
    borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceHi,
  },
  teamBtnActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  teamBtnText: { color: colors.textSecondary, fontWeight: "800", letterSpacing: 1 },
  staffSelectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  staffSelectChip: {
    flexGrow: 1, minWidth: 132, padding: 10, borderRadius: 4,
    borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceHi,
  },
  staffSelectChipActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  staffSelectName: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  staffSelectMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 2, fontWeight: "700" },
  selectorEmpty: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  sundayShiftRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  sundayShiftBtn: {
    flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 4, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceHi,
  },
  sundayShiftBtnActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  sundayShiftText: { color: colors.textPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  submitBtn: {
    height: 52, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center",
    borderRadius: 4, marginTop: 16,
  },
  submitBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5 },
  dangerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 46, backgroundColor: colors.danger, borderRadius: 4, marginTop: 6,
  },
  dangerBtnText: { color: "#fff", fontWeight: "800", letterSpacing: 1.2, fontSize: 12 },
  generatedSummary: {
    marginTop: 12, padding: 12, borderRadius: 4, borderColor: colors.success,
    borderWidth: 1, backgroundColor: colors.surfaceHi,
  },
  generatedTitle: { color: colors.success, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  generatedText: { color: colors.textSecondary, fontSize: 12, marginTop: 5, lineHeight: 18 },
  generatedActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  generatedBtn: {
    flexGrow: 1, minWidth: 132, height: 38, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, borderRadius: 4, backgroundColor: colors.success,
  },
  generatedBtnText: { color: colors.bg, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
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
  balanceEditor: {
    flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8,
    borderWidth: 1, borderRadius: 4, backgroundColor: colors.surfaceHi,
  },
  balanceEditorLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  balanceEditorInput: {
    color: colors.textPrimary, fontSize: 20, fontWeight: "800", padding: 0, marginTop: 2,
  },
  balanceEditorActions: { flexDirection: "row", gap: 6 },
  balanceBtn: {
    width: 36, height: 36, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
  },
  overtimeBox: {
    marginTop: 12, padding: 12, borderWidth: 1, borderRadius: 4,
    borderColor: colors.compOff, backgroundColor: colors.surfaceHi,
  },
  vacationBox: {
    marginTop: 12, padding: 12, borderWidth: 1, borderRadius: 4,
    borderColor: colors.annual, backgroundColor: colors.surfaceHi,
  },
  vacationTitle: { color: colors.annual, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  vacationHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  overtimeTitle: { color: colors.compOff, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  overtimeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  overtimeInput: {
    flexGrow: 1, minWidth: 132, height: 44, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    color: colors.textPrimary, paddingHorizontal: 12, fontSize: 13,
  },
  overtimeReason: {
    minHeight: 76, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, color: colors.textPrimary, paddingHorizontal: 12, paddingTop: 10,
    marginTop: 8, textAlignVertical: "top",
  },
  grantBtn: {
    height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 4, backgroundColor: colors.compOff, marginTop: 10,
  },
  vacationBtn: {
    height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 4, backgroundColor: colors.annual, marginTop: 10,
  },
  grantBtnText: { color: colors.bg, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
});
