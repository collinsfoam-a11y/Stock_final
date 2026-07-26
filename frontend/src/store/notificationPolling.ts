import { AppStateStatus } from "react-native";

export const shouldPollNotifications = (
  appState: AppStateStatus,
  platform: string,
  visibilityState?: string,
): boolean => {
  if (appState !== "active") {
    return false;
  }

  if (platform !== "web") {
    return true;
  }

  return visibilityState !== "hidden";
};
