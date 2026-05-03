import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ModernButton from "@/components/ui/ModernButton";
import { semanticColors, spacing } from "@/theme/unified";

const SURFACE_BG = "#f4f7f6";
const SURFACE_BORDER = "#d9e5e2";
const ACCENT = "#0f766e";

interface ItemSubmitBarProps {
  submitting: boolean;
  submitCountdown: number | null;
  onCancelSubmit: () => void;
  onSubmit: () => void;
}

export function ItemSubmitBar({
  submitting,
  submitCountdown,
  onCancelSubmit,
  onSubmit,
}: ItemSubmitBarProps) {
  const insets = useSafeAreaInsets();
  const isUndoState = submitCountdown !== null;

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm),
        },
        {
          backgroundColor: semanticColors.background.paper,
          borderTopColor: semanticColors.border.default,
        },
      ]}
    >
      <ModernButton
        testID="item-submit-btn"
        title={isUndoState ? `Undo (${submitCountdown}s)` : "Save & Next Scan"}
        onPress={isUndoState ? onCancelSubmit : onSubmit}
        loading={submitting}
        variant={isUndoState ? "danger" : "primary"}
        icon={isUndoState ? "close-circle" : "checkmark-circle"}
        fullWidth
        style={!isUndoState ? styles.primaryButton : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: SURFACE_BG,
    borderTopWidth: 1,
    borderTopColor: SURFACE_BORDER,
  },
  primaryButton: {
    backgroundColor: ACCENT,
  },
});
