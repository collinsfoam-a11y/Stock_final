import Ionicons from "@expo/vector-icons/Ionicons";

import type { ThemeTokens } from "./themeTokens";

export type OperationalSeverityLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "warning"
  | "offline"
  | "blocked"
  | "pending"
  | "resolved"
  | "success"
  | "info";

export type OperationalToneToken =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "active"
  | "pending"
  | "offline"
  | "synced"
  | "completed"
  | "variance"
  | "recount"
  | "blocked";

export type OperationalCommandSemanticTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export type OperationalSeverityDefinition = {
  level: OperationalSeverityLevel;
  tone: OperationalToneToken;
  icon: keyof typeof Ionicons.glyphMap;
  badge: string;
  accessibilityAnnouncement: string;
  queueOrder: number;
  hapticPriority: "none" | "selection" | "light" | "medium" | "heavy" | "warning" | "error" | "success";
  animationIntensity: "none" | "subtle" | "standard" | "urgent";
  scannerSemantics: "idle" | "processing" | "success" | "warning" | "blocked" | "error" | "offline";
  commandTone: OperationalCommandSemanticTone;
};

export const OPERATIONAL_SEVERITY_REGISTRY: Record<
  OperationalSeverityLevel,
  OperationalSeverityDefinition
> = {
  critical: {
    level: "critical",
    tone: "error",
    icon: "alert-circle-outline",
    badge: "Critical",
    accessibilityAnnouncement: "Critical operational issue requiring immediate action",
    queueOrder: 0,
    hapticPriority: "error",
    animationIntensity: "urgent",
    scannerSemantics: "error",
    commandTone: "danger",
  },
  blocked: {
    level: "blocked",
    tone: "blocked",
    icon: "lock-closed-outline",
    badge: "Blocked",
    accessibilityAnnouncement: "Blocked workflow requiring supervisor intervention",
    queueOrder: 1,
    hapticPriority: "error",
    animationIntensity: "urgent",
    scannerSemantics: "blocked",
    commandTone: "danger",
  },
  high: {
    level: "high",
    tone: "warning",
    icon: "warning-outline",
    badge: "High",
    accessibilityAnnouncement: "High priority operational item",
    queueOrder: 2,
    hapticPriority: "warning",
    animationIntensity: "standard",
    scannerSemantics: "warning",
    commandTone: "warning",
  },
  warning: {
    level: "warning",
    tone: "warning",
    icon: "warning-outline",
    badge: "Warning",
    accessibilityAnnouncement: "Operational warning",
    queueOrder: 3,
    hapticPriority: "warning",
    animationIntensity: "standard",
    scannerSemantics: "warning",
    commandTone: "warning",
  },
  offline: {
    level: "offline",
    tone: "offline",
    icon: "cloud-offline-outline",
    badge: "Offline",
    accessibilityAnnouncement: "Offline operational state",
    queueOrder: 4,
    hapticPriority: "medium",
    animationIntensity: "subtle",
    scannerSemantics: "offline",
    commandTone: "warning",
  },
  pending: {
    level: "pending",
    tone: "pending",
    icon: "time-outline",
    badge: "Pending",
    accessibilityAnnouncement: "Pending operational item",
    queueOrder: 5,
    hapticPriority: "light",
    animationIntensity: "subtle",
    scannerSemantics: "processing",
    commandTone: "secondary",
  },
  medium: {
    level: "medium",
    tone: "pending",
    icon: "ellipse-outline",
    badge: "Medium",
    accessibilityAnnouncement: "Medium priority operational item",
    queueOrder: 6,
    hapticPriority: "light",
    animationIntensity: "subtle",
    scannerSemantics: "processing",
    commandTone: "secondary",
  },
  low: {
    level: "low",
    tone: "info",
    icon: "information-circle-outline",
    badge: "Low",
    accessibilityAnnouncement: "Low priority operational item",
    queueOrder: 7,
    hapticPriority: "selection",
    animationIntensity: "subtle",
    scannerSemantics: "idle",
    commandTone: "neutral",
  },
  info: {
    level: "info",
    tone: "info",
    icon: "information-circle-outline",
    badge: "Info",
    accessibilityAnnouncement: "Informational operational item",
    queueOrder: 8,
    hapticPriority: "selection",
    animationIntensity: "subtle",
    scannerSemantics: "idle",
    commandTone: "secondary",
  },
  resolved: {
    level: "resolved",
    tone: "completed",
    icon: "checkmark-done-circle-outline",
    badge: "Resolved",
    accessibilityAnnouncement: "Resolved operational item",
    queueOrder: 9,
    hapticPriority: "success",
    animationIntensity: "none",
    scannerSemantics: "success",
    commandTone: "success",
  },
  success: {
    level: "success",
    tone: "success",
    icon: "checkmark-circle-outline",
    badge: "Success",
    accessibilityAnnouncement: "Successful operational state",
    queueOrder: 10,
    hapticPriority: "success",
    animationIntensity: "none",
    scannerSemantics: "success",
    commandTone: "success",
  },
};

