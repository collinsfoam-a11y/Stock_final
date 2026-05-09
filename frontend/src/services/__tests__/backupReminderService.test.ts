describe("backupReminderService", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("schedules a repeating reminder for the active user scope", async () => {
    const storage = new Map<string, string>();
    const scheduleNotificationAsync = jest.fn(async () => "notif-1");
    const cancelScheduledNotificationAsync = jest.fn(async () => undefined);

    jest.doMock("../mmkvStorage", () => ({
      __esModule: true,
      mmkvStorage: {
        getItem: jest.fn((key: string) => storage.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          storage.delete(key);
        }),
      },
    }));

    jest.doMock("../userPreferenceScope", () => ({
      __esModule: true,
      getUserPreferenceScope: jest.fn(() => "user-1"),
    }));

    jest.doMock("expo-notifications", () => ({
      __esModule: true,
      SchedulableTriggerInputTypes: {
        TIME_INTERVAL: "timeInterval",
      },
      scheduleNotificationAsync,
      cancelScheduledNotificationAsync,
    }));

    let syncBackupReminderPreference!: typeof import("../backupReminderService").syncBackupReminderPreference;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ syncBackupReminderPreference } = require("../backupReminderService"));
    });

    await syncBackupReminderPreference({
      backupFrequency: "weekly",
      notificationsEnabled: true,
      notificationSound: true,
    });

    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Backup reminder",
          sound: true,
          data: { type: "backup_reminder", scope: "user-1" },
        }),
        trigger: expect.objectContaining({
          type: "timeInterval",
          seconds: 604800,
          repeats: true,
        }),
      }),
    );
    expect(storage.get("backup_reminder_notification_id")).toBe("notif-1");
  });

  it("cancels an existing reminder and skips scheduling when reminders are disabled", async () => {
    const storage = new Map<string, string>([
      ["backup_reminder_notification_id", "notif-old"],
    ]);
    const scheduleNotificationAsync = jest.fn(async () => "notif-new");
    const cancelScheduledNotificationAsync = jest.fn(async () => undefined);

    jest.doMock("../mmkvStorage", () => ({
      __esModule: true,
      mmkvStorage: {
        getItem: jest.fn((key: string) => storage.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          storage.delete(key);
        }),
      },
    }));

    jest.doMock("../userPreferenceScope", () => ({
      __esModule: true,
      getUserPreferenceScope: jest.fn(() => null),
    }));

    jest.doMock("expo-notifications", () => ({
      __esModule: true,
      SchedulableTriggerInputTypes: {
        TIME_INTERVAL: "timeInterval",
      },
      scheduleNotificationAsync,
      cancelScheduledNotificationAsync,
    }));

    let syncBackupReminderPreference!: typeof import("../backupReminderService").syncBackupReminderPreference;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ syncBackupReminderPreference } = require("../backupReminderService"));
    });

    await syncBackupReminderPreference({
      backupFrequency: "never",
      notificationsEnabled: true,
      notificationSound: false,
    });

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-old");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(storage.get("backup_reminder_notification_id")).toBeUndefined();
  });
});
