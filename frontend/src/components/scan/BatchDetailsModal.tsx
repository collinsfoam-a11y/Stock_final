import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

interface Batch {
  batch_id: string;
  batch_no: string;
  barcode: string;
  mfg_date?: string;
  expiry_date?: string;
  stock_qty: number;
  opening_stock: number;
  warehouse_name?: string;
  shelf_name?: string;
  item_code: string;
  item_name: string;
}

interface BatchDetailsModalProps {
  visible: boolean;
  item: {
    item_code: string;
    item_name?: string;
    name?: string;
    barcode?: string;
  } | null;
  onClose: () => void;
  onBatchSelect: (batch: Batch, countedStock: number) => void;
}

type BatchModalTokens = ReturnType<typeof useUiTokens>;

export const BatchDetailsModal: React.FC<BatchDetailsModalProps> = ({
  visible,
  item,
  onClose,
  onBatchSelect,
}) => {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [countedStocks, setCountedStocks] = useState<{ [key: string]: string }>({});

  const fetchBatches = useCallback(async () => {
    if (!item) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/item-batches/${item.item_code}`);
      const data = await response.json();

      if (data.success) {
        setBatches(data.batches || []);
      } else {
        Alert.alert("Error", "Failed to fetch batch details");
        setBatches([]);
      }
    } catch (error) {
      console.error("Error fetching batches:", error);
      Alert.alert("Error", "Failed to fetch batch details");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    if (visible && item) {
      fetchBatches();
    }
  }, [visible, item, fetchBatches]);

  const handleCountedStockChange = (batchId: string, value: string) => {
    setCountedStocks((prev) => ({
      ...prev,
      [batchId]: value,
    }));
  };

  const handleBatchSelect = (batch: Batch) => {
    const countedStock = parseInt(countedStocks[batch.batch_id] || "0", 10);
    onBatchSelect(batch, countedStock);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const renderBatch = ({ item: batch }: { item: Batch }) => (
    <View style={styles.batchCard}>
      <View style={styles.batchHeader}>
        <Text style={styles.batchNo}>Batch: {batch.batch_no}</Text>
        <Text style={styles.stockQty}>Stock: {batch.stock_qty}</Text>
      </View>

      <View style={styles.batchDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Barcode:</Text>
          <Text style={styles.detailValue}>{batch.barcode || "N/A"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Mfg Date:</Text>
          <Text style={styles.detailValue}>{formatDate(batch.mfg_date)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Expiry:</Text>
          <Text style={styles.detailValue}>{formatDate(batch.expiry_date)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Location:</Text>
          <Text style={styles.detailValue}>
            {batch.warehouse_name || "N/A"}
            {batch.shelf_name ? ` - ${batch.shelf_name}` : ""}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Opening Stock:</Text>
          <Text style={styles.detailValue}>{batch.opening_stock}</Text>
        </View>
      </View>

      <View style={styles.countedStockContainer}>
        <Text style={styles.countedStockLabel}>Counted Stock:</Text>
        <TextInput
          style={styles.countedStockInput}
          placeholder="Enter counted quantity"
          placeholderTextColor={uiTokens.colors.textMuted}
          keyboardType="numeric"
          value={countedStocks[batch.batch_id] || ""}
          onChangeText={(value) => handleCountedStockChange(batch.batch_id, value)}
          accessibilityLabel={`Counted stock for batch ${batch.batch_no}`}
        />
      </View>

      <TouchableOpacity
        {...getAccessibleButtonProps({ label: `Select batch ${batch.batch_no}` })}
        style={styles.selectButton}
        onPress={() => handleBatchSelect(batch)}
      >
        <Text style={styles.selectButtonText}>Select Batch</Text>
      </TouchableOpacity>
    </View>
  );

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Batch Details</Text>
            <TouchableOpacity
              {...getAccessibleButtonProps({ label: "Close batch details" })}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.item_name || item.name || "Unknown Item"}</Text>
            <Text style={styles.itemCode}>Code: {item.item_code}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
              <Text style={styles.loadingText}>Loading batches...</Text>
            </View>
          ) : batches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No batches found for this item</Text>
              <Text style={styles.emptySubtext}>This item may not be in any batch</Text>
              <TouchableOpacity
                {...getAccessibleButtonProps({ label: "Continue without selecting a batch" })}
                style={styles.continueButton}
                onPress={() => {
                  // Existing flow expects a null batch when continuing without batch metadata.
                  onBatchSelect(null as any, 0);
                }}
              >
                <Text style={styles.continueButtonText}>Continue Without Batch</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              style={styles.batchList}
              data={batches}
              keyExtractor={(batch) => batch.batch_id}
              renderItem={renderBatch}
              extraData={countedStocks}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (uiTokens: BatchModalTokens) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: uiTokens.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      width: "90%",
      maxWidth: 400,
      maxHeight: "80%",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.xl,
      padding: uiTokens.spacing.lg,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
    },
    closeButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.sm,
    },
    closeButtonText: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      fontWeight: "600",
    },
    itemInfo: {
      backgroundColor: uiTokens.colors.surfaceElevated,
      padding: uiTokens.spacing.md,
      borderRadius: uiTokens.radius.md,
      marginBottom: uiTokens.spacing.md,
    },
    itemName: {
      fontSize: 16,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.xs,
    },
    itemCode: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
    },
    loadingContainer: {
      padding: uiTokens.spacing.xl,
      alignItems: "center",
    },
    loadingText: {
      fontSize: 16,
      color: uiTokens.colors.textSecondary,
    },
    emptyContainer: {
      padding: uiTokens.spacing.xl,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 16,
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.sm,
    },
    emptySubtext: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
    },
    batchList: {
      maxHeight: "60%",
    },
    batchCard: {
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing.sm,
      borderWidth: 1,
      borderColor: colorWithAlpha(uiTokens.colors.border, 0.72),
    },
    batchHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.sm,
    },
    batchNo: {
      fontSize: 14,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
    },
    stockQty: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
    },
    batchDetails: {
      marginBottom: uiTokens.spacing.md,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: uiTokens.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: uiTokens.colors.border,
    },
    detailLabel: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
    },
    detailValue: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
      textAlign: "right",
    },
    countedStockContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: uiTokens.spacing.sm,
    },
    countedStockLabel: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      marginRight: uiTokens.spacing.sm,
    },
    countedStockInput: {
      ...getMinimumTouchTargetStyle(),
      flex: 1,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      borderRadius: uiTokens.radius.sm,
      paddingHorizontal: uiTokens.spacing.sm,
      paddingVertical: uiTokens.spacing.xs,
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
    },
    selectButton: {
      ...getMinimumTouchTargetStyle(),
      backgroundColor: uiTokens.colors.accent,
      borderRadius: uiTokens.radius.md,
      paddingVertical: uiTokens.spacing.sm,
      paddingHorizontal: uiTokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    selectButtonText: {
      color: uiTokens.colors.surface,
      fontSize: 14,
      fontWeight: "600",
    },
    continueButton: {
      ...getMinimumTouchTargetStyle(),
      backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
      borderRadius: uiTokens.radius.md,
      paddingVertical: uiTokens.spacing.sm,
      paddingHorizontal: uiTokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      marginTop: uiTokens.spacing.md,
    },
    continueButtonText: {
      color: uiTokens.colors.accent,
      fontSize: 14,
      fontWeight: "600",
    },
  });
