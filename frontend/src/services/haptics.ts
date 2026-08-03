import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { flags } from "../constants/flags";

export type HapticIntensity = "light" | "medium" | "heavy";
export type HapticNotification = "success" | "warning" | "error";

const canHaptic = () => flags.enableHaptics && Platform.OS !== "web";

const resolveImpactStyle = (
  intensity: HapticIntensity
): Haptics.ImpactFeedbackStyle | undefined => {
  const styles = Haptics.ImpactFeedbackStyle;
  if (!styles) return undefined;

  if (intensity === "light") return styles.Light;
  if (intensity === "heavy") return styles.Heavy;
  return styles.Medium;
};

const resolveNotificationType = (
  type: HapticNotification
): Haptics.NotificationFeedbackType | undefined => {
  const notificationTypes = Haptics.NotificationFeedbackType;
  if (!notificationTypes) return undefined;

  if (type === "success") return notificationTypes.Success;
  if (type === "warning") return notificationTypes.Warning;
  return notificationTypes.Error;
};

export const haptics = {
  isAvailable: () => canHaptic(),
  impact: async (intensity: HapticIntensity = "medium") => {
    if (!canHaptic()) return;
    try {
      await Haptics.impactAsync(resolveImpactStyle(intensity));
    } catch {
      // ignore
    }
  },
  notification: async (type: HapticNotification) => {
    if (!canHaptic()) return;
    try {
      await Haptics.notificationAsync(resolveNotificationType(type));
    } catch {
      // ignore
    }
  },
  success: async () => {
    await haptics.notification("success");
  },
  warning: async () => {
    await haptics.notification("warning");
  },
  error: async () => {
    await haptics.notification("error");
  },
  light: async () => {
    await haptics.impact("light");
  },
  medium: async () => {
    await haptics.impact("medium");
  },
  heavy: async () => {
    await haptics.impact("heavy");
  },
  selection: async () => {
    if (!canHaptic()) return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // ignore
    }
  },
};
