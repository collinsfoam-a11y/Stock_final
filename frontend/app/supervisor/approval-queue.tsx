/**
 * Supervisor Approval Queue Screen
 * Displays observations pending supervisor review or action.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, Alert, Platform } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  getSupervisorQueue,
  supervisorDecide,
  type SupervisorDecidePayload,
} from "../../src/services/api/approvalApi";
import { useSettingsStore } from "../../src/store/settingsStore";
import { legacyTheme as theme } from "@/theme/unified";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { safeBackNavigation } from "@/utils/navigation";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { ModernCard } from "@/components/ui/ModernCard";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

type QueueType = "quantity_variance" | "batch_mrp_mismatch" | "serial_conflict" | "location_investigation" | "damage_condition" | "return_repair" | "unknown_items" | "bundle_proposals" | "recount_requests" | "sync_conflicts" | "session_finalisation";

type QueueTypeLabel = {
  label: string;
  value: QueueType;
  icon: keyof typeof Ionicons.glyphMap;
};

const QUEUE_TYPES: QueueTypeLabel[] = [
  { label: "Quantity variance", value: "quantity_variance", icon: "swap-horizontal" },
  { label: "Batch / MRP", value: "batch_mrp_mismatch", icon: "cube" },
  { label: "Serial conflict", value: "serial_conflict", icon: "key" },
  { label: "Location", value: "location_investigation", icon: "location" },
  { label: "Damage / Condition", value: "damage_condition", icon: "warning" },
  { label: "Return / Repair", value: "return_repair", icon: "refresh" },
  { label: "Unknown items", value: "unknown_items", icon: "help-circle" },
  { label: "Bundle proposals", value: "bundle_proposals", icon: "albums" },
  { label: "Recounts", value: "recount_requests", icon: "repeat" },
  { label: "Sync conflicts", value: "sync_conflicts", icon: "cloud-offline" },
  { label: "Finalisation", value: "session_finalisation", icon: "checkmark-circle" },
];

export default function ApprovalQueueScreen() {
  const router = useRouter();
  const { show } = useToast();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [activeQueue, setActiveQueue] = useState<QueueType>("quantity_variance");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadQueue = useCallback(async (queueType: QueueType, shouldRefresh = false) => {
    try {
      if (shouldRefresh) setRefreshing(true);
      const response = await getSupervisorQueue(queueType, undefined, 100);
      setItems(response.data?.items || []);
    } catch (error) {
      show("Failed to load approval queue", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [show]);

  useEffect(() => {
    loadQueue(activeQueue);
  }, [activeQueue, loadQueue]);

  const handleDecision = async (observationId: string, action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessingIds((prev) => new Set(prev).add(observationId));

    try {
      await supervisorDecide(observationId, {
        action,
        reason: `Supervisor ${action.toLowerCase()} from queue`,
      });
      show(`Observation ${action.toLowerCase()}`, "success");
      await loadQueue(activeQueue, true);
    } catch (error: any) {
      show(error?.message || "Decision failed", "error");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(observationId);
        return next;
      });
    }
  };

  const confirmDecision = (observationId: string, action: string) => {
    Alert.alert(
      `Confirm ${action}`,
      "Supervisor actions are audit-logged and cannot be silently reverted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: "destructive",
          onPress: () => handleDecision(observationId, action),
        },
      ],
    );
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isProcessing = processingIds.has(item.observation_id);
    const exception = (item.exception_types || []).slice(0, 2).join(", ");

    return (
      <Animated.View entering={FadeInDown.delay(index * 20).springify()}>
        <ModernCard style={styles.card}>
          <AppTouchable
            activeOpacity={0.8}
            onPress={() =>
              router.push({
                pathname: "/(app)/supervisor/observation-detail" as any,
                params: { observationId: item.observation_id },
              } as any)
            }
 >
            <View style={styles.header}>
              <Text style={styles.itemCode}>{item.item_identity?.item_code || item.observation_id}</Text>
              {item.system_recommendation ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.warning.main + "20" }]}>
                  <Text style={[styles.badgeText, { color: theme.colors.warning.main }]}>
                    {item.system_recommendation}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{item.staff_user}</Text>
              <Text style={styles.metaText}>{item.location || "No location"}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.quantityText}>Physical: {item.physical_qty}</Text>
              <Text style={styles.quantityText}>SQL: {item.sql_qty_at_submission ?? "—"}</Text>
              <Text style={[styles.quantityText, item.variance ? styles.variance : styles.noVariance]}>
                Variance: {item.variance ?? 0}
              </Text>
            </View>

            {exception ? <Text style={styles.exceptionText}>Exceptions: {exception}</Text> : null}
            {item.mandatory_remark ? (
              <Text style={styles.remarkText} numberOfLines={2}>
                Remark: {item.mandatory_remark}
              </Text>
            ) : null}
          </AppTouchable>

          <View style={styles.actions}>
            <AnimatedPressable
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => confirmDecision(item.observation_id, "APPROVE")}
              disabled={isProcessing}
            >
              <Text style={styles.approveText}>{isProcessing ? "Working..." : "Approve"}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => confirmDecision(item.observation_id, "REJECT")}
              disabled={isProcessing}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionButton, styles.recountButton]}
              onPress={() =>
                router.push({
                  pathname: "/(app)/supervisor/recount-request" as any,
                  params: { observationId: item.observation_id },
                } as any)
              }
              disabled={isProcessing}
            >
              <Text style={styles.recountText}>Recount</Text>
            </AnimatedPressable>
          </View>
        </ModernCard>
      </Animated.View>
    );
  };

  return (
    <ScreenContainer>
      <StatusBar style="dark" backgroundColor={theme.colors.background.default} />
      <View style={styles.headerRow}>
        <AppTouchable
          onPress={() => safeBackNavigation(router)}
          hitSlop={12}
          accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={24} color={theme.colors.text.primary} />
        </AppTouchable>
        <Text style={styles.screenTitle}>Approval Queue</Text>
      </View>
      <FlashList
        horizontal
        data={QUEUE_TYPES}
        keyExtractor={(item) => item.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.queueTabs}
        renderItem={({ item }) => {
          const isActive = activeQueue === item.value;
          return (
            <AppTouchable
              style={[styles.queueTab, isActive && styles.queueTabActive]}
              onPress={() => setActiveQueue(item.value)}
 >
              <Ionicons
                name={item.icon}
                size={18}
                color={isActive ? theme.colors.primary[500] : theme.colors.text.secondary}
              />
              <Text
                style={[styles.queueTabText, isActive && styles.queueTabTextActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </AppTouchable>
          );
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.observation_id}
          renderItem={renderItem}
          // @ts-ignore — FlashList's installed types omit estimatedItemSize; see sessions.tsx
          estimatedItemSize={220}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadQueue(activeQueue, true)} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No items in this queue</Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  screenTitle: {
    ...theme.typography.h4,
    color: theme.colors.text.primary,
  },
  queueTabs: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  queueTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.light,
  },
  queueTabActive: {
    backgroundColor: theme.colors.primary[500] + "18",
    borderColor: theme.colors.primary[500],
  },
  queueTabText: {
    ...theme.typography.label.medium,
    color: theme.colors.text.secondary,
  },
  queueTabTextActive: {
    color: theme.colors.primary[500],
    fontWeight: "600",
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemCode: {
    ...theme.typography.h6,
    color: theme.colors.text.primary,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  badgeText: {
    ...theme.typography.label.medium,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  metaText: {
    ...theme.typography.body.small,
    color: theme.colors.text.secondary,
  },
  quantityText: {
    ...theme.typography.body.small,
    color: theme.colors.text.primary,
  },
  variance: {
    color: theme.colors.error.main,
    fontWeight: "600",
  },
  noVariance: {
    color: theme.colors.success.main,
  },
  exceptionText: {
    ...theme.typography.label.medium,
    color: theme.colors.error.main,
    marginTop: 6,
  },
  remarkText: {
    ...theme.typography.label.medium,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
  },
  approveButton: {
    backgroundColor: theme.colors.success.main + "18",
  },
  approveText: {
    color: theme.colors.success.main,
    fontWeight: "600",
  },
  rejectButton: {
    backgroundColor: theme.colors.error.main + "18",
  },
  rejectText: {
    color: theme.colors.error.main,
    fontWeight: "600",
  },
  recountButton: {
    backgroundColor: theme.colors.primary[500] + "18",
  },
  recountText: {
    color: theme.colors.primary[500],
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    ...theme.typography.body.medium,
    color: theme.colors.text.secondary,
  },
});
