import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { useWebSocket } from "../useWebSocket";
import { useAuthStore } from "../../store/authStore";
import { secureStorage } from "../../services/storage/secureStorage";
import { handleUnauthorized } from "../../services/authUnauthorizedHandler";

jest.mock("../../services/httpClient", () => ({
  API_BASE_URL: "http://localhost:8001",
  get: jest.fn().mockRejectedValue(new Error("unauthorized")),
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

  constructor(
    public url: string,
    public protocols?: string | string[]
  ) {
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

    // The token must travel in Sec-WebSocket-Protocol, never the URL: query
    // strings are recorded in browser history, proxy logs and access logs.
    expect(mockSockets[0]?.protocols).toEqual(["jwt", "token-123"]);
    expect(mockSockets[0]?.url).not.toContain("token-123");
    expect(mockSockets[0]?.url).not.toContain("token=");
    expect(mockSockets[0]?.url).toContain("session_id=sess-123");
  });

  it("omits the subprotocol when no token is stored so cookie auth can apply", async () => {
    // Only web reaches this path: the guard bails early on native without a
    // token. Web sessions authenticate with the HttpOnly access-token cookie.
    const originalOS = Platform.OS;
    (Platform as { OS: string }).OS = "web";
    mockSecureStorage.getItem.mockResolvedValue(null);

    try {
      renderHook(() => useWebSocket("sess-123"));

      await waitFor(() => {
        expect(mockSockets).toHaveLength(1);
      });

      expect(mockSockets[0]?.protocols).toBeUndefined();
      expect(mockSockets[0]?.url).toContain("session_id=sess-123");
      expect(mockSockets[0]?.url).not.toContain("token=");
    } finally {
      (Platform as { OS: string }).OS = originalOS;
    }
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

  it("does not connect when disabled", async () => {
    renderHook(() => useWebSocket("sess-123", false));

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSecureStorage.getItem).not.toHaveBeenCalled();
    expect(mockSockets).toHaveLength(0);
  });
});
