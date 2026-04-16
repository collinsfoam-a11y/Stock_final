/**
 * Notification Service - User notifications and alerts
 * Handles in-app notifications, badges, and alerts
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import Notifications, {
  NotificationTriggerInput,
  SchedulableTriggerInputTypes,
} from "expo-notifications";
import { errorReporter } from "./errorRecovery";
import { useSettingsStore } from "../../store/settingsStore";
import {
  registerNotificationDevice,
  unregisterNotificationDevice,
} from "../api/api.notifications";

export interface NotificationOptions {
  title: string;
  body: string;
  data?: any;
  sound?: boolean;
  priority?: "default" | "high" | "max";
  badge?: number;
}

/**
 * Notification Service
 */
export class NotificationService {
  private static initialized = false;
  private static registeredPushToken: string | null = null;

  /**
   * Initialize notifications
   */
  static async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Request permissions
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        __DEV__ && console.warn("Notification permissions not granted");
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => {
          const settings = useSettingsStore.getState().settings;
          return {
            shouldPlaySound:
              settings.notificationsEnabled && settings.notificationSound,
            shouldSetBadge:
              settings.notificationsEnabled && settings.notificationBadge,
            shouldShowBanner: true,
            shouldShowList: true,
          };
        },
      });

      await this.registerPushToken();
      this.initialized = true;
    } catch (error) {
      errorReporter.report(error, "NotificationService.initialize");
    }
  }

  /**
   * Show local notification
   */
  static async showNotification(options: NotificationOptions) {
    try {
      const settings = useSettingsStore.getState().settings;
      if (!settings.notificationsEnabled) {
        return;
      }

      await this.initialize();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data,
          sound: options.sound !== false && settings.notificationSound,
          badge: settings.notificationBadge ? options.badge : undefined,
          priority: options.priority || "default",
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      errorReporter.report(error, "NotificationService.showNotification");
    }
  }

  /**
   * Schedule notification
   */
  static async scheduleNotification(
    options: NotificationOptions,
    trigger: Date | { seconds: number; repeats?: boolean },
  ): Promise<string | null> {
    try {
      const settings = useSettingsStore.getState().settings;
      if (!settings.notificationsEnabled) {
        return null;
      }

      await this.initialize();

      const triggerValue = (
        trigger instanceof Date
          ? { type: SchedulableTriggerInputTypes.DATE, date: trigger }
          : {
              type: SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: trigger.seconds,
              repeats: trigger.repeats ?? false,
            }
      ) as NotificationTriggerInput;

      return await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data,
          sound: options.sound !== false && settings.notificationSound,
        },
        trigger: triggerValue,
      });
    } catch (error) {
      errorReporter.report(error, "NotificationService.scheduleNotification");
      return null;
    }
  }

  /**
   * Cancel notification
   */
  static async cancelNotification(notificationId: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      errorReporter.report(error, "NotificationService.cancelNotification");
    }
  }

  /**
   * Cancel all notifications
   */
  static async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      errorReporter.report(error, "NotificationService.cancelAllNotifications");
    }
  }

  /**
   * Set badge count
   */
  static async setBadgeCount(count: number) {
    try {
      const settings = useSettingsStore.getState().settings;
      if (Platform.OS === "ios" && settings.notificationBadge) {
        await Notifications.setBadgeCountAsync(count);
      }
    } catch (error) {
      errorReporter.report(error, "NotificationService.setBadgeCount");
    }
  }

  /**
   * Clear badge
   */
  static async clearBadge() {
    await this.setBadgeCount(0);
  }

  static async unregisterCurrentDevice() {
    const token = this.registeredPushToken;
    if (!token || Platform.OS === "web") {
      return;
    }

    try {
      await unregisterNotificationDevice(token, Platform.OS);
    } catch (error) {
      errorReporter.report(error, "NotificationService.unregisterCurrentDevice");
    } finally {
      this.registeredPushToken = null;
    }
  }

  private static async registerPushToken() {
    if (Platform.OS === "web") {
      return;
    }

    const projectId = this.getExpoProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    if (!token || token === this.registeredPushToken) {
      return;
    }

    await registerNotificationDevice(token, Platform.OS);
    this.registeredPushToken = token;
  }

  private static getExpoProjectId(): string | null {
    const easConfig = (Constants.easConfig || {}) as { projectId?: string };
    const expoExtra = (Constants.expoConfig?.extra || {}) as {
      eas?: { projectId?: string };
      projectId?: string;
    };

    return (
      easConfig.projectId ||
      expoExtra.eas?.projectId ||
      expoExtra.projectId ||
      null
    );
  }
}

/**
 * Quick notifications
 */
export const notify = {
  success: (message: string) => {
    NotificationService.showNotification({
      title: "Success",
      body: message,
      priority: "default",
    });
  },

  error: (message: string) => {
    NotificationService.showNotification({
      title: "Error",
      body: message,
      priority: "high",
    });
  },

  info: (message: string) => {
    NotificationService.showNotification({
      title: "Info",
      body: message,
      priority: "default",
    });
  },

  warning: (message: string) => {
    NotificationService.showNotification({
      title: "Warning",
      body: message,
      priority: "default",
    });
  },

  syncComplete: (success: number, failed: number) => {
    NotificationService.showNotification({
      title: "Sync Complete",
      body: `Synced ${success} items${failed > 0 ? `, ${failed} failed` : ""}`,
      priority: "default",
    });
  },
};
