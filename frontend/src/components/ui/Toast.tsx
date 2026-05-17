/**
 * Compatibility wrapper around the canonical feedback toast.
 *
 * New operational notification rendering should use:
 * - `components/feedback/ToastProvider`
 * - `services/toastService`
 */

import React, { useEffect } from "react";
import { Toast as FeedbackToast } from "../feedback/Toast";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "info",
  duration = 3000,
  onDismiss,
  action,
}) => {
  useEffect(() => {
    if (__DEV__ && action) {
      // Keep surface compatibility but discourage action usage on this legacy wrapper.
      console.warn(
        "[ui/Toast] action is not supported in the compatibility wrapper. Use feedback/ToastProvider patterns.",
      );
    }
  }, [action]);

  return (
    <FeedbackToast
      visible={true}
      message={message}
      type={type}
      duration={duration}
      onHide={onDismiss ?? (() => {})}
    />
  );
};
