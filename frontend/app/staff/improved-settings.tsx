/**
 * Improved Staff Settings Screen - Lavanya Mart Stock Verify
 * Enhanced UI/UX following V3 UI/UX Guide requirements
 * 
 * Features:
 * - Enhanced offline status indicators
 * - Standardized error handling
 * - Security settings with PIN/biometric
 * - Sync state and appearance settings
 * - Help path accessibility
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ModernHeader } from "../../src/components/ui/ModernHeader";
import { ModernCard } from "../../src/components/ui/ModernCard";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { useAuthStore } from "../../src/store/authStore";
import { useSettingsStore } from "../../src/store/settingsStore";
import { colors as unifiedColors, spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from "@/theme/unified";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { OfflineStatusIndicator } from "../../src/components/ui/OfflineStatusIndicator";
import { StandardizedErrorCard } from "../../src/components/ui/StandardizedErrorCard";
import { SyncStatusPill } from "../../src/components/ui/SyncStatusPill";

// Mock network status hook - would be replaced with actual network status in real implementation
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = React.useState(true);
  const [queueDepth, setQueueDepth] = React.useState(0);
  const [lastSyncTime, setLastSyncTime] = React.useState(new Date());

  // Mock implementation - in real app this would come from a network status library
  return {
    isOnline,
    queueDepth,
    lastSyncTime,
    refreshStatus: () => {
      // Simulate refresh
    }
  };
};

const ImprovedSettingsScreen = () => {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const { user, logout } = useAuthStore();
  const { settings, updateSetting } = useSettingsStore() as any;
  const { isOnline, queueDepth, lastSyncTime, refreshStatus } = useNetworkStatus();
  
  const [error, setError] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(true); // In real app, check actual support

  // Mock biometric availability check
  useEffect(() => {
    // In a real app, this would check actual biometric availability
    setBiometricSupported(true);
  }, []);

  const handleLogout = () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out? Any unsynced data will be preserved locally.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              await logout();
              router.replace("/welcome");
            } catch (e) {
              setError("Logout failed. Please try again.");
              console.error(e);
            }
          },
        },
      ]
    );
  };

  const handleBiometricToggle = async (value: boolean) => {
    try {
      if (value && !biometricSupported) {
        Alert.alert("Biometric Not Available", "Biometric authentication is not available on this device.");
        return;
      }
      updateSetting("biometricAuth", value);
    } catch (err) {
      setError("Failed to update biometric setting. Please try again.");
    }
  };

  const handleAppearanceSettings = () => {
    router.push("/staff/appearance");
  };

  const handleSecuritySettings = () => {
    router.push("/security");
  };

  const handleNotifications = () => {
    // In a real app, this would navigate to notification settings
    Alert.alert("Notifications", "Notification settings would open here.");
  };

  const handleSyncSettings = () => {
    // In a real app, this would navigate to sync settings
    Alert.alert("Sync Settings", "Sync settings would open here.");
  };

  const handleHelp = () => {
    router.push("/help");
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      <ModernHeader
        title="Settings"
        subtitle={`${user?.full_name || user?.username || 'User'} • Staff`}
        showBackButton={false}
        showLogoutButton={false}
        rightAction={{
          icon: "log-out-outline",
          onPress: handleLogout,
        }}
      />
      
      {/* Enhanced Offline Status Indicator */}
      <View style={styles.statusRow}>
        <OfflineStatusIndicator
          isOnline={isOnline}
          queueDepth={queueDepth}
          lastSyncTime={lastSyncTime}
          onRetry={refreshStatus}
          showQueue={true}
          showLastSync={true}
        />
      </View>

      {/* Sync Status Pill */}
      <View style={styles.statusRow}>
        <SyncStatusPill />
      </View>

      {/* Error Boundary */}
      {error && (
        <StandardizedErrorCard
          title="Settings Error"
          description={error}
          onPrimaryAction={() => setError(null)}
          primaryActionText="Dismiss"
          errorType={isOnline ? "sync" : "offline"}
        />
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <ModernCard
          style={[styles.sectionCard, { backgroundColor: uiTokens.colors.surface }]}
          padding={unifiedSpacing.lg}
        >
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: `${uiTokens.colors.accent}15` }]}>
              <Ionicons name="person" size={24} color={uiTokens.colors.accent} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: uiTokens.colors.textPrimary }]}>
                {user?.full_name || user?.username || 'User'}
              </Text>
              <Text style={[styles.profileRole, { color: uiTokens.colors.textSecondary }]}>
                Staff Member • {user?.email || 'No email'}
              </Text>
            </View>
          </View>
        </ModernCard>

        {/* Security Settings */}
        <ModernCard
          style={[styles.sectionCard, { backgroundColor: uiTokens.colors.surface }]}
          padding={0}
        >
          <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary, paddingLeft: unifiedSpacing.lg, paddingTop: unifiedSpacing.lg }]}>
            Security
          </Text>
          
          <AppTouchable
            style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}
            onPress={handleSecuritySettings}
          >
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.accent}12` }]}>
                <Ionicons name="key-outline" size={20} color={uiTokens.colors.accent} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Change PIN
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Update your 4-digit access code
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>

          <View style={[styles.divider, { backgroundColor: uiTokens.colors.border }]} />

          <View style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}>
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.accent}12` }]}>
                <Ionicons name="finger-print-outline" size={20} color={uiTokens.colors.accent} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Biometric Authentication
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Unlock with fingerprint or face recognition
                </Text>
              </View>
            </View>
            <Switch
              value={settings.biometricAuth}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: uiTokens.colors.border, true: uiTokens.colors.accent }}
              thumbColor={Platform.OS === 'android' ? uiTokens.colors.surface : undefined}
            />
          </View>
        </ModernCard>

        {/* Sync and Data */}
        <ModernCard
          style={[styles.sectionCard, { backgroundColor: uiTokens.colors.surface }]}
          padding={0}
        >
          <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary, paddingLeft: unifiedSpacing.lg, paddingTop: unifiedSpacing.lg }]}>
            Sync & Data
          </Text>
          
          <AppTouchable
            style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}
            onPress={handleSyncSettings}
          >
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.accent}12` }]}>
                <Ionicons name="sync-outline" size={20} color={uiTokens.colors.accent} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Sync Settings
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Configure upload and sync behavior
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>

          <View style={[styles.divider, { backgroundColor: uiTokens.colors.border }]} />

          <View style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}>
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.accent}12` }]}>
                <Ionicons name="cloud-download-outline" size={20} color={uiTokens.colors.accent} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Offline Mode
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Work without internet connection
                </Text>
              </View>
            </View>
            <Switch
              value={settings.offlineMode}
              onValueChange={(value) => updateSetting("offlineMode", value)}
              trackColor={{ false: uiTokens.colors.border, true: uiTokens.colors.accent }}
              thumbColor={Platform.OS === 'android' ? uiTokens.colors.surface : undefined}
            />
          </View>
        </ModernCard>

        {/* Appearance */}
        <ModernCard
          style={[styles.sectionCard, { backgroundColor: uiTokens.colors.surface }]}
          padding={0}
        >
          <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary, paddingLeft: unifiedSpacing.lg, paddingTop: unifiedSpacing.lg }]}>
            Appearance
          </Text>
          
          <AppTouchable
            style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}
            onPress={handleAppearanceSettings}
          >
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.accent}12` }]}>
                <Ionicons name="color-palette-outline" size={20} color={uiTokens.colors.accent} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Theme & Display
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Adjust colors, fonts, and layout
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>
        </ModernCard>

        {/* Support */}
        <ModernCard
          style={[styles.sectionCard, { backgroundColor: uiTokens.colors.surface }]}
          padding={0}
        >
          <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary, paddingLeft: unifiedSpacing.lg, paddingTop: unifiedSpacing.lg }]}>
            Support
          </Text>
          
          <AppTouchable
            style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}
            onPress={handleHelp}
          >
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.info}12` }]}>
                <Ionicons name="help-circle-outline" size={20} color={uiTokens.colors.info} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  Help & Support
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Find answers and get assistance
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>

          <View style={[styles.divider, { backgroundColor: uiTokens.colors.border }]} />

          <AppTouchable
            style={[styles.settingItem, { borderColor: uiTokens.colors.border }]}
            onPress={() => Alert.alert("About", "Lavanya Mart Stock Verification v3.0\n© 2026")}
          >
            <View style={styles.settingContent}>
              <View style={[styles.settingIcon, { backgroundColor: `${uiTokens.colors.info}12` }]}>
                <Ionicons name="information-circle-outline" size={20} color={uiTokens.colors.info} />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: uiTokens.colors.textPrimary }]}>
                  About App
                </Text>
                <Text style={[styles.settingSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Version info and legal
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>
        </ModernCard>

        {/* Logout Button */}
        <AppTouchable
          style={[styles.logoutButton, { backgroundColor: uiTokens.colors.error }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={uiTokens.colors.surface} />
          <Text style={[styles.logoutButtonText, { color: uiTokens.colors.surface }]}>
            Log Out
          </Text>
        </AppTouchable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusRow: {
    marginHorizontal: unifiedSpacing.md,
    marginBottom: unifiedSpacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: unifiedSpacing.lg,
    paddingBottom: 60,
    gap: unifiedSpacing.md,
  },
  sectionCard: {
    borderRadius: unifiedRadius.lg,
    overflow: "hidden",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: unifiedSpacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...textStyles.h6,
    fontWeight: "600",
  },
  profileRole: {
    ...textStyles.caption,
  },
  sectionTitle: {
    ...textStyles.h6,
    fontWeight: "600",
    marginBottom: unifiedSpacing.md,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: unifiedSpacing.lg,
    paddingVertical: unifiedSpacing.md,
    borderBottomWidth: 1,
  },
  settingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: unifiedSpacing.md,
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    ...textStyles.body,
    fontWeight: "500",
  },
  settingSubtitle: {
    ...textStyles.caption,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginHorizontal: unifiedSpacing.lg,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: unifiedSpacing.sm,
    padding: unifiedSpacing.md,
    borderRadius: unifiedRadius.md,
    marginTop: unifiedSpacing.xl,
  },
  logoutButtonText: {
    ...textStyles.body,
    fontWeight: "600",
  },
});

export default ImprovedSettingsScreen;