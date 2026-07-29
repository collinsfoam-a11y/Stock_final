import { Platform } from "react-native";
import api from "../../httpClient";

// ==========================================
// REPORTS API
// ==========================================

export const getAvailableReports = async () => {
  try {
    const response = await api.get("/api/admin/control/reports/available");
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get available reports error:", error);
    throw error;
  }
};

export type AdminControlReportFormat = "json" | "csv" | "excel";

export type GenerateAdminControlReportResult =
  | { kind: "json"; data: any }
  | { kind: "file"; blob: Blob; fileName: string; contentType?: string }
  | {
      kind: "file";
      arrayBuffer: ArrayBuffer;
      fileName: string;
      contentType?: string;
    };

export const generateReport = async (
  reportId: string,
  options: {
    format?: AdminControlReportFormat;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<GenerateAdminControlReportResult> => {
  try {
    const format = options.format ?? "json";
    const params = {
      report_id: reportId,
      format,
      start_date: options.startDate,
      end_date: options.endDate,
    };

    const responseType =
      format === "json" ? "json" : Platform.OS === "web" ? "blob" : "arraybuffer";

    const response = await api.post("/api/admin/control/reports/generate", null, {
      params,
      responseType: responseType as any,
    });

    const header =
      (response.headers?.["content-disposition"] as string | undefined) ||
      (response.headers?.["Content-Disposition"] as string | undefined);

    const fileName =
      header?.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)?.[1]?.trim() ||
      `${reportId}_${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : format}`;

    if (format === "json") {
      return { kind: "json", data: response.data };
    }

    const contentType = response.headers?.["content-type"] as string | undefined;
    if (Platform.OS === "web") {
      return {
        kind: "file",
        blob: response.data as Blob,
        fileName,
        contentType,
      };
    }

    return {
      kind: "file",
      arrayBuffer: response.data as ArrayBuffer,
      fileName,
      contentType,
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Generate report error:", error);
    throw error;
  }
};
