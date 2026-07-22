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

import { useAuthStore } from "@/store/authStore";
import { useAppVersion } from "@/hooks/useAppVersion";
import ModernCard from "@/components/ui/ModernCard";
import ModernHeader from "@/components/ui/ModernHeader";
import {
  SettingsActionRow,
  SettingsActionSection,
  SettingsSectionDivider,
  SettingsSectionHeading,
  SettingsSyncStatus,
  UserSettingsSections,
} from "@/components/settings";
import { AppearanceSettings } from "@/components/ui/AppearanceSettings";
import { font, radius, touch, gap } from "@/theme/staffUiScale";

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

  // Type-safe navigation helpers for Expo Router dynamic routes
  const navigateToWelcome = () => router.replace("/welcome" as never);
  const navigateToSecurity = () => router.push("/security" as never);
  const navigateToHelp = () => router.push("/help" as never);
  const navigateToNotifications = () => router.push("/notifications" as never);

  const handleLogout = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        logout()
          .then(() => {
            navigateToWelcome();
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
            navigateToWelcome();
          } catch {
            toastService.showError("Failed to sign out. Please try again.");
          }
        },
      },
    ]);
  }, [logout, router]);

  const handleSecurity = useCallback(() => {
    navigateToSecurity();
  }, [router]);

  const handleHelp = useCallback(() => {
    navigateToHelp();
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
            {/* Initials avatar */}
            <View
              style={[
                styles.userAvatar,
                {
                  backgroundColor: colorWithAlpha(
                    uiTokens.colors.accent,
                    uiTokens.mode === "dark" ? 0.22 : 0.12
                  ),
                },
              ]}
            >
              {user?.full_name || user?.username ? (
                <Text style={[styles.userAvatarText, { color: uiTokens.colors.accent }]}>
                  {(user.full_name || user.username || "S")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w: string) => w[0]?.toUpperCase() ?? "")
                    .join("")}
                </Text>
              ) : (
                <Ionicons name="person" size={28} color={uiTokens.colors.accent} />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: uiTokens.colors.textPrimary }]}>
                {user?.full_name || user?.username || "Staff"}
              </Text>
              <Text style={[styles.userRole, { color: uiTokens.colors.textSecondary }]}>
                {user?.username ? `@${user.username}` : "Staff Member"}
              </Text>
              {user?.employee_id ? (
                <Text style={[styles.userEmpId, { color: uiTokens.colors.textMuted }]}>
                  ID: {user.employee_id}
                </Text>
              ) : null}
            </View>
            {/* Role badge */}
            <View style={[styles.roleBadge, { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1), borderColor: colorWithAlpha(uiTokens.colors.accent, 0.25) }]}>
              <Text style={[styles.roleBadgeText, { color: uiTokens.colors.accent }]}>Staff</Text>
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
              onPress={navigateToNotifications}
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
  container:     { flex: 1 },
  scrollView:    { flex: 1 },
  scrollContent: { paddingHorizontal: gap.lg, paddingBottom: gap["2xl"] },

  // User card
  userCard:       { flexDirection: "row", alignItems: "center", padding: gap.lg, marginTop: gap.md },
  userAvatar:     { width: 56, height: 56, borderRadius: radius.full, justifyContent: "center", alignItems: "center" },
  userAvatarText: { fontSize: font.size.display, fontWeight: font.weight.extrabold, letterSpacing: font.tracking.tight },
  userInfo:       { marginLeft: gap.md, flex: 1 },
  userName:       { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  userRole:       { fontSize: font.size.base, marginTop: 2 },
  userEmpId:      { fontSize: font.size.caption, marginTop: 2, fontVariant: ["tabular-nums"] },

  // Role badge
  roleBadge:     { paddingHorizontal: gap.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1 },
  roleBadgeText: {
    fontSize: font.size.label, fontWeight: font.weight.bold,
    textTransform: "uppercase", letterSpacing: font.tracking.wide,
  },

  settingsCard:     { padding: 0, overflow: "hidden" },
  versionContainer: { alignItems: "center", marginTop: gap.xl, paddingBottom: gap.lg },
  versionText:      { fontSize: font.size.base, fontWeight: font.weight.medium },
  versionSubtext:   { fontSize: font.size.caption, marginTop: gap.xs },
});
