import React, { useState, useEffect, useCallback } from "react";
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
import {
    LoadingSpinner,
    AnimatedPressable as _AnimatedPressable,
    ScreenContainer,
    GlassCard,
    ModernButton,
    ModernInput,
} from "@/components/ui";
import { auroraTheme } from "../../src/theme/auroraTheme";
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

export default function UnknownItemsScreen() {
    const router = useRouter();
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
            router.back();
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
            "Are you sure you want to dismiss this report? The count data will be lost.",
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
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: any }) => (
        <GlassCard style={styles.itemCard}>
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

            {item.description ? (
                <Text style={styles.descriptionText}>{item.description}</Text>
            ) : null}

            {item.remark ? (
                <View style={styles.remarkContainer}>
                    <Ionicons name="chatbubble-outline" size={14} color={auroraTheme.colors.text.secondary} />
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
        </GlassCard>
    );

    return (
        <ScreenContainer
            gradient
            header={{
                title: "Unknown Items",
                subtitle: "Items not found in system",
                showBackButton: true,
            }}
        >
            {offlineMode && (
                <GlassCard style={styles.offlineNotice}>
                    <Text style={styles.offlineNoticeTitle}>
                        Unknown items are unavailable offline
                    </Text>
                    <Text style={styles.offlineNoticeBody}>
                        Unknown-item review, mapping, and dismissal all require a live backend
                        connection. Reconnect to manage this queue.
                    </Text>
                </GlassCard>
            )}

            {loading && items.length === 0 ? (
                <View style={styles.centered}>
                    <LoadingSpinner size={40} color={auroraTheme.colors.primary[500]} />
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
                                color={
                                    offlineMode
                                        ? auroraTheme.colors.warning[500]
                                        : auroraTheme.colors.success[500]
                                }
                            />
                            <Text style={styles.emptyText}>
                                {offlineMode
                                    ? "Reconnect to review unknown items"
                                    : "All unknown items resolved!"}
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
                    <GlassCard style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Map Unknown Item</Text>
                        <Text style={styles.modalSubtitle}>
                            Barcode: {selectedItem?.barcode || "N/A"}
                        </Text>

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
                                style={{ flex: 1, marginRight: 8 }}
                            />
                            <ModernButton
                                title="Resolve"
                                onPress={handleMap}
                                variant="primary"
                                style={{ flex: 1 }}
                            />
                        </View>
                    </GlassCard>
                </View>
            </Modal>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: 16,
        paddingBottom: 40,
    },
    offlineNotice: {
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
        padding: 16,
    },
    offlineNoticeTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: auroraTheme.colors.text.primary,
        marginBottom: 4,
    },
    offlineNoticeBody: {
        fontSize: 12,
        lineHeight: 18,
        color: auroraTheme.colors.text.secondary,
    },
    itemCard: {
        marginBottom: 16,
        padding: 16,
    },
    itemHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 8,
    },
    barcodeText: {
        fontSize: 18,
        fontWeight: "700",
        color: auroraTheme.colors.text.primary,
    },
    dateText: {
        fontSize: 12,
        color: auroraTheme.colors.text.secondary,
        marginTop: 2,
    },
    qtyBadge: {
        backgroundColor: auroraTheme.colors.primary[500],
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    qtyText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
    descriptionText: {
        fontSize: 14,
        color: auroraTheme.colors.text.primary,
        marginBottom: 8,
        fontStyle: "italic",
    },
    remarkContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.05)",
        padding: 8,
        borderRadius: 8,
        marginBottom: 12,
    },
    remarkText: {
        fontSize: 13,
        color: auroraTheme.colors.text.secondary,
        marginLeft: 6,
        flex: 1,
    },
    actionButtons: {
        flexDirection: "row",
        gap: 8,
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
        marginTop: 100,
    },
    emptyText: {
        fontSize: 18,
        color: auroraTheme.colors.text.secondary,
        marginTop: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        padding: 20,
    },
    modalContent: {
        padding: 24,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: "bold",
        color: auroraTheme.colors.text.primary,
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 14,
        color: auroraTheme.colors.text.secondary,
        marginBottom: 20,
    },
    modalActions: {
        flexDirection: "row",
        marginTop: 24,
    },
});
