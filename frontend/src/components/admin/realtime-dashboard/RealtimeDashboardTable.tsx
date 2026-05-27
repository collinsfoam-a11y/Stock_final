import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { VirtualList } from "@/components/common/VirtualList";
import {
  Column,
  DashboardItem,
  formatValue,
  IS_WEB,
  Pagination,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

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

type TableStyles = ReturnType<typeof createStyles>;

type TableRowProps = {
  index: number;
  item: DashboardItem;
  onItemPress: (item: DashboardItem) => void;
  styles: TableStyles;
  visibleColumns: Column[];
};

const TableRow = React.memo(function TableRow({
  index,
  item,
  onItemPress,
  styles,
  visibleColumns,
}: TableRowProps) {
  return (
    <TouchableOpacity
      {...getAccessibleButtonProps({
        label: `Open item ${item.item_code || item.barcode || item.id}`,
      })}
      style={[
        styles.tableRow,
        index % 2 === 0 && styles.tableRowAlt,
        item.verified && styles.tableRowVerified,
      ]}
      onPress={() => onItemPress(item)}
    >
      {visibleColumns.map((column) => (
        <View
          key={column.field}
          style={[styles.tableCell, { width: column.width || DEFAULT_COLUMN_WIDTH }]}
        >
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
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const tableWidth = React.useMemo(
    () =>
      visibleColumns.reduce((total, column) => total + (column.width || DEFAULT_COLUMN_WIDTH), 0),
    [visibleColumns]
  );

  const renderRow = React.useCallback(
    ({ item, index }: { item: DashboardItem; index: number }) => (
      <TableRow
        index={index}
        item={item}
        onItemPress={onItemPress}
        styles={styles}
        visibleColumns={visibleColumns}
      />
    ),
    [onItemPress, styles, visibleColumns]
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
              {visibleColumns.map((column) => {
                const isSorted = column.sortable && sortBy === column.field;

                return (
                  <TouchableOpacity
                    {...getAccessibleButtonProps({
                      label: `Sort by ${column.label}`,
                      disabled: !column.sortable,
                      selected: isSorted,
                    })}
                    key={column.field}
                    style={[
                      styles.tableHeaderCell,
                      { width: column.width || DEFAULT_COLUMN_WIDTH },
                    ]}
                    onPress={() => column.sortable && onSort(column.field)}
                    disabled={!column.sortable}
                  >
                    <Text style={styles.tableHeaderText}>{column.label}</Text>
                    {isSorted && (
                      <Ionicons
                        name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                        size={14}
                        color={uiTokens.colors.accent}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ⚡ Bolt: Replaced FlatList with VirtualList (FlashList) to improve scrolling performance, handle potentially long dashboard items without lag, and reduce frame drops. */}
            <VirtualList
              data={data}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRow}
              extraData={visibleColumns}
              nestedScrollEnabled
              estimatedItemSize={ROW_HEIGHT}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons
                    name="document-text-outline"
                    size={48}
                    color={uiTokens.colors.textSecondary}
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
          {...getAccessibleButtonProps({
            label: "Previous realtime dashboard page",
            disabled: !pagination.has_prev,
          })}
          style={[styles.pageButton, !pagination.has_prev && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page - 1)}
          disabled={!pagination.has_prev}
        >
          <Ionicons name="chevron-back" size={20} color={uiTokens.colors.surface} />
        </TouchableOpacity>

        <Text style={styles.pageInfo}>
          Page {pagination.page} of {pagination.total_pages}
        </Text>

        <TouchableOpacity
          {...getAccessibleButtonProps({
            label: "Next realtime dashboard page",
            disabled: !pagination.has_next,
          })}
          style={[styles.pageButton, !pagination.has_next && styles.pageButtonDisabled]}
          onPress={() => onPageChange(pagination.page + 1)}
          disabled={!pagination.has_next}
        >
          <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.surface} />
        </TouchableOpacity>
      </View>
    </>
  );
}

type TableTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: TableTokens) =>
  StyleSheet.create({
    tableContainer: {
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.lg,
      overflow: "hidden",
      marginBottom: uiTokens.spacing.lg,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: uiTokens.colors.border,
    },
    tableHeaderCell: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: uiTokens.spacing.md,
      paddingVertical: uiTokens.spacing.md,
      gap: uiTokens.spacing.xs,
    },
    tableHeaderText: {
      fontSize: 12,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: uiTokens.colors.border,
      minHeight: ROW_HEIGHT,
    },
    tableRowAlt: {
      backgroundColor: colorWithAlpha(uiTokens.colors.surfaceElevated, 0.4),
    },
    tableRowVerified: {
      backgroundColor: colorWithAlpha(uiTokens.colors.success, 0.06),
    },
    tableCell: {
      paddingHorizontal: uiTokens.spacing.md,
      paddingVertical: uiTokens.spacing.md,
      justifyContent: "center",
    },
    tableCellText: {
      fontSize: 13,
      color: uiTokens.colors.textPrimary,
    },
    negativeValue: {
      color: uiTokens.colors.error,
    },
    positiveValue: {
      color: uiTokens.colors.success,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: uiTokens.spacing.xxl,
    },
    emptyText: {
      marginTop: uiTokens.spacing.md,
      fontSize: 16,
      color: uiTokens.colors.textSecondary,
    },
    pagination: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: uiTokens.spacing.lg,
      marginBottom: uiTokens.spacing.lg,
    },
    pageButton: {
      ...getMinimumTouchTargetStyle(),
      borderRadius: uiTokens.radius.full,
      backgroundColor: uiTokens.colors.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    pageButtonDisabled: {
      backgroundColor: uiTokens.colors.surfaceElevated,
      opacity: 0.5,
    },
    pageInfo: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
    },
  });
