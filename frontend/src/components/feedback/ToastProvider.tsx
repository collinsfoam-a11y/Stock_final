import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toast } from "./Toast";
import { ToastData, toastService } from "../../services/toastService";
import { useUiTokens } from "../../hooks/useUiTokens";
import { zIndex } from "../../theme";

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const tokens = useUiTokens();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const handleShow = (toast: ToastData) => {
      setToasts((prev) => [...prev, toast]);
    };

    const handleHide = (data: ToastData) => {
      if (data.id) {
        setToasts((prev) => prev.filter((t) => t.id !== data.id));
      }
    };

    const handleClear = () => {
      setToasts([]);
    };

    toastService.on("show", handleShow);
    toastService.on("hide", handleHide);
    toastService.on("clear", handleClear);

    return () => {
      toastService.off("show", handleShow);
      toastService.off("hide", handleHide);
      toastService.off("clear", handleClear);
    };
  }, []);

  return (
    <>
      {children}
      <View
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + tokens.spacing.sm, tokens.spacing.lg),
            paddingHorizontal: tokens.spacing.md,
            pointerEvents: "box-none",
          },
        ]}
      >
        <View
          style={[
            styles.toastStack,
            { gap: tokens.spacing.sm, pointerEvents: "box-none" },
          ]}
        >
          {toasts.slice(-3).map((toast) => (
            <View key={toast.id} style={styles.toastWrapper}>
              <Toast
                visible={true}
                message={toast.message}
                type={toast.type as "success" | "error" | "info" | "warning"}
                onHide={() => toast.id && toastService.hide(toast.id)}
              />
            </View>
          ))}
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: zIndex.toast,
    alignItems: "center",
  },
  toastStack: {
    width: "100%",
    maxWidth: 520,
  },
  toastWrapper: {
    width: "100%",
  },
});
export const useToast = () => {
  return React.useMemo(
    () => ({
      show: (
        message: string,
        type: "success" | "error" | "info" | "warning" = "info",
        duration?: number
      ) => {
        const durationOption: "short" | "long" | undefined = duration
          ? duration > 3000
            ? "long"
            : "short"
          : undefined;
        toastService.show(message, { type, duration: durationOption });
      },
      hide: (id: string) => {
        toastService.hide(id);
      },
      clear: () => {
        toastService.clear();
      },
    }),
    []
  );
};
