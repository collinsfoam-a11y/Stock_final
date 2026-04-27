import React from "react";

import apiClient from "@/services/httpClient";

type PublicRegistrationAvailability = {
  status: "loading" | "ready" | "error";
  publicRegistrationAllowed: boolean;
};

const DEFAULT_STATE: PublicRegistrationAvailability = {
  status: "loading",
  publicRegistrationAllowed: false,
};

const parsePublicRegistrationAllowed = (payload: unknown): boolean => {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : null;

  return Boolean(
    data &&
      typeof data === "object" &&
      (data as { public_registration_allowed?: unknown })
        .public_registration_allowed === true,
  );
};

export function usePublicRegistrationAvailability(): PublicRegistrationAvailability {
  const [state, setState] =
    React.useState<PublicRegistrationAvailability>(DEFAULT_STATE);

  React.useEffect(() => {
    let cancelled = false;

    void apiClient
      .get("/api/auth/public-session")
      .then((response) => {
        if (cancelled) return;
        setState({
          status: "ready",
          publicRegistrationAllowed: parsePublicRegistrationAllowed(
            response.data,
          ),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          status: "error",
          publicRegistrationAllowed: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
