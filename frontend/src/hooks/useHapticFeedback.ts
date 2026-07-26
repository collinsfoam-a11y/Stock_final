import { useCallback } from "react";
import { haptics } from "../services/haptics";

export const useHapticFeedback = () => {
  const triggerHaptic = useCallback(
    (
      type:
        | "impactLight"
        | "impactMedium"
        | "impactHeavy"
        | "notificationSuccess"
        | "notificationWarning"
        | "notificationError",
    ) => {
      switch (type) {
        case "impactLight":
          void haptics.light();
          break;
        case "impactMedium":
          void haptics.medium();
          break;
        case "impactHeavy":
          void haptics.heavy();
          break;
        case "notificationSuccess":
          void haptics.success();
          break;
        case "notificationWarning":
          void haptics.warning();
          break;
        case "notificationError":
          void haptics.error();
          break;
      }
    },
    [],
  );

  return { triggerHaptic };
};
