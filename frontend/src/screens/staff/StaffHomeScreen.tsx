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
import {
  createSession,
  getZones,
  getWarehouses,
} from "@/services/api/api";
import { SESSION_PAGE_SIZE } from "@/constants/config";
import { toastService } from "@/services/toastService";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernCard from "@/components/ui/ModernCard";
import ModernButton from "@/components/ui/ModernButton";
import ModernInput from "@/components/ui/ModernInput";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "@/theme/modernDesign";

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
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
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

  const isSessionLocationComplete = Boolean(
    locationType && selectedFloor && rackName.trim(),
  );

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
    [locationType, rackName, selectedFloor],
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
        <Animated.View
          entering={
            prefersReducedMotion ? undefined : FadeInDown.duration(500)
          }
        >
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
        <Animated.View
          entering={
            prefersReducedMotion ? undefined : FadeInDown.duration(500)
          }
        >
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
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "history" }}
          accessibilityLabel={`Session history, ${finishedSessions.length} items`}
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
                isSessionLocationComplete
                  ? styles.statusPillReady
                  : styles.statusPillPending,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  isSessionLocationComplete
                    ? styles.statusDotReady
                    : styles.statusDotPending,
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
                        item.done
                          ? styles.readinessIconDone
                          : styles.readinessIconPending,
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
                    style={[
                      styles.chip,
                      locationType === zone.zone_name && styles.chipActive,
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
                        locationType === zone.zone_name && styles.chipTextActive,
                      ]}
                    >
                      {zone.zone_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {locationType && (
                <Animated.View
                  entering={
                    prefersReducedMotion ? undefined : FadeInUp.duration(250)
                  }
                >
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
                          selectedFloor === wh.warehouse_name &&
                          styles.chipActive,
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
                <Animated.View
                  entering={
                    prefersReducedMotion ? undefined : FadeInUp.duration(250)
                  }
                >
                  <Text style={styles.sectionLabel}>Rack / Shelf Number</Text>
                  <Text style={styles.sectionHelper}>
                    Use the exact rack code visible to staff on the floor.
                  </Text>
                  <ModernInput
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
    backgroundColor: colors.gray[50],
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
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
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
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
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  modalSheet: {
    maxHeight: "88%",
    backgroundColor: colors.white,
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
    backgroundColor: colors.gray[100],
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
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[600],
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
    fontWeight: typography.fontWeight.medium,
  },
  chipTextActive: {
    color: colors.primary[700],
    fontWeight: typography.fontWeight.semibold,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
    backgroundColor: colors.white,
  },
});

export default StaffHome;
