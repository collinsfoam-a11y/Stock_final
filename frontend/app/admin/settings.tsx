import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import {
  SettingsSyncStatus,
  UserSettingsSections,
} from "../../src/components/settings";
import { ScreenContainer } from "../../src/components/ui";
import {
  getSystemSettings,
  updateSystemSettings,
} from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";

export default function MasterSettingsScreen() {
  const router = useRouter();
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);

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
        setSettings(response.data);
      } else {
        Alert.alert("Error", "Failed to load settings");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [offlineMode]);

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert(
        "Access Denied",
        "You do not have permission to view master settings.",
        [{ text: "OK", onPress: () => router.back() }],
      );
      return;
    }
    void loadSettings();
  }, [hasRole, loadSettings, router]);

  const handleSave = async () => {
    if (offlineMode) {
      Alert.alert(
        "Offline Mode",
        "System settings require a live connection to save.",
      );
      return;
    }

    try {
      setSaving(true);
      const response = await updateSystemSettings(settings);
      if (response.success) {
        Alert.alert("Success", "Settings updated successfully");
        if (response.note) {
          Alert.alert("Note", response.note);
        }
      } else {
        Alert.alert("Error", "Failed to update settings");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderSectionHeader = (title: string, icon: any) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={24} color={auroraTheme.colors.primary[500]} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderInput = (
    label: string,
    key: string,
    keyboardType: "default" | "numeric" = "default",
    description?: string,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={settings?.[key]?.toString() || ""}
        onChangeText={(text) => {
          const value = keyboardType === "numeric" ? parseInt(text) || 0 : text;
          updateSetting(key, value);
        }}
        keyboardType={keyboardType}
        placeholder={label}
        placeholderTextColor={auroraTheme.colors.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {description && (
        <Text style={styles.inputDescription}>{description}</Text>
      )}
    </View>
  );

  const renderSwitch = (label: string, key: string, description?: string) => (
    <View style={styles.switchContainer}>
      <View style={styles.switchTextContainer}>
        <Text style={styles.switchLabel}>{label}</Text>
        {description && (
          <Text style={styles.switchDescription}>{description}</Text>
        )}
      </View>
      <Switch
        value={settings?.[key] || false}
        onValueChange={(value) => updateSetting(key, value)}
        trackColor={{
          false: auroraTheme.colors.border.medium,
          true: auroraTheme.colors.primary[300],
        }}
        thumbColor={
          settings?.[key]
            ? auroraTheme.colors.primary[500]
            : auroraTheme.colors.surface.elevated
        }
      />
    </View>
  );

  if (loading) {
    return (
      <ScreenContainer
        gradient
        header={{
          title: "System Settings",
          subtitle: "Configuration & Preferences",
          showBackButton: true,
          customRightContent: (
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveButton, offlineMode && styles.disabledButton]}
              disabled={offlineMode || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={auroraTheme.colors.primary[500]}
          />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      gradient
      header={{
        title: "System Settings",
        subtitle: "Configuration & Preferences",
        showBackButton: true,
        customRightContent: (
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveButton, offlineMode && styles.disabledButton]}
            disabled={offlineMode || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        ),
      }}
    >
      <ScrollView style={styles.content}>
        {/* Personal Settings */}
        <View style={styles.section}>
          {renderSectionHeader("My App Preferences", "person-circle-outline")}
          <Text style={styles.sectionDescription}>
            These preferences are saved automatically for your account. The
            page save button below only applies to system parameters.
          </Text>
          <SettingsSyncStatus />
          <View style={styles.personalPreferencesSpacer} />
          <AppearanceSettings
            showTitle={false}
            scrollable={false}
            compact={true}
          />
          <View style={styles.personalPreferencesSpacer} />
          <UserSettingsSections />
          <TouchableOpacity
            style={styles.personalSecurityButton}
            onPress={() => router.push("/security" as any)}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={auroraTheme.colors.primary[500]}
            />
            <Text style={styles.personalSecurityButtonText}>
              Open Personal Security
            </Text>
          </TouchableOpacity>
        </View>

        {offlineMode ? (
          <View style={styles.section}>
            {renderSectionHeader("System Parameters", "cloud-offline-outline")}
            <Text style={styles.sectionDescription}>
              System-level admin settings are loaded from the backend and cannot
              be reviewed or changed while offline mode is enabled. Your
              personal app preferences above still work normally.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              {renderSectionHeader("API Configuration", "globe-outline")}
              {renderInput(
                "API Timeout (seconds)",
                "api_timeout",
                "numeric",
                "Request timeout duration",
              )}
              {renderInput(
                "Rate Limit (per minute)",
                "api_rate_limit",
                "numeric",
                "Maximum requests per minute",
              )}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Caching", "hardware-chip-outline")}
              {renderSwitch("Enable Caching", "cache_enabled")}
              {renderInput(
                "Cache TTL (seconds)",
                "cache_ttl",
                "numeric",
                "Time to live for cached items",
              )}
              {renderInput(
                "Max Cache Size",
                "cache_max_size",
                "numeric",
                "Maximum number of items in cache",
              )}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Synchronization", "sync-outline")}
              {renderSwitch("Auto Sync", "auto_sync_enabled")}
              {renderInput(
                "Sync Interval (seconds)",
                "sync_interval",
                "numeric",
                "Time between automatic syncs",
              )}
              {renderInput(
                "Batch Size",
                "sync_batch_size",
                "numeric",
                "Items per sync batch",
              )}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Sessions", "people-outline")}
              {renderInput(
                "Session Timeout (seconds)",
                "session_timeout",
                "numeric",
              )}
              {renderInput(
                "Max Concurrent Sessions",
                "max_concurrent_sessions",
                "numeric",
              )}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Logging", "document-text-outline")}
              {renderSwitch("Enable Audit Log", "enable_audit_log")}
              {renderInput("Log Retention (days)", "log_retention_days", "numeric")}
              {renderInput(
                "Log Level",
                "log_level",
                "default",
                "DEBUG, INFO, WARN, ERROR",
              )}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Database", "server-outline")}
              {renderInput("MongoDB Pool Size", "mongo_pool_size", "numeric")}
              {renderInput("SQL Pool Size", "sql_pool_size", "numeric")}
              {renderInput("Query Timeout (seconds)", "query_timeout", "numeric")}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Security", "shield-checkmark-outline")}
              {renderInput("Min Password Length", "password_min_length", "numeric")}
              {renderSwitch("Require Uppercase", "password_require_uppercase")}
              {renderSwitch("Require Lowercase", "password_require_lowercase")}
              {renderSwitch("Require Numbers", "password_require_numbers")}
              {renderInput("JWT Expiration (seconds)", "jwt_expiration", "numeric")}
            </View>

            <View style={styles.section}>
              {renderSectionHeader("Performance", "speedometer-outline")}
              {renderSwitch("Enable Compression", "enable_compression")}
              {renderSwitch("Enable CORS", "enable_cors")}
              {renderInput(
                "Max Request Size (bytes)",
                "max_request_size",
                "numeric",
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Note: Some changes may require a system restart to take full effect.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: auroraTheme.colors.text.secondary,
  },
  saveButton: {
    backgroundColor: auroraTheme.colors.primary[500],
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.full,
    minWidth: 70,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: auroraTheme.spacing.lg,
  },
  section: {
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.lg,
    padding: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.lg,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
    ...(Platform.OS === "web" && {
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.subtle,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: auroraTheme.colors.text.primary,
    marginLeft: 8,
  },
  sectionDescription: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: auroraTheme.spacing.md,
  },
  personalPreferencesSpacer: {
    height: auroraTheme.spacing.md,
  },
  personalSecurityButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: auroraTheme.colors.border.subtle,
    borderRadius: auroraTheme.borderRadius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: auroraTheme.spacing.xs,
    marginTop: auroraTheme.spacing.md,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
  },
  personalSecurityButtonText: {
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    fontSize: 16,
    backgroundColor: auroraTheme.colors.surface.secondary,
    color: auroraTheme.colors.text.primary,
  },
  inputDescription: {
    fontSize: 12,
    color: auroraTheme.colors.text.muted,
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    color: auroraTheme.colors.text.primary,
  },
  switchDescription: {
    fontSize: 12,
    color: auroraTheme.colors.text.muted,
    marginTop: 2,
  },
  footer: {
    padding: auroraTheme.spacing.lg,
    alignItems: "center",
    marginBottom: 32,
  },
  footerText: {
    color: auroraTheme.colors.text.secondary,
    textAlign: "center",
    fontStyle: "italic",
  },
});
