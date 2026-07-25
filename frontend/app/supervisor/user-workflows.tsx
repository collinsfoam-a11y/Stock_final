import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  Chip,
  ModernCard,
  ProgressBar,
  ScreenContainer,
  StatsCard,
  StatusBadge,
} from "@/components/ui";
import { useUiTokens } from "@/hooks/useUiTokens";
import { touchTargets } from "@/theme/legacyCompat";
import {
  createOperationalStyleBridge,
  type OperationalStyleBridge,
} from "@/theme/operationalStyleBridge";
import {
  CanonicalSessionStatus,
  UserWorkflowSummary,
  WorkflowNextAction,
  WorkflowPresenceStatus,
  WorkflowPriorityBand,
  WorkflowStage,
  userWorkflowApi,
} from "@/services/api/userWorkflowApi";

const REFRESH_INTERVAL_MS = 15000;
type StageFilter = "ALL" | WorkflowStage;
type ActionFilter = "ALL" | WorkflowNextAction;

const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  IDLE: "Idle",
  COUNTING: "Counting",
  PAUSED: "Paused",
  RECONCILING: "Reconciling",
  AWAITING_REVIEW: "Awaiting Review",
  RECOUNT_QUEUE: "Recount Queue",
};

const PRESENCE_LABELS: Record<WorkflowPresenceStatus, string> = {
  ONLINE: "Online",
  IDLE: "Idle",
  OFFLINE: "Offline",
};

const NEXT_ACTION_LABELS: Record<WorkflowNextAction, string> = {
  REVIEW_PENDING: "Review pending counts",
  HANDLE_RECOUNT: "Handle recount queue",
  RESUME_PAUSED_SESSION: "Resume paused session",
  FOLLOW_UP_INACTIVE_SESSION: "Follow up inactive session",
  MONITOR_ACTIVE_COUNT: "Monitor active count",
  CLOSE_SESSION: "Close completed work",
  NONE: "No action",
};

const SESSION_STATUS_LABELS: Record<CanonicalSessionStatus, string> = {
  OPEN: "Open",
  ACTIVE: "Active",
  PAUSED: "Paused",
  RECONCILE: "Reconcile",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  UNKNOWN: "Unknown",
};

const STAGE_FILTER_OPTIONS: { value: StageFilter; label: string }[] = [
  { value: "ALL", label: "All stages" },
  { value: "COUNTING", label: "Counting" },
  { value: "AWAITING_REVIEW", label: "Awaiting Review" },
  { value: "RECOUNT_QUEUE", label: "Recount Queue" },
  { value: "PAUSED", label: "Paused" },
];

const ACTION_FILTER_OPTIONS: { value: ActionFilter; label: string }[] = [
  { value: "ALL", label: "All actions" },
  { value: "REVIEW_PENDING", label: "Review" },
  { value: "HANDLE_RECOUNT", label: "Recount" },
  { value: "FOLLOW_UP_INACTIVE_SESSION", label: "Follow Up" },
  { value: "RESUME_PAUSED_SESSION", label: "Resume" },
];

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "No recent activity";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";

  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const compactId = (value?: string | null) =>
  value ? `${value.slice(0, 8)}...` : "No live session";

