import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import { BrandLogo } from "../components/branding/BrandLogo";

interface BootLoadingViewProps {
  initError: string | null;
  progress?: number;
  statusMessage?: string;
  isRetrying?: boolean;
  onRetry?: () => void;
}

const liveRegionProps = {
  accessibilityLiveRegion: "polite" as const,
  "aria-live": "polite" as const,
  "aria-atomic": true,
};

const normalizeProgress = (progress: number | undefined): number =>
  Math.max(0, Math.min(100, Math.round(progress ?? 8)));

export const getBootFriendlyError = (initError: string): string => {
  const lower = initError.toLowerCase();

  if (lower.includes("network") || lower.includes("connection")) {
    return "Connection timed out. Check your network and retry startup.";
  }

  if (lower.includes("auth") || lower.includes("session")) {
    return "Session recovery failed. Retry startup, then sign in again if needed.";
  }

  if (lower.includes("timeout")) {
    return "Startup is taking longer than expected. Retry to restore your session and settings.";
  }

  return "Startup could not finish cleanly. Retry to restore your session and settings.";
};

export function BootLoadingView({
  initError,
  progress,
  statusMessage = "Initializing secure session",
  isRetrying = false,
  onRetry,
}: BootLoadingViewProps) {
  const progressValue = normalizeProgress(progress);
  const friendlyError = initError ? getBootFriendlyError(initError) : null;
  const t = useUiTokens();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: t.colors.background,
          padding: gap["2xl"],
        },
        indicator: {
          marginBottom: gap["2xl"],
        },
        title: {
          color: t.colors.textPrimary,
          fontSize: font.size.lg,
          fontWeight: font.weight.bold,
          letterSpacing: 0,
          marginTop: gap.lg,
        },
        progressBlock: {
          width: "100%",
          maxWidth: 320,
          marginTop: gap.sm,
          alignItems: "center",
        },
        statusText: {
          color: t.colors.textSecondary,
          fontSize: font.size.sm,
          letterSpacing: 0,
          marginBottom: gap.sm,
          textAlign: "center",
        },
        progressTrack: {
          width: "100%",
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          backgroundColor: t.colors.border,
        },
        progressFill: {
          height: "100%",
          minWidth: 8,
          borderRadius: 3,
          backgroundColor: t.colors.accent,
        },
        errorPanel: {
          marginTop: gap.lg,
          padding: gap.md,
          backgroundColor: colorWithAlpha(t.colors.error, 0.1),
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colorWithAlpha(t.colors.error, 0.2),
          maxWidth: 340,
          alignItems: "center",
        },
        errorTitle: {
          color: t.colors.error,
          fontSize: font.size.base,
          lineHeight: font.leading.normal,
          fontWeight: font.weight.bold,
          textAlign: "center",
          marginBottom: gap.xs,
        },
        errorText: {
          color: t.colors.error,
          fontSize: font.size.sm,
          lineHeight: font.leading.normal,
          textAlign: "center",
        },
        retryButton: {
          minHeight: 44,
          minWidth: 140,
          marginTop: gap.sm,
          paddingHorizontal: gap.md,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.colors.accent,
        },
        retryButtonDisabled: {
          opacity: 0.68,
        },
        retryButtonText: {
          color: t.colors.surface,
          fontSize: font.size.base,
          lineHeight: font.leading.normal,
          fontWeight: font.weight.bold,
        },
      }),
    [t]
  );

  return (
    <View style={styles.container}>
      <ActivityIndicator color={t.colors.accent} style={styles.indicator} size="large" />
      <BrandLogo variant="wordmark" maxWidth={220} maxHeight={90} />
      <Text style={styles.title}>
        {Platform.OS === "web" ? "Lavanya Mart Admin" : "Lavanya Mart"}
      </Text>
      <View style={styles.progressBlock} {...liveRegionProps}>
        <Text style={styles.statusText}>{statusMessage}</Text>
        <View
          accessibilityLabel={`Startup progress ${progressValue} percent`}
          accessibilityRole="progressbar"
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${progressValue}%` }]} />
        </View>
      </View>
      {friendlyError && (
        <View accessibilityRole="alert" style={styles.errorPanel} {...liveRegionProps}>
          <Text style={styles.errorTitle}>Startup needs attention</Text>
          <Text style={styles.errorText}>{friendlyError}</Text>
          {onRetry ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry app startup"
              activeOpacity={0.86}
              disabled={isRetrying}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={onRetry}
              style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
            >
              <Text style={styles.retryButtonText}>
                {isRetrying ? "Retrying..." : "Retry startup"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

interface BootErrorViewProps {
  initError: string;
}

export function BootErrorView({ initError }: BootErrorViewProps) {
  const friendlyError = getBootFriendlyError(initError);
  const t = useUiTokens();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: t.colors.background,
          padding: gap["2xl"],
        },
        errorLogo: {
          marginBottom: gap["2xl"],
        },
        errorIcon: {
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colorWithAlpha(t.colors.error, 0.1),
          justifyContent: "center",
          alignItems: "center",
          marginBottom: gap["2xl"],
        },
        errorIconText: {
          color: t.colors.error,
          fontSize: font.size.display,
          fontWeight: font.weight.extrabold,
        },
        errorHeading: {
          color: t.colors.error,
          fontSize: font.size.xl,
          fontWeight: font.weight.bold,
          marginBottom: gap.sm,
        },
        errorBody: {
          color: t.colors.textSecondary,
          fontSize: font.size.base,
          marginBottom: gap["2xl"],
          textAlign: "center",
          maxWidth: 400,
          lineHeight: font.leading.normal,
        },
        continuePill: {
          backgroundColor: colorWithAlpha(t.colors.accent, 0.1),
          paddingHorizontal: gap["2xl"],
          paddingVertical: gap.sm,
          borderRadius: radius.md,
        },
        continuePillText: {
          color: t.colors.accent,
          fontSize: font.size.base,
          fontWeight: font.weight.semibold,
        },
      }),
    [t]
  );

  return (
    <View style={styles.container}>
      <BrandLogo variant="symbol" width={72} height={72} containerStyle={styles.errorLogo} />
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>
      <Text style={styles.errorHeading}>Initialization issue</Text>
      <Text style={styles.errorBody}>{friendlyError}</Text>
      <View style={styles.continuePill}>
        <Text style={styles.continuePillText}>Attempting limited recovery</Text>
      </View>
    </View>
  );
}