export const OPERATIONAL_STATUS_TO_SEVERITY: Record<string, OperationalSeverityLevel> = {
  active: "info",
  approved: "success",
  blocked: "blocked",
  cached: "offline",
  closed: "resolved",
  complete: "success",
  completed: "success",
  conflict: "blocked",
  critical: "critical",
  error: "critical",
  failed: "critical",
  failed_manual_review: "critical",
  finalized: "resolved",
  high: "high",
  info: "info",
  in_progress: "info",
  live: "info",
  low: "low",
  mismatch: "warning",
  offline: "offline",
  open: "info",
  pending: "pending",
  pending_conflict: "blocked",
  queued: "pending",
  recount: "warning",
  reconcile: "warning",
  rejected: "critical",
  resolved: "resolved",
  running: "info",
  sync: "success",
  synced: "success",
  variance: "warning",
  waiting: "pending",
  warn: "warning",
  warning: "warning",
};

const normalizeStatus = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const getOperationalSeverityDefinition = (
  level: OperationalSeverityLevel
): OperationalSeverityDefinition => OPERATIONAL_SEVERITY_REGISTRY[level];

export const resolveOperationalSeverityLevel = (
  status?: string,
  fallback: OperationalSeverityLevel = "info"
): OperationalSeverityLevel => {
  const normalized = normalizeStatus(status);
  return OPERATIONAL_STATUS_TO_SEVERITY[normalized] || fallback;
};

export const resolveOperationalTone = (
  status?: string,
  fallback: OperationalToneToken = "neutral"
): OperationalToneToken =>
  OPERATIONAL_SEVERITY_REGISTRY[resolveOperationalSeverityLevel(status, "info")]?.tone || fallback;

export const getOperationalToneColor = (
  tokens: ThemeTokens,
  tone: OperationalToneToken | OperationalCommandSemanticTone
) => {
  switch (tone) {
    case "success":
    case "synced":
    case "completed":
      return tokens.colors.success;
    case "warning":
    case "pending":
    case "variance":
    case "recount":
    case "offline":
      return tokens.colors.warning;
    case "error":
    case "blocked":
    case "danger":
      return tokens.colors.error;
    case "info":
    case "active":
    case "secondary":
      return tokens.colors.info;
    case "primary":
      return tokens.colors.accent;
    case "neutral":
    default:
      return tokens.colors.textMuted;
  }
};

export const getOperationalSeverityColor = (
  tokens: ThemeTokens,
  level: OperationalSeverityLevel | "none"
) => {
  if (level === "none") return tokens.colors.border;
  return getOperationalToneColor(tokens, OPERATIONAL_SEVERITY_REGISTRY[level].tone);
};

export const normalizeOperationalPriority = (level: OperationalSeverityLevel) =>
  OPERATIONAL_SEVERITY_REGISTRY[level].queueOrder;
