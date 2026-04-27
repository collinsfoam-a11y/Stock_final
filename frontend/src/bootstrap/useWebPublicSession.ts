import React from "react";

import { getRouteForRole, type UserRole } from "../utils/roleNavigation";

type PublicSessionUser = {
  username: string;
  role: UserRole;
};

type PublicSessionState = {
  status: "loading" | "guest" | "authenticated";
  user: PublicSessionUser | null;
};

type PublicSessionListener = (state: PublicSessionState) => void;

const CACHE_TTL_MS = 30_000;
const DEFAULT_STATE: PublicSessionState = {
  status: "loading",
  user: null,
};

let cachedState: PublicSessionState = DEFAULT_STATE;
let pendingProbe: Promise<PublicSessionState> | null = null;
let lastResolvedAt = 0;
const listeners = new Set<PublicSessionListener>();

const stripTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const getCandidateOrigins = (): string[] => {
  const candidates: string[] = [];
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const envPort = process.env.EXPO_PUBLIC_BACKEND_PORT || "8001";

  if (envUrl) {
    candidates.push(stripTrailingSlash(envUrl));
  }

  if (typeof window !== "undefined") {
    const { location } = window;
    if (location) {
      const currentPort =
        location.port || (location.protocol === "https:" ? "443" : "80");

      if (location.protocol && location.hostname && !envUrl) {
        candidates.push(
          `${location.protocol}//${location.hostname}:${envPort}`,
        );
      }

      if (
        location.protocol &&
        location.hostname &&
        currentPort === envPort
      ) {
        candidates.push(
          stripTrailingSlash(
            `${location.protocol}//${location.hostname}:${currentPort}`,
          ),
        );
      }
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

const parseSessionPayload = (payload: unknown): PublicSessionUser | null => {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : null;

  if (
    !data ||
    typeof data !== "object" ||
    (data as { status?: unknown }).status !== "authenticated"
  ) {
    return null;
  }

  const user = (data as { user?: unknown }).user;
  if (
    !user ||
    typeof user !== "object" ||
    typeof (user as { username?: unknown }).username !== "string" ||
    typeof (user as { role?: unknown }).role !== "string"
  ) {
    return null;
  }

  const role = (user as { role: string }).role;
  if (role !== "staff" && role !== "supervisor" && role !== "admin") {
    return null;
  }

  return {
    username: (user as { username: string }).username,
    role,
  };
};

const probeOrigin = async (origin: string): Promise<PublicSessionUser | null> => {
  const response = await fetch(`${origin}/api/auth/public-session`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return parseSessionPayload(payload);
};

const resolvePublicSession = async (): Promise<PublicSessionState> => {
  for (const origin of getCandidateOrigins()) {
    try {
      const user = await probeOrigin(origin);
      if (user) {
        return {
          status: "authenticated",
          user,
        };
      }
    } catch {
      // Ignore probe errors and continue to the next candidate.
    }
  }

  return {
    status: "guest",
    user: null,
  };
};

export const getPublicRouteForRole = (role: UserRole) => getRouteForRole(role);

const cacheResolvedState = (state: PublicSessionState) => {
  cachedState = state;
  lastResolvedAt = state.status === "loading" ? 0 : Date.now();
  listeners.forEach((listener) => {
    listener(cachedState);
  });
};

const subscribeWebPublicSession = (listener: PublicSessionListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const resetWebPublicSessionCache = (
  nextState: PublicSessionState = DEFAULT_STATE,
) => {
  pendingProbe = null;
  cacheResolvedState(nextState);
};

export const syncWebPublicSession = (user: PublicSessionUser | null) => {
  resetWebPublicSessionCache(
    user
      ? {
          status: "authenticated",
          user,
        }
      : {
          status: "guest",
          user: null,
        },
  );
};

const shouldReuseCachedState = () =>
  cachedState.status !== "loading" && Date.now() - lastResolvedAt < CACHE_TTL_MS;

export function useWebPublicSession(): PublicSessionState {
  const [state, setState] = React.useState<PublicSessionState>(cachedState);

  React.useEffect(() => {
    const unsubscribe = subscribeWebPublicSession(setState);

    if (shouldReuseCachedState()) {
      setState(cachedState);
      return unsubscribe;
    }

    if (cachedState.status !== "loading") {
      cacheResolvedState(DEFAULT_STATE);
    }

    if (!pendingProbe) {
      pendingProbe = resolvePublicSession()
        .then((result) => {
          cacheResolvedState(result);
          return result;
        })
        .finally(() => {
          pendingProbe = null;
        });
    }

    let cancelled = false;

    void pendingProbe.then((result) => {
      if (!cancelled) {
        setState(result);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
