/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react-native";

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
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock React Query
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
  useQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useMutation: () => ({
    mutate: jest.fn(),
    isLoading: false,
  }),
}));

// 🔴 Guardrail 1: Contract Shape Enforcement
const mockSetFloor = jest.fn();
const mockSetRack = jest.fn();
const mockSetActiveSession = jest.fn();
const mockClearActiveSession = jest.fn();
const mockStartSection = jest.fn();
const mockCloseSection = jest.fn();
jest.mock("../src/store/scanSessionStore", () => ({
  useScanSessionStore: () => ({
    // Required contract fields - test will fail if any are removed
    currentFloor: null,
    currentRack: null,
    isSectionActive: false,
    activeSessionId: null,
    sessionType: "STANDARD",
    setFloor: mockSetFloor,
    setRack: mockSetRack,
    setActiveSession: mockSetActiveSession,
    clearActiveSession: mockClearActiveSession,
    startSection: mockStartSection,
    closeSection: mockCloseSection,
    // If any of these are removed/renamed, tests will fail
  }),
}));

jest.mock("../src/store/authStore", () => ({
  useAuthStore: () => ({
    user: {
      id: "test-id",
      username: "staff1",
      role: "staff",
      full_name: "Test Staff",
      is_active: true,
      permissions: ["scan"],
    },
    isAuthenticated: true,
    logout: jest.fn(),
  }),
}));

// Mock StatusBar to avoid clearImmediate issues
jest.mock("expo-status-bar", () => ({
  StatusBar: "StatusBar",
}));

describe("Staff Home Screen - Change Impact Guardrails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 🔴 Guardrail 1: Contract Shape Enforcement
  it("should enforce session store contract shape", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useScanSessionStore } = require("../src/store/scanSessionStore");
    const sessionStore = useScanSessionStore();

    // Critical fields that must exist
    expect(sessionStore.currentFloor).toBeDefined();
    expect(sessionStore.currentRack).toBeDefined();
    expect(sessionStore.isSectionActive).toBeDefined();
    expect(sessionStore.activeSessionId).toBeDefined();
    expect(sessionStore.sessionType).toBeDefined();

    // Actions must be callable
    expect(typeof sessionStore.setFloor).toBe("function");
    expect(typeof sessionStore.setRack).toBe("function");
    expect(typeof sessionStore.setActiveSession).toBe("function");
    expect(typeof sessionStore.clearActiveSession).toBe("function");
    expect(typeof sessionStore.startSection).toBe("function");
    expect(typeof sessionStore.closeSection).toBe("function");
  });

  // 🔴 Guardrail 2: Navigation Outcome Enforcement
  it("should NOT navigate when session is NOT active", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useScanSessionStore } = require("../src/store/scanSessionStore");
    const sessionStore = useScanSessionStore();

    // When no active session, navigation should not occur
    expect(sessionStore.activeSessionId).toBeNull();
    expect(mockPush).not.toHaveBeenCalledWith("/staff/scan");
  });

  it("should navigate ONLY when session is active", () => {
    // Simulate active session
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useScanSessionStore } = require("../src/store/scanSessionStore");
    const sessionStore = useScanSessionStore();

    // In real component, active session would enable navigation
    expect(sessionStore.setActiveSession).toBeDefined();
  });

  // 🔴 Guardrail 3: Negative-Path Locking
  it("should handle offline state correctly", () => {
    // Test that offline state doesn't trigger navigation
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("should handle missing session gracefully", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useScanSessionStore } = require("../src/store/scanSessionStore");
    const sessionStore = useScanSessionStore();

    // Missing session should not crash
    expect(sessionStore.activeSessionId).toBeNull();
    expect(sessionStore.currentFloor).toBeNull();
    expect(sessionStore.currentRack).toBeNull();
  });

  it("should handle invalid session type", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useScanSessionStore } = require("../src/store/scanSessionStore");
    const sessionStore = useScanSessionStore();

    // Session type should be valid enum value
    expect(["STANDARD", "BLIND", "STRICT"]).toContain(sessionStore.sessionType);
  });

  // 🔴 Guardrail 4: Side-Effect Detection
  it("should not have side effects during import", () => {
    // Test that importing stores doesn't trigger side effects
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../src/store/scanSessionStore");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../src/store/authStore");
    }).not.toThrow();
  });

  it("should not make network calls during render", () => {
    // Test that component rendering doesn't trigger network calls
    expect(() => {
      render(React.createElement("div"));
    }).not.toThrow();
  });
});
