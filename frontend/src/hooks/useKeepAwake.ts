import { logger } from '@/services/logging';
import { useEffect } from "react";
import { activateKeepAwake, deactivateKeepAwake } from "expo-keep-awake";

export const useKeepAwake = (enabled: boolean = true) => {
  useEffect(() => {
    if (enabled) {
      try {
        activateKeepAwake();
        __DEV__ && logger.debug("Keep awake activated");
      } catch (error) {
        __DEV__ && logger.warn("Failed to activate keep awake:", error);
        // Don't crash the app for this non-critical feature
      }

      return () => {
        try {
          deactivateKeepAwake();
          __DEV__ && logger.debug("Keep awake deactivated");
        } catch (error) {
          __DEV__ && logger.warn("Failed to deactivate keep awake:", error);
        }
      };
    }
    return undefined;
  }, [enabled]);
};
