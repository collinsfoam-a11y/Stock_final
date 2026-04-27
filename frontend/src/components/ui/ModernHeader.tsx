import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useThemeContext } from "../../context/ThemeContext";
import { BrandLogo } from "../branding/BrandLogo";
import { ScreenHeader } from "./ScreenHeader";

interface ModernHeaderProps {
  title?: string;
  showLogo?: boolean;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightComponent?: React.ReactNode;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  showSettingsButton?: boolean;
  subtitle?: string;
  style?: ViewStyle;
}

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
  const { theme, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();
  const badgeShadow = isDark
    ? "0px 6px 14px rgba(0, 0, 0, 0.28)"
    : "0px 6px 14px rgba(15, 23, 42, 0.12)";

  const shouldUseBrandedHeader = showLogo && !showBackButton && !rightComponent && !rightAction;

  if (!shouldUseBrandedHeader) {
    return (
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        showBackButton={showBackButton}
        onBackPress={onBackPress}
        showLogoutButton={false}
        showUsername={!title && !showBackButton}
        showSettingsButton={showSettingsButton && !showBackButton && !rightComponent}
        rightAction={rightAction}
        customRightContent={rightComponent}
        style={style}
      />
    );
  }

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.colors.background.default,
          borderBottomColor: theme.colors.border.light,
          paddingTop: insets.top + 8,
        },
        style,
      ]}
    >
      <View style={styles.brandRow}>
        <View
          style={[
            styles.logoBadge,
            {
              backgroundColor: theme.colors.background.paper,
              borderColor: theme.colors.border.light,
              boxShadow: badgeShadow,
            },
          ]}
        >
          <View style={[styles.logoAccent, { backgroundColor: `${theme.colors.accent}18` }]}>
            <BrandLogo variant="symbol" width={28} height={28} />
          </View>
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandTitle, { color: theme.colors.text.primary }]}>
            {title || "Lavanya Mart"}
          </Text>
          {subtitle ? (
            <Text style={[styles.brandSubtitle, { color: theme.colors.text.secondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  logoAccent: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
});

export default ModernHeader;
