const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRandomUUID = jest.fn();
const mockDebug = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
}));

jest.mock("../mmkvStorage", () => ({
  mmkvStorage: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
  },
}));

jest.mock("../logging", () => ({
  createLogger: () => ({
    debug: (...args: unknown[]) => mockDebug(...args),
    info: (...args: unknown[]) => mockInfo(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: (...args: unknown[]) => mockError(...args),
  }),
}));

// Import after mocks so deviceId captures the mocked storage/logger modules.
// eslint-disable-next-line import/first
import { __resetDeviceIdForTests, getDeviceId } from "../deviceId";

describe("getDeviceId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDeviceIdForTests();
  });

  it("returns an existing stored device id without regenerating it", async () => {
    mockGetItem.mockReturnValue("stored-device");

    await expect(getDeviceId()).resolves.toBe("stored-device");

    expect(mockGetItem).toHaveBeenCalledWith("device_id");
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockRandomUUID).not.toHaveBeenCalled();
  });

  it("generates, stores, and caches a device id when storage is empty", async () => {
    mockGetItem.mockReturnValue(null);
    mockRandomUUID.mockReturnValue("generated-device");

    await expect(getDeviceId()).resolves.toBe("generated-device");
    await expect(getDeviceId()).resolves.toBe("generated-device");

    expect(mockGetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith("device_id", "generated-device");
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith("Generated new Device ID");
  });

  it("falls back when crypto randomUUID is present but unavailable", async () => {
    mockGetItem.mockReturnValue(null);
    mockRandomUUID.mockImplementation(() => {
      throw new Error("unsupported");
    });

    await expect(getDeviceId()).resolves.toMatch(/^device_\d+_/);

    expect(mockSetItem).toHaveBeenCalledWith("device_id", expect.stringMatching(/^device_\d+_/));
    expect(mockDebug).toHaveBeenCalledWith(
      "Crypto randomUUID unavailable, using generated device ID fallback",
      { error: "unsupported" },
    );
  });

  it("uses a temporary cached device id when storage access fails", async () => {
    mockGetItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    mockRandomUUID.mockReturnValue("temporary-device");

    await expect(getDeviceId()).resolves.toBe("temporary-device");
    await expect(getDeviceId()).resolves.toBe("temporary-device");

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith("Using temporary Device ID after storage fallback", {
      error: "storage unavailable",
    });
    expect(mockError).not.toHaveBeenCalled();
  });
});
