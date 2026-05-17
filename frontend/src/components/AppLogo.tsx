import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BrandLogo } from "./branding/BrandLogo";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

interface AppLogoProps {
  size?: "small" | "medium" | "large";
  showText?: boolean;
  variant?: "default" | "white" | "gradient";
}

export function AppLogo({ size = "medium", showText = true, variant = "default" }: AppLogoProps) {
  const uiTokens = useUiTokens();
  const sizes = {
    small: { text: 14, container: 32, logo: 28 },
    medium: { text: 16, container: 40, logo: 34 },
    large: { text: 20, container: 56, logo: 46 },
  };

  const currentSize = sizes[size];

  const textColors = {
    default: uiTokens.colors.textPrimary,
    white: uiTokens.colors.textPrimary,
    gradient: uiTokens.colors.textPrimary,
  };

  return (
    <View style={styles.container}>
      {/* Logo Icon */}
      <View
        style={[
          styles.iconContainer,
          {
            width: currentSize.container,
            height: currentSize.container,
            backgroundColor:
              variant === "gradient"
                ? "transparent"
                : colorWithAlpha(uiTokens.colors.textPrimary, 0.1),
            borderColor: colorWithAlpha(uiTokens.colors.textPrimary, 0.24),
            borderRadius: uiTokens.radius.md,
          },
        ]}
      >
        <BrandLogo variant="symbol" maxWidth={currentSize.logo} maxHeight={currentSize.logo} />
      </View>

      {/* Company Name */}
      {showText && (
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.companyName,
              {
                fontSize: currentSize.text + 2,
                color: textColors[variant],
              },
            ]}
          >
            Lavanya Mart
          </Text>
          <Text
            style={[
              styles.appName,
              {
                fontSize: currentSize.text - 2,
                color: textColors[variant],
                marginTop: uiTokens.spacing.xxs,
                opacity: 0.8,
              },
            ]}
          >
            Stock Verification
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  textContainer: {
    justifyContent: "center",
  },
  companyName: {
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  appName: {
    fontWeight: "500",
  },
});
