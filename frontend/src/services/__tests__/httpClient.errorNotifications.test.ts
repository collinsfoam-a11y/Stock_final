const loadHttpClientModule = () => {
  return require("../httpClient");
};

jest.mock("axios", () => ({
  create: () => ({
    defaults: {
      baseURL: "http://localhost:8001",
      headers: {
        common: {},
        post: {},
        put: {},
        patch: {},
      },
    },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  }),
  post: jest.fn(),
}));
jest.mock("../backendUrl", () => ({ BACKEND_URL: "http://localhost:8001" }));
jest.mock("../logging", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}));
jest.mock("../connectionManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn(async () => undefined),
    })),
  },
}));
jest.mock("../healthRequest", () => ({
  isPublicHealthRequestUrl: jest.fn(() => false),
  stripHealthRequestHeaders: jest.fn(),
}));
jest.mock("../../store/networkStore", () => ({
  useNetworkStore: {
    getState: jest.fn(() => ({ setRestrictedMode: jest.fn() })),
  },
}));
jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

describe("httpClient error notification helpers", () => {
  let extractUserErrorMessage: any;
  let getErrorMessageForStatus: any;
  let isErrorToastSuppressedRequest: any;

  beforeEach(() => {
    jest.resetModules();
    const mod = loadHttpClientModule();
    extractUserErrorMessage = mod.extractUserErrorMessage;
    getErrorMessageForStatus = mod.getErrorMessageForStatus;
    isErrorToastSuppressedRequest = mod.isErrorToastSuppressedRequest;
  });

  describe("extractUserErrorMessage", () => {
    it("extracts message from response data.message", () => {
      const error = { response: { data: { message: "Item not found" } } };
      expect(extractUserErrorMessage(error)).toBe("Item not found");
    });

    it("returns null when no message is available", () => {
      const error = { response: { data: { code: 404 } } };
      expect(extractUserErrorMessage(error)).toBeNull();
    });

    it("returns null when no response data", () => {
      const error = { message: "Network Error" };
      expect(extractUserErrorMessage(error)).toBeNull();
    });
  });

  describe("getErrorMessageForStatus", () => {
    it("prefers API message over status default", () => {
      const error = { response: { data: { message: "Barcode conflict" } } };
      expect(getErrorMessageForStatus(409, error)).toBe("Barcode conflict");
    });

    it("returns 400 default message", () => {
      expect(getErrorMessageForStatus(400, {})).toBe(
        "Invalid request. Please check your input."
      );
    });

    it("returns 403 default message", () => {
      expect(getErrorMessageForStatus(403, {})).toBe(
        "You don't have permission for this action."
      );
    });

    it("returns 500 default message", () => {
      expect(getErrorMessageForStatus(500, {})).toBe(
        "Server error. Please try again later."
      );
    });

    it("returns 503 default message", () => {
      expect(getErrorMessageForStatus(503, {})).toBe(
        "Service temporarily unavailable. Please try again."
      );
    });

    it("returns network error message for no response", () => {
      expect(getErrorMessageForStatus(0, { request: {} })).toBe(
        "Something went wrong. Please try again."
      );
    });
  });

  describe("isErrorToastSuppressedRequest", () => {
    it("suppresses cache-backed count-line reads", () => {
      expect(isErrorToastSuppressedRequest("/api/count-lines/session/abc123")).toBe(true);
    });

    it("suppresses auth refresh requests", () => {
      expect(isErrorToastSuppressedRequest("/api/auth/refresh")).toBe(true);
    });

    it("suppresses auth logout requests", () => {
      expect(isErrorToastSuppressedRequest("/api/auth/logout")).toBe(true);
    });

    it("does not suppress regular endpoints", () => {
      expect(isErrorToastSuppressedRequest("/api/count-lines")).toBe(false);
    });
  });
});
