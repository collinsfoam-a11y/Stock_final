import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ToastData, toastService } from "../../services/toastService";
import { useUiTokens } from "../../hooks/useUiTokens";
import { getTokenShadowStyle } from "../../theme/themeTokens";
import { zIndex } from "../../theme";
import { font, gap, radius } from '@/theme/staffUiScale';

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
        <View style={[styles.toastStack, { gap: tokens.spacing.sm, pointerEvents: "box-none" }]}>
          {toasts.slice(-3).map((toast) => {
            const toastColor = getToastColor(toast.type, tokens);

            return (
              <View
                key={toast.id}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${toast.type} notification: ${toast.message}`}
                aria-live="polite"
                {...({ "aria-atomic": true } as const)}
                style={[
                  styles.toast,
                  {
                    backgroundColor: tokens.colors.surfaceElevated,
                    borderColor: tokens.colors.border,
                    borderLeftColor: toastColor,
                  },
                  getTokenShadowStyle(tokens, "md"),
                ]}
              >
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor: withAlpha(toastColor, tokens.mode === "dark" ? 0.18 : 0.1),
                    },
                  ]}
                >
                  <Ionicons name={getToastIcon(toast.type)} size={19} color={toastColor} />
                </View>
                <Text style={[styles.message, { color: tokens.colors.textPrimary }]}>
                  {toast.message}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </>
  );
};

const getToastColor = (type: ToastData["type"], tokens: ReturnType<typeof useUiTokens>) => {
  switch (type) {
    case "success":
      return tokens.colors.success;
    case "error":
      return tokens.colors.error;
    case "warning":
      return tokens.colors.warning;
    default:
      return tokens.colors.info;
  }
};

const getToastIcon = (type: ToastData["type"]) => {
  switch (type) {
    case "success":
      return "checkmark-circle";
    case "error":
      return "close-circle";
    case "warning":
      return "warning";
    default:
      return "information-circle";
  }
};

const withAlpha = (color: string, alpha: number): string => {
  const sanitized = color.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) {
    return color;
  }

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: zIndex.toast,
    alignItems: "center",
  },
  toastStack: {
    width: "100%",
    maxWidth: 520,
  },
  toast: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    paddingHorizontal: gap.md,
    paddingVertical: gap.md,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -1,
  },
  message: {
    flex: 1,
    marginLeft: 10,
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
