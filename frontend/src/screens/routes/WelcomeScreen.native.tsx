import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { colors, spacing, radius, gradients, semanticColors } from "@/theme/legacyCompat";
import { useAuthStore } from "@/store/authStore";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";
import { BrandLogo } from "@/components/branding/BrandLogo";

import { getFlag } from "@/constants/flags";
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

const GlassSurface = ({
  children,
  style,
  intensity = 20,
  tint = "light",
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
  tint?: "light" | "dark" | "default";
}) => {
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
          },
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
};

const FeatureCard = ({
  icon,
  title,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  delay: number;
}) => (
  <SafeAnimatedView entering={FadeInDown.delay(delay).springify()} style={styles.featureWrapper}>
    <GlassSurface intensity={20} tint="light" style={styles.featureCard}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={24} color={colors.primary[400]} />
      </View>
      <Text style={styles.featureText}>{title}</Text>
    </GlassSurface>
  </SafeAnimatedView>
);

export function WelcomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= 1024;
  const logoCardWidth = Math.min(width - spacing.lg * 2, isDesktop ? 420 : 332);
  const logoCardHeight = Math.max(128, Math.round(logoCardWidth * 0.42));
  const publicRegistrationEnabled = getFlag("enablePublicRegistration");

  React.useEffect(() => {
    if (!isLoading && user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
    }
  }, [user, isLoading, router]);

  const handlePress = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[colors.neutral[950], colors.neutral[900], colors.neutral[950]]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.content,
          {
            maxWidth: isDesktop ? 600 : "100%",
            paddingTop: Platform.OS === "ios" ? insets.top + 20 : 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <SafeAnimatedView entering={FadeInUp.duration(1000).springify()} style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={gradients.primary}
              style={[
                styles.logoBackground,
                {
                  width: logoCardWidth,
                  height: logoCardHeight,
                  borderRadius: 32,
                },
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: semanticColors.background.primary,
                  borderRadius: 29,
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  height: "100%",
                }}
              >
                <BrandLogo
                  variant="wordmarkTagline"
                  maxWidth={logoCardWidth * 0.88}
                  maxHeight={logoCardHeight * 0.7}
                />
              </View>
            </LinearGradient>
            <View
              style={[
                styles.logoGlow,
                {
                  width: logoCardWidth,
                  height: logoCardHeight,
                  borderRadius: 32,
                },
              ]}
            />
          </View>

          <Text style={styles.title}>Stock Verification</Text>
          <Text style={styles.subtitle}>Lavanya Mart field operations</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v2.5 Enterprise</Text>
          </View>
        </SafeAnimatedView>

        <View style={styles.featuresContainer}>
          <FeatureCard icon="barcode-outline" title="Smart Scanning" delay={400} />
          <FeatureCard icon="sync-outline" title="Live Sync" delay={600} />
          <FeatureCard icon="shield-checkmark-outline" title="Verified" delay={800} />
        </View>

        <SafeAnimatedView entering={FadeInDown.delay(1000).springify()} style={styles.actions}>
          <TouchableOpacity
            onPress={() => handlePress("/login")}
            activeOpacity={0.9}
            style={styles.buttonShadow}
          >
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginButton}
            >
              <Text style={styles.loginButtonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color={semanticColors.text.inverse} />
            </LinearGradient>
          </TouchableOpacity>

          {publicRegistrationEnabled ? (
            <TouchableOpacity
              onPress={() => handlePress("/register")}
              activeOpacity={0.7}
              style={styles.registerButtonWrapper}
            >
              <GlassSurface intensity={10} tint="light" style={styles.registerButton}>
                <Text style={styles.registerButtonText}>Create Account</Text>
              </GlassSurface>
            </TouchableOpacity>
          ) : null}
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(1200)} style={styles.footer}>
          <Text style={styles.footerText}>Lavanya Mart 2026</Text>
          <Text style={styles.footerSubtext}>
            Modern inventory operations for structured floor counts
          </Text>
        </SafeAnimatedView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[950],
  },
  content: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: spacing.lg,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    gap: spacing.md,
  },
  logoContainer: {
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBackground: {
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logoGlow: {
    position: "absolute",
    backgroundColor: colors.primary[500],
    opacity: 0.15,
    transform: [{ scale: 1.08 }],
    zIndex: -1,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: semanticColors.text.inverse,
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 17,
    color: colors.neutral[400],
    fontWeight: "500",
  },
  versionBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  versionText: {
    color: colors.primary[300],
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  featuresContainer: {
    width: "100%",
    gap: spacing.md,
  },
  featureWrapper: {
    width: "100%",
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.md,
  },
  buttonShadow: {
    elevation: 12,
  },
  loginButton: {
    minHeight: 56,
    borderRadius: radius.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loginButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
  registerButtonWrapper: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  registerButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  registerButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  footerText: {
    color: colors.neutral[500],
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  footerSubtext: {
    color: colors.neutral[600],
    fontSize: 12,
  },
});
