/**
 * Staff Home Screen – Lavanya Mart Stock Verify
 * Enterprise-grade dashboard for stock verification sessions.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  BackHandler,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { font, radius, icon, touch, gap } from "@/theme/staffUiScale";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSessionsQuery } from "@/hooks/useSessionsQuery";
import { createSession, getZones, getWarehouses } from "@/services/api/api";
import { SESSION_PAGE_SIZE } from "@/constants/config";
import { toastService } from "@/services/toastService";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, getTokenShadowStyle } from "@/theme/themeTokens";
import { ModernHeader } from "@/components/ui/ModernHeader";
import { ModernCard } from "@/components/ui/ModernCard";
import { ModernButton } from "@/components/ui/ModernButton";
import { ModernInput } from "@/components/ui/ModernInput";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { useUniversalLogout } from "@/components/auth/UniversalLogout";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Zone {
  id: string;
  zone_name: string;
}

interface Warehouse {
  id: string;
  warehouse_name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const p = new Date(t);
    if (!Number.isNaN(p.getTime())) return p;
    const n = Number(t);
    if (!Number.isNaN(n)) {
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
};

const getSessionDate = (session: any): Date | null => {
  const fields = [
    session.updated_at, session.closed_at, session.reconciled_at,
    session.completed_at, session.started_at, session.created_at,
    session.startedAt, session.createdAt,
  ];
  let best: Date | null = null;
  for (const v of fields) {
    const d = toDate(v);
    if (d && (!best || d > best)) best = d;
  }
  return best;
};

const formatRelativeTime = (session: any): string => {
  const d = getSessionDate(session);
  if (!d) return "Unknown";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
};

const getScannedCount = (session: any): number => {
  const raw =
    session.item_count ?? session.scanned_count ?? session.verified_count ??
    session.total_items ?? session.items_scanned ?? 0;
  const v = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(v) ? Number(v) : 0;
};

const normalizeWarehouse = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";

// Expands sub-44dp icon buttons to meet the 44x44 minimum touch target.
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const getInitials = (name: string | null | undefined): string => {
  if (!name) return "S";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
};

// ─── Component ───────────────────────────────────────────────────────────────

const StaffHome = React.memo(function StaffHome() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const setActiveSession = useScanSessionStore((s) => s.setActiveSession);
  const setFloor = useScanSessionStore((s) => s.setFloor);
  const setRack = useScanSessionStore((s) => s.setRack);

  // ── PIN prompt ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.has_pin) {
      const t = setTimeout(() => {
        Alert.alert("Set PIN Code", "Set a PIN for faster, secure login.", [
          { text: "Later", style: "cancel" },
          { text: "Set PIN", onPress: () => router.push("/staff/settings") },
        ]);
      }, 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [user, router]);

  // ── Android back ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert("Exit", "Exit the app?", [
        { text: "Cancel", style: "cancel" },
        { text: "Exit", onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => handler.remove();
  }, []);

  useFocusEffect(useCallback(() => { void fetchUnreadCount(); }, [fetchUnreadCount]));

  // Use universal logout hook for consistent logout functionality
  const handleLogout = useUniversalLogout({
    redirectPath: "/welcome",
    showConfirmation: true,
    onLogoutSuccess: () => {
      router.replace("/welcome" as any);
    },
    onLogoutError: () => {
      toastService.showError("Failed to sign out. Please try again.");
    }
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [locationType, setLocationType] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rackName, setRackName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: sessionsData,
    refetch,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useSessionsQuery({ page: 1, pageSize: SESSION_PAGE_SIZE });

  const sessions = useMemo(
    () => (Array.isArray(sessionsData?.items) ? sessionsData.items : []),
    [sessionsData?.items]
  );

  const activeSessions = useMemo(
    () =>
      sessions
        .filter((s: any) => s && typeof s === "object")
        .filter((s: any) => {
          const st = String(s.status || "OPEN").trim().toUpperCase();
          return st === "OPEN" || st === "ACTIVE";
        })
        .sort((a: any, b: any) => {
          const aT = getSessionDate(a)?.getTime() ?? 0;
          const bT = getSessionDate(b)?.getTime() ?? 0;
          return bT - aT;
        }),
    [sessions]
  );

  // De-dupe by session ID (not warehouse) — a user can have multiple racks open
  const uniqueActiveSessions = useMemo(() => {
    const seen = new Set<string>();
    return activeSessions.filter((s: any) => {
      const id = String(s?.id || s?._id || s?.session_id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [activeSessions]);

  const finishedSessions = useMemo(
    () =>
      sessions.filter((s: any) => {
        const st = String(s.status || "").trim().toUpperCase();
        return ["CLOSED", "COMPLETED", "RECONCILE", "FINALIZED", "REVIEW"].includes(st);
      }),
    [sessions]
  );

  const activeSummary = useMemo(
    () =>
      uniqueActiveSessions.reduce(
        (acc, s: any) => ({
          scanned: acc.scanned + getScannedCount(s),
          issues: acc.issues + (Number.isFinite(Number(s.discrepancy_count)) ? Number(s.discrepancy_count) : 0),
        }),
        { scanned: 0, issues: 0 }
      ),
    [uniqueActiveSessions]
  );

  // ── Zone / Warehouse fetch ────────────────────────────────────────────────
  useEffect(() => {
    const fallback = [
      { zone_name: "Showroom", id: "zone_showroom" },
      { zone_name: "Godown", id: "zone_godown" },
    ];
    setZones(fallback);
    getZones()
      .then((d) => { if (Array.isArray(d) && d.length) setZones(d); })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!locationType) return;
    const fallback: Warehouse[] = locationType.toLowerCase().includes("showroom")
      ? [
        { warehouse_name: "Ground Floor", id: "fl_g" },
        { warehouse_name: "First Floor", id: "fl_1" },
        { warehouse_name: "Second Floor", id: "fl_2" },
      ]
      : [
        { warehouse_name: "Main Godown", id: "wh_main" },
        { warehouse_name: "Top Godown", id: "wh_top" },
        { warehouse_name: "Damage Area", id: "wh_dmg" },
      ];
    setWarehouses(fallback);
    getWarehouses(locationType)
      .then((d) => { if (Array.isArray(d) && d.length) setWarehouses(d); })
      .catch(() => { });
  }, [locationType]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const resetModal = () => {
    setLocationType(null);
    setSelectedFloor(null);
    setRackName("");
    setShowCreateModal(false);
  };

  const handleStartSession = async () => {
    if (!locationType || !selectedFloor || !rackName.trim()) {
      Alert.alert("Incomplete", "Please fill in all fields before continuing.");
      return;
    }
    const trimmedRack = rackName.trim().toUpperCase();
    if (!/^[A-Za-z0-9\-_]+$/.test(trimmedRack)) {
      Alert.alert("Invalid Rack", "Only letters, numbers, dashes and underscores are allowed.");
      return;
    }
    const warehouseName = `${locationType} - ${selectedFloor} - ${trimmedRack}`;
    const normWH = normalizeWarehouse(warehouseName);
    const existing = activeSessions.find(
      (s: any) => normalizeWarehouse(s.warehouse) === normWH
    );
    if (existing) {
      Alert.alert("Session Active", "A session for this rack is already open. Resume it?", [
        { text: "Cancel", style: "cancel" },
        { text: "Resume", onPress: () => { resetModal(); handleResumeSession(existing); } },
      ]);
      return;
    }
    try {
      setIsCreating(true);
      const session = await createSession({
        warehouse: warehouseName,
        type: "STANDARD",
        location_type: locationType,
        location_name: selectedFloor,
        rack_no: trimmedRack,
      });
      const sessionId = session?.id || session?._id || session?.session_id;
      if (!sessionId) throw new Error("Session created without ID");

      resetModal();
      // Refresh sessions list so new session appears immediately
      void refetch();
      setFloor(`${locationType} - ${selectedFloor}`);
      setRack(trimmedRack);
      setActiveSession(sessionId, "STANDARD");
      router.push({ pathname: "/staff/scan", params: { sessionId } } as any);
    } catch {
      toastService.showError("Failed to create session. Please check your connection and try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleResumeSession = (session: any) => {
    Haptics.selectionAsync();
    const sessionId = session?.id || session?._id || session?.session_id;
    if (!sessionId) { toastService.showError("Unable to resume (missing ID)."); return; }
    if (session.warehouse) {
      const parts = session.warehouse.split(" - ");
      if (parts.length >= 2) {
        const rack = parts.pop() ?? "";
        setFloor(parts.join(" - "));
        setRack(rack);
      } else {
        setFloor(session.warehouse);
        setRack("");
      }
    }
    setActiveSession(sessionId, "STANDARD");
    router.push({ pathname: "/staff/scan", params: { sessionId } } as any);
  };

  const handleOpenHistory = (session: any) => {
    Haptics.selectionAsync();
    const sessionId = session?.id || session?._id || session?.session_id;
    if (!sessionId) { toastService.showError("Unable to open (missing ID)."); return; }
    router.push({ pathname: "/staff/history", params: { sessionId } } as any);
  };

  // ── Dynamic styles ────────────────────────────────────────────────────────
  const s = useMemo(() => createStyles(uiTokens), [uiTokens]);

  // ── Session Card ──────────────────────────────────────────────────────────
  const renderSessionCard = (session: any, onPress: (s: any) => void, isHistory = false) => {
    const status = String(session.status || "OPEN").trim().toUpperCase();
    const isOpen = status === "OPEN" || status === "ACTIVE";
    const scanned = getScannedCount(session);
    const issues = Number.isFinite(Number(session.discrepancy_count))
      ? Number(session.discrepancy_count)
      : 0;
    const rack = session.rack_no || session.warehouse?.split(" - ").pop() || "";
    const location =
      session.location_name ||
      (session.warehouse ? session.warehouse.split(" - ").slice(0, -1).join(" › ") : "—");
    const key = session.id || session._id || session.session_id || Math.random().toString();

    const statusColor = isOpen ? uiTokens.colors.success : uiTokens.colors.textMuted;
    const statusBg = isOpen
      ? colorWithAlpha(uiTokens.colors.success, 0.1)
      : colorWithAlpha(uiTokens.colors.textMuted, 0.08);

    return (
      <ModernCard key={key} style={s.sessionCard} onPress={() => onPress(session)}>
        {/* Header row */}
        <View style={s.sessionCardHeader}>
          <View style={[s.sessionIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1) }]}>
            <Ionicons
              name={isOpen ? "scan-outline" : "checkmark-done-outline"}
              size={20}
              color={uiTokens.colors.accent}
            />
          </View>
          <View style={s.sessionCardMeta}>
            <Text style={[s.sessionRack, { color: uiTokens.colors.textPrimary }]} numberOfLines={1}>
              {rack || location}
            </Text>
            {rack && location ? (
              <Text style={[s.sessionLocation, { color: uiTokens.colors.textSecondary }]} numberOfLines={1}>
                {location}
              </Text>
            ) : null}
          </View>
          <View style={[s.statusPill, { backgroundColor: statusBg, borderColor: colorWithAlpha(statusColor, 0.2) }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{status}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={[s.statsRow, { backgroundColor: colorWithAlpha(uiTokens.colors.border, 0.4), borderColor: uiTokens.colors.border }]}>
          <View style={s.statCell}>
            <Text style={[s.statNum, { color: uiTokens.colors.textPrimary }]}>{scanned}</Text>
            <Text style={[s.statLbl, { color: uiTokens.colors.textMuted }]}>Scanned</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={s.statCell}>
            <Text style={[s.statNum, { color: issues > 0 ? uiTokens.colors.error : uiTokens.colors.success }]}>
              {issues}
            </Text>
            <Text style={[s.statLbl, { color: uiTokens.colors.textMuted }]}>Issues</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={s.statCell}>
            <Text style={[s.statLbl, { color: uiTokens.colors.textMuted }]}>
              {formatRelativeTime(session)}
            </Text>
            <Text style={[s.statLbl, { color: uiTokens.colors.accent }]}>
              {isHistory ? "View ›" : "Resume ›"}
            </Text>
          </View>
        </View>
      </ModernCard>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: uiTokens.colors.background }]} edges={["top"]}>
      {/* Header */}
      <ModernHeader
        title="Stock Verify"
        subtitle={user?.full_name || user?.username || "Staff"}
        showSettingsButton={false}
        rightComponent={
          <View style={s.headerActions}>
            {/* Notifications */}
            <AppTouchable
              style={[s.iconBtn, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.08) }]}
              hitSlop={HIT_SLOP}
              onPress={() => router.push("/notifications" as any)}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            >
              <Ionicons
                name={unreadCount > 0 ? "notifications" : "notifications-outline"}
                size={20}
                color={uiTokens.colors.accent}
              />
              {unreadCount > 0 && (
                <View style={[s.badge, { backgroundColor: uiTokens.colors.error }]}>
                  <Text style={s.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </AppTouchable>

            {/* Settings */}
            <AppTouchable
              style={[s.iconBtn, { backgroundColor: colorWithAlpha(uiTokens.colors.textSecondary, 0.08) }]}
              hitSlop={HIT_SLOP}
              onPress={() => router.push("/staff/settings" as any)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color={uiTokens.colors.textSecondary} />
            </AppTouchable>

            {/* Logout */}
            <AppTouchable
              style={[s.iconBtn, { backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08) }]}
              hitSlop={HIT_SLOP}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={20} color={uiTokens.colors.error} />
            </AppTouchable>
          </View>
        }
      />
      {/* Summary banner */}
      <View style={[s.summary, { backgroundColor: uiTokens.colors.surface, borderColor: uiTokens.colors.border }]}>
        <View style={s.summaryLeft}>
          <View style={[s.summaryIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1) }]}>
            <Ionicons name="layers-outline" size={22} color={uiTokens.colors.accent} />
          </View>
          <View>
            <Text style={[s.summaryEyebrow, { color: uiTokens.colors.accent }]}>Active Workload</Text>
            <Text style={[s.summaryTitle, { color: uiTokens.colors.textPrimary }]}>
              {uniqueActiveSessions.length} {uniqueActiveSessions.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
        </View>
        <View style={[s.summaryMetrics, { backgroundColor: colorWithAlpha(uiTokens.colors.border, 0.4), borderColor: uiTokens.colors.border }]}>
          <View style={s.summaryMetric}>
            <Text style={[s.summaryNum, { color: uiTokens.colors.textPrimary }]}>{activeSummary.scanned}</Text>
            <Text style={[s.summaryMeta, { color: uiTokens.colors.textMuted }]}>Scanned</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: uiTokens.colors.border }]} />
          <View style={s.summaryMetric}>
            <Text style={[s.summaryNum, { color: activeSummary.issues > 0 ? uiTokens.colors.error : uiTokens.colors.textPrimary }]}>
              {activeSummary.issues}
            </Text>
            <Text style={[s.summaryMeta, { color: uiTokens.colors.textMuted }]}>Issues</Text>
          </View>
        </View>
      </View>
      {/* Tabs */}
      <View style={s.tabBar} accessibilityRole="tablist">
        {(["active", "history"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const count = tab === "active" ? uniqueActiveSessions.length : finishedSessions.length;
          return (
            <AppTouchable
              key={tab}
              style={[
                s.tab,
                { borderColor: uiTokens.colors.border, backgroundColor: uiTokens.colors.surface },
                isActive && { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1), borderColor: uiTokens.colors.accent },
              ]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[s.tabText, { color: isActive ? uiTokens.colors.accent : uiTokens.colors.textSecondary }]}>
                {tab === "active" ? "Active" : "History"}
              </Text>
              {count > 0 && (
                <View style={[s.tabBadge, { backgroundColor: isActive ? uiTokens.colors.accent : uiTokens.colors.textMuted }]}>
                  <Text style={s.tabBadgeText}>{count}</Text>
                </View>
              )}
            </AppTouchable>
          );
        })}
      </View>
      {/* Content */}
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={uiTokens.colors.accent}
            colors={[uiTokens.colors.accent]}
          />
        }
      >
        <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(400)}>
          {/* Distinct loading / error states so an in-flight or failed fetch is
              never mistaken for a genuinely empty list. */}
          {sessions.length === 0 && sessionsLoading ? (
            <View style={s.empty}>
              <ActivityIndicator size="large" color={uiTokens.colors.accent} />
              <Text style={[s.emptyBody, { color: uiTokens.colors.textSecondary }]}>
                Loading sessions…
              </Text>
            </View>
          ) : sessions.length === 0 && sessionsError ? (
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08) }]}>
                <Ionicons name="cloud-offline-outline" size={36} color={uiTokens.colors.error} />
              </View>
              <Text style={[s.emptyTitle, { color: uiTokens.colors.textPrimary }]}>Couldn't load sessions</Text>
              <Text style={[s.emptyBody, { color: uiTokens.colors.textSecondary }]}>
                Check your connection and try again.
              </Text>
              <ModernButton title="Retry" icon="refresh-outline" onPress={() => void refetch()} style={s.ctaButton} />
            </View>
          ) : activeTab === "active" ? (
            <>
              <ModernButton
                title="Start New Session"
                icon="add-circle-outline"
                onPress={() => setShowCreateModal(true)}
                style={s.ctaButton}
                fullWidth
              />
              {uniqueActiveSessions.length === 0 ? (
                <View style={s.empty}>
                  <View style={[s.emptyIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.08) }]}>
                    <Ionicons name="clipboard-outline" size={36} color={uiTokens.colors.accent} />
                  </View>
                  <Text style={[s.emptyTitle, { color: uiTokens.colors.textPrimary }]}>No active sessions</Text>
                  <Text style={[s.emptyBody, { color: uiTokens.colors.textSecondary }]}>
                    Tap "Start New Session" to begin scanning inventory.
                  </Text>
                </View>
              ) : (
                uniqueActiveSessions.map((s) => renderSessionCard(s, handleResumeSession))
              )}
            </>
          ) : finishedSessions.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.08) }]}>
                <Ionicons name="time-outline" size={36} color={uiTokens.colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: uiTokens.colors.textPrimary }]}>No history yet</Text>
              <Text style={[s.emptyBody, { color: uiTokens.colors.textSecondary }]}>
                Completed sessions will appear here.
              </Text>
            </View>
          ) : (
            finishedSessions.map((s) => renderSessionCard(s, handleOpenHistory, true))
          )}
        </Animated.View>
      </ScrollView>
      {/* ── Create Session Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showCreateModal}
        animationType={prefersReducedMotion ? "none" : "slide"}
        presentationStyle="pageSheet"
        onRequestClose={resetModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.modal, { backgroundColor: uiTokens.colors.background }]}
        >
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: uiTokens.colors.border }]}>
            <View style={[s.modalIconWrap, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1) }]}>
              <Ionicons name="scan-outline" size={20} color={uiTokens.colors.accent} />
            </View>
            <Text style={[s.modalTitle, { color: uiTokens.colors.textPrimary }]}>New Session</Text>
            <AppTouchable
              style={[s.modalClose, { backgroundColor: colorWithAlpha(uiTokens.colors.textSecondary, 0.08) }]}
              hitSlop={HIT_SLOP}
              onPress={resetModal}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={uiTokens.colors.textSecondary} />
            </AppTouchable>
          </View>

          {/* Steps indicator */}
          <View style={[s.stepsBar, { borderBottomColor: uiTokens.colors.border }]}>
            {[
              { label: "Location", done: !!locationType },
              { label: "Floor", done: !!selectedFloor },
              { label: "Rack", done: !!rackName.trim() },
            ].map((step, i) => (
              <View key={step.label} style={s.stepItem}>
                <View style={[
                  s.stepDot,
                  {
                    backgroundColor: step.done
                      ? uiTokens.colors.accent
                      : colorWithAlpha(uiTokens.colors.border, 0.8),
                    borderColor: step.done ? uiTokens.colors.accent : uiTokens.colors.border,
                  },
                ]}>
                  {step.done
                    ? <Ionicons name="checkmark" size={10} color={uiTokens.colors.surfaceElevated} />
                    : <Text style={[s.stepNum, { color: uiTokens.colors.textMuted }]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[s.stepLabel, { color: step.done ? uiTokens.colors.accent : uiTokens.colors.textMuted }]}>
                  {step.label}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={s.modalBody}
            keyboardShouldPersistTaps="always"
          >
            {/* Zone chips */}
            <Text style={[s.sectionLabel, { color: uiTokens.colors.textSecondary }]}>Select Location</Text>
            <View style={s.chips}>
              {zones.map((zone) => {
                const active = locationType === zone.zone_name;
                return (
                  <AppTouchable
                    key={zone.id}
                    style={[
                      s.chip,
                      {
                        backgroundColor: active
                          ? colorWithAlpha(uiTokens.colors.accent, 0.12)
                          : uiTokens.colors.surface,
                        borderColor: active ? uiTokens.colors.accent : uiTokens.colors.border,
                      },
                    ]}
                    onPress={() => { setLocationType(zone.zone_name); setSelectedFloor(null); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={active ? "location" : "location-outline"}
                      size={14}
                      color={active ? uiTokens.colors.accent : uiTokens.colors.textSecondary}
                    />
                    <Text style={[s.chipText, { color: active ? uiTokens.colors.accent : uiTokens.colors.textPrimary }]}>
                      {zone.zone_name}
                    </Text>
                  </AppTouchable>
                );
              })}
            </View>

            {/* Floor chips */}
            {locationType && (
              <Animated.View entering={prefersReducedMotion ? undefined : FadeInUp.duration(220)}>
                <Text style={[s.sectionLabel, { color: uiTokens.colors.textSecondary }]}>Select Floor / Area</Text>
                <View style={s.chips}>
                  {warehouses.map((wh) => {
                    const active = selectedFloor === wh.warehouse_name;
                    return (
                      <AppTouchable
                        key={wh.id}
                        style={[
                          s.chip,
                          {
                            backgroundColor: active
                              ? colorWithAlpha(uiTokens.colors.accent, 0.12)
                              : uiTokens.colors.surface,
                            borderColor: active ? uiTokens.colors.accent : uiTokens.colors.border,
                          },
                        ]}
                        onPress={() => setSelectedFloor(wh.warehouse_name)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons
                          name={active ? "layers" : "layers-outline"}
                          size={14}
                          color={active ? uiTokens.colors.accent : uiTokens.colors.textSecondary}
                        />
                        <Text style={[s.chipText, { color: active ? uiTokens.colors.accent : uiTokens.colors.textPrimary }]}>
                          {wh.warehouse_name}
                        </Text>
                      </AppTouchable>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* Rack input */}
            {selectedFloor && (
              <Animated.View entering={prefersReducedMotion ? undefined : FadeInUp.duration(220)}>
                <ModernInput
                  label="Rack / Shelf Number"
                  placeholder="e.g. A-123"
                  value={rackName}
                  onChangeText={setRackName}
                  autoCapitalize="characters"
                />
                {rackName.trim() && (
                  <View style={[s.previewBanner, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.08), borderColor: colorWithAlpha(uiTokens.colors.accent, 0.2) }]}>
                    <Ionicons name="information-circle-outline" size={14} color={uiTokens.colors.accent} />
                    <Text style={[s.previewText, { color: uiTokens.colors.accent }]}>
                      {locationType} › {selectedFloor} › {rackName.trim().toUpperCase()}
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}
          </ScrollView>

          <View style={[s.modalFooter, { borderTopColor: uiTokens.colors.border }]}>
            <ModernButton
              title="Start Session"
              icon="barcode-outline"
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

// ─── Static styles (non-color layout only) ───────────────────────────────────

const createStyles = (t: ReturnType<typeof useUiTokens>) =>
  StyleSheet.create({
    root: { flex: 1 },

    // ── Header ───────────────────────────────────────────────────────────────
    headerActions: { flexDirection: "row", gap: gap.sm, alignItems: "center" },
    iconBtn: {
      width: touch.icon, height: touch.icon, borderRadius: radius.md,
      alignItems: "center", justifyContent: "center",
    },
    badge: {
      position: "absolute", top: -4, right: -4,
      minWidth: 16, height: 16, borderRadius: radius.full,
      paddingHorizontal: 3, alignItems: "center", justifyContent: "center",
    },
    badgeText: { color: t.colors.surfaceElevated, fontSize: font.size.micro, fontWeight: font.weight.bold },

    // ── Summary banner ────────────────────────────────────────────────────────
    summary: {
      marginHorizontal: gap.lg, marginTop: gap.md, marginBottom: gap.md,
      borderRadius: radius.xl, borderWidth: 1, padding: gap.md,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    summaryLeft: { flexDirection: "row", alignItems: "center", gap: gap.md, flex: 1 },
    summaryIconWrap: {
      width: touch.min, height: touch.min,
      borderRadius: radius.lg, alignItems: "center", justifyContent: "center",
    },
    summaryEyebrow: {
      fontSize: font.size.label, fontWeight: font.weight.bold,
      textTransform: "uppercase", letterSpacing: font.tracking.wide,
    },
    summaryTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, marginTop: 2 },
    summaryMetrics: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
    summaryMetric: { paddingHorizontal: gap.md, paddingVertical: gap.sm, alignItems: "center" },
    summaryNum: { fontSize: font.size.display, fontWeight: font.weight.extrabold },
    summaryMeta: { fontSize: font.size.label, fontWeight: font.weight.semibold, marginTop: 2 },
    summaryDivider: { width: 1 },

    // ── Tabs ──────────────────────────────────────────────────────────────────
    tabBar: { flexDirection: "row", paddingHorizontal: gap.lg, gap: gap.sm, marginBottom: gap.sm },
    tab: {
      flex: 1, minHeight: touch.sm,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: gap.xs,
      borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: gap.md,
    },
    tabText: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
    tabBadge: {
      minWidth: 18, height: 18, borderRadius: radius.full,
      paddingHorizontal: gap.xs, alignItems: "center", justifyContent: "center",
    },
    tabBadgeText: { color: t.colors.surfaceElevated, fontSize: font.size.label, fontWeight: font.weight.bold },

    // ── Scroll / list ─────────────────────────────────────────────────────────
    scroll: { paddingHorizontal: gap.lg, paddingBottom: 40 },
    ctaButton: { marginBottom: gap.md },

    // ── Session card ──────────────────────────────────────────────────────────
    sessionCard: { marginBottom: gap.sm },
    sessionCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: gap.sm },
    sessionIconWrap: {
      width: touch.icon, height: touch.icon,
      borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: gap.sm,
    },
    sessionCardMeta: { flex: 1 },
    sessionRack: { fontSize: font.size.md, fontWeight: font.weight.bold, letterSpacing: font.tracking.tight },
    sessionLocation: { fontSize: font.size.caption, marginTop: 2, letterSpacing: font.tracking.normal },

    statusPill: {
      flexDirection: "row", alignItems: "center", gap: gap.xs,
      paddingHorizontal: gap.sm, paddingVertical: 4,
      borderRadius: radius.sm, borderWidth: 1, marginLeft: gap.sm,
    },
    statusDot: { width: 6, height: 6, borderRadius: radius.full },
    statusText: { fontSize: font.size.label, fontWeight: font.weight.bold },

    statsRow: {
      flexDirection: "row", borderRadius: radius.md, borderWidth: 1,
      overflow: "hidden", paddingVertical: gap.sm,
    },
    statCell: { flex: 1, alignItems: "center" },
    statNum: { fontSize: font.size.lg, fontWeight: font.weight.extrabold },
    statLbl: { fontSize: font.size.label, fontWeight: font.weight.semibold, marginTop: 2 },
    statDivider: { width: 1 },

    // ── Empty state ───────────────────────────────────────────────────────────
    empty: { alignItems: "center", justifyContent: "center", paddingVertical: 56 },
    emptyIconWrap: {
      width: 72, height: 72, borderRadius: radius["2xl"],
      alignItems: "center", justifyContent: "center", marginBottom: gap.lg,
    },
    emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold },
    emptyBody: {
      fontSize: font.size.base, marginTop: gap.xs,
      textAlign: "center", lineHeight: font.leading.relaxed, maxWidth: 260,
    },

    // ── Modal ─────────────────────────────────────────────────────────────────
    modal: { flex: 1 },
    modalHeader: {
      flexDirection: "row", alignItems: "center", gap: gap.sm,
      paddingHorizontal: gap.lg, paddingVertical: gap.md, borderBottomWidth: 1,
    },
    modalIconWrap: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    modalTitle: { flex: 1, fontSize: font.size.xl, fontWeight: font.weight.bold },
    modalClose: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },

    // Steps (create session)
    stepsBar: {
      flexDirection: "row", paddingHorizontal: gap.lg, paddingVertical: gap.md, borderBottomWidth: 1,
    },
    stepItem: { flex: 1, alignItems: "center", gap: gap.xs },
    stepDot: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    stepNum: { fontSize: font.size.label, fontWeight: font.weight.bold },
    stepLabel: { fontSize: font.size.label, fontWeight: font.weight.semibold },

    // Modal body
    modalBody: { padding: gap.lg },
    sectionLabel: {
      fontSize: font.size.label, fontWeight: font.weight.bold,
      textTransform: "uppercase", letterSpacing: font.tracking.wide,
      marginBottom: gap.sm, marginTop: gap.lg,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: gap.sm, marginBottom: gap.sm },
    chip: {
      flexDirection: "row", alignItems: "center", gap: gap.xs,
      minHeight: touch.sm, paddingHorizontal: gap.md, paddingVertical: gap.sm,
      borderRadius: radius.md, borderWidth: 1.5,
    },
    chipText: { fontSize: font.size.base, fontWeight: font.weight.semibold },

    previewBanner: {
      flexDirection: "row", alignItems: "center", gap: gap.xs,
      marginTop: gap.sm, padding: gap.sm, borderRadius: radius.sm, borderWidth: 1,
    },
    previewText: { fontSize: font.size.caption, fontWeight: font.weight.semibold },

    modalFooter: {
      padding: gap.lg,
      paddingBottom: Platform.OS === "ios" ? 32 : gap.lg,
      borderTopWidth: 1,
    },
  });

export default StaffHome;
