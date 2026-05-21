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
import {
  AnimatedPressable,
  ModernCard,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
  OperationalCommandBar,
  OperationalListRow,
  OperationalListSection,
  OperationalSplitView,
  OperationalStatusStrip,
} from "../../src/components/ui";
import type {
  OperationalCommandAction,
  OperationalListRowSeverity,
  OperationalListRowTone,
} from "../../src/components/ui";
import { safeBackNavigation } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useOperationalQueueNavigation } from "@/hooks/useOperationalQueueNavigation";
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

const formatConflictTimestamp = (value?: string) => {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
};

const getConflictTone = (status?: string): OperationalListRowTone => {
  switch (String(status || "").toLowerCase()) {
    case "resolved":
    case "accepted":
      return "completed";
    case "pending":
      return "blocked";
    case "failed":
    case "error":
      return "error";
    default:
      return "warning";
  }
};

const getConflictSeverity = (status?: string): OperationalListRowSeverity =>
  String(status || "").toLowerCase() === "pending" ? "high" : "low";

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
      setStats(response?.data ?? response);
    } catch (error: any) {
      console.error("Failed to load conflict stats:", error);
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const status = filterStatus === "all" ? undefined : filterStatus;
      const response = await getSyncConflicts(status);
      setConflicts(response?.data?.conflicts || response?.conflicts || []);
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

  const handleResolve = useCallback(
    async (conflictId: string, resolution: string) => {
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
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", error.message || "Failed to resolve conflict");
      }
    },
    [loadData, resolutionNote]
  );

  const handleBatchResolve = useCallback(async (resolution: string) => {
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
  }, [loadData, resolutionNote, selectedConflicts]);

  const toggleConflictSelection = useCallback((conflictId: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedConflicts((current) => {
      const newSelection = new Set(current);
      if (newSelection.has(conflictId)) {
        newSelection.delete(conflictId);
      } else {
        newSelection.add(conflictId);
      }
      return newSelection;
    });
  }, []);

  const openConflictDetail = useCallback((conflict: SyncConflict) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedConflict(conflict);
    setModalVisible(true);
  }, []);

  const handleConflictPress = useCallback(
    (conflict: SyncConflict) => {
      setSelectedConflict(conflict);
      toggleConflictSelection(conflict._id);
    },
    [toggleConflictSelection]
  );

  const renderConflictCard = useCallback(
    ({ item }: { item: SyncConflict }) => {
      const isSelected = selectedConflicts.has(item._id);
      const statusLabel = String(item.status || "pending").toUpperCase();
      const localValue = JSON.stringify(item.local_value) ?? "N/A";
      const serverValue = JSON.stringify(item.server_value) ?? "N/A";

      return (
        <OperationalListRow
          title={item.item_code || "Unknown item"}
          subtitle={item.conflict_type.replace(/_/g, " ")}
          metadata={[`Session ${item.session_id || "N/A"}`]}
          metrics={[
            {
              label: "Local",
              value: localValue.length > 18 ? "Changed" : localValue,
              tone: "warning",
              icon: "phone-portrait-outline",
            },
            {
              label: "Server",
              value: serverValue.length > 18 ? "Changed" : serverValue,
              tone: "info",
              icon: "cloud-outline",
            },
          ]}
          status={statusLabel}
          statusTone={getConflictTone(item.status)}
          severity={getConflictSeverity(item.status)}
          leftIcon={isSelected ? "checkmark-circle" : "git-compare-outline"}
          badges={[
            {
              label: item.conflict_type.replace(/_/g, " "),
              tone: item.status === "pending" ? "blocked" : "completed",
              icon: "swap-horizontal-outline",
            },
          ]}
          timestamps={
            [
              {
                label: "Detected",
                value: formatConflictTimestamp(item.detected_at),
                icon: "time-outline",
              },
              item.resolved_at
                ? {
                    label: "Resolved",
                    value: formatConflictTimestamp(item.resolved_at),
                    icon: "checkmark-circle-outline",
                  }
                : undefined,
            ].filter(Boolean) as {
              label: string;
              value: string;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          }
          selectable
          selected={isSelected}
          onPress={() => handleConflictPress(item)}
          onKeyboardOpen={() => openConflictDetail(item)}
          onLongPress={() => openConflictDetail(item)}
          accessibility={{
            label: `${isSelected ? "Selected" : "Unselected"} conflict for ${item.item_code}, ${item.conflict_type}. Status ${statusLabel}.`,
            hint: "Selects this conflict. Long press to review local and server values.",
          }}
          style={styles.rowSpacing}
        />
      );
    },
    [handleConflictPress, openConflictDetail, selectedConflicts, styles.rowSpacing]
  );

  const getConflictId = useCallback((item: SyncConflict) => item._id, []);

  useOperationalQueueNavigation({
    items: conflicts,
    selectedItem: selectedConflict,
    getItemId: getConflictId,
    onSelect: setSelectedConflict,
    onOpen: openConflictDetail,
    onEscape: () => {
      setModalVisible(false);
      setSelectedConflict(null);
    },
    enabled: !loading,
  });

  const resolveCommandActions = useMemo<OperationalCommandAction[]>(() => {
    if (!selectedConflict) return [];

    const itemLabel = selectedConflict.item_code || "selected conflict";

    return [
      {
        id: "accept-server",
        label: "Accept Server",
        icon: "cloud-done-outline",
        tone: "success",
        shortcut: "S",
        onPress: () => handleResolve(selectedConflict._id, "accept_server"),
        accessibilityLabel: `Accept server value for ${itemLabel}`,
        accessibilityHint: "Resolves this conflict using server data",
      },
      {
        id: "accept-local",
        label: "Accept Local",
        icon: "phone-portrait-outline",
        tone: "secondary",
        shortcut: "L",
        onPress: () => handleResolve(selectedConflict._id, "accept_local"),
        accessibilityLabel: `Accept local value for ${itemLabel}`,
        accessibilityHint: "Resolves this conflict using local offline data",
      },
    ];
  }, [handleResolve, selectedConflict]);

  const batchCommandActions = useMemo<OperationalCommandAction[]>(
    () => [
      {
        id: "batch-accept-server",
        label: `Server (${selectedConflicts.size})`,
        icon: "cloud-done-outline",
        tone: "success",
        shortcut: "Mod+V",
        disabled: selectedConflicts.size === 0,
        onPress: () => void handleBatchResolve("accept_server"),
        accessibilityLabel: `Accept server values for ${selectedConflicts.size} selected conflicts`,
        accessibilityHint: "Resolves the selected conflict queue using server data",
      },
      {
        id: "batch-accept-local",
        label: `Local (${selectedConflicts.size})`,
        icon: "phone-portrait-outline",
        tone: "secondary",
        shortcut: "Mod+Shift+R",
        disabled: selectedConflicts.size === 0,
        onPress: () => void handleBatchResolve("accept_local"),
        accessibilityLabel: `Accept local values for ${selectedConflicts.size} selected conflicts`,
        accessibilityHint: "Resolves the selected conflict queue using local offline data",
      },
    ],
    [handleBatchResolve, selectedConflicts.size]
  );

  const modalResolveCommandActions = useMemo<OperationalCommandAction[]>(
    () => [
      ...resolveCommandActions,
      {
        id: "cancel-resolution",
        label: "Cancel",
        icon: "close",
        tone: "neutral",
        shortcut: "Escape",
        onPress: () => setModalVisible(false),
        accessibilityLabel: "Cancel conflict resolution",
        accessibilityHint: "Closes the resolve conflict dialog",
      },
    ],
    [resolveCommandActions]
  );

  const detailPanel = useMemo(() => {
    if (!selectedConflict) {
      return (
        <View style={styles.detailEmpty}>
          <Ionicons
            name="git-compare-outline"
            size={48}
            color={operationalTheme.colors.text.tertiary}
          />
          <Text style={styles.detailEmptyTitle}>Select a conflict</Text>
          <Text style={styles.detailEmptyBody}>
            Choose a row to compare local and server values before resolving.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.detailPanel}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTitleBlock}>
            <Text style={styles.detailEyebrow}>Conflict detail</Text>
            <Text style={styles.detailTitle} numberOfLines={2}>
              {selectedConflict.item_code}
            </Text>
            <Text style={styles.detailSubtitle} numberOfLines={1}>
              {selectedConflict.conflict_type.replace(/_/g, " ")}
            </Text>
          </View>
          <View style={styles.detailStatusBadge}>
            <Text style={styles.detailStatusText}>
              {String(selectedConflict.status || "pending").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.detailMetaRow}>
          <View style={styles.detailMetaItem}>
            <Text style={styles.detailMetaLabel}>Session</Text>
            <Text style={styles.detailMetaValue} numberOfLines={1}>
              {selectedConflict.session_id || "N/A"}
            </Text>
          </View>
          <View style={styles.detailMetaItem}>
            <Text style={styles.detailMetaLabel}>Detected</Text>
            <Text style={styles.detailMetaValue} numberOfLines={1}>
              {formatConflictTimestamp(selectedConflict.detected_at)}
            </Text>
          </View>
        </View>

        <View style={styles.detailCompareGrid}>
          <View style={styles.detailCompareColumn}>
            <Text style={styles.detailSectionTitle}>Local value</Text>
            <View style={styles.detailCodeBlock}>
              <Text style={styles.detailCodeText}>
                {JSON.stringify(selectedConflict.local_value, null, 2)}
              </Text>
            </View>
          </View>
          <View style={styles.detailCompareColumn}>
            <Text style={styles.detailSectionTitle}>Server value</Text>
            <View style={styles.detailCodeBlock}>
              <Text style={styles.detailCodeText}>
                {JSON.stringify(selectedConflict.server_value, null, 2)}
              </Text>
            </View>
          </View>
        </View>

        {selectedConflict.status !== "pending" ? (
          <View style={styles.detailResolvedCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color={operationalTheme.colors.success[500]}
            />
            <Text style={styles.detailResolvedText}>
              Resolved {selectedConflict.resolution || ""} by{" "}
              {selectedConflict.resolved_by || "system"}
            </Text>
          </View>
        ) : null}

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

        <OperationalCommandBar
          compact
          align="stretch"
          title="Resolution command"
          subtitle="Use S for server or L for local when focus is outside the note field."
          actions={resolveCommandActions}
          enableKeyboardShortcuts={!modalVisible}
          style={styles.detailCommandBar}
        />
      </View>
    );
  }, [
    operationalTheme.colors.success,
    operationalTheme.colors.text,
    modalVisible,
    resolutionNote,
    resolveCommandActions,
    selectedConflict,
    styles,
  ]);

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

        <Animated.View entering={statsEntry} style={styles.statusStripWrap}>
          <OperationalStatusStrip
            compact
            syncState={loading ? "Loading" : refreshing ? "Refreshing" : "Ready"}
            pendingQueueCount={stats?.pending ?? conflicts.length}
            runtimeHealth={(stats?.pending ?? conflicts.length) > 0 ? "Degraded" : "Stable"}
            items={[
              {
                id: "conflict-total",
                label: "Total",
                value: stats?.total ?? conflicts.length,
                tone: "info",
                icon: "alert-circle-outline",
              },
              {
                id: "conflict-resolved",
                label: "Resolved",
                value: stats?.resolved ?? 0,
                tone: "success",
                icon: "checkmark-circle-outline",
              },
              {
                id: "conflict-selected",
                label: "Selected",
                value: selectedConflicts.size,
                tone: selectedConflicts.size > 0 ? "active" : "neutral",
                icon: "checkbox-outline",
              },
            ]}
            testID="sync-conflicts-operational-status-strip"
          />
        </Animated.View>

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
            <OperationalCommandBar
              compact
              align="stretch"
              title={`${selectedConflicts.size} selected`}
              subtitle="Cmd/Ctrl+V accepts server. Cmd/Ctrl+Shift+R accepts local."
              actions={batchCommandActions}
              style={styles.batchCommandBar}
            />
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
          <OperationalSplitView
            collapsible
            persistSelection={false}
            sidebarLabel="Conflict queue"
            detailLabel={
              selectedConflict
                ? `Conflict detail for ${selectedConflict.item_code}`
                : "Conflict detail"
            }
            style={styles.splitView}
            sidebar={
              <OperationalListSection
                title="Conflict queue"
                subtitle={`${conflicts.length} ${filterStatus} ${conflicts.length === 1 ? "conflict" : "conflicts"}`}
                severity={conflicts.length > 0 ? "high" : "none"}
                style={styles.listSection}
                contentStyle={styles.sectionListContent}
              >
                <FlashList
                  data={conflicts}
                  renderItem={renderConflictCard}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.comfortable * 6}
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
              </OperationalListSection>
            }
            detail={detailPanel}
          />
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

                  <OperationalCommandBar
                    compact
                    align="stretch"
                    title="Resolution command"
                    subtitle="Use S for server, L for local, or Escape to cancel when focus is outside the note field."
                    actions={modalResolveCommandActions}
                    enableKeyboardShortcuts={modalVisible}
                    style={styles.modalCommandBar}
                  />
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
      marginBottom: operationalTheme.spacing.sm,
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
    statusStripWrap: {
      marginBottom: operationalTheme.spacing.sm,
    },
    filterBar: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
      marginBottom: operationalTheme.spacing.sm,
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
      marginBottom: operationalTheme.spacing.sm,
    },
    batchCommandBar: {
      marginBottom: 0,
    },
    splitView: {
      flex: 1,
      minHeight: 0,
    },
    listSection: {
      flex: 1,
      minHeight: 220,
    },
    sectionListContent: {
      flex: 1,
    },
    rowSpacing: {
      marginBottom: operationalTheme.spacing.sm,
    },
    detailPanel: {
      flex: 1,
      minHeight: 0,
      padding: operationalTheme.spacing.sm,
      gap: operationalTheme.spacing.sm,
    },
    detailEmpty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: operationalTheme.spacing.xl,
    },
    detailEmptyTitle: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.lg,
      fontWeight: "800",
      marginTop: operationalTheme.spacing.md,
    },
    detailEmptyBody: {
      color: operationalTheme.colors.text.secondary,
      fontSize: operationalTheme.typography.fontSize.sm,
      lineHeight: 20,
      textAlign: "center",
      marginTop: operationalTheme.spacing.xs,
    },
    detailHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: operationalTheme.spacing.md,
    },
    detailTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    detailEyebrow: {
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: operationalTheme.spacing.xs,
    },
    detailTitle: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize["2xl"],
      fontWeight: "800",
    },
    detailSubtitle: {
      color: operationalTheme.colors.text.secondary,
      fontSize: operationalTheme.typography.fontSize.sm,
      fontWeight: "600",
      marginTop: operationalTheme.spacing.xs,
      textTransform: "capitalize",
    },
    detailStatusBadge: {
      borderRadius: operationalTheme.borderRadius.full,
      borderWidth: 1,
      borderColor: colorWithAlpha(operationalTheme.colors.warning[500], 0.34),
      backgroundColor: colorWithAlpha(operationalTheme.colors.warning[500], 0.1),
      paddingHorizontal: operationalTheme.spacing.sm,
      paddingVertical: operationalTheme.spacing.xs,
    },
    detailStatusText: {
      color: operationalTheme.colors.warning[500],
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
    },
    detailMetaRow: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
    },
    detailMetaItem: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
      borderRadius: operationalTheme.borderRadius.md,
      backgroundColor: operationalTheme.colors.background.glass,
      padding: operationalTheme.spacing.sm,
    },
    detailMetaLabel: {
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: operationalTheme.spacing.xs,
    },
    detailMetaValue: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "700",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    detailCompareGrid: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
    },
    detailCompareColumn: {
      flex: 1,
      minWidth: 0,
    },
    detailSectionTitle: {
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: operationalTheme.spacing.xs,
    },
    detailCodeBlock: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
      borderRadius: operationalTheme.borderRadius.md,
      backgroundColor: colorWithAlpha(operationalTheme.colors.text.inverse, 0.05),
      padding: operationalTheme.spacing.sm,
    },
    detailCodeText: {
      color: operationalTheme.colors.text.primary,
      fontSize: operationalTheme.typography.fontSize.xs,
      lineHeight: 18,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    detailResolvedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: operationalTheme.spacing.sm,
      borderWidth: 1,
      borderColor: colorWithAlpha(operationalTheme.colors.success[500], 0.28),
      borderRadius: operationalTheme.borderRadius.md,
      backgroundColor: colorWithAlpha(operationalTheme.colors.success[500], 0.08),
      padding: operationalTheme.spacing.sm,
    },
    detailResolvedText: {
      flex: 1,
      color: operationalTheme.colors.success[500],
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "700",
    },
    detailCommandBar: {
      marginTop: operationalTheme.spacing.xs,
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
    modalCommandBar: {
      marginTop: operationalTheme.spacing.md,
    },
  });
