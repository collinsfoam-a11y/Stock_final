import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { AnimatedPressable, ScreenContainer } from "@/components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePermission } from "@/hooks/usePermission";
import { getServiceLogs } from "@/services/api";
import { useSettingsStore } from "@/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

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
        setLogs(response.data.logs || []);
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

  const getLevelColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case "ERROR":
      case "CRITICAL":
        return uiTokens.colors.error;
      case "WARN":
      case "WARNING":
        return uiTokens.colors.warning;
      case "INFO":
        return uiTokens.colors.accent;
      case "DEBUG":
        return uiTokens.colors.textMuted;
      default:
        return uiTokens.colors.textSecondary;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      return log.message?.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

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
          <Ionicons
            name="cloud-offline-outline"
            size={20}
            color={uiTokens.colors.warning}
          />
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

      <View style={styles.content}>
        {filteredLogs.length === 0 && !loading ? (
          <View style={styles.centered}>
            <Ionicons
              name="document-text-outline"
              size={64}
              color={uiTokens.colors.textMuted}
            />
            <Text style={styles.emptyText}>No logs found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? "Try a different search term" : "Logs will appear here when available"}
            </Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <View key={index} style={styles.logEntry}>
              <View style={styles.logHeader}>
                <View style={[styles.logLevelBadge, { backgroundColor: getLevelColor(log.level) }]}>
                  <Text style={styles.logLevelText}>{log.level || "INFO"}</Text>
                </View>
                <Text style={styles.logTimestamp}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A"}
                </Text>
              </View>
              <Text style={styles.logMessage}>{log.message || "No message"}</Text>
            </View>
          ))
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
    margin: uiTokens.spacing.lg,
    marginBottom: 0,
    padding: uiTokens.spacing.md,
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
    padding: uiTokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: uiTokens.colors.border,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: uiTokens.colors.surfaceElevated,
    borderRadius: uiTokens.radius.md,
    paddingHorizontal: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.md,
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
    gap: uiTokens.spacing.sm,
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
    padding: uiTokens.spacing.lg,
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
