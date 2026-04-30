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
  Easing,
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
import { dedupeItemsKeepingHighestStock } from "../../src/utils/itemBatchUtils";

import ModernHeader from "../../src/components/ui/ModernHeader";
import ModernButton from "../../src/components/ui/ModernButton";
import { SyncStatusPill } from "../../src/components/ui/SyncStatusPill";
import { FinishRackModal } from "../../src/components/scan/FinishRackModal";
import { ScanCameraOverlay } from "../../src/components/scan/ScanCameraOverlay";
import { ScanLookupPanel } from "../../src/components/scan/ScanLookupPanel";
import { ScanStatsCard } from "../../src/components/scan/ScanStatsCard";
import {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
} from "../../src/theme/modernDesign";

import { useAuthStore } from "../../src/store/authStore";

const SCAN_BUFFER_TIMEOUT = 2000; // 2 seconds
const SCAN_BUFFER_MAX_SIZE = 10;
const SCAN_CONFIDENCE_THRESHOLD = 2;
const SURFACE_BG = "#f4f7f6";
const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecf7f4";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

const ScanScreen = React.memo(function ScanScreen() {
  const router = useRouter();
  const { sessionId: rawSessionId } = useLocalSearchParams();
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]
    : rawSessionId;

  const { user, logout, isAuthenticated } = useAuthStore();
  const scannerVibration = useSettingsStore(
    (state) => state.settings.scannerVibration,
  );
  const scannerSound = useSettingsStore((state) => state.settings.scannerSound);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const scannerAutoSubmit = useSettingsStore(
    (state) => state.settings.scannerAutoSubmit,
  );
  const scannerTimeout = useSettingsStore(
    (state) => state.settings.scannerTimeout,
  );
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
  const { lastMessage } = useWebSocket(
    sessionId ? String(sessionId) : undefined,
    isScreenFocused,
  );

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
  const [sessionStats, setSessionStats] = useState<SessionStatsResponse>({
    id: String(sessionId ?? ""),
    scannedItems: 0,
    verifiedItems: 0,
    pendingItems: 0,
    totalItems: 0,
  });
  const [showCloseSessionModal, setShowCloseSessionModal] =
    useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);

  // Animation values for scan frame
  const scanLinePosition = useSharedValue(0);
  const cornerOpacity = useSharedValue(1);

  const scanBufferRef = useRef<
    { code: string; count: number; timestamp: number }[]
  >([]);

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
            safeSetState(
              setSearchResults,
              dedupeItemsKeepingHighestStock(localResults),
            );
          }
          return;
        }

        const results = await safeAsync(() => searchItems(query));
        if (results) {
          const items = Array.isArray(results.items) ? results.items : [];
          safeSetState(
            setSearchResults,
            dedupeItemsKeepingHighestStock(items),
          );
        }
      } catch (error) {
        console.error("Search failed", error);
      }
    },
    [offlineMode, safeAsync, safeSetState],
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
    if (isScanning) {
      scanLinePosition.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      cornerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1,
        false,
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
        Alert.alert(
          "Session Paused",
          reason || "A supervisor has paused this session.",
          [{ text: "OK" }],
        );
      } else if (["REVIEW", "RECONCILE", "FINALIZED", "CLOSED"].includes(status) && !isFinishing) {
        const message =
          status === "FINALIZED"
            ? reason || "This session has been finalized."
            : reason || "This session has been submitted for supervisor review.";
        Alert.alert(
          status === "FINALIZED" ? "Session Finalized" : "Session Submitted",
          message,
          [
            {
              text: "OK",
              onPress: () => router.replace("/staff/home"),
            },
          ],
        );
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
    }, []),
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
    }, [isAuthenticated, loadInitialData, loadSessionStats]),
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
      (entry) => now - entry.timestamp < SCAN_BUFFER_TIMEOUT,
    );

    const existingIndex = scanBufferRef.current.findIndex(
      (entry) => entry.code === trimmedData,
    );

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
      scanBufferRef.current =
        scanBufferRef.current.slice(-SCAN_BUFFER_MAX_SIZE);
    }

    const confident = scanBufferRef.current.find(
      (entry) => entry.count >= SCAN_CONFIDENCE_THRESHOLD,
    );

    if (!confident) {
      if (scannerVibration) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }

    safeSetState(setScanned, true);
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
    const validation = validateBarcode(barcode);
    if (!validation.valid) {
      void playScanSound("error", scannerSound);
      Alert.alert("Invalid Barcode", validation.error || "Please try again");
      safeSetState(setScanned, false);
      return;
    }

    safeSetState(setLoading, true);
    try {
      let item: any;

      // OPTIMISTIC STRATEGY: Try Local DB first for instant response
      try {
        item = await safeAsync(() =>
          localDb.getItemByBarcode(validation.value!),
        );
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
        await safeAsync(() =>
          RecentItemsService.addRecent(item.item_code, item),
        );
        await loadRecentItems();

        if (!offlineMode) {
          // Check for duplicates only when live validation is enabled.
          try {
            const scanStatus = await safeAsync(() =>
              checkItemScanStatus(sessionId!, item.item_code),
            );
            if (scanStatus?.scanned) {
              const locations = scanStatus.locations || [];
              const duplicateInLocation = locations.find(
                (loc: any) =>
                  loc.floor_no === currentFloor && loc.rack_no === currentRack,
              );

              if (duplicateInLocation) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Warning,
                );
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
                      onPress: () =>
                        navigateToDetail(item.barcode || validation.value!),
                    },
                  ],
                );
                return;
              } else {
                toastService.show(
                  `Item found in ${locations.length} other location(s)`,
                  {
                    type: "info",
                  },
                );
              }
            }
          } catch (_error) {
            // Ignore check status error
          }
        }

        navigateToDetail(item.barcode || validation.value!);
      } else {
        void playScanSound("warning", scannerSound);
        Alert.alert(
          "Not Found",
          offlineMode
            ? "Offline mode is enabled, and this item is not available in local cache."
            : "Item not found in database",
        );
      }
    } catch (error: any) {
      void playScanSound("error", scannerSound);
      Alert.alert("Error", error.message || "Failed to lookup item");
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
    safeSetState(setIsFinishing, true);
    try {
      await safeAsync(() => updateSessionStatus(sessionId, "reconcile"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/staff/home");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to submit session for review");
    } finally {
      safeSetState(setIsFinishing, false);
      safeSetState(setShowCloseSessionModal, false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out ending your session?",
      [
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
          }
        }
      ]
    );
  };

  const locationLabel = [currentFloor, currentRack].filter(Boolean).join(" • ");
  const sessionLabel = sessionId
    ? String(sessionId).slice(0, 8).toUpperCase()
    : "LOCAL";

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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ModernHeader
        title="Scan items"
        subtitle={locationLabel || "Active session"}
        showBackButton={false}
        onBackPress={() => router.back()}
        showSettingsButton={false}
        style={styles.headerShell}
        rightComponent={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SyncStatusPill />
            <TouchableOpacity onPress={handleLogout} style={{ padding: 4 }}>
              <Ionicons name="log-out-outline" size={24} color={ACCENT} />
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
            tintColor={colors.primary[600]}
            colors={[colors.primary[600]]}
          />
        }
      >
        <View style={styles.sessionHero}>
          <View style={styles.sessionHeroHeader}>
            <View style={styles.sessionHeroCopy}>
              <Text style={styles.sessionHeroKicker}>Active session</Text>
              <Text style={styles.sessionHeroTitle}>Ready to capture counts</Text>
              <Text style={styles.sessionHeroText}>
                Use the scanner for fast capture or search manually when a label
                is unclear. All counts stay tied to the current floor and rack.
              </Text>
            </View>
            <View style={styles.sessionBadge}>
              <Ionicons name="radio-outline" size={14} color={ACCENT} />
              <Text style={styles.sessionBadgeText}>{sessionLabel}</Text>
            </View>
          </View>

          <View style={styles.sessionMetaRow}>
            <View style={styles.sessionMetaChip}>
              <Ionicons name="layers-outline" size={16} color={ACCENT} />
              <Text style={styles.sessionMetaText}>
                {currentFloor || "Floor pending"}
              </Text>
            </View>
            <View style={styles.sessionMetaChip}>
              <Ionicons name="grid-outline" size={16} color={ACCENT} />
              <Text style={styles.sessionMetaText}>
                {currentRack || "Rack pending"}
              </Text>
            </View>
            <View style={styles.sessionMetaChip}>
              <Ionicons
                name={offlineMode ? "cloud-offline-outline" : "sync-outline"}
                size={16}
                color={offlineMode ? colors.warning[600] : ACCENT}
              />
              <Text style={styles.sessionMetaText}>
                {offlineMode ? "Offline capture" : "Live validation"}
              </Text>
            </View>
          </View>
        </View>

        <ScanStatsCard
          initialLoading={initialLoading}
          sessionStats={sessionStats}
        />

        <ScanLookupPanel
          initialLoading={initialLoading}
          loading={loading}
          recentItems={recentItems}
          searchQuery={searchQuery}
          searchResults={searchResults}
          onChangeSearchQuery={setSearchQuery}
          onClearSearchQuery={() => safeSetState(setSearchQuery, "")}
          onOpenScanner={() => safeSetState(setIsScanning, true)}
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
        />

        <View style={styles.footerSpacer} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomContainer}>
        <ModernButton
          title="Finish Rack"
          onPress={() => safeSetState(setShowCloseSessionModal, true)}
          variant="primary"
          icon="checkmark-circle"
          fullWidth
          style={styles.finishRackButton}
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
        <View style={[styles.loadingOverlay, styles.pointerEventsNone]}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      )}

      {/* Performance Monitor Overlay */}
      {__DEV__ && (
        <View
          style={[
            styles.performanceOverlay,
            performanceWarning
              ? styles.performancePoor
              : styles.performanceGood,
          ]}
        >
          <Text style={styles.performanceText}>
            FPS: {performanceMetrics.fps ?? "--"}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
});

