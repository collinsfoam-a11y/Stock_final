import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  TextInput as _TextInput,
  ScrollView as _ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import {
  getUnknownItems,
  mapUnknownToSku,
  createSkuFromUnknown as _createSkuFromUnknown,
  deleteUnknownItem,
} from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AnimatedPressable as _AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ModernCard } from "@/components/ui/ModernCard";
import { ModernButton } from "@/components/ui/ModernButton";
import { ModernInput } from "@/components/ui/ModernInput";

export default function UnknownItemsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [targetSku, setTargetSku] = useState("");
  const [notes, setNotes] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      if (offlineMode) {
        setItems([]);
        return;
      }

      const response = await getUnknownItems({});
      if (response.success) {
        setItems(response.data);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load unknown items");
    } finally {
      setLoading(false);
    }
  }, [offlineMode]);

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "Admin permissions required.");
      safeBackNavigation(router, { userRole: "admin" });
      return;
    }
    void loadItems();
  }, [hasRole, loadItems, router]);

  const handleMap = async () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Unknown item mapping requires a live connection.");
      return;
    }

    if (!targetSku) {
      Alert.alert("Validation", "Please enter a target Item Code");
      return;
    }

    try {
      setLoading(true);
      const result = await mapUnknownToSku(selectedItem.id || selectedItem._id, targetSku, notes);
      if (result.success) {
        Alert.alert("Success", result.message);
        setMappingModalVisible(false);
        setTargetSku("");
        setNotes("");
        void loadItems();
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Mapping failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (item: any) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Unknown item dismissal requires a live connection.");
      return;
    }

    Alert.alert(
      "Confirm Dismiss",
      "Are you sure you want to dismiss this report? It will be removed from the active queue.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dismiss",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUnknownItem(item.id || item._id);
              void loadItems();
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => (
    <ModernCard variant="outlined" elevation="none" padding={0} style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View>
          <Text style={styles.barcodeText}>{item.barcode || "No Barcode"}</Text>
          <Text style={styles.dateText}>
            Reported {new Date(item.reported_at).toLocaleString()} by {item.reported_by}
          </Text>
        </View>
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>{item.counted_qty}</Text>
        </View>
      </View>

      {item.description ? <Text style={styles.descriptionText}>{item.description}</Text> : null}

      {item.remark ? (
        <View style={styles.remarkContainer}>
          <Ionicons name="chatbubble-outline" size={14} color={uiTokens.colors.textSecondary} />
          <Text style={styles.remarkText}>{item.remark}</Text>
        </View>
      ) : null}

      <View style={styles.actionButtons}>
        <ModernButton
          title="Map to SKU"
          onPress={() => {
            setSelectedItem(item);
            setMappingModalVisible(true);
          }}
          disabled={offlineMode}
          variant="primary"
          size="small"
          style={styles.actionBtn}
        />
        <ModernButton
          title="Dismiss"
          onPress={() => handleDelete(item)}
          disabled={offlineMode}
          variant="outline"
          size="small"
          style={styles.actionBtn}
        />
      </View>
    </ModernCard>
  );

  return (
    <ScreenContainer
      header={{
        title: "Unknown Items",
        subtitle: "Items not found in system",
        showBackButton: true,
      }}
    >
      {offlineMode && (
        <ModernCard variant="outlined" elevation="none" padding={0} style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeTitle}>Unknown items are unavailable offline</Text>
          <Text style={styles.offlineNoticeBody}>
            Unknown-item review, mapping, and dismissal all require a live backend connection.
            Reconnect to manage this queue.
          </Text>
        </ModernCard>
      )}

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <LoadingSpinner size={40} color={uiTokens.colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id || item._id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={offlineMode ? "cloud-offline-outline" : "checkmark-circle-outline"}
                size={64}
                color={offlineMode ? uiTokens.colors.warning : uiTokens.colors.success}
              />
              <Text style={styles.emptyText}>
                {offlineMode ? "Reconnect to review unknown items" : "All unknown items resolved!"}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={mappingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMappingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.modalContent}>
            <Text style={styles.modalTitle}>Map Unknown Item</Text>
            <Text style={styles.modalSubtitle}>Barcode: {selectedItem?.barcode || "N/A"}</Text>

            <ModernInput
              label="Target Item Code"
              placeholder="e.g. ITEM123"
              value={targetSku}
              onChangeText={setTargetSku}
              autoCapitalize="characters"
            />

            <ModernInput
              label="Resolution Notes"
              placeholder="Why this mapping?"
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <ModernButton
                title="Cancel"
                onPress={() => setMappingModalVisible(false)}
                variant="outline"
                style={styles.modalButtonGap}
              />
              <ModernButton
                title="Resolve"
                onPress={handleMap}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </ModernCard>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

type UnknownItemsTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: UnknownItemsTokens) =>
  StyleSheet.create({
  listContent: {
    padding: uiTokens.spacing.md,
    paddingBottom: uiTokens.spacing["3xl"],
  },
  offlineNotice: {
    marginHorizontal: uiTokens.spacing.md,
    marginTop: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.sm,
    padding: uiTokens.spacing.md,
  },
  offlineNoticeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.xs,
  },
  offlineNoticeBody: {
    fontSize: 12,
    lineHeight: 18,
    color: uiTokens.colors.textSecondary,
  },
  itemCard: {
    marginBottom: uiTokens.spacing.md,
    padding: uiTokens.spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: uiTokens.spacing.sm,
  },
  barcodeText: {
    fontSize: 18,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
  },
  dateText: {
    fontSize: 12,
    color: uiTokens.colors.textSecondary,
    marginTop: uiTokens.spacing.xxs,
  },
  qtyBadge: {
    backgroundColor: uiTokens.colors.accent,
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.lg,
  },
  qtyText: {
    color: uiTokens.colors.surface,
    fontWeight: "bold",
    fontSize: 16,
  },
  descriptionText: {
    fontSize: 14,
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.sm,
    fontStyle: "italic",
  },
  remarkContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.1),
    padding: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.md,
    marginBottom: uiTokens.spacing.md,
  },
  remarkText: {
    fontSize: 13,
    color: uiTokens.colors.textSecondary,
    marginLeft: uiTokens.spacing.xs,
    flex: 1,
  },
  actionButtons: {
    flexDirection: "row",
    gap: uiTokens.spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: uiTokens.spacing["2xl"],
  },
  emptyText: {
    fontSize: 18,
    color: uiTokens.colors.textSecondary,
    marginTop: uiTokens.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: uiTokens.colors.overlay,
    justifyContent: "center",
    padding: uiTokens.spacing.lg,
  },
  modalContent: {
    padding: uiTokens.spacing.lg,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: uiTokens.colors.textSecondary,
    marginBottom: uiTokens.spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: uiTokens.spacing.lg,
  },
  modalButtonGap: {
    flex: 1,
    marginRight: uiTokens.spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
});
