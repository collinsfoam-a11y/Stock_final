import { useEffect } from "react";
import { activateKeepAwake, deactivateKeepAwake } from "expo-keep-awake";

export const useKeepAwake = (enabled: boolean = true) => {
  useEffect(() => {
    if (enabled) {
      try {
        activateKeepAwake();
      } catch (error) {
        __DEV__ && console.warn("Failed to activate keep awake:", error);
        // Don't crash the app for this non-critical feature
      }

      return () => {
        try {
          deactivateKeepAwake();
        } catch (error) {
          __DEV__ && console.warn("Failed to deactivate keep awake:", error);
        }
      };
    }
    return undefined;
  }, [enabled]);
};
