/**
 * Sync Differences Screen
 * Review and resolve counted-versus-system differences.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";

import { useIdleProbe } from "../../src/hooks/useIdleProbe";
import { usePermission } from "../../src/hooks/usePermission";
import {
  getSyncConflicts,
  resolveSyncConflict,
  batchResolveSyncConflicts,
  getSyncConflictStats,
} from "../../src/services/api/api";
import { auroraTheme } from "../../src/theme/auroraTheme";
import { uxProbe } from "../../src/utils/uxProbe";

const SURFACE_BG = "#f4f7f6";
const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecf7f4";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";
const WARNING = "#b45309";
const WARNING_BG = "#fffbeb";
const ERROR = "#dc2626";
const SUCCESS = "#15803d";

function safeHaptic(call: () => Promise<void>) {
  if (Platform.OS === "web") return;
  void call().catch(() => undefined);
}

interface SyncConflict {
  _id?: string;
  id?: string;
  session_id: string;
  item_code: string;
  conflict_type: string;
  local_value: any;
  server_value: any;
  local_data?: Record<string, unknown>;
  server_data?: Record<string, unknown>;
  conflicts?: {
    field: string;
    local_value: unknown;
    server_value: unknown;
  }[];
  status: string;
  detected_at: string;
  created_at?: string;
  resolution?: string;
  resolved_at?: string;
  resolved_by?: string;
}

type ModalMode = "view" | "resolve";

const QTY_KEYS = [
  "counted_qty",
  "countedQty",
  "physical_qty",
  "expected_qty",
  "erp_qty",
  "stock_qty",
  "stockQty",
  "quantity",
  "qty",
  "count",
];

const getConflictId = (conflict: SyncConflict) => conflict._id || conflict.id || "";

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getConflictLocalData = (conflict: SyncConflict) =>
  toRecord(conflict.local_data ?? conflict.local_value);

const getConflictServerData = (conflict: SyncConflict) =>
  toRecord(conflict.server_data ?? conflict.server_value);

const firstDefined = (...values: unknown[]) =>
  values.find((value) => value !== null && value !== undefined && value !== "");

const humanizeConflictType = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());

const getIssueLabel = (conflict: SyncConflict) => {
  const raw = `${conflict.conflict_type || ""} ${
    conflict.conflicts?.map((item) => item.field).join(" ") || ""
  }`.toLowerCase();

  if (raw.includes("duplicate")) return "Duplicate item";
  if (raw.includes("unknown")) return "Unknown item";
  if (raw.includes("qty") || raw.includes("quantity") || raw.includes("count")) {
    return "Qty mismatch";
  }
  return conflict.conflict_type ? humanizeConflictType(conflict.conflict_type) : "Data mismatch";
};

const readQtyFromRecord = (record: Record<string, unknown>) => {
  for (const key of QTY_KEYS) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
};

const getPrimaryQtyConflict = (conflict: SyncConflict) =>
  conflict.conflicts?.find((item) => /qty|quantity|count|stock/i.test(item.field)) ||
  conflict.conflicts?.[0];

const getSystemQty = (conflict: SyncConflict) => {
  const qtyConflict = getPrimaryQtyConflict(conflict);
  return firstDefined(
    qtyConflict?.server_value,
    readQtyFromRecord(getConflictServerData(conflict)),
    typeof conflict.server_value !== "object" ? conflict.server_value : undefined
  );
};

const getCountedQty = (conflict: SyncConflict) => {
  const qtyConflict = getPrimaryQtyConflict(conflict);
  return firstDefined(
    qtyConflict?.local_value,
    readQtyFromRecord(getConflictLocalData(conflict)),
    typeof conflict.local_value !== "object" ? conflict.local_value : undefined
  );
};

const getDifference = (conflict: SyncConflict) => {
  const system = Number(getSystemQty(conflict));
  const counted = Number(getCountedQty(conflict));
  if (!Number.isFinite(system) || !Number.isFinite(counted)) return "-";
  const diff = counted - system;
  return diff > 0 ? `+${diff}` : String(diff);
};

const getItemName = (conflict: SyncConflict) => {
  const local = getConflictLocalData(conflict);
  const server = getConflictServerData(conflict);
  return String(
    firstDefined(
      local.item_name,
      local.name,
      server.item_name,
      server.name,
      conflict.item_code,
      local.item_code,
      server.item_code,
      "Unknown item"
    )
  );
};

const getQtyFieldForMerge = (conflict: SyncConflict) => {
  const qtyConflict = getPrimaryQtyConflict(conflict);
  if (qtyConflict?.field) return qtyConflict.field;

  const local = getConflictLocalData(conflict);
  const server = getConflictServerData(conflict);
  return QTY_KEYS.find((key) => key in local || key in server) || "counted_qty";
};

const buildMergedQtyData = (conflict: SyncConflict, qtyText: string) => {
  const qty = Number(qtyText);
  const value = Number.isFinite(qty) ? qty : qtyText.trim();
  return {
    ...getConflictServerData(conflict),
    [getQtyFieldForMerge(conflict)]: value,
  };
};

const toResolveProbeAction = (
  resolution: string
): "accept_counted" | "accept_system" | "edit_qty" => {
  if (resolution === "accept_server") return "accept_system";
  if (resolution === "merge") return "edit_qty";
  return "accept_counted";
};

export default function SyncConflictsScreen() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [editedQty, setEditedQty] = useState("");
  const { markAction } = useIdleProbe(
    modalVisible ? "sync_differences_modal" : "sync_differences_screen"
  );

  const loadStats = useCallback(async () => {
    try {
      const response = await getSyncConflictStats();
      setStats(response.data);
    } catch (error: any) {
      console.error("Failed to load conflict stats:", error);
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const status = filterStatus === "all" ? undefined : filterStatus;
      const response = await getSyncConflicts(status);
      setConflicts(response.data?.conflicts || []);
    } catch (error: any) {
      safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      Alert.alert(
        "Sync differences did not load",
        error.message || "Pull down to refresh, or check the network connection and try again."
      );
    }
  }, [filterStatus]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadConflicts(), loadStats()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadConflicts, loadStats]);

  useEffect(() => {
    // Security: Check permission before allowing conflict resolution
    if (!hasPermission("sync.resolve_conflict")) {
      Alert.alert("Access Denied", "You do not have permission to resolve sync conflicts.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }
    loadData();
  }, [hasPermission, router, loadData]);

  const handleRefresh = () => {
    markAction();
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    setRefreshing(true);
    loadData();
  };

  const handleResolve = async (
    conflictId: string,
    resolution: string,
    note = resolutionNote,
    mergedData?: Record<string, unknown>
  ) => {
    markAction();
    try {
      await resolveSyncConflict(conflictId, resolution, note, mergedData);
      uxProbe({ t: "resolve_diff", action: toResolveProbeAction(resolution) });
      safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      setModalVisible(false);
      setSelectedConflict(null);
      setResolutionNote("");
      setEditedQty("");
      loadData();
    } catch (error: any) {
      safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      Alert.alert(
        "Difference was not resolved",
        error.message || "Check the selected resolution and try again."
      );
    }
  };

  const handleEditQtyResolve = () => {
    markAction();
    if (!selectedConflict) return;
    const cleanedQty = editedQty.trim();
    if (!cleanedQty || Number.isNaN(Number(cleanedQty))) {
      uxProbe({
        t: "nav_confusion",
        screen: "sync_differences_modal",
        note: "edit_qty_invalid",
      });
      Alert.alert("Enter corrected quantity", "Type the correct quantity, then tap Edit qty.");
      return;
    }

    const note = [`Corrected quantity: ${cleanedQty}`, resolutionNote.trim()]
      .filter(Boolean)
      .join(". ");

    void handleResolve(
      getConflictId(selectedConflict),
      "merge",
      note,
      buildMergedQtyData(selectedConflict, cleanedQty)
    );
  };

  const handleBatchResolve = async (resolution: string) => {
    markAction();
    if (selectedConflicts.size === 0) {
      uxProbe({
        t: "nav_confusion",
        screen: "sync_differences_screen",
        note: "batch_resolve_without_selection",
      });
      Alert.alert(
        "Select differences first",
        "Tick one or more items, then choose how to keep the final quantity."
      );
      return;
    }

    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

    const resolutionLabel = resolution === "accept_server" ? "Accept System" : "Accept Counted";

    Alert.alert(
      "Confirm Batch Resolution",
      `Resolve ${selectedConflicts.size} differences with "${resolutionLabel}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          onPress: async () => {
            try {
              await batchResolveSyncConflicts(
                Array.from(selectedConflicts),
                resolution,
                resolutionNote
              );
              uxProbe({ t: "resolve_diff", action: toResolveProbeAction(resolution) });
              safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
              Alert.alert("Success", "Differences resolved successfully");
              setSelectedConflicts(new Set());
              setResolutionNote("");
              loadData();
            } catch (error: any) {
              Alert.alert(
                "Differences were not resolved",
                error.message || "Check the selected items and try again."
              );
            }
          },
        },
      ]
    );
  };

  const toggleConflictSelection = (conflictId: string) => {
    markAction();
    safeHaptic(() => Haptics.selectionAsync());
    const newSelection = new Set(selectedConflicts);
    if (newSelection.has(conflictId)) {
      newSelection.delete(conflictId);
    } else {
      newSelection.add(conflictId);
    }
    setSelectedConflicts(newSelection);
  };

  const openConflictDetail = (conflict: SyncConflict, mode: ModalMode) => {
    markAction();
    safeHaptic(() => Haptics.selectionAsync());
    setSelectedConflict(conflict);
    setModalMode(mode);
    setResolutionNote("");
    setEditedQty(String(getCountedQty(conflict) ?? ""));
    setModalVisible(true);
  };

  const renderConflictCard = ({ item }: { item: SyncConflict }) => {
    const conflictId = getConflictId(item);
    const isSelected = selectedConflicts.has(conflictId);
    const itemName = getItemName(item);
    const issueLabel = getIssueLabel(item);
    const systemQty = getSystemQty(item);
    const countedQty = getCountedQty(item);
    const difference = getDifference(item);
    const detectedAt = item.detected_at || item.created_at;
    const isPending = String(item.status || "").toLowerCase() === "pending";

    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => openConflictDetail(item, "view")}
        style={[styles.conflictCard, isSelected && styles.conflictCardSelected]}
        accessibilityRole="button"
        accessibilityLabel={`Open difference details for ${itemName}`}
      >
        <View style={styles.cardHeader}>
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation?.();
              toggleConflictSelection(conflictId);
            }}
            style={[styles.checkbox, isSelected && styles.checkboxChecked]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`Select conflict for ${itemName}`}
          >
            {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName} numberOfLines={2}>
              {itemName}
            </Text>
            <Text style={styles.itemCode} numberOfLines={1}>
              Code: {item.item_code || conflictId}
            </Text>
            <View style={styles.conflictTypeContainer}>
              <Text style={styles.conflictType}>Difference: {issueLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.qtySummaryRow}>
          <View style={styles.qtySummaryItem}>
            <Text style={styles.dataLabel}>System</Text>
            <Text style={styles.qtyValue}>{String(systemQty ?? "-")}</Text>
          </View>
          <View style={styles.qtySummaryItem}>
            <Text style={styles.dataLabel}>Counted</Text>
            <Text style={styles.qtyValue}>{String(countedQty ?? "-")}</Text>
          </View>
          <View style={styles.qtySummaryItem}>
            <Text style={styles.dataLabel}>Difference</Text>
            <Text
              style={[
                styles.qtyValue,
                difference !== "0" && difference !== "-" && styles.qtyValueWarning,
              ]}
            >
              {difference}
            </Text>
          </View>
        </View>

        {detectedAt ? (
          <Text style={styles.timestamp}>Detected: {new Date(detectedAt).toLocaleString()}</Text>
        ) : null}

        {isPending ? (
          <View style={styles.rowActions}>
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation?.();
                void handleResolve(conflictId, "accept_local");
              }}
              style={[styles.rowActionButton, styles.rowActionPrimary]}
              accessibilityRole="button"
              accessibilityLabel={`Accept counted quantity for ${itemName}`}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={styles.rowActionPrimaryText}>Accept Counted</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation?.();
                void handleResolve(conflictId, "accept_server");
              }}
              style={[styles.rowActionButton, styles.rowActionSecondary]}
              accessibilityRole="button"
              accessibilityLabel={`Accept system quantity for ${itemName}`}
            >
              <Ionicons name="server-outline" size={16} color={ACCENT} />
              <Text style={styles.rowActionSecondaryText}>Accept System</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation?.();
                openConflictDetail(item, "resolve");
              }}
              style={[styles.rowActionButton, styles.rowActionTertiary]}
              accessibilityRole="button"
              accessibilityLabel={`Edit quantity for ${itemName}`}
            >
              <Ionicons name="create-outline" size={16} color={TEXT_MUTED} />
              <Text style={styles.rowActionTertiaryText}>Edit Qty</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isPending && (
          <View style={styles.resolvedInfo}>
            <Ionicons name="checkmark-circle-outline" size={14} color={SUCCESS} />
            <Text style={styles.resolvedText}>
              Resolved: {item.resolution} by {item.resolved_by}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => {
                markAction();
                router.back();
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={TEXT_STRONG} />
            </TouchableOpacity>
            <View>
              <Text style={styles.pageTitle}>Sync Differences</Text>
              <Text style={styles.pageSubtitle}>
                System and counted quantities that need a decision
              </Text>
            </View>
          </View>
        </View>

        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Total</Text>
              <Text style={styles.metricValue}>{stats.total?.toString() || "0"}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Pending</Text>
              <Text style={[styles.metricValue, styles.metricWarning]}>
                {stats.pending?.toString() || "0"}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Resolved</Text>
              <Text style={[styles.metricValue, styles.metricSuccess]}>
                {stats.resolved?.toString() || "0"}
              </Text>
            </View>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filterBar}>
          {["pending", "resolved", "all"].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => {
                markAction();
                safeHaptic(() => Haptics.selectionAsync());
                setFilterStatus(status);
              }}
              style={{ flex: 1 }}
            >
              <View style={[styles.filterButton, filterStatus === status && styles.filterActive]}>
                <Text
                  style={[
                    styles.filterButtonText,
                    filterStatus === status && styles.filterButtonTextActive,
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.helperCard}>
          <Text style={styles.helperText}>System = ERP value</Text>
          <View style={styles.helperDivider} />
          <Text style={styles.helperText}>Counted = your value</Text>
        </View>

        {selectedConflicts.size > 0 && (
          <View style={styles.batchActions}>
            <View style={styles.batchCard}>
              <Text style={styles.batchText}>{selectedConflicts.size} selected</Text>
              <View style={styles.batchButtons}>
                <TouchableOpacity
                  style={[styles.batchButton, styles.batchButtonSecondary]}
                  onPress={() => handleBatchResolve("accept_server")}
                >
                  <Text style={styles.batchButtonTextSecondary}>Accept System</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.batchButton, styles.batchButtonPrimary]}
                  onPress={() => handleBatchResolve("accept_local")}
                >
                  <Text style={styles.batchButtonText}>Accept Counted</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {loading && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Loading differences...</Text>
          </View>
        ) : conflicts.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color={SUCCESS} />
            <Text style={styles.emptyText}>No differences found</Text>
            <Text style={styles.emptySubtext}>Everything is up to date</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={conflicts}
              renderItem={renderConflictCard}
              // @ts-ignore
              estimatedItemSize={200}
              keyExtractor={(item) => getConflictId(item)}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={ACCENT}
                  colors={[ACCENT]}
                />
              }
            />
          </View>
        )}

        <Modal
          visible={modalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {modalMode === "resolve" ? "Resolve Difference" : "Difference Details"}
              </Text>

              {selectedConflict && (
                <>
                  <Text style={styles.modalLabel}>
                    Item:{" "}
                    <Text style={styles.modalStrongText}>{getItemName(selectedConflict)}</Text>
                  </Text>
                  <View style={styles.modalTypeBadge}>
                    <Text style={styles.modalTypeText}>
                      Difference: {getIssueLabel(selectedConflict)}
                    </Text>
                  </View>

                  <View style={styles.modalQtyGrid}>
                    <View style={styles.modalQtyCard}>
                      <Text style={styles.modalSectionTitle}>Expected qty</Text>
                      <Text style={styles.modalQtyValue}>
                        {String(getSystemQty(selectedConflict) ?? "-")}
                      </Text>
                    </View>
                    <View style={styles.modalQtyCard}>
                      <Text style={styles.modalSectionTitle}>Counted qty</Text>
                      <Text style={styles.modalQtyValue}>
                        {String(getCountedQty(selectedConflict) ?? "-")}
                      </Text>
                    </View>
                    <View style={styles.modalQtyCard}>
                      <Text style={styles.modalSectionTitle}>Difference</Text>
                      <Text
                        style={[
                          styles.modalQtyValue,
                          getDifference(selectedConflict) !== "0" &&
                            getDifference(selectedConflict) !== "-" &&
                            styles.qtyValueWarning,
                        ]}
                      >
                        {getDifference(selectedConflict)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>System data</Text>
                    <View style={styles.modalValueBlock}>
                      <Text style={styles.modalValue}>
                        {JSON.stringify(getConflictServerData(selectedConflict), null, 2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Counted data</Text>
                    <View style={styles.modalValueBlock}>
                      <Text style={styles.modalValue}>
                        {JSON.stringify(getConflictLocalData(selectedConflict), null, 2)}
                      </Text>
                    </View>
                  </View>

                  {modalMode === "resolve" ? (
                    <>
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Correct quantity for Edit qty"
                        placeholderTextColor="#64748b"
                        value={editedQty}
                        onChangeText={(value) => {
                          markAction();
                          setEditedQty(value);
                        }}
                        keyboardType="decimal-pad"
                        accessibilityLabel="Correct quantity"
                      />

                      <TextInput
                        style={[styles.modalInput, styles.modalTextArea]}
                        placeholder="Resolution note (optional)"
                        placeholderTextColor="#64748b"
                        value={resolutionNote}
                        onChangeText={(value) => {
                          markAction();
                          setResolutionNote(value);
                        }}
                        multiline
                      />

                      <View style={styles.modalActions}>
                        <TouchableOpacity
                          style={[styles.modalButton, styles.modalButtonSecondary]}
                          onPress={() =>
                            void handleResolve(getConflictId(selectedConflict), "accept_server")
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.modalButtonTitleSecondary}>Accept System</Text>
                          <Text style={styles.modalButtonMetaSecondary}>ERP value</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.modalButton, styles.modalButtonPrimary]}
                          onPress={() =>
                            void handleResolve(getConflictId(selectedConflict), "accept_local")
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.modalButtonTitlePrimary}>Accept Counted</Text>
                          <Text style={styles.modalButtonMetaPrimary}>Your count</Text>
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedBadgeText}>Recommended</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.modalButton, styles.editQtyButton]}
                        onPress={handleEditQtyResolve}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={18} color="#fff" />
                        <Text style={styles.modalButtonText}>Edit qty</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    String(selectedConflict.status || "").toLowerCase() === "pending" && (
                      <TouchableOpacity
                        style={[styles.modalButton, styles.editQtyButton]}
                        onPress={() => setModalMode("resolve")}
                        accessibilityRole="button"
                      >
                        <Text style={styles.modalButtonText}>Resolve This Difference</Text>
                      </TouchableOpacity>
                    )
                  )}

                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => {
                      markAction();
                      setModalVisible(false);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalButtonCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE_BG,
  },
  container: {
    flex: 1,
    paddingTop: 52,
    paddingHorizontal: auroraTheme.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.md,
  },
  backButton: {
    padding: auroraTheme.spacing.xs,
    backgroundColor: SURFACE_CARD,
    borderRadius: auroraTheme.borderRadius.full,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  pageTitle: {
    fontFamily: auroraTheme.typography.fontFamily.heading,
    fontSize: auroraTheme.typography.fontSize.xl,
    color: TEXT_STRONG,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: TEXT_MUTED,
  },
  statsContainer: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    minHeight: 62,
    padding: auroraTheme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: auroraTheme.typography.fontSize.xs,
    color: TEXT_MUTED,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 2,
    fontSize: auroraTheme.typography.fontSize.xl,
    color: TEXT_STRONG,
    fontWeight: "800",
  },
  metricWarning: {
    color: WARNING,
  },
  metricSuccess: {
    color: SUCCESS,
  },
  filterBar: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.sm,
  },
  filterButton: {
    minHeight: 40,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  filterActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_SOFT,
  },
  filterButtonText: {
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600",
    color: TEXT_MUTED,
  },
  filterButtonTextActive: {
    color: ACCENT,
  },
  helperCard: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: auroraTheme.spacing.sm,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: 8,
    marginBottom: auroraTheme.spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: ACCENT_SOFT,
  },
  helperText: {
    color: TEXT_STRONG,
    fontSize: auroraTheme.typography.fontSize.xs,
    fontWeight: "800",
  },
  helperDivider: {
    width: 1,
    height: 14,
    backgroundColor: SURFACE_BORDER,
  },
  batchActions: {
    marginBottom: auroraTheme.spacing.md,
  },
  batchCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  batchText: {
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "600",
    color: TEXT_STRONG,
  },
  batchButtons: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
  },
  batchButton: {
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: 8,
    borderRadius: auroraTheme.borderRadius.full,
  },
  batchButtonPrimary: {
    backgroundColor: ACCENT,
  },
  batchButtonSecondary: {
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  batchButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: auroraTheme.typography.fontSize.xs,
  },
  batchButtonTextSecondary: {
    color: TEXT_STRONG,
    fontWeight: "bold",
    fontSize: auroraTheme.typography.fontSize.xs,
  },
  listContent: {
    paddingBottom: auroraTheme.spacing.xl,
  },
  conflictCard: {
    marginBottom: auroraTheme.spacing.sm,
    padding: auroraTheme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  conflictCardSelected: {
    borderColor: ACCENT,
    backgroundColor: "#f0fdfa",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: auroraTheme.spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: auroraTheme.borderRadius.sm,
    borderWidth: 2,
    borderColor: "#94a3b8",
    marginRight: auroraTheme.spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  itemCode: {
    marginTop: 4,
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600",
    color: TEXT_MUTED,
  },
  itemName: {
    fontSize: auroraTheme.typography.fontSize.lg,
    fontWeight: "700",
    color: TEXT_STRONG,
  },
  conflictTypeContainer: {
    alignSelf: "flex-start",
    backgroundColor: WARNING_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: auroraTheme.borderRadius.full,
    marginTop: 4,
  },
  conflictType: {
    fontSize: auroraTheme.typography.fontSize.xs,
    color: WARNING,
    fontWeight: "600",
  },
  qtySummaryRow: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.md,
  },
  qtySummaryItem: {
    flex: 1,
    minHeight: 66,
    padding: auroraTheme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: SURFACE_MUTED,
    justifyContent: "center",
  },
  qtyValue: {
    marginTop: 4,
    fontSize: auroraTheme.typography.fontSize.lg,
    fontWeight: "800",
    color: TEXT_STRONG,
  },
  qtyValueWarning: {
    color: ERROR,
  },
  conflictData: {
    flexDirection: "row",
    gap: auroraTheme.spacing.md,
    marginBottom: auroraTheme.spacing.md,
  },
  dataColumn: {
    flex: 1,
  },
  dataLabel: {
    fontSize: auroraTheme.typography.fontSize.xs,
    color: TEXT_MUTED,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  valueBlock: {
    minHeight: 48,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: SURFACE_MUTED,
  },
  dataValue: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: TEXT_MUTED,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  timestamp: {
    fontSize: auroraTheme.typography.fontSize.xs,
    color: TEXT_MUTED,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.sm,
    marginTop: auroraTheme.spacing.md,
  },
  rowActionButton: {
    minHeight: 44,
    flex: 1,
    minWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: auroraTheme.spacing.md,
  },
  rowActionSecondary: {
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  rowActionPrimary: {
    backgroundColor: ACCENT,
  },
  rowActionTertiary: {
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_MUTED,
  },
  rowActionSecondaryText: {
    color: ACCENT,
    fontWeight: "700",
  },
  rowActionPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  rowActionTertiaryText: {
    color: TEXT_MUTED,
    fontWeight: "700",
  },
  resolvedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.xs,
    marginTop: auroraTheme.spacing.sm,
    paddingTop: auroraTheme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE_BORDER,
  },
  resolvedText: {
    fontSize: auroraTheme.typography.fontSize.xs,
    color: SUCCESS,
  },
  loadingText: {
    marginTop: auroraTheme.spacing.md,
    fontSize: auroraTheme.typography.fontSize.md,
    color: TEXT_MUTED,
  },
  emptyText: {
    fontSize: auroraTheme.typography.fontSize.lg,
    fontWeight: "500",
    color: TEXT_MUTED,
    marginTop: auroraTheme.spacing.md,
  },
  emptySubtext: {
    fontSize: auroraTheme.typography.fontSize.md,
    color: TEXT_MUTED,
    marginTop: auroraTheme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  modalContent: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    padding: auroraTheme.spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  modalTitle: {
    fontSize: auroraTheme.typography.fontSize["2xl"],
    fontWeight: "bold",
    color: TEXT_STRONG,
    marginBottom: auroraTheme.spacing.lg,
    textAlign: "center",
  },
  modalLabel: {
    fontSize: auroraTheme.typography.fontSize.md,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  modalStrongText: {
    color: TEXT_STRONG,
    fontWeight: "800",
  },
  modalTypeBadge: {
    backgroundColor: WARNING_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: auroraTheme.borderRadius.full,
    alignSelf: "flex-start",
    marginBottom: auroraTheme.spacing.lg,
  },
  modalTypeText: {
    color: WARNING,
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600",
  },
  modalQtyGrid: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.lg,
  },
  modalQtyCard: {
    flex: 1,
    padding: auroraTheme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: SURFACE_MUTED,
  },
  modalQtyValue: {
    marginTop: 4,
    fontSize: auroraTheme.typography.fontSize.xl,
    color: TEXT_STRONG,
    fontWeight: "800",
  },
  modalSection: {
    marginBottom: auroraTheme.spacing.lg,
  },
  modalSectionTitle: {
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  modalValueBlock: {
    padding: auroraTheme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: SURFACE_MUTED,
  },
  modalValue: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: TEXT_STRONG,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalInput: {
    backgroundColor: SURFACE_MUTED,
    color: TEXT_STRONG,
    padding: 12,
    borderRadius: auroraTheme.borderRadius.md,
    fontSize: auroraTheme.typography.fontSize.md,
    marginBottom: auroraTheme.spacing.lg,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  modalTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: auroraTheme.spacing.md,
    marginBottom: auroraTheme.spacing.md,
    alignItems: "stretch",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: auroraTheme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
    paddingHorizontal: auroraTheme.spacing.md,
  },
  modalButtonPrimary: {
    backgroundColor: ACCENT,
    position: "relative",
  },
  modalButtonSecondary: {
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  modalButtonCancel: {
    backgroundColor: SURFACE_CARD,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  editQtyButton: {
    backgroundColor: ACCENT,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: auroraTheme.spacing.md,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "600",
  },
  modalButtonTitlePrimary: {
    color: "#fff",
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "700",
  },
  modalButtonMetaPrimary: {
    marginTop: 2,
    color: "#dbeafe",
    fontSize: auroraTheme.typography.fontSize.xs,
    fontWeight: "600",
  },
  modalButtonTitleSecondary: {
    color: TEXT_STRONG,
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "700",
  },
  modalButtonMetaSecondary: {
    marginTop: 2,
    color: TEXT_MUTED,
    fontSize: auroraTheme.typography.fontSize.xs,
    fontWeight: "600",
  },
  recommendedBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: auroraTheme.borderRadius.full,
    backgroundColor: "#0f5f59",
  },
  recommendedBadgeText: {
    color: "#fff",
    fontSize: auroraTheme.typography.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  modalButtonCancelText: {
    color: TEXT_STRONG,
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "600",
  },
});
