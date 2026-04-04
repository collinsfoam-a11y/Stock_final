import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@/services/httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("ItemVerificationAPI ERPNext exports", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("requests ERPNext item exports in XLSX format", async () => {
    let httpClient: any;
    let ItemVerificationAPI: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("@/services/httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ ItemVerificationAPI } = require("../itemVerificationApi"));
    });

    httpClient.get.mockResolvedValue({ data: new ArrayBuffer(8) });

    await ItemVerificationAPI.exportItemsToERPNext(
      { category: "Appliances", verified: true },
      "xlsx",
    );

    expect(httpClient.get).toHaveBeenCalledWith(
      "/api/v2/erp/items/export/xlsx?category=Appliances&verified=true",
      { responseType: "arraybuffer" },
    );
  });

  it("requests ERPNext variance exports in CSV format", async () => {
    let httpClient: any;
    let ItemVerificationAPI: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("@/services/httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ ItemVerificationAPI } = require("../itemVerificationApi"));
    });

    httpClient.get.mockResolvedValue({ data: new ArrayBuffer(8) });

    await ItemVerificationAPI.exportVariancesToERPNext(
      { warehouse: "Main" },
      "csv",
    );

    expect(httpClient.get).toHaveBeenCalledWith(
      "/api/v2/erp/items/variances/export/csv?warehouse=Main",
      { responseType: "arraybuffer" },
    );
  });
});
