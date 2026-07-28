import { useAuthStore } from "../../store/authStore";
import api from "../httpClient";
import { createLogger } from "../logging";

const log = createLogger("ApprovalApi");

export interface SupervisorDecidePayload {
  action: string;
  reason?: string;
  notes?: string;
  corrected_classification?: string;
  target_batch_id?: string;
  assign_to?: string;
  is_blind?: boolean;
}

export interface RecountCreatePayload {
  observation_id: string;
  request_reason: string;
  scope?: string;
  batch_or_serial_scope?: string;
  location_id?: string;
  required_evidence?: string[];
  priority?: string;
  is_blind?: boolean;
  assigned_to?: string;
}

export interface EvaluationResponse {
  observation_id: string;
  approved: boolean;
  sql_quantity_source?: string;
  sql_comparison_source?: string;
  block_reason?: string;
}

export async function evaluateObservation(observationId: string): Promise<EvaluationResponse> {
  try {
    const response = await api.post(`/api/approval/observations/${observationId}/evaluate`);
    return response.data;
  } catch (error) {
    log.error("evaluateObservation failed", error);
    throw error;
  }
}

export async function getSupervisorQueue(
  queueType: string,
  sessionId?: string,
  limit = 100,
): Promise<any> {
  try {
    const params: Record<string, any> = { limit };
    if (sessionId) {
      params.session_id = sessionId;
    }
    const response = await api.get(`/api/approval/supervisor/queues/${queueType}`, { params });
    return response.data;
  } catch (error) {
    log.error("getSupervisorQueue failed", error);
    throw error;
  }
}

export async function supervisorDecide(
  observationId: string,
  payload: SupervisorDecidePayload,
): Promise<any> {
  try {
    const response = await api.post(
      `/api/approval/supervisor/observations/${observationId}/decide`,
      payload,
    );
    return response.data;
  } catch (error) {
    log.error("supervisorDecide failed", error);
    throw error;
  }
}

export async function createRecountRequest(payload: RecountCreatePayload): Promise<any> {
  try {
    const response = await api.post("/api/approval/recount/requests", payload);
    return response.data;
  } catch (error) {
    log.error("createRecountRequest failed", error);
    throw error;
  }
}

export async function assignRecount(requestId: string, assignTo: string): Promise<any> {
  try {
    const response = await api.post(`/api/approval/recount/requests/${requestId}/assign`, {
      assign_to: assignTo,
    });
    return response.data;
  } catch (error) {
    log.error("assignRecount failed", error);
    throw error;
  }
}

export async function startRecount(requestId: string): Promise<any> {
  try {
    const response = await api.post(`/api/approval/recount/requests/${requestId}/start`);
    return response.data;
  } catch (error) {
    log.error("startRecount failed", error);
    throw error;
  }
}

export async function submitRecount(requestId: string, observationPayload: any): Promise<any> {
  try {
    const response = await api.post(
      `/api/approval/recount/requests/${requestId}/submit`,
      observationPayload,
    );
    return response.data;
  } catch (error) {
    log.error("submitRecount failed", error);
    throw error;
  }
}

export async function getSessionApprovalSummary(sessionId: string): Promise<any> {
  try {
    const response = await api.get(`/api/approval/sessions/${sessionId}/summary`);
    return response.data;
  } catch (error) {
    log.error("getSessionApprovalSummary failed", error);
    throw error;
  }
}

export async function createAdditionalLocationInvestigation(payload: {
  observation_id: string;
  response: string;
  suspected_location?: string;
  observed_or_estimated_qty?: number;
  staff_remark?: string;
  staff_confidence?: string;
  photo_urls?: string[];
}): Promise<any> {
  try {
    const sessionId = useAuthStore.getState().user?.sessionId;
    const response = await api.post(
      `/api/approval/sessions/${sessionId}/additional-location`,
      payload,
    );
    return response.data;
  } catch (error) {
    log.error("createAdditionalLocationInvestigation failed", error);
    throw error;
  }
}

export async function getSupervisorQueueSummary(): Promise<any> {
  try {
    const response = await api.get("/api/approval/reports/supervisor-queues");
    return response.data;
  } catch (error) {
    log.error("getSupervisorQueueSummary failed", error);
    throw error;
  }
}
