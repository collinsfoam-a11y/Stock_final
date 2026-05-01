import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import ScanScreen from "../../app/staff/scan.screen";
import SupervisorDashboard from "../../app/supervisor/dashboard";
import SyncConflictsScreen from "../../app/supervisor/sync-conflicts";
import SessionDetail from "../../app/supervisor/session/[id]";
import { uxMetrics } from "../utils/uxMetrics";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockHasPermission = jest.fn(() => true);
const mockRouter = {
  back: mockBack,
  push: mockPush,
  replace: mockReplace,
};
const mockGetItemByBarcode = jest.fn();
const mockCheckItemScanStatus = jest.fn();
const mockGetSessionStats = jest.fn();
const mockUpdateSessionStatus = jest.fn();
const mockGetSessions = jest.fn();
const mockGetSession = jest.fn();
const mockGetCountLines = jest.fn();
const mockGetSyncConflicts = jest.fn();
const mockGetSyncConflictStats = jest.fn();
const mockResolveSyncConflict = jest.fn();
const mockGetOfflineQueue = jest.fn();
const mockGetConflicts = jest.fn();
const mockToastShow = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());

let mockParams: Record<string, string> = { id: "session-1", sessionId: "session-1" };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require("react");
    ReactMock.useEffect(() => effect(), [effect]);
  },
  Stack: {
    Screen: jest.fn(() => null),
  },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem,
  }: {
    data?: any[];
    ListEmptyComponent?: React.ComponentType | React.ReactNode;
    ListHeaderComponent?: React.ComponentType | React.ReactNode;
    renderItem: ({ item, index }: { item: any; index: number }) => React.ReactNode;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View: ViewMock } = require("react-native");

    return ReactMock.createElement(
      ViewMock,
      null,
      typeof ListHeaderComponent === "function"
        ? ReactMock.createElement(ListHeaderComponent)
        : ListHeaderComponent || null,
      Array.isArray(data) && data.length > 0
        ? data.map((item, index) =>
            ReactMock.createElement(
              ReactMock.Fragment,
              { key: item?.id || item?._id || item?.item_code || index },
              renderItem({ item, index })
            )
          )
        : typeof ListEmptyComponent === "function"
          ? ReactMock.createElement(ListEmptyComponent)
          : ListEmptyComponent || null
    );
  },
}));

jest.mock("../services/api/api", () => ({
  batchResolveSyncConflicts: jest.fn(),
  checkItemScanStatus: (...args: unknown[]) => mockCheckItemScanStatus(...args),
  createSession: jest.fn(),
  getAssignableStaffUsers: jest.fn(),
  getCountLines: (...args: unknown[]) => mockGetCountLines(...args),
  getItemByBarcode: (...args: unknown[]) => mockGetItemByBarcode(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getSessions: (...args: unknown[]) => mockGetSessions(...args),
  getSessionStats: (...args: unknown[]) => mockGetSessionStats(...args),
  getSyncConflicts: (...args: unknown[]) => mockGetSyncConflicts(...args),
  getSyncConflictStats: (...args: unknown[]) => mockGetSyncConflictStats(...args),
  getWarehouses: jest.fn(async () => []),
  getZones: jest.fn(async () => []),
  rejectCountLine: jest.fn(),
  resolveSyncConflict: (...args: unknown[]) => mockResolveSyncConflict(...args),
  searchItems: jest.fn(async () => ({ items: [] })),
  updateSessionStatus: (...args: unknown[]) => mockUpdateSessionStatus(...args),
  verifyStock: jest.fn(),
  unverifyStock: jest.fn(),
}));

jest.mock("../services/connectionManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      addListener: jest.fn(),
      backendIp: "mock",
      backendPort: 8001,
      backendUrl: "http://mock:8001",
      initialize: jest.fn(async () => undefined),
      isHealthy: true,
      lastChecked: new Date().toISOString(),
      removeListener: jest.fn(),
    })),
  },
  ConnectionManager: {
    getInstance: jest.fn(() => ({
      addListener: jest.fn(),
      backendIp: "mock",
      backendPort: 8001,
      backendUrl: "http://mock:8001",
      initialize: jest.fn(async () => undefined),
      isHealthy: true,
      lastChecked: new Date().toISOString(),
      removeListener: jest.fn(),
    })),
  },
}));

