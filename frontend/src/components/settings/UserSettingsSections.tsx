import React, { useCallback, useMemo } from "react";
import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";

import { useAppVersion } from "../../hooks/useAppVersion";
import { useVersionCheck } from "../../hooks/useVersionCheck";
import { useUiTokens } from "../../hooks/useUiTokens";
import { useAuthStore } from "../../store/authStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { Settings } from "../../store/settingsStore";
import { colorWithAlpha } from "../../theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import { resolveAppUpdateUrl } from "../../services/updateService";
import ModernCard from "../ui/ModernCard";
import {
  SettingsActionRow as SettingRow,
  SettingsSectionDivider as SectionDivider,
} from "./SettingsScreenPrimitives";

type Option<T> = {
  label: string;
  value: T;
};

const SYNC_INTERVAL_OPTIONS: Option<number>[] = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
];

const CACHE_EXPIRATION_OPTIONS: Option<number>[] = [
  { label: "6 hrs", value: 6 },
  { label: "12 hrs", value: 12 },
  { label: "24 hrs", value: 24 },
  { label: "48 hrs", value: 48 },
  { label: "72 hrs", value: 72 },
];

const MAX_QUEUE_OPTIONS: Option<number>[] = [
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "2500", value: 2500 },
  { label: "5000", value: 5000 },
];

const SCANNER_TIMEOUT_OPTIONS: Option<number>[] = [
  { label: "15 sec", value: 15 },
  { label: "30 sec", value: 30 },
  { label: "45 sec", value: 45 },
  { label: "60 sec", value: 60 },
];

const SESSION_TIMEOUT_OPTIONS: Option<number>[] = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
  { label: "120 min", value: 120 },
];

const EXPORT_FORMAT_OPTIONS: Option<Settings["exportFormat"]>[] = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" },
];

const BACKUP_FREQUENCY_OPTIONS: Option<Settings["backupFrequency"]>[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Never", value: "never" },
];

const MODE_OPTIONS: Option<Settings["operationalMode"]>[] = [
  { label: "Routine", value: "routine" },
];

const DEBOUNCE_DELAY_OPTIONS: Option<number>[] = [
  { label: "Off", value: 0 },
  { label: "150 ms", value: 150 },
  { label: "300 ms", value: 300 },
  { label: "500 ms", value: 500 },
  { label: "800 ms", value: 800 },
];

