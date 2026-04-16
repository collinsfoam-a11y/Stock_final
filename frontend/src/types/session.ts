/**
 * Session Type Definitions
 */

export type SessionType = "STANDARD" | "BLIND" | "STRICT";

/**
 * Canonical session statuses — single source of truth.
 * Must align with backend SessionState enum in session_state_machine.py
 * and CanonicalSessionStatus in session_management_api.py.
 */
export type SessionStatus =
  | "OPEN"
  | "ACTIVE"
  | "PAUSED"
  | "RECONCILE"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "EXPORTED"
  | "ARCHIVED";

export interface Session {
  id: string;
  warehouse: string;
  staff_user: string; // references User.username
  staff_name: string;
  status: SessionStatus;
  type: SessionType;
  started_at: string; // ISO Date string
  closed_at?: string; // ISO Date string
  reconciled_at?: string; // ISO Date string
  completed_at?: string; // ISO Date string
  finalized_at?: string; // ISO Date string
  finalized_by?: string;
  finalization_status?: string;
  total_items: number;
  total_variance: number;
  verified_items?: number;
  pending_items?: number;
  damage_items?: number;
  counted_items?: number; // legacy alias for verified_items
  notes?: string;
  barcode?: string;
  // Location metadata
  location_type?: string;
  location_name?: string;
  rack_no?: string;
  last_heartbeat?: string;
  snapshot_hash?: string;
  config_version_id?: string;
}

export interface SessionCreate {
  warehouse: string;
  type?: SessionType;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
}

export interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  total_scans_today: number;
  active_users: number;
  items_per_hour: number;
}

/**
 * Session Metadata - Additional session information
 */
export interface SessionMetadata {
  location?: string;
  category?: string;
  expected_items?: number;
  completion_percentage?: number;
  last_activity?: string;
}

/**
 * Update Session Request
 */
export interface UpdateSessionRequest {
  status?: SessionStatus;
  notes?: string;
  metadata?: Partial<SessionMetadata>;
}

/**
 * Session Summary - Aggregated session statistics
 */
export interface SessionSummary {
  session_id: string;
  warehouse: string;
  status: SessionStatus;
  total_items: number;
  verified_items: number;
  unverified_items: number;
  total_variance: number;
  variance_percentage: number;
  started_at: string;
  duration_minutes?: number;
}
