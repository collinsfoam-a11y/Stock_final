import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GlassCard, LoadingSpinner, ScreenContainer } from "../../src/components/ui";
import { ColumnSettingsModal } from "../../src/components/admin/realtime-dashboard/ColumnSettingsModal";
import { ItemDetailsModal } from "../../src/components/admin/realtime-dashboard/ItemDetailsModal";
import { RealtimeDashboardSummary } from "../../src/components/admin/realtime-dashboard/RealtimeDashboardSummary";
import { RealtimeDashboardTable } from "../../src/components/admin/realtime-dashboard/RealtimeDashboardTable";
import { RealtimeDashboardToolbar } from "../../src/components/admin/realtime-dashboard/RealtimeDashboardToolbar";
import { RealtimeStatsStrip } from "../../src/components/admin/realtime-dashboard/RealtimeStatsStrip";
import {
  getRealtimeDashboardConnectionState,
  shouldRefreshRealtimeDashboard,
} from "../../src/components/admin/realtime-dashboard/realtimeDashboardLive";
import {
  Column,
  DashboardItem,
  DashboardStats,
  IS_WEB,
  Pagination,
  Summary,
} from "../../src/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useWebSocket } from "../../src/hooks/useWebSocket";
import api from "../../src/services/api/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  page_size: 50,
  total_pages: 1,
  has_next: false,
  has_prev: false,
};

export default function RealtimeDashboard() {
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const refreshDashboardSnapshotRef = useRef<((page?: number) => Promise<void>) | null>(
    null,
  );
  const paginationPageRef = useRef(1);
  const effectiveAutoRefreshRef = useRef(true);
  const offlineModeRef = useRef(false);
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
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
    [effectiveAutoRefresh, isConnected, offlineMode],
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible),
    [columns],
  );

  const fetchData = useCallback(
    async (page = 1) => {
      if (offlineMode) {
        setError(
          "Real-time dashboard is unavailable while offline mode is enabled.",
        );
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
          filters:
            verifiedFilter !== null ? { verified: verifiedFilter } : undefined,
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
    [
      offlineMode,
      autoRefresh,
      columns,
      pagination.page_size,
      sortBy,
      sortOrder,
      verifiedFilter,
    ],
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
    [fetchData, fetchStats, pagination.page],
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
      const response = await api.get(
        "/api/dashboard/columns?report_type=verified_items",
      );
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
        column.field === field
          ? { ...column, visible: !column.visible }
          : column,
      ),
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

  const handleExportCSV = async () => {
    if (offlineMode) {
      Alert.alert(
        "Offline Mode",
        "Dashboard exports require a live connection.",
      );
      return;
    }

    try {
      const config = {
        columns: columns.map((column) => ({
          field: column.field,
          visible: column.visible,
        })),
        filters:
          verifiedFilter !== null ? { verified: verifiedFilter } : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      const response = await api.post("/api/dashboard/export/csv", config, {
        responseType: "blob",
      });

      if (IS_WEB) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `dashboard_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  if (loading) {
    return (
      <ScreenContainer
        gradient
        header={{
          title: "Real-Time Dashboard",
          subtitle: `${summary?.filtered_records || 0} items`,
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <LoadingSpinner size={48} color={auroraTheme.colors.primary[500]} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      gradient
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
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {offlineMode && (
          <GlassCard style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeTitle}>
              Real-time dashboard unavailable offline
            </Text>
            <Text style={styles.offlineNoticeBody}>
              Live dashboard data, stats, and exports require a server
              connection. Reconnect to refresh this screen.
            </Text>
          </GlassCard>
        )}

        {error && (
          <GlassCard style={styles.errorNotice}>
            <Text style={styles.errorText}>{error}</Text>
          </GlassCard>
        )}

        <RealtimeStatsStrip stats={stats} />

        <RealtimeDashboardToolbar
          actionsDisabled={offlineMode}
          autoRefresh={effectiveAutoRefresh}
          connectionState={connectionState}
          onExportCSV={handleExportCSV}
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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: auroraTheme.colors.text.primary,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: auroraTheme.spacing.md,
    paddingBottom: 32,
  },
  offlineNotice: {
    marginBottom: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
  },
  offlineNoticeTitle: {
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  offlineNoticeBody: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  errorNotice: {
    marginBottom: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
  },
  errorText: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 12,
  },
});
