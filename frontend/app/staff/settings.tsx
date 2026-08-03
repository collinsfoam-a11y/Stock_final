/**
 * Staff Settings Screen - Modern Minimal Design
 * Essential settings for staff users with clean UI
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "../../src/store/authStore";
import { useAppVersion } from "../../src/hooks/useAppVersion";
import { ModernCard } from "../../src/components/ui/ModernCard";
import { ModernHeader } from "../../src/components/ui/ModernHeader";
import { UserEssentialsCard } from "../../src/components/ui/UserEssentialsCard";
import {
  SettingsActionRow,
  SettingsActionSection,
  SettingsSectionDivider,
  SettingsSectionHeading,
  SettingsSyncStatus,
  UserSettingsSections,
} from "../../src/components/settings";
import { useUniversalLogout } from "../../src/components/auth/UniversalLogout";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import { font, gap } from "@/theme/staffUiScale";

import { useUiTokens } from "@/hooks/useUiTokens";
import { getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
import { toastService } from "@/services/toastService";
import { safeBackNavigation } from "@/utils/navigation";

export default function StaffSettingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { version, buildVersion } = useAppVersion();
  const uiTokens = useUiTokens();

  const handleLogout = useUniversalLogout({
    redirectPath: "/welcome",
    showConfirmation: true,
    onLogoutSuccess: () => {
      router.replace("/welcome" as any);
    },
    onLogoutError: () => {
      toastService.showError("Failed to sign out. Please try again.");
    },
  });

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
            {user ? (
              <UserEssentialsCard
                user={{
                  username: user.username,
                  full_name: user.full_name,
                  role: user.role,
                  is_active: user.is_active,
                  id: user.id,
                  employee_id: user.employee_id,
                }}
                size="lg"
                style={styles.userCardInner}
                testID="user-essentials-card"
              />
            ) : (
              <UserEssentialsCard
                user={{
                  username: "Staff",
                  full_name: null,
                  role: "staff",
                  is_active: true,
                }}
                size="lg"
                style={styles.userCardInner}
                testID="user-essentials-card-placeholder"
              />
            )}
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
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: gap.lg, paddingBottom: gap["2xl"] },

  // User card
  userCard: { padding: gap.lg },
  userCardInner: { flexDirection: "row", alignItems: "center" },

  settingsCard: { padding: 0, overflow: "hidden" },
  versionContainer: { alignItems: "center", marginTop: gap.xl, paddingBottom: gap.lg },
  versionText: { fontSize: font.size.base, fontWeight: font.weight.medium },
  versionSubtext: { fontSize: font.size.caption, marginTop: gap.xs },
});
