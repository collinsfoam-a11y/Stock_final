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

import { useAuthStore } from "@/store/authStore";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { useThemeContext } from "@/context/ThemeContext";
import type { AppTheme } from "@/theme/themes";
import { getRouteForRole, UserRole } from "@/utils/roleNavigation";

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

export function IndexScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (isLoading || !isInitialized) {
      return;
    }

    if (user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
      return;
    }

    router.replace("/welcome");
  }, [isInitialized, isLoading, router, user]);

  const content = (
    <View style={styles.container}>
      <SafeAnimatedView
        entering={FadeInDown.delay(300).springify()}
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

      <SafeAnimatedView entering={FadeInDown.delay(600).duration(1000)}>
        <Text style={styles.versionText}>v2.0.0 • Aurora Engine</Text>
      </SafeAnimatedView>
    </View>
  );

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
