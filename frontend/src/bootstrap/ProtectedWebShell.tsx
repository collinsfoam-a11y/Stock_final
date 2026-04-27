import React from "react";

import AppShell from "./AppShell";
import { initializeApp } from "./initApp";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";

export default function ProtectedWebShell() {
  const loadStoredAuth = useAuthStore((state) => state.loadStoredAuth);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const initStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (initStartedRef.current) {
      return;
    }

    initStartedRef.current = true;
    let cancelled = false;

    void initializeApp({
      fontsLoaded: true,
      isDev: __DEV__,
      loadStoredAuth,
      loadSettings,
      deferUnauthenticatedSettings: false,
    })
      .then(({ cleanup }) => {
        if (cancelled) {
          cleanup();
          return;
        }

        cleanupRef.current = cleanup;
      })
      .catch((error) => {
        console.warn("[ProtectedWebShell] initialization failed", error);
      });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [loadSettings, loadStoredAuth]);

  return <AppShell />;
}
