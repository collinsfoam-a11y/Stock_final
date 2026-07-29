import api from "../../httpClient";

// ==========================================
// EXPORT SCHEDULES API
// ==========================================

export type ExportScheduleType = "sessions" | "count_lines" | "variance_report" | "activity_logs";

export type ExportScheduleFrequency = "daily" | "weekly" | "monthly";
export type ExportScheduleFormat = "csv" | "json" | "excel";

export interface ExportScheduleRecord {
  id: string;
  name: string;
  export_type: ExportScheduleType;
  frequency: ExportScheduleFrequency;
  format: ExportScheduleFormat;
  filters: Record<string, unknown>;
  email_recipients: string[];
  enabled: boolean;
  last_run?: string | null;
  next_run?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  run_count?: number;
  error_count?: number;
}

export interface ExportResultRecord {
  id: string;
  schedule_id?: string;
  schedule_name: string;
  export_type?: ExportScheduleType;
  format: ExportScheduleFormat;
  file_extension?: string;
  has_content: boolean;
  row_count?: number;
  size_bytes?: number;
  created_at: string;
}

export interface CreateExportSchedulePayload {
  name: string;
  export_type: ExportScheduleType;
  frequency: ExportScheduleFrequency;
  format: ExportScheduleFormat;
  filters?: Record<string, unknown>;
  email_recipients?: string[];
}

export interface UpdateExportSchedulePayload {
  name?: string;
  frequency?: ExportScheduleFrequency;
  format?: ExportScheduleFormat;
  filters?: Record<string, unknown>;
  email_recipients?: string[];
  enabled?: boolean;
}

const normalizeExportSchedule = (raw: Record<string, unknown>): ExportScheduleRecord => ({
  id: String(raw.id ?? raw._id ?? ""),
  name: String(raw.name ?? ""),
  export_type: String(raw.export_type ?? "sessions") as ExportScheduleType,
  frequency: String(raw.frequency ?? "daily") as ExportScheduleFrequency,
  format: String(raw.format ?? "csv") as ExportScheduleFormat,
  filters:
    raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters)
      ? (raw.filters as Record<string, unknown>)
      : {},
  email_recipients: Array.isArray(raw.email_recipients)
    ? raw.email_recipients.filter((recipient): recipient is string => typeof recipient === "string")
    : [],
  enabled: Boolean(raw.enabled),
  last_run: typeof raw.last_run === "string" ? raw.last_run : null,
  next_run: typeof raw.next_run === "string" ? raw.next_run : null,
  created_by: typeof raw.created_by === "string" ? raw.created_by : undefined,
  created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
  updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  run_count: typeof raw.run_count === "number" ? raw.run_count : undefined,
  error_count: typeof raw.error_count === "number" ? raw.error_count : undefined,
});

const normalizeExportResult = (raw: Record<string, unknown>): ExportResultRecord => ({
  id: String(raw.id ?? raw._id ?? ""),
  schedule_id: typeof raw.schedule_id === "string" ? raw.schedule_id : undefined,
  schedule_name: String(raw.schedule_name ?? "Export"),
  export_type:
    typeof raw.export_type === "string" ? (raw.export_type as ExportScheduleType) : undefined,
  format: String(raw.format ?? "csv") as ExportScheduleFormat,
  file_extension: typeof raw.file_extension === "string" ? raw.file_extension : undefined,
  has_content: Boolean(raw.has_content),
  row_count: typeof raw.row_count === "number" ? raw.row_count : undefined,
  size_bytes: typeof raw.size_bytes === "number" ? raw.size_bytes : undefined,
  created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
});

export const getExportSchedules = async (enabled?: boolean): Promise<ExportScheduleRecord[]> => {
  try {
    const params = new URLSearchParams();
    if (enabled !== undefined) {
      params.append("enabled_only", enabled.toString());
    }

    const response = await api.get(`/api/exports/schedules?${params.toString()}`);
    const schedules = response.data?.data?.schedules ?? response.data?.schedules ?? [];
    return Array.isArray(schedules)
      ? schedules.map((schedule: Record<string, unknown>) => normalizeExportSchedule(schedule))
      : [];
  } catch (error: unknown) {
    __DEV__ && console.error("Get export schedules error:", error);
    throw error;
  }
};

export const getExportSchedule = async (scheduleId: string): Promise<ExportScheduleRecord> => {
  try {
    const response = await api.get(`/api/exports/schedules/${scheduleId}`);
    return normalizeExportSchedule(response.data?.data ?? response.data);
  } catch (error: unknown) {
    __DEV__ && console.error("Get export schedule error:", error);
    throw error;
  }
};

export const createExportSchedule = async (scheduleData: CreateExportSchedulePayload) => {
  try {
    const response = await api.post("/api/exports/schedules", scheduleData);
    return response.data?.data ?? response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Create export schedule error:", error);
    throw error;
  }
};

export const updateExportSchedule = async (
  scheduleId: string,
  scheduleData: UpdateExportSchedulePayload
) => {
  try {
    const response = await api.put(`/api/exports/schedules/${scheduleId}`, scheduleData);
    return response.data?.data ?? response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Update export schedule error:", error);
    throw error;
  }
};

export const deleteExportSchedule = async (scheduleId: string) => {
  try {
    const response = await api.delete(`/api/exports/schedules/${scheduleId}`);
    return response.data?.data ?? response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Delete export schedule error:", error);
    throw error;
  }
};

export const triggerExportSchedule = async (scheduleId: string) => {
  try {
    const response = await api.post(`/api/exports/schedules/${scheduleId}/execute`);
    return response.data?.data ?? response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Trigger export schedule error:", error);
    throw error;
  }
};

export const getExportResults = async (
  scheduleId?: string,
  _status?: string,
  _page: number = 1,
  pageSize: number = 50
): Promise<ExportResultRecord[]> => {
  try {
    const params = new URLSearchParams({ limit: pageSize.toString() });
    if (scheduleId) params.append("schedule_id", scheduleId);

    const response = await api.get(`/api/exports/results?${params.toString()}`);
    const results = response.data?.data?.results ?? response.data?.results ?? [];
    return Array.isArray(results)
      ? results.map((result: Record<string, unknown>) => normalizeExportResult(result))
      : [];
  } catch (error: unknown) {
    __DEV__ && console.error("Get export results error:", error);
    throw error;
  }
};

export const downloadExportResult = async (resultId: string) => {
  try {
    const response = await api.get(`/api/exports/results/${resultId}/download`, {
      responseType: "blob",
    });
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Download export result error:", error);
    throw error;
  }
};
