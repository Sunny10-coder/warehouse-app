// Theme constants for the warehouse app (Tactical Dark)
export const colors = {
  bg: "#0A0A0A",
  surface: "#141414",
  surfaceHi: "#1F1F1F",
  border: "#27272A",
  borderFocus: "#FFD600",
  textPrimary: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",

  // shifts
  morning: "#FFD600",
  morningBg: "rgba(255, 214, 0, 0.12)",
  afternoon: "#FF8A00",
  afternoonBg: "rgba(255, 138, 0, 0.12)",
  night: "#00E5FF",
  nightBg: "rgba(0, 229, 255, 0.12)",
  admin: "#A78BFA",
  adminBg: "rgba(167, 139, 250, 0.12)",
  ega: "#22D3EE",
  egaBg: "rgba(34, 211, 238, 0.12)",
  off: "#52525B",
  offBg: "rgba(82, 82, 91, 0.12)",
  leave: "#10B981",
  leaveBg: "rgba(16, 185, 129, 0.12)",

  // leaves
  annual: "#34C759",
  sick: "#FF3B30",
  compOff: "#0A84FF",
  emergency: "#FF9F0A",

  success: "#34C759",
  danger: "#FF3B30",
  warning: "#FF9F0A",
} as const;

export const shiftLabel: Record<string, string> = {
  morning: "Morning 7-4",
  afternoon: "Afternoon 12-9",
  night: "Night 9pm-6am",
  admin: "Admin 7:30-4:30",
  sat_day: "Sat Day 7-7",
  sat_night: "Sat Night 7-7",
  sun_day: "Sun Day 7-7",
  sun_night: "Sun Night 7-7",
  ega: "EGA Site",
  off: "Off",
  leave: "On Leave",
};

export const shiftColor = (s?: string | null): { c: string; bg: string } => {
  switch (s) {
    case "morning":
    case "sat_day":
    case "sun_day":
      return { c: colors.morning, bg: colors.morningBg };
    case "afternoon":
      return { c: colors.afternoon, bg: colors.afternoonBg };
    case "night":
    case "sat_night":
    case "sun_night":
      return { c: colors.night, bg: colors.nightBg };
    case "admin":
      return { c: colors.admin, bg: colors.adminBg };
    case "ega":
      return { c: colors.ega, bg: colors.egaBg };
    case "leave":
      return { c: colors.leave, bg: colors.leaveBg };
    default:
      return { c: colors.off, bg: colors.offBg };
  }
};

export const roleLabel: Record<string, string> = {
  manager: "Manager",
  asst_manager: "Asst. Manager",
  document_controller: "Document Controller",
  employee: "Employee",
};

export const leaveLabel: Record<string, string> = {
  annual: "Annual Vacation",
  sick: "Sick Leave",
  comp_off: "Comp Off",
  emergency: "Emergency Leave",
};

export const leaveColor = (t: string) => {
  switch (t) {
    case "annual": return colors.annual;
    case "sick": return colors.sick;
    case "comp_off": return colors.compOff;
    case "emergency": return colors.emergency;
    default: return colors.textSecondary;
  }
};
