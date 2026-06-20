import { View, Text, Image, StyleSheet } from "react-native";
import { appTheme, shiftLabel, shiftColor } from "@/src/theme";

type Props = {
  name: string;
  avatarUrl?: string | null;
  shiftType?: string | null;
  status?: string;
  role?: string;
  compact?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
};

export function StaffTile({ name, avatarUrl, shiftType, status, role, compact, onPress, children }: Props) {
  const sc = shiftColor(shiftType);
  const initial = (name || "?").slice(0, 1).toUpperCase();
  const statusColor =
    status === "present" || status === "active" ? "#34C759"
    : status === "late" ? "#FF9F0A"
    : status === "absent" ? "#FF3B30"
    : status === "on_leave" ? "#0A84FF"
    : appTheme.muted;
  const statusText =
    status === "present" ? "PRESENT"
    : status === "active" ? "ACTIVE"
    : status === "late" ? "LATE"
    : status === "absent" ? "ABSENT"
    : status === "on_leave" ? "ON LEAVE"
    : status?.toUpperCase() || "";

  const Inner = (
    <>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.avatar, compact && styles.avatarCompact]} />
      ) : (
        <View style={[styles.avatar, compact && styles.avatarCompact, { backgroundColor: sc.c }]}>
          <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initial}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {role && <Text style={styles.role} numberOfLines={1}>{role}</Text>}
      {shiftType && shiftType !== "off" && (
        <View style={[styles.shiftBadge, { borderColor: sc.c }]}>
          <View style={[styles.shiftDot, { backgroundColor: sc.c }]} />
          <Text style={[styles.shiftText, { color: sc.c }]} numberOfLines={1}>
            {shiftLabel[shiftType] || shiftType}
          </Text>
        </View>
      )}
      {shiftType === "off" && (
        <View style={[styles.shiftBadge, { borderColor: appTheme.muted }]}>
          <Text style={[styles.shiftText, { color: appTheme.muted }]}>OFF</Text>
        </View>
      )}
      {statusText ? (
        <Text style={[styles.statusPill, { color: statusColor }]}>{statusText}</Text>
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.tile, compact && styles.tileCompact]}>
        {Inner}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      {Inner}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 140,
    backgroundColor: appTheme.surface,
    borderColor: appTheme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  tileCompact: {
    width: 120,
    padding: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: appTheme.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  avatarTextCompact: {
    fontSize: 16,
  },
  name: {
    color: appTheme.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  role: {
    color: appTheme.muted,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  shiftBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shiftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shiftText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusPill: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },
});
