import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ModernButton from "@/components/ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";

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
  const uiTokens = useUiTokens();
  const isUndoState = submitCountdown !== null;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: uiTokens.spacing.md,
          paddingTop: uiTokens.spacing.md,
          borderTopWidth: 1,
          borderTopColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surface,
        },
      }),
    [uiTokens]
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(uiTokens.spacing.md, insets.bottom + uiTokens.spacing.sm),
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
