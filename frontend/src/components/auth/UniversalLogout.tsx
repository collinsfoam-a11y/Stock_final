import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../store/authStore";
import { toastService } from "../../services/toastService";
import { safeBackNavigation } from "@/utils/navigation";
import { LogoutService } from "../../services/auth/logoutService";

export type LogoutRedirectPath = "/welcome" | "/session-expired";

interface UniversalLogoutOptions {
  redirectPath?: LogoutRedirectPath;
  showConfirmation?: boolean;
  checkPendingWork?: boolean;
  variant?: "icon" | "button" | "menu-item";
  testID?: string;
  onLogoutSuccess?: () => void;
  onLogoutError?: (error: Error) => void;
}

export const useUniversalLogout = (options: UniversalLogoutOptions = {}) => {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const { 
    redirectPath = "/welcome", 
    showConfirmation = true, 
    checkPendingWork = true,
    onLogoutSuccess, 
    onLogoutError 
  } = options;

  const handleLogout = useCallback(async () => {
    // Prevent duplicate execution
    if (isLoggingOut) {
      console.log("Logout already in progress");
      return;
    }

    if (showConfirmation) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const confirmed = window.confirm("Are you sure you want to sign out?");
        if (!confirmed) return;
      } else {
        const promise = new Promise<boolean>((resolve) => {
          Alert.alert(
            "Sign Out",
            "Are you sure you want to sign out?",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              {
                text: "Sign Out",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]
          );
        });

        const confirmed = await promise;
        if (!confirmed) return;
      }
    }

    setIsLoggingOut(true);

    try {
      // Use the comprehensive logout service
      const result = await LogoutService.performLogout({
        redirectPath,
        checkPendingWork,
        forceLogout: false
      });

      if (result.success) {
        if (onLogoutSuccess) {
          onLogoutSuccess();
        }
      } else {
        // Handle partial success or failure
        if (result.errorMessage) {
          // Check if this is a pending work issue
          if (result.pendingSyncCount && result.pendingSyncCount > 0) {
            // Ask user if they want to force logout with unsynced data
            const forcePromise = new Promise<boolean>((resolve) => {
              Alert.alert(
                "Unsynced Data",
                `You have ${result.pendingSyncCount} unsynced items. Logging out will keep this data for your next login. Force logout?`,
                [
                  { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                  {
                    text: "Force Logout",
                    style: "destructive",
                    onPress: () => resolve(true),
                  },
                ]
              );
            });

            const forceConfirmed = await forcePromise;
            if (forceConfirmed) {
              // Try logout again with force flag
              const forceResult = await LogoutService.performLogout({
                redirectPath,
                checkPendingWork: false, // Skip check this time
                forceLogout: true
              });
              
              if (forceResult.success && onLogoutSuccess) {
                onLogoutSuccess();
              }
            }
          } else {
            // Regular error
            if (onLogoutError) {
              onLogoutError(new Error(result.errorMessage));
            } else {
              toastService.showError("Failed to sign out. Please try again.");
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred during logout";
      if (onLogoutError) {
        onLogoutError(new Error(errorMessage));
      } else {
        toastService.showError("Failed to sign out. Please try again.");
      }
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, logout, onLogoutSuccess, onLogoutError, redirectPath, showConfirmation, checkPendingWork]);

  return handleLogout;
};

export const UniversalLogout = useUniversalLogout;