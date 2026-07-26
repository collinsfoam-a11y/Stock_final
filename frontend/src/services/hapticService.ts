/**
 * Haptic Feedback Service
 * Provides haptic feedback for scanner and other UI interactions
 */
import { SCANNER_CONFIG } from "../config/scannerConfig";
import {
  haptics,
  HapticIntensity,
  HapticNotification,
} from "./haptics";

/**
 * Haptic feedback intensity levels
 */
export type { HapticIntensity } from "./haptics";

/**
 * Haptic feedback patterns
 */
export type HapticPattern =
  | "success"
  | "error"
  | "warning"
  | "selection"
  | "impact";

/**
 * Haptic Service for providing tactile feedback
 */
export class HapticService {
  private enabled: boolean = SCANNER_CONFIG.haptics.enabled;

  /**
   * Enable haptic feedback
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable haptic feedback
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if haptics are enabled
   */
  isEnabled(): boolean {
    return this.enabled && haptics.isAvailable();
  }

  /**
   * Trigger selection feedback (light tap)
   */
  async selection(): Promise<void> {
    if (!this.isEnabled()) return;
    await haptics.selection();
  }

  /**
   * Trigger impact feedback with intensity
   */
  async impact(intensity: HapticIntensity = "medium"): Promise<void> {
    if (!this.isEnabled()) return;
    await haptics.impact(intensity);
  }

  /**
   * Trigger notification feedback
   */
  async notification(type: HapticNotification): Promise<void> {
    if (!this.isEnabled()) return;
    await haptics.notification(type);
  }

  /**
   * Success feedback - for successful scan
   */
  async success(): Promise<void> {
    await this.notification("success");
  }

  /**
   * Error feedback - for failed scan
   */
  async error(): Promise<void> {
    await this.notification("error");
  }

  /**
   * Warning feedback - for warnings
   */
  async warning(): Promise<void> {
    await this.notification("warning");
  }

  /**
   * Scan success feedback - optimized for barcode scanning
   */
  async scanSuccess(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const intensity = SCANNER_CONFIG.haptics.successIntensity;
      await haptics.impact(intensity);
      setTimeout(async () => {
        await haptics.notification("success");
      }, 100);
    } catch (error) {
      __DEV__ && console.warn("Scan success haptic failed:", error);
    }
  }

  /**
   * Scan error feedback - optimized for barcode scanning
   */
  async scanError(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const intensity = SCANNER_CONFIG.haptics.errorIntensity;
      await haptics.impact(intensity);
      await haptics.notification("error");
    } catch (error) {
      __DEV__ && console.warn("Scan error haptic failed:", error);
    }
  }

  /**
   * Custom pattern feedback
   */
  async pattern(pattern: HapticPattern): Promise<void> {
    if (!this.isEnabled()) return;

    switch (pattern) {
      case "success":
        await this.success();
        break;
      case "error":
        await this.error();
        break;
      case "warning":
        await this.warning();
        break;
      case "selection":
        await this.selection();
        break;
      case "impact":
        await this.impact("medium");
        break;
    }
  }

  /**
   * Vibrate pattern (for Android compatibility)
   */
  async vibrate(_pattern: number[] = [0, 100]): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      // On iOS, use impact. On Android, use notification.
      await this.notification("success");
    } catch (error) {
      __DEV__ && console.warn("Vibrate failed:", error);
    }
  }
}

// Singleton instance
export const hapticService = new HapticService();

// Convenience exports
export const {
  selection,
  impact,
  notification,
  success,
  error,
  warning,
  scanSuccess,
  scanError,
  scanHaptics,
} = {
  selection: () => hapticService.selection(),
  impact: (intensity?: HapticIntensity) => hapticService.impact(intensity),
  notification: (type: "success" | "warning" | "error") =>
    hapticService.notification(type),
  success: () => hapticService.success(),
  error: () => hapticService.error(),
  warning: () => hapticService.warning(),
  scanSuccess: () => hapticService.scanSuccess(),
  scanError: () => hapticService.scanError(),
  scanHaptics: () => hapticService.scanSuccess(),
};

export default hapticService;
