import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppTouchable } from "./AppTouchable";
import { useUiTokens } from "@/hooks/useUiTokens";
import { UniversalLogout } from "../auth/UniversalLogout";
import { spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from "@/theme/unified";

interface ModernHeaderWithLogoutProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  showLogo?: boolean;
  subtitle?: string;
  testID?: string;
}

export const ModernHeaderWithLogout: React.FC<ModernHeaderWithLogoutProps> = ({
  title,
  showBackButton = false,
  onBackPress,
  showLogo = false,
  subtitle,
  testID,
}) => {
  const t = useUiTokens();
  
  const handleLogout = UniversalLogout({
    redirectPath: "/welcome",
    showConfirmation: true,
  });

  return (
    <View
      style={[
        styles.header,
        { 
          backgroundColor: t.colors.surface,
          borderBottomColor: t.colors.border,
        },
      ]}
      testID={testID}
    >
      <View style={styles.leftSection}>
        {showBackButton ? (
          <AppTouchable
            onPress={onBackPress}
            style={[
              styles.navButton,
              { 
                backgroundColor: t.colors.surfaceElevated,
                borderColor: t.colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color={t.colors.textPrimary} />
          </AppTouchable>
        ) : showLogo ? (
          <View style={styles.logoPlaceholder}>
            <Ionicons name="barcode-outline" size={24} color={t.colors.accent} />
          </View>
        ) : null}
      </View>

      <View style={styles.centerSection}>
        <Text style={[styles.title, { color: t.colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: t.colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightSection}>
        <AppTouchable
          onPress={handleLogout}
          style={[
            styles.logoutButton,
            { 
              backgroundColor: `${t.colors.error}10`,
              borderColor: t.colors.error,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <Ionicons name="log-out-outline" size={20} color={t.colors.error} />
        </AppTouchable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: unifiedSpacing.md,
    paddingVertical: unifiedSpacing.sm,
    borderBottomWidth: 1,
  },
  leftSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  centerSection: {
    flex: 2,
    alignItems: "center",
  },
  rightSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: unifiedRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: unifiedRadius.md,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...textStyles.h6,
    fontWeight: "600",
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.caption,
    textAlign: "center",
    marginTop: 2,
  },
  logoutButton: {
    width: 36,
    height: 36,
    borderRadius: unifiedRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});