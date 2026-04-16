import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import {
  DashboardItem,
  formatValue,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

interface ItemDetailsModalProps {
  item: DashboardItem | null;
  onClose: () => void;
  visible: boolean;
}

export function ItemDetailsModal({
  item,
  onClose,
  visible,
}: ItemDetailsModalProps) {
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
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Item Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons
                name="close"
                size={24}
                color={auroraTheme.colors.text.primary}
              />
            </TouchableOpacity>
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
                    <Text style={styles.detailValue}>
                      {formatValue(row.value, row.format)}
                    </Text>
                  </View>
                ),
            )}
          </ScrollView>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "85%",
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.xl,
    padding: auroraTheme.spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: auroraTheme.colors.text.primary,
  },
  detailsList: {
    flex: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: auroraTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
  },
  detailLabel: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: auroraTheme.colors.text.primary,
    flex: 1,
    textAlign: "right",
  },
  doneButton: {
    marginTop: auroraTheme.spacing.lg,
    paddingVertical: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.md,
    backgroundColor: auroraTheme.colors.primary[500],
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
