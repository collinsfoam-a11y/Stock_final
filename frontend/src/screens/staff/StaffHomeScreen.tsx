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
import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSessionsQuery } from "@/hooks/useSessionsQuery";
import { createSession, getZones, getWarehouses } from "@/services/api/api";
import { SESSION_PAGE_SIZE } from "@/constants/config";
import { toastService } from "@/services/toastService";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernCard from "@/components/ui/ModernCard";
import ModernButton from "@/components/ui/ModernButton";
import ModernInput from "@/components/ui/ModernInput";
import { SyncStatusPill } from "@/components/ui/SyncStatusPill";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colors, spacing, typography, borderRadius } from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

interface Zone {
  id: string;
  zone_name: string;
}

interface Warehouse {
  id: string;
  warehouse_name: string;
}

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

const StaffHome = React.memo(function StaffHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const uiTokens = useUiTokens();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchUnreadCount = useNotificationStore((state) => state.fetchUnreadCount);

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

  const activeSummary = useMemo(() => {
    return uniqueActiveSessions.reduce(
      (summary, session: any) => ({
        scanned: summary.scanned + getScannedCount(session),
        issues:
          summary.issues +
          (Number.isFinite(Number(session.discrepancy_count))
            ? Number(session.discrepancy_count)
            : 0),
      }),
      { scanned: 0, issues: 0 }
    );
  }, [uniqueActiveSessions]);

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

  const renderSessionCard = (
    session: any,
    onPress: (session: any) => void = handleResumeSession
  ) => {
    const status = String(session.status || "OPEN")
      .trim()
      .toUpperCase();
    const isOpenStatus = status === "OPEN" || status === "ACTIVE";
    const issueCount = Number.isFinite(Number(session.discrepancy_count))
      ? Number(session.discrepancy_count)
      : 0;

    return (
      <ModernCard
        key={session.id || session._id}
        style={[
          styles.sessionCard,
          {
            backgroundColor: uiTokens.colors.surface,
            borderColor: uiTokens.colors.border,
          },
        ]}
        padding={spacing.md}
        onPress={() => onPress(session)}
      >
        <View style={styles.sessionHeader}>
          <View
            style={[
              styles.sessionIcon,
              {
                backgroundColor: colorWithAlpha(
                  uiTokens.colors.accent,
                  uiTokens.mode === "dark" ? 0.18 : 0.1
                ),
              },
            ]}
          >
            <Ionicons name="cube-outline" size={22} color={uiTokens.colors.accentStrong} />
          </View>
          <View style={styles.sessionInfo}>
            <Text
              style={[styles.warehouseText, { color: uiTokens.colors.textPrimary }]}
              numberOfLines={2}
            >
              {session.warehouse}
            </Text>
            <Text style={[styles.dateText, { color: uiTokens.colors.textSecondary }]}>
              Last used: {formatSessionDateTime(session)}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isOpenStatus
                  ? colorWithAlpha(uiTokens.colors.success, uiTokens.mode === "dark" ? 0.18 : 0.1)
                  : uiTokens.colors.surfaceElevated,
                borderColor: isOpenStatus
                  ? colorWithAlpha(uiTokens.colors.success, 0.32)
                  : uiTokens.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOpenStatus
                    ? uiTokens.colors.success
                    : uiTokens.colors.textMuted,
                },
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: isOpenStatus ? uiTokens.colors.success : uiTokens.colors.textSecondary },
              ]}
            >
              {status}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.sessionStats,
            {
              backgroundColor: uiTokens.colors.surfaceElevated,
              borderColor: uiTokens.colors.border,
            },
          ]}
        >
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: uiTokens.colors.textPrimary }]}>
              {getScannedCount(session)}
            </Text>
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>
              Scanned
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={styles.statItem}>
            <Text
              style={[
                styles.statValue,
                {
                  color: issueCount > 0 ? uiTokens.colors.error : uiTokens.colors.success,
                },
              ]}
            >
              {issueCount}
            </Text>
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Issues</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={styles.statItem}>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>
              Details
            </Text>
          </View>
        </View>
      </ModernCard>
    );
  };

  const renderContent = () => {
    if (activeTab === "active") {
      return (
        <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(500)}>
          <ModernButton
            title="Start New Session"
            icon="barcode-outline"
            onPress={() => setShowCreateModal(true)}
            style={{
              ...styles.createButton,
              backgroundColor: uiTokens.colors.accent,
              borderColor: uiTokens.colors.accent,
            }}
          />

          {uniqueActiveSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color={uiTokens.colors.textMuted} />
              <Text style={[styles.emptyText, { color: uiTokens.colors.textPrimary }]}>
                No active sessions
              </Text>
              <Text style={[styles.emptySubtext, { color: uiTokens.colors.textSecondary }]}>
                Start a new session to begin scanning
              </Text>
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
          {finishedSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={uiTokens.colors.textMuted} />
              <Text style={[styles.emptyText, { color: uiTokens.colors.textPrimary }]}>
                No history yet
              </Text>
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top"]}
    >
      <ModernHeader
        title="Stock Verify"
        subtitle={user?.full_name || user?.username || "Staff"}
        showSettingsButton={false}
        rightComponent={
          <TouchableOpacity
            style={[
              styles.headerIconButton,
              {
                backgroundColor: uiTokens.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: uiTokens.colors.border,
              },
            ]}
            onPress={() => router.push("/notifications" as any)}
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Ionicons
              name={unreadCount > 0 ? "notifications" : "notifications-outline"}
              size={22}
              color={uiTokens.colors.accent}
            />
            {unreadCount > 0 ? (
              <View
                style={[
                  styles.notificationBadge,
                  {
                    backgroundColor: uiTokens.colors.error,
                    borderColor: uiTokens.colors.surface,
                  },
                ]}
              >
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

      <View style={styles.pageContent}>
        <ModernCard
          padding={spacing.lg}
          style={[
            styles.summaryCard,
            {
              backgroundColor: uiTokens.colors.surface,
              borderColor: uiTokens.colors.border,
            },
          ]}
        >
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryCopy}>
            <Text style={[styles.summaryEyebrow, { color: uiTokens.colors.accentStrong }]}>
              Current workload
            </Text>
            <Text style={[styles.summaryTitle, { color: uiTokens.colors.textPrimary }]}>
              {uniqueActiveSessions.length} active{" "}
              {uniqueActiveSessions.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
          <View style={styles.syncPillWrap}>
            <SyncStatusPill />
          </View>
        </View>
        <View
          style={[
            styles.summaryMetrics,
            {
              backgroundColor: uiTokens.colors.surfaceElevated,
              borderColor: uiTokens.colors.border,
            },
          ]}
        >
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryValue, { color: uiTokens.colors.textPrimary }]}>
              {activeSummary.scanned}
            </Text>
            <Text style={[styles.summaryLabel, { color: uiTokens.colors.textSecondary }]}>
              Scanned
            </Text>
          </View>
          <View
            style={[styles.summaryMetricDivider, { backgroundColor: uiTokens.colors.border }]}
          />
          <View style={styles.summaryMetric}>
            <Text
              style={[
                styles.summaryValue,
                {
                  color:
                    activeSummary.issues > 0 ? uiTokens.colors.error : uiTokens.colors.textPrimary,
                },
              ]}
            >
              {activeSummary.issues}
            </Text>
            <Text style={[styles.summaryLabel, { color: uiTokens.colors.textSecondary }]}>
              Issues
            </Text>
          </View>
        </View>
      </ModernCard>

      <View style={styles.actionRow}>
        <ModernButton
          title="Start New Session"
          icon="barcode-outline"
          onPress={() => setShowCreateModal(true)}
          size="large"
          fullWidth
          style={{
            backgroundColor: uiTokens.colors.accent,
            borderColor: uiTokens.colors.accent,
          }}
          accessibilityLabel="Start a new stock verification session"
        />
      </View>

      <View
        style={styles.tabs}
        accessibilityRole="tablist"
        accessibilityLabel="Session dashboard sections"
      >
        <TouchableOpacity
          style={[
            styles.tab,
            {
              backgroundColor:
                activeTab === "active"
                  ? colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.22 : 0.1)
                  : uiTokens.colors.surface,
              borderColor: activeTab === "active" ? uiTokens.colors.accent : uiTokens.colors.border,
            },
          ]}
          onPress={() => setActiveTab("active")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "active" }}
          accessibilityLabel={`Active sessions, ${uniqueActiveSessions.length} items`}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "active"
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.textSecondary,
              },
            ]}
          >
            Active ({uniqueActiveSessions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            {
              backgroundColor:
                activeTab === "history"
                  ? colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.22 : 0.1)
                  : uiTokens.colors.surface,
              borderColor:
                activeTab === "history" ? uiTokens.colors.accent : uiTokens.colors.border,
            },
          ]}
          onPress={() => setActiveTab("history")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "history" }}
          accessibilityLabel={`Session history, ${finishedSessions.length} items`}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "history"
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.textSecondary,
              },
            ]}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>
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
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalContainer, { backgroundColor: uiTokens.colors.background }]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: uiTokens.colors.surface,
                borderBottomColor: uiTokens.colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: uiTokens.colors.textPrimary }]}>
              New Session
            </Text>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              style={styles.modalCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close new session modal"
            >
              <Ionicons name="close" size={24} color={uiTokens.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            nestedScrollEnabled
          >
            <Text style={[styles.sectionLabel, { color: uiTokens.colors.textSecondary }]}>
              Select Location
            </Text>
            <View
              style={styles.chipContainer}
              accessibilityRole="radiogroup"
              accessibilityLabel="Select location"
            >
              {zones.map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        locationType === zone.zone_name
                          ? colorWithAlpha(
                              uiTokens.colors.accent,
                              uiTokens.mode === "dark" ? 0.22 : 0.1
                            )
                          : uiTokens.colors.surfaceElevated,
                      borderColor:
                        locationType === zone.zone_name
                          ? uiTokens.colors.accent
                          : uiTokens.colors.border,
                    },
                  ]}
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
                      {
                        color:
                          locationType === zone.zone_name
                            ? uiTokens.colors.accentStrong
                            : uiTokens.colors.textSecondary,
                      },
                    ]}
                  >
                    {zone.zone_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {locationType && (
              <Animated.View entering={prefersReducedMotion ? undefined : FadeInUp.duration(250)}>
                <Text style={[styles.sectionLabel, { color: uiTokens.colors.textSecondary }]}>
                  Select Floor / Area
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
                        {
                          backgroundColor:
                            selectedFloor === wh.warehouse_name
                              ? colorWithAlpha(
                                  uiTokens.colors.accent,
                                  uiTokens.mode === "dark" ? 0.22 : 0.1
                                )
                              : uiTokens.colors.surfaceElevated,
                          borderColor:
                            selectedFloor === wh.warehouse_name
                              ? uiTokens.colors.accent
                              : uiTokens.colors.border,
                        },
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
                          {
                            color:
                              selectedFloor === wh.warehouse_name
                                ? uiTokens.colors.accentStrong
                                : uiTokens.colors.textSecondary,
                          },
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
                <ModernInput
                  label="Rack / Shelf Number"
                  placeholder="e.g. A-123"
                  value={rackName}
                  onChangeText={setRackName}
                  autoCapitalize="characters"
                />
              </Animated.View>
            )}
          </ScrollView>

          <View
            style={[
              styles.modalFooter,
              {
                backgroundColor: uiTokens.colors.surface,
                borderTopColor: uiTokens.colors.border,
              },
            ]}
          >
            <ModernButton
              title="Start Session"
              onPress={handleStartSession}
              loading={isCreating}
              disabled={!locationType || !selectedFloor || !rackName.trim()}
              fullWidth
              style={{
                backgroundColor: uiTokens.colors.accent,
                borderColor: uiTokens.colors.accent,
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  pageContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  summaryCard: {
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  actionRow: {
    marginBottom: spacing.md,
  },
  summaryPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCopy: {
    flex: 1,
  },
  syncPillWrap: {
    minHeight: 32,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  summaryEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
    textTransform: "uppercase",
  },
  summaryTitle: {
    marginTop: 2,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  summaryMetrics: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  summaryMetric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  summaryMetricDivider: {
    width: 1,
    height: "70%",
    backgroundColor: colors.gray[200],
  },
  summaryValue: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  summaryValueWarning: {
    color: colors.error[600],
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: colors.gray[600],
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[600],
  },
  activeTabText: {
    color: colors.primary[700],
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  createButton: {
    marginBottom: spacing.lg,
  },
  sessionCard: {
    marginBottom: spacing.md,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  sessionInfo: {
    flex: 1,
  },
  warehouseText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
  },
  dateText: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    marginTop: 2,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    backgroundColor: colors.gray[100],
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
  sessionStats: {
    flexDirection: "row",
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.gray[200],
  },
  statValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
  },
  statusPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
    marginLeft: spacing.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success[600],
  },
  statusDotMuted: {
    backgroundColor: colors.gray[500],
  },
  statusPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.success[600],
  },
  statusPillMuted: {
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },
  statusPillTextMuted: {
    color: colors.gray[600],
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["3xl"],
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[900],
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[700],
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
  },
  chipTextActive: {
    color: colors.primary[700],
    fontWeight: typography.fontWeight.medium,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
  },
});

export default StaffHome;
