/**
 * Modern Scan Screen - Lavanya Mart Stock Verify
 * Clean, efficient scanning interface
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, ActivityIndicator, Alert, RefreshControl, Text, Keyboard } from "react-native";
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

import { useSafeAsync } from "../../src/hooks/useSafeAsync";
import { useScanSessionStore } from "../../src/store/scanSessionStore";
import { useSettingsStore } from "../../src/store/settingsStore";
import { updateSessionStatus } from "../../src/services/api/api";
import { safeBackNavigation } from "@/utils/navigation";

import { ModernHeader } from "../../src/components/ui/ModernHeader";
import { ModernButton } from "../../src/components/ui/ModernButton";
import { SyncStatusPill } from "../../src/components/ui/SyncStatusPill";
import { FinishRackModal } from "../../src/components/scan/FinishRackModal";
import { ScanCameraOverlay } from "../../src/components/scan/ScanCameraOverlay";
import { ScanLookupPanel } from "../../src/components/scan/ScanLookupPanel";
import { ScanStatsCard } from "../../src/components/scan/ScanStatsCard";
import { ScanMissingSession } from "../../src/components/scan/ScanMissingSession";
import { ScanAcknowledgeOverlay } from "../../src/components/scan/ScanAcknowledgeOverlay";
import { useScanAcknowledge } from "../../src/components/scan/useScanAcknowledge";
import { styles } from "@/styles/screens/Scan.styles";

import { useAuthStore } from "../../src/store/authStore";

import { useUiTokens } from "@/hooks/useUiTokens";
import { getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
import { AppTouchable } from "@/components/ui/AppTouchable";

import { useScanBuffer } from "../../src/features/inventory/hooks/scan/useScanBuffer";
import { useScanLookup } from "../../src/features/inventory/hooks/scan/useScanLookup";
import { useScanSessionState } from "../../src/features/inventory/hooks/scan/useScanSessionState";

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

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);

  const hasValidSessionId = typeof sessionId === "string" && sessionId.trim().length > 0;
  const scanVisualV2Enabled = flags.uiVisualSystemV2 && flags.uiScanV2;
  const scanLocationLabel = [currentFloor, currentRack].filter(Boolean).join(" • ");

  // Custom Hooks
  const {
    sessionStats,
    loadSessionStats,
    performanceMetrics,
    performanceWarning,
  } = useScanSessionState({
    sessionId,
    offlineMode,
    isScreenFocused,
    setIsScanning: (val) => safeSetState(setIsScanning, val),
    isFinishing,
  });

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    recentItems,
    lookupNotice,
    setLookupNotice,
    lastLookupBarcode,
    loading,
    setLoading,
    initialLoading,
    setInitialLoading,
    selectInFlightRef,
    loadRecentItems,
    handleLookup,
    handleSelectLookupItem,
    loadMoreSearchResults,
    hasMoreSearchResults,
  } = useScanLookup({
    sessionId,
    offlineMode,
    scannerSound,
    debounceDelay,
    currentFloor,
    currentRack,
  });

  // <100ms scan-acknowledge visual layer (§6.1). Fires the instant a barcode is
  // confidently recognised — before the network lookup resolves.
  const { state: ackState, message: ackMessage, acknowledge } = useScanAcknowledge();

  const { scanned, handleBarcodeScan } = useScanBuffer({
    scannerVibration,
    scannerSound,
    scannerAutoSubmit,
    onConfidentScan: async (code) => handleLookup(code),
    setIsScanning: (val) => safeSetState(setIsScanning, val),
    setSearchQuery: (val) => safeSetState(setSearchQuery, val),
    onScanRecognized: useCallback(() => acknowledge("success"), [acknowledge]),
  });

  const loadInitialData = useCallback(async () => {
    safeSetState(setInitialLoading, true);
    await Promise.all([loadRecentItems(), loadSessionStats()]);
    safeSetState(setInitialLoading, false);
  }, [loadRecentItems, loadSessionStats, safeSetState, setInitialLoading]);

  const onRefresh = useCallback(async () => {
    safeSetState(setRefreshing, true);
    if (scannerVibration) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await Promise.all([loadRecentItems(), loadSessionStats()]);
    safeSetState(setRefreshing, false);
  }, [loadRecentItems, loadSessionStats, safeSetState, scannerVibration]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      selectInFlightRef.current = false;
      safeSetState(setLoading, false);
      return () => setIsScreenFocused(false);
    }, [safeSetState, selectInFlightRef, setLoading])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return undefined;
      void loadInitialData();
      const interval = setInterval(() => {
        void loadSessionStats();
      }, 30000);
      return () => clearInterval(interval);
    }, [isAuthenticated, loadInitialData, loadSessionStats])
  );

  // Animated scan line
  const scanLinePosition = useSharedValue(0);
  const cornerOpacity = useSharedValue(1);

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

  const handleFinishRack = async () => {
    if (!sessionId) return;
    safeSetState(setIsFinishing, true);
    try {
      await safeAsync(() => updateSessionStatus(sessionId, "reconcile"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
            <AppTouchable
              onPress={handleLogout}
              style={styles.logoutButton}
              accessibilityLabel="Log out"
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={24} color={uiTokens.colors.accent} />
            </AppTouchable>
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            if (searchResults.length > 0) {
              void handleSelectLookupItem(searchResults[0]);
            } else if (/^\d{6,}$/.test(searchQuery.trim())) {
              handleLookup(searchQuery.trim());
            } else {
              Keyboard.dismiss();
            }
          }}
          onRetryNotice={() => {
            const code = lastLookupBarcode || searchQuery.trim();
            if (code) {
              handleLookup(code);
            }
          }}
          hasMore={hasMoreSearchResults}
          onLoadMore={loadMoreSearchResults}
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
      {/* <100ms scan-acknowledge flash (§6.1) — non-blocking, pointer-events none. */}
      <ScanAcknowledgeOverlay state={ackState} message={ackMessage} />
    </SafeAreaView>
  );
});

export default ScanScreen;
