/**
 * Staff Settings Screen - Modern Minimal Design
 * Essential settings for staff users with clean UI
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
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
  SettingsSyncStatus,
  UserSettingsSections,
} from "../../src/components/settings";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "../../src/theme/modernDesign";

// Reusable Setting Row Component
interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  type?: "switch" | "navigation" | "action";
  destructive?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  label,
  description,
  value,
  onValueChange,
  onPress,
  type = "switch",
  destructive = false,
}) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    onPress?.();
  }, [onPress]);

  const handleToggle = useCallback(
    (val: boolean) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onValueChange?.(val);
    },
    [onValueChange],
  );

  const renderRightContent = () => {
    if (type === "switch") {
      return (
        <Switch
          value={value}
          onValueChange={handleToggle}
          trackColor={{
            false: colors.gray[200],
            true: colors.primary[500],
          }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.gray[200]}
        />
      );
    }
    if (type === "navigation") {
      return (
        <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
      );
    }
    return null;
  };

  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={type !== "switch" ? handlePress : undefined}
      activeOpacity={type !== "switch" ? 0.7 : 1}
      disabled={type === "switch"}
    >
      <View style={styles.settingLeft}>
        <View
          style={[
            styles.iconContainer,
            destructive && styles.iconContainerDestructive,
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={destructive ? colors.error[500] : colors.primary[500]}
          />
        </View>
        <View style={styles.labelContainer}>
          <Text
            style={[
              styles.settingLabel,
              destructive && styles.labelDestructive,
            ]}
          >
            {label}
          </Text>
          {description && (
            <Text style={styles.settingDescription}>{description}</Text>
          )}
        </View>
      </View>
      {renderRightContent()}
    </TouchableOpacity>
  );
};

// Section Header Component
const SectionHeader: React.FC<{ title: string; delay?: number }> = ({
  title,
  delay = 0,
}) => (
  <Animated.View entering={FadeInDown.delay(delay).springify()}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </Animated.View>
);

export default function StaffSettingsScreen() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const { version, buildVersion } = useAppVersion();

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
            Alert.alert("Error", "Failed to sign out. Please try again.");
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
            Alert.alert("Error", "Failed to sign out. Please try again.");
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
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ModernHeader
        title="Settings"
        showBackButton
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info Card */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ModernCard style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={28} color={colors.primary[500]} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.username || "Staff"}</Text>
              <Text style={styles.userRole}>Staff Member</Text>
            </View>
          </ModernCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <SettingsSyncStatus />
        </Animated.View>

        {/* Security Settings */}
        <SectionHeader title="Security" delay={200} />
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <ModernCard style={styles.settingsCard}>
            <SettingRow
              icon="shield-checkmark-outline"
              label="Security & PIN"
              description="Manage your PIN and biometric login"
              type="navigation"
              onPress={handleSecurity}
            />
          </ModernCard>
        </Animated.View>

        {/* Appearance Settings */}
        <SectionHeader title="Appearance" delay={300} />
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <View style={styles.settingsCard}>
            <AppearanceSettings
              showTitle={false}
              scrollable={false}
              compact={true}
            />
          </View>
        </Animated.View>

        {/* User Preferences */}
        <SectionHeader title="Preferences" delay={400} />
        <Animated.View entering={FadeInDown.delay(450).springify()}>
          <UserSettingsSections />
        </Animated.View>

        {/* Support */}
        <SectionHeader title="Support" delay={500} />
        <Animated.View entering={FadeInDown.delay(550).springify()}>
          <ModernCard style={styles.settingsCard}>
            <SettingRow
              icon="notifications-outline"
              label="Notifications"
              description="Open recount and approval alerts"
              onPress={() => router.push("/notifications" as any)}
              type="navigation"
            />
            <View style={styles.divider} />
            <SettingRow
              icon="help-circle-outline"
              label="Help & Support"
              description="Get assistance"
              onPress={handleHelp}
              type="navigation"
            />
          </ModernCard>
        </Animated.View>

        {/* Account Actions */}
        <SectionHeader title="Account" delay={600} />
        <Animated.View entering={FadeInDown.delay(650).springify()}>
          <ModernCard style={styles.settingsCard}>
            <SettingRow
              icon="log-out-outline"
              label="Sign Out"
              description="Sign out of your account"
              onPress={handleLogout}
              type="action"
              destructive
            />
          </ModernCard>
        </Animated.View>

        {/* Version Info */}
        <Animated.View
          entering={FadeInDown.delay(700).springify()}
          style={styles.versionContainer}
        >
          <Text style={styles.versionText}>Stock Verify v{version}</Text>
          <Text style={styles.versionSubtext}>Build {buildVersion}</Text>
          <Text style={styles.versionSubtext}>© 2026 Lavanya Mart</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
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
    backgroundColor: colors.primary[50],
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
    color: colors.gray[900],
  },
  userRole: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  settingsCard: {
    padding: 0,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  iconContainerDestructive: {
    backgroundColor: colors.error[50],
  },
  labelContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[900],
  },
  labelDestructive: {
    color: colors.error[600],
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[100],
    marginLeft: 52,
  },
  versionContainer: {
    alignItems: "center",
    marginTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  versionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[500],
  },
  versionSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[400],
    marginTop: spacing.xs,
  },
});
