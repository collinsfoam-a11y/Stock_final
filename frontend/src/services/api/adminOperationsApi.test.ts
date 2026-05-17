import api from "../httpClient";
import {
  getExportResults,
  getExportSchedules,
  triggerExportSchedule,
} from "./adminOperationsApi";

jest.mock("../httpClient", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe("adminOperationsApi export endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests enabled schedules with the backend query contract", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          schedules: [
            {
              id: "schedule_1",
              name: "Daily Sessions",
              export_type: "sessions",
              frequency: "daily",
              format: "csv",
              filters: {},
              email_recipients: ["ops@example.com"],
              enabled: true,
            },
          ],
        },
      },
    });

    const result = await getExportSchedules(true);

    expect(api.get).toHaveBeenCalledWith(
      "/api/exports/schedules?enabled_only=true",
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "schedule_1",
        export_type: "sessions",
        enabled: true,
      }),
    ]);
  });

  it("uses the execute endpoint for manual export runs", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { data: { success: true, export_id: "exp_1" } },
    });

    const result = await triggerExportSchedule("schedule_1");

    expect(api.post).toHaveBeenCalledWith(
      "/api/exports/schedules/schedule_1/execute",
    );
    expect(result).toEqual({ success: true, export_id: "exp_1" });
  });

  it("requests export results with limit and unwraps the result list", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          results: [
            {
              id: "result_1",
              schedule_name: "Daily Sessions",
              format: "excel",
              has_content: true,
              file_extension: "xlsx",
              row_count: 22,
              size_bytes: 1024,
              created_at: "2026-03-15T08:30:00Z",
            },
          ],
        },
      },
    });

    const result = await getExportResults(undefined, undefined, 1, 25);

    expect(api.get).toHaveBeenCalledWith("/api/exports/results?limit=25");
    expect(result).toEqual([
      expect.objectContaining({
        id: "result_1",
        has_content: true,
        format: "excel",
      }),
    ]);
  });
});
