import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ItemVerificationAPI } from "@/domains/inventory/services/itemVerificationApi";
import { getAssignableStaffUsers } from "@/services/api/api";
import { ScreenContainer, ModernCard, StatsCard, AnimatedPressable } from "@/components/ui";
import { useSettingsStore } from "@/store/settingsStore";
import RecountAssignmentModal, {
  type AssignableStaffUser,
} from "@/components/supervisor/RecountAssignmentModal";
import { theme } from "@/styles/unifiedSystem";
import { useUiTokens } from "@/hooks/useUiTokens";
import { semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
import { useToast } from "@/components/feedback/ToastProvider";
import { safeBackNavigation } from "@/utils/navigation";

export default function VarianceDetailsScreen() {
  const { itemCode } = useLocalSearchParams();
  const router = useRouter();
  const { show } = useToast();
  const uiTokens = useUiTokens();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [recountModalVisible, setRecountModalVisible] = useState(false);
  const [assignableStaff, setAssignableStaff] = useState<AssignableStaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      if (offlineMode) {
        setItemDetails(null);
        return;
      }

      const response = await ItemVerificationAPI.getVariances({
        search: itemCode as string,
        limit: 1,
      });

      if (response.variances && response.variances.length > 0) {
        setItemDetails(response.variances[0]);
      } else {
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        show("Item details not found", "error");
        safeBackNavigation(router, { fallbackHref: "/supervisor/variances" });
      }
    } catch (error: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      show(error.message || "Failed to load details", "error");
    } finally {
      setLoading(false);
    }
  }, [itemCode, offlineMode, router, show]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const loadAssignableStaff = useCallback(async () => {
    if (offlineMode) {
      throw new Error("Recount assignment requires a live connection.");
    }

    if (assignableStaff.length > 0) {
      return assignableStaff;
    }

    try {
      setStaffLoading(true);
      const staff = await getAssignableStaffUsers();
      setAssignableStaff(staff);
      return staff;
    } catch (error: any) {
      show(error.message || "Failed to load staff list", "error");
      throw error;
    } finally {
      setStaffLoading(false);
    }
  }, [assignableStaff, offlineMode, show]);

  const handleApprove = async () => {
    if (offlineMode) {
      show("Variance approval requires a live connection", "warning");
      return;
    }

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Confirm Approval",
      "Are you sure you want to approve this variance? This will update the system stock.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessing(true);
              if (itemDetails?.count_line_id) {
                await ItemVerificationAPI.approveVariance(itemDetails.count_line_id);
                if (Platform.OS !== "web")
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                show("Variance approved successfully", "success");
                safeBackNavigation(router, { fallbackHref: "/supervisor/variances" });
              } else {
                throw new Error("Count line ID not found");
              }
            } catch (error: any) {
              if (Platform.OS !== "web")
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              show(error.message || "Failed to approve variance", "error");
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenRecount = async () => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      await loadAssignableStaff();
      setRecountModalVisible(true);
    } catch {
      // Error already surfaced to the user.
    }
  };

  const handleSubmitRecount = async ({ notes, assignTo }: { notes: string; assignTo?: string }) => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    try {
      setProcessing(true);
      if (itemDetails?.count_line_id) {
        await ItemVerificationAPI.requestRecount(
          itemDetails.count_line_id,
          notes || undefined,
          assignTo
        );
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        show(
          assignTo ? `Recount assigned to ${assignTo}` : "Recount requested successfully",
          "success"
        );
        setRecountModalVisible(false);
        safeBackNavigation(router, { fallbackHref: "/supervisor/variances" });
      } else {
        throw new Error("Count line ID not found");
      }
    } catch (error: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      show(error.message || "Failed to request recount", "error");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  if (!itemDetails) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ModernCard variant="outlined" elevation="none" intensity={15} padding={theme.spacing.xl}>
            <View style={{ alignItems: "center", gap: theme.spacing.md }}>
              <Ionicons name="alert-circle-outline" size={48} color={uiTokens.colors.textMuted} />
              <Text style={{ color: uiTokens.colors.textSecondary }}>
                {offlineMode
                  ? "Variance details are unavailable in offline mode"
                  : "Item not found"}
              </Text>
              <AnimatedPressable
                onPress={() => safeBackNavigation(router, { fallbackHref: "/supervisor/variances" })}
              >
                <Text style={{ color: uiTokens.colors.accent }}>Go Back</Text>
              </AnimatedPressable>
            </View>
          </ModernCard>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => safeBackNavigation(router, { fallbackHref: "/supervisor/variances" })}
              style={[
                styles.backButton,
                { backgroundColor: uiTokens.colors.surface, borderColor: uiTokens.colors.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={uiTokens.colors.textPrimary} />
            </AnimatedPressable>
            <Text style={[styles.headerTitle, { color: uiTokens.colors.textPrimary }]}>
              Variance Details
            </Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Item Profile */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <ModernCard
              variant="outlined"
              elevation="none"
              padding={theme.spacing.lg}
              style={styles.card}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemIcon}>
                  <Ionicons name="cube-outline" size={32} color={uiTokens.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: uiTokens.colors.textPrimary }]}>
                    {itemDetails.item_name}
                  </Text>
                  <Text style={[styles.itemCode, { color: uiTokens.colors.textSecondary }]}>
                    {itemDetails.item_code}
                  </Text>
                </View>
              </View>
            </ModernCard>
          </Animated.View>

          {/* Stats Row */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.statsRow}>
            <StatsCard
              title="System Qty"
              value={itemDetails.system_qty?.toString() || "0"}
              icon="server-outline"
              variant="primary"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Verified Qty"
              value={itemDetails.verified_qty?.toString() || "0"}
              icon="checkmark-circle-outline"
              variant="success"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Variance"
              value={`${itemDetails.variance > 0 ? "+" : ""}${itemDetails.variance}`}
              icon="swap-vertical-outline"
              variant={itemDetails.variance === 0 ? "success" : "error"}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {/* Details */}
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <ModernCard
              variant="outlined"
              elevation="none"
              padding={theme.spacing.lg}
              style={styles.card}
            >
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: uiTokens.colors.textMuted }]}>
                    Verified By
                  </Text>
                  <View style={styles.detailValueRow}>
                    <Ionicons
                      name="person-circle-outline"
                      size={18}
                      color={uiTokens.colors.textSecondary}
                    />
                    <Text style={[styles.detailValue, { color: uiTokens.colors.textPrimary }]}>
                      {itemDetails.verified_by || "Unknown"}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: uiTokens.colors.textMuted }]}>
                    Time
                  </Text>
                  <View style={styles.detailValueRow}>
                    <Ionicons name="time-outline" size={18} color={uiTokens.colors.textSecondary} />
                    <Text style={[styles.detailValue, { color: uiTokens.colors.textPrimary }]}>
                      {itemDetails.verified_at
                        ? new Date(itemDetails.verified_at).toLocaleString()
                        : "N/A"}
                    </Text>
                  </View>
                </View>
              </View>

              {itemDetails.floor || itemDetails.rack ? (
                <View style={[styles.detailRow, { marginTop: theme.spacing.md }]}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: uiTokens.colors.textMuted }]}>
                      Location
                    </Text>
                    <View style={styles.detailValueRow}>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={uiTokens.colors.textSecondary}
                      />
                      <Text style={[styles.detailValue, { color: uiTokens.colors.textPrimary }]}>
                        {itemDetails.floor}
                        {itemDetails.rack ? ` / ${itemDetails.rack}` : ""}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </ModernCard>
          </Animated.View>
        </ScrollView>

        {/* Footer Actions */}
        <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.footer}>
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={theme.spacing.md}
            style={styles.footerInner}
          >
            <View style={styles.actionsContainer}>
              <AnimatedPressable
                onPress={() => void handleOpenRecount()}
                disabled={processing}
                style={[
                  styles.actionButton,
                  styles.secondaryButton,
                  { backgroundColor: uiTokens.colors.surface, borderColor: uiTokens.colors.border },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: uiTokens.colors.textPrimary }]}>
                  Request Recount
                </Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={handleApprove}
                disabled={processing}
                style={[
                  styles.actionButton,
                  styles.primaryButton,
                  { backgroundColor: uiTokens.colors.error },
                ]}
              >
                {processing ? (
                  <ActivityIndicator color={uiSemanticColors.text.inverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>Approve Variance</Text>
                )}
              </AnimatedPressable>
            </View>
          </ModernCard>
        </Animated.View>

        <RecountAssignmentModal
          visible={recountModalVisible}
          loading={processing || staffLoading}
          staffOptions={assignableStaff}
          defaultAssignee={itemDetails?.counted_by}
          onClose={() => setRecountModalVisible(false)}
          onSubmit={handleSubmitRecount}
          description="Choose the staff member who should recount this variance and add optional instructions."
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 100, // Space for footer
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    backgroundColor: "rgba(14, 165, 233, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.4)",
  },
  itemName: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemCode: {
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  detailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.md,
  },
  footerInner: {
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
  primaryButton: {},
  primaryButtonText: {
    color: uiSemanticColors.text.inverse,
    fontWeight: "600",
    fontSize: 16,
  },
});
