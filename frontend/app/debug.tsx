/**
 * Debug Screen - Lavanya eMart
 * Development verification page
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernCard from "@/components/ui/ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import {
  textStyles,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
} from "@/theme/legacyCompat";
import { type ThemeTokens } from "@/theme/themeTokens";
import { duration } from "@/theme/staffUiScale";

// ---------------------------------------------------------------------------
// Safe Animated View (web-compatible)
// ---------------------------------------------------------------------------

interface SafeAnimatedViewProps {
  children: React.ReactNode;
  style?: any;
  entering?: any;
  delay?: number;
}

const SafeAnimatedView: React.FC<SafeAnimatedViewProps> = ({
  children,
  style,
  entering,
  delay = 0,
}) => {
  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }
  const animationProps = entering
    ? { entering: entering.delay(delay).duration(duration.slowest).springify() }
    : {};
  return (
    <Animated.View style={style} {...animationProps}>
      {children}
    </Animated.View>
  );
};

export default function DebugPage() {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader
        title="Debug"
        subtitle="Development verification"
        showBackButton={false}
      />

      <View style={styles.content}>
        <SafeAnimatedView entering={FadeInDown}>
          <ModernCard padding={unifiedSpacing.xl} style={styles.card}>
            <Text style={styles.title}>Debug Page Works!</Text>
            <Text style={styles.subtitle}>
              Platform: {Platform.OS}
            </Text>
            <Text style={styles.body}>
              If you see this, React is rendering correctly.
            </Text>
          </ModernCard>
        </SafeAnimatedView>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: unifiedSpacing.lg,
    },
    card: {
      backgroundColor: tokens.colors.surfaceElevated,
      alignItems: "center",
      width: "100%",
      maxWidth: 400,
    },
    title: {
      ...textStyles.h3,
      color: tokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: unifiedSpacing.sm,
    },
    subtitle: {
      ...textStyles.body,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: unifiedSpacing.xs,
    },
    body: {
      ...textStyles.caption,
      color: tokens.colors.textMuted,
      textAlign: "center",
    },
  });
