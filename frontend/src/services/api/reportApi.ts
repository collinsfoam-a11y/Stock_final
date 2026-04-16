/**
 * Report Generation API Service - Endpoints for generating and exporting reports
 */

import api from "../httpClient";

// Types
export type ReportType =
  | "stock_summary"
  | "variance_report"
  | "user_activity"
  | "session_history"
  | "audit_trail";

export type ExportFormat = "json" | "csv" | "xlsx";

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  warehouse?: string;
  user_id?: string;
  status?: string;
  floor?: string;
  category?: string;
}

export interface ReportTypeInfo {
  id: ReportType;
  name: string;
  description: string;
}

export interface ReportPreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  preview_rows: number;
  generated_at: string;
}

export interface GenerateReportParams {
  report_type: ReportType;
  format?: ExportFormat;
  filters?: ReportFilters;
  include_summary?: boolean;
}

export interface ReportFilterOptionsResponse {
  report_type: ReportType;
  filters: {
    warehouses: string[];
    floors: string[];
    categories: string[];
    statuses: string[];
    users: {
      id: string;
      username: string;
      role: string;
    }[];
  };
}

export interface ReportSummary {
  total_records: number;
  generated_at: string;
  filters_applied: Record<string, unknown>;
  report_type: ReportType;
  report_name: string;
}

export interface ReportResponse {
  summary: ReportSummary;
  data: Record<string, unknown>[];
}

// API Client
export const reportApi = {
  /**
   * Get available report types
   */
  getReportTypes: async (): Promise<ReportTypeInfo[]> => {
    const response = await api.get<{ report_types: ReportTypeInfo[] }>(
      "/api/reports/types",
    );
    return response.data.report_types;
  },

  /**
   * Get available filter options for a report type
   */
  getReportFilters: async (
    reportType: ReportType,
  ): Promise<ReportFilterOptionsResponse> => {
    const response = await api.get<ReportFilterOptionsResponse>(
      `/api/reports/filters/${encodeURIComponent(reportType)}`,
    );
    return response.data;
  },

  /**
   * Preview report data before exporting.
   *
   * Note: The backend currently doesn't expose a dedicated preview endpoint for the
   * "report generation" API, so we generate JSON and take the first N rows client-side.
   */
  previewReport: async (
    reportType: ReportType,
    filters?: ReportFilters,
    previewRows: number = 50,
  ): Promise<ReportPreviewData> => {
    const report = await reportApi.generateReport({
      report_type: reportType,
      format: "json",
      filters,
    });

    const rows = report.data.slice(0, Math.max(0, previewRows));
    const columns =
      rows.length > 0
        ? Array.from(
            new Set(rows.flatMap((row) => Object.keys(row))),
          )
        : [];

    return {
      columns,
      rows,
      total_rows: report.summary.total_records,
      preview_rows: rows.length,
      generated_at: report.summary.generated_at,
    };
  },

  /**
   * Generate a report (JSON response).
   */
  generateReport: async (params: GenerateReportParams): Promise<ReportResponse> => {
    const response = await api.post<ReportResponse>("/api/reports/generate", {
      report_type: params.report_type,
      filters: params.filters,
      format: params.format ?? "json",
      include_summary: params.include_summary ?? true,
    });
    return response.data;
  },

  /**
   * Export a report as a file (CSV/XLSX/JSON Blob).
   */
  exportReport: async (params: GenerateReportParams): Promise<Blob> => {
    const format = params.format ?? "json";

    if (format === "csv" || format === "xlsx") {
      const response = await api.post(
        `/api/reports/export/${format}`,
        {
          report_type: params.report_type,
          filters: params.filters,
          format,
          include_summary: params.include_summary ?? true,
        },
        { responseType: "blob" },
      );
      return response.data;
    }

    if (format === "json") {
      const json = await reportApi.generateReport({ ...params, format: "json" });
      return new Blob([JSON.stringify(json, null, 2)], {
        type: "application/json",
      });
    }

    // Exhaustiveness guard; should be unreachable due to ExportFormat typing.
    throw new Error(`Unsupported export format: ${String(format)}`);
  },

  // NOTE: Scheduled report management and "generate-url" endpoints are not
  // implemented on the backend. We intentionally don't call non-existent routes.
  generateReportUrl: async (): Promise<string> => {
    throw new Error(
      "Scheduled report URLs are not supported: backend does not provide /api/reports/generate-url",
    );
  },
  getScheduledReports: async (): Promise<never> => {
    throw new Error(
      "Scheduled reports are not supported: backend does not provide /api/reports/schedules",
    );
  },
  createScheduledReport: async (): Promise<never> => {
    throw new Error(
      "Scheduled reports are not supported: backend does not provide /api/reports/schedules",
    );
  },
  updateScheduledReport: async (): Promise<never> => {
    throw new Error(
      "Scheduled reports are not supported: backend does not provide /api/reports/schedules",
    );
  },
  deleteScheduledReport: async (): Promise<never> => {
    throw new Error(
      "Scheduled reports are not supported: backend does not provide /api/reports/schedules",
    );
  },
  runScheduledReport: async (): Promise<never> => {
    throw new Error(
      "Scheduled reports are not supported: backend does not provide /api/reports/schedules",
    );
  },
  getReportHistory: async (): Promise<never> => {
    throw new Error(
      "Report history is not supported: backend does not provide /api/reports/history",
    );
  },
};

// Helper function to trigger download
export async function downloadReport(
  params: GenerateReportParams,
  filename?: string,
): Promise<void> {
  const blob = await reportApi.exportReport(params);

  const format = params.format ?? "json";
  const defaultFilename = `${params.report_type}_${new Date().toISOString().split("T")[0]}.${format}`;
  const finalFilename = filename || defaultFilename;

  // Create download link
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = finalFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default reportApi;
