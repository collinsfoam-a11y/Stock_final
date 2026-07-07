import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ModernCard, LoadingSpinner, ScreenContainer } from "@/components/ui";
import { ColumnSettingsModal } from "@/components/admin/realtime-dashboard/ColumnSettingsModal";
import { ItemDetailsModal } from "@/components/admin/realtime-dashboard/ItemDetailsModal";
import { RealtimeDashboardSummary } from "@/components/admin/realtime-dashboard/RealtimeDashboardSummary";
import { RealtimeDashboardTable } from "@/components/admin/realtime-dashboard/RealtimeDashboardTable";
import { RealtimeDashboardToolbar } from "@/components/admin/realtime-dashboard/RealtimeDashboardToolbar";
import { RealtimeStatsStrip } from "@/components/admin/realtime-dashboard/RealtimeStatsStrip";
import {
  getRealtimeDashboardConnectionState,
  shouldRefreshRealtimeDashboard,
} from "@/components/admin/realtime-dashboard/realtimeDashboardLive";
import {
  Column,
  DashboardItem,
  DashboardStats,
  Pagination,
  Summary,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useWebSocket } from "@/hooks/useWebSocket";
import api from "@/services/api/api";
import { useSettingsStore } from "@/store/settingsStore";
import { saveArrayBufferExport } from "@/utils/fileExport";
import { useUiTokens } from "@/hooks/useUiTokens";

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  page_size: 50,
  total_pages: 1,
  has_next: false,
  has_prev: false,
};

