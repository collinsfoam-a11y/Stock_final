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
import {
  AnimatedPressable,
  ModernCard,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
  OperationalCommandBar,
  OperationalListRow,
  OperationalListSection,
  OperationalSplitView,
  OperationalStatusStrip,
} from "../../src/components/ui";
import type {
  OperationalCommandAction,
  OperationalListRowSeverity,
  OperationalListRowTone,
} from "../../src/components/ui";
import { useSettingsStore } from "../../src/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useOperationalQueueNavigation } from "@/hooks/useOperationalQueueNavigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import {
  createOperationalStyleBridge,
  type OperationalStyleBridge,
} from "@/theme/operationalStyleBridge";

const formatQueueTimestamp = (value?: string) => {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
};

const getQueueTone = (status?: string): OperationalListRowTone => {
  switch (String(status || "").toLowerCase()) {
    case "blocked_conflict":
    case "pending_conflict":
      return "blocked";
    case "failed_manual_review":
    case "failed":
      return "error";
    case "pending":
    case "queued":
      return "pending";
    case "synced":
    case "completed":
      return "synced";
    default:
      return "info";
  }
};

const getQueueSeverity = (status?: string): OperationalListRowSeverity => {
  switch (String(status || "").toLowerCase()) {
    case "failed_manual_review":
    case "failed":
      return "critical";
    case "blocked_conflict":
    case "pending_conflict":
      return "high";
    case "pending":
    case "queued":
      return "medium";
    default:
      return "low";
  }
};

type QueueSelection =
  | { kind: "queue"; item: any }
  | { kind: "conflict"; item: any }
  | null;

