/**
 * Settings Screen - App settings and preferences
 * Refactored to use Aurora Design System
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppearanceSettings } from "../../src/components/ui/AppearanceSettings";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSettingsStore } from "../../src/store/settingsStore";
import {
  ScreenContainer,
  GlassCard,
  AnimatedPressable,
} from "../../src/components/ui";
import { theme } from "../../src/styles/modernDesignSystem";
import {
  ChangePasswordModal,
  SettingsSyncStatus,
  UserSettingsSections,
} from "../../src/components/settings";

export default function SettingsScreen() {
  const router = useRouter();
  const { resetSettings } = useSettingsStore();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const handleReset = () => {
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Reset Settings",
      "Are you sure you want to reset all settings to default?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetSettings();
            Alert.alert("Success", "Settings reset to default");
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer>
      <StatusBar style="light" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={theme.colors.text.primary}
              />
            </AnimatedPressable>
            <View>
              <Text style={styles.pageTitle}>Settings</Text>
              <Text style={styles.pageSubtitle}>
                Preferences & Configuration
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Appearance Settings */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <AppearanceSettings
              showTitle={false}
              scrollable={false}
              compact={true}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <SettingsSyncStatus />
        </Animated.View>

        {/* User Preferences */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Text style={styles.sectionTitle}>Personal Preferences</Text>
          <UserSettingsSections />
        </Animated.View>

        {/* Security Settings */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Text style={styles.sectionTitle}>Security</Text>
          <GlassCard intensity={15} padding={0} style={styles.card}>
            <AnimatedPressable
              style={styles.settingRow}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.push("/security" as any);
              }}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={theme.colors.text.primary}
                  />
                </View>
                <Text style={styles.settingLabel}>Security & PIN</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.colors.text.tertiary}
              />
            </AnimatedPressable>

            <View style={styles.divider} />

            <AnimatedPressable
              style={styles.settingRow}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setShowChangePasswordModal(true);
              }}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={theme.colors.text.primary}
                  />
                </View>
                <Text style={styles.settingLabel}>Change Password</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.colors.text.tertiary}
              />
            </AnimatedPressable>
          </GlassCard>
        </Animated.View>

        {/* Navigation Actions */}
        <Animated.View entering={FadeInDown.delay(500).springify()}>
          <Text style={styles.sectionTitle}>Management</Text>
          <GlassCard intensity={15} padding={0} style={styles.card}>
            <AnimatedPressable
              style={styles.settingRow}
              onPress={() => router.push("/supervisor/sync-conflicts" as any)}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="sync-outline"
                    size={18}
                    color={theme.colors.text.primary}
                  />
                </View>
                <Text style={styles.settingLabel}>Sync Conflict Review</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.colors.text.tertiary}
              />
            </AnimatedPressable>

            <View style={styles.divider} />

            <AnimatedPressable
              style={styles.settingRow}
              onPress={() => router.push("/help" as any)}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="help-circle-outline"
                    size={18}
                    color={theme.colors.text.primary}
                  />
                </View>
                <Text style={styles.settingLabel}>Help & Support</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.colors.text.tertiary}
              />
            </AnimatedPressable>
          </GlassCard>
        </Animated.View>

        {/* Reset Button */}
        <Animated.View
          entering={FadeInDown.delay(550).springify()}
          style={styles.resetContainer}
        >
          <AnimatedPressable style={styles.resetButton} onPress={handleReset}>
            <Ionicons
              name="refresh"
              size={18}
              color={theme.colors.error.main}
            />
            <Text style={styles.resetText}>Reset to Defaults</Text>
          </AnimatedPressable>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <ChangePasswordModal
        visible={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onSuccess={() => {
          setShowChangePasswordModal(false);
          if (Platform.OS !== "web")
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Success", "Your password has been changed successfully");
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xl,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pageTitle: {
    fontSize: 32,
    color: theme.colors.text.primary,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  sectionTitle: {
    fontSize: 16,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
    marginTop: theme.spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    minHeight: 56,
  },
  disabledRow: {
    opacity: 0.5,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  selectValue: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  valueText: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginLeft: 56, // Align with text start
  },
  resetContainer: {
    marginTop: theme.spacing.xl,
    alignItems: "center",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "rgba(239, 68, 68, 0.1)", // Error color with low opacity
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  resetText: {
    color: theme.colors.error.main,
    fontWeight: "600",
  },
});
