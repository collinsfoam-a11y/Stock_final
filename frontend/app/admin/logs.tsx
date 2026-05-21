import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshControl, View, Text, StyleSheet, TextInput } from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  AnimatedPressable,
  OperationalCommandBar,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
  OperationalListRow,
  OperationalListSection,
  OperationalSplitView,
  OperationalStatusStrip,
  ScreenContainer,
} from "@/components/ui";
import type {
  OperationalCommandAction,
  OperationalListRowSeverity,
  OperationalListRowTone,
} from "@/components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { getServiceLogs } from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useOperationalQueueNavigation } from "@/hooks/useOperationalQueueNavigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const getLevelTone = (level?: string): OperationalListRowTone => {
  switch (String(level || "").toUpperCase()) {
    case "ERROR":
    case "CRITICAL":
      return "error";
    case "WARN":
    case "WARNING":
      return "warning";
    case "INFO":
      return "info";
    case "DEBUG":
      return "neutral";
    default:
      return "neutral";
  }
};

const getLevelSeverity = (level?: string): OperationalListRowSeverity => {
  switch (String(level || "").toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "ERROR":
      return "high";
    case "WARN":
    case "WARNING":
      return "medium";
    default:
      return "low";
  }
};

export default function LogsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const service = (params.service as string) || "backend";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const loadLogs = useCallback(async () => {
    if (offlineMode) {
      setLogs([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setRefreshing(true);
      const response = await getServiceLogs(
        service,
        200,
        filterLevel === "ALL" ? undefined : filterLevel
      );
      if (response.success && response.data) {
        const nextLogs = response.data.logs || [];
        setLogs(nextLogs);
        setSelectedLog((current: any | null) => current ?? nextLogs[0] ?? null);
      }
    } catch (error: any) {
      __DEV__ && console.error("Error loading logs:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterLevel, offlineMode, service]);

  useEffect(() => {
    if (!hasRole("admin")) {
      safeBackNavigation(router, { userRole: "admin" });
      return;
    }
    void loadLogs();

    if (offlineMode) {
      return;
    }

    const interval = setInterval(() => {
      void loadLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [hasRole, loadLogs, offlineMode, router]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (searchQuery) {
          return log.message?.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
      }),
    [logs, searchQuery]
  );
  const logSeverityCounts = useMemo(
    () => ({
      errors: filteredLogs.filter((log) =>
        ["ERROR", "CRITICAL"].includes(String(log.level || "").toUpperCase())
      ).length,
      warnings: filteredLogs.filter((log) =>
        ["WARN", "WARNING"].includes(String(log.level || "").toUpperCase())
      ).length,
    }),
    [filteredLogs]
  );

  const renderLogItem = useCallback(
    ({ item: log }: { item: any }) => {
      const level = String(log.level || "INFO").toUpperCase();
      const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A";

      return (
        <OperationalListRow
          title={log.message || "No message"}
          subtitle={`${service.toUpperCase()} service log`}
          metadata={
            [
              log.logger ? `Logger ${log.logger}` : null,
            ].filter(Boolean) as string[]
          }
          metrics={[
            {
              label: "Module",
              value: log.module || "Core",
              tone: "info",
              icon: "cube-outline",
            },
          ]}
          status={level}
          statusTone={getLevelTone(level)}
          severity={getLevelSeverity(level)}
          leftIcon={
            level === "ERROR" || level === "CRITICAL"
              ? "alert-circle-outline"
              : "document-text-outline"
          }
          timestamps={{ label: "Logged", value: timestamp, icon: "time-outline" }}
          selected={selectedLog === log}
          onPress={() => setSelectedLog(log)}
          onKeyboardOpen={() => setSelectedLog(log)}
          accessibility={{
            label: `${level} log from ${service}. ${log.message || "No message"}. ${timestamp}`,
            hint: "Shows audit log context in the detail pane",
          }}
          style={styles.logRow}
        />
      );
    },
    [selectedLog, service, styles.logRow]
  );

  const getLogId = useCallback(
    (item: any) => String(item.id || item.timestamp || `${item.level || "log"}-${item.message || ""}`),
    []
  );

  useOperationalQueueNavigation({
    items: filteredLogs,
    selectedItem: selectedLog,
    getItemId: getLogId,
    onSelect: setSelectedLog,
    onOpen: setSelectedLog,
    onEscape: () => setSelectedLog(null),
    enabled: !loading,
  });

  const logCommandActions = useMemo<OperationalCommandAction[]>(
    () => [
      {
        id: "refresh-logs",
        label: "Refresh",
        icon: "refresh-outline",
        tone: "primary",
        shortcut: "Mod+R",
        disabled: offlineMode,
        busy: refreshing,
        onPress: () => void loadLogs(),
        accessibilityLabel: "Refresh service logs",
        accessibilityHint: "Reloads the audit log stream from the backend",
      },
      {
        id: "show-errors",
        label: "Errors",
        icon: "alert-circle-outline",
        tone: filterLevel === "ERROR" ? "danger" : "warning",
        shortcut: "Mod+E",
        onPress: () => setFilterLevel("ERROR"),
        accessibilityLabel: "Show error logs",
        accessibilityHint: "Filters the audit stream to error-level logs",
      },
    ],
    [filterLevel, loadLogs, offlineMode, refreshing]
  );

  const logDetailPanel = useMemo(() => {
    if (!selectedLog) {
      return (
        <View style={styles.detailEmpty}>
          <Ionicons name="document-text-outline" size={48} color={uiTokens.colors.textMuted} />
          <Text style={styles.detailEmptyTitle}>Select a log entry</Text>
          <Text style={styles.detailEmptyBody}>
            Pick an audit row to inspect service context without losing stream position.
          </Text>
        </View>
      );
    }

    const level = String(selectedLog.level || "INFO").toUpperCase();
    const timestamp = selectedLog.timestamp
      ? new Date(selectedLog.timestamp).toLocaleString()
      : "N/A";

    return (
      <View style={styles.detailPanel}>
        <View>
          <Text style={styles.detailEyebrow}>Audit detail</Text>
          <Text style={styles.detailTitle} numberOfLines={3}>
            {selectedLog.message || "No message"}
          </Text>
          <Text style={styles.detailSubtitle} numberOfLines={1}>
            {service.toUpperCase()} / {level}
          </Text>
        </View>

        <View style={styles.detailMetaBlock}>
          <Text style={styles.detailMetaText}>Logged: {timestamp}</Text>
          <Text style={styles.detailMetaText}>Logger: {selectedLog.logger || "N/A"}</Text>
          <Text style={styles.detailMetaText}>Module: {selectedLog.module || "N/A"}</Text>
        </View>

        <View style={styles.detailPayloadBlock}>
          <Text style={styles.detailPayloadTitle}>Resolution metadata</Text>
          <Text style={styles.detailPayloadText}>{JSON.stringify(selectedLog, null, 2)}</Text>
        </View>

        <OperationalCommandBar
          compact
          align="stretch"
          title="Audit commands"
          subtitle="Cmd/Ctrl+R refreshes logs. Cmd/Ctrl+E filters errors."
          actions={logCommandActions}
          style={styles.detailCommandBar}
        />
      </View>
    );
  }, [logCommandActions, selectedLog, service, styles, uiTokens.colors.textMuted]);

  return (
    <ScreenContainer
      header={{
        title: `${service.toUpperCase()} Logs`,
        subtitle: offlineMode ? "Live logs unavailable offline" : "Real-time Log Viewer",
        showBackButton: true,
        customRightContent: (
          <AnimatedPressable
            style={[styles.refreshButton, offlineMode && styles.disabledButton]}
            onPress={loadLogs}
            disabled={offlineMode}
            {...getAccessibleButtonProps({
              label: "Refresh service logs",
              disabled: offlineMode,
              busy: refreshing,
            })}
          >
            <Ionicons name="refresh" size={24} color={uiTokens.colors.textPrimary} />
          </AnimatedPressable>
        ),
      }}
      loading={loading && logs.length === 0}
      refreshing={refreshing}
      onRefresh={loadLogs}
    >
      {offlineMode && (
        <View style={styles.noticeCard}>
          <Ionicons name="cloud-offline-outline" size={20} color={uiTokens.colors.warning} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Live logs unavailable offline</Text>
            <Text style={styles.noticeBody}>
              Service logs are fetched from the backend and are not cached on this device. Reconnect
              to inspect live log output.
            </Text>
          </View>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={uiTokens.colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search logs..."
            placeholderTextColor={uiTokens.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search service logs"
          />
        </View>
        <View style={styles.levelFilters}>
          {["ALL", "ERROR", "WARN", "INFO", "DEBUG"].map((level) => {
            const isActive = filterLevel === level;
            return (
              <AnimatedPressable
                key={level}
                style={[styles.levelFilter, isActive && styles.levelFilterActive]}
                onPress={() => setFilterLevel(level)}
                {...getAccessibleButtonProps({
                  label: `Show ${level.toLowerCase()} logs`,
                  selected: isActive,
                })}
              >
                <Text style={[styles.levelFilterText, isActive && styles.levelFilterTextActive]}>
                  {level}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      <OperationalStatusStrip
        compact
        offline={offlineMode}
        syncState={refreshing ? "Refreshing" : offlineMode ? "Paused" : "Ready"}
        pendingQueueCount={filteredLogs.length}
        runtimeHealth={offlineMode || logSeverityCounts.errors > 0 ? "Degraded" : "Stable"}
        items={[
          {
            id: "log-errors",
            label: "Errors",
            value: logSeverityCounts.errors,
            tone: logSeverityCounts.errors > 0 ? "error" : "success",
            icon: "alert-circle-outline",
          },
          {
            id: "log-warnings",
            label: "Warnings",
            value: logSeverityCounts.warnings,
            tone: logSeverityCounts.warnings > 0 ? "warning" : "success",
            icon: "warning-outline",
          },
          {
            id: "log-filter",
            label: "Filter",
            value: filterLevel,
            tone: filterLevel === "ALL" ? "neutral" : "active",
            icon: "funnel-outline",
          },
        ]}
        style={styles.statusStrip}
        testID="admin-logs-operational-status-strip"
      />

      <View style={styles.content}>
        {filteredLogs.length === 0 && !loading ? (
          <View style={styles.centered}>
            <Ionicons name="document-text-outline" size={64} color={uiTokens.colors.textMuted} />
            <Text style={styles.emptyText}>No logs found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? "Try a different search term" : "Logs will appear here when available"}
            </Text>
          </View>
        ) : (
          <OperationalSplitView
            collapsible
            persistSelection={false}
            sidebarLabel="Audit log stream"
            detailLabel={selectedLog ? `Audit detail ${selectedLog.level || ""}` : "Audit detail"}
            style={styles.splitView}
            sidebar={
              <OperationalListSection
                title="Service log stream"
                subtitle={`${filteredLogs.length} visible of ${logs.length} fetched`}
                severity={
                  filteredLogs.some((log) =>
                    ["ERROR", "CRITICAL"].includes(String(log.level || "").toUpperCase())
                  )
                    ? "high"
                    : "none"
                }
                style={styles.logSection}
                contentStyle={styles.logSectionContent}
              >
                <FlashList
                  data={filteredLogs}
                  renderItem={renderLogItem}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
                  keyExtractor={(item, index) =>
                    item.id || item.timestamp || `${item.level || "log"}-${index}`
                  }
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={loadLogs}
                      tintColor={uiTokens.colors.accent}
                      colors={[uiTokens.colors.accent]}
                    />
                  }
                  contentContainerStyle={styles.logListContent}
                />
              </OperationalListSection>
            }
            detail={logDetailPanel}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

type LogsTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: LogsTokens) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: uiTokens.spacing.xl,
    },
    loadingText: {
      marginTop: uiTokens.spacing.sm,
      color: uiTokens.colors.textPrimary,
      fontSize: 16,
    },
    refreshButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
      padding: uiTokens.spacing.sm,
      borderRadius: uiTokens.radius.md,
    },
    disabledButton: {
      opacity: 0.45,
    },
    noticeCard: {
      flexDirection: "row",
      gap: uiTokens.spacing.sm,
      margin: uiTokens.spacing.sm,
      marginBottom: 0,
      padding: uiTokens.spacing.sm,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    noticeCopy: {
      flex: 1,
      gap: uiTokens.spacing.xs,
    },
    noticeTitle: {
      color: uiTokens.colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    noticeBody: {
      color: uiTokens.colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    filtersContainer: {
      backgroundColor: uiTokens.colors.surface,
      padding: uiTokens.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: uiTokens.colors.border,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderRadius: uiTokens.radius.md,
      paddingHorizontal: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing.sm,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    searchIcon: {
      marginRight: uiTokens.spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: uiTokens.colors.textPrimary,
      fontSize: 14,
      paddingVertical: uiTokens.spacing.sm,
    },
    levelFilters: {
      flexDirection: "row",
      gap: uiTokens.spacing.xs,
      flexWrap: "wrap",
    },
    levelFilter: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.md,
      paddingVertical: uiTokens.spacing.xs,
      borderRadius: uiTokens.radius.full,
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    levelFilterActive: {
      backgroundColor: uiTokens.colors.accent,
      borderColor: uiTokens.colors.accent,
    },
    levelFilterText: {
      color: uiTokens.colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    levelFilterTextActive: {
      color: uiTokens.colors.surface,
    },
    content: {
      flex: 1,
      padding: uiTokens.spacing.sm,
    },
    statusStrip: {
      marginHorizontal: uiTokens.spacing.sm,
      marginTop: uiTokens.spacing.sm,
    },
    splitView: {
      flex: 1,
      minHeight: 0,
    },
    logSection: {
      flex: 1,
      minHeight: 260,
    },
    logSectionContent: {
      flex: 1,
    },
    logListContent: {
      paddingBottom: uiTokens.spacing.xl,
    },
    logRow: {
      marginBottom: uiTokens.spacing.sm,
    },
    detailEmpty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: uiTokens.spacing.xl,
    },
    detailEmptyTitle: {
      color: uiTokens.colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
      marginTop: uiTokens.spacing.md,
    },
    detailEmptyBody: {
      color: uiTokens.colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: uiTokens.spacing.xs,
    },
    detailPanel: {
      flex: 1,
      minHeight: 0,
      padding: uiTokens.spacing.sm,
      gap: uiTokens.spacing.sm,
    },
    detailEyebrow: {
      color: uiTokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: uiTokens.spacing.xs,
    },
    detailTitle: {
      color: uiTokens.colors.textPrimary,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "800",
    },
    detailSubtitle: {
      color: uiTokens.colors.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      marginTop: uiTokens.spacing.xs,
    },
    detailMetaBlock: {
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.sm,
      gap: uiTokens.spacing.xs,
    },
    detailMetaText: {
      color: uiTokens.colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    detailPayloadBlock: {
      flex: 1,
      minHeight: 160,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.sm,
      gap: uiTokens.spacing.xs,
    },
    detailPayloadTitle: {
      color: uiTokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    detailPayloadText: {
      color: uiTokens.colors.textPrimary,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "monospace",
    },
    detailCommandBar: {
      marginTop: uiTokens.spacing.xs,
    },
    logEntry: {
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing.sm,
      borderLeftWidth: 4,
      borderLeftColor: uiTokens.colors.border,
    },
    logHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.sm,
    },
    logLevelBadge: {
      paddingHorizontal: uiTokens.spacing.sm,
      paddingVertical: uiTokens.spacing.xs,
      borderRadius: uiTokens.radius.sm,
    },
    logLevelText: {
      color: uiTokens.colors.surface,
      fontSize: 10,
      fontWeight: "700",
    },
    logTimestamp: {
      fontSize: 11,
      color: uiTokens.colors.textMuted,
    },
    logMessage: {
      fontSize: 13,
      color: uiTokens.colors.textPrimary,
      lineHeight: 18,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
      marginTop: uiTokens.spacing.md,
    },
    emptySubtext: {
      fontSize: 14,
      color: uiTokens.colors.textMuted,
      textAlign: "center",
    },
  });
