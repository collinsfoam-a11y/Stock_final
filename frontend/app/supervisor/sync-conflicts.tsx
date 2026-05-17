/**
 * Sync Conflicts Screen
 * Review and resolve data synchronization conflicts
 * Refactored to use Aurora Design System
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { usePermission } from "../../src/hooks/usePermission";
import {
  getSyncConflicts,
  resolveSyncConflict,
  batchResolveSyncConflicts,
  getSyncConflictStats,
} from "../../src/services/api/api";
import { ModernCard, StatsCard, AnimatedPressable } from "../../src/components/ui";
import { safeBackNavigation } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import {
  createOperationalStyleBridge,
  type OperationalStyleBridge,
} from "@/theme/operationalStyleBridge";

interface SyncConflict {
  _id: string;
  session_id: string;
  item_code: string;
  conflict_type: string;
  local_value: any;
  server_value: any;
  status: string;
  detected_at: string;
  resolution?: string;
  resolved_at?: string;
  resolved_by?: string;
}

export default function SyncConflictsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const operationalTheme = useMemo(() => createOperationalStyleBridge(uiTokens), [uiTokens]);
  const styles = useMemo(() => createStyles(operationalTheme), [operationalTheme]);
  const { hasPermission } = usePermission();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const headerEntry = prefersReducedMotion ? undefined : FadeInDown.delay(100).springify();
  const statsEntry = prefersReducedMotion ? undefined : FadeInDown.delay(200).springify();
  const filterEntry = prefersReducedMotion ? undefined : FadeInDown.delay(300).springify();
  const batchEntry = prefersReducedMotion ? undefined : FadeInDown.delay(100);

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
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to load sync conflicts");
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
        { text: "OK", onPress: () => safeBackNavigation(router, { userRole: "supervisor" }) },
      ]);
      return;
    }
    loadData();
  }, [hasPermission, router, loadData]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadData();
  };

  const handleResolve = async (conflictId: string, resolution: string) => {
    try {
      await resolveSyncConflict(conflictId, resolution, resolutionNote);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Conflict resolved successfully");
      setModalVisible(false);
      setSelectedConflict(null);
      setResolutionNote("");
      loadData();
    } catch (error: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to resolve conflict");
    }
  };

  const handleBatchResolve = async (resolution: string) => {
    if (selectedConflicts.size === 0) {
      Alert.alert("Error", "Please select conflicts to resolve");
      return;
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Alert.alert(
      "Confirm Batch Resolution",
      `Resolve ${selectedConflicts.size} conflicts with "${resolution}"?`,
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
              if (Platform.OS !== "web")
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", "Conflicts resolved successfully");
              setSelectedConflicts(new Set());
              setResolutionNote("");
              loadData();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to resolve conflicts");
            }
          },
        },
      ]
    );
  };

  const toggleConflictSelection = (conflictId: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const newSelection = new Set(selectedConflicts);
    if (newSelection.has(conflictId)) {
      newSelection.delete(conflictId);
    } else {
      newSelection.add(conflictId);
    }
    setSelectedConflicts(newSelection);
  };

  const openConflictDetail = (conflict: SyncConflict) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedConflict(conflict);
    setModalVisible(true);
  };

  const renderConflictCard = ({ item }: { item: SyncConflict }) => {
    const isSelected = selectedConflicts.has(item._id);

    return (
      <AnimatedPressable
        onPress={() => toggleConflictSelection(item._id)}
        onLongPress={() => openConflictDetail(item)}
        style={{ marginBottom: operationalTheme.spacing.md }}
        accessibilityLabel={`${isSelected ? "Selected" : "Unselected"} conflict for ${item.item_code}, ${item.conflict_type}`}
        accessibilityHint="Selects this conflict. Long press to open conflict details."
        accessibilityState={{ selected: isSelected }}
      >
        <ModernCard
          variant="outlined"
          elevation="none"
          padding={operationalTheme.spacing.md}
          style={
            isSelected
              ? { borderColor: operationalTheme.colors.primary[500], borderWidth: 1 }
              : undefined
          }
        >
          <View style={styles.cardHeader}>
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemCode}>{item.item_code}</Text>
              <View style={styles.conflictTypeContainer}>
                <Text style={styles.conflictType}>{item.conflict_type}</Text>
              </View>
            </View>
          </View>

          <View style={styles.conflictData}>
            <View style={styles.dataColumn}>
              <Text style={styles.dataLabel}>Local Value</Text>
              <ModernCard variant="outlined" elevation="none" padding={8}>
                <Text style={styles.dataValue} numberOfLines={2}>
                  {JSON.stringify(item.local_value)}
                </Text>
              </ModernCard>
            </View>
            <View style={styles.dataColumn}>
              <Text style={styles.dataLabel}>Server Value</Text>
              <ModernCard variant="outlined" elevation="none" padding={8}>
                <Text style={styles.dataValue} numberOfLines={2}>
                  {JSON.stringify(item.server_value)}
                </Text>
              </ModernCard>
            </View>
          </View>

          <Text style={styles.timestamp}>
            Detected: {new Date(item.detected_at).toLocaleString()}
          </Text>

          {item.status !== "pending" && (
            <View style={styles.resolvedInfo}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={operationalTheme.colors.success[500]}
              />
              <Text style={styles.resolvedText}>
                Resolved: {item.resolution} by {item.resolved_by}
              </Text>
            </View>
          )}
        </ModernCard>
      </AnimatedPressable>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View entering={headerEntry} style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => safeBackNavigation(router, { userRole: "supervisor" })}
              style={styles.backButton}
              accessibilityLabel="Back to supervisor"
              accessibilityHint="Returns to the supervisor area"
            >
              <Ionicons name="arrow-back" size={24} color={operationalTheme.colors.text.primary} />
            </AnimatedPressable>
            <View>
              <Text style={styles.pageTitle}>Sync Conflicts</Text>
              <Text style={styles.pageSubtitle}>Resolve data discrepancies</Text>
            </View>
          </View>
        </Animated.View>

        {stats && (
          <Animated.View entering={statsEntry} style={styles.statsContainer}>
            <StatsCard
              title="Total"
              value={stats.total?.toString() || "0"}
              icon="alert-circle-outline"
              variant="primary"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Pending"
              value={stats.pending?.toString() || "0"}
              icon="time-outline"
              variant="warning"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Resolved"
              value={stats.resolved?.toString() || "0"}
              icon="checkmark-circle-outline"
              variant="success"
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}

        {/* Filters */}
        <Animated.View entering={filterEntry} style={styles.filterBar}>
          {["pending", "resolved", "all"].map((status) => (
            <AnimatedPressable
              key={status}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setFilterStatus(status);
              }}
              style={{ flex: 1 }}
              accessibilityLabel={`${status.charAt(0).toUpperCase() + status.slice(1)} conflicts`}
              accessibilityHint="Filters sync conflicts by status"
              accessibilityState={{ selected: filterStatus === status }}
            >
              <ModernCard
                variant="outlined"
                elevation="none"
                padding={operationalTheme.spacing.sm}
                style={[
                  styles.filterButton,
                  filterStatus === status && {
                    borderColor: operationalTheme.colors.primary[500],
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterStatus === status && {
                      color: operationalTheme.colors.primary[500],
                    },
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </ModernCard>
            </AnimatedPressable>
          ))}
        </Animated.View>

        {selectedConflicts.size > 0 && (
          <Animated.View entering={batchEntry} style={styles.batchActions}>
            <ModernCard
              variant="outlined"
              elevation="none"
              padding={operationalTheme.spacing.md}
              style={styles.batchCard}
            >
              <Text style={styles.batchText}>{selectedConflicts.size} selected</Text>
              <View style={styles.batchButtons}>
                <AnimatedPressable
                  style={[
                    styles.batchButton,
                    { backgroundColor: operationalTheme.colors.success[500] },
                  ]}
                  onPress={() => handleBatchResolve("accept_server")}
                  accessibilityLabel="Accept server values for selected conflicts"
                  accessibilityHint="Resolves selected conflicts using server data"
                >
                  <Text style={styles.batchButtonText}>Accept Server</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[
                    styles.batchButton,
                    { backgroundColor: operationalTheme.colors.secondary[500] },
                  ]}
                  onPress={() => handleBatchResolve("accept_local")}
                  accessibilityLabel="Accept local values for selected conflicts"
                  accessibilityHint="Resolves selected conflicts using local offline data"
                >
                  <Text style={styles.batchButtonText}>Accept Local</Text>
                </AnimatedPressable>
              </View>
            </ModernCard>
          </Animated.View>
        )}

        {loading && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={operationalTheme.colors.primary[500]} />
            <Text style={styles.loadingText}>Loading conflicts...</Text>
          </View>
        ) : conflicts.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons
              name="checkmark-done-circle-outline"
              size={64}
              color={operationalTheme.colors.success[500]}
            />
            <Text style={styles.emptyText}>No conflicts found</Text>
            <Text style={styles.emptySubtext}>System data is in sync</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={conflicts}
              renderItem={renderConflictCard}
              // @ts-ignore
              estimatedItemSize={200}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={operationalTheme.colors.primary[500]}
                  colors={[operationalTheme.colors.primary[500]]}
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
            <ModernCard
              variant="outlined"
              elevation="none"
              padding={operationalTheme.spacing.lg}
              style={styles.modalContent}
            >
              <Text style={styles.modalTitle}>Resolve Conflict</Text>

              {selectedConflict && (
                <>
                  <Text style={styles.modalLabel}>
                    Item: <Text style={styles.modalItemCode}>{selectedConflict.item_code}</Text>
                  </Text>
                  <View style={styles.modalTypeBadge}>
                    <Text style={styles.modalTypeText}>{selectedConflict.conflict_type}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Local Value</Text>
                    <ModernCard
                      variant="outlined"
                      elevation="none"
                      padding={operationalTheme.spacing.md}
                    >
                      <Text style={styles.modalValue}>
                        {JSON.stringify(selectedConflict.local_value, null, 2)}
                      </Text>
                    </ModernCard>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Server Value</Text>
                    <ModernCard
                      variant="outlined"
                      elevation="none"
                      padding={operationalTheme.spacing.md}
                    >
                      <Text style={styles.modalValue}>
                        {JSON.stringify(selectedConflict.server_value, null, 2)}
                      </Text>
                    </ModernCard>
                  </View>

                  <TextInput
                    style={[styles.modalInput, styles.modalTextArea]}
                    placeholder="Resolution note (optional)"
                    placeholderTextColor={operationalTheme.colors.text.tertiary}
                    value={resolutionNote}
                    onChangeText={setResolutionNote}
                    multiline
                    accessibilityLabel="Resolution note"
                    accessibilityHint="Optional note recorded with this conflict resolution"
                  />

                  <View style={styles.modalActions}>
                    <AnimatedPressable
                      style={[
                        styles.modalButton,
                        { backgroundColor: operationalTheme.colors.success[500] },
                      ]}
                      onPress={() => handleResolve(selectedConflict._id, "accept_server")}
                      accessibilityLabel="Accept server value"
                      accessibilityHint="Resolves this conflict using server data"
                    >
                      <Text style={styles.modalButtonText}>Accept Server</Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                      style={[
                        styles.modalButton,
                        { backgroundColor: operationalTheme.colors.secondary[500] },
                      ]}
                      onPress={() => handleResolve(selectedConflict._id, "accept_local")}
                      accessibilityLabel="Accept local value"
                      accessibilityHint="Resolves this conflict using local offline data"
                    >
                      <Text style={styles.modalButtonText}>Accept Local</Text>
                    </AnimatedPressable>
                  </View>

                  <AnimatedPressable
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setModalVisible(false)}
                    accessibilityLabel="Cancel conflict resolution"
                    accessibilityHint="Closes the resolve conflict dialog"
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </AnimatedPressable>
                </>
              )}
            </ModernCard>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const createStyles = (operationalTheme: OperationalStyleBridge) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: operationalTheme.colors.background.primary,
    },
    container: {
      flex: 1,
      paddingTop: 60,
      paddingHorizontal: operationalTheme.spacing.md,
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
      marginBottom: operationalTheme.spacing.md,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: operationalTheme.spacing.md,
    },
    backButton: {
      padding: operationalTheme.spacing.xs,
      backgroundColor: operationalTheme.colors.background.glass,
      borderRadius: operationalTheme.borderRadius.full,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
    },
    pageTitle: {
      fontFamily: operationalTheme.typography.fontFamily.heading,
      fontSize: operationalTheme.typography.fontSize["2xl"],
      color: operationalTheme.colors.text.primary,
      fontWeight: "700",
    },
    pageSubtitle: {
      fontSize: operationalTheme.typography.fontSize.sm,
      color: operationalTheme.colors.text.secondary,
    },
    statsContainer: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
      marginBottom: operationalTheme.spacing.md,
    },
    filterBar: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
      marginBottom: operationalTheme.spacing.md,
    },
    filterButton: {
      alignItems: "center",
      justifyContent: "center",
    },
    filterButtonText: {
      fontSize: operationalTheme.typography.fontSize.sm,
      fontWeight: "600",
      color: operationalTheme.colors.text.secondary,
    },
    batchActions: {
      marginBottom: operationalTheme.spacing.md,
    },
    batchCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    batchText: {
      fontSize: operationalTheme.typography.fontSize.md,
      fontWeight: "600",
      color: operationalTheme.colors.text.primary,
    },
    batchButtons: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
    },
    batchButton: {
      paddingHorizontal: operationalTheme.spacing.md,
      paddingVertical: operationalTheme.spacing.sm,
      borderRadius: operationalTheme.borderRadius.full,
    },
    batchButtonText: {
      color: "white",
      fontWeight: "bold",
      fontSize: operationalTheme.typography.fontSize.xs,
    },
    listContent: {
      paddingBottom: operationalTheme.spacing.xl,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: operationalTheme.spacing.md,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: operationalTheme.borderRadius.sm,
      borderWidth: 2,
      borderColor: operationalTheme.colors.text.tertiary,
      marginRight: operationalTheme.spacing.md,
      justifyContent: "center",
      alignItems: "center",
    },
    checkboxChecked: {
      backgroundColor: operationalTheme.colors.primary[500],
      borderColor: operationalTheme.colors.primary[500],
    },
    itemCode: {
      fontSize: operationalTheme.typography.fontSize.lg,
      fontWeight: "700",
      color: operationalTheme.colors.text.primary,
    },
    conflictTypeContainer: {
      alignSelf: "flex-start",
      backgroundColor: colorWithAlpha(operationalTheme.colors.warning[500], 0.1),
      paddingHorizontal: operationalTheme.spacing.sm,
      paddingVertical: operationalTheme.spacing.xs,
      borderRadius: operationalTheme.borderRadius.full,
      marginTop: operationalTheme.spacing.xs,
    },
    conflictType: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.warning[500],
      fontWeight: "600",
    },
    conflictData: {
      flexDirection: "row",
      gap: operationalTheme.spacing.md,
      marginBottom: operationalTheme.spacing.md,
    },
    dataColumn: {
      flex: 1,
    },
    dataLabel: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.tertiary,
      marginBottom: operationalTheme.spacing.xs,
      textTransform: "uppercase",
    },
    dataValue: {
      fontSize: operationalTheme.typography.fontSize.sm,
      color: operationalTheme.colors.text.secondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    timestamp: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.tertiary,
    },
    resolvedInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: operationalTheme.spacing.xs,
      marginTop: operationalTheme.spacing.sm,
      paddingTop: operationalTheme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: operationalTheme.colors.border.light,
    },
    resolvedText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.success[500],
    },
    loadingText: {
      marginTop: operationalTheme.spacing.md,
      fontSize: operationalTheme.typography.fontSize.md,
      color: operationalTheme.colors.text.secondary,
    },
    emptyText: {
      fontSize: operationalTheme.typography.fontSize.lg,
      fontWeight: "500",
      color: operationalTheme.colors.text.secondary,
      marginTop: operationalTheme.spacing.md,
    },
    emptySubtext: {
      fontSize: operationalTheme.typography.fontSize.md,
      color: operationalTheme.colors.text.tertiary,
      marginTop: operationalTheme.spacing.xs,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: operationalTheme.spacing.xl,
      backgroundColor: operationalTheme.colors.background.blur,
    },
    modalContent: {
      width: "100%",
      maxWidth: 500,
    },
    modalTitle: {
      fontSize: operationalTheme.typography.fontSize["2xl"],
      fontWeight: "bold",
      color: operationalTheme.colors.text.primary,
      marginBottom: operationalTheme.spacing.lg,
      textAlign: "center",
    },
    modalLabel: {
      fontSize: operationalTheme.typography.fontSize.md,
      color: operationalTheme.colors.text.secondary,
      marginBottom: operationalTheme.spacing.xs,
    },
    modalItemCode: {
      color: operationalTheme.colors.text.primary,
    },
    modalTypeBadge: {
      backgroundColor: colorWithAlpha(operationalTheme.colors.warning[500], 0.1),
      paddingHorizontal: operationalTheme.spacing.md,
      paddingVertical: operationalTheme.spacing.xs,
      borderRadius: operationalTheme.borderRadius.full,
      alignSelf: "flex-start",
      marginBottom: operationalTheme.spacing.lg,
    },
    modalTypeText: {
      color: operationalTheme.colors.warning[500],
      fontSize: operationalTheme.typography.fontSize.sm,
      fontWeight: "600",
    },
    modalSection: {
      marginBottom: operationalTheme.spacing.lg,
    },
    modalSectionTitle: {
      fontSize: operationalTheme.typography.fontSize.sm,
      fontWeight: "600",
      color: operationalTheme.colors.text.tertiary,
      marginBottom: operationalTheme.spacing.sm,
      textTransform: "uppercase",
    },
    modalValue: {
      fontSize: operationalTheme.typography.fontSize.sm,
      color: operationalTheme.colors.text.primary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    modalInput: {
      backgroundColor: colorWithAlpha(operationalTheme.colors.text.inverse, 0.05),
      color: operationalTheme.colors.text.primary,
      padding: operationalTheme.spacing.md,
      borderRadius: operationalTheme.borderRadius.md,
      fontSize: operationalTheme.typography.fontSize.md,
      marginBottom: operationalTheme.spacing.lg,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
    },
    modalTextArea: {
      minHeight: 100,
      textAlignVertical: "top",
    },
    modalActions: {
      flexDirection: "row",
      gap: operationalTheme.spacing.md,
      marginBottom: operationalTheme.spacing.md,
    },
    modalButton: {
      flex: 1,
      paddingVertical: operationalTheme.spacing.md,
      borderRadius: operationalTheme.borderRadius.full,
      alignItems: "center",
    },
    modalButtonCancel: {
      backgroundColor: operationalTheme.colors.background.glass,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
    },
    modalButtonText: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.md,
      fontWeight: "600",
    },
  });
