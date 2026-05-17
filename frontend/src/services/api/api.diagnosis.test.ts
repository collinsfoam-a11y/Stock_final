import api from "../httpClient";
import {
  attemptAutoFixDiagnosis,
  getDiagnosisHealth,
  normalizeDiagnosisHealth,
} from "./api.diagnosis";

jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe("diagnosis api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes backend health reports for the admin dashboard", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        status: "degraded",
        diagnoses: [
          {
            error_type: "ConnectionError",
            error_message: "Database connection lost",
            severity: "critical",
            root_cause: "Primary database unavailable",
            auto_fixable: true,
            suggestions: ["Retry the database connection"],
            timestamp: "2026-03-12T12:00:00Z",
          },
        ],
        recommendations: ["Investigate database availability"],
      },
    });

    const result = await getDiagnosisHealth();

    expect(result).toMatchObject({
      status: "degraded",
      health_score: 45,
      total_issues: 1,
      critical_issues: 1,
      auto_fixable_issues: 1,
      resolved_issues: 0,
      recommendations: ["Investigate database availability"],
    });
    expect(result?.issues[0]).toMatchObject({
      error_type: "ConnectionError",
      error_message: "Database connection lost",
      auto_fix_available: true,
      severity: "critical",
    });
  });

  it("returns null when the health payload is missing", () => {
    expect(normalizeDiagnosisHealth(null)).toBeNull();
  });

  it("calls the auto-fix endpoint and exposes a fixed flag", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        auto_fixable: true,
        fix_successful: true,
      },
    });

    const result = await attemptAutoFixDiagnosis({
      error_type: "ConnectionError",
      error_message: "Database connection lost",
    });

    expect(api.post).toHaveBeenCalledWith("/api/diagnosis/auto-fix", {
      error_type: "ConnectionError",
      error_message: "Database connection lost",
    });
    expect(result.fixed).toBe(true);
  });
});
