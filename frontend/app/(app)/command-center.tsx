import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert, Animated, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRealtimeRefresh } from "@/src/realtime";
import { colors, shiftLabel, shiftColor, leaveLabel, leaveColor } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

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
  const { isAdmin, refresh } = useAuth();
  const { theme, isClassic } = useThemeMode();
  const { width: viewportWidth } = useWindowDimensions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const calendarAnim = useRef(new Animated.Value(1)).current;
  const calendarWidth = Math.min(980, Math.max(330, viewportWidth - 20));
  const isMobileCalendar = calendarWidth < 620;
  const dayWidth = calendarWidth / 7;
  const dayHeight = isMobileCalendar ? 118 : 156;

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

  useEffect(() => {
    calendarAnim.setValue(0);
    Animated.timing(calendarAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [calendarAnim, year, month, data?.summary.total_scheduled_entries]);

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

  const openLeaveForDate = (date: string) => {
    setLeaveStart(date);
    setLeaveEnd(date);
    setLeaveReason("");
    setLeaveType("annual");
    setLeaveError(null);
    setLeaveModalOpen(true);
  };

  const submitLeave = async () => {
    if (!leaveStart.trim() || !leaveEnd.trim() || !leaveReason.trim()) {
      setLeaveError("Select dates and enter the reason.");
      return;
    }
    setLeaveSubmitting(true);
    setLeaveError(null);
    try {
      await api.post("/leaves", {
        leave_type: leaveType,
        start_date: leaveStart.trim(),
        end_date: leaveEnd.trim(),
        reason: leaveReason.trim(),
      });
      setLeaveModalOpen(false);
      setSelectedDay(null);
      Alert.alert("Submitted", "Leave request sent for approval.");
      await load();
      await refresh();
    } catch (e) {
      setLeaveError(errMsg(e));
    } finally {
      setLeaveSubmitting(false);
    }
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

      <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.monthRow, isMobileCalendar && styles.mobileMonthRow, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
        <TouchableOpacity testID="cc-prev" style={[styles.monthBtn, isMobileCalendar && styles.mobileMonthBtn, { borderColor: theme.border }]} onPress={prev}>
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, isMobileCalendar && styles.mobileMonthLabel, { color: theme.text }]}>{monthLabel}</Text>
        <TouchableOpacity testID="cc-next" style={[styles.monthBtn, isMobileCalendar && styles.mobileMonthBtn, { borderColor: theme.border }]} onPress={next}>
          <Ionicons name="chevron-forward" size={18} color={theme.text} />
        </TouchableOpacity>
      </BlurView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.morning} />}
      >
        {/* Comparison summary */}
        {data && !isMobileCalendar && (
          <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.compareTable, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
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
          </BlurView>
        )}

        <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.guideCard, isMobileCalendar && styles.mobileHidden, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
          <View style={styles.guideRow}>
            <LegendItem color={colors.success} label="Covered" />
            <LegendItem color={colors.warning} label="At minimum" />
            <LegendItem color={colors.danger} label="Below minimum" />
            <LegendItem color={colors.danger} label="Off / Leave" />
          </View>
        </BlurView>

        <Animated.View
          style={[
            styles.calendarShell,
            {
              opacity: calendarAnim,
              transform: [{
                translateY: calendarAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
              }],
            },
          ]}
        >
          <View style={[styles.calendarCanvas, { width: calendarWidth }]}>
              <View style={styles.dowRow}>
                {DOW.map(d => <Text key={d} style={[styles.dowLabel, { width: dayWidth }]}>{d}</Text>)}
              </View>

              {loading && !data ? (
                <ActivityIndicator color={colors.morning} style={{ marginTop: 40 }} />
              ) : (
                <View style={styles.grid}>
                  {grid.map((cell, i) => {
                    if (!cell) return <View key={i} style={[styles.cell, styles.emptyCell, { width: dayWidth - 4, minHeight: dayHeight }]} />;
                    const isCritical = cell.status === "critical";
                    const isWarn = cell.status === "warn";
                    const color = isCritical ? colors.danger : isWarn ? colors.warning : colors.success;
                    const bg = isCritical ? "rgba(255,59,48,0.10)" : isWarn ? "rgba(255,159,10,0.10)" : "rgba(20,20,20,0.96)";
                    const dayNum = parseInt(cell.date.slice(-2), 10);
                    const statusText = isCritical ? "LOW" : isWarn ? "AT MIN" : "FULL";
                    return (
                      <TouchableOpacity
                        key={cell.date}
                        testID={`cc-day-${dayNum}`}
                        activeOpacity={0.78}
                        style={{ padding: 0, marginHorizontal: 2, marginBottom: 7, borderRadius: 8, width: dayWidth - 4, minHeight: dayHeight }}
                        onPress={() => setSelectedDay(cell)}
                      >
                        <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[
                          styles.cell,
                          isMobileCalendar && styles.mobileCell,
                          { borderColor: color, backgroundColor: theme.surface, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight, width: "100%", minHeight: dayHeight, marginHorizontal: 0, marginBottom: 0 },
                        ]}>
                        <View style={styles.cellTop}>
                          <Text style={[styles.cellDate, isMobileCalendar && styles.mobileCellDate, { color: theme.text }]}>{dayNum}</Text>
                          <View style={[styles.dayStatusPill, isMobileCalendar && styles.mobileDayStatusPill, { borderColor: color, backgroundColor: `${color}18` }]}>
                            <Text style={[styles.dayStatusText, isMobileCalendar && styles.mobileDayStatusText, { color }]}>{statusText}</Text>
                          </View>
                        </View>
                        <ShiftBoard day={cell} minimum={data?.minimum_coverage} compact={isMobileCalendar} />
                        <UnavailableStrip day={cell} compact={isMobileCalendar} />
                        {cell.pending_status !== "ok" && !isMobileCalendar && (
                          <View style={styles.pendingRiskRow}>
                            <Ionicons name="hourglass" size={10} color={colors.warning} />
                            <Text style={styles.pendingRiskText}>Pending leave may reduce coverage</Text>
                          </View>
                        )}
                        </BlurView>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
        </Animated.View>
        {data && isMobileCalendar && (
          <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.mobileGuideCard, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]}>
            <LegendItem color={colors.success} label="Assigned" />
            <LegendItem color={colors.danger} label="Off / Leave" />
            <Text style={styles.mobileGuideText}>{data.summary.total_active_staff} staff</Text>
          </BlurView>
        )}
      </ScrollView>

      {/* Day detail modal */}
      <Modal visible={!!selectedDay} transparent animationType="slide" onRequestClose={() => setSelectedDay(null)}>
        <BlurView intensity={20} tint="dark" style={styles.modalBg}>
          <BlurView intensity={60} tint={isClassic ? "dark" : "light"} style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight, borderWidth: 1 }]}><ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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

                <TouchableOpacity
                  testID="cc-apply-leave-selected-day"
                  style={styles.applyLeaveBtn}
                  onPress={() => openLeaveForDate(selectedDay.date)}
                >
                  <Ionicons name="airplane" size={16} color={colors.bg} />
                  <Text style={styles.applyLeaveBtnText}>APPLY LEAVE FOR THIS DATE</Text>
                </TouchableOpacity>

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
                        <BlurView intensity={30} tint={isClassic ? "dark" : "light"} key={`${row.user_id}-${row.shift_type}-${i}`} style={[styles.rosterRow, { borderLeftColor: state.color, backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderRightColor: theme.glassHighlight }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.entryName, { color: theme.text }]}>{row.user_name}</Text>
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
                        </BlurView>
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
                        <BlurView intensity={30} tint={isClassic ? "dark" : "light"} key={`${att.user_id}-${i}`} style={[styles.attendanceRow, { borderLeftColor: statusColor, backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderRightColor: theme.glassHighlight }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.entryName, { color: theme.text }]}>{att.user_name}</Text>
                            <Text style={[styles.entryShift, { color: statusColor }]}>
                              {att.status.toUpperCase()} · {att.hours_worked || 0}h
                            </Text>
                            {(att.clock_in || att.clock_out) && (
                              <Text style={styles.entryTime}>{att.clock_in || "--"} - {att.clock_out || "--"}</Text>
                            )}
                          </View>
                          <Ionicons name="checkmark-done" size={16} color={statusColor} />
                        </BlurView>
                      );
                    })}
                  </>
                )}

                {/* Leaves */}
                {selectedDay.leaves.length > 0 && (
                  <>
                    <Text style={styles.modalSection}>ON LEAVE ({selectedDay.leaves.length})</Text>
                    {selectedDay.leaves.map((lv, i) => (
                      <BlurView intensity={30} tint={isClassic ? "dark" : "light"} key={i} style={[styles.leaveRow, { borderLeftColor: leaveColor(lv.leave_type), backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderRightColor: theme.glassHighlight }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.entryName, { color: theme.text }]}>{lv.user_name}</Text>
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
                      </BlurView>
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
                        <BlurView intensity={30} tint={isClassic ? "dark" : "light"} key={e.user_id} style={[styles.entryRow, { borderLeftColor: sc.c, backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderRightColor: theme.glassHighlight }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.entryName, { color: theme.text }]}>{e.user_name}</Text>
                            {e.start_time && (
                              <Text style={styles.entryTime}>{e.start_time} – {e.end_time}</Text>
                            )}
                          </View>
                          <Ionicons name="person" size={16} color={colors.textMuted} />
                        </BlurView>
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
          </ScrollView></BlurView>
        </BlurView>
      </Modal>

      <Modal visible={leaveModalOpen} transparent animationType="slide" onRequestClose={() => setLeaveModalOpen(false)}>
        <BlurView intensity={20} tint="dark" style={styles.modalBg}>
          <BlurView intensity={60} tint={isClassic ? "dark" : "light"} style={[styles.leaveModalBox, { backgroundColor: theme.surface, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalDate}>Apply Leave</Text>
                <Text style={styles.entryTime}>Submitted requests go to admin approval and update this calendar after approval.</Text>
              </View>
              <TouchableOpacity testID="cc-leave-close" onPress={() => setLeaveModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSection}>LEAVE TYPE</Text>
            <View style={styles.leaveTypeGrid}>
              {LEAVE_TYPES.map(t => {
                const selected = leaveType === t.key;
                const c = leaveColor(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    testID={`cc-leave-type-${t.key}`}
                    onPress={() => setLeaveType(t.key)}
                    style={[styles.leaveTypeChip, selected && { borderColor: c, backgroundColor: `${c}22` }]}
                  >
                    <Ionicons name={t.icon} size={14} color={selected ? c : colors.textSecondary} />
                    <Text style={[styles.leaveTypeText, selected && { color: c }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Start Date</Text>
            <TextInput
              testID="cc-leave-start"
              style={styles.modalInput}
              value={leaveStart}
              onChangeText={setLeaveStart}
              placeholder="2026-06-01"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>End Date</Text>
            <TextInput
              testID="cc-leave-end"
              style={styles.modalInput}
              value={leaveEnd}
              onChangeText={setLeaveEnd}
              placeholder="2026-06-01"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Reason</Text>
            <TextInput
              testID="cc-leave-reason"
              style={[styles.modalInput, styles.reasonInput]}
              value={leaveReason}
              onChangeText={setLeaveReason}
              multiline
              placeholder="Reason for leave"
              placeholderTextColor={colors.textMuted}
            />

            {leaveError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{leaveError}</Text>
              </View>
            )}

            <TouchableOpacity
              testID="cc-leave-submit"
              style={[styles.submitLeaveBtn, leaveSubmitting && { opacity: 0.6 }]}
              onPress={submitLeave}
              disabled={leaveSubmitting}
            >
              {leaveSubmitting ? <ActivityIndicator color={colors.bg} /> : (
                <Text style={styles.submitLeaveBtnText}>SUBMIT LEAVE REQUEST</Text>
              )}
            </TouchableOpacity>
          </BlurView>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
}

const LEAVE_TYPES: { key: string; label: string; icon: any }[] = [
  { key: "annual", label: "Vacation", icon: "airplane" },
  { key: "sick", label: "Sick", icon: "medkit" },
  { key: "comp_off", label: "Comp Off", icon: "swap-horizontal" },
  { key: "emergency", label: "Emergency", icon: "warning" },
];

function ShiftBoard({ day, minimum, compact }: { day: DayCell; minimum?: CalendarData["minimum_coverage"]; compact?: boolean }) {
  const rows = shiftRowsForDay(day, minimum);
  const visibleNames = compact ? 1 : 3;
  return (
    <View style={styles.shiftBoard}>
      {rows.map(row => (
        <View key={row.key} style={styles.shiftLine}>
          <Text style={[styles.shiftLineLabel, { color: row.color }]}>{row.label}</Text>
          <View style={styles.nameChipWrap}>
            {row.people.slice(0, visibleNames).map(person => (
              <Text
                key={person.user_id}
                numberOfLines={1}
                style={[
                  styles.personChip,
                  compact && styles.mobilePersonChip,
                  { backgroundColor: "rgba(52,199,89,0.30)", borderColor: colors.success },
                ]}
              >
                {shortName(person.user_name)}
              </Text>
            ))}
            {row.people.length > visibleNames && (
              <Text style={[styles.personChip, compact && styles.mobilePersonChip, styles.moreChip]}>+{row.people.length - visibleNames}</Text>
            )}
            {row.people.length === 0 && <Text style={styles.emptyShift}>No staff</Text>}
          </View>
          <Text style={[styles.shiftCount, { color: row.ok ? colors.success : colors.danger }]}>
            {row.people.length}/{row.min}
          </Text>
        </View>
      ))}
    </View>
  );
}

function UnavailableStrip({ day, compact }: { day: DayCell; compact?: boolean }) {
  const offPeople = [
    ...((day.shifts.off || []).map(p => ({ ...p, reason: "Off" }))),
    ...((day.shifts.leave || []).map(p => ({ ...p, reason: "Leave" }))),
    ...day.leaves.map(l => ({ user_id: l.user_id, user_name: l.user_name, reason: leaveLabel[l.leave_type] || "Leave" })),
  ];
  const unique = Array.from(new Map(offPeople.map(p => [p.user_id, p])).values());
  return (
    <View style={styles.unavailableRow}>
      {unique.slice(0, compact ? 1 : 2).map(p => (
        <Text key={p.user_id} numberOfLines={1} style={[styles.unavailableChip, compact && styles.mobileUnavailableChip]}>
          {shortName(p.user_name)}
        </Text>
      ))}
      {unique.length > (compact ? 1 : 2) && (
        <Text style={[styles.unavailableChip, compact && styles.mobileUnavailableChip, styles.moreUnavailable]}>
          +{unique.length - (compact ? 1 : 2)}
        </Text>
      )}
      {unique.length === 0 && <Text style={styles.unavailableEmpty}>No leave/off</Text>}
    </View>
  );
}

function shiftRowsForDay(day: DayCell, minimum?: CalendarData["minimum_coverage"]) {
  const sunMode = day.shifts.sun_day?.length || day.shifts.sun_night?.length;
  const satMode = day.weekday === 5 && (day.shifts.sat_day?.length || day.shifts.sat_night?.length);
  const base = sunMode
    ? [
      { key: "sun_day", label: "DAY", color: colors.morning, min: 1 },
      { key: "sun_night", label: "NIGHT", color: colors.night, min: 1 },
    ]
    : satMode
      ? [
        { key: "sat_day", label: "DAY", color: colors.morning, min: 1 },
        { key: "sat_night", label: "NIGHT", color: colors.night, min: 1 },
      ]
      : [
        { key: "morning", label: "MOR", color: colors.morning, min: minimum?.morning || 3 },
        { key: "afternoon", label: "AFT", color: colors.afternoon, min: minimum?.afternoon || 2 },
        { key: "night", label: "NIGHT", color: colors.night, min: minimum?.night || 2 },
      ];
  return base.map(row => {
    const people = day.shifts[row.key] || [];
    return { ...row, people, ok: people.length >= row.min };
  });
}

function shortName(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Staff";
  return parts[0].length <= 5 ? `${parts[0]} ${parts[1]?.[0] || ""}`.trim() : parts[0];
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
  const { theme, isClassic } = useThemeMode();
  return (
    <BlurView intensity={30} tint={isClassic ? "dark" : "light"} style={[styles.compareCell, { backgroundColor: theme.surfaceHi, borderColor: theme.border, borderTopColor: theme.glassHighlight, borderLeftColor: theme.glassHighlight }]} testID={`cc-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.compareValue, { color }]}>{value}</Text>
      <Text style={[styles.compareLabel, { color: theme.muted }]}>{label}</Text>
    </BlurView>
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
  container: { flex: 1, backgroundColor: "#05070A" },
  header: { flexDirection: "row", alignItems: "center", padding: 20, paddingBottom: 10, gap: 12 },
  backBtn: {
    width: 48, height: 48, alignItems: "center", justifyContent: "center",
    borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)",
  },
  overline: { color: colors.textMuted, fontSize: 10, letterSpacing: 2.4, fontWeight: "800" },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "900", marginTop: 2 },
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16,
    padding: 14, marginHorizontal: 20, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 8,
  },
  monthBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  monthLabel: { color: colors.textPrimary, fontWeight: "900", fontSize: 20, minWidth: 150, textAlign: "center" },
  mobileMonthRow: { marginHorizontal: 10, padding: 8, gap: 8, marginBottom: 8 },
  mobileMonthBtn: { width: 34, height: 34, borderRadius: 6 },
  mobileMonthLabel: { fontSize: 16, minWidth: 120 },
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
    marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
  },
  guideRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  guideText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  mobileHidden: { display: "none" },
  mobileGuideCard: {
    marginHorizontal: 10, marginTop: 6, marginBottom: 12, padding: 10,
    borderRadius: 8, backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: 8, flexWrap: "wrap",
  },
  mobileGuideText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  legend: { flexDirection: "row", gap: 14, paddingHorizontal: 20, marginBottom: 6, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  calendarShell: { marginHorizontal: 10, marginBottom: 18, alignItems: "center" },
  calendarCanvas: { width: 980 },
  dowRow: { flexDirection: "row", marginBottom: 8, paddingHorizontal: 2 },
  dowLabel: {
    width: 140, textAlign: "center", color: colors.textMuted,
    fontSize: 10, fontWeight: "900", letterSpacing: 1,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: 136, minHeight: 156, padding: 7, borderWidth: 1, borderRadius: 8,
    marginHorizontal: 2, marginBottom: 7, justifyContent: "space-between", backgroundColor: "#0C0F13",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  mobileCell: {
    padding: 3, borderRadius: 5, marginHorizontal: 2, marginBottom: 5,
    shadowOpacity: 0.18, shadowRadius: 4,
  },
  emptyCell: { backgroundColor: "transparent", borderColor: "transparent" },
  cellTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  cellDate: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", lineHeight: 24 },
  mobileCellDate: { fontSize: 15, lineHeight: 17 },
  cellMonth: { color: colors.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 1 },
  dayStatusPill: { minWidth: 43, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderRadius: 4 },
  mobileDayStatusPill: { minWidth: 25, paddingHorizontal: 2, paddingVertical: 2, borderRadius: 3 },
  dayStatusText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.3, textAlign: "center" },
  mobileDayStatusText: { fontSize: 6, letterSpacing: 0 },
  shiftBoard: { gap: 4, marginTop: 6 },
  shiftLine: {
    minHeight: 28, flexDirection: "row", alignItems: "flex-start", gap: 4,
    borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.025)",
  },
  shiftLineLabel: { width: 28, fontSize: 7, fontWeight: "900", letterSpacing: 0.2, paddingTop: 3 },
  nameChipWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  personChip: {
    maxWidth: 46, overflow: "hidden", borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 3, paddingVertical: 2, color: colors.textPrimary,
    fontSize: 7, fontWeight: "900",
  },
  mobilePersonChip: {
    maxWidth: 24, paddingHorizontal: 2, paddingVertical: 1, fontSize: 6,
  },
  moreChip: { borderColor: colors.border, backgroundColor: colors.surfaceHi, color: colors.textSecondary },
  emptyShift: { color: colors.textMuted, fontSize: 7, fontWeight: "700", paddingTop: 3 },
  shiftCount: { width: 22, textAlign: "right", fontSize: 9, fontWeight: "900", paddingTop: 3 },
  unavailableRow: {
    minHeight: 21, marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 3, borderTopColor: "rgba(255,255,255,0.08)", borderTopWidth: 1, paddingTop: 5,
  },
  unavailableChip: {
    maxWidth: 48, overflow: "hidden", backgroundColor: "rgba(255,59,48,0.32)",
    borderColor: colors.danger, borderWidth: 1, borderRadius: 3,
    color: colors.textPrimary, fontSize: 7, fontWeight: "900", paddingHorizontal: 4, paddingVertical: 2,
  },
  mobileUnavailableChip: {
    maxWidth: 26, paddingHorizontal: 2, paddingVertical: 1, fontSize: 6,
  },
  moreUnavailable: { color: colors.danger, backgroundColor: "rgba(255,59,48,0.12)" },
  unavailableEmpty: { color: colors.textMuted, fontSize: 8, fontWeight: "700" },
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
  applyLeaveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: colors.textPrimary, minHeight: 44, borderRadius: 5, marginBottom: 12,
  },
  applyLeaveBtnText: { color: colors.bg, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  leaveModalBox: {
    backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "92%",
  },
  leaveTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  leaveTypeChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 9,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4, backgroundColor: colors.surfaceHi,
  },
  leaveTypeText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  inputLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: 8, marginBottom: 5 },
  modalInput: {
    minHeight: 46, backgroundColor: colors.surfaceHi, borderColor: colors.border, borderWidth: 1,
    borderRadius: 5, color: colors.textPrimary, paddingHorizontal: 12, fontSize: 14,
  },
  reasonInput: { height: 82, paddingTop: 10, textAlignVertical: "top" },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
    backgroundColor: "rgba(255,59,48,0.1)", borderColor: colors.danger, borderWidth: 1,
    borderRadius: 4, marginTop: 10,
  },
  errorText: { color: colors.danger, fontSize: 12, flex: 1 },
  submitLeaveBtn: {
    height: 50, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center",
    borderRadius: 5, marginTop: 14,
  },
  submitLeaveBtnText: { color: colors.bg, fontWeight: "900", letterSpacing: 1.2, fontSize: 12 },
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
