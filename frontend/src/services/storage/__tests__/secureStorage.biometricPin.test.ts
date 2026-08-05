/**
 * Round-trip tests for secureStorage against the real implementation.
 *
 * The authStore biometric suite mocks secureStorage wholesale, so it asserts
 * only that authStore delegates correctly. It cannot catch a storage layer whose
 * write and read disagree. That is exactly what happened: setItem("biometric_pin")
 * stored a hash under "biometric_pin_hash" while getItem("biometric_pin")
 * returned null unconditionally, so the biometric fallback could never return a
 * PIN. These tests pin the round-trip contract itself.
 */

// jest-expo runs this file in a node environment, where localStorage is absent.
// Provide a minimal in-memory stand-in so the web branches are exercisable.
const localStorageBacking = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => localStorageBacking.get(k) ?? null,
    setItem: (k: string, v: string) => void localStorageBacking.set(k, String(v)),
    removeItem: (k: string) => void localStorageBacking.delete(k),
    clear: () => localStorageBacking.clear(),
  },
});

const mockPlatform = { OS: "ios" as string };

jest.mock("react-native", () => ({
  __esModule: true,
  Platform: mockPlatform,
}));

const mockSecureStoreBacking = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  AFTER_FIRST_UNLOCK: 1,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 2,
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreBacking.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreBacking.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreBacking.delete(key);
  }),
}));

jest.mock("../../logging", () => ({
  __esModule: true,
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { secureStorage } = require("../secureStorage");

describe("secureStorage biometric PIN round-trip", () => {
  beforeEach(() => {
    mockSecureStoreBacking.clear();
    localStorage.clear();
    mockPlatform.OS = "ios";
  });

  it("returns the PIN that was stored on native", async () => {
    await secureStorage.setItem("biometric_pin", "1234");
    await expect(secureStorage.getItem("biometric_pin")).resolves.toBe("1234");
  });

  it("returns the PIN that was stored on web", async () => {
    mockPlatform.OS = "web";
    await secureStorage.setItem("biometric_pin", "4321");
    await expect(secureStorage.getItem("biometric_pin")).resolves.toBe("4321");
  });

  it("stores the PIN under its own key, not a derived one", async () => {
    await secureStorage.setItem("biometric_pin", "1234");
    expect(mockSecureStoreBacking.has("biometric_pin")).toBe(true);
    expect(mockSecureStoreBacking.has("biometric_pin_hash")).toBe(false);
  });

  it("returns null for a PIN that was never stored", async () => {
    await expect(secureStorage.getItem("biometric_pin")).resolves.toBeNull();
  });

  it("removeBiometricPin clears the PIN and any legacy hash on native", async () => {
    await secureStorage.setItem("biometric_pin", "1234");
    mockSecureStoreBacking.set("biometric_pin_hash", "legacy-value");

    await secureStorage.removeBiometricPin();

    expect(mockSecureStoreBacking.has("biometric_pin")).toBe(false);
    expect(mockSecureStoreBacking.has("biometric_pin_hash")).toBe(false);
  });

  it("removeBiometricPin clears the PIN and any legacy hash on web", async () => {
    mockPlatform.OS = "web";
    await secureStorage.setItem("biometric_pin", "4321");
    localStorage.setItem("biometric_pin_hash", "legacy-value");

    await secureStorage.removeBiometricPin();

    expect(localStorage.getItem("biometric_pin")).toBeNull();
    expect(localStorage.getItem("biometric_pin_hash")).toBeNull();
  });

  it("keeps auth tokens out of web localStorage", async () => {
    mockPlatform.OS = "web";
    await secureStorage.setItem("auth_token", "tok");

    expect(localStorage.getItem("auth_token")).toBeNull();
    await expect(secureStorage.getItem("auth_token")).resolves.toBe("tok");
  });
});
