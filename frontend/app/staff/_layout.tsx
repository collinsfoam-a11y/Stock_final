/**
 * Staff Layout - Lavanya eMart
 * Navigation structure for staff role
 * Features:
 * - Stack-based navigation optimized for scanning workflow
 * - Quick access to scan and history
 */

import React from "react";
import { Stack } from "expo-router";
import { RoleLayoutGuard } from "@/components/auth/RoleLayoutGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StaffCrashScreen } from "@/components/feedback/StaffCrashScreen";
import { useUiTokens } from "@/hooks/useUiTokens";
import { flags } from "@/constants/flags";

export default function StaffLayout() {
  const uiTokens = useUiTokens();

  return (
    <RoleLayoutGuard allowedRoles={["staff"]} layoutName="StaffLayout">
      <ErrorBoundary
        fallback={(error, resetError) => <StaffCrashScreen error={error} resetError={resetError} />}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: flags.uiVisualSystemV2 ? uiTokens.colors.background : undefined,
            },
          }}
        />
      </ErrorBoundary>
    </RoleLayoutGuard>
  );
}
