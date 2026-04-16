import { beforeEach, describe, expect, it, jest } from "@jest/globals";

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
});
