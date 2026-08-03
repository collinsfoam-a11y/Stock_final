import React, { useMemo } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  DashboardItem,
  formatValue,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface ItemDetailsModalProps {
  item: DashboardItem | null;
  onClose: () => void;
  visible: boolean;
}

type ItemDetailsTokens = ReturnType<typeof useUiTokens>;

export function ItemDetailsModal({ item, onClose, visible }: ItemDetailsModalProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  if (!item) return null;

  const detailRows = [
    { label: "Item Code", value: item.item_code },
    { label: "Item Name", value: item.item_name },
    { label: "Barcode", value: item.barcode },
    { label: "Category", value: item.category },
    { label: "Warehouse", value: item.warehouse },
    { label: "Floor", value: item.floor },
    { label: "Rack", value: item.rack_id },
    { label: "ERP Qty", value: item.stock_qty, format: "number" },
    { label: "Counted Qty", value: item.counted_qty, format: "number" },
    { label: "Variance", value: item.variance, format: "number" },
    {
      label: "Variance %",
      value: item.variance_percentage,
      format: "percentage",
    },
    { label: "MRP", value: item.mrp, format: "currency" },
    { label: "Status", value: item.verified ? "Verified" : "Pending" },
    { label: "Verified By", value: item.verified_by },
    { label: "Verified At", value: item.verified_at, format: "date" },
    { label: "Counted By", value: item.counted_by },
    { label: "Counted At", value: item.counted_at, format: "date" },
    { label: "Session ID", value: item.session_id },
    { label: "Notes", value: item.notes },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Item Details</Text>
            <AppTouchable
              {...getAccessibleButtonProps({ label: "Close item details" })}
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={uiTokens.colors.textPrimary} />
            </AppTouchable>
          </View>

          <ScrollView
            style={styles.detailsList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
          >
            {detailRows.map(
              (row, index) =>
                row.value !== undefined &&
                row.value !== null && (
                  <View key={index} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{formatValue(row.value, row.format)}</Text>
                  </View>
                )
            )}
          </ScrollView>

          <AppTouchable
            {...getAccessibleButtonProps({ label: "Close item details" })}
            style={styles.doneButton}
            onPress={onClose}
 >
            <Text style={styles.doneButtonText}>Close</Text>
          </AppTouchable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (uiTokens: ItemDetailsTokens) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: uiTokens.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      width: "90%",
      maxWidth: 500,
      maxHeight: "85%",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.xl,
      padding: uiTokens.spacing.lg,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: uiTokens.colors.textPrimary,
    },
    closeButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
    },
    detailsList: {
      flex: 1,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: uiTokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: uiTokens.colors.border,
    },
    detailLabel: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      flex: 1,
    },
    detailValue: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
      flex: 1,
      textAlign: "right",
    },
    doneButton: {
      ...getMinimumTouchTargetStyle(),
      marginTop: uiTokens.spacing.lg,
      borderRadius: uiTokens.radius.md,
      backgroundColor: uiTokens.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.md,
    },
    doneButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: uiTokens.colors.surface,
    },
  });
