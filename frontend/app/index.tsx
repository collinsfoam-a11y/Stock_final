import React, { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Text,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "../src/store/authStore";
import { AuroraBackground } from "../src/components/ui/AuroraBackground";
import { GlassCard } from "../src/components/ui/GlassCard";
import { BrandLogo } from "../src/components/branding/BrandLogo";
import { useThemeContext } from "../src/context/ThemeContext";
import type { AppTheme } from "../src/theme/themes";
import { getRouteForRole, UserRole } from "../src/utils/roleNavigation";

// Safe wrapper for Animated.View to prevent web crashes
const SafeAnimatedView = ({ children, style, entering, ...props }: any) => {
  if (Platform.OS === "web") {
    return (
      <View style={style} {...props}>
        {children}
      </View>
    );
  }
  return (
    <Animated.View style={style} entering={entering} {...props}>
      {children}
    </Animated.View>
  );
};

export default function Index() {
  const router = useRouter();
  const { user, isLoading, isInitialized } = useAuthStore();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    console.log("📱 [Index] Component mounted");
    if (isLoading || !isInitialized) return;

    // Explicitly navigate away from the splash once auth check finishes
    if (user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
    } else {
      router.replace("/welcome");
    }
  }, [isLoading, isInitialized, router, user]);

  const content = (
    <View style={styles.container}>
      <SafeAnimatedView
        entering={
          Platform.OS === "web" ? undefined : FadeInDown.delay(300).springify()
        }
        style={styles.contentContainer}
      >
        <GlassCard variant="strong" elevation="lg" style={styles.card}>
          <View style={styles.logoContainer}>
            <BrandLogo variant="wordmarkTagline" maxWidth={250} maxHeight={110} />
            <Text style={styles.title}>Lavanya Mart</Text>
            <Text style={styles.subtitle}>Stock Verification System</Text>
          </View>

          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accentLight} />
            <Text style={styles.loadingText}>
              Initializing Secure Environment...
            </Text>
          </View>
        </GlassCard>
      </SafeAnimatedView>

      <SafeAnimatedView
        entering={
          Platform.OS === "web"
            ? undefined
            : FadeInDown.delay(600).duration(1000)
        }
      >
        <Text style={styles.versionText}>v2.0.0 • Aurora Engine</Text>
      </SafeAnimatedView>
    </View>
  );

  if (Platform.OS === "web") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background.default,
        }}
      >
        <StatusBar style="light" />
        {content}
      </View>
    );
  }

  return (
    <AuroraBackground variant="primary" intensity="high" animated>
      <StatusBar style="light" />
      {content}
    </AuroraBackground>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.xl,
    },
    contentContainer: {
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    card: {
      width: "100%",
      alignItems: "center",
      paddingVertical: theme.spacing.xl,
    },
    logoContainer: {
      alignItems: "center",
      marginBottom: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: "600",
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: theme.spacing.xs,
      letterSpacing: -0.25,
    },
    subtitle: {
      fontSize: 16,
      fontWeight: "400",
      color: theme.colors.text.secondary,
      textAlign: "center",
      letterSpacing: 0.5,
    },
    loadingContainer: {
      alignItems: "center",
      gap: theme.spacing.md,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: "400",
      color: theme.colors.text.muted,
    },
    versionText: {
      position: "absolute",
      bottom: 50,
      fontSize: 12,
      fontWeight: "500",
      color: "rgba(255,255,255,0.3)",
    },
  });
