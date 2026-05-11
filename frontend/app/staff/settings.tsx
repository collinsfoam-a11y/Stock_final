/**
 * Staff Settings Screen - Modern Minimal Design
 * Essential settings for staff users with clean UI
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "../../src/store/authStore";
import { useAppVersion } from "../../src/hooks/useAppVersion";
import ModernCard from "../../src/components/ui/ModernCard";
import ModernHeader from "../../src/components/ui/ModernHeader";
import {
  SettingsActionRow,
  SettingsActionSection,
  SettingsSectionDivider,
  SettingsSectionHeading,
  SettingsSyncStatus,
  UserSettingsSections,
} from "../../src/components/settings";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import { spacing, typography, borderRadius } from "@/theme/legacyCompat";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
import { toastService } from "@/services/toastService";
import { safeBackNavigation } from "@/utils/navigation";

export default function StaffSettingsScreen() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const { version, buildVersion } = useAppVersion();
  const uiTokens = useUiTokens();

  const handleLogout = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        logout()
          .then(() => {
            router.replace("/welcome" as any);
          })
          .catch(() => {
            toastService.showError("Failed to sign out. Please try again.");
          });
      }
      return;
    }

    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            router.replace("/welcome" as any);
          } catch {
            toastService.showError("Failed to sign out. Please try again.");
          }
        },
      },
    ]);
  }, [logout, router]);

  const handleSecurity = useCallback(() => {
    router.push("/security" as any);
  }, [router]);

  const handleHelp = useCallback(() => {
    router.push("/help" as any);
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader
        title="Settings"
        showBackButton
        onBackPress={() => safeBackNavigation(router, { userRole: "staff" })}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info Card */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ModernCard
            style={[
              styles.userCard,
              flags.uiVisualSystemV2 ? getTokenShadowStyle(uiTokens, "md") : null,
            ]}
          >
            <View
              style={[
                styles.userAvatar,
                {
                  backgroundColor: colorWithAlpha(
                    uiTokens.colors.accent,
                    uiTokens.mode === "dark" ? 0.18 : 0.1
                  ),
                },
              ]}
            >
              <Ionicons name="person" size={28} color={uiTokens.colors.accent} />
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: uiTokens.colors.textPrimary }]}>
                {user?.username || "Staff"}
              </Text>
              <Text style={[styles.userRole, { color: uiTokens.colors.textSecondary }]}>
                Staff Member
              </Text>
            </View>
          </ModernCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <SettingsSyncStatus />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <SettingsActionSection title="Security">
            <SettingsActionRow
              icon="shield-checkmark-outline"
              label="Security & PIN"
              description="Manage your PIN and biometric login"
              type="navigation"
              onPress={handleSecurity}
            />
          </SettingsActionSection>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <SettingsSectionHeading title="Appearance" />
          <View style={styles.settingsCard}>
            <AppearanceSettings showTitle={false} scrollable={false} compact={true} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(450).springify()}>
          <SettingsSectionHeading title="Preferences" />
          <UserSettingsSections />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(550).springify()}>
          <SettingsActionSection title="Support">
            <SettingsActionRow
              icon="notifications-outline"
              label="Notifications"
              description="Open recount and approval alerts"
              onPress={() => router.push("/notifications" as any)}
              type="navigation"
            />
            <SettingsSectionDivider />
            <SettingsActionRow
              icon="help-circle-outline"
              label="Help & Support"
              description="Get assistance"
              onPress={handleHelp}
              type="navigation"
            />
          </SettingsActionSection>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(650).springify()}>
          <SettingsActionSection title="Account">
            <SettingsActionRow
              icon="log-out-outline"
              label="Sign Out"
              description="Sign out of your account"
              onPress={handleLogout}
              type="action"
              destructive
            />
          </SettingsActionSection>
        </Animated.View>

        {/* Version Info */}
        <Animated.View entering={FadeInDown.delay(700).springify()} style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: uiTokens.colors.textSecondary }]}>
            Stock Verify v{version}
          </Text>
          <Text style={[styles.versionSubtext, { color: uiTokens.colors.textMuted }]}>
            Build {buildVersion}
          </Text>
          <Text style={[styles.versionSubtext, { color: uiTokens.colors.textMuted }]}>
            © 2026 Lavanya Mart
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing["2xl"],
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    marginLeft: spacing.md,
    flex: 1,
  },
  userName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  userRole: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  settingsCard: {
    padding: 0,
    overflow: "hidden",
  },
  versionContainer: {
    alignItems: "center",
    marginTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  versionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  versionSubtext: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
