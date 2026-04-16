import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useWebSocket } from "../useWebSocket";
import { useAuthStore } from "../../store/authStore";
import { secureStorage } from "../../services/storage/secureStorage";
import { handleUnauthorized } from "../../services/authUnauthorizedHandler";

jest.mock("../../services/httpClient", () => ({
  API_BASE_URL: "http://localhost:8001",
}));

jest.mock("../../store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

jest.mock("../../services/storage/secureStorage", () => ({
  secureStorage: {
    getItem: jest.fn(),
  },
}));

jest.mock("../../services/authUnauthorizedHandler", () => ({
  handleUnauthorized: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;
const mockHandleUnauthorized = handleUnauthorized as jest.Mock;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;

  constructor(public url: string) {
    mockSockets.push(this);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  send(_data: string) {}

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitClose(code: number, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const mockSockets: MockWebSocket[] = [];

describe("useWebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSockets.length = 0;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
    mockSecureStorage.getItem.mockResolvedValue("token-123");
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("connects using secure storage tokens", async () => {
    renderHook(() => useWebSocket("sess-123"));

    await waitFor(() => {
      expect(mockSecureStorage.getItem).toHaveBeenCalledWith("auth_token");
      expect(mockSockets).toHaveLength(1);
    });

    expect(mockSockets[0]?.url).toContain("token=token-123");
    expect(mockSockets[0]?.url).toContain("session_id=sess-123");
  });

  it("stops reconnecting and triggers unauthorized handling on auth close", async () => {
    renderHook(() => useWebSocket("sess-123"));

    await waitFor(() => {
      expect(mockSockets).toHaveLength(1);
    });

    await act(async () => {
      mockSockets[0]?.emitClose(1008, "policy");
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
    expect(mockSockets).toHaveLength(1);
  });
});