export default ScanScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_BG,
  },
  headerShell: {
    backgroundColor: SURFACE_BG,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
  },
  sessionHero: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: SURFACE_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    ...shadows.md,
  },
  sessionHeroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sessionHeroCopy: {
    flex: 1,
  },
  sessionHeroKicker: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: spacing.sm,
  },
  sessionHeroTitle: {
    fontSize: typography.fontSize["2xl"],
    lineHeight: typography.lineHeight["2xl"],
    fontWeight: "700",
    color: TEXT_STRONG,
    marginBottom: spacing.sm,
  },
  sessionHeroText: {
    fontSize: typography.fontSize.sm,
    lineHeight: 22,
    color: TEXT_MUTED,
    maxWidth: 620,
  },
  sessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: ACCENT_SOFT,
    borderWidth: 1,
    borderColor: "#cae8df",
  },
  sessionBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    color: ACCENT,
    letterSpacing: 0.8,
  },
  sessionMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sessionMetaChip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sessionMetaText: {
    fontSize: typography.fontSize.sm,
    fontWeight: "600",
    color: TEXT_STRONG,
  },
  footerSpacer: {
    height: 20,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : spacing.lg,
    backgroundColor: SURFACE_BG,
    borderTopWidth: 1,
    borderTopColor: SURFACE_BORDER,
    ...shadows.lg,
  },
  finishRackButton: {
    backgroundColor: ACCENT,
    borderRadius: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  pointerEventsNone: {
    pointerEvents: "none",
  },
  performanceOverlay: {
    position: "absolute",
    top: 96,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    zIndex: 1001,
  },
  performanceText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  performanceGood: {
    backgroundColor: "rgba(34,197,94,0.8)",
  },
  performancePoor: {
    backgroundColor: "rgba(239,68,68,0.8)",
  },
});
