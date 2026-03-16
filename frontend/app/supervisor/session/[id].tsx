import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { AuroraBackground } from "../../../src/components/ui/AuroraBackground";
import { GlassCard } from "../../../src/components/ui/GlassCard";
import { AnimatedPressable } from "../../../src/components/ui/AnimatedPressable";
import { auroraTheme } from "../../../src/theme/auroraTheme";
import {
  getSession,
  getCountLines,
  approveCountLine,
  rejectCountLine,
  getAssignableStaffUsers,
  finalizeSession,
  updateSessionStatus,
  verifyStock,
  unverifyStock,
} from "../../../src/services/api/api";
import RecountAssignmentModal, {
  type AssignableStaffUser,
} from "../../../src/components/supervisor/RecountAssignmentModal";
import { useToast } from "../../../src/components/feedback/ToastProvider";
import { useSettingsStore } from "../../../src/store/settingsStore";

export default function SessionDetail() {
  // Support both "id" (from route) and "sessionId" (legacy or explicit) parameter
  const { id, sessionId } = useLocalSearchParams();
  const targetSessionId = (id || sessionId) as string;

  const router = useRouter();
  const { show } = useToast();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [session, setSession] = React.useState<any>(null);
  const [toVerifyLines, setToVerifyLines] = React.useState<any[]>([]);
  const [verifiedLines, setVerifiedLines] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sessionMissing, setSessionMissing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"toVerify" | "verified">(
    "toVerify",
  );
  const [verifying, setVerifying] = React.useState<string | null>(null);
  const [assignableStaff, setAssignableStaff] = React.useState<
    AssignableStaffUser[]
  >([]);
  const [staffLoading, setStaffLoading] = React.useState(false);
  const [recountModalVisible, setRecountModalVisible] = React.useState(false);
  const [pendingRejectLine, setPendingRejectLine] = React.useState<any | null>(
    null,
  );

  const loadData = React.useCallback(async () => {
    if (!targetSessionId) return;
    try {
      setLoading(true);
      const [sessionData, toVerifyData, verifiedData] = await Promise.all([
        getSession(targetSessionId),
        getCountLines(targetSessionId, 1, 100, false), // Not verified
        getCountLines(targetSessionId, 1, 100, true), // Verified
      ]);
      if (!sessionData) {
        setSession(null);
        setToVerifyLines([]);
        setVerifiedLines([]);
        setSessionMissing(true);
        show("This session is no longer available", "warning");
        return;
      }

      setSessionMissing(false);
      setSession(sessionData);
      setToVerifyLines(toVerifyData?.items || []);
      setVerifiedLines(verifiedData?.items || []);
    } catch {
      show("Failed to load session data", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [targetSessionId, show]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAssignableStaff = React.useCallback(async () => {
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
    } catch {
      show("Failed to load staff list", "error");
      throw new Error("Failed to load staff list");
    } finally {
      setStaffLoading(false);
    }
  }, [assignableStaff, offlineMode, show]);

  if (!loading && sessionMissing) {
    return (
      <AuroraBackground>
        <StatusBar style="light" />
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.replace("/supervisor/sessions")}
            style={styles.backButton}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={auroraTheme.colors.text.primary}
            />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Session Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={56}
            color={auroraTheme.colors.warning[500]}
          />
          <Text style={styles.loadingText}>This session is no longer available.</Text>
          {offlineMode && (
            <Text style={styles.offlineMissingText}>
              It is not available in the local session cache.
            </Text>
          )}
          <AnimatedPressable
            onPress={() => router.replace("/supervisor/sessions")}
            style={styles.closeButton}
          >
            <Text style={styles.buttonText}>Back to Sessions</Text>
          </AnimatedPressable>
        </View>
      </AuroraBackground>
    );
  }

  const handleApproveLine = async (lineId: string) => {
    if (offlineMode) {
      show("Approvals require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await approveCountLine(lineId);
      await loadData();
      show("Count line approved", "success");
    } catch {
      show("Failed to approve", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRejectLine = async (line: any) => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await loadAssignableStaff();
      setPendingRejectLine(line);
      setRecountModalVisible(true);
    } catch {
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSubmitReject = async ({
    notes,
    assignTo,
  }: {
    notes: string;
    assignTo?: string;
  }) => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    if (!pendingRejectLine?.id) {
      show("Count line not found", "error");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setVerifying(pendingRejectLine.id);
      await rejectCountLine(pendingRejectLine.id, {
        notes: notes || undefined,
        assign_to: assignTo,
      });
      setRecountModalVisible(false);
      setPendingRejectLine(null);
      await loadData();
      show(
        assignTo ? `Recount assigned to ${assignTo}` : "Count line rejected",
        "success",
      );
    } catch {
      show("Failed to reject", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setVerifying(null);
    }
  };

  const handleVerifyStock = async (lineId: string) => {
    if (offlineMode) {
      show("Stock verification requires a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setVerifying(lineId);
      await verifyStock(lineId);
      await loadData();
      show("Stock verified", "success");
    } catch {
      show("Failed to verify stock", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setVerifying(null);
    }
  };

  const handleUnverifyStock = async (lineId: string) => {
    if (offlineMode) {
      show("Verification changes require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setVerifying(lineId);
      await unverifyStock(lineId);
      await loadData();
      show("Verification removed", "success");
    } catch {
      show("Failed to remove verification", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setVerifying(null);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (offlineMode) {
      show("Session status changes require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateSessionStatus(targetSessionId, newStatus);
      await loadData();
      show(`Session status updated to ${newStatus} `, "success");
    } catch {
      show("Failed to update status", "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleFinalizeSession = async () => {
    if (offlineMode) {
      show("Session finalization requires a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await finalizeSession(targetSessionId);
      await loadData();
      show("Session finalized", "success");
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to finalize session";
      show(String(detail), "error");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const switchTab = (tab: "toVerify" | "verified") => {
    if (activeTab === tab) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setActiveTab(tab);
  };

  if (loading || !session) {
    return (
      <AuroraBackground>
        <StatusBar style="light" />
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={auroraTheme.colors.text.primary}
            />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Session Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={auroraTheme.colors.primary[500]}
          />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </AuroraBackground>
    );
  }

  const currentLines = activeTab === "toVerify" ? toVerifyLines : verifiedLines;
  const totalVariance = Number(session?.total_variance ?? 0);
  const sessionFinalized =
    session?.status === "COMPLETED" || session?.finalization_status === "FINALIZED";

  // Header Component for FlashList
  const ListHeader = () => (
    <View>
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <GlassCard
          variant="medium"
          withGradientBorder
          style={styles.sessionInfo}
        >
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Warehouse:</Text>
            <Text style={styles.infoValue}>{session.warehouse}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Staff:</Text>
            <Text style={styles.infoValue}>{session.staff_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={[styles.infoValue, styles.statusValue]}>
              {session.status}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Items:</Text>
            <Text style={styles.infoValue}>{session.total_items}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Variance:</Text>
            <Text
              style={[
                styles.infoValue,
                totalVariance !== 0 && styles.varianceValue,
              ]}
            >
              {totalVariance.toFixed(2)}
            </Text>
          </View>
        </GlassCard>
      </Animated.View>

      {session.status === "OPEN" && !offlineMode && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.actionButtons}
        >
          <AnimatedPressable
            style={styles.reconcileButton}
            onPress={() => handleUpdateStatus("RECONCILE")}
          >
            <Text style={styles.buttonText}>Move to Reconcile</Text>
          </AnimatedPressable>
        </Animated.View>
      )}

      {session.status === "RECONCILE" && !offlineMode && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.actionButtons}
        >
          <AnimatedPressable
            style={styles.closeButton}
            onPress={() => void handleFinalizeSession()}
          >
            <Text style={styles.buttonText}>Finalize Session</Text>
          </AnimatedPressable>
        </Animated.View>
      )}

      {sessionFinalized && (
        <Animated.View entering={FadeInDown.delay(220).springify()}>
          <GlassCard variant="medium" style={styles.offlineNotice}>
            <View style={styles.offlineNoticeRow}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={auroraTheme.colors.success[500]}
              />
              <View style={styles.offlineNoticeCopy}>
                <Text style={styles.offlineNoticeTitle}>
                  Session finalized
                </Text>
                <Text style={styles.offlineNoticeBody}>
                  Finalized sessions are locked for audit integrity. Count lines
                  can be reviewed, but approvals and edits are disabled.
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {offlineMode && (
        <Animated.View entering={FadeInDown.delay(220).springify()}>
          <GlassCard variant="medium" style={styles.offlineNotice}>
            <View style={styles.offlineNoticeRow}>
              <Ionicons
                name="cloud-offline-outline"
                size={18}
                color={auroraTheme.colors.warning[500]}
              />
              <View style={styles.offlineNoticeCopy}>
                <Text style={styles.offlineNoticeTitle}>
                  Viewing cached session data
                </Text>
                <Text style={styles.offlineNoticeBody}>
                  Count lines and session details can be reviewed offline, but
                  approvals, recounts, verification changes, and status updates
                  require a live connection.
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {/* Tab Selection */}
      <Animated.View
        entering={FadeInDown.delay(300).springify()}
        style={styles.tabContainer}
      >
        <AnimatedPressable
          style={[styles.tab, activeTab === "toVerify" && styles.tabActive]}
          onPress={() => switchTab("toVerify")}
        >
          <Ionicons
            name="list-outline"
            size={20}
            color={
              activeTab === "toVerify"
                ? auroraTheme.colors.text.primary
                : auroraTheme.colors.text.secondary
            }
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "toVerify" && styles.tabTextActive,
            ]}
          >
            To Verify ({toVerifyLines.length})
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tab, activeTab === "verified" && styles.tabActive]}
          onPress={() => switchTab("verified")}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={20}
            color={
              activeTab === "verified"
                ? auroraTheme.colors.text.primary
                : auroraTheme.colors.text.secondary
            }
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "verified" && styles.tabTextActive,
            ]}
          >
            Verified ({verifiedLines.length})
          </Text>
        </AnimatedPressable>
      </Animated.View>
    </View>
  );

  // Limit animation delay for performance on large lists
  const MAX_ANIMATED_ITEMS = 10;

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const normalizedStatus = String(item.status || "").toLowerCase();
    const varianceColor =
      item.variance === 0
        ? auroraTheme.colors.success[500]
        : auroraTheme.colors.error[500];
    const statusColor =
      normalizedStatus === "approved"
        ? auroraTheme.colors.success[500]
        : normalizedStatus === "rejected"
          ? auroraTheme.colors.error[500]
          : auroraTheme.colors.warning[500];

    // Only animate first N items to prevent performance issues on large lists
    const shouldAnimate = index < MAX_ANIMATED_ITEMS;
    const _animationDelay = shouldAnimate
      ? Math.min(index * 50 + 400, 1000)
      : 0;

    const content = (
      <GlassCard style={styles.lineCard}>
        <View style={styles.lineHeader}>
          <Text style={styles.lineName} numberOfLines={1}>
            {item.item_name}
          </Text>
          <View style={styles.badgeContainer}>
            {item.verified && (
              <View
                style={[
                  styles.verifiedBadge,
                  { backgroundColor: auroraTheme.colors.success[500] + "30" },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={auroraTheme.colors.success[500]}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color: auroraTheme.colors.success[500] },
                  ]}
                >
                  Verified
                </Text>
              </View>
            )}
            <View
              style={[
                styles.lineBadge,
                { backgroundColor: statusColor + "30" },
              ]}
            >
              <Text style={[styles.badgeText, { color: statusColor }]}>
                {(normalizedStatus || "pending").toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.lineCode}>Code: {item.item_code}</Text>
        {item.barcode && (
          <Text style={styles.lineCode}>Barcode: {item.barcode}</Text>
        )}

        <View style={styles.qtyRow}>
          <View style={styles.qtyItem}>
            <Text style={styles.qtyLabel}>ERP</Text>
            <Text style={styles.qtyValue}>{item.erp_qty}</Text>
          </View>
          <View style={styles.qtyItem}>
            <Text style={styles.qtyLabel}>Counted</Text>
            <Text style={styles.qtyValue}>{item.counted_qty}</Text>
          </View>
          <View style={styles.qtyItem}>
            <Text style={styles.qtyLabel}>Variance</Text>
            <Text style={[styles.qtyValue, { color: varianceColor }]}>
              {item.variance}
            </Text>
          </View>
        </View>

        {item.variance_reason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>
              Reason: {item.variance_reason}
            </Text>
            {item.variance_note && (
              <Text style={styles.reasonNote}>{item.variance_note}</Text>
            )}
          </View>
        )}

        {item.remark && (
          <Text style={styles.remark}>Remark: {item.remark}</Text>
        )}

        {item.verified && item.verified_by && (
          <View style={styles.verifiedInfo}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={auroraTheme.colors.success[500]}
            />
            <Text style={styles.verifiedInfoText}>
              Verified by {item.verified_by} on{" "}
              {new Date(item.verified_at).toLocaleString()}
            </Text>
          </View>
        )}

        {!offlineMode && !sessionFinalized && (
          <View style={styles.lineActions}>
            {normalizedStatus === "pending" && (
              <>
                <AnimatedPressable
                  style={styles.approveButton}
                  onPress={() => handleApproveLine(item.id)}
                >
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={auroraTheme.colors.text.primary}
                  />
                  <Text style={styles.actionButtonText}>Approve</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.rejectButton}
                  onPress={() => void handleRejectLine(item)}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={auroraTheme.colors.text.primary}
                  />
                  <Text style={styles.actionButtonText}>Reject</Text>
                </AnimatedPressable>
              </>
            )}

            {activeTab === "toVerify" && !item.verified && (
              <AnimatedPressable
                style={[
                  styles.verifyButton,
                  verifying === item.id && styles.buttonDisabled,
                ]}
                onPress={() => handleVerifyStock(item.id)}
                disabled={verifying === item.id}
              >
                {verifying === item.id ? (
                  <ActivityIndicator
                    size="small"
                    color={auroraTheme.colors.text.primary}
                  />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color={auroraTheme.colors.text.primary}
                    />
                    <Text style={styles.actionButtonText}>Verify Stock</Text>
                  </>
                )}
              </AnimatedPressable>
            )}

            {activeTab === "verified" && item.verified && (
              <AnimatedPressable
                style={[
                  styles.unverifyButton,
                  verifying === item.id && styles.buttonDisabled,
                ]}
                onPress={() => handleUnverifyStock(item.id)}
                disabled={verifying === item.id}
              >
                {verifying === item.id ? (
                  <ActivityIndicator
                    size="small"
                    color={auroraTheme.colors.text.primary}
                  />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle-outline"
                      size={20}
                      color={auroraTheme.colors.text.primary}
                    />
                    <Text style={styles.actionButtonText}>Unverify</Text>
                  </>
                )}
              </AnimatedPressable>
            )}
          </View>
        )}
      </GlassCard>
    );

    return content;
  };

  const renderEmpty = () => (
    <GlassCard variant="medium" style={styles.emptyContainer}>
      <Ionicons
        name={activeTab === "toVerify" ? "list-outline" : "checkmark-circle"}
        size={64}
        color={auroraTheme.colors.text.disabled}
      />
      <Text style={styles.emptyText}>
        {activeTab === "toVerify" ? "No items to verify" : "No verified items"}
      </Text>
    </GlassCard>
  );

  return (
    <AuroraBackground>
      <StatusBar style="light" />
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={styles.header}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={auroraTheme.colors.text.primary}
          />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Session Details</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <View style={styles.listContainer}>
        <FlashList
          data={currentLines}
          renderItem={renderItem}
          // @ts-ignore
          estimatedItemSize={250}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
        />
      </View>

      <RecountAssignmentModal
        visible={recountModalVisible}
        loading={
          staffLoading ||
          (pendingRejectLine?.id ? verifying === pendingRejectLine.id : false)
        }
        staffOptions={assignableStaff}
        defaultAssignee={pendingRejectLine?.counted_by}
        onClose={() => {
          if (verifying) return;
          setRecountModalVisible(false);
          setPendingRejectLine(null);
        }}
        onSubmit={handleSubmitReject}
        description="Reassign this count line to a staff member for recount and add optional instructions."
      />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: auroraTheme.spacing.md,
    paddingTop: 60,
    paddingBottom: auroraTheme.spacing.md,
    backgroundColor: "transparent",
    zIndex: 10,
  },
  backButton: {
    padding: auroraTheme.spacing.xs,
    backgroundColor: auroraTheme.colors.background.glass,
    borderRadius: auroraTheme.borderRadius.full,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
  },
  headerTitle: {
    fontSize: auroraTheme.typography.fontSize.xl,
    fontWeight: auroraTheme.typography.fontWeight.bold,
    color: auroraTheme.colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: auroraTheme.typography.fontSize.md,
    marginTop: auroraTheme.spacing.md,
    color: auroraTheme.colors.text.secondary,
  },
  offlineMissingText: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.tertiary,
    marginTop: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.md,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: auroraTheme.spacing.md,
  },
  listContent: {
    paddingBottom: 40,
  },
  sessionInfo: {
    marginBottom: auroraTheme.spacing.lg,
    padding: auroraTheme.spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: auroraTheme.spacing.sm,
  },
  infoLabel: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
  },
  infoValue: {
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: auroraTheme.typography.fontWeight.bold,
    color: auroraTheme.colors.text.primary,
  },
  statusValue: {
    color: auroraTheme.colors.warning[500],
  },
  varianceValue: {
    color: auroraTheme.colors.error[500],
  },
  actionButtons: {
    marginBottom: auroraTheme.spacing.lg,
  },
  offlineNotice: {
    marginBottom: auroraTheme.spacing.lg,
    padding: auroraTheme.spacing.md,
  },
  offlineNoticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: auroraTheme.spacing.sm,
  },
  offlineNoticeCopy: {
    flex: 1,
    gap: 4,
  },
  offlineNoticeTitle: {
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: auroraTheme.typography.fontWeight.bold,
    color: auroraTheme.colors.text.primary,
  },
  offlineNoticeBody: {
    fontSize: 12,
    lineHeight: 18,
    color: auroraTheme.colors.text.secondary,
  },
  reconcileButton: {
    backgroundColor: auroraTheme.colors.warning[500],
    borderRadius: 12,
    padding: auroraTheme.spacing.md,
    alignItems: "center",
  },
  closeButton: {
    backgroundColor: auroraTheme.colors.success[500],
    borderRadius: 12,
    padding: auroraTheme.spacing.md,
    alignItems: "center",
  },
  buttonText: {
    color: auroraTheme.colors.text.primary,
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: auroraTheme.typography.fontWeight.bold,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.background.glass,
    borderRadius: 16,
    padding: 4,
    marginBottom: auroraTheme.spacing.lg,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: auroraTheme.spacing.md,
    borderRadius: 8,
    gap: 8,
  },
  tabActive: {
    backgroundColor: auroraTheme.colors.primary[500],
  },
  tabText: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    fontWeight: auroraTheme.typography.fontWeight.semibold,
  },
  tabTextActive: {
    color: auroraTheme.colors.text.primary,
    fontWeight: "700",
  },
  emptyContainer: {
    padding: 64,
    alignItems: "center",
    justifyContent: "center",
    marginTop: auroraTheme.spacing.xl,
  },
  emptyText: {
    color: auroraTheme.colors.text.secondary,
    fontSize: auroraTheme.typography.fontSize.md,
    marginTop: auroraTheme.spacing.md,
  },
  lineCard: {
    marginBottom: auroraTheme.spacing.md,
    padding: auroraTheme.spacing.md,
  },
  lineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.sm,
  },
  lineName: {
    fontSize: auroraTheme.typography.fontSize.lg,
    fontWeight: auroraTheme.typography.fontWeight.bold,
    flex: 1,
    color: auroraTheme.colors.text.primary,
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  lineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: auroraTheme.colors.text.primary,
    fontSize: 10,
    fontWeight: auroraTheme.typography.fontWeight.bold,
  },
  lineCode: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    marginBottom: auroraTheme.spacing.md,
  },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: auroraTheme.spacing.md,
    backgroundColor: auroraTheme.colors.background.tertiary,
    padding: auroraTheme.spacing.sm,
    borderRadius: 8,
  },
  qtyItem: {
    flex: 1,
    alignItems: "center",
  },
  qtyLabel: {
    fontSize: 12,
    color: auroraTheme.colors.text.tertiary,
    marginBottom: 4,
  },
  qtyValue: {
    fontSize: auroraTheme.typography.fontSize.lg,
    fontWeight: auroraTheme.typography.fontWeight.bold,
    color: auroraTheme.colors.text.primary,
  },
  reasonBox: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: auroraTheme.colors.warning[500],
  },
  reasonLabel: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.warning[500],
    fontWeight: auroraTheme.typography.fontWeight.bold,
    marginBottom: 4,
  },
  reasonNote: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
  },
  remark: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    fontStyle: "italic",
    marginBottom: auroraTheme.spacing.sm,
  },
  verifiedInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.sm,
    padding: 8,
    backgroundColor: "rgba(0, 230, 118, 0.1)",
    borderRadius: 8,
    gap: 8,
  },
  verifiedInfoText: {
    fontSize: 12,
    color: auroraTheme.colors.success[500],
  },
  lineActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: auroraTheme.spacing.md,
    flexWrap: "wrap",
  },
  approveButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.success[500],
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 100,
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.error[500],
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 100,
  },
  verifyButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.primary[500],
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 120,
  },
  unverifyButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.warning[500],
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 120,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: auroraTheme.colors.text.primary,
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: auroraTheme.typography.fontWeight.bold,
  },
});
