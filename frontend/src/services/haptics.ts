import { Platform } from "react-native";

import { flags } from "../constants/flags";

export type HapticIntensity = "light" | "medium" | "heavy";
export type HapticNotification = "success" | "warning" | "error";

type ExpoHapticsModule = typeof import("expo-haptics");
type ImpactFeedbackStyle = import("expo-haptics").ImpactFeedbackStyle;
type NotificationFeedbackType = import("expo-haptics").NotificationFeedbackType;

let hapticsModulePromise: Promise<ExpoHapticsModule> | null = null;

const canHaptic = () => flags.enableHaptics && Platform.OS !== "web";

const loadHaptics = async (): Promise<ExpoHapticsModule | null> => {
  if (!canHaptic()) return null;

  try {
    hapticsModulePromise ??= import("expo-haptics");
    return await hapticsModulePromise;
  } catch {
    hapticsModulePromise = null;
    return null;
  }
};

const resolveImpactStyle = (
  Haptics: ExpoHapticsModule,
  intensity: HapticIntensity
): ImpactFeedbackStyle | undefined => {
  const styles = Haptics.ImpactFeedbackStyle;
  if (!styles) return undefined;

  if (intensity === "light") return styles.Light;
  if (intensity === "heavy") return styles.Heavy;
  return styles.Medium;
};

const resolveNotificationType = (
  Haptics: ExpoHapticsModule,
  type: HapticNotification
): NotificationFeedbackType | undefined => {
  const notificationTypes = Haptics.NotificationFeedbackType;
  if (!notificationTypes) return undefined;

  if (type === "success") return notificationTypes.Success;
  if (type === "warning") return notificationTypes.Warning;
  return notificationTypes.Error;
};

export const haptics = {
  isAvailable: () => canHaptic(),
  impact: async (intensity: HapticIntensity = "medium") => {
    const Haptics = await loadHaptics();
    if (!Haptics) return;

    try {
      await Haptics.impactAsync(resolveImpactStyle(Haptics, intensity));
    } catch {
      // ignore
    }
  },
  notification: async (type: HapticNotification) => {
    const Haptics = await loadHaptics();
    if (!Haptics) return;

    try {
      await Haptics.notificationAsync(resolveNotificationType(Haptics, type));
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
    const Haptics = await loadHaptics();
    if (!Haptics) return;

    try {
      await Haptics.selectionAsync();
    } catch {
      // ignore
    }
  },
};
