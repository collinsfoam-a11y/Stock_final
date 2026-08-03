import api from "../httpClient";

type DiagnosisSeverity = "critical" | "high" | "medium" | "low";

export interface DiagnosisIssueSummary {
  id: string;
  title: string;
  description: string;
  severity: DiagnosisSeverity;
  timestamp: string;
  auto_fix_available: boolean;
  error_type: string;
  error_message: string;
  root_cause?: string;
  suggestions: string[];
}

export interface DiagnosisHealthSummary {
  status: string;
  health_score: number;
  total_issues: number;
  critical_issues: number;
  auto_fixable_issues: number;
  resolved_issues: number;
  issues: DiagnosisIssueSummary[];
  checks: Record<string, unknown>;
  recommendations: string[];
}

const severityPenalty: Record<DiagnosisSeverity, number> = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 5,
};

const normalizeSeverity = (value: unknown): DiagnosisSeverity => {
  switch (String(value || "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
};

export const normalizeDiagnosisHealth = (
  payload: unknown,
): DiagnosisHealthSummary | null => {
  const report =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload;

  if (!report || typeof report !== "object") {
    return null;
  }

  const raw = report as Record<string, unknown>;
  const diagnoses = Array.isArray(raw.diagnoses)
    ? (raw.diagnoses as Record<string, unknown>[])
    : [];

  const issues = diagnoses.map((diagnosis, index) => {
    const severity = normalizeSeverity(diagnosis.severity);
    const errorType = String(diagnosis.error_type || "Issue");
    const errorMessage = String(diagnosis.error_message || "Unknown error");

    return {
      id: `${errorType}-${index}`,
      title: errorType.replace(/([a-z])([A-Z])/g, "$1 $2"),
      description: String(diagnosis.root_cause || errorMessage),
      severity,
      timestamp: String(diagnosis.timestamp || new Date().toISOString()),
      auto_fix_available: Boolean(diagnosis.auto_fixable),
      error_type: errorType,
      error_message: errorMessage,
      root_cause:
        typeof diagnosis.root_cause === "string" ? diagnosis.root_cause : undefined,
      suggestions: Array.isArray(diagnosis.suggestions)
        ? diagnosis.suggestions
            .filter((suggestion): suggestion is string => typeof suggestion === "string")
        : [],
    };
  });

  const criticalIssues = issues.filter((issue) => issue.severity === "critical").length;
  const autoFixableIssues = issues.filter((issue) => issue.auto_fix_available).length;
  const baselinePenalty =
    issues.length === 0 && raw.status === "healthy"
      ? 0
      : raw.status === "degraded"
        ? 20
        : raw.status === "warning"
          ? 10
          : 0;
  const healthScore = Math.max(
    0,
    100 -
      baselinePenalty -
      issues.reduce((total, issue) => total + severityPenalty[issue.severity], 0),
  );

  return {
    status: typeof raw.status === "string" ? raw.status : "unknown",
    health_score: issues.length === 0 && raw.status === "healthy" ? 100 : healthScore,
    total_issues: issues.length,
    critical_issues: criticalIssues,
    auto_fixable_issues: autoFixableIssues,
    resolved_issues: 0,
    issues,
    checks:
      raw.checks && typeof raw.checks === "object" && !Array.isArray(raw.checks)
        ? (raw.checks as Record<string, unknown>)
        : {},
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter(
          (recommendation): recommendation is string =>
            typeof recommendation === "string",
        )
      : [],
  };
};

/**
 * Get comprehensive health status with auto-diagnosis.
 */
export const getDiagnosisHealth = async () => {
  try {
    const response = await api.get("/api/diagnosis/health");
    return normalizeDiagnosisHealth(response.data);
  } catch (error: unknown) {
    __DEV__ && console.error("Get diagnosis health error:", error);
    throw error;
  }
};

/**
 * Get error statistics with analysis.
 */
export const getDiagnosisStats = async (hours: number = 24) => {
  try {
    const response = await api.get(`/api/diagnosis/statistics?hours=${hours}`);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Get diagnosis stats error:", error);
    throw error;
  }
};

/**
 * Manually diagnose an error.
 */
export const diagnoseError = async (errorInfo: {
  error_type: string;
  error_message: string;
  context?: Record<string, unknown>;
}) => {
  try {
    const response = await api.post("/api/diagnosis/diagnose", errorInfo);
    return response.data;
  } catch (error: unknown) {
    __DEV__ && console.error("Diagnose error failed:", error);
    throw error;
  }
};

/**
 * Attempt to automatically fix a diagnosed error.
 */
export const attemptAutoFixDiagnosis = async (errorInfo: {
  error_type: string;
  error_message: string;
  context?: Record<string, unknown>;
}) => {
  try {
    const response = await api.post("/api/diagnosis/auto-fix", errorInfo);
    return {
      ...response.data,
      fixed: Boolean(response.data?.fix_successful),
    };
  } catch (error: unknown) {
    __DEV__ && console.error("Auto-fix diagnosis failed:", error);
    throw error;
  }
};
