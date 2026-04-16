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

import { useAuthStore } from "../../src/store/authStore";
import { useNotificationStore } from "../../src/store/notificationStore";
import { useScanSessionStore } from "../../src/store/scanSessionStore";
import { useSessionsQuery } from "../../src/hooks/useSessionsQuery";
import {
  createSession,
  getZones,
  getWarehouses,
} from "../../src/services/api/api";
import { SESSION_PAGE_SIZE } from "../../src/constants/config";
import { toastService } from "../../src/services/utils/toastService";

import ModernHeader from "../../src/components/ui/ModernHeader";
import ModernCard from "../../src/components/ui/ModernCard";
import ModernButton from "../../src/components/ui/ModernButton";
import ModernInput from "../../src/components/ui/ModernInput";
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "../../src/theme/modernDesign";

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
  const { user, logout } = useAuthStore();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchUnreadCount = useNotificationStore(
    (state) => state.fetchUnreadCount,
  );

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
          ],
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

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );

    return () => backHandler.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchUnreadCount();
    }, [fetchUnreadCount]),
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

  const { setActiveSession, setFloor, setRack } = useScanSessionStore();

  // Queries
  const { data: sessionsData, refetch } = useSessionsQuery({
    page: 1,
    pageSize: SESSION_PAGE_SIZE,
  });

  const sessions = useMemo(
    () => (Array.isArray(sessionsData?.items) ? sessionsData.items : []),
    [sessionsData?.items],
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
      return (
        status === "CLOSED" || status === "COMPLETED" || status === "RECONCILE"
      );
    });
  }, [sessions]);

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
      Alert.alert(
        "Invalid Rack Name",
        "Only letters, numbers, dashes, and underscores allowed",
      );
      return;
    }

    const warehouseName = `${locationType} - ${selectedFloor} - ${trimmedRack.toUpperCase()}`;
    const normalizedWarehouse = normalizeWarehouse(warehouseName);
    const existingSession = activeSessions.find(
      (session: any) =>
        normalizeWarehouse(session.warehouse) === normalizedWarehouse,
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
        ],
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
      queryClient.setQueryData(
        ["sessions", 1, SESSION_PAGE_SIZE],
        (old: any) => {
          const existing = Array.isArray(old?.items) ? old.items : [];
          const filtered = existing.filter(
            (item: any) =>
              (item?.id || item?._id || item?.session_id) !== sessionId,
          );
          return { ...old, items: [session, ...filtered] };
        },
      );

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
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create session";
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
    onPress: (session: any) => void = handleResumeSession,
  ) => (
    <ModernCard
      key={session.id || session._id}
      style={styles.sessionCard}
      padding={spacing.md}
      onPress={() => onPress(session)}
    >
      <View style={styles.sessionHeader}>
        <View style={styles.sessionIcon}>
          <Ionicons name="cube-outline" size={24} color={colors.primary[600]} />
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.warehouseText}>{session.warehouse}</Text>
          <Text style={styles.dateText}>
            Last used: {formatSessionDateTime(session)}
          </Text>
        </View>
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
        </View>
      </View>

      <View style={styles.sessionStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{getScannedCount(session)}</Text>
          <Text style={styles.statLabel}>Scanned</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              {
                color:
                  session.discrepancy_count > 0
                    ? colors.error[500]
                    : colors.success[600],
              },
            ]}
          >
            {session.discrepancy_count || 0}
          </Text>
          <Text style={styles.statLabel}>Issues</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{session.status}</Text>
          <Text style={styles.statLabel}>Status</Text>
        </View>
      </View>
    </ModernCard>
  );

  const renderContent = () => {
    if (activeTab === "active") {
      return (
        <Animated.View entering={FadeInDown.duration(500)}>
          <ModernButton
            title="Start New Session"
            icon="add-circle-outline"
            onPress={() => setShowCreateModal(true)}
            style={styles.createButton}
          />

          {uniqueActiveSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="clipboard-outline"
                size={48}
                color={colors.gray[300]}
              />
              <Text style={styles.emptyText}>No active sessions</Text>
              <Text style={styles.emptySubtext}>
                Start a new session to begin scanning
              </Text>
            </View>
          ) : (
            uniqueActiveSessions.map((session) =>
              renderSessionCard(session, handleResumeSession),
            )
          )}
        </Animated.View>
      );
    }

    if (activeTab === "history") {
      return (
        <Animated.View entering={FadeInDown.duration(500)}>
          {finishedSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="time-outline"
                size={48}
                color={colors.gray[300]}
              />
              <Text style={styles.emptyText}>No history yet</Text>
            </View>
          ) : (
            finishedSessions.map((session) =>
              renderSessionCard(session, handleOpenSessionHistory),
            )
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
              const confirmed = window.confirm(
                "Are you sure you want to logout?",
              );
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

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "active" && styles.activeTab]}
          onPress={() => setActiveTab("active")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "active" && styles.activeTabText,
            ]}
          >
            Active ({uniqueActiveSessions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.activeTab]}
          onPress={() => setActiveTab("history")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "history" && styles.activeTabText,
            ]}
          >
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
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {renderContent()}
      </ScrollView>

      {/* Create Session Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Session</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color={colors.gray[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            nestedScrollEnabled
          >
            <Text style={styles.sectionLabel}>Select Location</Text>
            <View style={styles.chipContainer}>
              {zones.map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.chip,
                    locationType === zone.zone_name && styles.chipActive,
                  ]}
                  onPress={() => setLocationType(zone.zone_name)}
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
              <Animated.View entering={FadeInUp}>
                <Text style={styles.sectionLabel}>Select Floor / Area</Text>
                <View style={styles.chipContainer}>
                  {warehouses.map((wh) => (
                    <TouchableOpacity
                      key={wh.id}
                      style={[
                        styles.chip,
                        selectedFloor === wh.warehouse_name &&
                        styles.chipActive,
                      ]}
                      onPress={() => setSelectedFloor(wh.warehouse_name)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedFloor === wh.warehouse_name &&
                          styles.chipTextActive,
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
              <Animated.View entering={FadeInUp}>
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

          <View style={styles.modalFooter}>
            <ModernButton
              title="Start Session"
              onPress={handleStartSession}
              loading={isCreating}
              disabled={!locationType || !selectedFloor || !rackName.trim()}
              fullWidth
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
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[200],
  },
  activeTab: {
    backgroundColor: colors.primary[600],
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[600],
  },
  activeTabText: {
    color: colors.white,
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
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  warehouseText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
  },
  dateText: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    marginTop: 2,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
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
    padding: spacing.xs,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
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