const getPresenceVariant = (status: WorkflowPresenceStatus) => {
  switch (status) {
    case "ONLINE":
      return "success" as const;
    case "IDLE":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
};

const getWorkflowVariant = (stage: WorkflowStage) => {
  switch (stage) {
    case "COUNTING":
      return "primary" as const;
    case "RECONCILING":
      return "info" as const;
    case "PAUSED":
      return "warning" as const;
    case "AWAITING_REVIEW":
      return "warning" as const;
    case "RECOUNT_QUEUE":
      return "error" as const;
    default:
      return "neutral" as const;
  }
};

const getPriorityVariant = (band: WorkflowPriorityBand) => {
  switch (band) {
    case "CRITICAL":
      return "error" as const;
    case "HIGH":
      return "warning" as const;
    case "MEDIUM":
      return "info" as const;
    default:
      return "neutral" as const;
  }
};

const getSlaTimestamp = (workflow: UserWorkflowSummary) =>
  workflow.pending_review_since || workflow.recount_assigned_at || workflow.last_activity;

const getSlaLabel = (workflow: UserWorkflowSummary) => {
  if (workflow.pending_review_since) return "Review since";
  if (workflow.recount_assigned_at) return "Recount since";
  return "Last activity";
};

export default function UserWorkflowsScreen() {
  const uiTokens = useUiTokens();
  const operationalTheme = useMemo(() => createOperationalStyleBridge(uiTokens), [uiTokens]);
  const styles = useMemo(() => createStyles(operationalTheme), [operationalTheme]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [workflows, setWorkflows] = useState<UserWorkflowSummary[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      setError(null);
      const data = await userWorkflowApi.getRunningWorkflows();
      setWorkflows(data);
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load user workflows");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWorkflows();
  }, [loadWorkflows]);

  useFocusEffect(
    useCallback(() => {
      loadWorkflows();
      intervalRef.current = setInterval(loadWorkflows, REFRESH_INTERVAL_MS);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [loadWorkflows])
  );

  const filteredWorkflows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return workflows.filter((workflow) => {
      if (stageFilter !== "ALL" && workflow.workflow_stage !== stageFilter) {
        return false;
      }

      if (actionFilter !== "ALL" && workflow.next_action !== actionFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        workflow.username,
        workflow.full_name,
        workflow.role,
        WORKFLOW_STAGE_LABELS[workflow.workflow_stage],
        NEXT_ACTION_LABELS[workflow.next_action],
        workflow.warehouse,
        workflow.rack_id,
        workflow.floor,
        workflow.priority_band,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [actionFilter, query, stageFilter, workflows]);

  const summary = useMemo(() => {
    const active = workflows.filter((workflow) => Boolean(workflow.active_session_id)).length;
    const online = workflows.filter((workflow) => workflow.presence_status === "ONLINE").length;
    const reviewQueue = workflows.reduce(
      (total, workflow) => total + workflow.pending_approvals,
      0
    );
    const recountQueue = workflows.reduce(
      (total, workflow) => total + workflow.assigned_recounts,
      0
    );
    const highPriority = workflows.filter((workflow) =>
      ["HIGH", "CRITICAL"].includes(workflow.priority_band)
    ).length;

    return {
      operators: workflows.length,
      active,
      online,
      reviewQueue,
      recountQueue,
      highPriority,
    };
  }, [workflows]);

  return (
    <ScreenContainer
      gradient
      scrollable
      loading={loading}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      header={{
        title: "User Workflows",
        subtitle: lastUpdatedAt
          ? `Updated ${formatRelativeTime(lastUpdatedAt.toISOString())}`
          : "Loading live workflow data",
        showBackButton: true,
        rightAction: {
          icon: "refresh-outline",
          onPress: handleRefresh,
        },
      }}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={[styles.statsGrid, isWide && styles.statsGridWide]}>
        <StatsCard
          title="Tracked Operators"
          value={summary.operators}
          icon="people"
          variant="primary"
          style={styles.statCard}
        />
        <StatsCard
          title="Active Sessions"
          value={summary.active}
          icon="radio"
          variant="success"
          style={styles.statCard}
        />
        <StatsCard
          title="Pending Review"
          value={summary.reviewQueue}
          icon="time"
          variant="warning"
          style={styles.statCard}
        />
        <StatsCard
          title="Open Recounts"
          value={summary.recountQueue}
          icon="refresh-circle"
          variant="error"
          style={styles.statCard}
        />
        <StatsCard
          title="High Priority"
          value={summary.highPriority}
          icon="alert-circle"
          variant="info"
          style={styles.statCard}
        />
      </View>

      <ModernCard variant="outlined" elevation="none" style={styles.searchCard}>
        <View style={styles.searchHeader}>
          <View>
            <Text style={styles.sectionTitle}>Running Workflow</Text>
            <Text style={styles.sectionSubtitle}>
              Track who is counting, who is waiting for review, and who has recount work open.
            </Text>
          </View>
          <StatusBadge
            label={`${summary.online} online`}
            variant={summary.online > 0 ? "success" : "neutral"}
            icon="pulse"
            pulse={summary.online > 0}
          />
        </View>

        <View style={styles.searchInputShell}>
          <Ionicons name="search-outline" size={18} color={operationalTheme.colors.text.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by user, warehouse, stage, or rack"
            placeholderTextColor={operationalTheme.colors.text.tertiary}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Stage</Text>
          <View style={styles.filterRow}>
            {STAGE_FILTER_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                variant="outlined"
                selected={stageFilter === option.value}
                onPress={() => setStageFilter(option.value)}
                size="sm"
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Next action</Text>
          <View style={styles.filterRow}>
            {ACTION_FILTER_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                variant="outlined"
                selected={actionFilter === option.value}
                onPress={() => setActionFilter(option.value)}
                size="sm"
              />
            ))}
          </View>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : filteredWorkflows.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="hourglass-outline" size={28} color={operationalTheme.colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No matching workflows</Text>
            <Text style={styles.emptyText}>Try a different search term or pull to refresh.</Text>
          </View>
        ) : (
          filteredWorkflows.map((workflow) => (
            <ModernCard
              key={`${workflow.username}:${workflow.active_session_id ?? "queue"}`}
              variant="outlined"
              elevation="none"
              style={styles.workflowCard}
            >
              <View style={styles.cardHeader}>
                <View style={styles.userBlock}>
                  <Text style={styles.userName}>{workflow.full_name || workflow.username}</Text>
                  <Text style={styles.userMeta}>
                    @{workflow.username} • {workflow.role}
                  </Text>
                </View>

                <View style={styles.badgeRow}>
                  <StatusBadge
                    label={PRESENCE_LABELS[workflow.presence_status]}
                    variant={getPresenceVariant(workflow.presence_status)}
                    icon="ellipse"
                    pulse={workflow.presence_status === "ONLINE"}
                  />
                  <StatusBadge
                    label={WORKFLOW_STAGE_LABELS[workflow.workflow_stage]}
                    variant={getWorkflowVariant(workflow.workflow_stage)}
                  />
                  <StatusBadge
                    label={`${workflow.priority_band} ${workflow.priority_score}`}
                    variant={getPriorityVariant(workflow.priority_band)}
                  />
                </View>
              </View>

              <View style={styles.detailGrid}>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Warehouse</Text>
                  <Text style={styles.detailValue}>{workflow.warehouse || "Not assigned"}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Rack / Floor</Text>
                  <Text style={styles.detailValue}>
                    {workflow.rack_id || "-"} / {workflow.floor || "-"}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Session</Text>
                  <Text style={styles.detailValue}>
                    {workflow.session_status
                      ? SESSION_STATUS_LABELS[workflow.session_status]
                      : "Queue only"}{" "}
                    • {compactId(workflow.active_session_id)}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Last activity</Text>
                  <Text style={styles.detailValue}>
                    {formatRelativeTime(workflow.last_activity)}
                  </Text>
                </View>
              </View>

              <View style={styles.actionStrip}>
                <View style={styles.actionCell}>
                  <Text style={styles.actionLabel}>Next action</Text>
                  <Text style={styles.actionValue}>{NEXT_ACTION_LABELS[workflow.next_action]}</Text>
                </View>
                <View style={styles.actionCell}>
                  <Text style={styles.actionLabel}>{getSlaLabel(workflow)}</Text>
                  <Text style={styles.actionValue}>
                    {formatRelativeTime(getSlaTimestamp(workflow))}
                  </Text>
                </View>
              </View>

              <View style={styles.progressBlock}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Count progress</Text>
                  <Text style={styles.progressValue}>
                    {workflow.items_counted}
                    {workflow.total_items > 0 ? ` / ${workflow.total_items}` : ""}
                  </Text>
                </View>
                <ProgressBar
                  progress={workflow.progress_percent}
                  variant={workflow.progress_percent >= 80 ? "success" : "default"}
                  size="sm"
                />
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Reviewed</Text>
                  <Text style={styles.metricValue}>{workflow.reviewed_items}</Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Pending</Text>
                  <Text style={styles.metricValue}>{workflow.pending_approvals}</Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Recounts</Text>
                  <Text style={styles.metricValue}>{workflow.assigned_recounts}</Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Variance</Text>
                  <Text style={styles.metricValue}>{workflow.total_variance.toFixed(0)}</Text>
                </View>
              </View>
            </ModernCard>
          ))
        )}
      </ModernCard>

      <View style={styles.footerSpace} />
    </ScreenContainer>
  );
}

const createStyles = (operationalTheme: OperationalStyleBridge) => StyleSheet.create({
  contentContainer: {
    paddingHorizontal: operationalTheme.spacing.lg,
    paddingTop: operationalTheme.spacing.lg,
    paddingBottom: operationalTheme.spacing["3xl"],
    gap: operationalTheme.spacing.lg,
  },
  statsGrid: {
    gap: operationalTheme.spacing.md,
  },
  statsGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCard: {
    flex: 1,
    minWidth: 180,
  },
  searchCard: {
    gap: operationalTheme.spacing.lg,
  },
  searchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: operationalTheme.spacing.md,
  },
  sectionTitle: {
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize["2xl"],
    color: operationalTheme.colors.text.primary,
  },
  sectionSubtitle: {
    marginTop: 6,
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.secondary,
    maxWidth: 620,
    lineHeight: 20,
  },
  searchInputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: operationalTheme.spacing.sm,
    borderWidth: 1,
    borderColor: operationalTheme.colors.border.medium,
    borderRadius: operationalTheme.borderRadius.lg,
    backgroundColor: operationalTheme.colors.background.glass,
    paddingHorizontal: operationalTheme.spacing.md,
    paddingVertical: operationalTheme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    // Apple HIG minimum tap target
    minHeight: touchTargets.minimum,
    color: operationalTheme.colors.text.primary,
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.base,
  },
  filterGroup: {
    gap: operationalTheme.spacing.sm,
  },
  filterLabel: {
    fontFamily: operationalTheme.typography.fontFamily.label,
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: operationalTheme.spacing.sm,
  },
  workflowCard: {
    marginTop: operationalTheme.spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: operationalTheme.spacing.md,
  },
  userBlock: {
    flex: 1,
  },
  userName: {
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize.xl,
    color: operationalTheme.colors.text.primary,
  },
  userMeta: {
    marginTop: 4,
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.secondary,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: operationalTheme.spacing.sm,
  },
  detailGrid: {
    marginTop: operationalTheme.spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: operationalTheme.spacing.md,
  },
  detailCell: {
    minWidth: 150,
    flex: 1,
  },
  detailLabel: {
    fontFamily: operationalTheme.typography.fontFamily.label,
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    marginTop: 6,
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.primary,
  },
  actionStrip: {
    marginTop: operationalTheme.spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: operationalTheme.spacing.md,
    borderRadius: operationalTheme.borderRadius.lg,
    borderWidth: 1,
    borderColor: operationalTheme.colors.border.light,
    backgroundColor: operationalTheme.colors.background.blur,
    paddingHorizontal: operationalTheme.spacing.md,
    paddingVertical: operationalTheme.spacing.sm,
  },
  actionCell: {
    flex: 1,
    minWidth: 180,
  },
  actionLabel: {
    fontFamily: operationalTheme.typography.fontFamily.label,
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.tertiary,
    textTransform: "uppercase",
  },
  actionValue: {
    marginTop: 6,
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.primary,
  },
  progressBlock: {
    marginTop: operationalTheme.spacing.lg,
    gap: operationalTheme.spacing.sm,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    fontFamily: operationalTheme.typography.fontFamily.label,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.secondary,
  },
  progressValue: {
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.primary,
  },
  metricRow: {
    marginTop: operationalTheme.spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: operationalTheme.spacing.sm,
  },
  metricPill: {
    minWidth: 110,
    flex: 1,
    borderRadius: operationalTheme.borderRadius.md,
    paddingHorizontal: operationalTheme.spacing.md,
    paddingVertical: operationalTheme.spacing.sm,
    backgroundColor: operationalTheme.colors.background.blur,
    borderWidth: 1,
    borderColor: operationalTheme.colors.border.light,
  },
  metricLabel: {
    fontFamily: operationalTheme.typography.fontFamily.label,
    fontSize: operationalTheme.typography.fontSize.xs,
    color: operationalTheme.colors.text.tertiary,
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 6,
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize.lg,
    color: operationalTheme.colors.text.primary,
  },
  errorText: {
    marginTop: operationalTheme.spacing.md,
    color: operationalTheme.colors.error[400],
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
  },
  emptyState: {
    marginTop: operationalTheme.spacing.lg,
    paddingVertical: operationalTheme.spacing["2xl"],
    alignItems: "center",
    gap: operationalTheme.spacing.sm,
  },
  emptyTitle: {
    fontFamily: operationalTheme.typography.fontFamily.heading,
    fontSize: operationalTheme.typography.fontSize.lg,
    color: operationalTheme.colors.text.primary,
  },
  emptyText: {
    fontFamily: operationalTheme.typography.fontFamily.body,
    fontSize: operationalTheme.typography.fontSize.sm,
    color: operationalTheme.colors.text.secondary,
    textAlign: "center",
  },
  footerSpace: {
    height: operationalTheme.spacing.xl,
  },
});
