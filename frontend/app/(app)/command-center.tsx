import { useCallback, useMemo, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, shiftLabel, shiftColor, leaveLabel, leaveColor } from "@/src/theme";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

type DayCell = {
  date: string;
  weekday: number;
  shifts: Record<string, { user_id: string; user_name: string; start_time: string; end_time: string }[]>;
  leaves: { user_id: string; user_name: string; leave_type: string; status: string }[];
  attendance: {
    user_id: string;
    user_name: string;
    status: string;
    clock_in?: string | null;
    clock_out?: string | null;
    hours_worked: number;
    shift_type?: string | null;
  }[];
  roster: {
    user_id: string;
    user_name: string;
    shift_type?: string | null;
    start_time: string;
    end_time: string;
    scheduled_hours: number;
    attendance_status?: string | null;
    clock_in?: string | null;
    clock_out?: string | null;
    hours_worked: number;
    log_state: "missing" | "marked" | "clocked_in" | "finished" | "absent";
  }[];
  roster_summary: { scheduled: number; finished: number; clocked_in: number; marked: number; missing: number };
  attendance_summary: { present: number; late: number; absent: number; half_day: number; total: number };
  coverage: { morning: number; afternoon: number; night: number };
  coverage_if_pending_approved: { morning: number; afternoon: number; night: number };
  pending_leave_impact: { morning: number; afternoon: number; night: number };
  status: "ok" | "warn" | "critical";
  pending_status: "ok" | "warn" | "critical";
};

type CalendarData = {
  range: { start_date: string; end_date: string; year: number; month: number };
  minimum_coverage: { morning: number; afternoon: number; night: number };
  days: DayCell[];
  summary: {
    total_active_staff: number;
    total_scheduled_entries: number;
    total_scheduled_hours: number;
    approved_leaves: number;
    pending_leaves: number;
    marked_attendance: number;
    critical_days: number;
    warn_days: number;
  };
};

