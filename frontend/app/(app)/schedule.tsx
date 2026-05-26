import { useCallback, useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, shiftLabel, shiftColor } from "@/src/theme";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function startOfWeek(d = new Date()) {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Schedule() {
  const { user, isAdmin } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [viewMode, setViewMode] = useState<"mine" | "team">("mine");

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = fmtDate(weekDays[0]);
      const end = fmtDate(weekDays[6]);
      const params: any = { start_date: start, end_date: end };
      if (viewMode === "mine") params.user_id = user?.id;
      const r = await api.get("/schedules", { params });
      setEntries(r.data);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [weekDays, viewMode, user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["schedules", "leaves", "users"]);

  const selectedDate = fmtDate(weekDays[selectedDay]);
  const dayEntries = entries.filter(e => e.shift_date === selectedDate);

  const shiftSummary = useMemo(() => {
    const c: Record<string, number> = {};
    dayEntries.forEach(e => { c[e.shift_type] = (c[e.shift_type] || 0) + 1; });
    return c;
  }, [dayEntries]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>SCHEDULE</Text>
          <Text style={styles.title}>Week of {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
        </View>
        <View style={styles.navBtns}>
          <TouchableOpacity
            testID="schedule-prev-week"
            style={styles.navBtn}
            onPress={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="schedule-next-week"
            style={styles.navBtn}
            onPress={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {isAdmin && (
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
      )}

      {/* Week strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {weekDays.map((d, i) => {
          const isSelected = selectedDay === i;
          const dayEntriesCount = entries.filter(e => e.shift_date === fmtDate(d)).length;
          return (
            <TouchableOpacity
              key={i}
              testID={`schedule-day-${i}`}
              onPress={() => setSelectedDay(i)}
              style={[styles.dayCell, isSelected && styles.dayCellActive]}
            >
              <Text style={[styles.dayLabel, isSelected && { color: colors.bg }]}>{DAY_LABELS[i]}</Text>
              <Text style={[styles.dayNum, isSelected && { color: colors.bg }]}>{d.getDate()}</Text>
              {dayEntriesCount > 0 && (
                <View style={[styles.dot, isSelected && { backgroundColor: colors.bg }]} />
              )}
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
            <View style={{ height: 12 }} />
          </View>
        }
        renderItem={({ item }) => {
          const sc = shiftColor(item.shift_type);
          return (
            <View style={[styles.entryCard, { borderLeftColor: sc.c }]} testID={`schedule-entry-${item.user_id}`}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", padding: 20, paddingBottom: 12, alignItems: "flex-end" },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
  navBtns: { flexDirection: "row", gap: 8 },
  navBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surface,
  },
  toggleRow: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4, padding: 2,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 2 },
  toggleBtnActive: { backgroundColor: colors.textPrimary },
  toggleText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  toggleTextActive: { color: colors.bg },
  weekScroll: { maxHeight: 96, marginBottom: 8 },
  dayCell: {
    width: 56, marginRight: 8, paddingVertical: 12, borderRadius: 4,
    alignItems: "center", backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
  },
  dayCellActive: { backgroundColor: colors.morning, borderColor: colors.morning },
  dayLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  dayNum: { color: colors.textPrimary, fontSize: 20, fontWeight: "800", marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.morning, marginTop: 4 },
  dayTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 10 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  summaryChip: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 2 },
  summaryChipText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  entryCard: {
    flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 10,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 6,
  },
  entryName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  entryShift: { fontSize: 12, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  entryTime: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  entryIcon: { width: 44, height: 44, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  editDayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.morning, height: 40, borderRadius: 4, marginBottom: 12,
  },
  editDayText: { color: colors.bg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
