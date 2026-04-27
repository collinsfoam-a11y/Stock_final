import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  resetWebPublicSessionCache,
  syncWebPublicSession,
  useWebPublicSession,
} from "./useWebPublicSession";

describe("useWebPublicSession", () => {
  const originalBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    act(() => {
      resetWebPublicSessionCache();
    });
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_BACKEND_URL = "http://backend.test";
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    act(() => {
      resetWebPublicSessionCache();
    });
    process.env.EXPO_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  it("reuses a synced authenticated session without probing again", () => {
    act(() => {
      syncWebPublicSession({
        username: "demo-user",
        role: "admin",
      });
    });

    const { result } = renderHook(() => useWebPublicSession());

    expect(result.current).toEqual({
      status: "authenticated",
      user: {
        username: "demo-user",
        role: "admin",
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears a cached authenticated session after reset", async () => {
    act(() => {
      syncWebPublicSession({
        username: "demo-user",
        role: "admin",
      });
      resetWebPublicSessionCache({
        status: "guest",
        user: null,
      });
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          status: "guest",
          user: null,
        },
      }),
    });

    const { result } = renderHook(() => useWebPublicSession());

    await waitFor(() => {
      expect(result.current.status).toBe("guest");
    });

    expect(result.current.user).toBeNull();
  });

  it("hydrates an authenticated session from the public session payload", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          status: "authenticated",
          user: {
            username: "noufal",
            role: "staff",
          },
        },
      }),
    });

    const { result } = renderHook(() => useWebPublicSession());

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });

    expect(result.current.user).toEqual({
      username: "noufal",
      role: "staff",
    });
  });

  it("updates mounted hooks when auth state is synced after login", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          status: "guest",
          user: null,
        },
      }),
    });

    const { result } = renderHook(() => useWebPublicSession());

    await waitFor(() => {
      expect(result.current.status).toBe("guest");
    });

    act(() => {
      syncWebPublicSession({
        username: "staff1",
        role: "staff",
      });
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        status: "authenticated",
        user: {
          username: "staff1",
          role: "staff",
        },
      });
    });
  });
});
