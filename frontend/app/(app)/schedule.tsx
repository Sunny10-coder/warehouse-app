import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, FlatList, Image, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { appTheme, colors, shiftLabel, shiftColor } from "@/src/theme";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const ASSIGN_SHIFTS = [
  { key: "morning", label: "Day Shift", time: "07:00 - 16:00", color: appTheme.primary },
  { key: "afternoon", label: "Afternoon Shift", time: "12:00 - 21:00", color: appTheme.green },
  { key: "night", label: "Night Shift", time: "21:00 - 06:00", color: appTheme.yellow },
  { key: "off", label: "Weekly Off", time: "Not scheduled", color: appTheme.muted },
];

function startOfWeek(d = new Date()) {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function parseLocalDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function fmtDate(d: Date) {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function Schedule() {
  const { user, isAdmin } = useAuth();
  const params = useLocalSearchParams<{ start?: string; weeks?: string }>();
  const rangeWeeks = params.weeks === "4" ? 4 : 2;
  const rangeLength = rangeWeeks * 7;
  const [weekStart, setWeekStart] = useState(startOfWeek(parseLocalDate(params.start)));
  const [entries, setEntries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [viewMode, setViewMode] = useState<"mine" | "team">("team");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkShift, setBulkShift] = useState("morning");
  const [savingBulk, setSavingBulk] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: rangeLength }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart, rangeLength]);

  useEffect(() => {
    if (params.start) {
      setSelectedDay(0);
      setWeekStart(startOfWeek(parseLocalDate(params.start)));
    }
  }, [params.start]);

  useEffect(() => {
    if (isAdmin) {
      setViewMode("team");
    }
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = fmtDate(weekDays[0]);
      const end = fmtDate(weekDays[weekDays.length - 1]);
      const params: any = { start_date: start, end_date: end };
      if (viewMode === "mine") params.user_id = user?.id;
      const [r, u] = await Promise.all([
        api.get("/schedules", { params }),
        isAdmin ? api.get("/users", { params: { status_filter: "active" } }) : Promise.resolve({ data: [] }),
      ]);
      setEntries(r.data);
      setUsers(u.data);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [weekDays, viewMode, user, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["schedules", "leaves", "users"]);

  const selectedDate = fmtDate(weekDays[selectedDay]);
  const dayEntries = entries
    .filter(e => e.shift_date === selectedDate)
    .sort((a, b) => {
      const rank = (s: string) => s === "off" ? 3 : s === "leave" ? 2 : 1;
      return rank(a.shift_type) - rank(b.shift_type) || a.user_name.localeCompare(b.user_name);
    });

  const shiftSummary = useMemo(() => {
    const c: Record<string, number> = {};
    dayEntries.forEach(e => { c[e.shift_type] = (c[e.shift_type] || 0) + 1; });
    return c;
  }, [dayEntries]);

  const entriesByUserDate = useMemo(() => {
    const map = new Map<string, any>();
    entries.forEach(e => map.set(`${e.user_id}|${e.shift_date}`, e));
    return map;
  }, [entries]);

  const sheetUsers = useMemo(() => {
    const idsWithEntries = new Set(entries.map(e => e.user_id));
    const entryUsers = Array.from(new Map(entries.map((e: any) => [e.user_id, {
      id: e.user_id,
      full_name: e.user_name,
      avatar_url: e.avatar_url,
      team: e.team,
      role: e.role,
      location: e.location,
      status: "active",
    }])).values());
    const base = viewMode === "mine" && user ? [user] : (isAdmin ? users : entryUsers);
    return base
      .filter((u: any) => viewMode === "mine" || idsWithEntries.has(u.id) || u.status === "active")
      .sort((a: any, b: any) => {
        const teamSort = String(a.team || "").localeCompare(String(b.team || ""));
        return teamSort || String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
  }, [entries, users, viewMode, user, isAdmin]);

  const toggleBulkUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openBulkAssign = () => {
    setSelectedUsers([]);
    setBulkShift("morning");
    setBulkOpen(true);
  };

  const saveBulkAssign = async () => {
    if (!selectedUsers.length) {
      Alert.alert("Select employees", "Choose at least one employee.");
      return;
    }
    setSavingBulk(true);
    try {
      const dates = weekDays.map(fmtDate);
      await Promise.all(selectedUsers.flatMap(userId =>
        dates.map(shift_date => api.post("/schedules", {
          user_id: userId,
          shift_date,
          shift_type: bulkShift,
        }))
      ));
      setBulkOpen(false);
      Alert.alert("Schedule updated", "Selected shifts were assigned.");
      await load();
    } catch (e) {
      Alert.alert("Could not assign", errMsg(e));
    } finally {
      setSavingBulk(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Schedules</Text>
          <Text style={styles.rangeLabel}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
        </View>
        <TouchableOpacity style={styles.avatarTop} onPress={() => router.push("/(app)/profile")}>
          <Text style={styles.avatarTopText}>{String(user?.full_name || "U").slice(0, 1).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          testID="schedule-toggle-mine"
          onPress={() => setViewMode("mine")}
          style={[styles.toggleBtn, viewMode === "mine" && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleText, viewMode === "mine" && styles.toggleTextActive]}>MY SHIFTS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="schedule-toggle-team"
          onPress={() => setViewMode("team")}
          style={[styles.toggleBtn, viewMode === "team" && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleText, viewMode === "team" && styles.toggleTextActive]}>ALL TEAM</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scheduleIntro}>
        <View>
          <Text style={styles.sheetTitle}>Schedules</Text>
          <Text style={styles.sheetHint}>{rangeWeeks}-week roster · {sheetUsers.length} employees</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity testID="schedule-bulk-assign" style={styles.bulkBtn} onPress={openBulkAssign}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.bulkBtnText}>Bulk Assign</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.rosterRange}>
        <TouchableOpacity
          testID="schedule-prev-week"
          style={styles.navBtn}
          onPress={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() - rangeLength);
            setWeekStart(d);
          }}
        >
          <Ionicons name="chevron-back" size={20} color={appTheme.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.rosterRangeTitle}>
            {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - {weekDays[weekDays.length - 1].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </Text>
          <Text style={styles.rosterRangeSub}>{rangeLength}-day roster</Text>
        </View>
        <TouchableOpacity
          testID="schedule-next-week"
          style={styles.navBtn}
          onPress={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + rangeLength);
            setWeekStart(d);
          }}
        >
          <Ionicons name="chevron-forward" size={20} color={appTheme.primary} />
        </TouchableOpacity>
      </View>

      {/* Day entries */}
      <FlatList
        data={dayEntries}
        keyExtractor={(item, idx) => `${item.user_id}-${item.shift_date}-${idx}`}
        contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.sheetTitle}>Schedule Sheet</Text>
            <Text style={styles.sheetHint}>Scroll sideways to view all days. Tap a day column to open that day below.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.sheetScroll}>
              <View>
                <View style={styles.sheetHeaderRow}>
                  <View style={styles.sheetNameHeader}>
                    <Text style={styles.sheetHeaderText}>EMPLOYEE</Text>
                  </View>
                  {weekDays.map((d, i) => {
                    const active = selectedDay === i;
                    return (
                      <TouchableOpacity
                        key={fmtDate(d)}
                        style={[styles.sheetDayHeader, active && styles.sheetDayHeaderActive]}
                        onPress={() => setSelectedDay(i)}
                      >
                        <Text style={[styles.sheetDow, active && { color: colors.bg }]}>{DAY_LABELS[i % 7]}</Text>
                        <Text style={[styles.sheetDayNum, active && { color: colors.bg }]}>{d.getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {sheetUsers.map((u: any) => (
                  <View key={u.id} style={styles.sheetRow}>
                    <View style={styles.sheetNameCell}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={styles.sheetAvatar} />
                      ) : (
                        <View style={styles.sheetAvatar}>
                          <Text style={styles.sheetAvatarText}>{String(u.full_name || "?").slice(0, 2).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetName}>{u.full_name}</Text>
                        <Text style={styles.sheetMeta}>
                          {u.team ? `TEAM ${u.team}` : "ADMIN"} {u.location === "ega" ? "· EGA" : ""}
                        </Text>
                      </View>
                    </View>
                    {weekDays.map((d, i) => {
                      const dateKey = fmtDate(d);
                      const entry = entriesByUserDate.get(`${u.id}|${dateKey}`);
                      const sc = shiftColor(entry?.shift_type || "off");
                      return (
                        <TouchableOpacity
                          key={`${u.id}-${dateKey}`}
                          style={[
                            styles.sheetShiftCell,
                            !entry && styles.emptyShiftCell,
                            { borderColor: entry ? sc.c : appTheme.border, backgroundColor: entry ? tintForShift(entry.shift_type) : appTheme.surface },
                          ]}
                          onPress={() => {
                            setSelectedDay(i);
                            if (isAdmin) router.push({ pathname: "/schedule-edit", params: { date: dateKey } });
                          }}
                        >
                          <Text style={[styles.sheetShiftText, { color: entry ? colorForShift(entry.shift_type) : appTheme.muted }]}>
                            {entry ? shortShift(entry.shift_type) : "+"}
                          </Text>
                          {entry?.start_time ? (
                            <Text style={styles.sheetTimeText}>{entry.start_time}-{entry.end_time}</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.dayTitle}>
              {weekDays[selectedDay].toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            {Object.keys(shiftSummary).length > 0 && (
              <View style={styles.summaryRow}>
                {Object.entries(shiftSummary).map(([k, v]) => {
                  const sc = shiftColor(k);
                  return (
                    <View key={k} style={[styles.summaryChip, { borderColor: sc.c }]}>
                      <Text style={[styles.summaryChipText, { color: sc.c }]}>
                        {v} · {shiftLabel[k] || k}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {isAdmin && (
              <TouchableOpacity
                testID="schedule-edit-day-inline"
                style={styles.editDayBtn}
                onPress={() => router.push({ pathname: "/schedule-edit", params: { date: selectedDate } })}
              >
                <Ionicons name="create" size={16} color={colors.bg} />
                <Text style={styles.editDayText}>EDIT THIS DAY</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 12 }} />
          </View>
        }
        renderItem={({ item }) => {
          const sc = shiftColor(item.shift_type);
          return (
            <View style={[styles.entryCard, { borderLeftColor: sc.c }]} testID={`schedule-entry-${item.user_id}`}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.entryAvatar} />
              ) : (
                <View style={styles.entryAvatar}>
                  <Text style={styles.entryAvatarText}>{String(item.user_name || "?").slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{item.user_name}</Text>
                <Text style={[styles.entryShift, { color: sc.c }]}>
                  {shiftLabel[item.shift_type] || item.shift_type}
                </Text>
                {item.start_time && item.end_time ? (
                  <Text style={styles.entryTime}>{item.start_time} – {item.end_time} · {item.hours}h</Text>
                ) : null}
              </View>
              <View style={[styles.entryIcon, { backgroundColor: sc.bg, borderColor: sc.c }]}>
                <Ionicons name={shiftIcon(item.shift_type)} size={22} color={sc.c} />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                No schedule for this day.
                {isAdmin ? " Generate from Admin tab." : ""}
              </Text>
            </View>
          ) : <ActivityIndicator color={colors.morning} style={{ marginTop: 40 }} />
        }
      />

      {isAdmin && (
        <Modal visible={bulkOpen} transparent animationType="fade" onRequestClose={() => setBulkOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bulkModal}>
              <View style={styles.bulkHeader}>
                <View>
                  <Text style={styles.bulkTitle}>Bulk Assign Shifts</Text>
                  <Text style={styles.bulkSub}>Assign to multiple employees for {rangeWeeks} weeks</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setBulkOpen(false)}>
                  <Ionicons name="close" size={20} color={appTheme.muted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.bulkLabel}>SELECT EMPLOYEES *</Text>
              <ScrollView style={styles.employeePicker}>
                {sheetUsers.map((u: any) => {
                  const checked = selectedUsers.includes(u.id);
                  return (
                    <TouchableOpacity key={u.id} style={styles.employeePickRow} onPress={() => toggleBulkUser(u.id)}>
                      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? appTheme.primary : appTheme.muted} />
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={styles.bulkAvatar} />
                      ) : (
                        <View style={styles.bulkAvatar}><Text style={styles.bulkAvatarText}>{String(u.full_name || "?").slice(0, 1).toUpperCase()}</Text></View>
                      )}
                      <View>
                        <Text style={styles.employeePickName}>{u.full_name}</Text>
                        <Text style={styles.employeePickMeta}>{u.team ? `Team ${u.team}` : "Management"}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.bulkLabel}>SELECT SHIFT *</Text>
              <View style={styles.shiftPickGrid}>
                {ASSIGN_SHIFTS.map(s => {
                  const selected = bulkShift === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.shiftPick, selected && { borderColor: s.color, backgroundColor: `${s.color}18` }]}
                      onPress={() => setBulkShift(s.key)}
                    >
                      <View style={[styles.shiftDot, { backgroundColor: s.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.shiftPickLabel, selected && { color: s.color }]}>{s.label}</Text>
                        <Text style={styles.shiftPickTime}>{s.time}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.bulkActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setBulkOpen(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.applyBtn, savingBulk && { opacity: 0.65 }]} onPress={saveBulkAssign} disabled={savingBulk}>
                  <Text style={styles.applyBtnText}>{savingBulk ? "Saving..." : "Apply"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function shiftIcon(t: string): any {
  switch (t) {
    case "morning":
    case "sat_day":
    case "sun_day": return "sunny";
    case "afternoon": return "partly-sunny";
    case "night":
    case "sat_night":
    case "sun_night": return "moon";
    case "admin": return "briefcase";
    case "ega": return "business";
    case "leave": return "airplane";
    default: return "remove-circle-outline";
  }
}

function shortShift(t?: string | null) {
  switch (t) {
    case "morning": return "MOR";
    case "afternoon": return "AFT";
    case "night": return "NGT";
    case "admin": return "ADM";
    case "sat_day": return "SAT D";
    case "sat_night": return "SAT N";
    case "sun_day": return "SUN D";
    case "sun_night": return "SUN N";
    case "ega": return "EGA";
    case "leave": return "LEAVE";
    case "off": return "OFF";
    default: return "OFF";
  }
}

function colorForShift(t?: string | null) {
  switch (t) {
    case "morning":
    case "sat_day":
    case "sun_day":
      return appTheme.primary;
    case "afternoon":
      return appTheme.green;
    case "night":
    case "sat_night":
    case "sun_night":
      return appTheme.yellow;
    case "leave":
      return appTheme.blue;
    case "off":
      return appTheme.muted;
    default:
      return appTheme.primary;
  }
}

function tintForShift(t?: string | null) {
  switch (t) {
    case "morning":
    case "sat_day":
    case "sun_day":
      return appTheme.purpleSoft;
    case "afternoon":
      return appTheme.greenSoft;
    case "night":
    case "sat_night":
    case "sun_night":
      return appTheme.yellowSoft;
    case "leave":
      return appTheme.blueSoft;
    case "off":
      return appTheme.surfaceSoft;
    default:
      return appTheme.surface;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  header: {
    flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    alignItems: "center", backgroundColor: appTheme.surface, borderBottomColor: appTheme.border, borderBottomWidth: 1,
  },
  title: { color: appTheme.text, fontSize: 22, fontWeight: "900" },
  rangeLabel: { color: appTheme.muted, fontSize: 13, marginTop: 2, fontWeight: "700" },
  avatarTop: { width: 44, height: 44, borderRadius: 22, backgroundColor: appTheme.primary, alignItems: "center", justifyContent: "center" },
  avatarTopText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  navBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderColor: appTheme.border, borderWidth: 1, borderRadius: 12, backgroundColor: appTheme.surface,
  },
  toggleRow: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 16, marginBottom: 12,
    backgroundColor: appTheme.surface, borderColor: appTheme.border, borderWidth: 1, borderRadius: 14, padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  toggleBtnActive: { backgroundColor: appTheme.primary },
  toggleText: { color: appTheme.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  toggleTextActive: { color: "#fff" },
  scheduleIntro: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, marginTop: 22, marginBottom: 16,
  },
  sheetTitle: { color: appTheme.text, fontSize: 28, fontWeight: "900" },
  sheetHint: { color: appTheme.muted, fontSize: 14, marginTop: 4 },
  bulkBtn: {
    height: 46, paddingHorizontal: 20, borderRadius: 14, backgroundColor: appTheme.primary,
    flexDirection: "row", alignItems: "center", gap: 8, shadowColor: appTheme.primary,
    shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  bulkBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  rosterRange: {
    marginHorizontal: 20, marginBottom: 26, padding: 18, borderRadius: 18,
    backgroundColor: appTheme.surface, borderColor: appTheme.border, borderWidth: 1,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  rosterRangeTitle: { color: appTheme.text, fontSize: 19, fontWeight: "900", textAlign: "center" },
  rosterRangeSub: { color: appTheme.muted, fontSize: 13, marginTop: 4 },
  dayTitle: { color: appTheme.text, fontSize: 18, fontWeight: "900", marginBottom: 10 },
  sheetScroll: {
    marginBottom: 18, borderColor: appTheme.border, borderWidth: 1, borderRadius: 22,
    backgroundColor: appTheme.surface, overflow: "hidden",
  },
  sheetHeaderRow: { flexDirection: "row", backgroundColor: appTheme.surfaceSoft },
  sheetNameHeader: {
    width: 200, minHeight: 64, paddingHorizontal: 20, justifyContent: "center",
    borderRightColor: appTheme.border, borderRightWidth: 1,
  },
  sheetHeaderText: { color: appTheme.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  sheetDayHeader: {
    width: 86, minHeight: 64, alignItems: "center", justifyContent: "center",
    borderRightColor: appTheme.border, borderRightWidth: 1,
  },
  sheetDayHeaderActive: { backgroundColor: appTheme.purpleSoft },
  sheetDow: { color: appTheme.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  sheetDayNum: { color: appTheme.text, fontSize: 14, fontWeight: "900", marginTop: 3 },
  sheetRow: { flexDirection: "row", borderTopColor: appTheme.border, borderTopWidth: 1 },
  sheetNameCell: {
    width: 200, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, borderRightColor: appTheme.border, borderRightWidth: 1,
  },
  sheetAvatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: appTheme.primary,
    borderColor: appTheme.border, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  sheetAvatarText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  sheetName: { color: appTheme.text, fontSize: 14, fontWeight: "900" },
  sheetMeta: { color: appTheme.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  sheetShiftCell: {
    width: 86, minHeight: 68, padding: 6, justifyContent: "center", alignItems: "center",
    borderRightWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomWidth: 0,
  },
  emptyShiftCell: { borderStyle: "dashed" },
  sheetShiftText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },
  sheetTimeText: { color: appTheme.muted, fontSize: 8, fontWeight: "800", marginTop: 4, textAlign: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 10, backgroundColor: appTheme.surface },
  summaryChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  entryCard: {
    flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 10,
    backgroundColor: appTheme.surface, borderColor: appTheme.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 16,
  },
  entryAvatar: {
    width: 42, height: 42, borderRadius: 21, marginRight: 10,
    backgroundColor: appTheme.primary, borderColor: appTheme.border, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  entryAvatarText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  entryName: { color: appTheme.text, fontWeight: "900", fontSize: 15 },
  entryShift: { fontSize: 12, fontWeight: "800", marginTop: 2, letterSpacing: 0.4 },
  entryTime: { color: appTheme.muted, fontSize: 12, marginTop: 4 },
  entryIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { color: appTheme.muted, fontSize: 13, textAlign: "center" },
  editDayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: appTheme.primary, height: 42, borderRadius: 12, marginBottom: 12,
  },
  editDayText: { color: "#fff", fontWeight: "900", letterSpacing: 0.8, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(30,18,91,0.62)", justifyContent: "center", alignItems: "center", padding: 20 },
  bulkModal: {
    width: "100%", maxWidth: 600, maxHeight: "88%", backgroundColor: appTheme.surface,
    borderRadius: 28, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.22,
    shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 8,
  },
  bulkHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 28, borderBottomColor: appTheme.border, borderBottomWidth: 1,
  },
  bulkTitle: { color: appTheme.text, fontSize: 22, fontWeight: "900" },
  bulkSub: { color: appTheme.muted, fontSize: 14, marginTop: 4 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: appTheme.surfaceSoft, alignItems: "center", justifyContent: "center" },
  bulkLabel: { color: "#6F7484", fontSize: 12, fontWeight: "900", letterSpacing: 0.8, marginHorizontal: 28, marginTop: 22, marginBottom: 10 },
  employeePicker: { marginHorizontal: 28, maxHeight: 190, borderColor: appTheme.border, borderWidth: 1, borderRadius: 14 },
  employeePickRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomColor: appTheme.border, borderBottomWidth: 1 },
  bulkAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: appTheme.primary, alignItems: "center", justifyContent: "center" },
  bulkAvatarText: { color: "#fff", fontWeight: "900" },
  employeePickName: { color: appTheme.text, fontSize: 15, fontWeight: "800" },
  employeePickMeta: { color: appTheme.muted, fontSize: 12, marginTop: 2 },
  shiftPickGrid: { marginHorizontal: 28, gap: 8 },
  shiftPick: {
    minHeight: 54, borderColor: appTheme.border, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10,
  },
  shiftDot: { width: 10, height: 10, borderRadius: 5 },
  shiftPickLabel: { color: appTheme.text, fontSize: 14, fontWeight: "900" },
  shiftPickTime: { color: appTheme.muted, fontSize: 12, marginTop: 2 },
  bulkActions: { flexDirection: "row", gap: 12, padding: 28 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 14, borderColor: appTheme.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: appTheme.text, fontWeight: "900" },
  applyBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: appTheme.primary, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: "#fff", fontWeight: "900" },
});
