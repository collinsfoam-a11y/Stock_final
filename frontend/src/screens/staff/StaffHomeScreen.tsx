/**
 * Modern Staff Home Screen - Lavanya Mart Stock Verify
 * Dashboard for managing stock verification sessions
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  BackHandler,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useOfflineStore } from "@/store/offlineStore";
import { useNetworkStore } from "@/store/networkStore";
import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useSessionsQuery } from "@/hooks/useSessionsQuery";
import { createSession, getZones, getWarehouses } from "@/services/api/api";
import { SESSION_PAGE_SIZE } from "@/constants/config";
import { toastService } from "@/services/toastService";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernCard from "@/components/ui/ModernCard";
import ModernButton from "@/components/ui/ModernButton";
import ModernInput from "@/components/ui/ModernInput";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colors, spacing, typography, borderRadius } from "@/theme/unified";

interface Zone {
  id: string;
  zone_name: string;
}

interface Warehouse {
  id: string;
  warehouse_name: string;
}

const operationalPalette = {
  background: "#FAF9F6",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3F1",
  border: "#E2E2E2",
  primary: "#007B83",
  primaryStrong: "#006067",
  primaryTint: "#E4F5F6",
  ink: "#1A1C1A",
  muted: "#586377",
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
};

const getSessionDate = (session: any): Date | null => {
  const candidates = [
    session.updated_at,
    session.closed_at,
    session.reconciled_at,
    session.completed_at,
    session.started_at,
    session.created_at,
    session.startedAt,
    session.createdAt,
    session.last_activity,
    session.lastActivity,
  ];

  let best: Date | null = null;
  for (const value of candidates) {
    const date = toDate(value);
    if (!date) continue;
    if (!best || date.getTime() > best.getTime()) {
      best = date;
    }
  }

  return best;
};

const formatSessionDateTime = (session: any): string => {
  const date = getSessionDate(session);
  if (!date) return "Unknown date";

  const dateText = date.toLocaleDateString();
  const timeText = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dateText} \u2022 ${timeText}`;
};

const getScannedCount = (session: any): number => {
  const raw =
    session.item_count ??
    session.scanned_count ??
    session.verified_count ??
    session.total_items ??
    session.items_scanned ??
    0;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(value) ? Number(value) : 0;
};

const normalizeWarehouse = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
};

const getWarehouseParts = (warehouse: unknown) => {
  if (typeof warehouse !== "string" || !warehouse.trim()) {
    return {
      zone: "Unassigned",
      area: "Unknown area",
      rack: "",
    };
  }

  const parts = warehouse
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    zone: parts[0] || "Location",
    area: parts[1] || parts[0] || warehouse,
    rack: parts.length > 2 ? parts.slice(2).join(" • ") : "",
  };
};

const getSessionProgress = (session: any) => {
  const scanned = getScannedCount(session);
  const totalRaw = session?.total_items ?? session?.expected_items ?? 0;
  const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : 0;

  if (total <= 0) {
    return {
      scanned,
      total,
      percent: scanned > 0 ? 100 : 0,
      label: scanned > 0 ? "Captured lines" : "Waiting for first scan",
    };
  }

  const percent = Math.min(100, Math.round((scanned / total) * 100));
  return {
    scanned,
    total,
    percent,
    label: `${scanned} of ${total} scanned`,
  };
};

const getSessionStatusStyle = (status: unknown) => {
  const normalized = String(status || "OPEN")
    .trim()
    .toUpperCase();

  switch (normalized) {
    case "ACTIVE":
    case "OPEN":
      return {
        label: normalized,
        backgroundColor: operationalPalette.primaryTint,
        borderColor: "#BEE7E9",
        textColor: operationalPalette.primaryStrong,
      };
    case "RECONCILE":
    case "PENDING":
      return {
        label: normalized,
        backgroundColor: colors.warning[50],
        borderColor: colors.warning[200],
        textColor: colors.warning[700],
      };
    case "COMPLETED":
    case "CLOSED":
      return {
        label: normalized,
        backgroundColor: colors.success[50],
        borderColor: colors.success[200],
        textColor: colors.success[700],
      };
    default:
      return {
        label: normalized,
        backgroundColor: colors.gray[100],
        borderColor: colors.gray[200],
        textColor: colors.gray[700],
      };
  }
};

const StaffHome = React.memo(function StaffHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchUnreadCount = useNotificationStore((state) => state.fetchUnreadCount);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const isOnline = useNetworkStore((state) => state.isOnline);
  const queuedOperations = useOfflineStore((state) => state.syncQueue.length);

  // Check for PIN setup
  useEffect(() => {
    if (user && !user.has_pin) {
      // Delay slightly to let the UI load
      const timer = setTimeout(() => {
        Alert.alert(
          "Set PIN Code",
          "You haven't set a PIN code yet. Setting a PIN allows faster login.",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Set PIN",
              onPress: () => router.push("/staff/settings"),
            },
          ]
        );
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [user, router]);

  // Handle Back Button for Exit Confirmation
  useEffect(() => {
    const backAction = () => {
      Alert.alert("Exit App", "Are you sure you want to exit?", [
        {
          text: "Cancel",
          onPress: () => null,
          style: "cancel",
        },
        { text: "YES", onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);

    return () => backHandler.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  // State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  // Create Session State
  const [locationType, setLocationType] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rackName, setRackName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const setActiveSession = useScanSessionStore((state) => state.setActiveSession);
  const setFloor = useScanSessionStore((state) => state.setFloor);
  const setRack = useScanSessionStore((state) => state.setRack);

  // Queries
  const { data: sessionsData, refetch } = useSessionsQuery({
    page: 1,
    pageSize: SESSION_PAGE_SIZE,
  });

  const sessions = useMemo(
    () => (Array.isArray(sessionsData?.items) ? sessionsData.items : []),
    [sessionsData?.items]
  );

  const activeSessions = useMemo(() => {
    return sessions
      .filter((s: any) => s && typeof s === "object")
      .filter((s: any) => {
        const status = String(s.status || "OPEN")
          .trim()
          .toUpperCase();
        return status === "OPEN" || status === "ACTIVE";
      })
      .sort((a: any, b: any) => {
        const aDate = getSessionDate(a)?.getTime() ?? 0;
        const bDate = getSessionDate(b)?.getTime() ?? 0;
        return bDate - aDate;
      });
  }, [sessions]);

  const isSessionLocationComplete = Boolean(locationType && selectedFloor && rackName.trim());

  const readinessItems = useMemo(
    () => [
      {
        id: "zone",
        done: Boolean(locationType),
        label: "Location type",
        value: locationType || "Choose a zone",
      },
      {
        id: "floor",
        done: Boolean(selectedFloor),
        label: "Floor or area",
        value: selectedFloor || "Choose a floor",
      },
      {
        id: "rack",
        done: Boolean(rackName.trim()),
        label: "Rack or shelf",
        value: rackName.trim() || "Enter rack code",
      },
    ],
    [locationType, rackName, selectedFloor]
  );

  const uniqueActiveSessions = useMemo(() => {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const session of activeSessions) {
      if (!session || typeof session !== "object") {
        continue;
      }
      const idKey = session?.id || session?._id || session?.session_id;
      const warehouseKey = normalizeWarehouse(session?.warehouse);
      const key = warehouseKey || (idKey ? String(idKey) : "");
      if (key && seen.has(key)) {
        continue;
      }
      if (key) {
        seen.add(key);
      }
      unique.push(session);
    }

    return unique;
  }, [activeSessions]);

  const finishedSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const status = String(s.status || "")
        .trim()
        .toUpperCase();
      return status === "CLOSED" || status === "COMPLETED" || status === "RECONCILE";
    });
  }, [sessions]);

  const activeIssueCount = useMemo(
    () =>
      uniqueActiveSessions.reduce(
        (total, session) => total + Number(session?.discrepancy_count ?? 0),
        0
      ),
    [uniqueActiveSessions]
  );

  const activeScanCount = useMemo(
    () => uniqueActiveSessions.reduce((total, session) => total + getScannedCount(session), 0),
    [uniqueActiveSessions]
  );

  const liveStatus = useMemo(() => {
    if (offlineMode) {
      return {
        icon: "cloud-offline-outline" as const,
        label: queuedOperations > 0 ? `${queuedOperations} queued` : "Offline mode",
        tone: "warning" as const,
      };
    }

    if (!isOnline) {
      return {
        icon: "alert-circle-outline" as const,
        label: "Connection paused",
        tone: "neutral" as const,
      };
    }

    return {
      icon: "radio-outline" as const,
      label: queuedOperations > 0 ? `${queuedOperations} pending sync` : "Live sync",
      tone: "success" as const,
    };
  }, [isOnline, offlineMode, queuedOperations]);

  // Fetch Zones
  useEffect(() => {
    const fetchZones = async () => {
      const fallbackZones = [
        { zone_name: "Showroom", id: "zone_showroom" },
        { zone_name: "Godown", id: "zone_godown" },
      ];
      setZones(fallbackZones);

      try {
        const data = await getZones();
        if (Array.isArray(data) && data.length > 0) {
          setZones(data);
        }
      } catch (_error) {
        // Silent fail, use fallback
      }
    };
    fetchZones();
  }, []);

  // Fetch Warehouses when location type changes
  useEffect(() => {
    const fetchWarehouses = async () => {
      if (!locationType) return;

      // Set fallback immediately
      let fallback: Warehouse[] = [];
      if (locationType.toLowerCase().includes("showroom")) {
        fallback = [
          { warehouse_name: "Ground Floor", id: "fl_ground" },
          { warehouse_name: "First Floor", id: "fl_first" },
          { warehouse_name: "Second Floor", id: "fl_second" },
        ];
      } else {
        fallback = [
          { warehouse_name: "Main Godown", id: "wh_main" },
          { warehouse_name: "Top Godown", id: "wh_top" },
          { warehouse_name: "Damage Area", id: "wh_damage" },
        ];
      }
      setWarehouses(fallback);

      try {
        const data = await getWarehouses(locationType);
        if (Array.isArray(data) && data.length > 0) {
          setWarehouses(data);
        }
      } catch (_error) {
        // Silent fail, use fallback
      }
    };
    fetchWarehouses();
  }, [locationType]);

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleStartSession = async () => {
    if (!locationType || !selectedFloor || !rackName.trim()) {
      Alert.alert("Missing Information", "Please fill in all fields");
      return;
    }

    const trimmedRack = rackName.trim();
    if (!/^[a-zA-Z0-9\-_]+$/.test(trimmedRack)) {
      Alert.alert("Invalid Rack Name", "Only letters, numbers, dashes, and underscores allowed");
      return;
    }

    const warehouseName = `${locationType} - ${selectedFloor} - ${trimmedRack.toUpperCase()}`;
    const normalizedWarehouse = normalizeWarehouse(warehouseName);
    const existingSession = activeSessions.find(
      (session: any) => normalizeWarehouse(session.warehouse) === normalizedWarehouse
    );
    if (existingSession) {
      Alert.alert(
        "Session Already Active",
        "A session for this location is already open. Do you want to resume it?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Resume",
            onPress: () => handleResumeSession(existingSession),
          },
        ]
      );
      return;
    }

    try {
      setIsCreating(true);
      const session = await createSession({
        warehouse: warehouseName,
        type: "STANDARD",
        location_type: locationType,
        location_name: selectedFloor,
        rack_no: trimmedRack.toUpperCase(),
      });
      const sessionId = session?.id || session?._id || session?.session_id;
      if (!sessionId) {
        throw new Error("Session created without an ID");
      }

      // Optimistic update
      queryClient.setQueryData(["sessions", 1, SESSION_PAGE_SIZE], (old: any) => {
        const existing = Array.isArray(old?.items) ? old.items : [];
        const filtered = existing.filter(
          (item: any) => (item?.id || item?._id || item?.session_id) !== sessionId
        );
        return { ...old, items: [session, ...filtered] };
      });

      // Reset and navigate
      setShowCreateModal(false);
      setLocationType(null);
      setSelectedFloor(null);
      setRackName("");

      setFloor(`${locationType} - ${selectedFloor}`);
      setRack(trimmedRack.toUpperCase());
      setActiveSession(sessionId, "STANDARD");

      router.push({
        pathname: "/staff/scan",
        params: { sessionId },
      } as any);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create session";
      toastService.showError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleResumeSession = (session: any) => {
    Haptics.selectionAsync();

    const sessionId = session?.id || session?._id || session?.session_id;
    if (!sessionId) {
      toastService.showError("Unable to resume session (missing ID).");
      return;
    }

    if (session.warehouse) {
      const parts = session.warehouse.split(" - ");
      if (parts.length >= 2) {
        const rack = parts.pop();
        const floor = parts.join(" - ");
        setFloor(floor);
        setRack(rack || "");
      } else {
        setFloor(session.warehouse);
        setRack("");
      }
    }

    setActiveSession(sessionId, "STANDARD");
    router.push({
      pathname: "/staff/scan",
      params: { sessionId },
    } as any);
  };

  const handleOpenSessionHistory = (session: any) => {
    Haptics.selectionAsync();

    const sessionId = session?.id || session?._id || session?.session_id;
    if (!sessionId) {
      toastService.showError("Unable to open session history (missing ID).");
      return;
    }

    router.push({
      pathname: "/staff/history",
      params: { sessionId },
    } as any);
  };

  const renderStatusSignal = () => {
    if (liveStatus.tone === "warning") {
      return (
        <View style={[styles.heroSignalPill, styles.heroSignalWarning]}>
          <Ionicons name={liveStatus.icon} size={14} color={colors.warning[700]} />
          <Text style={[styles.heroSignalText, styles.heroSignalWarningText]}>
            {liveStatus.label}
          </Text>
        </View>
      );
    }

    if (liveStatus.tone === "success") {
      return (
        <View style={[styles.heroSignalPill, styles.heroSignalSuccess]}>
          <Ionicons name={liveStatus.icon} size={14} color={colors.success[700]} />
          <Text style={[styles.heroSignalText, styles.heroSignalSuccessText]}>
            {liveStatus.label}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.heroSignalPill, styles.heroSignalNeutral]}>
        <Ionicons name={liveStatus.icon} size={14} color={colors.gray[700]} />
        <Text style={[styles.heroSignalText, styles.heroSignalNeutralText]}>
          {liveStatus.label}
        </Text>
      </View>
    );
  };

  const renderSessionCard = (
    session: any,
    onPress: (session: any) => void = handleResumeSession
  ) => {
    const progress = getSessionProgress(session);
    const statusStyle = getSessionStatusStyle(session?.status);
    const location = getWarehouseParts(session?.warehouse);
    const issueCount = Number(session?.discrepancy_count ?? 0);

    return (
      <ModernCard
        key={session.id || session._id}
        variant="outlined"
        style={styles.sessionCard}
        padding={spacing.md}
        onPress={() => onPress(session)}
      >
        <View style={styles.sessionTopRow}>
          <View style={styles.sessionIdentityBlock}>
            <View style={styles.sessionMetaRow}>
              <View style={styles.sessionLocationPill}>
                <Ionicons
                  name="navigate-outline"
                  size={14}
                  color={operationalPalette.primaryStrong}
                />
                <Text style={styles.sessionLocationPillText}>{location.zone}</Text>
              </View>
              <View
                style={[
                  styles.sessionStatusBadge,
                  {
                    backgroundColor: statusStyle.backgroundColor,
                    borderColor: statusStyle.borderColor,
                  },
                ]}
              >
                <Text style={[styles.sessionStatusBadgeText, { color: statusStyle.textColor }]}>
                  {statusStyle.label}
                </Text>
              </View>
            </View>

            <Text style={styles.warehouseText}>{location.area}</Text>
            <Text style={styles.dateText}>
              {location.rack ? `Rack ${location.rack} • ` : ""}
              Last used {formatSessionDateTime(session)}
            </Text>
          </View>

          <View style={styles.chevron}>
            <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
          </View>
        </View>

        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{progress.label}</Text>
          <Text style={styles.progressPercent}>{progress.percent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(progress.percent, progress.percent === 0 ? 0 : 6)}%` },
            ]}
          />
        </View>

        <View style={styles.sessionStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{progress.scanned}</Text>
            <Text style={styles.statLabel}>Scanned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text
              style={[
                styles.statValue,
                issueCount > 0 ? styles.statValueDanger : styles.statValueSuccess,
              ]}
            >
              {issueCount}
            </Text>
            <Text style={styles.statLabel}>Issues</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{progress.total > 0 ? progress.total : "--"}</Text>
            <Text style={styles.statLabel}>Target</Text>
          </View>
        </View>
      </ModernCard>
    );
  };

  const renderDashboardHero = (mode: "active" | "history") => (
    <ModernCard variant="outlined" style={styles.heroCard} padding={spacing.lg}>
      <View style={styles.heroHeader}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>
            {mode === "active" ? "Operational Snapshot" : "Session History"}
          </Text>
          <Text style={styles.heroTitle}>
            {mode === "active"
              ? "Keep location counts moving with fewer handoff mistakes."
              : "Review completed areas without losing audit context."}
          </Text>
          <Text style={styles.heroSubtitle}>
            {mode === "active"
              ? "Start a fresh verification or continue the most recent open location."
              : "Completed sessions stay visible here for quick traceability and follow-up."}
          </Text>
        </View>
        {renderStatusSignal()}
      </View>

      <View style={styles.heroMetricGrid}>
        <View style={styles.heroMetricCard}>
          <Text style={styles.heroMetricValue}>
            {mode === "active" ? uniqueActiveSessions.length : finishedSessions.length}
          </Text>
          <Text style={styles.heroMetricLabel}>
            {mode === "active" ? "Open locations" : "Completed sessions"}
          </Text>
        </View>
        <View style={styles.heroMetricCard}>
          <Text style={styles.heroMetricValue}>
            {mode === "active" ? activeScanCount : unreadCount}
          </Text>
          <Text style={styles.heroMetricLabel}>
            {mode === "active" ? "Captured scans" : "Unread alerts"}
          </Text>
        </View>
        <View style={styles.heroMetricCard}>
          <Text
            style={[styles.heroMetricValue, activeIssueCount > 0 && styles.heroMetricValueWarning]}
          >
            {mode === "active" ? activeIssueCount : queuedOperations}
          </Text>
          <Text style={styles.heroMetricLabel}>
            {mode === "active" ? "Variance flags" : "Queued sync"}
          </Text>
        </View>
      </View>

      {mode === "active" ? (
        <ModernButton
          title="Start New Session"
          icon="add-circle-outline"
          onPress={() => setShowCreateModal(true)}
          style={styles.createButton}
          fullWidth
        />
      ) : null}
    </ModernCard>
  );

  const renderContent = () => {
    if (activeTab === "active") {
      return (
        <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(500)}>
          {renderDashboardHero("active")}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>Continue active locations</Text>
            <Text style={styles.sectionHeaderMeta}>{uniqueActiveSessions.length} active</Text>
          </View>

          {uniqueActiveSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color={colors.gray[300]} />
              <Text style={styles.emptyText}>No active sessions</Text>
              <Text style={styles.emptySubtext}>Start a new session to begin scanning</Text>
            </View>
          ) : (
            uniqueActiveSessions.map((session) => renderSessionCard(session, handleResumeSession))
          )}
        </Animated.View>
      );
    }

    if (activeTab === "history") {
      return (
        <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(500)}>
          {renderDashboardHero("history")}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>Recent completed sessions</Text>
            <Text style={styles.sectionHeaderMeta}>{finishedSessions.length} saved</Text>
          </View>

          {finishedSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={colors.gray[300]} />
              <Text style={styles.emptyText}>No history yet</Text>
            </View>
          ) : (
            finishedSessions.map((session) => renderSessionCard(session, handleOpenSessionHistory))
          )}
        </Animated.View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ModernHeader
        title="Dashboard"
        subtitle={`Welcome, ${user?.username || "Staff"}`}
        rightComponent={
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.push("/notifications" as any)}
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Ionicons
              name={unreadCount > 0 ? "notifications" : "notifications-outline"}
              size={22}
              color={colors.gray[700]}
            />
            {unreadCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        }
        rightAction={{
          icon: "log-out-outline",
          onPress: () => {
            if (Platform.OS === "web" && typeof window !== "undefined") {
              const confirmed = window.confirm("Are you sure you want to logout?");
              if (confirmed) {
                logout().finally(() => {
                  router.replace("/welcome" as any);
                });
              }
              return;
            }
            Alert.alert("Logout", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Logout",
                style: "destructive",
                onPress: async () => {
                  await logout();
                  router.replace("/welcome" as any);
                },
              },
            ]);
          },
        }}
      />

      <View
        style={styles.tabs}
        accessibilityRole="tablist"
        accessibilityLabel="Session dashboard sections"
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === "active" && styles.activeTab]}
          onPress={() => setActiveTab("active")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "active" }}
          accessibilityLabel={`Active sessions, ${uniqueActiveSessions.length} items`}
        >
          <Ionicons
            name="radio-outline"
            size={16}
            color={activeTab === "active" ? operationalPalette.primaryStrong : colors.gray[600]}
          />
          <Text style={[styles.tabText, activeTab === "active" && styles.activeTabText]}>
            Active ({uniqueActiveSessions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.activeTab]}
          onPress={() => setActiveTab("history")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "history" }}
          accessibilityLabel={`Session history, ${finishedSessions.length} items`}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeTab === "history" ? operationalPalette.primaryStrong : colors.gray[600]}
          />
          <Text style={[styles.tabText, activeTab === "history" && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {renderContent()}
      </ScrollView>

      {/* Create Session Modal */}
      <Modal
        visible={showCreateModal}
        animationType={prefersReducedMotion ? "none" : "slide"}
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalContainer}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCreateModal(false)}
            accessibilityRole="button"
            accessibilityLabel="Close new session modal"
          />

          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalEyebrow}>Start Verification</Text>
                <Text style={styles.modalTitle}>New Session</Text>
                <Text style={styles.modalSubtitle}>
                  Select the location, confirm the count area, and then begin scanning.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCreateModal(false)}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close new session modal"
              >
                <Ionicons name="close" size={22} color={colors.gray[600]} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.statusPill,
                isSessionLocationComplete ? styles.statusPillReady : styles.statusPillPending,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  isSessionLocationComplete ? styles.statusDotReady : styles.statusDotPending,
                ]}
              />
              <Text
                style={[
                  styles.statusPillText,
                  isSessionLocationComplete
                    ? styles.statusPillTextReady
                    : styles.statusPillTextPending,
                ]}
              >
                {isSessionLocationComplete ? "Ready to start" : "Setup required"}
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              nestedScrollEnabled
            >
              <View style={styles.readinessCard}>
                <Text style={styles.readinessTitle}>Session setup</Text>
                <Text style={styles.readinessSubtitle}>
                  Keep the location details explicit so the session opens in the correct zone.
                </Text>

                {readinessItems.map((item) => (
                  <View key={item.id} style={styles.readinessRow}>
                    <View
                      style={[
                        styles.readinessIcon,
                        item.done ? styles.readinessIconDone : styles.readinessIconPending,
                      ]}
                    >
                      <Ionicons
                        name={item.done ? "checkmark" : "ellipse-outline"}
                        size={14}
                        color={item.done ? colors.success[600] : colors.gray[500]}
                      />
                    </View>

                    <View style={styles.readinessTextGroup}>
                      <Text style={styles.readinessLabel}>{item.label}</Text>
                      <Text style={styles.readinessValue}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Select Location</Text>
              <Text style={styles.sectionHelper}>
                Choose the zone or location type for this count session.
              </Text>
              <View
                style={styles.chipContainer}
                accessibilityRole="radiogroup"
                accessibilityLabel="Select location"
              >
                {zones.map((zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    style={[styles.chip, locationType === zone.zone_name && styles.chipActive]}
                    onPress={() => setLocationType(zone.zone_name)}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: locationType === zone.zone_name,
                    }}
                    accessibilityLabel={`Location ${zone.zone_name}`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        locationType === zone.zone_name && styles.chipTextActive,
                      ]}
                    >
                      {zone.zone_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {locationType && (
                <Animated.View entering={prefersReducedMotion ? undefined : FadeInUp.duration(250)}>
                  <Text style={styles.sectionLabel}>Select Floor / Area</Text>
                  <Text style={styles.sectionHelper}>
                    Narrow the session to the correct floor or operational area.
                  </Text>
                  <View
                    style={styles.chipContainer}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Select floor or area"
                  >
                    {warehouses.map((wh) => (
                      <TouchableOpacity
                        key={wh.id}
                        style={[
                          styles.chip,
                          selectedFloor === wh.warehouse_name && styles.chipActive,
                        ]}
                        onPress={() => setSelectedFloor(wh.warehouse_name)}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected: selectedFloor === wh.warehouse_name,
                        }}
                        accessibilityLabel={`Floor or area ${wh.warehouse_name}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selectedFloor === wh.warehouse_name && styles.chipTextActive,
                          ]}
                        >
                          {wh.warehouse_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Animated.View>
              )}

              {selectedFloor && (
                <Animated.View entering={prefersReducedMotion ? undefined : FadeInUp.duration(250)}>
                  <Text style={styles.sectionLabel}>Rack / Shelf Number</Text>
                  <Text style={styles.sectionHelper}>
                    Use the exact rack code visible to staff on the floor.
                  </Text>
                  <ModernInput
                    label="Rack / Shelf Number"
                    placeholder="e.g. A-123"
                    value={rackName}
                    onChangeText={setRackName}
                    autoCapitalize="characters"
                    showClearButton
                    containerStyle={styles.modalInputField}
                  />
                </Animated.View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <ModernButton
                title="Start Session"
                onPress={handleStartSession}
                loading={isCreating}
                disabled={!locationType || !selectedFloor || !rackName.trim()}
                icon="play"
                fullWidth
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: operationalPalette.background,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: operationalPalette.background,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: operationalPalette.surface,
    borderWidth: 1,
    borderColor: operationalPalette.border,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: operationalPalette.primaryTint,
    borderColor: "#BEE7E9",
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[600],
  },
  activeTabText: {
    color: operationalPalette.primaryStrong,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing["2xl"],
  },
  createButton: {
    marginTop: spacing.md,
    backgroundColor: operationalPalette.primary,
  },
  sessionCard: {
    marginBottom: spacing.md,
    backgroundColor: operationalPalette.surface,
    borderColor: operationalPalette.border,
  },
  heroCard: {
    backgroundColor: operationalPalette.surface,
    borderColor: operationalPalette.border,
    marginBottom: spacing.lg,
  },
  heroHeader: {
    gap: spacing.md,
  },
  heroCopy: {
    gap: spacing.xs,
  },
  heroEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: operationalPalette.primaryStrong,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.ink,
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: typography.fontSize.sm,
    color: operationalPalette.muted,
    lineHeight: 20,
  },
  heroSignalPill: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  heroSignalSuccess: {
    backgroundColor: colors.success[50],
  },
  heroSignalWarning: {
    backgroundColor: colors.warning[50],
  },
  heroSignalNeutral: {
    backgroundColor: colors.gray[100],
  },
  heroSignalText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  heroSignalSuccessText: {
    color: colors.success[700],
  },
  heroSignalWarningText: {
    color: colors.warning[700],
  },
  heroSignalNeutralText: {
    color: colors.gray[700],
  },
  heroMetricGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroMetricCard: {
    flex: 1,
    backgroundColor: operationalPalette.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: operationalPalette.border,
    padding: spacing.md,
    gap: 4,
  },
  heroMetricValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.ink,
  },
  heroMetricValueWarning: {
    color: colors.warning[700],
  },
  heroMetricLabel: {
    fontSize: typography.fontSize.xs,
    color: operationalPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionHeaderTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.ink,
  },
  sectionHeaderMeta: {
    fontSize: typography.fontSize.sm,
    color: operationalPalette.muted,
  },
  sessionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sessionIdentityBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sessionLocationPill: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: operationalPalette.primaryTint,
  },
  sessionLocationPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: operationalPalette.primaryStrong,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sessionStatusBadge: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionStatusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  warehouseText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.ink,
  },
  dateText: {
    fontSize: typography.fontSize.sm,
    color: operationalPalette.muted,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: operationalPalette.surfaceMuted,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    backgroundColor: operationalPalette.surface,
    borderWidth: 1,
    borderColor: operationalPalette.border,
  },
  notificationBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: borderRadius.full,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error[500],
    borderWidth: 2,
    borderColor: colors.white,
  },
  notificationBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.fontSize.sm,
    color: operationalPalette.muted,
  },
  progressPercent: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.primaryStrong,
  },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: operationalPalette.surfaceMuted,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  progressFill: {
    height: "100%",
    borderRadius: borderRadius.full,
    backgroundColor: operationalPalette.primary,
  },
  sessionStats: {
    flexDirection: "row",
    backgroundColor: operationalPalette.surfaceMuted,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: operationalPalette.border,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: operationalPalette.border,
  },
  statValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: operationalPalette.ink,
  },
  statValueSuccess: {
    color: colors.success[700],
  },
  statValueDanger: {
    color: colors.error[600],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: operationalPalette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["3xl"],
    backgroundColor: operationalPalette.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: operationalPalette.border,
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.medium,
    color: operationalPalette.ink,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: operationalPalette.muted,
    marginTop: spacing.xs,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 28, 26, 0.22)",
  },
  modalSheet: {
    maxHeight: "88%",
    backgroundColor: operationalPalette.background,
    borderTopLeftRadius: borderRadius["3xl"],
    borderTopRightRadius: borderRadius["3xl"],
    paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 56,
    height: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[200],
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  modalTitle: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  modalSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    lineHeight: 20,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: operationalPalette.surface,
    borderWidth: 1,
    borderColor: operationalPalette.border,
  },
  statusPill: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  statusPillReady: {
    backgroundColor: colors.success[50],
  },
  statusPillPending: {
    backgroundColor: colors.warning[50],
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  statusDotReady: {
    backgroundColor: colors.success[600],
  },
  statusDotPending: {
    backgroundColor: colors.warning[600],
  },
  statusPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  statusPillTextReady: {
    color: colors.success[600],
  },
  statusPillTextPending: {
    color: colors.warning[600],
  },
  modalContent: {
    padding: spacing.lg,
  },
  readinessCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: operationalPalette.surface,
    borderWidth: 1,
    borderColor: operationalPalette.border,
    marginBottom: spacing.lg,
  },
  readinessTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  readinessSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  readinessIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  readinessIconDone: {
    backgroundColor: colors.success[50],
  },
  readinessIconPending: {
    backgroundColor: colors.gray[100],
  },
  readinessTextGroup: {
    flex: 1,
  },
  readinessLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[700],
  },
  readinessValue: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[700],
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionHelper: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: operationalPalette.surface,
    borderWidth: 1,
    borderColor: operationalPalette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: operationalPalette.primaryTint,
    borderColor: operationalPalette.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
    fontWeight: typography.fontWeight.medium,
  },
  chipTextActive: {
    color: operationalPalette.primaryStrong,
    fontWeight: typography.fontWeight.semibold,
  },
  modalInputField: {
    marginBottom: spacing.sm,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: operationalPalette.border,
    paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
    backgroundColor: operationalPalette.surface,
  },
});

export default StaffHome;