export default function CommandCenter() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<CalendarData>("/calendar/month", { params: { year, month } });
      setData(r.data);
    } catch (e) {
      console.warn(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeRefresh(load, ["schedules", "leaves", "users", "attendance"]);

  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [year, month]
  );

  const grid = useMemo(() => {
    if (!data) return [];
    const first = new Date(year, month - 1, 1);
    const firstDow = (first.getDay() + 6) % 7; // make Monday=0
    const cells: (DayCell | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    data.days.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data, year, month]);

  const prev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="cc-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>COMMAND CENTER</Text>
          <Text style={styles.title}>Coverage Calendar</Text>
        </View>
      </View>

      <View style={styles.monthRow}>
        <TouchableOpacity testID="cc-prev" style={styles.monthBtn} onPress={prev}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity testID="cc-next" style={styles.monthBtn} onPress={next}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {/* Comparison summary */}
        {data && (
          <View style={styles.compareTable}>
            <Text style={styles.sectionTitle}>MONTH AT A GLANCE</Text>
            <View style={styles.compareGrid}>
              <CompareCell icon="people" label="Active Staff" value={data.summary.total_active_staff} color={colors.morning} />
              <CompareCell icon="time" label="Scheduled Hrs" value={`${data.summary.total_scheduled_hours}h`} color={colors.afternoon} />
              <CompareCell icon="layers" label="Shift Entries" value={data.summary.total_scheduled_entries} color={colors.night} />
              <CompareCell icon="airplane" label="Approved Leaves" value={data.summary.approved_leaves} color={colors.success} />
              <CompareCell icon="hourglass" label="Pending Leaves" value={data.summary.pending_leaves} color={colors.warning} />
              <CompareCell icon="reader" label="Marked Attendance" value={data.summary.marked_attendance} color={colors.success} />
            </View>
            <View style={styles.minRow}>
              <Text style={styles.minTxt}>
                MIN COVERAGE: <Text style={{ color: colors.morning }}>3 morning</Text> ·{" "}
                <Text style={{ color: colors.afternoon }}>2 afternoon</Text> ·{" "}
                <Text style={{ color: colors.night }}>2 night</Text>
              </Text>
            </View>
          </View>
        )}

        <View style={styles.guideCard}>
          <View style={styles.guideRow}>
            <LegendItem color={colors.success} label="Covered" />
            <LegendItem color={colors.warning} label="At minimum" />
            <LegendItem color={colors.danger} label="Below minimum" />
          </View>
          <Text style={styles.guideText}>
            Each date shows Morning, Afternoon, and Night coverage as current staff / minimum required.
            Bottom counters show Leave, Logs, and Missing attendance.
          </Text>
        </View>

        <View style={styles.calendarShell}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.calendarCanvas}>
              <View style={styles.dowRow}>
                {DOW.map(d => <Text key={d} style={styles.dowLabel}>{d}</Text>)}
              </View>

              {loading && !data ? (
                <ActivityIndicator color={colors.morning} style={{ marginTop: 40 }} />
              ) : (
                <View style={styles.grid}>
                  {grid.map((cell, i) => {
                    if (!cell) return <View key={i} style={[styles.cell, styles.emptyCell]} />;
                    const isCritical = cell.status === "critical";
                    const isWarn = cell.status === "warn";
                    const color = isCritical ? colors.danger : isWarn ? colors.warning : colors.success;
                    const bg = isCritical ? "rgba(255,59,48,0.10)" : isWarn ? "rgba(255,159,10,0.10)" : "rgba(20,20,20,0.96)";
                    const dayNum = parseInt(cell.date.slice(-2), 10);
                    const statusText = isCritical ? "Below minimum" : isWarn ? "At minimum" : "Covered";
                    return (
                      <TouchableOpacity
                        key={cell.date}
                        testID={`cc-day-${dayNum}`}
                        style={[styles.cell, { borderColor: color, backgroundColor: bg }]}
                        onPress={() => setSelectedDay(cell)}
                      >
                        <View style={styles.cellTop}>
                          <View>
                            <Text style={styles.cellDate}>{dayNum}</Text>
                            <Text style={styles.cellMonth}>
                              {new Date(cell.date).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
                            </Text>
                          </View>
                          <View style={[styles.dayStatusPill, { borderColor: color, backgroundColor: `${color}18` }]}>
                            <Text style={[styles.dayStatusText, { color }]}>{statusText}</Text>
                          </View>
                        </View>
                        <View style={styles.cellCoverageStack}>
                          <CoverageMini label="Morning" count={cell.coverage.morning} min={data?.minimum_coverage.morning || 3} color={colors.morning} />
                          <CoverageMini label="Afternoon" count={cell.coverage.afternoon} min={data?.minimum_coverage.afternoon || 2} color={colors.afternoon} />
                          <CoverageMini label="Night" count={cell.coverage.night} min={data?.minimum_coverage.night || 2} color={colors.night} />
                        </View>
                        <View style={styles.cellFooter}>
                          <FooterStat icon="airplane" label="Leave" value={cell.leaves.length} color={colors.leave} />
                          <FooterStat icon="checkmark-done" label="Logs" value={cell.attendance_summary.total} color={colors.success} />
                          <FooterStat
                            icon="alert-circle"
                            label="Missing"
                            value={cell.roster_summary?.missing || 0}
                            color={cell.roster_summary?.missing > 0 ? colors.danger : colors.textMuted}
                          />
                        </View>
                        {cell.pending_status !== "ok" && (
                          <View style={styles.pendingRiskRow}>
                            <Ionicons name="hourglass" size={10} color={colors.warning} />
                            <Text style={styles.pendingRiskText}>Pending leave may reduce coverage</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Day detail modal */}
      <Modal visible={!!selectedDay} transparent animationType="slide" onRequestClose={() => setSelectedDay(null)}>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalBox} contentContainerStyle={{ paddingBottom: 40 }}>
            {selectedDay && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalDate}>
                      {new Date(selectedDay.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    </Text>
                    <Text style={[
                      styles.modalStatus,
                      {
                        color: selectedDay.status === "critical" ? colors.danger
                          : selectedDay.status === "warn" ? colors.warning : colors.success,
                      },
                    ]}>
                      {selectedDay.status === "critical" ? "⚠ BELOW MINIMUM COVERAGE"
                        : selectedDay.status === "warn" ? "AT MINIMUM" : "FULLY COVERED"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedDay(null)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Coverage row */}
                <View style={styles.covRow}>
                  <CoverageItem label="Morning" count={selectedDay.coverage.morning} min={3} color={colors.morning} />
                  <CoverageItem label="Afternoon" count={selectedDay.coverage.afternoon} min={2} color={colors.afternoon} />
                  <CoverageItem label="Night" count={selectedDay.coverage.night} min={2} color={colors.night} />
                </View>

                {selectedDay.pending_status !== "ok" && (
                  <>
                    <Text style={[styles.modalSection, { color: colors.warning }]}>IF PENDING LEAVE IS APPROVED</Text>
                    <View style={styles.covRow}>
                      <CoverageItem label="Morning" count={selectedDay.coverage_if_pending_approved.morning} min={3} color={colors.morning} />
                      <CoverageItem label="Afternoon" count={selectedDay.coverage_if_pending_approved.afternoon} min={2} color={colors.afternoon} />
                      <CoverageItem label="Night" count={selectedDay.coverage_if_pending_approved.night} min={2} color={colors.night} />
                    </View>
                  </>
                )}

                {/* Combined roster log */}
                {selectedDay.roster?.length > 0 && (
                  <>
                    <Text style={[styles.modalSection, { color: colors.morning }]}>
                      STAFF SHIFT LOG ({selectedDay.roster.length})
                    </Text>
                    <View style={styles.rosterSummaryRow}>
                      <RosterSummary label="Finished" value={selectedDay.roster_summary.finished} color={colors.success} />
                      <RosterSummary label="In" value={selectedDay.roster_summary.clocked_in} color={colors.morning} />
                      <RosterSummary label="Marked" value={selectedDay.roster_summary.marked} color={colors.warning} />
                      <RosterSummary label="Missing" value={selectedDay.roster_summary.missing} color={colors.danger} />
                    </View>
                    {selectedDay.roster.map((row, i) => {
                      const state = rosterState(row);
                      const sc = shiftColor(row.shift_type || "");
                      return (
                        <View key={`${row.user_id}-${row.shift_type}-${i}`} style={[styles.rosterRow, { borderLeftColor: state.color }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.entryName}>{row.user_name}</Text>
                            <Text style={[styles.entryShift, { color: sc.c }]}>
                              {shiftLabel[row.shift_type || ""] || row.shift_type || "Unscheduled"}
                              {row.start_time ? ` · ${row.start_time}-${row.end_time}` : ""}
                            </Text>
                            <Text style={styles.entryTime}>
                              Logged: {row.clock_in || "--"} - {row.clock_out || "--"}
                              {row.hours_worked ? ` · ${row.hours_worked}h` : ""}
                            </Text>
                          </View>
                          <View style={[styles.logPill, { borderColor: state.color }]}>
                            <Text style={[styles.logPillText, { color: state.color }]}>{state.label}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}

                {/* Attendance */}
                {selectedDay.attendance.length > 0 && (
                  <>
                    <Text style={[styles.modalSection, { color: colors.success }]}>
                      ATTENDANCE LOG ({selectedDay.attendance.length})
                    </Text>
                    {selectedDay.attendance.map((att, i) => {
                      const statusColor =
                        att.status === "present" ? colors.success
                          : att.status === "late" ? colors.warning
                          : att.status === "absent" ? colors.danger : colors.textSecondary;
                      return (
                        <View key={`${att.user_id}-${i}`} style={[styles.attendanceRow, { borderLeftColor: statusColor }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.entryName}>{att.user_name}</Text>
                            <Text style={[styles.entryShift, { color: statusColor }]}>
                              {att.status.toUpperCase()} · {att.hours_worked || 0}h
                            </Text>
                            {(att.clock_in || att.clock_out) && (
                              <Text style={styles.entryTime}>{att.clock_in || "--"} - {att.clock_out || "--"}</Text>
                            )}
                          </View>
                          <Ionicons name="checkmark-done" size={16} color={statusColor} />
                        </View>
                      );
                    })}
                  </>
                )}

                {/* Leaves */}
                {selectedDay.leaves.length > 0 && (
                  <>
                    <Text style={styles.modalSection}>ON LEAVE ({selectedDay.leaves.length})</Text>
                    {selectedDay.leaves.map((lv, i) => (
                      <View key={i} style={[styles.leaveRow, { borderLeftColor: leaveColor(lv.leave_type) }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.entryName}>{lv.user_name}</Text>
                          <Text style={[styles.entryShift, { color: leaveColor(lv.leave_type) }]}>
                            {leaveLabel[lv.leave_type]}
                          </Text>
                        </View>
                        <View style={[styles.statusPill, {
                          borderColor: lv.status === "approved" ? colors.success : colors.warning,
                        }]}>
                          <Text style={[styles.statusPillText, {
                            color: lv.status === "approved" ? colors.success : colors.warning,
                          }]}>{lv.status.toUpperCase()}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* Shifts */}
                {Object.entries(selectedDay.shifts).filter(([, arr]) => arr.length > 0).map(([sk, arr]) => {
                  const sc = shiftColor(sk);
                  return (
                    <View key={sk}>
                      <Text style={[styles.modalSection, { color: sc.c }]}>
                        {shiftLabel[sk] || sk.toUpperCase()} ({arr.length})
                      </Text>
                      {arr.map(e => (
                        <View key={e.user_id} style={[styles.entryRow, { borderLeftColor: sc.c }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.entryName}>{e.user_name}</Text>
                            {e.start_time && (
                              <Text style={styles.entryTime}>{e.start_time} – {e.end_time}</Text>
                            )}
                          </View>
                          <Ionicons name="person" size={16} color={colors.textMuted} />
                        </View>
                      ))}
                    </View>
                  );
                })}

                {isAdmin && (
                  <TouchableOpacity
                    testID="cc-edit-day"
                    style={styles.editBtn}
                    onPress={() => {
                      const d = selectedDay.date;
                      setSelectedDay(null);
                      router.push({ pathname: "/(app)/schedule-edit", params: { date: d } });
                    }}
                  >
                    <Ionicons name="create" size={16} color={colors.bg} />
                    <Text style={styles.editBtnText}>EDIT THIS DAY</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function rosterState(row: DayCell["roster"][number]) {
  if (row.log_state === "finished") return { label: "FINISHED", color: colors.success };
  if (row.log_state === "clocked_in") return { label: "CLOCKED IN", color: colors.morning };
  if (row.log_state === "absent") return { label: "ABSENT", color: colors.danger };
  if (row.log_state === "marked") return { label: (row.attendance_status || "MARKED").toUpperCase(), color: colors.warning };
  return { label: "NOT LOGGED", color: colors.danger };
}

function RosterSummary({ label, value, color }: any) {
  return (
    <View style={styles.rosterSummaryItem}>
      <Text style={[styles.rosterSummaryValue, { color }]}>{value}</Text>
      <Text style={styles.rosterSummaryLabel}>{label}</Text>
    </View>
  );
}

function CompareCell({ icon, label, value, color }: any) {
  return (
    <View style={styles.compareCell} testID={`cc-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.compareValue, { color }]}>{value}</Text>
      <Text style={styles.compareLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function CoverageItem({ label, count, min, color }: any) {
  const ok = count >= min;
  return (
    <View style={styles.covItem}>
      <View style={[styles.covCircle, { borderColor: color, backgroundColor: ok ? `${color}22` : "transparent" }]}>
        <Text style={[styles.covCount, { color }]}>{count}</Text>
        <Text style={styles.covMin}>/ {min}</Text>
      </View>
      <Text style={styles.covLabel}>{label}</Text>
      <Text style={[styles.covOk, { color: ok ? colors.success : colors.danger }]}>
        {ok ? "OK" : "LOW"}
      </Text>
    </View>
  );
}

function CoverageMini({ label, count, min, color }: any) {
  const low = count < min;
  return (
    <View style={[styles.coverageMini, { borderColor: low ? colors.danger : color, backgroundColor: low ? "rgba(255,59,48,0.08)" : "rgba(255,255,255,0.03)" }]}>
      <Text style={[styles.coverageMiniLabel, { color: low ? colors.danger : colors.textPrimary }]}>{label}</Text>
      <View style={styles.coverageMiniRight}>
        <Text style={[styles.cellTinyNum, { color: low ? colors.danger : color }]}>
          {count} / {min}
        </Text>
        <Text style={[styles.coverageMiniStatus, { color: low ? colors.danger : colors.success }]}>
          {low ? "LOW" : "OK"}
        </Text>
      </View>
    </View>
  );
}

function FooterStat({ icon, label, value, color }: any) {
  return (
    <View style={styles.footerStat}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={styles.footerStatLabel}>{label}</Text>
      <Text style={[styles.footerStatValue, { color }]}>{value}</Text>
    </View>
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
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16,
    padding: 10, marginHorizontal: 20, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  monthBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  monthLabel: { color: colors.textPrimary, fontWeight: "800", fontSize: 14, letterSpacing: 1 },
  compareTable: {
    margin: 20, marginBottom: 12, padding: 14,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
  },
  sectionTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginBottom: 10 },
  compareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  compareCell: {
    width: "31.5%", backgroundColor: colors.surfaceHi, borderRadius: 4, padding: 10, alignItems: "center",
    borderColor: colors.border, borderWidth: 1, gap: 4,
  },
  compareValue: { fontSize: 18, fontWeight: "800" },
  compareLabel: { color: colors.textSecondary, fontSize: 10, textAlign: "center" },
  minRow: { marginTop: 10, padding: 8, backgroundColor: colors.surfaceHi, borderRadius: 4 },
  minTxt: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  guideCard: {
    marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
  },
  guideRow: { flexDirection: "row", gap: 14, flexWrap: "wrap", marginBottom: 8 },
  guideText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  legend: { flexDirection: "row", gap: 14, paddingHorizontal: 20, marginBottom: 6, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  calendarShell: { marginHorizontal: 12, marginBottom: 18 },
  calendarCanvas: { minWidth: 1120 },
  dowRow: { flexDirection: "row", marginBottom: 6 },
  dowLabel: {
    width: "14.28%", textAlign: "center", color: colors.textMuted,
    fontSize: 10, fontWeight: "900", letterSpacing: 1,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%", minHeight: 184, padding: 10, borderWidth: 1, borderRadius: 6,
    marginBottom: 6, justifyContent: "space-between",
  },
  emptyCell: { backgroundColor: "transparent", borderColor: "transparent" },
  cellTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  cellDate: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", lineHeight: 30 },
  cellMonth: { color: colors.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 1 },
  dayStatusPill: { maxWidth: 88, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: 4 },
  dayStatusText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4, textAlign: "center" },
  cellCoverageStack: { gap: 6, marginTop: 8 },
  coverageMini: {
    minHeight: 30, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  coverageMiniLabel: { fontSize: 11, fontWeight: "900" },
  coverageMiniRight: { alignItems: "flex-end" },
  coverageMiniStatus: { fontSize: 8, fontWeight: "900", letterSpacing: 0.5, marginTop: 1 },
  cellTinyNum: { fontSize: 13, fontWeight: "900" },
  cellFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 8, marginTop: 8,
  },
  footerStat: { alignItems: "center", gap: 2, minWidth: 38 },
  footerStatLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "800" },
  footerStatValue: { fontSize: 12, fontWeight: "900" },
  pendingRiskRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 6, paddingTop: 6, borderTopColor: colors.border, borderTopWidth: 1,
  },
  pendingRiskText: { color: colors.warning, fontSize: 9, fontWeight: "800", flex: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "85%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  modalDate: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  modalStatus: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  modalSection: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  covRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12 },
  covItem: { alignItems: "center", gap: 4 },
  covCircle: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  covCount: { fontSize: 22, fontWeight: "800" },
  covMin: { color: colors.textMuted, fontSize: 9 },
  covLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  covOk: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  entryRow: {
    flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 6,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 3, borderRadius: 4,
  },
  leaveRow: {
    flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 6,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 3, borderRadius: 4,
  },
  attendanceRow: {
    flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 6,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 3, borderRadius: 4,
  },
  rosterSummaryRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  rosterSummaryItem: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderRadius: 4,
  },
  rosterSummaryValue: { fontSize: 16, fontWeight: "800" },
  rosterSummaryLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: "700", marginTop: 2 },
  rosterRow: {
    flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 6,
    backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 3, borderRadius: 4,
  },
  logPill: { paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderRadius: 2, marginLeft: 8 },
  logPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  entryName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  entryShift: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  entryTime: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderRadius: 2 },
  statusPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  editBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.morning, height: 44, borderRadius: 4, marginTop: 16,
  },
  editBtnText: { color: colors.bg, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
});
