/**
 * Supervisor settings screen.
 *
 * Uses shared settings primitives so staff/supervisor settings keep one row,
 * divider, haptic, and accessibility pattern.
 */

import React, { useCallback, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { confirmAction } from "@/services/actionSheet";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";

import { useSettingsStore } from "@/store/settingsStore";
import { useUiTokens } from "@/hooks/useUiTokens";
import { ScreenContainer } from "@/components/ui";
import { AppearanceSettings } from "@/components/ui/AppearanceSettings";
import {
  ChangePasswordModal,
  SettingsActionRow,
  SettingsActionSection,
  SettingsSectionDivider,
  SettingsSectionHeading,
  SettingsSyncStatus,
  UserSettingsSections,
} from "@/components/settings";
import { safeBackNavigation } from "@/utils/navigation";
import { font, gap, radius } from '@/theme/staffUiScale';

export default function SettingsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const { resetSettings } = useSettingsStore();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const handleBack = useCallback(() => {
    safeBackNavigation(router, { userRole: "supervisor" });
  }, [router]);

  const handleReset = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    const runReset = async () => {
      await resetSettings();
      Alert.alert("Settings Reset", "Your app preferences were reset to their defaults.");
    };

    const confirmed = await confirmAction({
      title: "Reset Settings",
      message: "Reset your app settings to default values?",
      confirmLabel: "Reset",
      destructive: true,
    });

    if (confirmed) {
      await runReset();
    }
  }, [resetSettings]);

  return (
    <>
      <ScreenContainer
        backgroundType="solid"
        contentContainerStyle={styles.content}
        header={{
          title: "Settings",
          subtitle: "Preferences & controls",
          showBackButton: true,
          onBackPress: handleBack,
          showLogoutButton: false,
          showSettingsButton: false,
          showUsername: false,
        }}
        scrollable
      >
        {/* Follow the app theme override, not just the system scheme */}
        <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
        <SettingsSyncStatus />

        <SettingsSectionHeading title="Appearance" />
        <View style={styles.embeddedPanel}>
          <AppearanceSettings showTitle={false} scrollable={false} compact />
        </View>

        <SettingsSectionHeading title="Personal Preferences" />
        <UserSettingsSections />

        <SettingsActionSection title="Security">
          <SettingsActionRow
            icon="shield-checkmark-outline"
            label="Security & PIN"
            description="Manage PIN, biometric unlock, and device security"
            onPress={() => router.push("/security" as any)}
          />
          <SettingsSectionDivider />
          <SettingsActionRow
            icon="lock-closed-outline"
            label="Change Password"
            description="Update the password for this account"
            onPress={() => setShowChangePasswordModal(true)}
          />
        </SettingsActionSection>

        <SettingsActionSection title="Management">
          <SettingsActionRow
            icon="sync-outline"
            label="Sync Conflict Review"
            description="Resolve queued sync conflicts"
            onPress={() => router.push("/supervisor/sync-conflicts" as any)}
          />
          <SettingsSectionDivider />
          <SettingsActionRow
            icon="notifications-outline"
            label="Notifications"
            description="Open recount and approval alerts"
            onPress={() => router.push("/notifications" as any)}
          />
          <SettingsSectionDivider />
          <SettingsActionRow
            icon="help-circle-outline"
            label="Help & Support"
            description="Open workflow and support guidance"
            onPress={() => router.push("/help" as any)}
          />
        </SettingsActionSection>

        <SettingsActionSection title="Maintenance">
          <SettingsActionRow
            icon="refresh-outline"
            label="Reset to Defaults"
            description="Restore local app preferences"
            type="action"
            destructive
            onPress={handleReset}
          />
        </SettingsActionSection>

        <View style={styles.bottomSpacer} />
      </ScreenContainer>

      <ChangePasswordModal
        visible={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onSuccess={() => {
          setShowChangePasswordModal(false);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          Alert.alert("Password Changed", "Your password has been changed successfully.");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gap.lg,
    paddingTop: 16,
  },
  embeddedPanel: {
    overflow: "hidden",
  },
  bottomSpacer: {
    height: 40,
  },
});
