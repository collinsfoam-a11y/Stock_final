import api from "../httpClient";
import { checkVersion, getBackendVersion } from "../versionService";

jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const mockApiGet = api.get as jest.MockedFunction<typeof api.get>;

describe("versionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls backend version check endpoint under /api", async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        is_compatible: true,
        is_latest: true,
        update_available: false,
        update_type: null,
        client_version: "1.0.0",
        minimum_version: "1.0.0",
        current_version: "1.0.0",
        force_update: false,
        timestamp: "2026-03-21T00:00:00Z",
      },
    } as any);

    await checkVersion("1.0.0");

    expect(mockApiGet).toHaveBeenCalledWith("/api/version/check", {
      params: { client_version: "1.0.0" },
    });
  });

  it("calls backend version endpoint under /api", async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        version: "1.0.1",
        name: "Stock Count API",
        environment: "production",
        build_time: "2026-03-21T00:00:00Z",
      },
    } as any);

    await getBackendVersion();

    expect(mockApiGet).toHaveBeenCalledWith("/api/version");
  });

  it("returns safe fallback when version check fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("network error"));

    const result = await checkVersion("1.2.3");

    expect(result.update_available).toBe(false);
    expect(result.force_update).toBe(false);
    expect(result.client_version).toBe("1.2.3");
    expect(result.is_compatible).toBe(true);
  });
});
