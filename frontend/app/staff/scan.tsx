/**
 * Modern Scan Screen - Lavanya Mart Stock Verify
 * Clean, efficient scanning interface
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCameraPermissions } from "@/services/device/expoCamera";
import { haptics } from "@/services/haptics";
import {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";

import { useSafeAsync } from "@/hooks/useSafeAsync";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  getItemByBarcode,
  searchItems,
  updateSessionStatus,
  checkItemScanStatus,
  getSessionStats,
  SessionStatsResponse,
} from "@/services/api/api";
import { RecentItemsService } from "@/services/enhancedFeatures";
import { playScanSound } from "@/services/scanSoundService";
import { toastService } from "@/services/toastService";
import { forceSync, getSyncStatus } from "@/services/syncService";
import { localDb } from "@/db/localDb";
import { validateBarcode } from "@/utils/validation";
import { safeBackNavigation } from "@/utils/navigation";
import { dedupeItemsKeepingHighestStock } from "@/utils/itemBatchUtils";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import { SyncStatusPill } from "@/components/ui/SyncStatusPill";
import { FinishRackModal } from "@/components/scan/FinishRackModal";
import { ScanCameraOverlay } from "@/components/scan/ScanCameraOverlay";
import { ScanLookupPanel, type ScanLookupNotice } from "@/components/scan/ScanLookupPanel";
import { ScanStatsCard } from "@/components/scan/ScanStatsCard";
import { ScanMissingSession } from "@/components/scan/ScanMissingSession";
import { styles } from "@/styles/screens/Scan.styles";

import { useAuthStore } from "@/store/authStore";

import { useUiTokens } from "@/hooks/useUiTokens";
import { getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
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
  // Synchronous in-flight guard for item selection — prevents a double-tap from
  // entering handleSelectLookupItem twice before the async `loading` state lands.
  const selectInFlightRef = useRef(false);

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
      void haptics.light();
    }
    await Promise.all([loadRecentItems(), loadSessionStats()]);
    safeSetState(setRefreshing, false);
  }, [loadRecentItems, loadSessionStats, safeSetState, scannerVibration]);

  // Animated scan line
  useEffect(() => {
    if (isScanning) {
      scanLinePosition.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      cornerOpacity.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 1000 }), withTiming(1, { duration: 1000 })),
        -1,
        false
      );
    }
  }, [cornerOpacity, isScanning, scanLinePosition]);

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
      // Release the selection guard when returning to this screen (e.g. back
      // from item-detail) so the next item can be opened.
      selectInFlightRef.current = false;
      safeSetState(setLoading, false);
      return () => {
        setIsScreenFocused(false);
      };
    }, [safeSetState])
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
      if (scannerVibration) {
        void haptics.light();
      }
      return;
    }

    safeSetState(setScanned, true);
    scanBufferRef.current = [];
    if (scannerVibration) {
      void haptics.success();
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
    safeSetState(setLastLookupBarcode, lookupValue);
    safeSetState(setLookupNotice, null);
    const validation = validateBarcode(lookupValue);
    if (!validation.valid) {
      void playScanSound("error", scannerSound);
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
                void haptics.warning();
                void playScanSound("warning", scannerSound);
                safeSetState(setLoading, false);
                safeSetState(setScanned, false);
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
        navigateToDetail(item.barcode || validation.value!);
      } else {
        void playScanSound("warning", scannerSound);
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

  const getLookupItemIdentifier = (item: any): string | null => {
    const candidates = [
      item?.barcode,
      item?.manual_barcode,
      item?.unit2_barcode,
      item?.unit_m_barcode,
      item?.item_code,
      item?.id,
      item?._id,
    ];

    for (const candidate of candidates) {
      const value = String(candidate ?? "").trim();
      if (value) return value;
    }

    return null;
  };

  const handleSelectLookupItem = async (item: any) => {
    // Atomic guard: the ref is set synchronously before any await, so a rapid
    // second tap is rejected even before the `loading` state update lands.
    if (loading || selectInFlightRef.current) return;

    const identifier = getLookupItemIdentifier(item);
    if (!identifier) {
      safeSetState(setLookupNotice, {
        message: "This search result is missing an item code or barcode. Try searching again.",
        title: "Item cannot be opened",
        type: "warning",
      });
      return;
    }

    selectInFlightRef.current = true;
    safeSetState(setLoading, true);
    safeSetState(setLookupNotice, null);
    safeSetState(setSearchResults, []);
    safeSetState(setSearchQuery, "");

    try {
      if (item?.item_code) {
        await safeAsync(() => RecentItemsService.addRecent(item.item_code, item));
        await loadRecentItems();
      }
      // Navigate while the guard is still held so the tap area never re-enables
      // between clearing `loading` and pushing the detail screen.
      navigateToDetail(identifier);
    } catch {
      // Recent items are best-effort; release the guard so the user can retry.
      selectInFlightRef.current = false;
      safeSetState(setLoading, false);
    }
  };

  const handleFinishRack = async () => {
    if (!sessionId) return;
    safeSetState(setIsFinishing, true);
    try {
      // Push locally queued counts before finalizing; completing a session
      // while counts sit in the offline queue strands them in REVIEW with
      // missing data.
      const syncStatus = await getSyncStatus();
      if (syncStatus.needsSync) {
        await forceSync();
        const afterSync = await getSyncStatus();
        if (afterSync.needsSync) {
          Alert.alert(
            "Counts Not Yet Uploaded",
            `${afterSync.queuedOperations} count(s) are still waiting to sync. ` +
              "Finish Rack was cancelled so no data is lost — check connectivity and retry."
          );
          return;
        }
      }
      await safeAsync(() => updateSessionStatus(sessionId, "reconcile"));
      void haptics.success();
      router.replace("/staff/home");
    } catch (error: any) {
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
    return <ScanMissingSession />;
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
        <View style={styles.statusRow}>
          <SyncStatusPill />
        </View>

        <ScanStatsCard initialLoading={initialLoading} sessionStats={sessionStats} />

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
            safeSetState(setIsScanning, true);
          }}
          onPressItem={(item) => {
            void handleSelectLookupItem(item);
          }}
          onSubmitSearch={() => {
            if (!searchQuery.trim()) return;
            if (scannerVibration) {
              void haptics.light();
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
              backgroundColor:
                uiTokens.mode === "dark" ? "rgba(17,24,39,0.75)" : "rgba(255,255,255,0.88)",
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
          ]}
        >
          <Text style={styles.performanceText}>FPS: {performanceMetrics.fps ?? "--"}</Text>
        </View>
      )}
    </SafeAreaView>
  );
});

export default ScanScreen;
