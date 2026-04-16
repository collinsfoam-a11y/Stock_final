import { Platform } from "react-native";

import type { Settings } from "../store/settingsStore";
import { mmkvStorage } from "./mmkvStorage";
import {
  getUserPreferenceScope,
} from "./userPreferenceScope";
import { NotificationService } from "./utils/notificationService";

const BACKUP_REMINDER_ID_KEY = "backup_reminder_notification_id";

const INTERVAL_SECONDS: Record<
  Settings["backupFrequency"],
  number | null
> = {
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
  never: null,
};

let lastSignature: string | null = null;

const clearStoredReminder = async (): Promise<void> => {
  const reminderId = mmkvStorage.getItem(BACKUP_REMINDER_ID_KEY);
  if (reminderId) {
    await NotificationService.cancelNotification(reminderId);
    mmkvStorage.removeItem(BACKUP_REMINDER_ID_KEY);
  }
};

export async function syncBackupReminderPreference(
  settings: Pick<
    Settings,
    "backupFrequency" | "notificationsEnabled" | "notificationSound"
  >,
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

  const reminderId = await NotificationService.scheduleNotification(
    {
      title: "Backup reminder",
      body: "Create a fresh backup for your Stock Verify data.",
      data: { type: "backup_reminder", scope },
      sound: settings.notificationSound,
      priority: "default",
    },
    { seconds, repeats: true },
  );

  if (reminderId) {
    mmkvStorage.setItem(BACKUP_REMINDER_ID_KEY, reminderId);
  }
}