jest.mock("../services/offline/offlineQueue", () => ({
  getConflicts: (...args: unknown[]) => mockGetConflicts(...args),
  resolveConflict: jest.fn(),
}));

jest.mock("../services/offline/offlineStorage", () => ({
  getOfflineQueue: (...args: unknown[]) => mockGetOfflineQueue(...args),
}));

jest.mock("../services/device/expoCamera", () => ({
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Heavy: "heavy",
    Light: "light",
    Medium: "medium",
  },
  NotificationFeedbackType: {
    Error: "error",
    Success: "success",
    Warning: "warning",
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock("../db/localDb", () => ({
  localDb: {
    getItemByBarcode: jest.fn(async () => null),
    getSessionStats: jest.fn(async () => ({
      pendingItems: 1,
      scannedItems: 10,
      totalItems: 10,
      verifiedItems: 9,
    })),
    searchItems: jest.fn(async () => []),
  },
}));

jest.mock("../services/enhancedFeatures", () => ({
  RecentItemsService: {
    getRecentItems: jest.fn(async () => []),
  },
}));

jest.mock("../services/scanSoundService", () => ({
  playScanSound: jest.fn(async () => undefined),
}));

jest.mock("../services/toastService", () => ({
  toastService: {
    show: jest.fn(),
    showSuccess: jest.fn(),
  },
}));

jest.mock("../components/ui/SyncStatusPill", () => ({
  SyncStatusPill: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: TextMock } = require("react-native");
    return ReactMock.createElement(TextMock, null, "Live");
  },
}));

jest.mock("../hooks/useIdleProbe", () => ({
  useIdleProbe: () => ({
    markAction: jest.fn(),
  }),
}));

jest.mock("../hooks/usePerformanceMonitor", () => ({
  usePerformanceMonitor: () => ({
    metrics: {},
    performanceWarning: false,
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
  }),
}));

jest.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("../hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    lastMessage: null,
  }),
}));

jest.mock("../hooks/usePermission", () => ({
  usePermission: () => ({
    hasPermission: mockHasPermission,
  }),
}));

jest.mock("../store/authStore", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    logout: jest.fn(async () => undefined),
    user: {
      id: "staff-1",
      role: "staff",
      username: "robot",
    },
  }),
}));

jest.mock("../store/settingsStore", () => ({
  useSettingsStore: (selector: (state: any) => unknown) =>
    selector({
      settings: {
        debounceDelay: 0,
        lazyLoading: false,
        offlineMode: false,
        scannerAutoSubmit: false,
        scannerSound: false,
        scannerTimeout: 10,
        scannerVibration: false,
      },
    }),
}));

jest.mock("../store/scanSessionStore", () => ({
  useScanSessionStore: () => ({
    currentFloor: "Floor 1",
    currentRack: "Rack 2",
  }),
}));

jest.mock("../components/ui/AuroraBackground", () => ({
  AuroraBackground: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../components/ui/GlassCard", () => ({
  GlassCard: ({ children, ...props }: { children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View: ViewMock } = require("react-native");
    return ReactMock.createElement(ViewMock, props, children);
  },
}));

jest.mock("../components/ui/AnimatedPressable", () => ({
  AnimatedPressable: ({
    children,
    onPress,
    ...props
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity: TouchableOpacityMock } = require("react-native");
    return ReactMock.createElement(TouchableOpacityMock, { onPress, ...props }, children);
  },
}));

jest.mock("../components/feedback/ToastProvider", () => ({
  useToast: () => ({
    show: mockToastShow,
  }),
}));

jest.mock("../components/supervisor/RecountAssignmentModal", () => () => null);

const validScanCodes = Array.from(
  { length: 9 },
  (_value, index) => `ITEM${String(index + 1).padStart(3, "0")}`
);
const invalidScanCode = "INVALID001";

function makeItem(code: string) {
  return {
    barcode: code,
    item_code: code,
    item_name: `Robot item ${code}`,
    stock_qty: 10,
  };
}

async function settle() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

