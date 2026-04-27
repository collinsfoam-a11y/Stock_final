import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ToastData, toastService } from "../../services/toastService";

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const handleShow = (toast: ToastData) => {
      setToasts((prev) => [...prev, toast]);
    };

    const handleHide = (data: ToastData) => {
      if (data.id) {
        setToasts((prev) => prev.filter((toast) => toast.id !== data.id));
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
      <View style={[styles.container, styles.pointerEventsBoxNone]}>
        {toasts.slice(-3).map((toast) => (
          <View
            key={toast.id}
            style={[
              styles.toast,
              {
                borderLeftColor: getToastColor(toast.type),
                backgroundColor: `${getToastColor(toast.type)}14`,
              },
            ]}
          >
            <Text
              style={[
                styles.message,
                { color: getToastColor(toast.type) },
              ]}
            >
              {toast.message}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
};

const getToastColor = (type: ToastData["type"]) => {
  switch (type) {
    case "success":
      return "#15803d";
    case "error":
      return "#b91c1c";
    case "warning":
      return "#b45309";
    default:
      return "#0369a1";
  }
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 24,
    right: 24,
    width: 320,
    gap: 12,
    zIndex: 9999,
  },
  pointerEventsBoxNone: {
    pointerEvents: "box-none",
  },
  toast: {
    borderLeftWidth: 4,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    boxShadow: "0px 12px 32px rgba(15, 23, 42, 0.12)",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});

export const useToast = () => {
  return useMemo(
    () => ({
      show: (
        message: string,
        type: "success" | "error" | "info" | "warning" = "info",
        duration?: number,
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
    [],
  );
};
