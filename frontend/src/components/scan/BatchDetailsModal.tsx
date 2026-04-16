import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { auroraTheme } from "../../theme/auroraTheme";

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

export const BatchDetailsModal: React.FC<BatchDetailsModalProps> = ({
  visible,
  item,
  onClose,
  onBatchSelect,
}) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [countedStocks, setCountedStocks] = useState<{ [key: string]: string }>(
    {},
  );

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

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Batch Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>
              {item.item_name || item.name || "Unknown Item"}
            </Text>
            <Text style={styles.itemCode}>Code: {item.item_code}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading batches...</Text>
            </View>
          ) : batches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No batches found for this item
              </Text>
              <Text style={styles.emptySubtext}>
                This item may not be in any batch
              </Text>
              <TouchableOpacity
                style={styles.continueButton}
                onPress={() => {
                  // Continue without batch - pass null batch and 0 counted stock
                  onBatchSelect(null as any, 0);
                }}
              >
                <Text style={styles.continueButtonText}>
                  Continue Without Batch
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.batchList}>
              {batches.map((batch) => (
                <View key={batch.batch_id} style={styles.batchCard}>
                  <View style={styles.batchHeader}>
                    <Text style={styles.batchNo}>Batch: {batch.batch_no}</Text>
                    <Text style={styles.stockQty}>
                      Stock: {batch.stock_qty}
                    </Text>
                  </View>

                  <View style={styles.batchDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Barcode:</Text>
                      <Text style={styles.detailValue}>
                        {batch.barcode || "N/A"}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Mfg Date:</Text>
                      <Text style={styles.detailValue}>
                        {formatDate(batch.mfg_date)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Expiry:</Text>
                      <Text style={styles.detailValue}>
                        {formatDate(batch.expiry_date)}
                      </Text>
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
                      <Text style={styles.detailValue}>
                        {batch.opening_stock}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.countedStockContainer}>
                    <Text style={styles.countedStockLabel}>Counted Stock:</Text>
                    <TextInput
                      style={styles.countedStockInput}
                      placeholder="Enter counted quantity"
                      keyboardType="numeric"
                      value={countedStocks[batch.batch_id] || ""}
                      onChangeText={(value) =>
                        handleCountedStockChange(batch.batch_id, value)
                      }
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => handleBatchSelect(batch)}
                  >
                    <Text style={styles.selectButtonText}>Select Batch</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.xl,
    padding: auroraTheme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
  },
  closeButton: {
    padding: auroraTheme.spacing.xs,
  },
  closeButtonText: {
    fontSize: 18,
    color: auroraTheme.colors.text.secondary,
  },
  itemInfo: {
    backgroundColor: auroraTheme.colors.background.secondary,
    padding: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.md,
    marginBottom: auroraTheme.spacing.md,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
    marginBottom: auroraTheme.spacing.xs,
  },
  itemCode: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
  },
  loadingContainer: {
    padding: auroraTheme.spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: auroraTheme.colors.text.secondary,
  },
  emptyContainer: {
    padding: auroraTheme.spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: auroraTheme.colors.text.primary,
    marginBottom: auroraTheme.spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    textAlign: "center",
  },
  batchList: {
    maxHeight: "60%",
  },
  batchCard: {
    backgroundColor: auroraTheme.colors.background.secondary,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    marginBottom: auroraTheme.spacing.sm,
  },
  batchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.sm,
  },
  batchNo: {
    fontSize: 14,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
  },
  stockQty: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
  },
  batchDetails: {
    marginBottom: auroraTheme.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: auroraTheme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
  },
  detailLabel: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
  },
  countedStockContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.sm,
  },
  countedStockLabel: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    marginRight: auroraTheme.spacing.sm,
  },
  countedStockInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.medium,
    borderRadius: auroraTheme.borderRadius.sm,
    paddingHorizontal: auroraTheme.spacing.sm,
    paddingVertical: auroraTheme.spacing.xs,
    fontSize: 14,
    color: auroraTheme.colors.text.primary,
  },
  selectButton: {
    backgroundColor: auroraTheme.colors.primary[500],
    borderRadius: auroraTheme.borderRadius.md,
    paddingVertical: auroraTheme.spacing.sm,
    paddingHorizontal: auroraTheme.spacing.md,
    alignItems: "center",
  },
  selectButtonText: {
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  continueButton: {
    backgroundColor: auroraTheme.colors.neutral[600],
    borderRadius: auroraTheme.borderRadius.md,
    paddingVertical: auroraTheme.spacing.sm,
    paddingHorizontal: auroraTheme.spacing.md,
    alignItems: "center",
    marginTop: auroraTheme.spacing.md,
  },
  continueButtonText: {
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
