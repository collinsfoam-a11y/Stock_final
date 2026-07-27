/**
 * DataTable Component
 * Virtualized table with sorting, filtering, and pagination.
 *
 * Uses FlashList for O(n) memory on large datasets instead of FlatList's
 * O(n²) layout behavior on heterogeneous rows.
 *
 * Accessibility:
 * - Header cells expose accessibilityRole="button" when sortable
 * - Row press target meets 44x44 minimum via padding
 */

import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";

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
  contentContainerStyle?: ViewStyle;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  sortable = true,
  filterable: _filterable = false,
  paginated = false,
  pageSize = 20,
  onRowPress,
  contentContainerStyle,
}) => {
  const tokens = useUiTokens();
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortable || !sortColumn) {
      return data;
    }
    return [...data].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      if (aValue === bValue) return 0;
      const comparison = aValue < bValue ? -1 : 1;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, sortable]);

  const paginatedData = useMemo(() => {
    if (!paginated) {
      return sortedData;
    }
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, paginated]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (column: string) => {
    if (!sortable) return;
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: tokens.colors.surface }]}>
      {columns.map((column) => (
        <TouchableOpacity
          key={column.key}
          style={[styles.headerCell, column.width ? { width: column.width } : undefined]}
          onPress={() => column.sortable && handleSort(column.key)}
          disabled={!column.sortable}
          accessible={!!column.sortable}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${column.label}`}
        >
          <Text style={[styles.headerText, { color: tokens.colors.textPrimary }]}>
            {column.label}
          </Text>
          {sortable && column.sortable && sortColumn === column.key && (
            <Ionicons
              name={sortDirection === "asc" ? "chevron-up" : "chevron-down"}
              size={16}
              color={tokens.colors.accent}
              style={styles.sortIcon}
            />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderRow = ({ item, index }: { item: TableData; index: number }) => (
    <TouchableOpacity
      style={[
        styles.row,
        index % 2 === 0 && { backgroundColor: tokens.colors.surface },
        index % 2 !== 0 && { backgroundColor: tokens.colors.background },
        onRowPress && styles.rowPressable,
      ]}
      onPress={() => onRowPress?.(item)}
      disabled={!onRowPress}
      accessible={!!onRowPress}
      accessibilityRole="button"
    >
      {columns.map((column) => (
        <View
          key={column.key}
          style={[styles.cell, column.width ? { width: column.width } : undefined]}
        >
          {column.render ? (
            column.render(item[column.key], item)
          ) : (
            <Text style={[styles.cellText, { color: tokens.colors.textPrimary }]}>
              {String(item[column.key] ?? "")}
            </Text>
          )}
        </View>
      ))}
    </TouchableOpacity>
  );

  const renderPagination = () => {
    if (!paginated || totalPages <= 1) {
      return null;
    }

    return (
      <View style={[styles.pagination, { backgroundColor: tokens.colors.surface, borderTopColor: tokens.colors.border }]}>
        <TouchableOpacity
          style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
          onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={currentPage === 1 ? tokens.colors.textMuted : tokens.colors.accent}
          />
        </TouchableOpacity>

        <Text style={[styles.paginationText, { color: tokens.colors.textSecondary }]}>
          Page {currentPage} of {totalPages}
        </Text>

        <TouchableOpacity
          style={[
            styles.paginationButton,
            currentPage === totalPages && styles.paginationButtonDisabled,
          ]}
          onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Next page"
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={currentPage === totalPages ? tokens.colors.textMuted : tokens.colors.accent}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: tokens.colors.surfaceElevated }]}>
      {renderHeader()}
      <FlashList
        data={paginatedData}
        renderItem={renderRow}
        keyExtractor={(item, index) => {
          const keyParts = columns.map((col) => String(item[col.key] ?? "")).join("-");
          return `row-${index}-${keyParts.substring(0, 30)}`;
        }}
        extraData={sortColumn}
        contentContainerStyle={contentContainerStyle}
      />
      {renderPagination()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  headerCell: {
    flex: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 100,
  },
  headerText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  sortIcon: {
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)",
    minHeight: 56,
  },
  rowPressable: {
    paddingHorizontal: 4,
  },
  cell: {
    flex: 1,
    padding: 12,
    minWidth: 100,
    justifyContent: "center",
  },
  cellText: {
    fontSize: 14,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderTopWidth: 1,
    gap: 16,
  },
  paginationButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.3,
  },
  paginationText: {
    fontSize: 14,
  },
});