async function expectWithin(label: string, timeoutMs: number, action: () => void | Promise<void>) {
  const start = Date.now();
  try {
    await action();
  } catch (error) {
    uxMetrics.log("hesitation", { label, timeoutMs });
    throw new Error(
      `HESITATION: ${label} exceeded ${timeoutMs}ms: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const elapsedMs = Date.now() - start;
  uxMetrics.log(label, { elapsedMs });
  if (elapsedMs > timeoutMs) {
    throw new Error(`HESITATION: ${label} took ${elapsedMs}ms`);
  }
  return elapsedMs;
}

async function runScanFlow() {
  mockParams = { sessionId: "session-1" };
  mockGetSessionStats.mockResolvedValue({
    id: "session-1",
    pendingItems: 1,
    scannedItems: 10,
    totalItems: 10,
    verifiedItems: 9,
  });
  mockCheckItemScanStatus.mockResolvedValue({ scanned: false, locations: [] });
  mockGetItemByBarcode.mockImplementation(async (code: string) =>
    code === invalidScanCode ? null : makeItem(code)
  );

  const screen = render(<ScanScreen />);
  await settle();

  const input = screen.getByPlaceholderText("Barcode or item code");
  const submit = screen.getByTestId("scan-search-submit");
  const start = Date.now();

  for (const [index, code] of [
    ...validScanCodes.slice(0, 4),
    invalidScanCode,
    ...validScanCodes.slice(4),
  ].entries()) {
    uxMetrics.log("scan_start", { code });
    fireEvent.changeText(input, code);
    fireEvent.press(submit);

    if (code === invalidScanCode) {
      await expectWithin("invalid_scan_feedback", 2000, async () => {
        await waitFor(
          () => expect(mockAlert).toHaveBeenCalledWith("Item not found", expect.any(String)),
          {
            timeout: 2000,
          }
        );
      });
      continue;
    }

    await expectWithin(`scan_success_${index + 1}`, 2000, async () => {
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(index > 4 ? index : index + 1), {
        timeout: 2000,
      });
    });
  }

  const scanStartDelayMs = Date.now() - start;

  fireEvent.press(screen.getByText("Finish Rack"));
  await waitFor(() => screen.getByText("Complete Rack Scan?"));
  fireEvent.press(screen.getByText("Complete"));
  await waitFor(() =>
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith("session-1", "reconcile")
  );

  screen.unmount();
  return scanStartDelayMs;
}

async function runDifferenceResolutionFlow() {
  mockParams = {};
  mockGetSyncConflictStats.mockResolvedValue({
    data: {
      pending: 1,
      resolved: 0,
      total: 1,
    },
  });
  mockGetSyncConflicts.mockResolvedValue({
    data: {
      conflicts: [
        {
          _id: "conflict-1",
          conflict_type: "quantity_mismatch",
          detected_at: new Date("2026-05-01T08:00:00.000Z").toISOString(),
          item_code: "ITEM001",
          local_data: {
            counted_qty: 12,
            item_code: "ITEM001",
            item_name: "Robot item ITEM001",
          },
          local_value: { counted_qty: 12 },
          server_data: {
            expected_qty: 10,
            item_code: "ITEM001",
            item_name: "Robot item ITEM001",
          },
          server_value: { expected_qty: 10 },
          session_id: "session-1",
          status: "pending",
        },
      ],
    },
  });
  mockResolveSyncConflict.mockResolvedValue({ success: true });

  const screen = render(<SyncConflictsScreen />);

  await settle();
  const acceptCountedButton = await screen.findByText("Accept Counted", {}, { timeout: 2000 });
  expect(screen.getByText("System = ERP value")).toBeTruthy();
  expect(screen.getByText("Counted = your value")).toBeTruthy();

  const start = Date.now();
  fireEvent.press(acceptCountedButton, { stopPropagation: jest.fn() });
  await expectWithin("difference_resolve", 10000, async () => {
    await waitFor(() =>
      expect(mockResolveSyncConflict).toHaveBeenCalledWith(
        "conflict-1",
        "accept_local",
        "",
        undefined
      )
    );
  });
  const resolveTimeMs = Date.now() - start;

  screen.unmount();
  return resolveTimeMs;
}

async function runSessionDetailFlow() {
  mockParams = { id: "session-1" };
  mockGetSession.mockResolvedValue({
    id: "session-1",
    location_name: "Floor 1",
    rack_no: "2/5",
    staff_name: "Robot",
    status: "OPEN",
    total_items: 10,
    total_variance: 2,
    verified_items: 6,
    warehouse: "Main Warehouse",
  });
  mockGetCountLines.mockImplementation(
    async (_sessionId: string, _page: number, _pageSize: number, verified: boolean) => ({
      items: verified
        ? [
            {
              counted_qty: 10,
              erp_qty: 10,
              id: "line-verified",
              item_code: "ITEM000",
              item_name: "Verified item",
              status: "verified",
              variance: 0,
              verified: true,
            },
          ]
        : [
            {
              counted_qty: 12,
              erp_qty: 10,
              id: "line-1",
              item_code: "ITEM001",
              item_name: "Robot item ITEM001",
              status: "pending",
              variance: 2,
              verified: false,
            },
          ],
    })
  );
  mockUpdateSessionStatus.mockResolvedValue({ success: true });

  const screen = render(<SessionDetail />);
  await waitFor(() => screen.getByText("Rack 2/5"));
  expect(screen.getByText("Move to Reconcile")).toBeTruthy();
  fireEvent.press(screen.getByText("Move to Reconcile"));
  await waitFor(() =>
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith("session-1", "RECONCILE")
  );
  screen.unmount();
}

async function runDashboardSupervisorFlow() {
  mockGetSessions.mockResolvedValue({
    items: [
      {
        counted_items: 6,
        id: "session-1",
        staff_name: "Robot",
        status: "OPEN",
        total_items: 10,
        total_variance: 2,
        verified_items: 6,
        warehouse: "Main Warehouse",
      },
    ],
  });
  mockGetSyncConflictStats.mockResolvedValue({
    data: {
      pending: 1,
      resolved: 0,
      total: 1,
    },
  });
  mockGetOfflineQueue.mockResolvedValue([]);
  mockGetConflicts.mockResolvedValue([]);

  const screen = render(<SupervisorDashboard />);
  await waitFor(() => screen.getByText("Resolve Differences"));
  fireEvent.press(screen.getByText("Resolve Differences"));
  expect(mockPush).toHaveBeenCalledWith("/supervisor/sync-conflicts");
  screen.unmount();
}

function countHesitations() {
  return uxMetrics.report().filter((event) => event.event === "hesitation").length;
}

function printSimulationResult({
  differenceResolveTimeMs,
  flowCompleted,
  scanStartDelayMs,
}: {
  differenceResolveTimeMs: number;
  flowCompleted: boolean;
  scanStartDelayMs: number;
}) {
  const hesitationCount = countHesitations();
  const verdict =
    flowCompleted &&
    scanStartDelayMs < 2000 &&
    differenceResolveTimeMs < 10000 &&
    hesitationCount === 0
      ? "PASS"
      : "FAIL";

  // eslint-disable-next-line no-console
  console.log(`
SIMULATION RESULT

Scan start delay: ${scanStartDelayMs} ms
Hesitation detected: ${hesitationCount > 0 ? "YES" : "NO"}
Difference resolve time: ${differenceResolveTimeMs} ms
Flow completed: ${flowCompleted ? "YES" : "NO"}

Verdict: ${verdict}
`);
}

describe("UX flow simulation", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    uxMetrics.reset();
    mockParams = { id: "session-1", sessionId: "session-1" };
  });

  it("completes the pre-field robot flow without timeout, retry, or navigation friction", async () => {
    let flowCompleted = false;
    let scanStartDelayMs = 0;
    let differenceResolveTimeMs = 0;

    try {
      scanStartDelayMs = await runScanFlow();
      differenceResolveTimeMs = await runDifferenceResolutionFlow();
      await runSessionDetailFlow();
      await runDashboardSupervisorFlow();
      flowCompleted = true;
    } finally {
      printSimulationResult({
        differenceResolveTimeMs,
        flowCompleted,
        scanStartDelayMs,
      });
    }

    expect(flowCompleted).toBe(true);
    expect(scanStartDelayMs).toBeLessThan(2000);
    expect(differenceResolveTimeMs).toBeLessThan(10000);
    expect(countHesitations()).toBe(0);
  });
});
