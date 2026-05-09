import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { usePermission } from "../../src/hooks/usePermission";
import { ScreenContainer } from "../../src/components/ui/ScreenContainer";
import ModernCard from "../../src/components/ui/ModernCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import { useSettingsStore } from "../../src/store/settingsStore";
import {
  getSqlServerConfig,
  updateSqlServerConfig,
  testSqlServerConnection,
} from "../../src/services/api";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const isWeb = Platform.OS === "web";

export default function SqlConfigScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState({
    host: "",
    port: 1433,
    database: "",
    username: "",
    password: "",
  });
  const [testResult, setTestResult] = useState<any>(null);

  const loadConfig = useCallback(async () => {
    if (offlineMode) {
      setConfig({
        host: "",
        port: 1433,
        database: "",
        username: "",
        password: "",
      });
      setTestResult(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await getSqlServerConfig();
      if (response.success && response.data) {
        setConfig({
          host: response.data.host || "",
          port: response.data.port || 1433,
          database: response.data.database || "",
          username: response.data.username || "",
          password: "", // Never load password
        });
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [offlineMode]);

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "Admin access required", [
        { text: "OK", onPress: () => safeBackNavigation(router, { userRole: "admin" }) },
      ]);
      return;
    }
    void loadConfig();
  }, [hasRole, loadConfig, router]);

  const handleTest = async () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Connection testing requires a live connection.");
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const response = await testSqlServerConnection(config);
      setTestResult(response.data);
      if (response.data.connected) {
        Alert.alert("Success", "Connection test successful!");
      } else {
        Alert.alert("Failed", response.data.message || "Connection test failed");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Saving SQL configuration requires a live connection.");
      return;
    }

    try {
      setSaving(true);
      const response = await updateSqlServerConfig(config);
      if (response.success) {
        Alert.alert("Success", "Configuration saved. Restart backend to apply changes.");
        safeBackNavigation(router, { userRole: "admin" });
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer
        backgroundType="solid"
        header={{
          title: "SQL Server",
          subtitle: "Configuration",
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
          <Text style={styles.loadingText}>Loading configuration...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      backgroundType="solid"
      header={{
        title: "SQL Server",
        subtitle: offlineMode
          ? "Configuration unavailable offline"
          : "ERP Connectivity & Credentials",
        showBackButton: true,
      }}
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, isWeb && styles.contentContainerWeb]}
      >
        {offlineMode && (
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.offlineNotice}>
            <Ionicons
              name="cloud-offline-outline"
              size={24}
              color={uiTokens.colors.warning}
            />
            <View style={styles.offlineNoticeContent}>
              <Text style={styles.offlineNoticeTitle}>
                SQL configuration requires a live connection
              </Text>
              <Text style={styles.offlineNoticeText}>
                Server credentials are loaded from the backend and cannot be viewed, tested, or
                updated while offline mode is enabled.
              </Text>
            </View>
          </ModernCard>
        )}

        <ModernCard variant="outlined" elevation="none" padding={0} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="server-outline" size={24} color={uiTokens.colors.accent} />
            <Text style={styles.sectionTitle}>Connection Settings</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Host Address *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 192.168.1.10 or sql.example.com"
              placeholderTextColor={uiTokens.colors.textMuted}
              value={config.host}
              onChangeText={(text) => setConfig({ ...config, host: text })}
              autoCapitalize="none"
              editable={!offlineMode}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Port *</Text>
            <TextInput
              style={styles.input}
              placeholder="Default: 1433"
              placeholderTextColor={uiTokens.colors.textMuted}
              value={config.port.toString()}
              onChangeText={(text) => setConfig({ ...config, port: parseInt(text) || 1433 })}
              keyboardType="numeric"
              editable={!offlineMode}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Database Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., LAVANYA_ERP"
              placeholderTextColor={uiTokens.colors.textMuted}
              value={config.database}
              onChangeText={(text) => setConfig({ ...config, database: text })}
              autoCapitalize="none"
              editable={!offlineMode}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., sa"
              placeholderTextColor={uiTokens.colors.textMuted}
              value={config.username}
              onChangeText={(text) => setConfig({ ...config, username: text })}
              autoCapitalize="none"
              editable={!offlineMode}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Leave empty to keep current"
              placeholderTextColor={uiTokens.colors.textMuted}
              value={config.password}
              onChangeText={(text) => setConfig({ ...config, password: text })}
              secureTextEntry
              autoCapitalize="none"
              editable={!offlineMode}
            />
          </View>
        </ModernCard>

        {testResult && (
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={0}
            style={[
              styles.testResult,
              {
                borderColor: testResult.connected
                  ? uiTokens.colors.success
                  : uiTokens.colors.error,
                backgroundColor: testResult.connected
                  ? colorWithAlpha(uiTokens.colors.success, 0.1)
                  : colorWithAlpha(uiTokens.colors.error, 0.1),
              },
            ]}
          >
            <Ionicons
              name={testResult.connected ? "checkmark-circle" : "close-circle"}
              size={28}
              color={
                testResult.connected ? uiTokens.colors.success : uiTokens.colors.error
              }
            />
            <View style={styles.testResultContent}>
              <Text
                style={[
                  styles.testResultTitle,
                  {
                    color: testResult.connected
                      ? uiTokens.colors.success
                      : uiTokens.colors.error,
                  },
                ]}
              >
                {testResult.connected ? "Connection Successful" : "Connection Failed"}
              </Text>
              <Text style={styles.testResultText}>{testResult.message}</Text>
            </View>
          </ModernCard>
        )}

        <View style={styles.actions}>
          <AnimatedPressable
            style={[styles.button, styles.testButton, offlineMode && styles.buttonDisabled]}
            onPress={handleTest}
            disabled={offlineMode || testing || !config.host || !config.database}
            {...getAccessibleButtonProps({
              label: "Test SQL Server connection",
              disabled: offlineMode || testing || !config.host || !config.database,
              busy: testing,
            })}
          >
            {testing ? (
              <ActivityIndicator size="small" color={uiTokens.colors.surface} />
            ) : (
              <>
                <Ionicons name="pulse" size={20} color={uiTokens.colors.surface} />
                <Text style={styles.buttonText}>Test Connection</Text>
              </>
            )}
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.button, styles.saveButton, offlineMode && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={offlineMode || saving || !config.host || !config.database}
            {...getAccessibleButtonProps({
              label: "Save SQL Server configuration",
              disabled: offlineMode || saving || !config.host || !config.database,
              busy: saving,
            })}
          >
            {saving ? (
              <ActivityIndicator size="small" color={uiTokens.colors.surface} />
            ) : (
              <>
                <Ionicons name="save" size={20} color={uiTokens.colors.surface} />
                <Text style={styles.buttonText}>Save Configuration</Text>
              </>
            )}
          </AnimatedPressable>
        </View>

        <ModernCard variant="outlined" elevation="none" padding={0} style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={uiTokens.colors.accent} />
          <Text style={styles.infoText}>
            SQL Server integration is used for real-time ERP synchronization. The system can operate
            independently with local data if connectivity is not available. Changes require a
            backend service restart to take full effect.
          </Text>
        </ModernCard>
      </ScrollView>
    </ScreenContainer>
  );
}

type SqlConfigTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: SqlConfigTokens) =>
  StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: uiTokens.spacing.md,
    color: uiTokens.colors.textSecondary,
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: uiTokens.spacing.md,
    paddingBottom: uiTokens.spacing["3xl"],
  },
  contentContainerWeb: {
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
  },
  section: {
    padding: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.lg,
  },
  offlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
  },
  offlineNoticeContent: {
    flex: 1,
  },
  offlineNoticeTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.xs,
  },
  offlineNoticeText: {
    fontSize: 14,
    color: uiTokens.colors.textSecondary,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: uiTokens.colors.textPrimary,
  },
  inputGroup: {
    marginBottom: uiTokens.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: uiTokens.colors.textSecondary,
    marginBottom: uiTokens.spacing.sm,
    marginLeft: uiTokens.spacing.xs,
  },
  input: {
    backgroundColor: uiTokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    borderRadius: uiTokens.radius.md,
    padding: uiTokens.spacing.md,
    color: uiTokens.colors.textPrimary,
    fontSize: 16,
  },
  testResult: {
    flexDirection: "row",
    alignItems: "center",
    padding: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.lg,
    borderWidth: 1.5,
    gap: uiTokens.spacing.md,
  },
  testResultContent: {
    flex: 1,
  },
  testResultTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: uiTokens.spacing.xs,
  },
  testResultText: {
    fontSize: 14,
    color: uiTokens.colors.textSecondary,
  },
  actions: {
    gap: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.xl,
  },
  button: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.spacing.md,
    borderRadius: uiTokens.radius.md,
    gap: uiTokens.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  testButton: {
    backgroundColor: uiTokens.colors.success,
  },
  saveButton: {
    backgroundColor: uiTokens.colors.accent,
  },
  buttonText: {
    color: uiTokens.colors.surface,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  infoBox: {
    flexDirection: "row",
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
    alignItems: "center",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: uiTokens.colors.textSecondary,
    lineHeight: 20,
  },
});
