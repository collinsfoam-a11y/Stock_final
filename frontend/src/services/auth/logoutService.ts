import { useAuthStore } from "../../store/authStore";

export interface LogoutOptions {
  force?: boolean;
  forceLogout?: boolean;
  clearCache?: boolean;
  redirectPath?: string;
  checkPendingWork?: boolean;
}

export interface LogoutResult {
  success: boolean;
  message?: string;
  errorMessage?: string;
  pendingSyncCount?: number;
  hasUnsavedChanges?: boolean;
}

export class LogoutService {
  public static async performLogout(options?: LogoutOptions): Promise<LogoutResult> {
    try {
      const authStore = useAuthStore.getState();
      await authStore.logout();
      return { success: true };
    } catch (error) {
      if (options?.force || options?.forceLogout) {
        useAuthStore.setState({ user: null, isAuthenticated: false } as any);
        return { success: true, message: "Forced logout performed" };
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : "Logout failed",
      };
    }
  }
}
