import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { Screen } from "@/components/layout/Screen";
import ModernCard from "@/components/ui/ModernCard";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import RecountAssignmentModal, {
  type AssignableStaffUser,
} from "@/components/supervisor/RecountAssignmentModal";
import { useToast } from "@/components/feedback/ToastProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, spacing, typography, borderRadius, shadows } from "@/theme/legacyCompat";
import { safeBackNavigation } from "@/utils/navigation";
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
} from "@/services/api/api";

type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";

const badgeToneStyles = {
  neutral: {
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
    textColor: colors.gray[700],
  },
  success: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
    textColor: colors.success[600],
  },
  warning: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
    textColor: colors.warning[600],
  },
  error: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
    textColor: colors.error[600],
  },
  info: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[200],
    textColor: colors.primary[700],
  },
} as const;

const getSessionStatusTone = (status: string): BadgeTone => {
  switch (status.trim().toUpperCase()) {
    case "OPEN":
    case "ACTIVE":
      return "info";
    case "RECONCILE":
    case "REVIEW":
    case "PENDING":
      return "warning";
    case "COMPLETED":
    case "FINALIZED":
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "FAILED":
      return "error";
    default:
      return "neutral";
  }
};

const getLineStatusTone = (status: string): BadgeTone => {
  switch (status.trim().toUpperCase()) {
    case "APPROVED":
    case "VERIFIED":
      return "success";
    case "REJECTED":
      return "error";
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
};

export default function SessionDetail() {
  const { id, sessionId } = useLocalSearchParams();
  const targetSessionId = (id || sessionId) as string;

  const router = useRouter();
  const { show } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [session, setSession] = React.useState<any>(null);
  const [toVerifyLines, setToVerifyLines] = React.useState<any[]>([]);
  const [verifiedLines, setVerifiedLines] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sessionMissing, setSessionMissing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"toVerify" | "verified">("toVerify");
  const [verifying, setVerifying] = React.useState<string | null>(null);
  const [assignableStaff, setAssignableStaff] = React.useState<AssignableStaffUser[]>([]);
  const [staffLoading, setStaffLoading] = React.useState(false);
  const [recountModalVisible, setRecountModalVisible] = React.useState(false);
  const [pendingRejectLine, setPendingRejectLine] = React.useState<any | null>(null);

  const getFadeInDown = React.useCallback(
    (delay = 0) => (prefersReducedMotion ? undefined : FadeInDown.delay(delay).springify()),
    [prefersReducedMotion]
  );

  const renderBadge = React.useCallback(
    (label: string, tone: BadgeTone, icon?: keyof typeof Ionicons.glyphMap) => {
      const toneStyle = badgeToneStyles[tone];

      return (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: toneStyle.backgroundColor,
              borderColor: toneStyle.borderColor,
            },
          ]}
        >
          {icon ? <Ionicons name={icon} size={12} color={toneStyle.textColor} /> : null}
          <Text style={[styles.badgeText, { color: toneStyle.textColor }]}>{label}</Text>
        </View>
      );
    },
    []
  );

  const loadData = React.useCallback(async () => {
    if (!targetSessionId) return;

    try {
      setLoading(true);
      const [sessionData, toVerifyData, verifiedData] = await Promise.all([
        getSession(targetSessionId),
        getCountLines(targetSessionId, 1, 100, false),
        getCountLines(targetSessionId, 1, 100, true),
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
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  }, [show, targetSessionId]);

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

  const handleApproveLine = async (lineId: string) => {
    if (offlineMode) {
      show("Approvals require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await approveCountLine(lineId);
      await loadData();
      show("Count line approved", "success");
    } catch {
      show("Failed to approve", "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleRejectLine = async (line: any) => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await loadAssignableStaff();
      setPendingRejectLine(line);
      setRecountModalVisible(true);
    } catch {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleSubmitReject = async ({ notes, assignTo }: { notes: string; assignTo?: string }) => {
    if (offlineMode) {
      show("Recount requests require a live connection", "warning");
      return;
    }

    if (!pendingRejectLine?.id) {
      show("Count line not found", "error");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setVerifying(pendingRejectLine.id);
      await rejectCountLine(pendingRejectLine.id, {
        notes: notes || undefined,
        assign_to: assignTo,
      });
      setRecountModalVisible(false);
      setPendingRejectLine(null);
      await loadData();
      show(assignTo ? `Recount assigned to ${assignTo}` : "Count line rejected", "success");
    } catch {
      show("Failed to reject", "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      setVerifying(lineId);
      await verifyStock(lineId);
      await loadData();
      show("Stock verified", "success");
    } catch {
      show("Failed to verify stock", "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setVerifying(lineId);
      await unverifyStock(lineId);
      await loadData();
      show("Verification removed", "success");
    } catch {
      show("Failed to remove verification", "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
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
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await updateSessionStatus(targetSessionId, newStatus);
      await loadData();
      show(`Session status updated to ${newStatus}`, "success");
    } catch {
      show("Failed to update status", "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleFinalizeSession = async () => {
    if (offlineMode) {
      show("Session finalization requires a live connection", "warning");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await finalizeSession(targetSessionId);
      await loadData();
      show("Session finalized", "success");
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to finalize session";
      show(String(detail), "error");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const switchTab = (tab: "toVerify" | "verified") => {
    if (activeTab === tab) return;
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setActiveTab(tab);
  };

  if (!loading && sessionMissing) {
    return (
      <Screen padding={0} backgroundColor={colors.gray[50]}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.replace("/supervisor/sessions")}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to sessions"
          >
            <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Session Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={56} color={colors.warning[500]} />
          <Text style={styles.loadingText}>This session is no longer available.</Text>
          {offlineMode ? (
            <Text style={styles.offlineMissingText}>
              It is not available in the local session cache.
            </Text>
          ) : null}
          <AnimatedPressable
            onPress={() => router.replace("/supervisor/sessions")}
            style={[styles.primaryActionButton, styles.successActionButton]}
            accessibilityRole="button"
            accessibilityLabel="Back to sessions"
          >
            <Text style={styles.buttonText}>Back to Sessions</Text>
          </AnimatedPressable>
        </View>
      </Screen>
    );
  }

  if (loading || !session) {
    return (
      <Screen padding={0} backgroundColor={colors.gray[50]}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => safeBackNavigation(router, { fallbackHref: "/supervisor/sessions" })}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Session Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </Screen>
    );
  }

  const currentLines = activeTab === "toVerify" ? toVerifyLines : verifiedLines;
  const totalVariance = Number(session?.total_variance ?? 0);
  const sessionFinalized =
    session?.status === "COMPLETED" || session?.finalization_status === "FINALIZED";

  const ListHeader = () => (
    <View>
      <Animated.View entering={getFadeInDown(100)}>
        <ModernCard variant="elevated" style={styles.sessionInfoCard}>
          <View style={styles.sessionInfoHeader}>
            <View style={styles.sessionIdentity}>
              <Text style={styles.sectionLabel}>Warehouse</Text>
              <Text style={styles.sessionTitle} numberOfLines={2}>
                {session.warehouse || "Unknown warehouse"}
              </Text>
              <Text style={styles.sessionSubtitle}>
                Counted by {session.staff_name || "Unassigned staff"}
              </Text>
            </View>
            {renderBadge(
              String(session.status || "Unknown"),
              getSessionStatusTone(String(session.status || ""))
            )}
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Items</Text>
              <Text style={styles.metricValue}>{session.total_items ?? 0}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Total Variance</Text>
              <Text style={[styles.metricValue, totalVariance !== 0 && styles.metricValueDanger]}>
                {totalVariance.toFixed(2)}
              </Text>
            </View>
          </View>
        </ModernCard>
      </Animated.View>

      {session.status === "OPEN" && !offlineMode ? (
        <Animated.View entering={getFadeInDown(200)} style={styles.actionButtons}>
          <AnimatedPressable
            style={[styles.primaryActionButton, styles.warningActionButton]}
            onPress={() => handleUpdateStatus("RECONCILE")}
            accessibilityRole="button"
            accessibilityLabel="Move session to reconcile"
          >
            <Text style={styles.buttonText}>Move to Reconcile</Text>
          </AnimatedPressable>
        </Animated.View>
      ) : null}

      {session.status === "RECONCILE" && !offlineMode ? (
        <Animated.View entering={getFadeInDown(200)} style={styles.actionButtons}>
          <AnimatedPressable
            style={[styles.primaryActionButton, styles.successActionButton]}
            onPress={() => void handleFinalizeSession()}
            accessibilityRole="button"
            accessibilityLabel="Finalize session"
          >
            <Text style={styles.buttonText}>Finalize Session</Text>
          </AnimatedPressable>
        </Animated.View>
      ) : null}

      {sessionFinalized ? (
        <Animated.View entering={getFadeInDown(220)}>
          <View style={[styles.noticeCard, styles.noticeSuccess]}>
            <View style={styles.noticeRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.success[600]} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>Session finalized</Text>
                <Text style={styles.noticeBody}>
                  Finalized sessions are locked for audit integrity. Count lines can be reviewed,
                  but approvals and edits are disabled.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {offlineMode ? (
        <Animated.View entering={getFadeInDown(220)}>
          <View style={[styles.noticeCard, styles.noticeWarning]}>
            <View style={styles.noticeRow}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.warning[600]} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>Viewing cached session data</Text>
                <Text style={styles.noticeBody}>
                  Count lines and session details can be reviewed offline, but approvals, recounts,
                  verification changes, and status updates require a live connection.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View
        entering={getFadeInDown(300)}
        style={styles.tabContainer}
        accessibilityRole="tablist"
        accessibilityLabel="Session detail sections"
      >
        <AnimatedPressable
          style={[styles.tab, activeTab === "toVerify" && styles.tabActive]}
          onPress={() => switchTab("toVerify")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "toVerify" }}
          accessibilityLabel={`To verify tab, ${toVerifyLines.length} items`}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color={activeTab === "toVerify" ? colors.white : colors.gray[600]}
          />
          <Text style={[styles.tabText, activeTab === "toVerify" && styles.tabTextActive]}>
            To Verify ({toVerifyLines.length})
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.tab, activeTab === "verified" && styles.tabActive]}
          onPress={() => switchTab("verified")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "verified" }}
          accessibilityLabel={`Verified tab, ${verifiedLines.length} items`}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={18}
            color={activeTab === "verified" ? colors.white : colors.gray[600]}
          />
          <Text style={[styles.tabText, activeTab === "verified" && styles.tabTextActive]}>
            Verified ({verifiedLines.length})
          </Text>
        </AnimatedPressable>
      </Animated.View>
    </View>
  );

  const renderItem = ({ item }: { item: any }) => {
    const normalizedStatus = String(item.status || "").toLowerCase();
    const requiresSupervisorReview = Number(item.variance ?? 0) !== 0;
    const varianceColor = item.variance === 0 ? colors.success[600] : colors.error[600];
    const verifiedAtLabel = item.verified_at
      ? new Date(item.verified_at).toLocaleString()
      : "Unknown time";

    return (
      <ModernCard variant="elevated" style={styles.lineCard}>
        <View style={styles.lineHeader}>
          <Text style={styles.lineName} numberOfLines={2}>
            {item.item_name}
          </Text>
          <View style={styles.badgeContainer}>
            {item.verified ? renderBadge("Verified", "success", "checkmark-circle") : null}
            {renderBadge(
              (normalizedStatus || "pending").toUpperCase(),
              getLineStatusTone(normalizedStatus)
            )}
          </View>
        </View>

        <Text style={styles.lineCode}>Code: {item.item_code}</Text>
        {item.barcode ? <Text style={styles.lineCode}>Barcode: {item.barcode}</Text> : null}

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
            <Text style={[styles.qtyValue, { color: varianceColor }]}>{item.variance}</Text>
          </View>
        </View>

        {item.variance_reason ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Reason: {item.variance_reason}</Text>
            {item.variance_note ? (
              <Text style={styles.reasonNote}>{item.variance_note}</Text>
            ) : null}
          </View>
        ) : null}

        {item.remark ? <Text style={styles.remark}>Remark: {item.remark}</Text> : null}

        {item.verified && item.verified_by ? (
          <View style={styles.verifiedInfo}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success[600]} />
            <Text style={styles.verifiedInfoText}>
              Verified by {item.verified_by} on {verifiedAtLabel}
            </Text>
          </View>
        ) : null}

        {!offlineMode && !sessionFinalized ? (
          <View style={styles.lineActions}>
            {requiresSupervisorReview && normalizedStatus === "pending" ? (
              <>
                <AnimatedPressable
                  style={[styles.inlineActionButton, styles.successActionButton]}
                  onPress={() => handleApproveLine(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${item.item_name}`}
                >
                  <Ionicons name="checkmark" size={20} color={colors.white} />
                  <Text style={styles.actionButtonText}>Approve</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={[styles.inlineActionButton, styles.dangerActionButton]}
                  onPress={() => void handleRejectLine(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${item.item_name}`}
                >
                  <Ionicons name="close" size={20} color={colors.white} />
                  <Text style={styles.actionButtonText}>Reject</Text>
                </AnimatedPressable>
              </>
            ) : null}

            {requiresSupervisorReview && activeTab === "toVerify" && !item.verified ? (
              <AnimatedPressable
                style={[
                  styles.inlineActionButton,
                  styles.primaryActionFill,
                  verifying === item.id && styles.buttonDisabled,
                ]}
                onPress={() => handleVerifyStock(item.id)}
                disabled={verifying === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Verify stock for ${item.item_name}`}
              >
                {verifying === item.id ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
                    <Text style={styles.actionButtonText}>Verify Stock</Text>
                  </>
                )}
              </AnimatedPressable>
            ) : null}

            {activeTab === "verified" && item.verified ? (
              <AnimatedPressable
                style={[
                  styles.inlineActionButton,
                  styles.warningActionButton,
                  verifying === item.id && styles.buttonDisabled,
                ]}
                onPress={() => handleUnverifyStock(item.id)}
                disabled={verifying === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Remove verification for ${item.item_name}`}
              >
                {verifying === item.id ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={20} color={colors.white} />
                    <Text style={styles.actionButtonText}>Unverify</Text>
                  </>
                )}
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}
      </ModernCard>
    );
  };

  const renderEmpty = () => (
    <ModernCard
      variant="elevated"
      style={styles.emptyContainer}
      contentStyle={styles.emptyCardContent}
    >
      <Ionicons
        name={activeTab === "toVerify" ? "list-outline" : "checkmark-circle"}
        size={64}
        color={colors.gray[300]}
      />
      <Text style={styles.emptyText}>
        {activeTab === "toVerify" ? "No items to verify" : "No verified items"}
      </Text>
    </ModernCard>
  );

  return (
    <Screen padding={0} backgroundColor={colors.gray[50]}>
      <StatusBar style="dark" />

      <Animated.View entering={getFadeInDown(50)} style={styles.header}>
        <AnimatedPressable
          onPress={() => safeBackNavigation(router, { fallbackHref: "/supervisor/sessions" })}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Session Details</Text>
        <View style={styles.headerSpacer} />
      </Animated.View>

      <View style={styles.listContainer}>
        <FlashList
          data={currentLines}
          renderItem={renderItem}
          // @ts-ignore
          estimatedItemSize={260}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
        />
      </View>

      <RecountAssignmentModal
        visible={recountModalVisible}
        loading={
          staffLoading || (pendingRejectLine?.id ? verifying === pendingRejectLine.id : false)
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.gray[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    marginTop: spacing.md,
    color: colors.gray[700],
    textAlign: "center",
  },
  offlineMissingText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing["2xl"],
  },
  sessionInfoCard: {
    marginBottom: spacing.lg,
  },
  sessionInfoHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sessionIdentity: {
    flex: 1,
    gap: 4,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sessionTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  sessionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: spacing.md,
  },
  metricLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginBottom: 4,
  },
  metricValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  metricValueDanger: {
    color: colors.error[600],
  },
  actionButtons: {
    marginBottom: spacing.lg,
  },
  primaryActionButton: {
    minHeight: 48,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  primaryActionFill: {
    backgroundColor: colors.primary[600],
  },
  successActionButton: {
    backgroundColor: colors.success[600],
  },
  warningActionButton: {
    backgroundColor: colors.warning[600],
  },
  dangerActionButton: {
    backgroundColor: colors.error[600],
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  noticeCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  noticeSuccess: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  noticeWarning: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  noticeBody: {
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
    color: colors.gray[700],
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  tab: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  tabActive: {
    backgroundColor: colors.primary[600],
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[600],
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  emptyContainer: {
    marginTop: spacing.xl,
  },
  emptyCardContent: {
    paddingVertical: spacing["2xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
  },
  lineCard: {
    marginBottom: spacing.md,
  },
  lineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lineName: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  lineCode: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    marginBottom: spacing.md,
  },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  qtyItem: {
    flex: 1,
    alignItems: "center",
  },
  qtyLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    marginBottom: 4,
  },
  qtyValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  reasonBox: {
    backgroundColor: colors.warning[50],
    borderRadius: borderRadius.md,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning[600],
  },
  reasonLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.warning[600],
    marginBottom: 4,
  },
  reasonNote: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
  },
  remark: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
    fontStyle: "italic",
    marginBottom: spacing.sm,
  },
  verifiedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.sm,
    padding: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success[50],
  },
  verifiedInfoText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.success[600],
  },
  lineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: spacing.md,
  },
  inlineActionButton: {
    flex: 1,
    minWidth: 120,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
