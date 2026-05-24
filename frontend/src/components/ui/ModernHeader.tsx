/**
 * Modern Header Component for Lavanya Mart Stock Verify
 * Clean header with branding and navigation
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "expo-router";

import { spacing, typography } from "@/theme/legacyCompat";
import { BrandLogo } from "../branding/BrandLogo";

import { semanticColors } from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
import { safeBackNavigation } from "@/utils/navigation";
import type { UserRole } from "@/utils/roleNavigation";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";
interface ModernHeaderProps {
  title?: string;
  showLogo?: boolean;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightComponent?: React.ReactNode;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    label?: string;
  };
  showSettingsButton?: boolean;
  subtitle?: string;
  style?: ViewStyle;
}

const LogoWithBorder = ({ size = 40, surfaceColor }: { size?: number; surfaceColor: string }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: surfaceColor,
      borderWidth: 1,
      borderColor: "rgba(101, 119, 137, 0.22)",
    }}
  >
    <BrandLogo variant="symbol" width={size * 0.62} height={size * 0.62} />
  </View>
);

export const ModernHeader: React.FC<ModernHeaderProps> = ({
  title,
  showLogo = false,
  showBackButton = false,
  onBackPress,
  rightComponent,
  rightAction,
  showSettingsButton = true,
  subtitle,
  style,
}) => {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const uiTokens = useUiTokens();
  const iconColor = uiTokens.colors.textSecondary;
  const decorativeIconProps = getDecorativeIconProps();

  const shouldShowSettings =
    !!user && showSettingsButton && rightAction?.icon !== "settings-outline";

  const handleBackPress = () => {
    void haptics.light();
    if (onBackPress) {
      onBackPress();
      return;
    }

    safeBackNavigation(router, { userRole: user?.role as UserRole | null });
  };

  const onPressSettings = () => {
    void haptics.light();
    const role = user?.role;
    const target =
      role === "admin" || role === "supervisor" || role === "staff"
        ? `/${role}/settings`
        : "/staff/settings";
    router.push(target as any);
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: uiTokens.colors.surface,
        },
        flags.uiVisualSystemV2 ? getTokenShadowStyle(uiTokens, "sm") : null,
        style,
      ]}
    >
      <StatusBar
        barStyle={uiTokens.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={uiTokens.colors.surface}
        translucent={false}
      />

      <View
        style={[
          styles.header,
          {
            backgroundColor: uiTokens.colors.surface,
            borderBottomColor: uiTokens.colors.border,
          },
        ]}
      >
        {/* Left Section */}
        <View style={styles.leftSection}>
          {showBackButton ? (
            <TouchableOpacity
              onPress={handleBackPress}
              style={styles.backButton}
              {...getAccessibleButtonProps({
                label: "Go back",
                hint: "Returns to the previous operational screen.",
              })}
            >
              <Ionicons
                {...decorativeIconProps}
                name="arrow-back"
                size={24}
                color={iconColor}
              />
            </TouchableOpacity>
          ) : !showLogo ? (
            <View style={styles.logoContainer}>
              <LogoWithBorder size={36} surfaceColor={uiTokens.colors.surface} />
            </View>
          ) : null}
        </View>

        {/* Center Section */}
        <View style={styles.centerSection}>
          {showLogo ? (
            <View style={styles.logoContainer}>
              <LogoWithBorder size={48} surfaceColor={uiTokens.colors.surface} />
              {subtitle && (
                <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
                  {subtitle}
                </Text>
              )}
            </View>
          ) : title ? (
            <View style={styles.titleContainer}>
              <Text
                style={[styles.title, { color: uiTokens.colors.textPrimary }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {subtitle && (
                <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
                  {subtitle}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.titleContainer}>
              <Text style={[styles.brandName, { color: uiTokens.colors.accent }]}>
                Lavanya Mart
              </Text>
              {user?.full_name && (
                <Text
                  style={[styles.userName, { color: uiTokens.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {user.full_name}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {rightComponent}
          {shouldShowSettings && (
            <TouchableOpacity
              onPress={onPressSettings}
              style={styles.backButton}
              {...getAccessibleButtonProps({
                label: "Open settings",
                hint: "Opens settings for the current role.",
              })}
            >
              <Ionicons
                {...decorativeIconProps}
                name="settings-outline"
                size={24}
                color={iconColor}
              />
            </TouchableOpacity>
          )}
          {rightAction && (
            <TouchableOpacity
              onPress={() => {
                void haptics.light();
                rightAction.onPress();
              }}
              style={styles.backButton}
              {...getAccessibleButtonProps({
                label: rightAction.label ?? "Header action",
              })}
            >
              <Ionicons
                {...decorativeIconProps}
                name={rightAction.icon}
                size={24}
                color={iconColor}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: semanticColors.background.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.border.default,
  },
  leftSection: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  centerSection: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rightSection: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 32,
    width: 32,
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: semanticColors.text.primary,
    textAlign: "center",
  },
  brandName: {
    fontSize: typography.fontSize.base,
    fontWeight: "800",
    color: semanticColors.interactive.default,
    textAlign: "center",
    letterSpacing: 0,
  },
  userName: {
    fontSize: typography.fontSize.xs,
    color: semanticColors.text.secondary,
    marginTop: 2,
    textAlign: "center",
    fontWeight: "500",
  },
  subtitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    color: semanticColors.text.secondary,
    marginTop: 2,
    textAlign: "center",
  },
});

export default ModernHeader;
