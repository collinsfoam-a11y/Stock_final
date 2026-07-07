/**
 * Offline Queue Screen
 * Manage offline actions and conflicts
 * Refactored to use Aurora Design System
 */
import React from "react";
import { View, Text, StyleSheet, RefreshControl, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";

import { flags } from "../../src/constants/flags";
import { getConflicts, resolveConflict } from "../../src/services/offline/offlineQueue";
import { getOfflineQueue } from "../../src/services/offline/offlineStorage";
import { forceSync } from "../../src/services/syncService";
import { summarizeForceSyncResult } from "../../src/components/supervisor/offlineQueueFeedback";
import { ModernCard, AnimatedPressable, StatsCard } from "../../src/components/ui";
import { useSettingsStore } from "../../src/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import {
  createOperationalStyleBridge,
  type OperationalStyleBridge,
} from "@/theme/operationalStyleBridge";

export default function OfflineQueueScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const operationalTheme = React.useMemo(() => createOperationalStyleBridge(uiTokens), [uiTokens]);
  const styles = React.useMemo(() => createStyles(operationalTheme), [operationalTheme]);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = React.useState(false);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [conflicts, setConflicts] = React.useState<any[]>([]);

  const load = React.useCallback(async () => {
    if (!flags.enableOfflineQueue) return;
    setLoading(true);
    try {
      const [q, c] = await Promise.all([getOfflineQueue(), getConflicts()]);
      setQueue(q);
      setConflicts(c);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleFlush = async () => {
    if (offlineMode) {
      Alert.alert(
        "Offline Mode",
        "Queue sync is disabled while offline mode is enabled. Turn it off before syncing."
      );
      return;
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await forceSync();
      const feedback = summarizeForceSyncResult(result);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(
          result.failed > 0
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success
        );
      Alert.alert(feedback.title, feedback.message);
      if (feedback.loadAfterAlert) {
        load();
      }
    } catch (error: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Sync Failed",
        error?.message ||
          "Failed to sync offline queue. Please check your connection and try again."
      );
    }
  };

  const handleDismiss = async (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await resolveConflict(id);
    load();
  };

  const renderQueueItem = ({ item }: { item: any }) => (
    <AnimatedPressable style={{ marginBottom: operationalTheme.spacing.md }}>
      <ModernCard variant="outlined" elevation="none" padding={operationalTheme.spacing.md}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.methodBadge,
              {
                backgroundColor:
                  item.status === "blocked_conflict"
                    ? "rgba(245, 158, 11, 0.2)"
                    : item.status === "failed_manual_review"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(59, 130, 246, 0.2)",
              },
            ]}
          >
            <Text
              style={[
                styles.methodText,
                {
                  color:
                    item.status === "blocked_conflict"
                      ? operationalTheme.colors.warning[500]
                      : item.status === "failed_manual_review"
                        ? operationalTheme.colors.error[500]
                        : operationalTheme.colors.primary[400],
                },
              ]}
            >
              {String(item.type).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
        </View>

        <Text style={styles.cardUrl}>{String(item.status).replace(/_/g, " ").toUpperCase()}</Text>

        <Text style={styles.cardCode}>
          Retries: {item.retries}
          {item.idempotency_key ? ` | Idempotency: ${item.idempotency_key}` : ""}
        </Text>

        {item.last_error && (
          <Text style={[styles.cardCode, { color: operationalTheme.colors.error[400] }]}>
            Last error: {item.last_error}
          </Text>
        )}

        {item.last_attempted_at && (
          <Text style={styles.timestamp}>
            Last attempted: {new Date(item.last_attempted_at).toLocaleString()}
          </Text>
        )}

        {item.data && (
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={operationalTheme.spacing.sm}
            style={{ marginTop: operationalTheme.spacing.sm }}
          >
            <Text style={styles.cardCode} numberOfLines={2}>
              {JSON.stringify(item.data)}
            </Text>
          </ModernCard>
        )}
      </ModernCard>
    </AnimatedPressable>
  );

  const renderConflictItem = ({ item }: { item: any }) => (
    <AnimatedPressable style={{ marginBottom: operationalTheme.spacing.md }}>
      <ModernCard
        variant="outlined"
        elevation="none"
        padding={operationalTheme.spacing.md}
        style={{ borderColor: operationalTheme.colors.error[500] }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.errorBadge}>
            <Ionicons name="warning" size={12} color={operationalTheme.colors.warning[500]} />
            <Text style={styles.errorBadgeText}>Conflict</Text>
          </View>
          <Text style={styles.timestamp}>
            {new Date(item.timestamp || item.createdAt).toLocaleString()}
          </Text>
        </View>

        <Text style={styles.cardTitle}>
          {String(item.method).toUpperCase()} {item.url}
        </Text>

        <ModernCard
          variant="outlined"
          elevation="none"
          padding={operationalTheme.spacing.sm}
          style={{ marginTop: operationalTheme.spacing.sm }}
        >
          <Text style={styles.cardCode} numberOfLines={4}>
            {typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail)}
          </Text>
        </ModernCard>

        <View style={styles.cardActions}>
          <AnimatedPressable onPress={() => handleDismiss(item.id)} style={styles.dismissButton}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </AnimatedPressable>
        </View>
      </ModernCard>
    </AnimatedPressable>
  );

  if (!flags.enableOfflineQueue) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.center}>
          <ModernCard variant="outlined" elevation="none" padding={operationalTheme.spacing.xl}>
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color={operationalTheme.colors.text.tertiary}
              style={{
                alignSelf: "center",
                marginBottom: operationalTheme.spacing.md,
              }}
            />
            <Text style={styles.muted}>Offline Queue is disabled in flags.</Text>
          </ModernCard>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => safeBackNavigation(router, { userRole: "supervisor" })}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={operationalTheme.colors.text.primary} />
            </AnimatedPressable>
            <View>
              <Text style={styles.pageTitle}>Offline Queue</Text>
              <Text style={styles.pageSubtitle}>Pending actions & conflicts</Text>
            </View>
          </View>
          <AnimatedPressable
            onPress={handleFlush}
            style={[styles.flushButton, offlineMode && styles.flushButtonDisabled]}
          >
            <Ionicons name="sync" size={20} color={operationalTheme.colors.text.inverse} />
            <Text style={styles.flushText}>Flush Queue</Text>
          </AnimatedPressable>
        </Animated.View>

        {offlineMode && (
          <Animated.View entering={FadeInDown.delay(140).springify()}>
            <ModernCard
              variant="outlined"
              elevation="none"
              style={styles.offlineNotice}
              padding={operationalTheme.spacing.md}
            >
              <Text style={styles.offlineNoticeTitle}>
                Queue review is available, sync is paused
              </Text>
              <Text style={styles.offlineNoticeBody}>
                You can inspect queued actions and conflicts in offline mode, but syncing them
                requires turning offline mode off and reconnecting.
              </Text>
            </ModernCard>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsRow}>
          <StatsCard
            title="Pending Actions"
            value={queue.length.toString()}
            icon="layers-outline"
            variant="primary"
            style={{ flex: 1 }}
          />
          <StatsCard
            title="Conflicts"
            value={conflicts.length.toString()}
            icon="alert-circle-outline"
            variant={conflicts.length > 0 ? "error" : "success"}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <View style={styles.contentContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Queue</Text>
          </View>

          <View style={{ flex: 1 }}>
            <FlashList
              data={queue}
              renderItem={renderQueueItem}
              // @ts-ignore
              estimatedItemSize={100}
              keyExtractor={(item) => item.id || `q-${Math.random()}`}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={load}
                  tintColor={operationalTheme.colors.primary[500]}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No pending actions</Text>
                </View>
              }
            />
          </View>

          <View style={[styles.sectionHeader, { marginTop: operationalTheme.spacing.lg }]}>
            <Text style={styles.sectionTitle}>Conflicts</Text>
          </View>

          <View style={{ flex: 1 }}>
            <FlashList
              data={conflicts}
              renderItem={renderConflictItem}
              // @ts-ignore
              estimatedItemSize={150}
              keyExtractor={(item) => item.id || `c-${Math.random()}`}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No conflicts resolved</Text>
                </View>
              }
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (operationalTheme: OperationalStyleBridge) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationalTheme.colors.background.primary,
  },
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: operationalTheme.spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: operationalTheme.spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: operationalTheme.spacing.md,
  },
  offlineNotice: {
    marginBottom: operationalTheme.spacing.lg,
  },
  offlineNoticeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: operationalTheme.colors.text.primary,
    marginBottom: 4,
  },
  offlineNoticeBody: {
    fontSize: 12,
    lineHeight: 18,
    color: operationalTheme.colors.text.secondary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: operationalTheme.spacing.md,
  },
  backButton: {
    padding: operationalTheme.spacing.xs,
    backgroundColor: operationalTheme.colors.background.glass,
    borderRadius: operationalTheme.borderRadius.full,
    borderWidth: 1,
    borderColor: operationalTheme.colors.border.light,
  },
  pageTitle: {
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize["2xl"],
    color: operationalTheme.colors.text.primary,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.secondary,
  },
  flushButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: operationalTheme.colors.primary[500],
    paddingHorizontal: operationalTheme.spacing.md,
    paddingVertical: 8,
    borderRadius: operationalTheme.borderRadius.full,
  },
  flushButtonDisabled: {
    opacity: 0.55,
  },
  flushText: {
    color: operationalTheme.colors.text.inverse,
    fontWeight: "600",
    fontSize: operationalTheme.typography.fontSize.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: operationalTheme.spacing.md,
    marginBottom: operationalTheme.spacing.lg,
  },
  contentContainer: {
    flex: 1,
    paddingBottom: operationalTheme.spacing.xl,
  },
  sectionHeader: {
    marginBottom: operationalTheme.spacing.sm,
  },
  sectionTitle: {
    fontSize: operationalTheme.typography.fontSize.lg,
    fontWeight: "700",
    color: operationalTheme.colors.text.primary,
  },
  muted: { color: operationalTheme.colors.text.tertiary, textAlign: "center" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: operationalTheme.spacing.sm,
  },
  methodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: operationalTheme.borderRadius.sm,
  },
  methodText: {
    fontSize: operationalTheme.typography.fontSize.xs,
    fontWeight: "bold",
  },
  timestamp: {
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.tertiary,
  },
  cardUrl: {
    fontSize: operationalTheme.typography.fontSize.sm,
    fontWeight: "600",
    color: operationalTheme.colors.text.primary,
  },
  cardCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.secondary,
  },
  errorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(234, 179, 8, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: operationalTheme.borderRadius.full,
  },
  errorBadgeText: {
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.warning[500],
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: operationalTheme.typography.fontSize.sm,
    fontWeight: "700",
    color: operationalTheme.colors.text.primary,
    marginBottom: operationalTheme.spacing.xs,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: operationalTheme.spacing.md,
  },
  dismissButton: {
    backgroundColor: operationalTheme.colors.background.glass,
    borderWidth: 1,
    borderColor: operationalTheme.colors.border.light,
    paddingHorizontal: operationalTheme.spacing.md,
    paddingVertical: 6,
    borderRadius: operationalTheme.borderRadius.full,
  },
  dismissText: {
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.primary,
    fontWeight: "600",
  },
  emptyState: {
    padding: operationalTheme.spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    color: operationalTheme.colors.text.tertiary,
    fontSize: operationalTheme.typography.fontSize.sm,
  },
});
