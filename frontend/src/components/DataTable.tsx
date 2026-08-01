import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { borderRadius, spacing, typography } from "@/theme/unified";

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number;
  render?: (value: any, row: any) => React.ReactNode;
}

export interface TableData {
  [key: string]: any;
}

interface DataTableProps {
  columns: TableColumn[];
  data: TableData[];
  sortable?: boolean;
  filterable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  onRowPress?: (row: TableData) => void;
  emptyText?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  sortable = true,
  filterable: _filterable = false,
  paginated = false,
  pageSize = 20,
  onRowPress,
  emptyText = "No records found",
}) => {
  const t = useUiTokens();
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortable || !sortColumn) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue === bValue) {
        return 0;
      }

      const comparison = aValue < bValue ? -1 : 1;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, sortable]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!paginated) {
      return sortedData;
    }

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, pageSize, paginated]);

  const totalPages = Math.ceil((sortedData.length || 1) / pageSize);

  // Handle sort
  const handleSort = (column: string) => {
    if (!sortable) {
      return;
    }

    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Render header
  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: t.colors.surfaceElevated, borderBottomColor: t.colors.border }]}>
      {columns.map((column) => (
        <AppTouchable
          key={column.key}
          style={[styles.headerCell, column.width ? { width: column.width, flex: 0 } : { flex: 1 }] as any}
          onPress={() => column.sortable && handleSort(column.key)}
          disabled={!column.sortable}
        >
          <Text style={[styles.headerText, { color: t.colors.textSecondary }]}>{column.label}</Text>
          {sortable && column.sortable && sortColumn === column.key && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
              size={14}
              color={t.colors.accent}
              style={styles.sortIcon}
            />
          )}
        </AppTouchable>
      ))}
    </View>
  );

  // Render row
  const renderRow = (item: TableData, index: number) => (
    <AppTouchable
      key={index}
      style={[
        styles.row,
        { borderBottomColor: t.colors.border },
        index % 2 === 1 && { backgroundColor: `${t.colors.border}22` },
      ]}
      onPress={() => onRowPress?.(item)}
      disabled={!onRowPress}
      accessibilityLabel="Select row"
    >
      {columns.map((column) => (
        <View
          key={column.key}
          style={[styles.cell, column.width ? { width: column.width, flex: 0 } : { flex: 1 }] as any}
        >
          {column.render ? (
            column.render(item[column.key], item)
          ) : (
            <Text style={[styles.cellText, { color: t.colors.textPrimary }]}>
              {String(item[column.key] ?? "")}
            </Text>
          )}
        </View>
      ))}
    </AppTouchable>
  );

  // Render pagination
  const renderPagination = () => {
    if (!paginated || totalPages <= 1) {
      return null;
    }

    return (
      <View style={[styles.pagination, { backgroundColor: t.colors.surfaceElevated, borderTopColor: t.colors.border }]}>
        <AppTouchable
          style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
          onPress={() => setCurrentPage(currentPage - 1)}
          disabled={currentPage === 1}
          accessibilityLabel="Previous page"
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={currentPage === 1 ? t.colors.textMuted : t.colors.accent}
          />
        </AppTouchable>
        <Text style={[styles.paginationText, { color: t.colors.textSecondary }]}>
          Page {currentPage} of {totalPages}
        </Text>
        <AppTouchable
          style={[
            styles.paginationButton,
            currentPage === totalPages && styles.paginationButtonDisabled,
          ]}
          onPress={() => setCurrentPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          accessibilityLabel="Next page"
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={currentPage === totalPages ? t.colors.textMuted : t.colors.accent}
          />
        </AppTouchable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      {renderHeader()}
      <View style={styles.tableWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.horizontalScroll}
        >
          <View style={styles.tableContent}>
            {paginatedData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={32} color={t.colors.textMuted} />
                <Text style={[styles.emptyText, { color: t.colors.textMuted }]}>{emptyText}</Text>
              </View>
            ) : (
              paginatedData.map((item, index) => {
                const keyParts = columns.map((col) => String(item[col.key] || "")).join("-");
                const key = `row-${index}-${keyParts.substring(0, 30)}`;
                return <React.Fragment key={key}>{renderRow(item, index)}</React.Fragment>;
              })
            )}
          </View>
        </ScrollView>
      </View>
      {renderPagination()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableWrapper: {
    maxHeight: 400,
  },
  horizontalScroll: {
    flexGrow: 0,
  },
  tableContent: {
    minWidth: "100%",
  },
  header: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  headerCell: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 100,
  },
  headerText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  sortIcon: {
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  cell: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minWidth: 100,
    justifyContent: "center",
  },
  cellText: {
    fontSize: typography.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    fontWeight: "500",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  paginationButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  paginationButtonDisabled: {
    opacity: 0.4,
  },
  paginationText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
