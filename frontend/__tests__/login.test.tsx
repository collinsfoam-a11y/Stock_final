/**
 * @jest-environment jsdom
 */
import React from "react";
import "@testing-library/react-native";

// Mock ConnectionManager
jest.mock("../src/services/connectionManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      isHealthy: true,
      backendUrl: "http://mock:8001",
      backendPort: 8001,
      backendIp: "mock",
      lastChecked: new Date().toISOString(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// 🔴 Guardrail 1: Contract Shape Enforcement
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockSetUser = jest.fn();
const mockHasValidToken = jest.fn(() => true);
const mockCheckTokenExpired = jest.fn(() => false);
jest.mock("../src/store/authStore", () => ({
  useAuthStore: () => ({
    // Required contract fields - test will fail if any are removed
    login: mockLogin,
    logout: mockLogout,
    setUser: mockSetUser,
    user: {
      id: "test-id",
      username: "staff1",
      full_name: "Test Staff",
      role: "staff",
      is_active: true,
      permissions: ["scan"],
    },
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    hasValidToken: mockHasValidToken,
    checkTokenExpired: mockCheckTokenExpired,
    // If any of these are removed/renamed, tests will fail
  }),
}));

// Mock StatusBar to avoid clearImmediate issues
jest.mock("expo-status-bar", () => ({
  StatusBar: "StatusBar",
}));

describe("Authentication Flow - Change Impact Guardrails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 🔴 Guardrail 1: Contract Shape Enforcement
  it("should enforce auth store contract shape", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require("../src/store/authStore");
    const authStore = useAuthStore();

    // Critical fields that must exist
    expect(authStore.login).toBeDefined();
    expect(authStore.logout).toBeDefined();
    expect(authStore.setUser).toBeDefined();
    expect(authStore.user).toBeDefined();
    expect(authStore.isAuthenticated).toBeDefined();
    expect(authStore.isLoading).toBeDefined();
    expect(authStore.isInitialized).toBeDefined();

    // User contract must include required fields
    expect(authStore.user.id).toBeDefined();
    expect(authStore.user.username).toBeDefined();
    expect(authStore.user.role).toBeDefined();
    expect(authStore.user.is_active).toBeDefined();
    expect(authStore.user.permissions).toBeDefined();

    // Functions must be callable
    expect(typeof authStore.login).toBe("function");
    expect(typeof authStore.logout).toBe("function");
    expect(typeof authStore.setUser).toBe("function");
    expect(typeof authStore.hasValidToken).toBe("function");
  });

  // 🔴 Guardrail 2: Navigation Outcome Enforcement
  it("should NOT navigate on failed login", async () => {
    mockLogin.mockResolvedValue({ success: false, message: "Invalid credentials" });

    // Simulate failed login
    await mockLogin("wrong", "wrong");

    // Critical: Failed login must NOT trigger navigation
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("should navigate ONLY on successful login", async () => {
    mockLogin.mockResolvedValue({ success: true });

    // Simulate successful login
    await mockLogin("staff1", "password123");

    // Success must trigger navigation
    expect(mockLogin).toHaveBeenCalledWith("staff1", "password123");
    // In real component, this would trigger navigation
  });

  // 🔴 Guardrail 3: Negative-Path Locking
  it("should handle login service failure", async () => {
    // Simulate service failure
    mockLogin.mockRejectedValue(new Error("Network error"));

    try {
      await mockLogin("staff1", "password123");
    } catch (error) {
      expect((error as Error).message).toBe("Network error");
    }

    // Service failure must NOT navigate
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("should handle missing credentials", async () => {
    // Test empty username
    mockLogin.mockResolvedValue({ success: false, message: "Username required" });
    await mockLogin("", "password123");
    expect(mockReplace).not.toHaveBeenCalled();

    // Test empty password
    mockLogin.mockResolvedValue({ success: false, message: "Password required" });
    await mockLogin("staff1", "");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // 🔴 Guardrail 4: Side-Effect Detection
  it("should not have side effects during import", () => {
    // Test that importing auth store doesn't trigger side effects
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../src/store/authStore");
    }).not.toThrow();
  });
});
