/**
 * UpgradeNotification Component
 * Shows update available or force update banners.
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { VersionCheckResult } from "../services/versionService";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

interface UpgradeNotificationProps {
  /** Version check result */
  versionInfo: VersionCheckResult;
  /** Whether this is a forced upgrade (blocking) */
  forceUpdate?: boolean;
  /** Callback to dismiss the notification (for optional updates) */
  onDismiss?: () => void;
  /** Callback when user taps update button */
  onUpdate?: () => void;
  /** Custom app store URL */
  storeUrl?: string;
  /** Show as banner (inline) or modal (fullscreen blocking) */
  variant?: "banner" | "modal";
}

type UpgradeTone = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
};

export const UpgradeNotification: React.FC<UpgradeNotificationProps> = ({
  versionInfo,
  forceUpdate = false,
  onDismiss,
  onUpdate,
  storeUrl,
  variant = "banner",
}) => {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  const tone = getUpgradeTone({
    forceUpdate,
    updateType: versionInfo.update_type,
    uiTokens,
  });

  const handleUpdate = async () => {
    if (onUpdate) {
      await onUpdate();
      return;
    }

    if (storeUrl) {
      try {
        const canOpen = await Linking.canOpenURL(storeUrl);
        if (canOpen) {
          await Linking.openURL(storeUrl);
        } else {
          __DEV__ && console.log("Cannot open store URL:", storeUrl);
        }
      } catch (err) {
        __DEV__ && console.log("Failed to open store URL", err);
      }
    } else {
      __DEV__ && console.log("No store URL configured for update");
    }
  };

  const message = getUpdateMessage(versionInfo, forceUpdate);
  const currentVersion = versionInfo.client_version ?? "unknown";
  const latestVersion = versionInfo.current_version ?? "latest";

  if (variant === "modal") {
    return (
      <View style={styles.modalContainer}>
        <View
          style={[styles.modalContent, { borderColor: colorWithAlpha(tone.color, 0.24) }]}
          accessibilityRole="alert"
        >
          <View
            style={[
              styles.modalIconContainer,
              { backgroundColor: colorWithAlpha(tone.color, 0.12) },
            ]}
          >
            <Ionicons name={tone.icon} size={40} color={tone.color} />
          </View>

          <Text style={styles.modalTitle}>{tone.title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>

          <View style={styles.versionGrid}>
            <VersionRow label="Installed" value={currentVersion} styles={styles} />
            <VersionRow label="Available" value={latestVersion} styles={styles} />
          </View>

          <TouchableOpacity
            style={[
              styles.updateButton,
              { backgroundColor: forceUpdate ? tone.color : uiTokens.colors.accent },
            ]}
            onPress={handleUpdate}
            {...getAccessibleButtonProps({
              label: forceUpdate ? "Update now, required" : "Update now",
              hint: "Opens the configured app update destination",
            })}
          >
            <Ionicons name="download-outline" size={20} color={uiTokens.colors.surface} />
            <Text style={styles.updateButtonText}>Update Now</Text>
          </TouchableOpacity>

          {!forceUpdate && onDismiss && (
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              {...getAccessibleButtonProps({ label: "Remind me later" })}
            >
              <Text style={styles.dismissButtonText}>Remind Me Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bannerContainer,
        {
          backgroundColor: colorWithAlpha(tone.color, 0.1),
          borderColor: colorWithAlpha(tone.color, 0.24),
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.bannerContent}>
        <View
          style={[styles.bannerIconWrap, { backgroundColor: colorWithAlpha(tone.color, 0.12) }]}
        >
          <Ionicons name={tone.icon} size={20} color={tone.color} />
        </View>

        <View style={styles.bannerTextContainer}>
          <Text style={styles.bannerTitle}>{tone.title}</Text>
          <Text style={styles.bannerMessage} numberOfLines={2}>
            {message}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.bannerUpdateButton,
            { backgroundColor: forceUpdate ? tone.color : uiTokens.colors.accent },
          ]}
          onPress={handleUpdate}
          {...getAccessibleButtonProps({
            label: forceUpdate ? "Update now, required" : "Update app",
          })}
        >
          <Text style={styles.bannerUpdateButtonText}>Update</Text>
        </TouchableOpacity>

        {!forceUpdate && onDismiss && (
          <TouchableOpacity
            style={styles.bannerCloseButton}
            onPress={onDismiss}
            {...getAccessibleButtonProps({ label: "Dismiss update notice" })}
          >
            <Ionicons name="close" size={20} color={uiTokens.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

function getUpgradeTone({
  forceUpdate,
  updateType,
  uiTokens,
}: {
  forceUpdate: boolean;
  updateType?: string | null;
  uiTokens: ThemeTokens;
}): UpgradeTone {
  if (forceUpdate) {
    return {
      color: uiTokens.colors.error,
      icon: "warning-outline",
      title: "Update Required",
    };
  }

  if (updateType === "major") {
    return {
      color: uiTokens.colors.warning,
      icon: "alert-circle-outline",
      title: "Major Update Available",
    };
  }

  return {
    color: uiTokens.colors.info,
    icon: "arrow-up-circle-outline",
    title: "Update Available",
  };
}

function getUpdateMessage(versionInfo: VersionCheckResult, forceUpdate: boolean): string {
  const latestVersion = versionInfo.current_version ?? "the latest version";

  if (forceUpdate) {
    return `This app version is no longer supported. Update to ${latestVersion} to continue stock verification.`;
  }

  const updateTypeText: Record<string, string> = {
    major: "A larger app update",
    minor: "An app update",
    patch: "A maintenance update",
  };

  const updateType = versionInfo.update_type || "minor";
  const updateLabel = updateTypeText[updateType] || "An app update";

  return `${updateLabel} is available (${latestVersion}). Update when work is paused to get the latest fixes.`;
}

function VersionRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.versionInfo}>
      <Text style={styles.versionLabel}>{label}</Text>
      <Text style={styles.versionValue}>{value}</Text>
    </View>
  );
}

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
    modalContainer: {
      flex: 1,
      backgroundColor: uiTokens.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: uiTokens.spacing.lg,
    },
    modalContent: {
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderRadius: uiTokens.radius.lg,
      borderWidth: 1,
      padding: uiTokens.spacing.xl,
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
    },
    modalIconContainer: {
      width: 72,
      height: 72,
      borderRadius: uiTokens.radius.full,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: uiTokens.spacing.lg,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.sm,
      textAlign: "center",
    },
    modalMessage: {
      fontSize: 15,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: uiTokens.spacing.lg,
      lineHeight: 22,
    },
    versionGrid: {
      width: "100%",
      gap: uiTokens.spacing.sm,
      marginBottom: uiTokens.spacing.lg,
    },
    versionInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      borderRadius: uiTokens.radius.md,
      paddingHorizontal: uiTokens.spacing.md,
      paddingVertical: uiTokens.spacing.sm,
      backgroundColor: uiTokens.colors.surface,
    },
    versionLabel: {
      fontSize: 13,
      color: uiTokens.colors.textSecondary,
    },
    versionValue: {
      fontSize: 13,
      color: uiTokens.colors.textPrimary,
      fontWeight: "700",
    },
    updateButton: {
      ...getMinimumTouchTargetStyle(),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: uiTokens.spacing.sm,
      paddingVertical: uiTokens.spacing.md,
      paddingHorizontal: uiTokens.spacing.xl,
      borderRadius: uiTokens.radius.md,
      width: "100%",
    },
    updateButtonText: {
      color: uiTokens.colors.surface,
      fontSize: 15,
      fontWeight: "700",
    },
    dismissButton: {
      ...getMinimumTouchTargetStyle(),
      marginTop: uiTokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.md,
    },
    dismissButtonText: {
      color: uiTokens.colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },
    bannerContainer: {
      borderRadius: uiTokens.radius.md,
      borderWidth: 1,
      marginHorizontal: uiTokens.spacing.lg,
      marginVertical: uiTokens.spacing.sm,
      overflow: "hidden",
    },
    bannerContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.sm,
      padding: uiTokens.spacing.md,
    },
    bannerIconWrap: {
      width: 40,
      height: 40,
      borderRadius: uiTokens.radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    bannerTextContainer: {
      flex: 1,
    },
    bannerTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.xs,
    },
    bannerMessage: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
      lineHeight: 17,
    },
    bannerUpdateButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: uiTokens.spacing.md,
      borderRadius: uiTokens.radius.md,
    },
    bannerUpdateButtonText: {
      color: uiTokens.colors.surface,
      fontSize: 12,
      fontWeight: "700",
    },
    bannerCloseButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: uiTokens.radius.md,
    },
  });

export default UpgradeNotification;
