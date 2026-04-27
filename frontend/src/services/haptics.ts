import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { flags } from "../constants/flags";

export type HapticIntensity = "light" | "medium" | "heavy";
export type HapticNotification = "success" | "warning" | "error";

const impactStyles: Record<HapticIntensity, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

const notificationTypes: Record<
  HapticNotification,
  Haptics.NotificationFeedbackType
> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

const canHaptic = () => flags.enableHaptics && Platform.OS !== "web";

export const haptics = {
  isAvailable: () => canHaptic(),
  impact: async (intensity: HapticIntensity = "medium") => {
    if (!canHaptic()) return;
    try {
      await Haptics.impactAsync(impactStyles[intensity]);
    } catch {
      // ignore
    }
  },
  notification: async (type: HapticNotification) => {
    if (!canHaptic()) return;
    try {
      await Haptics.notificationAsync(notificationTypes[type]);
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
