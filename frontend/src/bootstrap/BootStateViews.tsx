import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { modernColors, modernTypography } from "@/theme/unified";
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

  return (
    <View style={styles.container}>
      <ActivityIndicator color={modernColors.primary[500]} style={styles.indicator} size="large" />
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

  return (
    <View style={[styles.container, styles.errorContainer]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: modernColors.background.primary,
    padding: 24,
  },
  indicator: {
    marginBottom: 24,
  },
  title: {
    color: modernColors.text.primary,
    fontSize: modernTypography.h3.fontSize,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 20,
  },
  progressBlock: {
    width: "100%",
    maxWidth: 320,
    marginTop: 12,
    alignItems: "center",
  },
  statusText: {
    color: modernColors.text.tertiary,
    fontSize: modernTypography.body.small.fontSize,
    letterSpacing: 0,
    marginBottom: 12,
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(148, 163, 184, 0.24)",
  },
  progressFill: {
    height: "100%",
    minWidth: 8,
    borderRadius: 3,
    backgroundColor: modernColors.primary[500],
  },
  errorPanel: {
    marginTop: 28,
    padding: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    maxWidth: 340,
    alignItems: "center",
  },
  errorTitle: {
    color: modernColors.error.main,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  errorText: {
    color: modernColors.error.main,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    minWidth: 140,
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: modernColors.primary[500],
  },
  retryButtonDisabled: {
    opacity: 0.68,
  },
  retryButtonText: {
    color: modernColors.text.inverse,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  errorContainer: {
    padding: 20,
  },
  errorLogo: {
    marginBottom: 20,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  errorIconText: {
    color: modernColors.error.main,
    fontSize: 36,
    fontWeight: "800",
  },
  errorHeading: {
    color: modernColors.error.main,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  errorBody: {
    color: modernColors.text.tertiary,
    fontSize: 14,
    marginBottom: 32,
    textAlign: "center",
    maxWidth: 400,
    lineHeight: 20,
  },
  continuePill: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  continuePillText: {
    color: modernColors.primary[500],
    fontSize: 14,
    fontWeight: "600",
  },
});
