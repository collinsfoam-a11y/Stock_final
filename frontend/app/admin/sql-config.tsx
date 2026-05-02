import React, { useState, useEffect, useCallback } from "react";
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
import { GlassCard } from "../../src/components/ui/GlassCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";
import {
  getSqlServerConfig,
  updateSqlServerConfig,
  testSqlServerConnection,
} from "../../src/services/api";

const isWeb = Platform.OS === "web";

export default function SqlConfigScreen() {
  const router = useRouter();
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
        { text: "OK", onPress: () => router.back() },
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
        Alert.alert(
          "Failed",
          response.data.message || "Connection test failed",
        );
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
        Alert.alert(
          "Success",
          "Configuration saved. Restart backend to apply changes.",
        );
        router.back();
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
        backgroundType="aurora"
        header={{
          title: "SQL Server",
          subtitle: "Configuration",
          showBackButton: true,
        }}
      >
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={auroraTheme.colors.primary[500]}
          />
          <Text style={styles.loadingText}>Loading configuration...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      backgroundType="aurora"
      auroraVariant="primary"
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
        contentContainerStyle={[
          styles.contentContainer,
          isWeb && styles.contentContainerWeb,
        ]}
      >
        {offlineMode && (
          <GlassCard variant="strong" style={styles.offlineNotice}>
            <Ionicons
              name="cloud-offline-outline"
              size={24}
              color={auroraTheme.colors.warning[500]}
            />
            <View style={styles.offlineNoticeContent}>
              <Text style={styles.offlineNoticeTitle}>
                SQL configuration requires a live connection
              </Text>
              <Text style={styles.offlineNoticeText}>
                Server credentials are loaded from the backend and cannot be
                viewed, tested, or updated while offline mode is enabled.
              </Text>
            </View>
          </GlassCard>
        )}

        <GlassCard variant="medium" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="server-outline"
              size={24}
              color={auroraTheme.colors.primary[400]}
            />
            <Text style={styles.sectionTitle}>Connection Settings</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Host Address *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 192.168.1.10 or sql.example.com"
              placeholderTextColor={auroraTheme.colors.text.muted}
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
              placeholderTextColor={auroraTheme.colors.text.muted}
              value={config.port.toString()}
              onChangeText={(text) =>
                setConfig({ ...config, port: parseInt(text) || 1433 })
              }
              keyboardType="numeric"
              editable={!offlineMode}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Database Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., LAVANYA_ERP"
              placeholderTextColor={auroraTheme.colors.text.muted}
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
              placeholderTextColor={auroraTheme.colors.text.muted}
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
              placeholderTextColor={auroraTheme.colors.text.muted}
              value={config.password}
              onChangeText={(text) => setConfig({ ...config, password: text })}
              secureTextEntry
              autoCapitalize="none"
              editable={!offlineMode}
            />
          </View>
        </GlassCard>

        {testResult && (
          <GlassCard
            variant="strong"
            style={[
              styles.testResult,
              {
                borderColor: testResult.connected
                  ? auroraTheme.colors.success[500]
                  : auroraTheme.colors.error[500],
                backgroundColor: testResult.connected
                  ? auroraTheme.colors.success[500] + "10"
                  : auroraTheme.colors.error[500] + "10",
              },
            ]}
          >
            <Ionicons
              name={testResult.connected ? "checkmark-circle" : "close-circle"}
              size={28}
              color={
                testResult.connected
                  ? auroraTheme.colors.success[500]
                  : auroraTheme.colors.error[500]
              }
            />
            <View style={styles.testResultContent}>
              <Text
                style={[
                  styles.testResultTitle,
                  {
                    color: testResult.connected
                      ? auroraTheme.colors.success[500]
                      : auroraTheme.colors.error[500],
                  },
                ]}
              >
                {testResult.connected
                  ? "Connection Successful"
                  : "Connection Failed"}
              </Text>
              <Text style={styles.testResultText}>{testResult.message}</Text>
            </View>
          </GlassCard>
        )}

        <View style={styles.actions}>
          <AnimatedPressable
            style={[
              styles.button,
              styles.testButton,
              offlineMode && styles.buttonDisabled,
            ]}
            onPress={handleTest}
            disabled={offlineMode || testing || !config.host || !config.database}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="pulse" size={20} color="#fff" />
                <Text style={styles.buttonText}>Test Connection</Text>
              </>
            )}
          </AnimatedPressable>

          <AnimatedPressable
            style={[
              styles.button,
              styles.saveButton,
              offlineMode && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={offlineMode || saving || !config.host || !config.database}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#fff" />
                <Text style={styles.buttonText}>Save Configuration</Text>
              </>
            )}
          </AnimatedPressable>
        </View>

        <GlassCard variant="light" style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={24}
            color={auroraTheme.colors.primary[400]}
          />
          <Text style={styles.infoText}>
            SQL Server integration is used for real-time ERP synchronization.
            The system can operate independently with local data if connectivity
            is not available. Changes require a backend service restart to take
            full effect.
          </Text>
        </GlassCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    color: auroraTheme.colors.text.secondary,
    fontSize: auroraTheme.typography.fontSize.md,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: auroraTheme.spacing.md,
    paddingBottom: 40,
  },
  contentContainerWeb: {
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
  },
  section: {
    padding: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.lg,
  },
  offlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.lg,
    gap: 16,
  },
  offlineNoticeContent: {
    flex: 1,
  },
  offlineNoticeTitle: {
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "700" as const,
    color: auroraTheme.colors.text.primary,
    marginBottom: 4,
  },
  offlineNoticeText: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.lg,
    gap: 12,
  },
  sectionTitle: {
    fontSize: auroraTheme.typography.fontSize.xl,
    fontWeight: "700" as const,
    color: auroraTheme.colors.text.primary,
  },
  inputGroup: {
    marginBottom: auroraTheme.spacing.md,
  },
  label: {
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600" as const,
    color: auroraTheme.colors.text.secondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: auroraTheme.colors.background.glass,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    color: auroraTheme.colors.text.primary,
    fontSize: auroraTheme.typography.fontSize.md,
  },
  testResult: {
    flexDirection: "row",
    alignItems: "center",
    padding: auroraTheme.spacing.lg,
    marginBottom: auroraTheme.spacing.lg,
    borderWidth: 1.5,
    gap: 16,
  },
  testResultContent: {
    flex: 1,
  },
  testResultTitle: {
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  testResultText: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
  },
  actions: {
    gap: 12,
    marginBottom: 32,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: auroraTheme.borderRadius.md,
    gap: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  testButton: {
    backgroundColor: auroraTheme.colors.success[600],
  },
  saveButton: {
    backgroundColor: auroraTheme.colors.primary[500],
  },
  buttonText: {
    color: "#fff",
    fontSize: auroraTheme.typography.fontSize.md,
    fontWeight: "700" as const,
  },
  infoBox: {
    flexDirection: "row",
    padding: auroraTheme.spacing.lg,
    gap: 16,
    alignItems: "center",
  },
  infoText: {
    flex: 1,
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    lineHeight: 20,
  },
});
