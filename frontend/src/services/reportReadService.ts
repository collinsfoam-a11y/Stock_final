import {
  reportApi,
  type ReportFilterOptionsResponse,
  type ReportPreviewData,
  type ReportResponse,
  type ReportTypeInfo,
} from "@/services/api/reportApi";
import type { GenerateReportParams, ReportFilters, ReportType } from "@/domains/reports/types";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";

export const reportReadService = {
  getReportTypes(): Promise<ReportTypeInfo[]> {
    return reportApi.getReportTypes();
  },

  getReportFilters(reportType: ReportType): Promise<ReportFilterOptionsResponse> {
    return reportApi.getReportFilters(reportType);
  },

  previewReport(
    reportType: ReportType,
    filters?: ReportFilters,
    previewRows?: number
  ): Promise<ReportPreviewData> {
    return reportApi.previewReport(reportType, filters, previewRows);
  },

  generateReport(params: GenerateReportParams): Promise<ReportResponse> {
    return reportApi.generateReport(params);
  },

  exportReport(params: GenerateReportParams): Promise<Blob> {
    return reportApi.exportReport(params);
  },

  subscribeToReportInvalidation(callback: () => void): () => void {
    const unsubscribers = [
      controlPlaneEventBus.subscribe("session.changed", callback),
      controlPlaneEventBus.subscribe("inventory.changed", callback),
      controlPlaneEventBus.subscribe("review.changed", callback),
      controlPlaneEventBus.subscribe("sync.completed", callback),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  },
};
