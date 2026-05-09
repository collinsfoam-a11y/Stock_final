import React from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import {
  Column,
  DashboardItem,
  formatValue,
  IS_WEB,
  Pagination,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
import { colorWithAlpha as uiColorWithAlpha } from "@/theme/themeTokens";

const ROW_HEIGHT = 48;
const DEFAULT_COLUMN_WIDTH = 120;

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

type TableRowProps = {
  index: number;
  item: DashboardItem;
  onItemPress: (item: DashboardItem) => void;
  visibleColumns: Column[];
};

const TableRow = React.memo(function TableRow({
  index,
  item,
  onItemPress,
  visibleColumns,
}: TableRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.tableRow,
        index % 2 === 0 && styles.tableRowAlt,
        item.verified && styles.tableRowVerified,
      ]}
      onPress={() => onItemPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open item ${item.item_code || item.barcode || item.id}`}
    >
      {visibleColumns.map((column) => (
        <View key={column.field} style={[styles.tableCell, { width: column.width || DEFAULT_COLUMN_WIDTH }]}>
          <Text
            style={[
              styles.tableCellText,
              column.field === "variance" &&
                (item[column.field as keyof DashboardItem] as number) < 0 &&
                styles.negativeValue,
              column.field === "variance" &&
                (item[column.field as keyof DashboardItem] as number) > 0 &&
                styles.positiveValue,
            ]}
            numberOfLines={1}
          >
            {formatValue(item[column.field as keyof DashboardItem], column.format)}
          </Text>
        </View>
      ))}
    </TouchableOpacity>
  );
});

export function RealtimeDashboardTable({
  data,
  onItemPress,
  onPageChange,
  onSort,
  pagination,
  sortBy,
  sortOrder,
  visibleColumns,
}: RealtimeDashboardTableProps) {
  const tableWidth = React.useMemo(
    () =>
      visibleColumns.reduce(
        (total, column) => total + (column.width || DEFAULT_COLUMN_WIDTH),
        0
      ),
    [visibleColumns]
  );

  const renderRow = React.useCallback(
    ({ item, index }: { item: DashboardItem; index: number }) => (
      <TableRow
        index={index}
        item={item}
        onItemPress={onItemPress}
        visibleColumns={visibleColumns}
      />
    ),
    [onItemPress, visibleColumns]
  );

  return (
    <>
      <View style={styles.tableContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={IS_WEB}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: tableWidth }}>
            <View style={styles.tableHeader}>
              {visibleColumns.map((column) => (
                <TouchableOpacity
                  key={column.field}
                  style={[styles.tableHeaderCell, { width: column.width || DEFAULT_COLUMN_WIDTH }]}
                  onPress={() => column.sortable && onSort(column.field)}
                  disabled={!column.sortable}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${column.label}`}
                  accessibilityState={{ disabled: !column.sortable }}
                >
                  <Text style={styles.tableHeaderText}>{column.label}</Text>
                  {column.sortable && sortBy === column.field && (
                    <Ionicons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={14}
                      color={auroraTheme.colors.primary[500]}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={data}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRow}
              extraData={visibleColumns}
              nestedScrollEnabled
              removeClippedSubviews
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              getItemLayout={(_, index) => ({
                length: ROW_HEIGHT,
                offset: ROW_HEIGHT * index,
                index,
              })}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                <Ionicons
                  name="document-text-outline"
                  size={48}
                  color={auroraTheme.colors.text.secondary}
                />
                <Text style={styles.emptyText}>No data found</Text>
              </View>
              }
            />
          </View>
        </ScrollView>
      </View>

      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, !pagination.has_prev && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page - 1)}
          disabled={!pagination.has_prev}
        >
          <Ionicons name="chevron-back" size={20} color={uiSemanticColors.text.inverse} />
        </TouchableOpacity>

        <Text style={styles.pageInfo}>
          Page {pagination.page} of {pagination.total_pages}
        </Text>

        <TouchableOpacity
          style={[styles.pageButton, !pagination.has_next && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page + 1)}
          disabled={!pagination.has_next}
        >
          <Ionicons name="chevron-forward" size={20} color={uiSemanticColors.text.inverse} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tableContainer: {
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.lg,
    overflow: "hidden",
    marginBottom: auroraTheme.spacing.lg,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.surface.elevated,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
  },
  tableHeaderCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.md,
    gap: 4,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
    minHeight: ROW_HEIGHT,
  },
  tableRowAlt: {
    backgroundColor: auroraTheme.colors.surface.elevated + "40",
  },
  tableRowVerified: {
    backgroundColor: uiColorWithAlpha(uiColors.success[500], 0.06),
  },
  tableCell: {
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.md,
    justifyContent: "center",
  },
  tableCellText: {
    fontSize: 13,
    color: auroraTheme.colors.text.primary,
  },
  negativeValue: {
    color: uiColors.error[500],
  },
  positiveValue: {
    color: uiColors.success[500],
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
