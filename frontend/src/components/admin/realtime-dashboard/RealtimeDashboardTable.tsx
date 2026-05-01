import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import {
  DashboardItem,
  Pagination,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import type { Column } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

interface RealtimeDashboardTableProps {
  data: DashboardItem[];
  onItemPress: (item: DashboardItem) => void;
  onPageChange: (page: number) => void;
  onSort: (field: string) => void;
  pagination: Pagination;
  sortBy: string;
  sortOrder: "asc" | "desc";
  visibleColumns: Column[];
}

export function RealtimeDashboardTable({
  data,
  onItemPress,
  onPageChange,
  onSort,
  pagination,
  sortBy,
  sortOrder,
  visibleColumns: _visibleColumns,
}: RealtimeDashboardTableProps) {
  const sessionRows = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        firstItem: DashboardItem;
        issues: number;
        sessionId: string;
        total: number;
        verified: number;
      }
    >();

    data.forEach((item) => {
      const sessionId = item.session_id || "Unassigned";
      const existing = groups.get(sessionId) || {
        firstItem: item,
        issues: 0,
        sessionId,
        total: 0,
        verified: 0,
      };

      existing.total += 1;
      if (item.verified) existing.verified += 1;
      if (Number(item.variance || 0) !== 0) existing.issues += 1;
      groups.set(sessionId, existing);
    });

    return Array.from(groups.values());
  }, [data]);

  const renderSortButton = (field: string, label: string) => {
    const active = sortBy === field;
    return (
      <TouchableOpacity
        style={[styles.sortButton, active && styles.sortButtonActive]}
        onPress={() => onSort(field)}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${label}`}
      >
        <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>{label}</Text>
        {active ? (
          <Ionicons
            name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
            size={14}
            color={auroraTheme.colors.primary[700]}
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.listTitle}>Active List</Text>
            <Text style={styles.listSubtitle}>Session status and issue counts</Text>
          </View>
          <View style={styles.sortRow}>
            {renderSortButton("counted_at", "Latest")}
            {renderSortButton("session_id", "Session")}
            {renderSortButton("variance", "Issues")}
          </View>
        </View>

        {sessionRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={auroraTheme.colors.text.secondary}
            />
            <Text style={styles.emptyText}>No active sessions found</Text>
            <Text style={styles.emptySubtext}>Everything is up to date</Text>
          </View>
        ) : (
          sessionRows.map((session) => {
            const progress =
              session.total > 0 ? Math.round((session.verified / session.total) * 100) : 0;
            const status = session.issues > 0 ? "Issues" : progress >= 100 ? "Complete" : "Active";
            return (
              <TouchableOpacity
                key={session.sessionId}
                style={styles.sessionRow}
                onPress={() => onItemPress(session.firstItem)}
                accessibilityRole="button"
                accessibilityLabel={`View details for session ${session.sessionId}`}
              >
                <View style={styles.sessionCell}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {session.sessionId}
                  </Text>
                  <Text style={styles.itemCode}>{session.total} item(s)</Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    status === "Issues"
                      ? styles.statusPending
                      : status === "Complete"
                        ? styles.statusVerified
                        : styles.statusActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      status === "Issues"
                        ? styles.statusPendingText
                        : status === "Complete"
                          ? styles.statusVerifiedText
                          : styles.statusActiveText,
                    ]}
                  >
                    {status}
                  </Text>
                </View>

                <View style={styles.progressCell}>
                  <Text style={styles.progressText}>{progress}%</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                </View>

                <View style={styles.issueCell}>
                  <Text style={[styles.issueCount, session.issues > 0 && styles.negativeValue]}>
                    {session.issues}
                  </Text>
                  <Text style={styles.issueLabel}>Issues</Text>
                </View>

                <View style={styles.detailsButton}>
                  <Text style={styles.detailsButtonText}>View Details</Text>
                  <Ionicons name="chevron-forward" size={16} color="#0f766e" />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, !pagination.has_prev && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page - 1)}
          disabled={!pagination.has_prev}
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.pageInfo}>
          Page {pagination.page} of {pagination.total_pages}
        </Text>

        <TouchableOpacity
          style={[styles.pageButton, !pagination.has_next && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page + 1)}
          disabled={!pagination.has_next}
        >
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    backgroundColor: "#ffffff",
    borderRadius: auroraTheme.borderRadius.lg,
    marginBottom: auroraTheme.spacing.lg,
    borderWidth: 1,
    borderColor: "#d9e5e2",
  },
  listHeader: {
    gap: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  listSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#475569",
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.sm,
  },
  sortButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: auroraTheme.spacing.md,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sortButtonActive: {
    backgroundColor: "#ecf7f4",
    borderColor: "#0f766e",
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  sortButtonTextActive: {
    color: "#0f766e",
  },
  itemCard: {
    padding: auroraTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  sessionRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  sessionCell: {
    flex: 1.4,
    minWidth: 120,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: auroraTheme.spacing.md,
    marginBottom: auroraTheme.spacing.md,
  },
  itemIdentity: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  itemCode: {
    marginTop: 2,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusVerified: {
    backgroundColor: "#ecfdf5",
    borderColor: "#bbf7d0",
  },
  statusPending: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  statusActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusVerifiedText: {
    color: "#15803d",
  },
  statusPendingText: {
    color: "#b45309",
  },
  statusActiveText: {
    color: "#2563eb",
  },
  progressCell: {
    flex: 1,
    minWidth: 92,
  },
  progressText: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#15803d",
  },
  issueCell: {
    minWidth: 62,
    alignItems: "center",
  },
  issueCount: {
    fontSize: 18,
    fontWeight: "900",
    color: "#15803d",
  },
  issueLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.sm,
  },
  metricItem: {
    flexGrow: 1,
    flexBasis: 130,
    padding: auroraTheme.spacing.sm,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 4,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "800",
  },
  negativeValue: {
    color: "#dc2626",
  },
  positiveValue: {
    color: "#15803d",
  },
  itemFooter: {
    minHeight: 44,
    marginTop: auroraTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: auroraTheme.spacing.md,
  },
  timestamp: {
    flex: 1,
    fontSize: 12,
    color: "#64748b",
  },
  detailsButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: auroraTheme.spacing.md,
    borderRadius: 10,
    backgroundColor: "#ecf7f4",
  },
  detailsButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f766e",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: auroraTheme.colors.text.secondary,
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 13,
    color: auroraTheme.colors.text.tertiary,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.lg,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: auroraTheme.colors.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  pageButtonDisabled: {
    backgroundColor: auroraTheme.colors.surface.elevated,
    opacity: 0.5,
  },
  pageInfo: {
    fontSize: 14,
    color: auroraTheme.colors.text.primary,
  },
});
