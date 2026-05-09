import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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

const getBootFriendlyError = (initError: string): string => {
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
  statusMessage = "Restoring session and settings",
  isRetrying = false,
  onRetry,
}: BootLoadingViewProps) {
  const progressValue = normalizeProgress(progress);
  const friendlyError = initError ? getBootFriendlyError(initError) : null;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Lavanya Mart</Text>
        <Text style={styles.title}>Starting secure workspace</Text>
        <View style={styles.loadingRow} {...liveRegionProps}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={styles.loadingText}>{statusMessage}</Text>
        </View>
        <View
          accessibilityLabel={`Startup progress ${progressValue} percent`}
          accessibilityRole="progressbar"
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${progressValue}%` }]} />
        </View>
        {friendlyError ? (
          <View accessibilityRole="alert" style={styles.warningBox} {...liveRegionProps}>
            <Text style={styles.warningTitle}>Startup needs attention</Text>
            <Text style={styles.warning}>{friendlyError}</Text>
            {onRetry ? (
              <Pressable
                accessibilityLabel="Retry app startup"
                accessibilityRole="button"
                disabled={isRetrying}
                onPress={onRetry}
                style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
              >
                <Text style={styles.retryButtonText}>
                  {isRetrying ? "Retrying..." : "Retry startup"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

interface BootErrorViewProps {
  initError: string;
}

export function BootErrorView({ initError }: BootErrorViewProps) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Lavanya Mart</Text>
        <Text style={styles.errorTitle}>Initialization issue</Text>
        <Text style={styles.errorBody}>{getBootFriendlyError(initError)}</Text>
        <Text style={styles.errorHint}>The app will continue with limited recovery.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7f6",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d9e5e2",
    backgroundColor: "#ffffff",
    boxShadow: "0px 16px 40px rgba(15, 23, 42, 0.08)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#334155",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    marginTop: 16,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#d9e5e2",
  },
  progressFill: {
    height: "100%",
    minWidth: 8,
    borderRadius: 3,
    backgroundColor: "#0f766e",
  },
  warningBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
  },
  warningTitle: {
    marginBottom: 4,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: "#9a3412",
  },
  warning: {
    fontSize: 13,
    lineHeight: 20,
    color: "#b45309",
  },
  retryButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#0f766e",
  },
  retryButtonDisabled: {
    opacity: 0.68,
  },
  retryButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 14,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 18,
  },
  errorHint: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "600",
  },
});
