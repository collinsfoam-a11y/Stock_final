jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe("api.misc", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("unwraps watchtower stats from the standard API envelope", async () => {
    let httpClient: any;
    let getWatchtowerStats: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getWatchtowerStats } = require("../api/api.misc"));
    });

    httpClient.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          active_sessions: 3,
          total_scans_today: 42,
        },
      },
    });

    const result = await getWatchtowerStats();

    expect(result).toEqual({
      active_sessions: 3,
      total_scans_today: 42,
    });
  });

  it("preserves direct watchtower payloads for legacy callers", async () => {
    let httpClient: any;
    let getWatchtowerStats: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getWatchtowerStats } = require("../api/api.misc"));
    });

    httpClient.get.mockResolvedValue({
      data: {
        active_sessions: 1,
        total_scans_today: 8,
      },
    });

    const result = await getWatchtowerStats();

    expect(result).toEqual({
      active_sessions: 1,
      total_scans_today: 8,
    });
  });

  it("posts canonical sync records instead of legacy operations", async () => {
    let httpClient: any;
    let syncBatch: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ syncBatch } = require("../api/api.misc"));
    });

    httpClient.post.mockResolvedValue({
      data: {
        ok: ["client-1"],
        conflicts: [],
        errors: [],
        batch_id: "batch-1",
        processing_time_ms: 1,
        total_records: 1,
      },
    });

    const record = {
      client_record_id: "client-1",
      session_id: "sess-1",
      location_id: "LOC-1",
      floor_id: "F1",
      rack_id: "R1",
      item_code: "ITEM001",
      verified_qty: 2,
      damaged_qty: 0,
      serial_numbers: [],
      evidence_photos: [],
      status: "finalized",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const result = await syncBatch([record], "batch-1");

    expect(httpClient.post).toHaveBeenCalledWith("/api/sync/batch", {
      records: [record],
      batch_id: "batch-1",
    });
    expect(httpClient.post).not.toHaveBeenCalledWith(
      "/api/sync/batch",
      expect.objectContaining({ operations: expect.any(Array) }),
    );
    expect(result.results).toEqual([{ id: "client-1", success: true }]);
  });
});
