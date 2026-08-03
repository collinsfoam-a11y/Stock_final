import { Platform } from "react-native";

import { mmkvStorage } from "./mmkvStorage";
import {
  getUserPreferenceScope,
} from "./userPreferenceScope";
import type { NotificationTriggerInput } from "expo-notifications";

const BACKUP_REMINDER_ID_KEY = "backup_reminder_notification_id";
const IS_TEST_ENV =
  process.env.NODE_ENV === "test" || typeof process.env.JEST_WORKER_ID !== "undefined";
type BackupFrequency = "daily" | "weekly" | "monthly" | "never";
type BackupReminderSettings = {
  backupFrequency: BackupFrequency;
  notificationsEnabled: boolean;
  notificationSound: boolean;
};

const INTERVAL_SECONDS: Record<
  BackupFrequency,
  number | null
> = {
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
  never: null,
};

let lastSignature: string | null = null;
let notificationsModulePromise:
  | Promise<typeof import("expo-notifications")>
  | null = null;

const getNotificationsModule = async () => {
  if (!notificationsModulePromise) {
    notificationsModulePromise = IS_TEST_ENV
      ? Promise.resolve(
          // Jest `doMock` setups need synchronous resolution after mocks are registered.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("expo-notifications") as typeof import("expo-notifications"),
        )
      : import("expo-notifications");
  }
  return notificationsModulePromise;
};

const clearStoredReminder = async (): Promise<void> => {
  const reminderId = mmkvStorage.getItem(BACKUP_REMINDER_ID_KEY);
  if (reminderId) {
    const Notifications = await getNotificationsModule();
    await Notifications.cancelScheduledNotificationAsync(reminderId);
    mmkvStorage.removeItem(BACKUP_REMINDER_ID_KEY);
  }
};

export async function syncBackupReminderPreference(
  settings: BackupReminderSettings,
): Promise<void> {
  const scope = getUserPreferenceScope();
  const signature = scope
    ? [
        scope,
        settings.backupFrequency,
        settings.notificationsEnabled ? "notifications-on" : "notifications-off",
        settings.notificationSound ? "sound-on" : "sound-off",
      ].join(":")
    : "no-scope";

  if (signature === lastSignature) {
    return;
  }
  lastSignature = signature;

  await clearStoredReminder();

  if (
    Platform.OS === "web" ||
    !scope ||
    !settings.notificationsEnabled ||
    settings.backupFrequency === "never"
  ) {
    return;
  }

  const seconds = INTERVAL_SECONDS[settings.backupFrequency];
  if (!seconds) {
    return;
  }

  const Notifications = await getNotificationsModule();
  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds,
    repeats: true,
  } as NotificationTriggerInput;
  const reminderId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Backup reminder",
      body: "Create a fresh backup for your Stock Verify data.",
      data: { type: "backup_reminder", scope },
      sound: settings.notificationSound,
    },
    trigger,
  });

  if (reminderId) {
    mmkvStorage.setItem(BACKUP_REMINDER_ID_KEY, reminderId);
  }
}