export default function OfflineQueueScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const operationalTheme = React.useMemo(() => createOperationalStyleBridge(uiTokens), [uiTokens]);
  const styles = React.useMemo(() => createStyles(operationalTheme), [operationalTheme]);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = React.useState(false);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [conflicts, setConflicts] = React.useState<any[]>([]);
  const [selectedQueueItem, setSelectedQueueItem] = React.useState<QueueSelection>(null);
  const queueNavigationItems = React.useMemo<Exclude<QueueSelection, null>[]>(
    () => [
      ...conflicts.map((item) => ({ kind: "conflict" as const, item })),
      ...queue.map((item) => ({ kind: "queue" as const, item })),
    ],
    [conflicts, queue]
  );
  const getQueueSelectionId = React.useCallback(
    (selection: Exclude<QueueSelection, null>) =>
      `${selection.kind}:${selection.item.id || selection.item.idempotency_key || selection.item.timestamp || selection.item.url || "unknown"}`,
    []
  );

  useOperationalQueueNavigation({
    items: queueNavigationItems,
    selectedItem: selectedQueueItem,
    getItemId: getQueueSelectionId,
    onSelect: setSelectedQueueItem,
    onEscape: () => setSelectedQueueItem(null),
    enabled: !loading,
  });

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

  React.useEffect(() => {
    if (selectedQueueItem) {
      const selectedId = selectedQueueItem.item.id || selectedQueueItem.item.idempotency_key;
      const source = selectedQueueItem.kind === "queue" ? queue : conflicts;
      if (source.some((item) => (item.id || item.idempotency_key) === selectedId)) return;
    }

    if (conflicts.length > 0) {
      setSelectedQueueItem({ kind: "conflict", item: conflicts[0] });
    } else if (queue.length > 0) {
      setSelectedQueueItem({ kind: "queue", item: queue[0] });
    } else {
      setSelectedQueueItem(null);
    }
  }, [conflicts, queue, selectedQueueItem]);

  const handleFlush = React.useCallback(async () => {
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
  }, [load, offlineMode]);

  const handleDismiss = React.useCallback(
    async (id: string) => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      await resolveConflict(id);
      load();
    },
    [load]
  );

  const renderQueueItem = React.useCallback(
    ({ item }: { item: any }) => {
      const statusLabel = String(item.status || "queued")
        .replace(/_/g, " ")
        .toUpperCase();
      const metadata = [
        item.idempotency_key ? `Key ${item.idempotency_key}` : null,
        item.data ? "Payload attached" : null,
      ].filter(Boolean) as string[];

      return (
        <OperationalListRow
          title={String(item.type || "queued action")
            .replace(/_/g, " ")
            .toUpperCase()}
          subtitle={statusLabel}
          metadata={metadata}
          metrics={[
            {
              label: "Retries",
              value: item.retries ?? 0,
              tone: Number(item.retries || 0) > 0 ? "warning" : "neutral",
              icon: "refresh-outline",
            },
          ]}
          status={statusLabel}
          statusTone={getQueueTone(item.status)}
          severity={getQueueSeverity(item.status)}
          leftIcon={
            item.status === "failed_manual_review" ? "alert-circle-outline" : "cloud-upload-outline"
          }
          timestamps={
            [
              {
                label: "Queued",
                value: formatQueueTimestamp(item.timestamp),
                icon: "time-outline",
              },
              item.last_attempted_at
                ? {
                    label: "Attempted",
                    value: formatQueueTimestamp(item.last_attempted_at),
                    icon: "refresh-outline",
                  }
                : undefined,
            ].filter(Boolean) as {
              label: string;
              value: string;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          }
          error={item.last_error ? `Last error: ${item.last_error}` : false}
          selected={selectedQueueItem?.kind === "queue" && selectedQueueItem.item === item}
          onPress={() => setSelectedQueueItem({ kind: "queue", item })}
          onKeyboardOpen={() => setSelectedQueueItem({ kind: "queue", item })}
          accessibility={{
            label: `${statusLabel} ${item.type || "queued action"}. ${metadata.join(". ")}`,
            hint: "Shows queue recovery details in the detail pane",
          }}
          style={styles.rowSpacing}
        />
      );
    },
    [selectedQueueItem, styles.rowSpacing]
  );

  const renderConflictItem = React.useCallback(
    ({ item }: { item: any }) => {
      const detail = typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail);
      const method = String(item.method || "conflict").toUpperCase();
      return (
        <OperationalListRow
          title={`${method} ${item.url || "sync conflict"}`}
          subtitle="Conflict requires supervisor attention"
          metadata={detail ? [detail.length > 96 ? `${detail.slice(0, 96)}...` : detail] : undefined}
          metrics={[{ label: "Method", value: method, tone: "warning", icon: "git-compare-outline" }]}
          status="CONFLICT"
          statusTone="blocked"
          severity="high"
          leftIcon="warning-outline"
          timestamps={{
            label: "Detected",
            value: formatQueueTimestamp(item.timestamp || item.createdAt),
            icon: "time-outline",
          }}
          selected={selectedQueueItem?.kind === "conflict" && selectedQueueItem.item === item}
          onPress={() => setSelectedQueueItem({ kind: "conflict", item })}
          onKeyboardOpen={() => setSelectedQueueItem({ kind: "conflict", item })}
          accessibility={{
            label: `Conflict ${method} ${item.url || ""}. ${detail || "No detail"}`,
            hint: "Shows conflict metadata and recovery commands in the detail pane",
          }}
          style={styles.rowSpacing}
        />
      );
    },
    [selectedQueueItem, styles.rowSpacing]
  );

  const detailCommandActions = React.useMemo<OperationalCommandAction[]>(() => {
    const actions: OperationalCommandAction[] = [
      {
        id: "retry-sync",
        label: "Flush Queue",
        icon: "sync-outline",
        tone: "primary",
        shortcut: "Mod+R",
        disabled: offlineMode || loading,
        busy: loading,
        onPress: () => void handleFlush(),
        accessibilityLabel: "Flush offline queue",
        accessibilityHint: "Retries pending offline actions when connectivity is available",
      },
    ];

    if (selectedQueueItem?.kind === "conflict") {
      const method = String(selectedQueueItem.item.method || "conflict").toUpperCase();
      actions.push({
        id: "dismiss-conflict",
        label: "Dismiss",
        icon: "checkmark-done-outline",
        tone: "success",
        shortcut: "Mod+V",
        onPress: () => void handleDismiss(selectedQueueItem.item.id),
        accessibilityLabel: `Dismiss conflict ${method} ${selectedQueueItem.item.url || ""}`.trim(),
        accessibilityHint: "Marks this local conflict as resolved in the offline conflict queue",
      });
    }

    return actions;
  }, [handleDismiss, handleFlush, loading, offlineMode, selectedQueueItem]);

  const detailPanel = React.useMemo(() => {
    if (!selectedQueueItem) {
      return (
        <View style={styles.detailEmpty}>
          <Ionicons
            name="cloud-upload-outline"
            size={48}
            color={operationalTheme.colors.text.tertiary}
          />
          <Text style={styles.detailEmptyTitle}>Queue is clear</Text>
          <Text style={styles.detailEmptyBody}>
            Pending actions and conflicts will appear here when offline work needs recovery.
          </Text>
        </View>
      );
    }

    const item = selectedQueueItem.item;
    const isConflict = selectedQueueItem.kind === "conflict";
    const title = isConflict
      ? `${String(item.method || "conflict").toUpperCase()} ${item.url || ""}`.trim()
      : String(item.type || "queued action").replace(/_/g, " ").toUpperCase();
    const payload = isConflict ? item.detail : item.data;

    return (
      <View style={styles.detailPanel}>
        <View>
          <Text style={styles.detailEyebrow}>{isConflict ? "Conflict detail" : "Retry detail"}</Text>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.detailSubtitle} numberOfLines={1}>
            {isConflict
              ? "Supervisor attention required"
              : String(item.status || "queued").replace(/_/g, " ")}
          </Text>
        </View>

        <View style={styles.detailMetaBlock}>
          <Text style={styles.detailMetaText}>Retries: {item.retries ?? 0}</Text>
          <Text style={styles.detailMetaText}>
            Queued: {formatQueueTimestamp(item.timestamp || item.createdAt)}
          </Text>
          {item.last_error ? (
            <Text style={styles.detailErrorText}>Last error: {item.last_error}</Text>
          ) : null}
          {item.idempotency_key ? (
            <Text style={styles.detailMetaText}>Idempotency: {item.idempotency_key}</Text>
          ) : null}
        </View>

        <View style={styles.detailPayloadBlock}>
          <Text style={styles.detailPayloadTitle}>Recovery metadata</Text>
          <Text style={styles.detailPayloadText}>
            {payload ? JSON.stringify(payload, null, 2) : "No payload metadata"}
          </Text>
        </View>

        <OperationalCommandBar
          compact
          align="stretch"
          title="Recovery commands"
          subtitle="Cmd/Ctrl+R retries queue sync. Cmd/Ctrl+V verifies or dismisses the selected conflict."
          actions={detailCommandActions}
          style={styles.detailCommandBar}
        />
      </View>
    );
  }, [detailCommandActions, operationalTheme.colors.text.tertiary, selectedQueueItem, styles]);

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

        <OperationalStatusStrip
          compact
          offline={offlineMode}
          syncState={loading ? "Loading" : offlineMode ? "Paused" : "Ready"}
          pendingQueueCount={queue.length}
          uploadBacklog={queue.length}
          runtimeHealth={conflicts.length > 0 ? "Degraded" : "Stable"}
          items={[
            {
              id: "offline-conflicts",
              label: "Conflicts",
              value: conflicts.length,
              tone: conflicts.length > 0 ? "blocked" : "success",
              icon: "alert-circle-outline",
            },
            selectedQueueItem
              ? {
                  id: "selected-recovery",
                  label: "Active",
                  value: selectedQueueItem.kind === "conflict" ? "Conflict" : "Retry",
                  tone: selectedQueueItem.kind === "conflict" ? "blocked" : "active",
                  icon: "radio-button-on-outline",
                }
              : undefined,
          ].filter(Boolean) as React.ComponentProps<typeof OperationalStatusStrip>["items"]}
          style={styles.statusStrip}
          testID="offline-queue-operational-status-strip"
        />

        <OperationalSplitView
          collapsible
          persistSelection={false}
          sidebarLabel="Offline recovery queue"
          detailLabel={
            selectedQueueItem
              ? selectedQueueItem.kind === "conflict"
                ? "Offline conflict detail"
                : "Offline retry detail"
              : "Offline recovery detail"
          }
          style={styles.splitView}
          sidebar={
            <View style={styles.sidebarStack}>
              <OperationalListSection
                title="Queue"
                subtitle={`${queue.length} pending ${queue.length === 1 ? "action" : "actions"}`}
                severity={queue.length > 0 ? "medium" : "none"}
                style={styles.listSection}
                contentStyle={styles.sectionListContent}
              >
                <FlashList
                  data={queue}
                  renderItem={renderQueueItem}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
                  keyExtractor={(item) =>
                    item.id ||
                    item.idempotency_key ||
                    `${item.type || "queue"}-${item.timestamp || "pending"}`
                  }
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
              </OperationalListSection>

              <OperationalListSection
                title="Conflicts"
                subtitle={`${conflicts.length} requiring review`}
                severity={conflicts.length > 0 ? "high" : "none"}
                style={styles.listSection}
                contentStyle={styles.sectionListContent}
              >
                <FlashList
                  data={conflicts}
                  renderItem={renderConflictItem}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
                  keyExtractor={(item) =>
                    item.id ||
                    `${item.method || "conflict"}-${item.url || "unknown"}-${item.timestamp || item.createdAt || ""}`
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No conflicts</Text>
                    </View>
                  }
                />
              </OperationalListSection>
            </View>
          }
          detail={detailPanel}
        />
      </View>
    </View>
  );
}

