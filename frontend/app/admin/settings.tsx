import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";

import { usePermission } from "../../src/hooks/usePermission";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import {
  SettingsActionRow,
  SettingsActionSection,
  SettingsSectionDivider,
  SettingsSectionHeading,
  SettingsSyncStatus,
  SettingsTextInputRow,
  UserSettingsSections,
} from "../../src/components/settings";
import { ScreenContainer } from "../../src/components/ui";
import ModernCard from "../../src/components/ui/ModernCard";
import { getSystemSettings, updateSystemSettings } from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { spacing, touchTargets } from "@/theme/legacyCompat";
import { colorWithAlpha } from "../../src/theme/themeTokens";
import { safeBackNavigation } from "@/utils/navigation";

type SystemSettings = Record<string, unknown>;
type SettingsIcon = React.ComponentProps<typeof SettingsTextInputRow>["icon"];
const TOUCH_HIT_SLOP = { top: spacing.sm, right: spacing.sm, bottom: spacing.sm, left: spacing.sm };

const getReadableError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "System settings request failed without a readable error message.";
};

export default function MasterSettingsScreen() {
  const router = useRouter();
  const { hasRole } = usePermission();
  const uiTokens = useUiTokens();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const loadSettings = useCallback(async () => {
    if (offlineMode) {
      setSettings(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await getSystemSettings();
      if (response.success) {
        setSettings(response.data ?? {});
      } else {
        Alert.alert("Settings Error", "Failed to load system settings.");
      }
    } catch (error: unknown) {
      Alert.alert("Settings Error", getReadableError(error));
    } finally {
      setLoading(false);
    }
  }, [offlineMode]);

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "You do not have permission to view master settings.", [
        {
          text: "OK",
          onPress: () => safeBackNavigation(router, { userRole: "admin" }),
        },
      ]);
      return;
    }
    void loadSettings();
  }, [hasRole, loadSettings, router]);

  const handleSave = useCallback(async () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "System settings require a live connection to save.");
      return;
    }

    if (!settings) {
      Alert.alert("Settings Not Loaded", "Load system settings before saving changes.");
      return;
    }

    try {
      setSaving(true);
      const response = await updateSystemSettings(settings);
      if (response.success) {
        Alert.alert("Settings Saved", "System settings updated successfully.");
        if (response.note) {
          Alert.alert("Settings Note", response.note);
        }
      } else {
        Alert.alert("Save Failed", "Failed to update system settings.");
      }
    } catch (error: unknown) {
      Alert.alert("Save Failed", getReadableError(error));
    } finally {
      setSaving(false);
    }
  }, [offlineMode, settings]);

  const updateSetting = useCallback((key: string, value: unknown) => {
    setSettings((prev) => ({
      ...(prev ?? {}),
      [key]: value,
    }));
  }, []);

  const renderSystemInput = (
    icon: SettingsIcon,
    label: string,
    key: string,
    keyboardType: "default" | "numeric" = "default",
    description?: string
  ) => (
    <SettingsTextInputRow
      icon={icon}
      label={label}
      description={description}
      keyboardType={keyboardType}
      value={settings?.[key]?.toString() ?? ""}
      onChangeText={(text) => {
        const value = keyboardType === "numeric" ? Number.parseInt(text, 10) || 0 : text;
        updateSetting(key, value);
      }}
      testID={`system-setting-${key}`}
    />
  );

  const renderSystemSwitch = (
    icon: SettingsIcon,
    label: string,
    key: string,
    description?: string
  ) => (
    <SettingsActionRow
      icon={icon}
      label={label}
      description={description}
      type="switch"
      value={Boolean(settings?.[key])}
      onValueChange={(value) => updateSetting(key, value)}
    />
  );

  const saveDisabled = offlineMode || saving || !settings;
  const saveButton = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Save system settings"
      accessibilityHint="Saves backend system parameter changes"
      accessibilityState={{ disabled: saveDisabled, busy: saving }}
      hitSlop={TOUCH_HIT_SLOP}
      disabled={saveDisabled}
      onPress={() => {
        void handleSave();
      }}
      style={[
        styles.saveButton,
        {
          backgroundColor: saveDisabled
            ? colorWithAlpha(uiTokens.colors.textMuted, 0.28)
            : uiTokens.colors.accent,
          borderRadius: uiTokens.radius.full,
        },
      ]}
    >
      {saving ? (
        <ActivityIndicator size="small" color={uiTokens.colors.surfaceElevated} />
      ) : (
        <>
          <Ionicons name="save-outline" size={17} color={uiTokens.colors.surfaceElevated} />
          <Text style={[styles.saveButtonText, { color: uiTokens.colors.surfaceElevated }]}>
            Save
          </Text>
        </>
      )}
    </TouchableOpacity>
  );

  const header = {
    title: "System Settings",
    subtitle: "Configuration & preferences",
    showBackButton: true,
    showSettingsButton: false,
    showUsername: false,
    customRightContent: saveButton,
  };

  if (loading) {
    return (
      <ScreenContainer backgroundType="solid" header={header}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
          <Text style={[styles.loadingText, { color: uiTokens.colors.textSecondary }]}>
            Loading settings...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      backgroundType="solid"
      contentContainerStyle={styles.content}
      header={header}
      scrollable
    >
      <SettingsSectionHeading title="My App Preferences" />
      <ModernCard accessible={false} variant="outlined" elevation="none" style={styles.introCard}>
        <View
          style={[
            styles.introIcon,
            {
              backgroundColor: colorWithAlpha(
                uiTokens.colors.accent,
                uiTokens.mode === "dark" ? 0.2 : 0.1
              ),
              borderRadius: uiTokens.radius.md,
            },
          ]}
        >
          <Ionicons name="person-circle-outline" size={24} color={uiTokens.colors.accent} />
        </View>
        <View style={styles.introCopy}>
          <Text style={[styles.introTitle, { color: uiTokens.colors.textPrimary }]}>
            Personal preferences
          </Text>
          <Text style={[styles.introDescription, { color: uiTokens.colors.textSecondary }]}>
            These settings save automatically for your account. The page save button only applies to
            backend system parameters.
          </Text>
        </View>
      </ModernCard>

      <SettingsSyncStatus />

      <SettingsSectionHeading title="Appearance" />
      <View style={styles.embeddedPanel}>
        <AppearanceSettings showTitle={false} scrollable={false} compact />
      </View>

      <SettingsSectionHeading title="Personal Preferences" />
      <UserSettingsSections />

      <SettingsActionSection title="Personal Security">
        <SettingsActionRow
          icon="shield-checkmark-outline"
          label="Open Personal Security"
          description="Manage PIN, password, and biometric login"
          onPress={() => router.push("/security" as any)}
        />
      </SettingsActionSection>

      {offlineMode ? (
        <SettingsActionSection title="System Parameters">
          <View style={styles.noticeBlock}>
            <Ionicons name="cloud-offline-outline" size={22} color={uiTokens.colors.warning} />
            <View style={styles.noticeCopy}>
              <Text style={[styles.noticeTitle, { color: uiTokens.colors.textPrimary }]}>
                System parameters unavailable offline
              </Text>
              <Text style={[styles.noticeText, { color: uiTokens.colors.textSecondary }]}>
                Backend configuration cannot be reviewed or changed while offline mode is enabled.
                Personal app preferences above still work normally.
              </Text>
            </View>
          </View>
        </SettingsActionSection>
      ) : (
        <>
          <SettingsActionSection title="API Configuration">
            {renderSystemInput(
              "timer-outline",
              "API Timeout",
              "api_timeout",
              "numeric",
              "Request timeout in seconds"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "speedometer-outline",
              "Rate Limit",
              "api_rate_limit",
              "numeric",
              "Maximum requests per minute"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Caching">
            {renderSystemSwitch("hardware-chip-outline", "Enable Caching", "cache_enabled")}
            <SettingsSectionDivider />
            {renderSystemInput(
              "timer-outline",
              "Cache TTL",
              "cache_ttl",
              "numeric",
              "Time to live for cached items in seconds"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "albums-outline",
              "Max Cache Size",
              "cache_max_size",
              "numeric",
              "Maximum number of items kept in cache"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Synchronization">
            {renderSystemSwitch("sync-outline", "Auto Sync", "auto_sync_enabled")}
            <SettingsSectionDivider />
            {renderSystemInput(
              "time-outline",
              "Sync Interval",
              "sync_interval",
              "numeric",
              "Time between automatic sync runs in seconds"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "layers-outline",
              "Batch Size",
              "sync_batch_size",
              "numeric",
              "Items processed per sync batch"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Sessions">
            {renderSystemInput(
              "hourglass-outline",
              "Session Timeout",
              "session_timeout",
              "numeric",
              "Operator session timeout in seconds"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "people-outline",
              "Max Concurrent Sessions",
              "max_concurrent_sessions",
              "numeric",
              "Maximum active sessions allowed"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Logging">
            {renderSystemSwitch("document-text-outline", "Enable Audit Log", "enable_audit_log")}
            <SettingsSectionDivider />
            {renderSystemInput(
              "calendar-outline",
              "Log Retention",
              "log_retention_days",
              "numeric",
              "Retention period in days"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "list-outline",
              "Log Level",
              "log_level",
              "default",
              "DEBUG, INFO, WARN, or ERROR"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Database">
            {renderSystemInput("server-outline", "MongoDB Pool Size", "mongo_pool_size", "numeric")}
            <SettingsSectionDivider />
            {renderSystemInput("server-outline", "SQL Pool Size", "sql_pool_size", "numeric")}
            <SettingsSectionDivider />
            {renderSystemInput(
              "timer-outline",
              "Query Timeout",
              "query_timeout",
              "numeric",
              "Database query timeout in seconds"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Security">
            {renderSystemInput(
              "key-outline",
              "Min Password Length",
              "password_min_length",
              "numeric"
            )}
            <SettingsSectionDivider />
            {renderSystemSwitch("text-outline", "Require Uppercase", "password_require_uppercase")}
            <SettingsSectionDivider />
            {renderSystemSwitch("text-outline", "Require Lowercase", "password_require_lowercase")}
            <SettingsSectionDivider />
            {renderSystemSwitch(
              "calculator-outline",
              "Require Numbers",
              "password_require_numbers"
            )}
            <SettingsSectionDivider />
            {renderSystemInput(
              "shield-checkmark-outline",
              "JWT Expiration",
              "jwt_expiration",
              "numeric",
              "Token lifetime in seconds"
            )}
          </SettingsActionSection>

          <SettingsActionSection title="Performance">
            {renderSystemSwitch("archive-outline", "Enable Compression", "enable_compression")}
            <SettingsSectionDivider />
            {renderSystemSwitch("globe-outline", "Enable CORS", "enable_cors")}
            <SettingsSectionDivider />
            {renderSystemInput(
              "cloud-upload-outline",
              "Max Request Size",
              "max_request_size",
              "numeric",
              "Maximum request payload size in bytes"
            )}
          </SettingsActionSection>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: uiTokens.colors.textSecondary }]}>
              Some system parameter changes may require a backend restart to take full effect.
            </Text>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    marginTop: spacing.md,
  },
  saveButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: touchTargets.minimum,
    minWidth: 82,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  introCard: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  introIcon: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: spacing.md,
    width: 44,
  },
  introCopy: {
    flex: 1,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  introDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  embeddedPanel: {
    overflow: "hidden",
  },
  noticeBlock: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing["2xl"],
  },
  footerText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
