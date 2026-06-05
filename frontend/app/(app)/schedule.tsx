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
import { colors, shiftLabel, shiftColor } from "@/src/theme";
import { ThemeSwitch } from "@/src/components/ThemeSwitch";
import { useThemeMode } from "@/src/theme-context";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DEFAULT_SHIFT_OPTIONS = ["morning", "afternoon", "night", "admin", "ega", "off"];

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
  const { theme } = useThemeMode();
  const styles = useMemo(() => getStyles(theme), [theme]);

  const assignShifts = useMemo(() => [
    { key: "morning", label: "Day Shift", time: "07:00 - 16:00", color: theme.primary },
    { key: "admin", label: "Admin Shift", time: "07:30 - 16:30", color: theme.blue },
    { key: "afternoon", label: "Afternoon Shift", time: "12:00 - 21:00", color: theme.green },
    { key: "night", label: "Night Shift", time: "21:00 - 06:00", color: theme.yellow },
    { key: "annual", label: "Vacation", time: "Preplanned leave", color: theme.green, saveAs: "leave", notes: "Preplanned vacation" },
    { key: "comp_off", label: "Comp Off", time: "Preplanned leave", color: theme.blue, saveAs: "leave", notes: "Preplanned comp off" },
    { key: "off", label: "Weekly Off", time: "Not scheduled", color: theme.muted },
  ], [theme]);

  const params = useLocalSearchParams<{ start?: string; weeks?: string }>();
  const rangeWeeks = params.weeks === "4" ? 4 : 2;
  const rangeLength = rangeWeeks * 7;
  const [weekStart, setWeekStart] = useState(startOfWeek(parseLocalDate(params.start)));
  const [entries, setEntries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [viewMode, setViewMode] = useState<"mine" | "team">("team");
  const [selectedStaffId, setSelectedStaffId] = useState("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkShift, setBulkShift] = useState("morning");
  const [savingBulk, setSavingBulk] = useState(false);
  const [alsoUpdateDefaultShift, setAlsoUpdateDefaultShift] = useState(false);

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

  useEffect(() => {
    setSelectedStaffId("all");
  }, [viewMode]);

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
    .filter(e => e.shift_date === selectedDate && (selectedStaffId === "all" || e.user_id === selectedStaffId))
    .sort((a, b) => {
      const rank = (s: string) => s === "off" ? 3 : s === "leave" ? 2 : 1;
      return rank(a.shift_type) - rank(b.shift_type) || a.user_name.localeCompare(b.user_name);
    });

  const shiftSummary = useMemo(() => {
    const c: Record<string, number> = {};
    dayEntries.forEach(e => { c[e.shift_type] = (c[e.shift_type] || 0) + 1; });
    return c;
  }, [dayEntries]);

  const coverageByDate = useMemo(() => {
    const map = new Map<string, { working: number; leave: number; off: number; total: number }>();
    weekDays.forEach(d => map.set(fmtDate(d), { working: 0, leave: 0, off: 0, total: 0 }));
    entries.forEach(e => {
      const item = map.get(e.shift_date);
      if (!item) return;
      item.total += 1;
      if (e.shift_type === "leave") item.leave += 1;
      else if (e.shift_type === "off") item.off += 1;
      else item.working += 1;
    });
    return map;
  }, [entries, weekDays]);

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

  const visibleSheetUsers = useMemo(() => {
    if (selectedStaffId === "all") return sheetUsers;
    return sheetUsers.filter((u: any) => u.id === selectedStaffId);
  }, [sheetUsers, selectedStaffId]);

  const toggleBulkUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleBulkDate = (dateKey: string) => {
    setSelectedDates(prev => prev.includes(dateKey) ? prev.filter(x => x !== dateKey) : [...prev, dateKey]);
  };

  const selectUsersByDefaultShift = (shift: string) => {
    if (shift === "all") {
      setSelectedUsers(sheetUsers.map((u: any) => u.id));
      return;
    }
    if (shift === "clear") {
      setSelectedUsers([]);
      return;
    }
    setSelectedUsers(
      sheetUsers
        .filter((u: any) => (u.default_shift || "") === shift)
        .map((u: any) => u.id),
    );
  };

  const selectUsersByScheduledShift = (shift: string) => {
    const dates = selectedDates.length ? selectedDates : [selectedDate];
    const ids = new Set(
      entries
        .filter(e => dates.includes(e.shift_date) && e.shift_type === shift)
        .map(e => e.user_id),
    );
    setSelectedUsers(sheetUsers.filter((u: any) => ids.has(u.id)).map((u: any) => u.id));
  };

  const selectBulkDates = (mode: "all" | "weekdays" | "today" | "clear") => {
    if (mode === "clear") {
      setSelectedDates([]);
      return;
    }
    if (mode === "today") {
      setSelectedDates([selectedDate]);
      return;
    }
    setSelectedDates(
      weekDays
        .filter(d => mode === "all" || (d.getDay() !== 0 && d.getDay() !== 6))
        .map(fmtDate),
    );
  };

  const openBulkAssign = () => {
    setSelectedUsers([]);
    setSelectedDates([selectedDate]);
    setBulkShift("morning");
    setAlsoUpdateDefaultShift(false);
    setBulkOpen(true);
  };

  const openSingleAssign = (userId: string, dateKey: string, shiftType?: string | null) => {
    setSelectedUsers([userId]);
    setSelectedDates([dateKey]);
    setBulkShift(shiftType && shiftType !== "leave" ? shiftType : "morning");
    setAlsoUpdateDefaultShift(false);
    setBulkOpen(true);
  };

  const openInlineDefaultShiftPicker = (targetUser: any) => {
    Alert.alert(
      `Set Default Shift`,
      `Choose default shift for ${targetUser.full_name}:`,
      [
        { text: "Cancel", style: "cancel" },
        ...DEFAULT_SHIFT_OPTIONS.map(s => ({
          text: shiftLabel[s] || s,
          onPress: async () => {
            try {
              await api.patch(`/users/${targetUser.id}`, { default_shift: s });
              Alert.alert("Success", `Default shift for ${targetUser.full_name} updated to ${shiftLabel[s] || s}.`);
              await load();
            } catch (err) {
              Alert.alert("Error", errMsg(err));
            }
          }
        }))
      ]
    );
  };

  const saveBulkAssign = async () => {
    if (!selectedUsers.length) {
      Alert.alert("Select employees", "Choose at least one employee.");
      return;
    }
    if (!selectedDates.length && !alsoUpdateDefaultShift) {
      Alert.alert("Select days", "Choose at least one date to update, or check 'Also save as Default Shift'.");
      return;
    }
    setSavingBulk(true);
    try {
      const chosenShift = assignShifts.find(s => s.key === bulkShift);
      const shiftToSave = chosenShift?.saveAs || bulkShift;
      
      const promises: Promise<any>[] = [];
      
      if (alsoUpdateDefaultShift) {
        selectedUsers.forEach(userId => {
          promises.push(api.patch(`/users/${userId}`, { default_shift: shiftToSave }));
        });
      }
      
      if (selectedDates.length) {
        selectedUsers.forEach(userId => {
          selectedDates.forEach(shift_date => {
            promises.push(api.post("/schedules", {
              user_id: userId,
              shift_date,
              shift_type: shiftToSave,
              notes: chosenShift?.notes,
            }));
          });
        });
      }

      await Promise.all(promises);
      setBulkOpen(false);
      Alert.alert("Success", "Schedule/default shifts updated successfully.");
      await load();
    } catch (e) {
      Alert.alert("Could not assign", errMsg(e));
    } finally {
      setSavingBulk(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Schedules</Text>
          <Text style={[styles.rangeLabel, { color: theme.muted }]}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
        </View>
        <View style={styles.scheduleThemeSwitch}>
          <ThemeSwitch compact />
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

      {viewMode === "team" && (
        <View style={styles.staffFilterBlock}>
          <Text style={styles.staffFilterLabel}>EMPLOYEE SCHEDULE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffFilterScroll}>
            <TouchableOpacity
              testID="schedule-staff-all"
              style={[styles.staffFilterChip, selectedStaffId === "all" && styles.staffFilterChipActive]}
              onPress={() => setSelectedStaffId("all")}
            >
              <Ionicons name="people" size={14} color={selectedStaffId === "all" ? "#fff" : theme.primary} />
              <Text style={[styles.staffFilterText, selectedStaffId === "all" && { color: "#fff" }]}>All Staff</Text>
            </TouchableOpacity>
            {sheetUsers.map((u: any) => {
              const active = selectedStaffId === u.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  testID={`schedule-staff-${u.id}`}
                  style={[styles.staffFilterChip, active && styles.staffFilterChipActive]}
                  onPress={() => setSelectedStaffId(u.id)}
                >
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.staffFilterAvatar} />
                  ) : (
                    <View style={styles.staffFilterAvatar}>
                      <Text style={styles.staffFilterAvatarText}>{String(u.full_name || "?").slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={[styles.staffFilterText, active && { color: "#fff" }]} numberOfLines={1}>{u.full_name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

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
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
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
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverageStrip}>
        {weekDays.map((d, i) => {
          const dateKey = fmtDate(d);
          const info = coverageByDate.get(dateKey) || { working: 0, leave: 0, off: 0, total: 0 };
          const active = selectedDay === i;
          return (
            <TouchableOpacity
              key={dateKey}
              testID={`coverage-date-${dateKey}`}
              style={[styles.coverageDayCard, active && styles.coverageDayCardActive]}
              onPress={() => {
                setSelectedDay(i);
                setSelectedDates([dateKey]);
              }}
            >
              <Text style={[styles.coverageDow, active && { color: "#fff" }]}>{DAY_LABELS[i % 7]}</Text>
              <Text style={[styles.coverageNum, active && { color: "#fff" }]}>{d.getDate()}</Text>
              <View style={styles.coverageCounts}>
                <Text style={[styles.coverageCountText, active && { color: "#fff" }]}>Work {info.working}</Text>
                <Text style={[styles.coverageCountText, { color: theme.green }, active && { color: "#fff" }]}>Leave {info.leave}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
                {visibleSheetUsers.map((u: any) => (
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
                            { borderColor: entry ? sc.c : theme.border, backgroundColor: entry ? tintForShift(entry.shift_type, theme) : theme.surface },
                          ]}
                          onPress={() => {
                            setSelectedDay(i);
                            if (isAdmin) openSingleAssign(u.id, dateKey, entry?.shift_type);
                          }}
                        >
                          <Text style={[styles.sheetShiftText, { color: entry ? colorForShift(entry.shift_type, theme) : theme.muted }]}>
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
                  <Text style={styles.bulkTitle}>Assign Schedule</Text>
                  <Text style={styles.bulkSub}>{selectedUsers.length} employee(s) · {selectedDates.length} day(s)</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setBulkOpen(false)}>
                  <Ionicons name="close" size={20} color={theme.muted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
                <Text style={styles.bulkLabel}>SELECT EMPLOYEES *</Text>
                <View style={styles.bulkHelperBox}>
                  <Text style={styles.bulkHelperTitle}>Staff selection</Text>
                  <Text style={styles.bulkHelperText}>Tap one employee, several employees, or use a shortcut. Current Day/Night uses the schedule already shown for your selected date(s).</Text>
                </View>
                <View style={styles.quickSelectRow}>
                  {[
                    { key: "current_morning", label: "Current Day" },
                    { key: "current_night", label: "Current Night" },
                    { key: "morning", label: "Default Day" },
                    { key: "night", label: "Default Night" },
                    { key: "admin", label: "Admin" },
                    { key: "all", label: "All Staff" },
                    { key: "clear", label: "Clear" },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.key}
                      testID={`bulk-select-${option.key}`}
                      style={styles.quickSelectBtn}
                      onPress={() => {
                        if (option.key === "current_morning") selectUsersByScheduledShift("morning");
                        else if (option.key === "current_night") selectUsersByScheduledShift("night");
                        else selectUsersByDefaultShift(option.key);
                      }}
                    >
                      <Text style={styles.quickSelectText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ScrollView style={styles.employeePicker} nestedScrollEnabled>
                  {sheetUsers.map((u: any) => {
                    const checked = selectedUsers.includes(u.id);
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.employeePickRow, checked && styles.employeePickRowActive]}
                        onPress={() => toggleBulkUser(u.id)}
                      >
                        <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? theme.primary : theme.muted} />
                        {u.avatar_url ? (
                          <Image source={{ uri: u.avatar_url }} style={styles.bulkAvatar} />
                        ) : (
                          <View style={styles.bulkAvatar}><Text style={styles.bulkAvatarText}>{String(u.full_name || "?").slice(0, 1).toUpperCase()}</Text></View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.employeePickName}>{u.full_name}</Text>
                          <Text style={styles.employeePickMeta}>
                            {u.team ? `Team ${u.team}` : "Management"}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.inlineShiftBtn}
                          onPress={() => openInlineDefaultShiftPicker(u)}
                        >
                          <Text style={styles.inlineShiftText}>
                            {shiftLabel[u.default_shift || ""] || "Set Default"}
                          </Text>
                          <Ionicons name="chevron-down" size={12} color={theme.muted} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.bulkLabel}>SELECT DAYS *</Text>
                <View style={styles.bulkHelperBox}>
                  <Text style={styles.bulkHelperTitle}>Date selection</Text>
                  <Text style={styles.bulkHelperText}>Pick one day for single-duty coverage, or select multiple dates for repeated assignment.</Text>
                </View>
                <View style={styles.quickSelectRow}>
                  {[
                    { key: "today", label: "Selected Day" },
                    { key: "weekdays", label: "Weekdays" },
                    { key: "all", label: "All Days" },
                    { key: "clear", label: "Clear Days" },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.key}
                      testID={`bulk-date-select-${option.key}`}
                      style={styles.quickSelectBtn}
                      onPress={() => selectBulkDates(option.key as any)}
                    >
                      <Text style={styles.quickSelectText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.bulkDateGrid}>
                  {weekDays.map((d, index) => {
                    const dateKey = fmtDate(d);
                    const checked = selectedDates.includes(dateKey);
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <TouchableOpacity
                        key={dateKey}
                        testID={`bulk-date-${dateKey}`}
                        style={[
                          styles.bulkDateChip,
                          checked && styles.bulkDateChipActive,
                          weekend && styles.bulkDateChipWeekend,
                        ]}
                        onPress={() => toggleBulkDate(dateKey)}
                      >
                        <Text style={[styles.bulkDateDow, checked && { color: "#fff" }]}>
                          {DAY_LABELS[index % 7]}
                        </Text>
                        <Text style={[styles.bulkDateNum, checked && { color: "#fff" }]}>{d.getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.bulkLabel}>SELECT SHIFT *</Text>
                <View style={styles.bulkHelperBox}>
                  <Text style={styles.bulkHelperTitle}>Shift to apply</Text>
                  <Text style={styles.bulkHelperText}>This overwrites the selected employee/date schedule cells only.</Text>
                </View>
                <View style={styles.shiftPickGrid}>
                  {assignShifts.map(s => {
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

                <TouchableOpacity
                  style={styles.defaultShiftCheckboxRow}
                  onPress={() => setAlsoUpdateDefaultShift(prev => !prev)}
                >
                  <Ionicons
                    name={alsoUpdateDefaultShift ? "checkbox" : "square-outline"}
                    size={22}
                    color={alsoUpdateDefaultShift ? theme.primary : theme.muted}
                  />
                  <Text style={styles.defaultShiftCheckboxText}>Also save as Default Shift for selected employees</Text>
                </TouchableOpacity>
              </ScrollView>

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

function colorForShift(t: string | null | undefined, theme: any) {
  switch (t) {
    case "morning":
    case "sat_day":
    case "sun_day":
      return theme.primary;
    case "afternoon":
      return theme.green;
    case "night":
    case "sat_night":
    case "sun_night":
      return theme.yellow;
    case "leave":
      return theme.blue;
    case "off":
      return theme.muted;
    default:
      return theme.primary;
  }
}

function tintForShift(t: string | null | undefined, theme: any) {
  switch (t) {
    case "morning":
    case "sat_day":
    case "sun_day":
      return theme.purpleSoft;
    case "afternoon":
      return theme.greenSoft;
    case "night":
    case "sat_night":
    case "sun_night":
      return theme.yellowSoft;
    case "leave":
      return theme.blueSoft;
    case "off":
      return theme.surfaceSoft;
    default:
      return theme.surface;
  }
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    alignItems: "center", backgroundColor: theme.surface, borderBottomColor: theme.border, borderBottomWidth: 1,
  },
  title: { color: theme.text, fontSize: 22, fontWeight: "900" },
  rangeLabel: { color: theme.muted, fontSize: 13, marginTop: 2, fontWeight: "700" },
  avatarTop: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  avatarTopText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  scheduleThemeSwitch: { width: 150, marginRight: 10 },
  navBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderColor: theme.border, borderWidth: 1, borderRadius: 12, backgroundColor: theme.surface,
  },
  toggleRow: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 16, marginBottom: 12,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  toggleBtnActive: { backgroundColor: theme.primary },
  toggleText: { color: theme.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  toggleTextActive: { color: "#fff" },
  scheduleIntro: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, marginTop: 22, marginBottom: 16,
  },
  sheetTitle: { color: theme.text, fontSize: 28, fontWeight: "900" },
  sheetHint: { color: theme.muted, fontSize: 14, marginTop: 4 },
  bulkBtn: {
    height: 46, paddingHorizontal: 20, borderRadius: 14, backgroundColor: theme.primary,
    flexDirection: "row", alignItems: "center", gap: 8, shadowColor: theme.primary,
    shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  bulkBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  staffFilterBlock: { marginHorizontal: 20, marginBottom: 14 },
  staffFilterLabel: { color: theme.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  staffFilterScroll: { gap: 8, paddingRight: 20 },
  staffFilterChip: {
    minHeight: 42, maxWidth: 190, flexDirection: "row", alignItems: "center", gap: 8,
    borderColor: theme.border, borderWidth: 1, borderRadius: 14, backgroundColor: theme.surface,
    paddingHorizontal: 12,
  },
  staffFilterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  staffFilterAvatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: theme.purpleSoft,
    alignItems: "center", justifyContent: "center",
  },
  staffFilterAvatarText: { color: theme.primary, fontSize: 11, fontWeight: "900" },
  staffFilterText: { color: theme.text, fontSize: 12, fontWeight: "900", maxWidth: 126 },
  rosterRange: {
    marginHorizontal: 20, marginBottom: 12, padding: 18, borderRadius: 18,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  rosterRangeTitle: { color: theme.text, fontSize: 19, fontWeight: "900", textAlign: "center" },
  rosterRangeSub: { color: theme.muted, fontSize: 13, marginTop: 4 },
  coverageStrip: { gap: 10, paddingHorizontal: 20, paddingBottom: 18 },
  coverageDayCard: {
    width: 104, minHeight: 104, borderRadius: 18, backgroundColor: theme.surface,
    borderColor: theme.border, borderWidth: 1, padding: 12, justifyContent: "space-between",
  },
  coverageDayCardActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  coverageDow: { color: theme.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  coverageNum: { color: theme.text, fontSize: 24, fontWeight: "900" },
  coverageCounts: { gap: 2 },
  coverageCountText: { color: theme.text, fontSize: 10, fontWeight: "900" },
  dayTitle: { color: theme.text, fontSize: 18, fontWeight: "900", marginBottom: 10 },
  sheetScroll: {
    marginBottom: 18, borderColor: theme.border, borderWidth: 1, borderRadius: 22,
    backgroundColor: theme.surface, overflow: "hidden",
  },
  sheetHeaderRow: { flexDirection: "row", backgroundColor: theme.surfaceSoft },
  sheetNameHeader: {
    width: 200, minHeight: 64, paddingHorizontal: 20, justifyContent: "center",
    borderRightColor: theme.border, borderRightWidth: 1,
  },
  sheetHeaderText: { color: theme.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  sheetDayHeader: {
    width: 86, minHeight: 64, alignItems: "center", justifyContent: "center",
    borderRightColor: theme.border, borderRightWidth: 1,
  },
  sheetDayHeaderActive: { backgroundColor: theme.purpleSoft },
  sheetDow: { color: theme.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  sheetDayNum: { color: theme.text, fontSize: 14, fontWeight: "900", marginTop: 3 },
  sheetRow: { flexDirection: "row", borderTopColor: theme.border, borderTopWidth: 1 },
  sheetNameCell: {
    width: 200, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, borderRightColor: theme.border, borderRightWidth: 1,
  },
  sheetAvatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.primary,
    borderColor: theme.border, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  sheetAvatarText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  sheetName: { color: theme.text, fontSize: 14, fontWeight: "900" },
  sheetMeta: { color: theme.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  sheetShiftCell: {
    width: 86, minHeight: 68, padding: 6, justifyContent: "center", alignItems: "center",
    borderRightWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomWidth: 0,
  },
  emptyShiftCell: { borderStyle: "dashed" },
  sheetShiftText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },
  sheetTimeText: { color: theme.muted, fontSize: 8, fontWeight: "800", marginTop: 4, textAlign: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 10, backgroundColor: theme.surface },
  summaryChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  entryCard: {
    flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 10,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 16,
  },
  entryAvatar: {
    width: 42, height: 42, borderRadius: 21, marginRight: 10,
    backgroundColor: theme.primary, borderColor: theme.border, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  entryAvatarText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  entryName: { color: theme.text, fontWeight: "900", fontSize: 15 },
  entryShift: { fontSize: 12, fontWeight: "800", marginTop: 2, letterSpacing: 0.4 },
  entryTime: { color: theme.muted, fontSize: 12, marginTop: 4 },
  entryIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { color: theme.muted, fontSize: 13, textAlign: "center" },
  editDayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.primary, height: 42, borderRadius: 12, marginBottom: 12,
  },
  editDayText: { color: "#fff", fontWeight: "900", letterSpacing: 0.8, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(30,18,91,0.62)", justifyContent: "center", alignItems: "center", padding: 20 },
  bulkModal: {
    width: "100%", maxWidth: 600, maxHeight: "88%", backgroundColor: theme.surface,
    borderRadius: 28, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.22,
    shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 8,
  },
  bulkHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 28, borderBottomColor: theme.border, borderBottomWidth: 1,
  },
  bulkTitle: { color: theme.text, fontSize: 22, fontWeight: "900" },
  bulkSub: { color: theme.muted, fontSize: 14, marginTop: 4 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.surfaceSoft, alignItems: "center", justifyContent: "center" },
  bulkLabel: { color: "#6F7484", fontSize: 12, fontWeight: "900", letterSpacing: 0.8, marginHorizontal: 28, marginTop: 22, marginBottom: 10 },
  bulkHelperBox: {
    marginHorizontal: 28, marginBottom: 10, padding: 12, borderRadius: 14,
    backgroundColor: theme.surfaceSoft, borderColor: theme.border, borderWidth: 1,
  },
  bulkHelperTitle: { color: theme.text, fontSize: 12, fontWeight: "900" },
  bulkHelperText: { color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  employeePicker: { marginHorizontal: 28, maxHeight: 190, borderColor: theme.border, borderWidth: 1, borderRadius: 14 },
  quickSelectRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 28, marginBottom: 10 },
  quickSelectBtn: {
    minHeight: 34, paddingHorizontal: 10, borderRadius: 10, borderColor: theme.border,
    borderWidth: 1, backgroundColor: theme.surfaceSoft, alignItems: "center", justifyContent: "center",
  },
  quickSelectText: { color: theme.text, fontSize: 11, fontWeight: "900" },
  employeePickRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomColor: theme.border, borderBottomWidth: 1 },
  employeePickRowActive: { backgroundColor: theme.purpleSoft },
  bulkAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  bulkAvatarText: { color: "#fff", fontWeight: "900" },
  employeePickName: { color: theme.text, fontSize: 15, fontWeight: "800" },
  employeePickMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  bulkDateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 28, marginBottom: 6 },
  bulkDateChip: {
    width: 56, minHeight: 54, borderRadius: 14, borderColor: theme.border, borderWidth: 1,
    backgroundColor: theme.surfaceSoft, alignItems: "center", justifyContent: "center",
  },
  bulkDateChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  bulkDateChipWeekend: { borderStyle: "dashed" },
  bulkDateDow: { color: theme.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  bulkDateNum: { color: theme.text, fontSize: 16, fontWeight: "900", marginTop: 2 },
  shiftPickGrid: { marginHorizontal: 28, gap: 8 },
  shiftPick: {
    minHeight: 54, borderColor: theme.border, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10,
  },
  shiftDot: { width: 10, height: 10, borderRadius: 5 },
  shiftPickLabel: { color: theme.text, fontSize: 14, fontWeight: "900" },
  shiftPickTime: { color: theme.muted, fontSize: 12, marginTop: 2 },
  bulkActions: { flexDirection: "row", gap: 12, padding: 28 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 14, borderColor: theme.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: theme.text, fontWeight: "900" },
  applyBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: "#fff", fontWeight: "900" },
  inlineShiftBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.surfaceSoft,
    gap: 4
  },
  inlineShiftText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary
  },
  defaultShiftCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 28,
    marginTop: 20,
    marginBottom: 10,
  },
  defaultShiftCheckboxText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  }
});