const Section = ({
  title,
  children,
  syncState,
}: {
  title: string;
  children: React.ReactNode;
  syncState: "saved" | "syncing" | "issue";
}) => {
  const uiTokens = useUiTokens();
  const syncBadge =
    syncState === "issue"
      ? {
          label: "Sync issue",
          color: uiTokens.colors.warning,
          background: colorWithAlpha(uiTokens.colors.warning, 0.15),
          border: colorWithAlpha(uiTokens.colors.warning, 0.3),
        }
      : syncState === "syncing"
        ? {
            label: "Saving",
            color: uiTokens.colors.accent,
            background: colorWithAlpha(uiTokens.colors.accent, 0.15),
            border: colorWithAlpha(uiTokens.colors.accent, 0.3),
          }
        : {
            label: "Saved",
            color: uiTokens.colors.success,
            background: colorWithAlpha(uiTokens.colors.success, 0.15),
            border: colorWithAlpha(uiTokens.colors.success, 0.3),
          };

  return (
    <View style={{ gap: uiTokens.spacing.sm }}>
      <View style={styles.sectionTitleRow}>
        <Text
          style={{
            color: uiTokens.colors.textSecondary,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0,
            marginLeft: 2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </Text>
        <View
          style={[
            styles.sectionStatusBadge,
            {
              borderColor: syncBadge.border,
              borderRadius: uiTokens.radius.full,
              backgroundColor: syncBadge.background,
            },
          ]}
        >
          <Text
            style={[
              styles.sectionStatusText,
              {
                color: syncBadge.color,
                fontSize: 12,
              },
            ]}
          >
            {syncBadge.label}
          </Text>
        </View>
      </View>
      <ModernCard
        accessible={false}
        variant="outlined"
        elevation="none"
        padding={0}
        style={styles.card}
      >
        {children}
      </ModernCard>
    </View>
  );
};

const cycleOption = <T,>(options: Option<T>[], currentValue: T): T => {
  const currentIndex = options.findIndex((option) => option.value === currentValue);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
  return options[nextIndex]?.value ?? options[0]!.value;
};

const openExternalUrl = async (url: string): Promise<boolean> => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};

export function UserSettingsSections() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const { getPinForBiometrics, clearPinForBiometrics } = useAuthStore();
  const { settings, setSetting, isSyncing, hasPendingSync, lastSyncError } = useSettingsStore();
  const spacing = uiTokens.spacing;
  const { version, buildVersion } = useAppVersion();
  const { versionInfo, isChecking, checkForUpdates, dismissUpdate, isDismissed } = useVersionCheck({
    checkOnMount: false,
  });

  const latestVersionLabel = versionInfo?.current_version
    ? `v${versionInfo.current_version}`
    : "Not checked";
  const currentVersionLabel = `v${version} (${buildVersion})`;
  const updateUrl = resolveAppUpdateUrl(versionInfo);

  const handleUpdateNow = useCallback(async (url?: string | null) => {
    if (!url) {
      Alert.alert(
        "Update Link Missing",
        "No update download link is configured yet. Please contact your administrator."
      );
      return;
    }

    const opened = await openExternalUrl(url);
    if (!opened) {
      Alert.alert("Unable to Open Link", "Could not open the update link on this device.");
    }
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    const result = await checkForUpdates();
    if (!result || result.error) {
      Alert.alert(
        "Update Check Failed",
        "Unable to check for updates right now. Please try again shortly."
      );
      return;
    }

    const targetUrl = resolveAppUpdateUrl(result);
    if (result.force_update || result.update_available) {
      const latest = result.current_version || "latest";
      const title = result.force_update ? "Update Required" : "Update Available";
      const message = result.force_update
        ? `This app version is no longer supported. Please update to v${latest} to continue.`
        : `A newer version (v${latest}) is available.`;

      const updateAction = () => {
        void handleUpdateNow(targetUrl);
      };

      if (result.force_update) {
        Alert.alert(title, message, [{ text: "Update Now", onPress: updateAction }], {
          cancelable: false,
        });
      } else {
        Alert.alert(title, message, [
          {
            text: "Later",
            style: "cancel",
            onPress: dismissUpdate,
          },
          { text: "Update Now", onPress: updateAction },
        ]);
      }
      return;
    }

    Alert.alert("App is Up to Date", `You are using the latest version (v${version}).`);
  }, [checkForUpdates, dismissUpdate, handleUpdateNow, version]);

  const handleBiometricToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        await clearPinForBiometrics();
        setSetting("biometricAuth", false);
        return;
      }

      if (Platform.OS === "web") {
        Alert.alert(
          "Biometric Login Unavailable",
          "Biometric login is only available on mobile devices."
        );
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          "Biometric Login Unavailable",
          "Set up Face ID or Touch ID on this device before enabling biometric login."
        );
        return;
      }

      const storedPin = await getPinForBiometrics();
      if (!storedPin) {
        Alert.alert(
          "PIN Required",
          "Open Security & PIN to verify your 4-digit PIN before enabling biometric login.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Security", onPress: () => router.push("/security" as any) },
          ]
        );
        return;
      }

      setSetting("biometricAuth", true);
    },
    [clearPinForBiometrics, getPinForBiometrics, router, setSetting]
  );

  const labels = useMemo(
    () => ({
      autoSyncInterval:
        SYNC_INTERVAL_OPTIONS.find((option) => option.value === settings.autoSyncInterval)?.label ??
        `${settings.autoSyncInterval} min`,
      cacheExpiration:
        CACHE_EXPIRATION_OPTIONS.find((option) => option.value === settings.cacheExpiration)
          ?.label ?? `${settings.cacheExpiration} hrs`,
      maxQueueSize:
        MAX_QUEUE_OPTIONS.find((option) => option.value === settings.maxQueueSize)?.label ??
        String(settings.maxQueueSize),
      scannerTimeout:
        SCANNER_TIMEOUT_OPTIONS.find((option) => option.value === settings.scannerTimeout)?.label ??
        `${settings.scannerTimeout} sec`,
      exportFormat:
        EXPORT_FORMAT_OPTIONS.find((option) => option.value === settings.exportFormat)?.label ??
        settings.exportFormat.toUpperCase(),
      backupFrequency:
        BACKUP_FREQUENCY_OPTIONS.find((option) => option.value === settings.backupFrequency)
          ?.label ?? settings.backupFrequency,
      sessionTimeout:
        SESSION_TIMEOUT_OPTIONS.find((option) => option.value === settings.sessionTimeout)?.label ??
        `${settings.sessionTimeout} min`,
      operationalMode:
        MODE_OPTIONS.find((option) => option.value === settings.operationalMode)?.label ??
        settings.operationalMode,
      debounceDelay:
        DEBOUNCE_DELAY_OPTIONS.find((option) => option.value === settings.debounceDelay)?.label ??
        `${settings.debounceDelay} ms`,
    }),
    [settings]
  );

  const sectionSyncState: "saved" | "syncing" | "issue" = lastSyncError
    ? "issue"
    : isSyncing || hasPendingSync
      ? "syncing"
      : "saved";

  return (
    <View style={{ gap: spacing.lg }}>
      <Section title="Notifications" syncState={sectionSyncState}>
        <SettingRow
          icon="notifications-outline"
          label="Notifications"
          description="Enable in-app alerting and reminders"
          type="switch"
          value={settings.notificationsEnabled}
          onToggle={(value) => setSetting("notificationsEnabled", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="volume-high-outline"
          label="Notification Sound"
          description="Play an audible alert for notifications"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationSound}
          onToggle={(value) => setSetting("notificationSound", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="radio-button-on-outline"
          label="Notification Badge"
          description="Show unread state in the app interface"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationBadge}
          onToggle={(value) => setSetting("notificationBadge", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="repeat-outline"
          label="Recount Alerts"
          description="Notify staff and supervisors about recount assignments and results"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationRecountAlerts}
          onToggle={(value) => setSetting("notificationRecountAlerts", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="checkmark-done-outline"
          label="Approval Alerts"
          description="Notify operators when counts are approved, rejected, or need review"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationApprovalAlerts}
          onToggle={(value) => setSetting("notificationApprovalAlerts", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="cloud-offline-outline"
          label="Sync Failure Alerts"
          description="Notify when queued work cannot sync and needs recovery"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationSyncFailureAlerts}
          onToggle={(value) => setSetting("notificationSyncFailureAlerts", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="timer-outline"
          label="Session Reminders"
          description="Notify during long counting sessions and pending handoff work"
          type="switch"
          disabled={!settings.notificationsEnabled}
          value={settings.notificationSessionReminderAlerts}
          onToggle={(value) => setSetting("notificationSessionReminderAlerts", value)}
        />
      </Section>

      <Section title="Sync & Offline" syncState={sectionSyncState}>
        <SettingRow
          icon="sync-outline"
          label="Auto Sync"
          description="Keep data fresh in the background"
          type="switch"
          value={settings.autoSyncEnabled}
          onToggle={(value) => setSetting("autoSyncEnabled", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="time-outline"
          label="Sync Interval"
          description="How often background sync runs"
          type="select"
          disabled={!settings.autoSyncEnabled}
          valueLabel={labels.autoSyncInterval}
          onPress={() =>
            setSetting(
              "autoSyncInterval",
              cycleOption(SYNC_INTERVAL_OPTIONS, settings.autoSyncInterval)
            )
          }
        />
        <SectionDivider />
        <SettingRow
          icon="wifi-outline"
          label="Sync on Reconnect"
          description="Resume queued sync after network recovery"
          type="switch"
          disabled={!settings.autoSyncEnabled}
          value={settings.syncOnReconnect}
          onToggle={(value) => setSetting("syncOnReconnect", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="cloud-offline-outline"
          label="Offline Mode"
          description="Favor local-first behavior when working"
          type="switch"
          value={settings.offlineMode}
          onToggle={(value) => setSetting("offlineMode", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="timer-outline"
          label="Cache Expiration"
          description="How long local data stays valid"
          type="select"
          valueLabel={labels.cacheExpiration}
          onPress={() =>
            setSetting(
              "cacheExpiration",
              cycleOption(CACHE_EXPIRATION_OPTIONS, settings.cacheExpiration)
            )
          }
        />
        <SectionDivider />
        <SettingRow
          icon="albums-outline"
          label="Offline Queue Size"
          description="Maximum pending actions kept offline"
          type="select"
          valueLabel={labels.maxQueueSize}
          onPress={() =>
            setSetting("maxQueueSize", cycleOption(MAX_QUEUE_OPTIONS, settings.maxQueueSize))
          }
        />
      </Section>

      <Section title="Scanner" syncState={sectionSyncState}>
        <SettingRow
          icon="pulse-outline"
          label="Vibration Feedback"
          description="Haptic confirmation during scan flows"
          type="switch"
          value={settings.scannerVibration}
          onToggle={(value) => setSetting("scannerVibration", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="musical-notes-outline"
          label="Scanner Sound"
          description="Audible feedback for scan results"
          type="switch"
          value={settings.scannerSound}
          onToggle={(value) => setSetting("scannerSound", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="flash-outline"
          label="Auto Submit"
          description="Submit the scan result automatically when possible"
          type="switch"
          value={settings.scannerAutoSubmit}
          onToggle={(value) => setSetting("scannerAutoSubmit", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="hourglass-outline"
          label="Scanner Timeout"
          description="Close inactive scanner sessions automatically"
          type="select"
          valueLabel={labels.scannerTimeout}
          onPress={() =>
            setSetting(
              "scannerTimeout",
              cycleOption(SCANNER_TIMEOUT_OPTIONS, settings.scannerTimeout)
            )
          }
        />
      </Section>

      <Section title="Inventory View" syncState={sectionSyncState}>
        <SettingRow
          icon="image-outline"
          label="Show Item Images"
          description="Display product imagery in item summaries"
          type="switch"
          value={settings.showItemImages}
          onToggle={(value) => setSetting("showItemImages", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="pricetag-outline"
          label="Show Prices"
          description="Display MRP and sale price fields"
          type="switch"
          value={settings.showItemPrices}
          onToggle={(value) => setSetting("showItemPrices", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="cube-outline"
          label="Show Stock Levels"
          description="Display stock values in item summaries"
          type="switch"
          value={settings.showItemStock}
          onToggle={(value) => setSetting("showItemStock", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="calendar-outline"
          label="Show MFG Date"
          description="Expose manufacturing date fields in item detail"
          type="switch"
          value={settings.columnVisibility.mfgDate}
          onToggle={(value) =>
            setSetting("columnVisibility", {
              ...settings.columnVisibility,
              mfgDate: value,
            })
          }
        />
        <SectionDivider />
        <SettingRow
          icon="calendar-clear-outline"
          label="Show Expiry Date"
          description="Expose expiry date fields in item detail"
          type="switch"
          value={settings.columnVisibility.expiryDate}
          onToggle={(value) =>
            setSetting("columnVisibility", {
              ...settings.columnVisibility,
              expiryDate: value,
            })
          }
        />
        <SectionDivider />
        <SettingRow
          icon="barcode-outline"
          label="Show Serial Number"
          description="Expose serial entry fields in item detail"
          type="switch"
          value={settings.columnVisibility.serialNumber}
          onToggle={(value) =>
            setSetting("columnVisibility", {
              ...settings.columnVisibility,
              serialNumber: value,
            })
          }
        />
        <SectionDivider />
        <SettingRow
          icon="cash-outline"
          label="Show MRP Field"
          description="Expose editable MRP controls in item detail"
          type="switch"
          value={settings.columnVisibility.mrp}
          onToggle={(value) =>
            setSetting("columnVisibility", {
              ...settings.columnVisibility,
              mrp: value,
            })
          }
        />
      </Section>

      <Section title="Data Preferences" syncState={sectionSyncState}>
        <SettingRow
          icon="download-outline"
          label="Export Format"
          description="Preferred file format for exports"
          type="select"
          valueLabel={labels.exportFormat}
          onPress={() =>
            setSetting("exportFormat", cycleOption(EXPORT_FORMAT_OPTIONS, settings.exportFormat))
          }
        />
        <SectionDivider />
        <SettingRow
          icon="archive-outline"
          label="Backup Frequency"
          description="How often backup reminders should appear"
          type="select"
          valueLabel={labels.backupFrequency}
          onPress={() =>
            setSetting(
              "backupFrequency",
              cycleOption(BACKUP_FREQUENCY_OPTIONS, settings.backupFrequency)
            )
          }
        />
      </Section>

      <Section title="App Updates" syncState={sectionSyncState}>
        <SettingRow
          icon="phone-portrait-outline"
          label="Current Version"
          description="Installed app version on this device"
          type="select"
          disabled
          valueLabel={currentVersionLabel}
        />
        <SectionDivider />
        <SettingRow
          icon="cloud-download-outline"
          label="Latest Version"
          description="Latest version reported by the server"
          type="select"
          disabled
          valueLabel={latestVersionLabel}
        />
        <SectionDivider />
        <SettingRow
          icon="refresh-outline"
          label="Check for Updates"
          description="Look for a newer app version now"
          type="select"
          disabled={isChecking}
          valueLabel={isChecking ? "Checking..." : "Tap to check"}
          onPress={() => {
            void handleCheckForUpdates();
          }}
        />
        {versionInfo?.update_available && isDismissed && (
          <>
            <SectionDivider />
            <SettingRow
              icon="notifications-off-outline"
              label="Update Reminder"
              description="Optional update reminders are paused until a newer version is reported"
              type="select"
              disabled
              valueLabel="Dismissed"
            />
          </>
        )}
        {versionInfo?.update_available && !isDismissed && (
          <>
            <SectionDivider />
            <SettingRow
              icon="download-outline"
              label="Update Now"
              description={
                updateUrl ? "Open the latest app download link" : "Update link not configured"
              }
              type="select"
              disabled={!updateUrl}
              valueLabel={updateUrl ? "Open link" : "Link missing"}
              onPress={() => {
                void handleUpdateNow(updateUrl);
              }}
            />
          </>
        )}
      </Section>

      <Section title="Access & Workflow" syncState={sectionSyncState}>
        <SettingRow
          icon="lock-closed-outline"
          label="Require Sign-In"
          description="Protect the app when reopening it"
          type="switch"
          value={settings.requireAuth}
          onToggle={(value) => setSetting("requireAuth", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="timer-outline"
          label="Session Timeout"
          description="Auto-lock the app after inactivity"
          type="select"
          disabled={!settings.requireAuth}
          valueLabel={labels.sessionTimeout}
          onPress={() =>
            setSetting(
              "sessionTimeout",
              cycleOption(SESSION_TIMEOUT_OPTIONS, settings.sessionTimeout)
            )
          }
        />
        <SectionDivider />
        <SettingRow
          icon="finger-print-outline"
          label="Biometric Login"
          description="Offer fingerprint or face unlock when supported"
          type="switch"
          value={settings.biometricAuth}
          onToggle={(value) => {
            void handleBiometricToggle(value);
          }}
        />
        <SectionDivider />
        <SettingRow
          icon="construct-outline"
          label="Operational Mode"
          description="Routine mode is the only supported workflow profile in this build"
          type="select"
          disabled
          valueLabel={labels.operationalMode}
        />
      </Section>

      <Section title="Performance" syncState={sectionSyncState}>
        <SettingRow
          icon="images-outline"
          label="Image Cache"
          description="Reuse downloaded images to reduce network requests"
          type="switch"
          value={settings.imageCache}
          onToggle={(value) => setSetting("imageCache", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="list-outline"
          label="Lazy Loading"
          description="Defer heavy list rendering until needed"
          type="switch"
          value={settings.lazyLoading}
          onToggle={(value) => setSetting("lazyLoading", value)}
        />
        <SectionDivider />
        <SettingRow
          icon="speedometer-outline"
          label="Debounce Delay"
          description="Delay bursty input processing to reduce churn"
          type="select"
          valueLabel={labels.debounceDelay}
          onPress={() =>
            setSetting("debounceDelay", cycleOption(DEBOUNCE_DELAY_OPTIONS, settings.debounceDelay))
          }
        />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: gap.sm,
  },
  sectionStatusBadge: {
    borderWidth: 1,
    paddingHorizontal: gap.sm,
    paddingVertical: gap.xs,
  },
  sectionStatusText: {
    fontWeight: "700",
    letterSpacing: 0,
  },
});

export default UserSettingsSections;
