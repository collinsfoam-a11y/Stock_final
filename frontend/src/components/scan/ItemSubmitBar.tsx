import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ModernButton from "@/components/ui/ModernButton";
import { colors, semanticColors, spacing } from "@/theme/unified";

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
        title={isUndoState ? `Undo (${submitCountdown}s)` : "Save & Verify"}
        onPress={isUndoState ? onCancelSubmit : onSubmit}
        loading={submitting}
        variant={isUndoState ? "danger" : "primary"}
        icon={isUndoState ? "close-circle" : "checkmark-circle"}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
});
