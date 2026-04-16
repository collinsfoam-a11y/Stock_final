import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { AnimatedPressable, ScreenContainer } from "@/components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { getServiceLogs } from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";

export default function LogsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
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
        filterLevel === "ALL" ? undefined : filterLevel,
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
      router.back();
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
        return "#f44336";
      case "WARN":
      case "WARNING":
        return "#FF9800";
      case "INFO":
        return "#2196F3";
      case "DEBUG":
        return "#9E9E9E";
      default:
        return "#aaa";
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
        subtitle: offlineMode
          ? "Live logs unavailable offline"
          : "Real-time Log Viewer",
        showBackButton: true,
        customRightContent: (
          <AnimatedPressable
            style={[styles.refreshButton, offlineMode && styles.disabledButton]}
            onPress={loadLogs}
          >
            <Ionicons
              name="refresh"
              size={24}
              color={auroraTheme.colors.text.primary}
            />
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
            color={auroraTheme.colors.warning[500]}
          />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Live logs unavailable offline</Text>
            <Text style={styles.noticeBody}>
              Service logs are fetched from the backend and are not cached on this
              device. Reconnect to inspect live log output.
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
            color={auroraTheme.colors.text.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search logs..."
            placeholderTextColor={auroraTheme.colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.levelFilters}>
          {["ALL", "ERROR", "WARN", "INFO", "DEBUG"].map((level) => {
            const isActive = filterLevel === level;
            return (
              <AnimatedPressable
                key={level}
                style={[
                  styles.levelFilter,
                  isActive && styles.levelFilterActive,
                ]}
                onPress={() => setFilterLevel(level)}
              >
                <Text
                  style={[
                    styles.levelFilterText,
                    isActive && styles.levelFilterTextActive,
                  ]}
                >
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
              color={auroraTheme.colors.text.muted}
            />
            <Text style={styles.emptyText}>No logs found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? "Try a different search term"
                : "Logs will appear here when available"}
            </Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <View key={index} style={styles.logEntry}>
              <View style={styles.logHeader}>
                <View
                  style={[
                    styles.logLevelBadge,
                    { backgroundColor: getLevelColor(log.level) },
                  ]}
                >
                  <Text style={styles.logLevelText}>{log.level || "INFO"}</Text>
                </View>
                <Text style={styles.logTimestamp}>
                  {log.timestamp
                    ? new Date(log.timestamp).toLocaleString()
                    : "N/A"}
                </Text>
              </View>
              <Text style={styles.logMessage}>
                {log.message || "No message"}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 10,
    color: auroraTheme.colors.text.primary,
    fontSize: 16,
  },
  refreshButton: {
    padding: 8,
    borderRadius: auroraTheme.borderRadius.md,
  },
  disabledButton: {
    opacity: 0.45,
  },
  noticeCard: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
    margin: auroraTheme.spacing.lg,
    marginBottom: 0,
    padding: auroraTheme.spacing.md,
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    color: auroraTheme.colors.text.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  noticeBody: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  filtersContainer: {
    backgroundColor: auroraTheme.colors.surface.base,
    padding: auroraTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: auroraTheme.colors.surface.elevated,
    borderRadius: auroraTheme.borderRadius.md,
    paddingHorizontal: auroraTheme.spacing.md,
    marginBottom: auroraTheme.spacing.md,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    paddingVertical: 10,
  },
  levelFilters: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  levelFilter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: auroraTheme.colors.surface.elevated,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
  },
  levelFilterActive: {
    backgroundColor: auroraTheme.colors.primary[500],
    borderColor: auroraTheme.colors.primary[500],
  },
  levelFilterText: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  levelFilterTextActive: {
    color: "#fff",
  },
  content: {
    flex: 1,
    padding: auroraTheme.spacing.lg,
  },
  logEntry: {
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: auroraTheme.colors.border.subtle,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  logLevelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  logTimestamp: {
    fontSize: 11,
    color: auroraTheme.colors.text.muted,
  },
  logMessage: {
    fontSize: 13,
    color: auroraTheme.colors.text.primary,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: auroraTheme.colors.text.muted,
    textAlign: "center",
  },
});