export default function RealtimeDashboard() {
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshDashboardSnapshotRef = useRef<((page?: number) => Promise<void>) | null>(null);
  const paginationPageRef = useRef(1);
  const effectiveAutoRefreshRef = useRef(true);
  const offlineModeRef = useRef(false);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { isConnected, lastMessage } = useWebSocket();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardItem[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);

  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DashboardItem | null>(null);
  const [showItemDetails, setShowItemDetails] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortBy, setSortBy] = useState("counted_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [verifiedFilter, setVerifiedFilter] = useState<boolean | null>(null);
  const effectiveAutoRefresh = autoRefresh && !offlineMode;
  const connectionState = useMemo(
    () =>
      getRealtimeDashboardConnectionState({
        autoRefresh: effectiveAutoRefresh,
        isConnected,
        offlineMode,
      }),
    [effectiveAutoRefresh, isConnected, offlineMode]
  );

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  const fetchData = useCallback(
    async (page = 1) => {
      if (offlineMode) {
        setError("Real-time dashboard is unavailable while offline mode is enabled.");
        setData([]);
        setColumns([]);
        setStats(null);
        setSummary(null);
        setPagination(DEFAULT_PAGINATION);
        return;
      }

      try {
        const config = {
          page,
          page_size: pagination.page_size,
          sort_by: sortBy,
          sort_order: sortOrder,
          columns: columns.map((column) => ({
            field: column.field,
            visible: column.visible,
          })),
          filters: verifiedFilter !== null ? { verified: verifiedFilter } : undefined,
          auto_refresh: autoRefresh,
          refresh_interval_seconds: 10,
        };

        const response = await api.post("/api/dashboard/data", config);

        if (response.data.success) {
          setData(response.data.data);
          if (response.data.columns && columns.length === 0) {
            setColumns(response.data.columns);
          }
          setSummary(response.data.summary);
          setPagination(response.data.pagination);
          setError(null);
        }
      } catch (error: any) {
        console.error("Dashboard data fetch error:", error);
        setError(error.message || "Failed to fetch data");
      }
    },
    [offlineMode, autoRefresh, columns, pagination.page_size, sortBy, sortOrder, verifiedFilter]
  );

  const fetchStats = useCallback(async () => {
    if (offlineMode) {
      setStats(null);
      return;
    }

    try {
      const response = await api.get("/api/dashboard/stats");
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error("Stats fetch error:", error);
    }
  }, [offlineMode]);

  const refreshDashboardSnapshot = useCallback(
    async (page = pagination.page) => {
      await Promise.all([fetchData(page), fetchStats()]);
    },
    [fetchData, fetchStats, pagination.page]
  );

  useEffect(() => {
    refreshDashboardSnapshotRef.current = refreshDashboardSnapshot;
  }, [refreshDashboardSnapshot]);

  useEffect(() => {
    paginationPageRef.current = pagination.page;
  }, [pagination.page]);

  useEffect(() => {
    effectiveAutoRefreshRef.current = effectiveAutoRefresh;
    offlineModeRef.current = offlineMode;
  }, [effectiveAutoRefresh, offlineMode]);

  const clearRealtimeRefreshTimeout = useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
      realtimeRefreshTimeoutRef.current = null;
    }
  }, []);

  const requestRealtimeRefresh = useCallback(() => {
    if (!effectiveAutoRefresh || offlineMode) {
      clearRealtimeRefreshTimeout();
      return;
    }

    clearRealtimeRefreshTimeout();

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      if (!effectiveAutoRefreshRef.current || offlineModeRef.current) {
        return;
      }
      void refreshDashboardSnapshotRef.current?.(paginationPageRef.current);
    }, 300);
  }, [clearRealtimeRefreshTimeout, effectiveAutoRefresh, offlineMode]);

  const fetchColumns = useCallback(async () => {
    if (offlineMode) {
      setColumns([]);
      return;
    }

    try {
      const response = await api.get("/api/dashboard/columns?report_type=verified_items");
      if (response.data.success) {
        setColumns(response.data.columns);
      }
    } catch (error) {
      console.error("Columns fetch error:", error);
    }
  }, [offlineMode]);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await fetchColumns();
      await refreshDashboardSnapshotRef.current?.(1);
      setLoading(false);
    };

    void initialize();
  }, [fetchColumns, offlineMode]);

  useEffect(() => {
    if (effectiveAutoRefresh && !isConnected) {
      refreshIntervalRef.current = setInterval(() => {
        void refreshDashboardSnapshotRef.current?.(paginationPageRef.current);
      }, 10000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [effectiveAutoRefresh, isConnected]);

  useEffect(() => {
    if (!effectiveAutoRefresh || offlineMode) {
      clearRealtimeRefreshTimeout();
    }
  }, [clearRealtimeRefreshTimeout, effectiveAutoRefresh, offlineMode]);

  useEffect(() => {
    if (!shouldRefreshRealtimeDashboard(lastMessage)) {
      return;
    }

    requestRealtimeRefresh();
  }, [lastMessage, requestRealtimeRefresh]);

  useEffect(() => {
    return () => {
      clearRealtimeRefreshTimeout();
    };
  }, [clearRealtimeRefreshTimeout]);

  useEffect(() => {
    if (!loading) {
      fetchData(pagination.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder, verifiedFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshDashboardSnapshot(pagination.page);
    setRefreshing(false);
  };

  const handleColumnToggle = (field: string) => {
    setColumns((prev) =>
      prev.map((column) =>
        column.field === field ? { ...column, visible: !column.visible } : column
      )
    );
  };

  const handleResetColumns = async () => {
    await fetchColumns();
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handlePageChange = (page: number) => {
    if (offlineMode) {
      return;
    }

    setPagination((prev) => ({ ...prev, page }));
    fetchData(page);
  };

  const handleItemPress = (item: DashboardItem) => {
    setSelectedItem(item);
    setShowItemDetails(true);
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Dashboard exports require a live connection.");
      return;
    }

    try {
      const config = {
        columns: columns.map((column) => ({
          field: column.field,
          visible: column.visible,
        })),
        filters: verifiedFilter !== null ? { verified: verifiedFilter } : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      const response = await api.post(`/api/dashboard/export/${format}`, config, {
        responseType: "arraybuffer",
      });

      await saveArrayBufferExport(
        response.data as ArrayBuffer,
        `dashboard_erpnext_import_${Date.now()}.${format}`,
        format === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  if (loading) {
    return (
      <ScreenContainer
        header={{
          title: "Real-Time Dashboard",
          subtitle: `${summary?.filtered_records || 0} items`,
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <LoadingSpinner size={48} color={uiTokens.colors.accent} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      header={{
        title: "Real-Time Dashboard",
        subtitle: `${summary?.filtered_records || 0} items`,
        showBackButton: true,
      }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={uiTokens.colors.accent}
          />
        }
      >
        {offlineMode && (
          <ModernCard style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeTitle}>Real-time dashboard unavailable offline</Text>
            <Text style={styles.offlineNoticeBody}>
              Live dashboard data, stats, and exports require a server connection. Reconnect to
              refresh this screen.
            </Text>
          </ModernCard>
        )}

        {!!error && (
          <ModernCard style={styles.errorNotice}>
            <Text style={styles.errorText}>{error}</Text>
          </ModernCard>
        )}

        <RealtimeStatsStrip stats={stats} />

        <RealtimeDashboardToolbar
          actionsDisabled={offlineMode}
          autoRefresh={effectiveAutoRefresh}
          connectionState={connectionState}
          onExportCSV={() => void handleExport("csv")}
          onExportXLSX={() => void handleExport("xlsx")}
          onOpenColumnSettings={() => setShowColumnSettings(true)}
          onToggleAutoRefresh={() => {
            if (!offlineMode) {
              setAutoRefresh((prev) => !prev);
            }
          }}
          onToggleVerifiedFilter={setVerifiedFilter}
          summary={summary}
          verifiedFilter={verifiedFilter}
        />

        <RealtimeDashboardTable
          data={data}
          onItemPress={handleItemPress}
          onPageChange={handlePageChange}
          onSort={handleSort}
          pagination={pagination}
          sortBy={sortBy}
          sortOrder={sortOrder}
          visibleColumns={visibleColumns}
        />

        <RealtimeDashboardSummary summary={summary} />
      </ScrollView>

      <ColumnSettingsModal
        visible={showColumnSettings}
        columns={columns}
        onClose={() => setShowColumnSettings(false)}
        onToggle={handleColumnToggle}
        onResetDefaults={handleResetColumns}
      />

      <ItemDetailsModal
        visible={showItemDetails}
        item={selectedItem}
        onClose={() => setShowItemDetails(false)}
      />
    </ScreenContainer>
  );
}

type RealtimeDashboardTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: RealtimeDashboardTokens) =>
  StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: uiTokens.spacing.md,
    fontSize: 16,
    color: uiTokens.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: uiTokens.spacing.md,
    paddingBottom: uiTokens.spacing.xl,
  },
  offlineNotice: {
    marginBottom: uiTokens.spacing.md,
    padding: uiTokens.spacing.md,
  },
  offlineNoticeTitle: {
    color: uiTokens.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: uiTokens.spacing.xs,
  },
  offlineNoticeBody: {
    color: uiTokens.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  errorNotice: {
    marginBottom: uiTokens.spacing.md,
    padding: uiTokens.spacing.md,
  },
  errorText: {
    color: uiTokens.colors.textSecondary,
    fontSize: 12,
  },
});
