import api from "../httpClient";

export type WorkflowStage =
  | "IDLE"
  | "COUNTING"
  | "PAUSED"
  | "RECONCILING"
  | "AWAITING_REVIEW"
  | "RECOUNT_QUEUE";

export type WorkflowPresenceStatus = "ONLINE" | "IDLE" | "OFFLINE";

export type WorkflowNextAction =
  | "REVIEW_PENDING"
  | "HANDLE_RECOUNT"
  | "RESUME_PAUSED_SESSION"
  | "FOLLOW_UP_INACTIVE_SESSION"
  | "MONITOR_ACTIVE_COUNT"
  | "CLOSE_SESSION"
  | "NONE";

export type WorkflowPriorityBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CanonicalSessionStatus =
  | "OPEN"
  | "ACTIVE"
  | "PAUSED"
  | "RECONCILE"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "UNKNOWN";

export interface UserWorkflowSummary {
  username: string;
  full_name?: string | null;
  role: string;
  workflow_stage: WorkflowStage;
  presence_status: WorkflowPresenceStatus;
  active_session_id?: string | null;
  session_status?: CanonicalSessionStatus | null;
  session_type?: string | null;
  warehouse?: string | null;
  rack_id?: string | null;
  floor?: string | null;
  session_started_at?: string | null;
  last_activity?: string | null;
  pending_review_since?: string | null;
  recount_assigned_at?: string | null;
  open_session_count: number;
  items_counted: number;
  reviewed_items: number;
  total_items: number;
  progress_percent: number;
  pending_approvals: number;
  assigned_recounts: number;
  total_variance: number;
  priority_score: number;
  priority_band: WorkflowPriorityBand;
  next_action: WorkflowNextAction;
}

export const userWorkflowApi = {
  getRunningWorkflows: async (): Promise<UserWorkflowSummary[]> => {
    const response = await api.get<UserWorkflowSummary[]>(
      "/api/sessions/user-workflows",
    );
    return response.data;
  },
};

export default userWorkflowApi;
