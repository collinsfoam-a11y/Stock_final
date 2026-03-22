import React, { useCallback, useMemo } from "react";
import { Alert, Linking, Platform, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../hooks/useTheme";
import { useAppVersion } from "../../hooks/useAppVersion";
import { useVersionCheck } from "../../hooks/useVersionCheck";
import { useSettingsStore } from "../../store/settingsStore";
import type { Settings } from "../../store/settingsStore";
import { resolveAppUpdateUrl } from "../../services/updateService";
import { GlassCard } from "../ui/GlassCard";
import { AnimatedPressable } from "../ui/AnimatedPressable";

type Option<T> = {
  label: string;
  value: T;
};

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  value?: boolean;
  valueLabel?: string;
  disabled?: boolean;
  type: "switch" | "select";
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
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

const triggerSelection = () => {
  if (Platform.OS !== "web") {
    Haptics.selectionAsync();
  }
};

const triggerToggle = () => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

function SettingRow({
  icon,
  label,
  description,
  value,
  valueLabel,
  disabled = false,
  type,
  onToggle,
  onPress,
}: SettingRowProps) {
  const { colors, spacing, typography, borderRadius } = useTheme();

  const content = (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowLeft}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: colors.overlayPrimary,
              borderRadius: borderRadius.md,
              marginRight: spacing.sm,
            },
          ]}
        >
          <Ionicons name={icon} size={18} color={colors.accent || colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text
            style={[
              styles.label,
              {
                color: colors.text,
                fontSize: typography.fontSize.md,
              },
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.description,
              {
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
              },
            ]}
          >
            {description}
          </Text>
        </View>
      </View>

      {type === "switch" ? (
        <Switch
          value={Boolean(value)}
          onValueChange={(nextValue) => {
            triggerToggle();
            onToggle?.(nextValue);
          }}
          disabled={disabled}
          trackColor={{
            false: colors.border,
            true: colors.accent || colors.primary,
          }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.border}
        />
      ) : (
        <View style={styles.selectValueWrap}>
          <Text
            style={[
              styles.selectValue,
              {
                color: disabled ? colors.textTertiary : colors.textSecondary,
                fontSize: typography.fontSize.sm,
              },
            ]}
          >
            {valueLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={disabled ? colors.textTertiary : colors.textSecondary}
          />
        </View>
      )}
    </View>
  );

  if (type === "switch") {
    return content;
  }

  return (
    <AnimatedPressable
      style={styles.pressableRow}
      disabled={disabled}
      onPress={() => {
        triggerSelection();
        onPress?.();
      }}
    >
      {content}
    </AnimatedPressable>
  );
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.xs,
          fontWeight: "700",
          letterSpacing: 1,
          marginLeft: 2,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      <GlassCard variant="medium" padding={0} tint="default" style={styles.card}>
        {children}
      </GlassCard>
    </View>
  );
};

