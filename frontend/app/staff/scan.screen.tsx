/**
 * Modern Scan Screen - Lavanya Mart Stock Verify
 * Clean, efficient scanning interface
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCameraPermissions } from "../../src/services/device/expoCamera";
import * as Haptics from "expo-haptics";
import {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";

import { useSafeAsync } from "../../src/hooks/useSafeAsync";
import { usePerformanceMonitor } from "../../src/hooks/usePerformanceMonitor";
import { useScanSessionStore } from "../../src/store/scanSessionStore";
import { useSettingsStore } from "../../src/store/settingsStore";
import { useWebSocket } from "../../src/hooks/useWebSocket";
import {
  getItemByBarcode,
  searchItems,
  updateSessionStatus,
  checkItemScanStatus,
  getSessionStats,
  SessionStatsResponse,
} from "../../src/services/api/api";
import { RecentItemsService } from "../../src/services/enhancedFeatures";
import { playScanSound } from "../../src/services/scanSoundService";
import { toastService } from "../../src/services/toastService";
import { localDb } from "../../src/db/localDb";
import { validateBarcode } from "../../src/utils/validation";
import { safeBackNavigation } from "@/utils/navigation";
import { dedupeItemsKeepingHighestStock } from "../../src/utils/itemBatchUtils";

import ModernHeader from "../../src/components/ui/ModernHeader";
import ModernButton from "../../src/components/ui/ModernButton";
import { OperationalStatusStrip } from "@/components/ui";
import { FinishRackModal } from "../../src/components/scan/FinishRackModal";
import { ScanCameraOverlay } from "../../src/components/scan/ScanCameraOverlay";
import { ScanLookupPanel, type ScanLookupNotice } from "../../src/components/scan/ScanLookupPanel";
import { ScanStatsCard } from "../../src/components/scan/ScanStatsCard";
import { OperationalSyncBanner } from "@/components/feedback/OperationalSyncBanner";
import { colors, spacing, typography, borderRadius } from "@/theme/legacyCompat";

import { useAuthStore } from "../../src/store/authStore";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, getTokenShadowStyle } from "@/theme/themeTokens";
import { zIndex } from "@/theme/designTokens";
import { flags } from "@/constants/flags";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { operationalMotion } from "@/utils/motion";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";
const SCAN_BUFFER_TIMEOUT = 2000; // 2 seconds
const SCAN_BUFFER_MAX_SIZE = 10;
const SCAN_CONFIDENCE_THRESHOLD = 2;

const ScanScreen = React.memo(function ScanScreen() {
  const router = useRouter();
  const { sessionId: rawSessionId, debugPerf: rawDebugPerf } = useLocalSearchParams();
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  const debugPerf = Array.isArray(rawDebugPerf) ? rawDebugPerf[0] : rawDebugPerf;
  const showPerformanceOverlay = __DEV__ && flags.enableDebugMode && debugPerf === "1";

  const { user, logout, isAuthenticated } = useAuthStore();
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const scannerVibration = useSettingsStore((state) => state.settings.scannerVibration);
  const scannerSound = useSettingsStore((state) => state.settings.scannerSound);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const scannerAutoSubmit = useSettingsStore((state) => state.settings.scannerAutoSubmit);
  const scannerTimeout = useSettingsStore((state) => state.settings.scannerTimeout);
  const lazyLoading = useSettingsStore((state) => state.settings.lazyLoading);
  const debounceDelay = useSettingsStore((state) => state.settings.debounceDelay);
  const [isScreenFocused, setIsScreenFocused] = useState<boolean>(false);

  const { currentFloor, currentRack } = useScanSessionStore();
  const [permission, requestPermission] = useCameraPermissions();
  const { safeSetState, safeAsync } = useSafeAsync();
  const {
    metrics: performanceMetrics,
    startMonitoring,
    stopMonitoring,
    performanceWarning,
  } = usePerformanceMonitor({
    sampleInterval: 2000,
    performanceThreshold: 25,
  });

  // WebSocket Integration
  const { lastMessage } = useWebSocket(sessionId ? String(sessionId) : undefined, isScreenFocused);

  // State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, debounceDelay);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [lookupNotice, setLookupNotice] = useState<ScanLookupNotice | null>(null);
  const [lastLookupBarcode, setLastLookupBarcode] = useState<string>("");
  const [sessionStats, setSessionStats] = useState<SessionStatsResponse>({
    id: String(sessionId ?? ""),
    scannedItems: 0,
    verifiedItems: 0,
    pendingItems: 0,
    totalItems: 0,
  });
  const [showCloseSessionModal, setShowCloseSessionModal] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const hasValidSessionId = typeof sessionId === "string" && sessionId.trim().length > 0;
  const scanVisualV2Enabled = flags.uiVisualSystemV2 && flags.uiScanV2;
  const scanLocationLabel = [currentFloor, currentRack].filter(Boolean).join(" • ");

  // Animation values for scan frame
  const scanLinePosition = useSharedValue(0);
  const cornerOpacity = useSharedValue(1);

  const scanBufferRef = useRef<{ code: string; count: number; timestamp: number }[]>([]);
  const activeScanLookupMarkRef = useRef<string | null>(null);

  const loadRecentItems = useCallback(async () => {
    try {
      const items = await safeAsync(() => RecentItemsService.getRecentItems());
      if (items) {
        safeSetState(setRecentItems, items);
      }
    } catch (error) {
      console.error("Failed to load recent items", error);
    }
  }, [safeAsync, safeSetState]);

  const loadSessionStats = useCallback(async () => {
    if (!sessionId || !isAuthenticated) return;
    try {
      const stats = offlineMode
        ? await safeAsync(() => localDb.getSessionStats(sessionId))
        : await safeAsync(() => getSessionStats(sessionId));
      if (stats) {
        safeSetState(setSessionStats, {
          id: String(sessionId),
          ...stats,
        });
      }
    } catch (error) {
      console.error("Failed to load stats", error);
    }
  }, [isAuthenticated, offlineMode, safeAsync, safeSetState, sessionId]);

  const performSearch = useCallback(
    async (query: string) => {
      try {
        if (offlineMode) {
          const localResults = await safeAsync(() => localDb.searchItems(query));
          if (localResults) {
            safeSetState(setSearchResults, dedupeItemsKeepingHighestStock(localResults));
          }
          return;
        }

        const results = await safeAsync(() => searchItems(query));
        if (results) {
          const items = Array.isArray(results.items) ? results.items : [];
          safeSetState(setSearchResults, dedupeItemsKeepingHighestStock(items));
        }
      } catch (error) {
        console.error("Search failed", error);
      }
    },
    [offlineMode, safeAsync, safeSetState]
  );

  const loadInitialData = useCallback(async () => {
    safeSetState(setInitialLoading, true);
    await Promise.all([loadRecentItems(), loadSessionStats()]);
    safeSetState(setInitialLoading, false);
  }, [loadRecentItems, loadSessionStats, safeSetState]);

  const onRefresh = useCallback(async () => {
    safeSetState(setRefreshing, true);
    if (scannerVibration) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await Promise.all([loadRecentItems(), loadSessionStats()]);
    safeSetState(setRefreshing, false);
  }, [loadRecentItems, loadSessionStats, safeSetState, scannerVibration]);

  // Animated scan line
  useEffect(() => {
    if (prefersReducedMotion) {
      scanLinePosition.value = 0;
      cornerOpacity.value = 1;
      return;
    }

    if (isScanning) {
      scanLinePosition.value = withRepeat(
        withTiming(1, { duration: operationalMotion.slow }),
        -1,
        true
      );
      cornerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: operationalMotion.slow }),
          withTiming(1, { duration: operationalMotion.slow })
        ),
        -1,
        false
      );
    }
  }, [cornerOpacity, isScanning, prefersReducedMotion, scanLinePosition]);

  const animatedScanLine = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLinePosition.value * 200 }],
  }));

  const animatedCorners = useAnimatedStyle(() => ({
    opacity: cornerOpacity.value,
  }));

  // Handle WebSocket Messages
  useEffect(() => {
    if (lastMessage?.type === "session_update") {
      const status = String(lastMessage.payload?.status || "").toUpperCase();
      const reason = lastMessage.payload?.reason;

      if (status === "PAUSED") {
        safeSetState(setIsScanning, false);
        Alert.alert("Session Paused", reason || "A supervisor has paused this session.", [
          { text: "OK" },
        ]);
      } else if (["REVIEW", "RECONCILE", "FINALIZED", "CLOSED"].includes(status) && !isFinishing) {
        const message =
          status === "FINALIZED"
            ? reason || "This session has been finalized."
            : reason || "This session has been submitted for supervisor review.";
        Alert.alert(status === "FINALIZED" ? "Session Finalized" : "Session Submitted", message, [
          {
            text: "OK",
            onPress: () => router.replace("/staff/home"),
          },
        ]);
      }

      // Refresh stats on any update
      loadSessionStats();
    }
  }, [isFinishing, lastMessage, loadSessionStats, router, safeSetState]);

  // Start performance monitoring when component mounts
  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
  }, [startMonitoring, stopMonitoring]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
      };
    }, [])
  );

  // Canonical startup path: initial load + periodic stat refresh
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        return undefined;
      }

      void loadInitialData();
      const interval = setInterval(() => {
        void loadSessionStats();
      }, 30000);

      return () => clearInterval(interval);
    }, [isAuthenticated, loadInitialData, loadSessionStats])
  );

  // Search effect with proper cleanup
  useEffect(() => {
    if (debouncedSearchQuery.trim().length > 2) {
      performSearch(debouncedSearchQuery);
    } else {
      safeSetState(setSearchResults, []);
    }
  }, [debouncedSearchQuery, performSearch, safeSetState]);

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scanned) return;

    const now = Date.now();
    const trimmedData = data.trim();

    // Buffer logic
    scanBufferRef.current = scanBufferRef.current.filter(
      (entry) => now - entry.timestamp < SCAN_BUFFER_TIMEOUT
    );

    const existingIndex = scanBufferRef.current.findIndex((entry) => entry.code === trimmedData);

    if (existingIndex >= 0) {
      scanBufferRef.current[existingIndex]!.count += 1;
      scanBufferRef.current[existingIndex]!.timestamp = now;
    } else {
      scanBufferRef.current.push({
        code: trimmedData,
        count: 1,
        timestamp: now,
      });
    }

    if (scanBufferRef.current.length > SCAN_BUFFER_MAX_SIZE) {
      scanBufferRef.current = scanBufferRef.current.slice(-SCAN_BUFFER_MAX_SIZE);
    }

    const confident = scanBufferRef.current.find(
      (entry) => entry.count >= SCAN_CONFIDENCE_THRESHOLD
    );

    if (!confident) {
      operationalTelemetry.trackScanner(
        OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_BUFFERED,
        "pending",
        {
          barcode: trimmedData,
          source: "camera",
          offlineMode,
        },
        {
          bufferSize: scanBufferRef.current.length,
        }
      );
      if (scannerVibration) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }

    safeSetState(setScanned, true);
    operationalTelemetry.trackScanner(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_CAPTURED,
      "success",
      {
        barcode: confident.code,
        source: "camera",
        offlineMode,
        autoSubmit: scannerAutoSubmit,
      },
      {
        confidenceCount: confident.count,
      }
    );
    activeScanLookupMarkRef.current = operationalTelemetry.markStart({
      name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
      category: "scanner",
      surface: "staff_scan",
      tags: {
        barcode: confident.code,
        source: "camera",
        offlineMode,
        autoSubmit: scannerAutoSubmit,
      },
    });
    scanBufferRef.current = [];
    if (scannerVibration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    void playScanSound("capture", scannerSound);
    safeSetState(setIsScanning, false);
    safeSetState(setSearchQuery, confident.code);

    if (scannerAutoSubmit) {
      await handleLookup(confident.code);
      return;
    }

    toastService.show("Scan captured. Review and submit when ready.", {
      type: "info",
    });
    safeSetState(setScanned, false);
  };

  const handleLookup = async (barcode: string) => {
    if (loading) return;
    const lookupValue = barcode.trim();
    const lookupMark =
      activeScanLookupMarkRef.current ||
      operationalTelemetry.markStart({
        name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_LOOKUP_COMPLETED,
        category: "scanner",
        surface: "staff_scan",
        tags: {
          barcode: lookupValue,
          source: "manual_or_list",
          offlineMode,
        },
      });
    activeScanLookupMarkRef.current = null;
    safeSetState(setLastLookupBarcode, lookupValue);
    safeSetState(setLookupNotice, null);
    const validation = validateBarcode(lookupValue);
    if (!validation.valid) {
      void playScanSound("error", scannerSound);
      operationalTelemetry.markEnd(lookupMark, "invalid", {
        barcode: lookupValue,
        reason: validation.error || "invalid_barcode",
      });
      safeSetState(setLookupNotice, {
        message: `${validation.error || "The barcode format is not valid."} Check the label, edit the code, or scan again before continuing.`,
        title: "Barcode not accepted",
        type: "warning",
      });
      safeSetState(setScanned, false);
      return;
    }

    safeSetState(setLoading, true);
    try {
      let item: any;

      // OPTIMISTIC STRATEGY: Try Local DB first for instant response
      try {
        item = await safeAsync(() => localDb.getItemByBarcode(validation.value!));
      } catch {
        // Ignore local db error, fall through to API
      }

      // If not found locally, use the API unless offline mode is enabled.
      if (!item && !offlineMode) {
        try {
          item = await safeAsync(() => getItemByBarcode(validation.value!));
        } catch (e) {
          throw e;
        }
      }

      if (item) {
        await safeAsync(() => RecentItemsService.addRecent(item.item_code, item));
        await loadRecentItems();

        if (!offlineMode) {
          // Check for duplicates only when live validation is enabled.
          try {
            const scanStatus = await safeAsync(() =>
              checkItemScanStatus(sessionId!, item.item_code)
            );
            if (scanStatus?.scanned) {
              const locations = scanStatus.locations || [];
              const duplicateInLocation = locations.find(
                (loc: any) => loc.floor_no === currentFloor && loc.rack_no === currentRack
              );

              if (duplicateInLocation) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                void playScanSound("warning", scannerSound);
                safeSetState(setLoading, false);
                safeSetState(setScanned, false);
                operationalTelemetry.markEnd(lookupMark, "duplicate", {
                  barcode: item.barcode || validation.value,
                  duplicateLocation: true,
                });
                Alert.alert(
                  "Duplicate Scan",
                  `Item already counted here by ${duplicateInLocation.counted_by}.\nQty: ${duplicateInLocation.counted_qty}`,
                  [
                    {
                      text: "Cancel",
                      style: "cancel",
                    },
                    {
                      text: "Verify / Update",
                      onPress: () => navigateToDetail(item.barcode || validation.value!),
                    },
                  ]
                );
                return;
              } else {
                toastService.show(`Item found in ${locations.length} other location(s)`, {
                  type: "info",
                });
              }
            }
          } catch (_error) {
            // Ignore check status error
          }
        }

        safeSetState(setLookupNotice, null);
        operationalTelemetry.markEnd(lookupMark, "success", {
          barcode: item.barcode || validation.value,
          itemCode: item.item_code,
          offlineMode,
        });
        navigateToDetail(item.barcode || validation.value!);
      } else {
        void playScanSound("warning", scannerSound);
        operationalTelemetry.markEnd(lookupMark, offlineMode ? "offline" : "not_found", {
          barcode: validation.value,
          offlineMode,
        });
        safeSetState(setLookupNotice, {
          actionLabel: offlineMode ? undefined : "Retry lookup",
          message: offlineMode
            ? `Code ${validation.value} is not stored on this device. Reconnect or sync before continuing, or verify the label with a supervisor.`
            : `No item matched ${validation.value}. Check the label, rescan, or retry the lookup before entering a count.`,
          title: offlineMode ? "Item not in offline cache" : "Item not found",
          type: "warning",
        });
      }
    } catch (error: any) {
      void playScanSound("error", scannerSound);
      const reason = error?.message || "The lookup request did not finish.";
      operationalTelemetry.markEnd(lookupMark, "failure", {
        barcode: lookupValue,
        error: reason,
        offlineMode,
      });
      safeSetState(setLookupNotice, {
        actionLabel: "Retry lookup",
        message: `${reason} Your scan was not submitted. Retry lookup or rescan the item.`,
        title: "Lookup failed",
        type: "error",
      });
    } finally {
      safeSetState(setLoading, false);
      safeSetState(setScanned, false);
    }
  };

  const navigateToDetail = (barcode: string) => {
    safeSetState(setSearchQuery, "");
    router.push({
      pathname: "/staff/item-detail",
      params: { barcode, sessionId: sessionId! },
    } as any);
  };

  const handleFinishRack = async () => {
    if (!sessionId) return;
    const mark = operationalTelemetry.markStart({
      name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.WORKFLOW_ACTION,
      category: "workflow",
      surface: "staff_scan",
      tags: {
        command: "finish_rack",
        sessionId,
        offlineMode,
      },
    });
    safeSetState(setIsFinishing, true);
    try {
      await safeAsync(() => updateSessionStatus(sessionId, "reconcile"));
      operationalTelemetry.markEnd(mark, "success", undefined, {
        totalItems: sessionStats.totalItems,
        verifiedItems: sessionStats.verifiedItems,
        pendingItems: sessionStats.pendingItems,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/staff/home");
    } catch (error: any) {
      operationalTelemetry.markEnd(mark, "failure", {
        error: error?.message || "finish_rack_failed",
      });
      Alert.alert(
        "Finish Rack Failed",
        `${error.message || "This session could not be submitted for supervisor review."}\n\nYour counts remain in this rack session. Check connectivity and retry.`
      );
    } finally {
      safeSetState(setIsFinishing, false);
      safeSetState(setShowCloseSessionModal, false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Confirm Logout", "Are you sure you want to log out ending your session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            if (sessionId) {
              // Optional: updateSessionStatus(sessionId, "paused");
            }
            await logout();
            router.replace("/welcome");
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  if (!hasValidSessionId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
        edges={["top"]}
      >
        <ModernHeader
          title="Scan Session Required"
          subtitle="Open scan from an active count session"
          showBackButton
          showSettingsButton={false}
          onBackPress={() => router.replace("/staff/home")}
        />
        <View style={styles.missingSessionContainer}>
          <View
            style={[
              styles.missingSessionCard,
              {
                backgroundColor: uiTokens.colors.surface,
                borderColor: uiTokens.colors.border,
              },
              scanVisualV2Enabled ? getTokenShadowStyle(uiTokens, "sm") : null,
            ]}
          >
            <Ionicons name="alert-circle-outline" size={32} color={uiTokens.colors.warning} />
            <Text style={[styles.missingSessionTitle, { color: uiTokens.colors.textPrimary }]}>
              Session link is incomplete
            </Text>
            <Text style={[styles.missingSessionBody, { color: uiTokens.colors.textSecondary }]}>
              This scan screen needs a valid session link. Start a new session or resume one from
              Staff Home.
            </Text>
            <View style={styles.missingSessionActions}>
              <ModernButton
                title="Open Staff Home"
                onPress={() => router.replace("/staff/home")}
                variant="primary"
                fullWidth
                style={{
                  backgroundColor: uiTokens.colors.accent,
                  borderColor: uiTokens.colors.accent,
                }}
              />
              {flags.uiAuthRedirectV2 && (
                <ModernButton
                  title="Go to Login"
                  onPress={() => router.replace("/login")}
                  variant="outline"
                  fullWidth
                />
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isScanning) {
    return (
      <ScanCameraOverlay
        animatedCorners={animatedCorners}
        animatedScanLine={animatedScanLine}
        onBarcodeScanned={handleBarcodeScan}
        onClose={() => safeSetState(setIsScanning, false)}
        permission={permission}
        requestPermission={requestPermission}
        scanned={scanned}
        timeoutSeconds={scannerTimeout}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top"]}
    >
      <ModernHeader
        title="Scan Rack"
        subtitle={scanLocationLabel || user?.full_name || "Staff session"}
        showBackButton={false}
        showSettingsButton={false}
        onBackPress={() => safeBackNavigation(router, { userRole: "staff" })}
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutButton}
              accessibilityLabel="Log out"
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={24} color={uiTokens.colors.accent} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        bounces={true}
        alwaysBounceVertical={true}
        removeClippedSubviews={lazyLoading}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={uiTokens.colors.accent}
            colors={[uiTokens.colors.accent]}
          />
        }
      >
        <View style={styles.pageSection}>
          <View style={styles.sectionIntro}>
            <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>Scan with confidence</Text>
            <Text style={[styles.sectionSubtitle, { color: uiTokens.colors.textSecondary }]}>Tap the scanner or enter a barcode to locate the item and verify counts. Finish the rack when all items are confirmed.</Text>
          </View>

          <OperationalStatusStrip
            compact
            offline={offlineMode}
            syncState={refreshing ? "Refreshing" : offlineMode ? "Queued" : "Ready"}
            pendingQueueCount={sessionStats.pendingItems}
            scannerReady={!loading && !initialLoading && (Platform.OS === "web" || Boolean(permission?.granted))}
            uploadBacklog={offlineMode ? sessionStats.pendingItems : 0}
            deviceConnectivity={lastMessage ? "Live" : isScreenFocused ? "Ready" : "Idle"}
            runtimeHealth={performanceWarning ? "Degraded" : "Stable"}
            items={[
              {
                id: "scan-total",
                label: "Total",
                value: sessionStats.totalItems,
                tone: "info",
                icon: "cube-outline",
              },
              {
                id: "scan-verified",
                label: "Verified",
                value: sessionStats.verifiedItems,
                tone: "success",
                icon: "checkmark-done-outline",
              },
            ]}
            testID="staff-scan-operational-status-strip"
          />

          {offlineMode ? (
            <OperationalSyncBanner
              compact
              tone="offline"
              title="Offline counting enabled"
              message="Scans and count changes stay on this device until sync is available. Confirm pending work before finishing the rack."
              style={styles.syncBanner}
            />
          ) : null}

          <ScanStatsCard initialLoading={initialLoading} sessionStats={sessionStats} />
        </View>

        <View style={styles.pageSection}>
          <ScanLookupPanel
            initialLoading={initialLoading}
            loading={loading}
            recentItems={recentItems}
            searchQuery={searchQuery}
            searchResults={searchResults}
            notice={lookupNotice}
            onChangeSearchQuery={(value) => {
              if (lookupNotice) {
                safeSetState(setLookupNotice, null);
              }
              safeSetState(setSearchQuery, value);
            }}
            onClearSearchQuery={() => {
              safeSetState(setLookupNotice, null);
              safeSetState(setSearchQuery, "");
            }}
            onDismissNotice={() => safeSetState(setLookupNotice, null)}
            onOpenScanner={() => {
              safeSetState(setLookupNotice, null);
              operationalTelemetry.trackScanner(
                OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_CAPTURED,
                "pending",
                {
                  source: "open_camera",
                  offlineMode,
                }
              );
              safeSetState(setIsScanning, true);
            }}
            onPressItem={(item) => {
              const code = item.barcode || item.item_code;
              if (code) {
                handleLookup(code);
              }
            }}
            onSubmitSearch={() => {
              if (!searchQuery.trim()) return;
              if (scannerVibration) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              handleLookup(searchQuery.trim());
            }}
            onRetryNotice={() => {
              const code = lastLookupBarcode || searchQuery.trim();
              if (code) {
                handleLookup(code);
              }
            }}
          />
        </View>

        <View style={styles.footerSpacer} />
      </ScrollView>

      {/* Bottom Action */}
      <View
        style={[
          styles.bottomContainer,
          {
            backgroundColor: uiTokens.colors.surface,
            borderTopColor: uiTokens.colors.border,
          },
          scanVisualV2Enabled ? getTokenShadowStyle(uiTokens, "sm") : null,
        ]}
      >
        <ModernButton
          title="Finish Rack"
          onPress={() => safeSetState(setShowCloseSessionModal, true)}
          variant="primary"
          icon="checkmark-circle"
          fullWidth
          style={{
            backgroundColor: uiTokens.colors.accent,
            borderColor: uiTokens.colors.accent,
          }}
        />
      </View>

      <FinishRackModal
        currentFloor={currentFloor}
        currentRack={currentRack}
        isFinishing={isFinishing}
        onClose={() => safeSetState(setShowCloseSessionModal, false)}
        onConfirm={handleFinishRack}
        sessionStats={sessionStats}
        visible={showCloseSessionModal}
      />

      {loading && (
        <View
          style={[
            styles.loadingOverlay,
            styles.pointerEventsNone,
            {
              backgroundColor: colorWithAlpha(uiTokens.colors.surface, uiTokens.mode === "dark" ? 0.88 : 0.92),
            },
          ]}
        >
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
        </View>
      )}

      {/* Performance Monitor Overlay */}
      {showPerformanceOverlay && (
        <View
          style={[
            styles.performanceOverlay,
            performanceWarning ? styles.performancePoor : styles.performanceGood,
            { backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.95) },
          ]}
        >
          <Text style={[styles.performanceText, { color: uiTokens.colors.textPrimary }]}>FPS: {performanceMetrics.fps ?? "--"}</Text>
        </View>
      )}
    </SafeAreaView>
  );
});

export default ScanScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 140,
  },
  footerSpacer: {
    height: spacing.lg,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: Platform.OS === "ios" ? 34 : spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  pageSection: {
    marginBottom: spacing.lg,
  },
  sectionIntro: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  syncBanner: {
    marginTop: spacing.sm,
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colorWithAlpha(colors.white, 0.9),
    justifyContent: "center",
    alignItems: "center",
    zIndex: zIndex.overlay,
  },
  pointerEventsNone: {
    pointerEvents: "none",
  },
  performanceOverlay: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: colorWithAlpha(colors.black, 0.7),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    zIndex: zIndex.tooltip,
  },
  performanceText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  performanceGood: {
    backgroundColor: colorWithAlpha(colors.success[500], 0.8),
  },
  performancePoor: {
    backgroundColor: colorWithAlpha(colors.error[500], 0.8),
  },
  missingSessionContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  missingSessionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  missingSessionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    textAlign: "center",
  },
  missingSessionBody: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 22,
  },
  missingSessionActions: {
    width: "100%",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