const createStyles = (operationalTheme: OperationalStyleBridge) =>
  StyleSheet.create({
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
      marginBottom: operationalTheme.spacing.sm,
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
      gap: operationalTheme.spacing.xs,
      backgroundColor: operationalTheme.colors.primary[500],
      paddingHorizontal: operationalTheme.spacing.md,
      paddingVertical: operationalTheme.spacing.sm,
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
    splitView: {
      flex: 1,
      minHeight: 0,
      paddingBottom: operationalTheme.spacing.md,
    },
    statusStrip: {
      marginBottom: operationalTheme.spacing.sm,
    },
    sidebarStack: {
      flex: 1,
      minHeight: 0,
      gap: operationalTheme.spacing.sm,
    },
    listSection: {
      flex: 1,
      minHeight: 180,
    },
    sectionListContent: {
      flex: 1,
    },
    rowSpacing: {
      marginBottom: operationalTheme.spacing.sm,
    },
    muted: { color: operationalTheme.colors.text.tertiary, textAlign: "center" },
    detailEmpty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: operationalTheme.spacing.xl,
    },
    detailEmptyTitle: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.lg,
      fontWeight: "800",
      marginTop: operationalTheme.spacing.md,
    },
    detailEmptyBody: {
      color: operationalTheme.colors.text.secondary,
      fontSize: operationalTheme.typography.fontSize.sm,
      lineHeight: 20,
      textAlign: "center",
      marginTop: operationalTheme.spacing.xs,
    },
    detailPanel: {
      flex: 1,
      minHeight: 0,
      padding: operationalTheme.spacing.sm,
      gap: operationalTheme.spacing.sm,
    },
    detailEyebrow: {
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: operationalTheme.spacing.xs,
    },
    detailTitle: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.xl,
      fontWeight: "800",
    },
    detailSubtitle: {
      color: operationalTheme.colors.text.secondary,
      fontSize: operationalTheme.typography.fontSize.sm,
      fontWeight: "700",
      marginTop: operationalTheme.spacing.xs,
      textTransform: "capitalize",
    },
    detailMetaBlock: {
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
      backgroundColor: operationalTheme.colors.background.glass,
      borderRadius: operationalTheme.borderRadius.md,
      padding: operationalTheme.spacing.sm,
      gap: operationalTheme.spacing.xs,
    },
    detailMetaText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.secondary,
      fontWeight: "600",
    },
    detailErrorText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.error[500],
      fontWeight: "700",
    },
    detailPayloadBlock: {
      flex: 1,
      minHeight: 120,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
      backgroundColor: operationalTheme.colors.background.glass,
      borderRadius: operationalTheme.borderRadius.md,
      padding: operationalTheme.spacing.sm,
      gap: operationalTheme.spacing.xs,
    },
    detailPayloadTitle: {
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    detailPayloadText: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.xs,
      lineHeight: 18,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    detailCommandBar: {
      marginTop: operationalTheme.spacing.xs,
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