const SectionDivider = () => {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />;
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
  const { settings, setSetting } = useSettingsStore();
  const spacing = useTheme().spacing;
  const { version, buildVersion } = useAppVersion();
  const { versionInfo, isChecking, checkForUpdates, dismissUpdate, isDismissed } =
    useVersionCheck({
      checkOnMount: false,
    });

  const latestVersionLabel = versionInfo?.current_version
    ? `v${versionInfo.current_version}`
    : "Not checked";
  const currentVersionLabel = `v${version} (${buildVersion})`;
  const updateUrl = resolveAppUpdateUrl(versionInfo);

  const handleUpdateNow = useCallback(
    async (url?: string | null) => {
      if (!url) {
        Alert.alert(
          "Update Link Missing",
          "No update download link is configured yet. Please contact your administrator.",
        );
        return;
      }

      const opened = await openExternalUrl(url);
      if (!opened) {
        Alert.alert(
          "Unable to Open Link",
          "Could not open the update link on this device.",
        );
      }
    },
    [],
  );

  const handleCheckForUpdates = useCallback(async () => {
    const result = await checkForUpdates();
    if (!result || result.error) {
      Alert.alert(
        "Update Check Failed",
        "Unable to check for updates right now. Please try again shortly.",
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

  const labels = useMemo(
    () => ({
      autoSyncInterval:
        SYNC_INTERVAL_OPTIONS.find((option) => option.value === settings.autoSyncInterval)
          ?.label ?? `${settings.autoSyncInterval} min`,
      cacheExpiration:
        CACHE_EXPIRATION_OPTIONS.find(
          (option) => option.value === settings.cacheExpiration,
        )?.label ?? `${settings.cacheExpiration} hrs`,
      maxQueueSize:
        MAX_QUEUE_OPTIONS.find((option) => option.value === settings.maxQueueSize)?.label ??
        String(settings.maxQueueSize),
      scannerTimeout:
        SCANNER_TIMEOUT_OPTIONS.find(
          (option) => option.value === settings.scannerTimeout,
        )?.label ?? `${settings.scannerTimeout} sec`,
      exportFormat:
        EXPORT_FORMAT_OPTIONS.find((option) => option.value === settings.exportFormat)?.label ??
        settings.exportFormat.toUpperCase(),
      backupFrequency:
        BACKUP_FREQUENCY_OPTIONS.find(
          (option) => option.value === settings.backupFrequency,
        )?.label ?? settings.backupFrequency,
      sessionTimeout:
        SESSION_TIMEOUT_OPTIONS.find(
          (option) => option.value === settings.sessionTimeout,
        )?.label ?? `${settings.sessionTimeout} min`,
      operationalMode:
        MODE_OPTIONS.find((option) => option.value === settings.operationalMode)?.label ??
        settings.operationalMode,
      debounceDelay:
        DEBOUNCE_DELAY_OPTIONS.find(
          (option) => option.value === settings.debounceDelay,
        )?.label ?? `${settings.debounceDelay} ms`,
    }),
    [settings],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <Section title="Notifications">
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
      </Section>

      <Section title="Sync & Offline">
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
              cycleOption(SYNC_INTERVAL_OPTIONS, settings.autoSyncInterval),
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
              cycleOption(CACHE_EXPIRATION_OPTIONS, settings.cacheExpiration),
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
            setSetting(
              "maxQueueSize",
              cycleOption(MAX_QUEUE_OPTIONS, settings.maxQueueSize),
            )
          }
        />
      </Section>

      <Section title="Scanner">
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
              cycleOption(SCANNER_TIMEOUT_OPTIONS, settings.scannerTimeout),
            )
          }
        />
      </Section>

      <Section title="Inventory View">
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

      <Section title="Data Preferences">
        <SettingRow
          icon="download-outline"
          label="Export Format"
          description="Preferred file format for exports"
          type="select"
          valueLabel={labels.exportFormat}
          onPress={() =>
            setSetting(
              "exportFormat",
              cycleOption(EXPORT_FORMAT_OPTIONS, settings.exportFormat),
            )
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
              cycleOption(BACKUP_FREQUENCY_OPTIONS, settings.backupFrequency),
            )
          }
        />
      </Section>

      <Section title="App Updates">
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
                updateUrl
                  ? "Open the latest app download link"
                  : "Update link not configured"
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

      <Section title="Access & Workflow">
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
              cycleOption(SESSION_TIMEOUT_OPTIONS, settings.sessionTimeout),
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
          onToggle={(value) => setSetting("biometricAuth", value)}
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

      <Section title="Performance">
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
            setSetting(
              "debounceDelay",
              cycleOption(DEBOUNCE_DELAY_OPTIONS, settings.debounceDelay),
            )
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
  pressableRow: {
    width: "100%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingRight: 12,
  },
  iconWrap: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontWeight: "600",
  },
  description: {
    lineHeight: 18,
  },
  selectValueWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  selectValue: {
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});

export default UserSettingsSections;
