import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/feedback/ToastProvider";
import { ThemeProvider } from "../context/ThemeContext";
import { queryClient } from "../services/queryClient";
import { AuthGuard } from "../components/auth/AuthGuard";
import { RootStack } from "./RootStack";

export default function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthGuard>
              <RootStack />
            </AuthGuard>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
