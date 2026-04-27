import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("getDeviceId", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("reuses the AsyncStorage device id and caches it in memory", async () => {
    const getItem = jest.fn(async () => "device-from-storage");
    const setItem = jest.fn(async () => undefined);

    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem,
        setItem,
      },
    }));
    jest.doMock("expo-crypto", () => ({
      randomUUID: jest.fn(() => "generated-device-id"),
    }));
    jest.doMock("expo-secure-store", () => ({
      AFTER_FIRST_UNLOCK: "after-first-unlock",
      getItemAsync: jest.fn(async () => null),
      deleteItemAsync: jest.fn(async () => undefined),
    }));
    jest.doMock("../logging", () => ({
      createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      }),
    }));

    const { getDeviceId } = await import("../deviceId");

    await expect(getDeviceId()).resolves.toBe("device-from-storage");
    await expect(getDeviceId()).resolves.toBe("device-from-storage");

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("migrates a legacy SecureStore device id into AsyncStorage", async () => {
    const getItem = jest.fn(async () => null);
    const setItem = jest.fn(async () => undefined);
    const secureGetItem = jest.fn(async () => "legacy-device-id");
    const secureDeleteItem = jest.fn(async () => undefined);

    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem,
        setItem,
      },
    }));
    jest.doMock("expo-crypto", () => ({
      randomUUID: jest.fn(() => "generated-device-id"),
    }));
    jest.doMock("expo-secure-store", () => ({
      AFTER_FIRST_UNLOCK: "after-first-unlock",
      getItemAsync: secureGetItem,
      deleteItemAsync: secureDeleteItem,
    }));
    jest.doMock("../logging", () => ({
      createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      }),
    }));

    const { getDeviceId } = await import("../deviceId");

    await expect(getDeviceId()).resolves.toBe("legacy-device-id");

    expect(getItem).toHaveBeenCalledWith("device_id");
    expect(secureGetItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalledWith("device_id", "legacy-device-id");
    expect(secureDeleteItem).toHaveBeenCalled();
  });

  it("returns a stable generated id when persistence is unavailable", async () => {
    const getItem = jest.fn(async () => {
      throw new Error("storage unavailable");
    });
    const setItem = jest.fn(async () => {
      throw new Error("write unavailable");
    });
    const randomUUID = jest
      .fn()
      .mockReturnValueOnce("generated-device-id")
      .mockReturnValueOnce("second-generated-id");
    const warn = jest.fn();

    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem,
        setItem,
      },
    }));
    jest.doMock("expo-crypto", () => ({
      randomUUID,
    }));
    jest.doMock("expo-secure-store", () => ({
      AFTER_FIRST_UNLOCK: "after-first-unlock",
      getItemAsync: jest.fn(async () => null),
      deleteItemAsync: jest.fn(async () => undefined),
    }));
    jest.doMock("../logging", () => ({
      createLogger: () => ({
        info: jest.fn(),
        warn,
        debug: jest.fn(),
        error: jest.fn(),
      }),
    }));

    const { getDeviceId } = await import("../deviceId");

    await expect(getDeviceId()).resolves.toBe("generated-device-id");
    await expect(getDeviceId()).resolves.toBe("generated-device-id");

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});
