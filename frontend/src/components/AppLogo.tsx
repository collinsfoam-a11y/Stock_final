import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BrandLogo } from "./branding/BrandLogo";

interface AppLogoProps {
  size?: "small" | "medium" | "large";
  showText?: boolean;
  variant?: "default" | "white" | "gradient";
}

export function AppLogo({
  size = "medium",
  showText = true,
  variant = "default",
}: AppLogoProps) {
  const sizes = {
    small: { text: 14, container: 32, logo: 28 },
    medium: { text: 16, container: 40, logo: 34 },
    large: { text: 20, container: 56, logo: 46 },
  };

  const currentSize = sizes[size];

  const textColors = {
    default: "#fff",
    white: "#fff",
    gradient: "#fff",
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
              variant === "gradient" ? "transparent" : "rgba(255, 255, 255, 0.1)",
          },
        ]}
      >
        <BrandLogo
          variant="symbol"
          maxWidth={currentSize.logo}
          maxHeight={currentSize.logo}
        />
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.24)",
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
    marginTop: 2,
  },
});
